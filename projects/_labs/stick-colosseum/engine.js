(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StickColosseumEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VIEW = { w: 480, h: 800 };
  var CENTER = { x: 240, y: 400 };
  var CHAR_R = 14;
  var MAX_PULL = 90;
  var PULL_POWER = 12;
  var FRICTION = 620;
  var STOP_SPEED = 18;
  var SHOT_LIMIT = 7;
  var WIN_SCORE = 3;
  var GUARD_SAVE = 1;

  var PRESETS = [
    { id: 'balanced', label: '2-2-1', name: 'バランス', spots: [[-70, 105], [70, 105], [-105, 140], [105, 140], [0, 170]] },
    { id: 'aggressive', label: '3-1-1', name: '攻撃', spots: [[-85, 100], [0, 112], [85, 100], [0, 148], [0, 172]] },
    { id: 'defensive', label: '1-2-2', name: '守備', spots: [[0, 100], [-75, 140], [75, 140], [-55, 170], [55, 170]] }
  ];

  var STAGES = [
    { id: 'stage-1', radius: 195, cpuPreset: 'balanced', ai: { search: 2, angleNoise: 0.16, power: 0.85, powerNoise: 0.15, mistake: 0.45, spread: 2, think: 0.8, aim: 0.8 } },
    { id: 'stage-2', radius: 190, cpuPreset: 'aggressive', ai: { search: 3, angleNoise: 0.06, power: 0.95, powerNoise: 0.06, mistake: 0.2, spread: 2, think: 0.5, aim: 0.55 } },
    { id: 'stage-3', radius: 185, cpuPreset: 'defensive', ai: { search: 5, angleNoise: 0.02, power: 1, powerNoise: 0.02, mistake: 0.05, spread: 1, think: 0.3, aim: 0.35 } }
  ];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }
  function speedOf(o) { return Math.sqrt(o.vx * o.vx + o.vy * o.vy); }
  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }
  function aiFor(s) { return STAGES[clamp(Number(s.stage) || 0, 0, STAGES.length - 1)].ai; }
  function radiusFor(s) { return STAGES[clamp(Number(s.stage) || 0, 0, STAGES.length - 1)].radius; }

  function makeChars(preset, team, centerY) {
    var p = presetById(preset);
    var out = [];
    for (var i = 0; i < p.spots.length; i++) {
      var sx = p.spots[i][0];
      var sy = p.spots[i][1] * (team === 'player' ? 1 : -1);
      var x = CENTER.x + sx;
      var y = centerY + sy;
      out.push({ x: x, y: y, homeX: x, homeY: y, vx: 0, vy: 0, r: CHAR_R, team: team, index: out.length, guard: GUARD_SAVE, out: false });
    }
    return out;
  }

  function createGame(options) {
    options = options || {};
    var stage = clamp(Number(options.stage) || 0, 0, STAGES.length - 1);
    var preset = presetById(options.preset);
    var player = makeChars(preset.id, 'player', CENTER.y);
    var cpu = makeChars(STAGES[stage].cpuPreset, 'cpu', CENTER.y);
    var chars = player.concat(cpu);
    for (var i = 0; i < chars.length; i++) chars[i].index = i;
    return {
      phase: 'aim',
      turn: 'player',
      paused: false,
      score: { player: 0, cpu: 0 },
      shots: 0,
      winScore: WIN_SCORE,
      stage: stage,
      stageTotal: STAGES.length,
      preset: preset.id,
      arenaRadius: STAGES[stage].radius,
      radius: STAGES[stage].radius,
      chars: chars,
      obstacles: chars,
      winner: null,
      reason: null,
      ringoutInfo: null,
      ringoutTimer: 0,
      cpuPlan: null,
      cpuTimer: 0,
      movingTime: 0,
      settleTime: 0,
      events: []
    };
  }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 100) s.events.shift();
  }

  function emitHit(events, x, y, power) {
    if (!events) return;
    events.push({ type: 'hit', x: x, y: y, power: power || 0 });
    if (events.length > 100) events.shift();
  }

  function collideChars(a, b, events) {
    if (a.out || b.out) return;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var rr = a.r + b.r;
    if (d >= rr) return;
    var nx = dx / d;
    var ny = dy / d;
    var overlap = rr - d;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;
    var rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel <= 0) return;
    var j = rel * 0.5;
    a.vx -= nx * j;
    a.vy -= ny * j;
    b.vx += nx * j;
    b.vy += ny * j;
    emitHit(events, (a.x + b.x) / 2, (a.y + b.y) / 2, j);
  }

  function edgeCheck(world, c, events) {
    if (c.out) return false;
    var dx = c.x - CENTER.x;
    var dy = c.y - CENTER.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= world.radius) return false;
    if (c.guard > 0) {
      c.guard = 0;
      var nx = dx / (d || 1);
      var ny = dy / (d || 1);
      var inside = Math.max(CHAR_R + 8, world.radius - CHAR_R - 8);
      c.x = CENTER.x + nx * inside;
      c.y = CENTER.y + ny * inside;
      var inward = Math.max(120, speedOf(c) * 0.42);
      c.vx = -nx * inward;
      c.vy = -ny * inward;
      if (events) events.push({ type: 'edgeSave', team: c.team, index: c.index, x: c.x, y: c.y });
      return false;
    }
    c.out = true;
    c.vx = 0;
    c.vy = 0;
    world.ringout = { team: c.team, index: c.index };
    if (events) events.push({ type: 'ringout', team: c.team, index: c.index, x: c.x, y: c.y });
    return true;
  }

  function stepWorld(world, dt, events) {
    var maxSpeed = 0;
    for (var i = 0; i < world.chars.length; i++) maxSpeed = Math.max(maxSpeed, speedOf(world.chars[i]));
    var steps = clamp(Math.ceil(maxSpeed * dt / 7), 1, 14);
    var h = dt / steps;
    for (var step = 0; step < steps; step++) {
      for (i = 0; i < world.chars.length; i++) {
        var c = world.chars[i];
        if (c.out) continue;
        c.x += c.vx * h;
        c.y += c.vy * h;
      }
      for (i = 0; i < world.chars.length; i++) {
        if (world.chars[i].out) continue;
        for (var j = i + 1; j < world.chars.length; j++) {
          if (!world.chars[j].out) collideChars(world.chars[i], world.chars[j], events);
        }
      }
      for (i = 0; i < world.chars.length; i++) {
        if (edgeCheck(world, world.chars[i], events)) return 'ringout';
      }
    }
    return null;
  }

  function slowWorld(world, dt) {
    for (var i = 0; i < world.chars.length; i++) {
      var c = world.chars[i];
      if (c.out) continue;
      var sp = speedOf(c);
      if (sp <= 0) continue;
      var next = Math.max(0, sp - FRICTION * dt);
      c.vx = c.vx / sp * next;
      c.vy = c.vy / sp * next;
    }
  }

  function worldMoving(world) {
    for (var i = 0; i < world.chars.length; i++) if (!world.chars[i].out && speedOf(world.chars[i]) > STOP_SPEED) return true;
    return false;
  }

  function stopWorld(s) {
    for (var i = 0; i < s.chars.length; i++) {
      if (s.chars[i].out) continue;
      s.chars[i].vx = 0;
      s.chars[i].vy = 0;
    }
  }

  function applyLaunch(s, index, vx, vy) {
    if (!s || s.phase === 'over' || s.paused) return false;
    var c = s.chars[index];
    if (!c || c.out || c.team !== s.turn) return false;
    var speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 80) return false;
    var max = MAX_PULL * PULL_POWER;
    if (speed > max) {
      vx = vx / speed * max;
      vy = vy / speed * max;
    }
    c.vx = vx;
    c.vy = vy;
    s.phase = 'moving';
    s.shots++;
    s.movingTime = 0;
    s.settleTime = 0;
    s.cpuPlan = null;
    event(s, 'launch', { team: c.team, index: index, x: c.x, y: c.y });
    return true;
  }

  function pullCharacter(s, index, dx, dy) {
    if (!s || s.phase !== 'aim' || s.turn !== 'player' || s.paused) return false;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 8) return false;
    if (len > MAX_PULL) {
      dx = dx / len * MAX_PULL;
      dy = dy / len * MAX_PULL;
    }
    return applyLaunch(s, index, -dx * PULL_POWER, -dy * PULL_POWER);
  }

  function charAt(s, x, y, team) {
    var best = -1;
    var bestD = CHAR_R * 2.2;
    for (var i = 0; i < s.chars.length; i++) {
      var c = s.chars[i];
      if (c.out || (team && c.team !== team)) continue;
      var d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function copyWorld(s) {
    var chars = [];
    for (var i = 0; i < s.chars.length; i++) {
      var c = s.chars[i];
      chars.push({ x: c.x, y: c.y, vx: c.vx, vy: c.vy, r: c.r, team: c.team, guard: c.guard, out: c.out, index: i });
    }
    return { chars: chars, radius: s.arenaRadius, ringout: null, edgeSaves: 0 };
  }

  function simulateLaunch(s, index, vx, vy) {
    var world = copyWorld(s);
    var c = world.chars[index];
    c.vx = vx;
    c.vy = vy;
    var elapsed = 0;
    while (elapsed < 2.8) {
      var result = stepWorld(world, 1 / 60, null);
      if (result === 'ringout') return { ringout: world.ringout, world: world };
      slowWorld(world, 1 / 60);
      if (!worldMoving(world)) break;
      elapsed += 1 / 60;
    }
    return { ringout: null, world: world };
  }

  function choosePlan(s, side) {
    var ai = side === 'cpu' ? aiFor(s) : { search: 5, angleNoise: 0.02, power: 1, powerNoise: 0.03, mistake: 0.12, spread: 1 };
    var own = [];
    var foes = [];
    for (var i = 0; i < s.chars.length; i++) {
      if (s.chars[i].out) continue;
      if (s.chars[i].team === side) own.push(s.chars[i]);
      else foes.push(s.chars[i]);
    }
    own.sort(function (a, b) {
      var ad = 9999, bd = 9999;
      for (var k = 0; k < foes.length; k++) {
        ad = Math.min(ad, dist(a.x, a.y, foes[k].x, foes[k].y));
        bd = Math.min(bd, dist(b.x, b.y, foes[k].x, foes[k].y));
      }
      return ad - bd;
    });
    own = own.slice(0, Math.max(1, Math.min(ai.search, own.length)));
    var maxPower = MAX_PULL * PULL_POWER * ai.power;
    var candidates = [];
    for (var oi = 0; oi < own.length; oi++) {
      var ch = own[oi];
      for (var fi = 0; fi < foes.length; fi++) {
        var foe = foes[fi];
        var dx = foe.x - ch.x;
        var dy = foe.y - ch.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var vx = dx / len * maxPower;
        var vy = dy / len * maxPower;
        var sim = simulateLaunch(s, ch.index, vx, vy);
        var score = 0;
        if (sim.ringout && sim.ringout.team !== side) score += 1000000;
        else if (sim.ringout && sim.ringout.team === side) score -= 1000000;
        else {
          var after = sim.world.chars[foe.index];
          var beforeDist = dist(foe.x, foe.y, CENTER.x, CENTER.y);
          var afterDist = dist(after.x, after.y, CENTER.x, CENTER.y);
          score += (afterDist - beforeDist) * 30;
          if (after.guard === 0 && foe.guard > 0) score += 400;
          for (var ci = 0; ci < sim.world.chars.length; ci++) {
            var sc = sim.world.chars[ci];
            if (sc.out && sc.team === side) score -= 8000;
          }
        }
        candidates.push({ charIndex: ch.index, vx: vx, vy: vy, score: score });
      }
    }
    candidates.sort(function (a, b) { return b.score - a.score; });
    if (!candidates.length) return null;
    var pick = candidates[0];
    if (candidates.length > 1 && Math.random() < ai.mistake) {
      var spread = Math.min(ai.spread, candidates.length - 1);
      pick = candidates[1 + Math.floor(Math.random() * spread)];
    }
    var angle = Math.atan2(pick.vy, pick.vx) + (Math.random() - 0.5) * ai.angleNoise;
    var power = Math.min(maxPower, Math.sqrt(pick.vx * pick.vx + pick.vy * pick.vy) * (1 - ai.powerNoise / 2 + Math.random() * ai.powerNoise));
    return { charIndex: pick.charIndex, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
  }

  function autoShot(s, side) {
    if (!s || s.phase !== 'aim' || s.turn !== side || s.paused) return false;
    var plan = choosePlan(s, side);
    if (!plan) return false;
    return applyLaunch(s, plan.charIndex, plan.vx, plan.vy);
  }

  function startTurn(s, team) {
    s.turn = team;
    s.cpuPlan = null;
    s.movingTime = 0;
    s.settleTime = 0;
    if (team === 'cpu') {
      s.phase = 'cpuThink';
      s.cpuTimer = aiFor(s).think;
    } else {
      s.phase = 'aim';
    }
    event(s, 'turn', { turn: team });
  }

  function finish(s) {
    s.phase = 'over';
    s.cpuPlan = null;
    stopWorld(s);
    s.winner = s.score.player > s.score.cpu ? 'player' : (s.score.player < s.score.cpu ? 'cpu' : 'draw');
    s.reason = 'ringout';
    event(s, 'over', { winner: s.winner, score: s.score });
  }

  function nextTurn(s, forcedTeam) {
    if (s.score.player >= WIN_SCORE || s.score.cpu >= WIN_SCORE) { finish(s); return; }
    startTurn(s, forcedTeam || (s.turn === 'player' ? 'cpu' : 'player'));
  }

  function resetAlive(s) {
    for (var i = 0; i < s.chars.length; i++) {
      var c = s.chars[i];
      if (c.out) continue;
      c.x = c.homeX;
      c.y = c.homeY;
      c.vx = 0;
      c.vy = 0;
    }
  }

  function ringoutScored(s, info) {
    var scorer = info.team === 'player' ? 'cpu' : 'player';
    s.score[scorer]++;
    s.phase = 'ringout';
    s.ringoutInfo = { team: info.team, index: info.index, scorer: scorer };
    s.ringoutTimer = 1.05;
    s.cpuPlan = null;
    stopWorld(s);
    event(s, 'ringoutScored', { team: info.team, index: info.index, scorer: scorer, score: { player: s.score.player, cpu: s.score.cpu } });
  }

  function afterRingout(s) {
    if (s.score.player >= WIN_SCORE || s.score.cpu >= WIN_SCORE) { finish(s); return; }
    var conceding = s.ringoutInfo.team;
    s.ringoutInfo = null;
    s.ringoutTimer = 0;
    resetAlive(s);
    startTurn(s, conceding);
  }

  function update(s, dt) {
    if (!s || s.paused || s.phase === 'over') return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    if (s.phase === 'moving') {
      s.movingTime += dt;
      var result = stepWorld(s, dt, s.events);
      if (result === 'ringout') { ringoutScored(s, s.ringout); s.ringout = null; return s; }
      slowWorld(s, dt);
      if (!worldMoving(s)) s.settleTime += dt;
      else s.settleTime = 0;
      if (s.settleTime > 0.22 || s.movingTime > SHOT_LIMIT) nextTurn(s);
    } else if (s.phase === 'ringout') {
      s.ringoutTimer -= dt;
      if (s.ringoutTimer <= 0) afterRingout(s);
    } else if (s.phase === 'cpuThink') {
      s.cpuTimer -= dt;
      if (s.cpuTimer <= 0) {
        s.cpuPlan = choosePlan(s, 'cpu');
        if (!s.cpuPlan) { nextTurn(s); return s; }
        s.phase = 'cpuAim';
        s.cpuTimer = aiFor(s).aim;
        event(s, 'cpuAim', { index: s.cpuPlan.charIndex, vx: s.cpuPlan.vx, vy: s.cpuPlan.vy });
      }
    } else if (s.phase === 'cpuAim') {
      s.cpuTimer -= dt;
      if (s.cpuTimer <= 0 && s.cpuPlan) applyLaunch(s, s.cpuPlan.charIndex, s.cpuPlan.vx, s.cpuPlan.vy);
    }
    return s;
  }

  function setPaused(s, paused) {
    if (!s || s.phase === 'over') return;
    s.paused = !!paused;
  }

  function getState(s) {
    if (!s) return null;
    return {
      id: 'stick-colosseum',
      phase: s.phase,
      turn: s.turn,
      paused: s.paused,
      score: { player: s.score.player, cpu: s.score.cpu },
      shots: s.shots,
      winScore: WIN_SCORE,
      stage: s.stage,
      stageTotal: STAGES.length,
      preset: s.preset,
      arenaRadius: s.arenaRadius,
      chars: s.chars,
      obstacles: s.chars,
      cpuAim: (s.phase === 'cpuAim' && s.cpuPlan) ? { index: s.cpuPlan.charIndex, vx: s.cpuPlan.vx, vy: s.cpuPlan.vy } : null,
      winner: s.winner,
      reason: s.reason,
      over: s.phase === 'over'
    };
  }

  function consumeEvents(s) {
    if (!s) return [];
    return s.events.splice(0, s.events.length);
  }

  return {
    VIEW: VIEW,
    CENTER: CENTER,
    CHAR_R: CHAR_R,
    PLAYER_R: CHAR_R,
    MAX_PULL: MAX_PULL,
    PULL_POWER: PULL_POWER,
    PRESETS: PRESETS,
    STAGES: STAGES,
    WIN_SCORE: WIN_SCORE,
    createGame: createGame,
    update: update,
    pullCharacter: pullCharacter,
    charAt: charAt,
    autoShot: autoShot,
    choosePlan: choosePlan,
    getState: getState,
    consumeEvents: consumeEvents,
    setPaused: setPaused
  };
});
