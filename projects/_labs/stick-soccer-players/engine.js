(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StickSoccerPlayersEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FIELD = { x: 24, y: 96, w: 432, h: 600 };
  FIELD.right = FIELD.x + FIELD.w;
  FIELD.bottom = FIELD.y + FIELD.h;
  var CENTER = { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2 };
  var GOAL_HALF = 62;
  var BALL_R = 10;
  var CHAR_R = 14;
  var MAX_PULL = 90;
  var PULL_POWER = 12;
  var BALL_FRICTION = 260;
  var CHAR_FRICTION = 560;
  var STOP_SPEED = 18;
  var SHOT_LIMIT = 9;
  var WIN_SCORE = 3;
  var KEEPER_DEPTH = 82;
  var BALL_MASS = 1;
  var CHAR_MASS = 3;
  var BALL_REST = 0.95;
  var CHAR_REST = 0;
  var WALL_BOUNCE = 0.82;

  var PLAYER_LINES = [
    { id: 'fw', label: 'FW', y: 455 },
    { id: 'mf', label: 'MF', y: 525 },
    { id: 'df', label: 'DF', y: 595 },
    { id: 'gk', label: 'GK', y: 655 }
  ];
  var CPU_LINES = [
    { id: 'gk', label: 'GK', y: 145 },
    { id: 'df', label: 'DF', y: 210 },
    { id: 'mf', label: 'MF', y: 275 },
    { id: 'fw', label: 'FW', y: 340 }
  ];
  var FORMATION_SLOTS = [72, 114, 156, 198, 240, 282, 324, 366, 408];
  var DEFAULT_FORMATION = [
    { line: 0, slot: 2 }, { line: 0, slot: 4 }, { line: 0, slot: 6 },
    { line: 1, slot: 1 }, { line: 1, slot: 4 }, { line: 1, slot: 7 },
    { line: 2, slot: 1 }, { line: 2, slot: 3 }, { line: 2, slot: 5 }, { line: 2, slot: 7 },
    { line: 3, slot: 4, role: 'gk' }
  ];

  function cpuFormation(gk, df, mf, fw) {
    var out = [{ line: 0, slot: gk, role: 'gk' }];
    var i;
    for (i = 0; i < df.length; i++) out.push({ line: 1, slot: df[i] });
    for (i = 0; i < mf.length; i++) out.push({ line: 2, slot: mf[i] });
    for (i = 0; i < fw.length; i++) out.push({ line: 3, slot: fw[i] });
    return out;
  }

  var STAGES = [
    { id: 'stage-1', name: '4-4-2', cpuFormation: cpuFormation(4, [1, 3, 5, 7], [1, 3, 5, 7], [2, 6]), ai: { search: 4, mistake: 0.65, spread: 3, angleNoise: 0.12, power: 0.8, powerNoise: 0.12, think: 0.9, aim: 0.9 } },
    { id: 'stage-2', name: '3-5-2', cpuFormation: cpuFormation(4, [1, 4, 7], [0, 2, 4, 6, 8], [2, 6]), ai: { search: 7, mistake: 0.25, spread: 2, angleNoise: 0.05, power: 0.95, powerNoise: 0.05, think: 0.5, aim: 0.6 } },
    { id: 'stage-3', name: '4-3-3', cpuFormation: cpuFormation(4, [1, 3, 5, 7], [1, 4, 7], [0, 4, 8]), ai: { search: 11, mistake: 0.05, spread: 1, angleNoise: 0.015, power: 1, powerNoise: 0.02, think: 0.3, aim: 0.35 } }
  ];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function speedOf(o) { return Math.sqrt(o.vx * o.vx + o.vy * o.vy); }
  function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }
  function aiFor(s) { return STAGES[clamp(Number(s.stage) || 0, 0, STAGES.length - 1)].ai; }

  function isValidFormation(formation) {
    if (!formation || !formation.length) return true;
    var seen = {};
    var byLine = {};
    for (var i = 0; i < formation.length; i++) {
      var p = formation[i];
      if (!p || !PLAYER_LINES[p.line] || FORMATION_SLOTS[p.slot] == null) return false;
      var key = p.line + ':' + p.slot;
      if (seen[key]) return false;
      seen[key] = true;
      if (!byLine[p.line]) byLine[p.line] = [];
      byLine[p.line].push(p.slot);
    }
    for (var line in byLine) {
      if (!Object.prototype.hasOwnProperty.call(byLine, line)) continue;
      var slots = byLine[line].slice().sort(function (a, b) { return a - b; });
      for (var j = 1; j < slots.length; j++) {
        if (slots[j] - slots[j - 1] === 1) return false;
      }
    }
    return true;
  }

  function playersFor(formation, team) {
    var f = formation && formation.length ? formation : DEFAULT_FORMATION;
    var lines = team === 'cpu' ? CPU_LINES : PLAYER_LINES;
    var out = [];
    for (var i = 0; i < f.length; i++) {
      var p = f[i];
      var line = lines[p.line];
      var x = FORMATION_SLOTS[p.slot];
      if (!line || x == null) continue;
      out.push({
        x: x, y: line.y, vx: 0, vy: 0, r: CHAR_R,
        homeX: x, homeY: line.y, line: p.line, slot: p.slot,
        index: out.length, team: team || 'player', role: p.role || 'field'
      });
    }
    return out;
  }

  var OBSTACLES = playersFor(DEFAULT_FORMATION, 'player').concat(playersFor(STAGES[0].cpuFormation, 'cpu'));
  for (var obstacleIndex = 0; obstacleIndex < OBSTACLES.length; obstacleIndex++) OBSTACLES[obstacleIndex].index = obstacleIndex;

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 100) s.events.shift();
  }

  function createGame(options) {
    options = options || {};
    var stage = clamp(Number(options.stage) || 0, 0, STAGES.length - 1);
    var playerFormation = options.formation || DEFAULT_FORMATION;
    if (!isValidFormation(playerFormation)) playerFormation = DEFAULT_FORMATION;
    var chars = playersFor(playerFormation, 'player').concat(playersFor(STAGES[stage].cpuFormation, 'cpu'));
    for (var charIndex = 0; charIndex < chars.length; charIndex++) chars[charIndex].index = charIndex;
    return {
      phase: 'aim',
      turn: 'player',
      paused: false,
      score: { player: 0, cpu: 0 },
      shots: 0,
      winScore: WIN_SCORE,
      ball: { x: CENTER.x, y: CENTER.y, vx: 0, vy: 0 },
      chars: chars,
      obstacles: chars,
      stage: stage,
      stageName: STAGES[stage].name,
      goalSide: null,
      goalTimer: 0,
      cpuTimer: 0,
      cpuPlan: null,
      keeper: null,
      keeperTimer: 0,
      keeperPlan: null,
      catch: null,
      movingTime: 0,
      settleTime: 0,
      winner: null,
      reason: null,
      events: []
    };
  }

  function resetBall(s) {
    s.ball.x = CENTER.x;
    s.ball.y = CENTER.y;
    s.ball.vx = 0;
    s.ball.vy = 0;
  }

  function resetCharacters(s) {
    for (var i = 0; i < s.chars.length; i++) {
      var c = s.chars[i];
      c.x = c.homeX;
      c.y = c.homeY;
      c.vx = 0;
      c.vy = 0;
    }
  }

  function emitHit(events, kind, x, y, power) {
    if (!events) return;
    events.push({ type: 'hit', kind: kind, x: x, y: y, power: power || 0 });
    if (events.length > 100) events.shift();
  }

  function inKeeperZone(c) {
    var inX = c.x >= FIELD.x + 75 && c.x <= FIELD.right - 75;
    if (c.team === 'player') return inX && c.y >= FIELD.bottom - KEEPER_DEPTH;
    return inX && c.y <= FIELD.y + KEEPER_DEPTH;
  }

  function keeperCatch(world, ball, c, events) {
    if (!c || c.role !== 'gk' || !inKeeperZone(c)) return false;
    var dx = ball.x - c.x;
    var dy = ball.y - c.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    if (d >= BALL_R + c.r) return false;
    var front = c.team === 'player' ? -1 : 1;
    ball.x = c.x;
    ball.y = c.y + front * (c.r + BALL_R + 2);
    ball.vx = 0;
    ball.vy = 0;
    c.vx = 0;
    c.vy = 0;
    world.catch = { team: c.team, index: c.index };
    if (events) events.push({ type: 'catch', team: c.team, index: c.index, x: c.x, y: c.y });
    return true;
  }

  function collideBallChar(ball, c, events) {
    var dx = ball.x - c.x;
    var dy = ball.y - c.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var rr = BALL_R + c.r;
    if (d >= rr) return;
    var nx = dx / d;
    var ny = dy / d;
    var overlap = rr - d;
    ball.x += nx * overlap * 0.92;
    ball.y += ny * overlap * 0.92;
    c.x -= nx * overlap * 0.08;
    c.y -= ny * overlap * 0.08;
    var rel = (ball.vx - c.vx) * nx + (ball.vy - c.vy) * ny;
    if (rel >= 0) return;
    var j = -(1 + BALL_REST) * rel / (1 / BALL_MASS + 1 / CHAR_MASS);
    ball.vx += nx * j / BALL_MASS;
    ball.vy += ny * j / BALL_MASS;
    c.vx -= nx * j / CHAR_MASS;
    c.vy -= ny * j / CHAR_MASS;
    emitHit(events, 'ball', c.x, c.y, Math.abs(j));
  }

  function collideChars(a, b, events) {
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
    var j = (1 + CHAR_REST) * rel / (1 / CHAR_MASS + 1 / CHAR_MASS);
    a.vx -= nx * j / CHAR_MASS;
    a.vy -= ny * j / CHAR_MASS;
    b.vx += nx * j / CHAR_MASS;
    b.vy += ny * j / CHAR_MASS;
    emitHit(events, 'char', (a.x + b.x) / 2, (a.y + b.y) / 2, j / CHAR_MASS);
  }

  function stepWorld(world, dt, events) {
    var maxSpeed = speedOf(world.ball);
    for (var c = 0; c < world.chars.length; c++) maxSpeed = Math.max(maxSpeed, speedOf(world.chars[c]));
    var steps = clamp(Math.ceil(maxSpeed * dt / 7), 1, 14);
    var h = dt / steps;
    for (var step = 0; step < steps; step++) {
      var b = world.ball;
      b.x += b.vx * h;
      b.y += b.vy * h;
      for (var i = 0; i < world.chars.length; i++) {
        var p = world.chars[i];
        p.x += p.vx * h;
        p.y += p.vy * h;
      }

      if (b.y - BALL_R < FIELD.y) {
        if (Math.abs(b.x - CENTER.x) <= GOAL_HALF) return 'player';
        b.y = FIELD.y + BALL_R;
        if (b.vy < 0) { b.vy = -b.vy * WALL_BOUNCE; b.vx *= 0.98; }
      } else if (b.y + BALL_R > FIELD.bottom) {
        if (Math.abs(b.x - CENTER.x) <= GOAL_HALF) return 'cpu';
        b.y = FIELD.bottom - BALL_R;
        if (b.vy > 0) { b.vy = -b.vy * WALL_BOUNCE; b.vx *= 0.98; }
      }
      if (b.x - BALL_R < FIELD.x) {
        b.x = FIELD.x + BALL_R;
        if (b.vx < 0) b.vx = -b.vx * WALL_BOUNCE;
      } else if (b.x + BALL_R > FIELD.right) {
        b.x = FIELD.right - BALL_R;
        if (b.vx > 0) b.vx = -b.vx * WALL_BOUNCE;
      }

      for (i = 0; i < world.chars.length; i++) {
        p = world.chars[i];
        if (p.x - p.r < FIELD.x) { p.x = FIELD.x + p.r; if (p.vx < 0) p.vx = -p.vx * 0.55; }
        else if (p.x + p.r > FIELD.right) { p.x = FIELD.right - p.r; if (p.vx > 0) p.vx = -p.vx * 0.55; }
        if (p.y - p.r < FIELD.y) { p.y = FIELD.y + p.r; if (p.vy < 0) p.vy = -p.vy * 0.55; }
        else if (p.y + p.r > FIELD.bottom) { p.y = FIELD.bottom - p.r; if (p.vy > 0) p.vy = -p.vy * 0.55; }
        if (keeperCatch(world, b, p, events)) return 'catch';
        collideBallChar(b, p, events);
      }
      for (i = 0; i < world.chars.length; i++) {
        for (var j = i + 1; j < world.chars.length; j++) collideChars(world.chars[i], world.chars[j], events);
      }
    }
    return null;
  }

  function slowBody(o, friction, dt) {
    var sp = speedOf(o);
    if (sp <= 0) return;
    var next = Math.max(0, sp - friction * dt);
    o.vx = o.vx / sp * next;
    o.vy = o.vy / sp * next;
  }

  function slowWorld(world, dt) {
    slowBody(world.ball, BALL_FRICTION, dt);
    for (var i = 0; i < world.chars.length; i++) slowBody(world.chars[i], CHAR_FRICTION, dt);
  }

  function worldMoving(world) {
    if (speedOf(world.ball) > STOP_SPEED) return true;
    for (var i = 0; i < world.chars.length; i++) if (speedOf(world.chars[i]) > STOP_SPEED) return true;
    return false;
  }

  function stopWorld(s) {
    s.ball.vx = 0;
    s.ball.vy = 0;
    for (var i = 0; i < s.chars.length; i++) {
      s.chars[i].vx = 0;
      s.chars[i].vy = 0;
    }
  }

  function copyWorld(s) {
    var chars = [];
    for (var i = 0; i < s.chars.length; i++) {
      var c = s.chars[i];
      chars.push({ x: c.x, y: c.y, vx: c.vx, vy: c.vy, r: c.r, team: c.team });
    }
    return {
      ball: { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy },
      chars: chars
    };
  }

  function simulateLaunch(s, index, vx, vy) {
    var world = copyWorld(s);
    world.chars[index].vx = vx;
    world.chars[index].vy = vy;
    var elapsed = 0;
    while (elapsed < 3.2) {
      var goal = stepWorld(world, 1 / 60, null);
      if (goal === 'catch') break;
      if (goal) return { goal: goal, x: world.ball.x, y: world.ball.y };
      slowWorld(world, 1 / 60);
      if (!worldMoving(world)) break;
      elapsed += 1 / 60;
    }
    return { goal: null, x: world.ball.x, y: world.ball.y };
  }

  function choosePlan(s, side) {
    var ai = side === 'cpu' ? aiFor(s) : { search: 7, mistake: 0.15, spread: 1, angleNoise: 0.02, power: 1, powerNoise: 0.03 };
    var own = [];
    for (var i = 0; i < s.chars.length; i++) if (s.chars[i].team === side) own.push(s.chars[i]);
    own.sort(function (a, b) {
      return dist(a.x, a.y, s.ball.x, s.ball.y) - dist(b.x, b.y, s.ball.x, s.ball.y);
    });
    own = own.slice(0, Math.max(1, Math.min(ai.search, own.length)));
    var targetY = side === 'player' ? FIELD.y : FIELD.bottom;
    var targets = [-GOAL_HALF + 18, -26, 0, 26, GOAL_HALF - 18];
    var maxPower = MAX_PULL * PULL_POWER * ai.power;
    var candidates = [];
    for (var c = 0; c < own.length; c++) {
      var ch = own[c];
      for (var t = 0; t < targets.length; t++) {
        var gx = CENTER.x + targets[t];
        var gdx = gx - s.ball.x;
        var gdy = targetY - s.ball.y;
        var gd = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
        var ux = gdx / gd;
        var uy = gdy / gd;
        var ax = s.ball.x - ux * (CHAR_R + BALL_R + 4);
        var ay = s.ball.y - uy * (CHAR_R + BALL_R + 4);
        var dx = ax - ch.x;
        var dy = ay - ch.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var vx = dx / len * maxPower;
        var vy = dy / len * maxPower;
        var sim = simulateLaunch(s, ch.index, vx, vy);
        var score = 0;
        if (sim.goal === side) score += 1000000;
        else if (sim.goal && sim.goal !== side) score -= 1000000;
        else {
          var progress = side === 'player' ? (s.ball.y - sim.y) : (sim.y - s.ball.y);
          var closeness = GOAL_HALF - Math.abs(sim.x - CENTER.x);
          score += progress * 4 + closeness * 6;
        }
        candidates.push({ charIndex: ch.index, vx: vx, vy: vy, score: score });
      }
    }
    candidates.sort(function (a, b) { return b.score - a.score; });
    if (!candidates.length) {
      var fallback = own[0];
      var fdx = s.ball.x - fallback.x;
      var fdy = s.ball.y - fallback.y;
      var fd = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      return { charIndex: fallback.index, vx: fdx / fd * maxPower, vy: fdy / fd * maxPower };
    }
    var pick = candidates[0];
    if (candidates.length > 1 && Math.random() < ai.mistake) {
      var spread = Math.min(ai.spread, candidates.length - 1);
      pick = candidates[1 + Math.floor(Math.random() * spread)];
    }
    var angle = Math.atan2(pick.vy, pick.vx) + (Math.random() - 0.5) * ai.angleNoise;
    var power = Math.min(maxPower, Math.sqrt(pick.vx * pick.vx + pick.vy * pick.vy) * (1 - ai.powerNoise / 2 + Math.random() * ai.powerNoise));
    return { charIndex: pick.charIndex, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
  }

  function applyLaunch(s, index, vx, vy) {
    if (!s || s.phase === 'over' || s.paused) return false;
    var c = s.chars[index];
    if (!c || c.team !== s.turn) return false;
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

  function autoShot(s, side) {
    if (!s || s.turn !== side || s.paused) return false;
    if (s.phase === 'keeperKick') {
      var keeperPlan = chooseKeeperKick(s, side);
      return kickKeeperBall(s, keeperPlan.vx, keeperPlan.vy);
    }
    if (s.phase !== 'aim') return false;
    var plan = choosePlan(s, side);
    return applyLaunch(s, plan.charIndex, plan.vx, plan.vy);
  }

  function charAt(s, x, y, team) {
    var best = -1;
    var bestD = CHAR_R * 2.2;
    for (var i = 0; i < s.chars.length; i++) {
      var c = s.chars[i];
      if (team && c.team !== team) continue;
      var d = dist(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function keeperCaught(s) {
    var caught = s.catch;
    s.catch = null;
    if (!caught) return;
    s.phase = 'keeperHold';
    s.turn = caught.team;
    s.keeper = { team: caught.team, index: caught.index };
    s.keeperTimer = 0.75;
    s.cpuPlan = null;
    s.goalSide = null;
    stopWorld(s);
    event(s, 'keeperCatch', { team: caught.team, index: caught.index });
  }

  function startKeeperKick(s) {
    if (!s.keeper) { nextTurn(s); return; }
    if (s.turn === 'cpu') {
      s.phase = 'keeperThink';
      s.cpuTimer = aiFor(s).think;
    } else {
      s.phase = 'keeperKick';
    }
    event(s, 'keeperReady', { team: s.turn, index: s.keeper.index });
  }

  function chooseKeeperKick(s, side) {
    var ai = side === 'cpu' ? aiFor(s) : { angleNoise: 0.02, power: 0.95, powerNoise: 0.03 };
    var targetY = side === 'player' ? FIELD.y + 120 : FIELD.bottom - 120;
    var targetX = CENTER.x + (Math.random() - 0.5) * 150;
    var base = Math.atan2(targetY - s.ball.y, targetX - s.ball.x);
    if (!isFinite(base)) base = side === 'player' ? -Math.PI / 2 : Math.PI / 2;
    var angle = base + (Math.random() - 0.5) * ai.angleNoise;
    var max = MAX_PULL * PULL_POWER * ai.power;
    var power = max * (1 - ai.powerNoise / 2 + Math.random() * ai.powerNoise);
    return { vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
  }

  function kickKeeperBall(s, vx, vy) {
    if (!s || !s.keeper || s.phase === 'over') return false;
    var speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 80) return false;
    var max = MAX_PULL * PULL_POWER;
    if (speed > max) {
      vx = vx / speed * max;
      vy = vy / speed * max;
    }
    s.ball.vx = vx;
    s.ball.vy = vy;
    s.phase = 'moving';
    s.shots++;
    s.movingTime = 0;
    s.settleTime = 0;
    s.keeperPlan = null;
    event(s, 'launch', { team: s.keeper.team, index: s.keeper.index, x: s.ball.x, y: s.ball.y, keeper: true });
    s.keeper = null;
    return true;
  }

  function pullKeeperBall(s, dx, dy) {
    if (!s || s.phase !== 'keeperKick' || s.turn !== 'player' || s.paused) return false;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 8) return false;
    if (len > MAX_PULL) {
      dx = dx / len * MAX_PULL;
      dy = dy / len * MAX_PULL;
    }
    return kickKeeperBall(s, -dx * PULL_POWER, -dy * PULL_POWER);
  }

  function finish(s) {
    s.phase = 'over';
    s.cpuPlan = null;
    stopWorld(s);
    if (s.score.player > s.score.cpu) s.winner = 'player';
    else if (s.score.player < s.score.cpu) s.winner = 'cpu';
    else s.winner = 'draw';
    s.reason = 'score';
    event(s, 'over', { winner: s.winner, score: s.score });
  }

  function nextTurn(s) {
    if (s.score.player >= WIN_SCORE || s.score.cpu >= WIN_SCORE) { finish(s); return; }
    s.turn = s.turn === 'player' ? 'cpu' : 'player';
    s.cpuPlan = null;
    stopWorld(s);
    s.movingTime = 0;
    s.settleTime = 0;
    if (s.turn === 'cpu') {
      s.phase = 'cpuThink';
      s.cpuTimer = aiFor(s).think;
    } else {
      s.phase = 'aim';
    }
    event(s, 'turn', { turn: s.turn });
  }

  function goalScored(s, side) {
    s.score[side]++;
    s.phase = 'goal';
    s.goalSide = side;
    s.goalTimer = 1.2;
    s.cpuPlan = null;
    stopWorld(s);
    event(s, 'goal', { side: side, score: { player: s.score.player, cpu: s.score.cpu } });
  }

  function afterGoal(s) {
    if (s.score.player >= WIN_SCORE || s.score.cpu >= WIN_SCORE) { finish(s); return; }
    resetBall(s);
    resetCharacters(s);
    s.turn = s.goalSide === 'player' ? 'cpu' : 'player';
    s.goalSide = null;
    s.movingTime = 0;
    s.settleTime = 0;
    if (s.turn === 'cpu') {
      s.phase = 'cpuThink';
      s.cpuTimer = aiFor(s).think + 0.15;
    } else {
      s.phase = 'aim';
    }
    event(s, 'kickoff', { turn: s.turn });
  }

  function update(s, dt) {
    if (!s || s.paused || s.phase === 'over') return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    if (s.phase === 'moving') {
      s.movingTime += dt;
      var goal = stepWorld(s, dt, s.events);
      if (goal === 'catch') { keeperCaught(s); return s; }
      if (goal) { goalScored(s, goal); return s; }
      slowWorld(s, dt);
      if (!worldMoving(s)) s.settleTime += dt;
      else s.settleTime = 0;
      if (s.settleTime > 0.25 || s.movingTime > SHOT_LIMIT) nextTurn(s);
    } else if (s.phase === 'goal') {
      s.goalTimer -= dt;
      if (s.goalTimer <= 0) afterGoal(s);
    } else if (s.phase === 'keeperHold') {
      s.keeperTimer -= dt;
      if (s.keeperTimer <= 0) startKeeperKick(s);
    } else if (s.phase === 'keeperThink') {
      s.cpuTimer -= dt;
      if (s.cpuTimer <= 0) {
        s.keeperPlan = chooseKeeperKick(s, 'cpu');
        s.phase = 'keeperAim';
        s.cpuTimer = aiFor(s).aim;
        event(s, 'keeperAim', { vx: s.keeperPlan.vx, vy: s.keeperPlan.vy });
      }
    } else if (s.phase === 'keeperAim') {
      s.cpuTimer -= dt;
      if (s.cpuTimer <= 0 && s.keeperPlan) kickKeeperBall(s, s.keeperPlan.vx, s.keeperPlan.vy);
    } else if (s.phase === 'cpuThink') {
      s.cpuTimer -= dt;
      if (s.cpuTimer <= 0) {
        s.cpuPlan = choosePlan(s, 'cpu');
        s.phase = 'cpuAim';
        s.cpuTimer = aiFor(s).aim;
        event(s, 'cpuAim', { index: s.cpuPlan.charIndex, vx: s.cpuPlan.vx, vy: s.cpuPlan.vy });
      }
    } else if (s.phase === 'cpuAim') {
      s.cpuTimer -= dt;
      if (s.cpuTimer <= 0) {
        var plan = s.cpuPlan;
        if (plan) applyLaunch(s, plan.charIndex, plan.vx, plan.vy);
      }
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
      id: 'stick-soccer-players',
      phase: s.phase,
      turn: s.turn,
      paused: s.paused,
      score: { player: s.score.player, cpu: s.score.cpu },
      shots: s.shots,
      winScore: WIN_SCORE,
      stage: s.stage,
      stageName: s.stageName,
      stageTotal: STAGES.length,
      ball: { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy },
      chars: s.chars,
      obstacles: s.chars,
      goalSide: s.goalSide,
      cpuAim: (s.phase === 'cpuAim' && s.cpuPlan) ? { index: s.cpuPlan.charIndex, vx: s.cpuPlan.vx, vy: s.cpuPlan.vy } : null,
      keeper: s.keeper,
      keeperAim: (s.phase === 'keeperAim' && s.keeperPlan) ? { vx: s.keeperPlan.vx, vy: s.keeperPlan.vy } : null,
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
    FIELD: FIELD,
    CENTER: CENTER,
    GOAL_HALF: GOAL_HALF,
    BALL_R: BALL_R,
    CHAR_R: CHAR_R,
    PLAYER_R: CHAR_R,
    MAX_PULL: MAX_PULL,
    PULL_POWER: PULL_POWER,
    OBSTACLES: OBSTACLES,
    PLAYER_LINES: PLAYER_LINES,
    CPU_LINES: CPU_LINES,
    FORMATION_LINES: PLAYER_LINES,
    FORMATION_SLOTS: FORMATION_SLOTS,
    STAGES: STAGES,
    DEFAULT_FORMATION: DEFAULT_FORMATION,
    isValidFormation: isValidFormation,
    playersFor: playersFor,
    WIN_SCORE: WIN_SCORE,
    BALL_MASS: BALL_MASS,
    CHAR_MASS: CHAR_MASS,
    BALL_REST: BALL_REST,
    CHAR_REST: CHAR_REST,
    createGame: createGame,
    update: update,
    pullCharacter: pullCharacter,
    pullKeeperBall: pullKeeperBall,
    inKeeperZone: inKeeperZone,
    charAt: charAt,
    autoShot: autoShot,
    choosePlan: choosePlan,
    getState: getState,
    consumeEvents: consumeEvents,
    setPaused: setPaused
  };
});
