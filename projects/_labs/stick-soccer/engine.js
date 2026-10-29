(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StickSoccerEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FIELD = { x: 24, y: 96, w: 432, h: 600 };
  FIELD.right = FIELD.x + FIELD.w;
  FIELD.bottom = FIELD.y + FIELD.h;
  var CENTER = { x: FIELD.x + FIELD.w / 2, y: FIELD.y + FIELD.h / 2 };
  var GOAL_HALF = 62;
  var BALL_R = 12;
  var MAX_PULL = 90;
  var PULL_POWER = 11;
  var FRICTION = 430;
  var WALL_BOUNCE = 0.82;
  var OBSTACLE_BOUNCE = 0.88;
  var STOP_SPEED = 18;
  var SHOT_LIMIT = 7;
  var TURNS = 12;
  var WIN_SCORE = 3;

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
  var FORMATION_SLOTS = [96, 168, 240, 312, 384];
  var PLAYER_R = 16;
  var DEFAULT_FORMATION = [
    { line: 0, slot: 1 }, { line: 0, slot: 2 }, { line: 0, slot: 3 },
    { line: 1, slot: 0 }, { line: 1, slot: 2 }, { line: 1, slot: 4 },
    { line: 2, slot: 0 }, { line: 2, slot: 1 }, { line: 2, slot: 3 }, { line: 2, slot: 4 },
    { line: 3, slot: 2 }
  ];

  function cpuFormation(gk, df, mf, fw) {
    var out = [{ line: 0, slot: 2 }];
    var i;
    for (i = 0; i < df.length; i++) out.push({ line: 1, slot: df[i] });
    for (i = 0; i < mf.length; i++) out.push({ line: 2, slot: mf[i] });
    for (i = 0; i < fw.length; i++) out.push({ line: 3, slot: fw[i] });
    return out;
  }

  var STAGES = [
    { id: 'stage-1', name: '4-4-2', cpuFormation: cpuFormation(2, [0, 1, 3, 4], [0, 1, 3, 4], [1, 3]) },
    { id: 'stage-2', name: '3-5-2', cpuFormation: cpuFormation(2, [0, 2, 4], [0, 1, 2, 3, 4], [1, 3]) },
    { id: 'stage-3', name: '4-3-3', cpuFormation: cpuFormation(2, [0, 1, 3, 4], [1, 2, 3], [0, 2, 4]) }
  ];

  function obstaclesFor(formation, team) {
    var f = formation && formation.length ? formation : DEFAULT_FORMATION;
    var lines = team === 'cpu' ? CPU_LINES : PLAYER_LINES;
    var out = [];
    for (var i = 0; i < f.length; i++) {
      var p = f[i];
      var line = lines[p.line];
      var slot = FORMATION_SLOTS[p.slot];
      if (!line || slot == null) continue;
      out.push({ x: slot, y: line.y, r: PLAYER_R, line: p.line, slot: p.slot, index: i, team: team || 'player' });
    }
    return out;
  }

  var OBSTACLES = obstaclesFor(DEFAULT_FORMATION, 'player').concat(obstaclesFor(STAGES[0].cpuFormation, 'cpu'));

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function speedOf(b) { return Math.sqrt(b.vx * b.vx + b.vy * b.vy); }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 100) s.events.shift();
  }

  function resetBall(s) {
    s.ball.x = CENTER.x;
    s.ball.y = CENTER.y;
    s.ball.vx = 0;
    s.ball.vy = 0;
  }

  function createGame(options) {
    options = options || {};
    var stage = clamp(Number(options.stage) || 0, 0, STAGES.length - 1);
    var playerFormation = options.formation || DEFAULT_FORMATION;
    var cpuFormation = STAGES[stage].cpuFormation;
    var s = {
      phase: 'aim',
      turn: 'player',
      paused: false,
      score: { player: 0, cpu: 0 },
      shots: 0,
      ball: { x: CENTER.x, y: CENTER.y, vx: 0, vy: 0 },
      shotTime: 0,
      stopTimer: 0,
      goalTimer: 0,
      goalSide: null,
      winner: null,
      reason: null,
      cpuTimer: 0,
      cpuPlan: null,
      rng: null,
      stage: stage,
      stageName: STAGES[stage].name,
      obstacles: obstaclesFor(playerFormation, 'player').concat(obstaclesFor(cpuFormation, 'cpu')),
      events: []
    };
    return s;
  }

  function shoot(s, vx, vy) {
    if (!s || s.phase !== 'aim' || s.paused) return false;
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
    s.shotTime = 0;
    s.stopTimer = 0;
    s.cpuPlan = null;
    event(s, 'shoot', { vx: vx, vy: vy, turn: s.turn });
    return true;
  }

  function shootDrag(s, dx, dy) {
    if (!s || s.phase !== 'aim' || s.turn !== 'player' || s.paused) return false;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 8) return false;
    if (len > MAX_PULL) {
      dx = dx / len * MAX_PULL;
      dy = dy / len * MAX_PULL;
    }
    return shoot(s, -dx * PULL_POWER, -dy * PULL_POWER);
  }

  function bounceBall(ball, nx, ny, restitution) {
    var dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= (1 + restitution) * dot * nx;
      ball.vy -= (1 + restitution) * dot * ny;
    }
  }

  function collideObstacles(ball, events, obstacles) {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var dx = ball.x - o.x;
      var dy = ball.y - o.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var rr = BALL_R + o.r;
      if (dist >= rr || dist < 0.0001) continue;
      var nx = dx / dist;
      var ny = dy / dist;
      ball.x = o.x + nx * (rr + 0.2);
      ball.y = o.y + ny * (rr + 0.2);
      bounceBall(ball, nx, ny, OBSTACLE_BOUNCE);
      if (events) events.push({ type: 'bounce', x: o.x, y: o.y, index: i });
    }
  }

  function integrate(ball, dt, events, obstacles) {
    var speed = speedOf(ball);
    var steps = Math.max(1, Math.ceil(speed * dt / 6));
    var h = dt / steps;
    for (var i = 0; i < steps; i++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      if (ball.y - BALL_R < FIELD.y) {
        if (Math.abs(ball.x - CENTER.x) <= GOAL_HALF) return 'player';
        ball.y = FIELD.y + BALL_R;
        bounceBall(ball, 0, 1, WALL_BOUNCE);
        if (events) events.push({ type: 'wall', x: ball.x, y: FIELD.y });
      } else if (ball.y + BALL_R > FIELD.bottom) {
        if (Math.abs(ball.x - CENTER.x) <= GOAL_HALF) return 'cpu';
        ball.y = FIELD.bottom - BALL_R;
        bounceBall(ball, 0, -1, WALL_BOUNCE);
        if (events) events.push({ type: 'wall', x: ball.x, y: FIELD.bottom });
      }

      if (ball.x - BALL_R < FIELD.x) {
        ball.x = FIELD.x + BALL_R;
        bounceBall(ball, 1, 0, WALL_BOUNCE);
        if (events) events.push({ type: 'wall', x: FIELD.x, y: ball.y });
      } else if (ball.x + BALL_R > FIELD.right) {
        ball.x = FIELD.right - BALL_R;
        bounceBall(ball, -1, 0, WALL_BOUNCE);
        if (events) events.push({ type: 'wall', x: FIELD.right, y: ball.y });
      }

      collideObstacles(ball, events, obstacles);
    }
    var sp = speedOf(ball);
    var ns = Math.max(0, sp - FRICTION * dt);
    if (sp > 0) {
      ball.vx = ball.vx / sp * ns;
      ball.vy = ball.vy / sp * ns;
    }
    return null;
  }

  function simulateShot(s, vx, vy) {
    var ball = { x: s.ball.x, y: s.ball.y, vx: vx, vy: vy };
    var t = 0;
    while (t < SHOT_LIMIT) {
      var goal = integrate(ball, 1 / 120, null, s.obstacles);
      t += 1 / 120;
      if (goal) return { goal: goal, x: ball.x, y: ball.y, time: t };
      if (speedOf(ball) < STOP_SPEED) break;
    }
    return { goal: null, x: ball.x, y: ball.y, time: t };
  }

  function chooseShot(s, side, rng) {
    var random = rng || Math.random;
    var targetY = side === 'player' ? FIELD.y : FIELD.bottom;
    var startX = s.ball.x;
    var startY = s.ball.y;
    var candidates = [];
    var offsets = [-62, -42, -20, 0, 20, 42, 62];
    var maxPower = MAX_PULL * PULL_POWER;
    var powers = [650, 800, 950, maxPower];
    for (var i = 0; i < offsets.length; i++) {
      var tx = CENTER.x + offsets[i];
      var dx = tx - startX;
      var dy = targetY - startY;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      for (var p = 0; p < powers.length; p++) {
        var power = Math.min(powers[p], maxPower);
        var vx = dx / len * power;
        var vy = dy / len * power;
        var sim = simulateShot(s, vx, vy);
        var score = 0;
        if (sim.goal === side) score += 100000;
        else if (sim.goal && sim.goal !== side) score -= 100000;
        else {
          var progress = side === 'player' ? (startY - sim.y) : (sim.y - startY);
          var near = GOAL_HALF - Math.abs(sim.x - CENTER.x);
          score += progress * 2.2 + near * 5;
          if (sim.x > FIELD.x + 30 && sim.x < FIELD.right - 30) score += 40;
        }
        candidates.push({ vx: vx, vy: vy, score: score, sim: sim });
      }
    }
    candidates.sort(function (a, b) { return b.score - a.score; });
    if (!candidates.length) return { vx: 0, vy: side === 'player' ? -800 : 800 };
    var pick = candidates[0];
    if (candidates.length > 1 && random() < 0.18) pick = candidates[1];
    var angle = Math.atan2(pick.vy, pick.vx) + (random() - 0.5) * 0.035;
    var shotPower = Math.min(maxPower, Math.sqrt(pick.vx * pick.vx + pick.vy * pick.vy) * (0.97 + random() * 0.06));
    return { vx: Math.cos(angle) * shotPower, vy: Math.sin(angle) * shotPower };
  }

  function autoShot(s, side, rng) {
    if (!s || s.phase !== 'aim' || s.turn !== side || s.paused) return false;
    var plan = chooseShot(s, side, rng);
    return shoot(s, plan.vx, plan.vy);
  }

  function finish(s) {
    s.phase = 'over';
    s.cpuPlan = null;
    s.ball.vx = 0;
    s.ball.vy = 0;
    if (s.score.player > s.score.cpu) s.winner = 'player';
    else if (s.score.player < s.score.cpu) s.winner = 'cpu';
    else s.winner = 'draw';
    s.reason = s.shots >= TURNS ? 'turns' : 'score';
    event(s, 'over', { winner: s.winner, score: s.score });
  }

  function nextTurn(s) {
    if (s.score.player >= WIN_SCORE || s.score.cpu >= WIN_SCORE || s.shots >= TURNS) {
      finish(s);
      return;
    }
    s.turn = s.turn === 'player' ? 'cpu' : 'player';
    s.cpuPlan = null;
    s.stopTimer = 0;
    s.shotTime = 0;
    if (s.turn === 'cpu') {
      s.phase = 'cpuThink';
      s.cpuTimer = 0.45;
    } else {
      s.phase = 'aim';
    }
    event(s, 'turn', { turn: s.turn });
  }

  function goalScored(s, side) {
    s.score[side]++;
    s.phase = 'goal';
    s.goalSide = side;
    s.goalTimer = 1.25;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.cpuPlan = null;
    event(s, 'goal', { side: side, score: { player: s.score.player, cpu: s.score.cpu } });
  }

  function afterGoal(s) {
    if (s.score.player >= WIN_SCORE || s.score.cpu >= WIN_SCORE || s.shots >= TURNS) {
      finish(s);
      return;
    }
    resetBall(s);
    s.turn = s.goalSide === 'player' ? 'cpu' : 'player';
    s.goalSide = null;
    s.shotTime = 0;
    s.stopTimer = 0;
    if (s.turn === 'cpu') {
      s.phase = 'cpuThink';
      s.cpuTimer = 0.6;
    } else {
      s.phase = 'aim';
    }
    event(s, 'kickoff', { turn: s.turn });
  }

  function update(s, dt) {
    if (!s || s.paused || s.phase === 'over') return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    if (s.phase === 'moving') {
      s.shotTime += dt;
      var goal = integrate(s.ball, dt, s.events, s.obstacles);
      if (goal) {
        goalScored(s, goal);
        return s;
      }
      var speed = speedOf(s.ball);
      if (speed < STOP_SPEED) s.stopTimer += dt;
      else s.stopTimer = 0;
      if (s.stopTimer > 0.22 || s.shotTime > SHOT_LIMIT) {
        s.ball.vx = 0;
        s.ball.vy = 0;
        nextTurn(s);
      }
    } else if (s.phase === 'goal') {
      s.goalTimer -= dt;
      if (s.goalTimer <= 0) afterGoal(s);
    } else if (s.phase === 'cpuThink') {
      s.cpuTimer -= dt;
      if (s.cpuTimer <= 0) {
        s.cpuPlan = chooseShot(s, 'cpu', s.rng);
        s.phase = 'cpuAim';
        s.cpuTimer = 0.55;
        event(s, 'cpuAim', { vx: s.cpuPlan.vx, vy: s.cpuPlan.vy });
      }
    } else if (s.phase === 'cpuAim') {
      s.cpuTimer -= dt;
      if (s.cpuTimer <= 0) {
        var plan = s.cpuPlan;
        s.phase = 'aim';
        if (plan) shoot(s, plan.vx, plan.vy);
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
      id: 'stick-soccer',
      phase: s.phase,
      turn: s.turn,
      paused: s.paused,
      score: { player: s.score.player, cpu: s.score.cpu },
      shots: s.shots,
      turns: TURNS,
      stage: s.stage,
      stageName: s.stageName,
      stageTotal: STAGES.length,
      ball: { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy },
      obstacles: s.obstacles,
      goalSide: s.goalSide,
      cpuAim: (s.phase === 'cpuAim' && s.cpuPlan) ? { vx: s.cpuPlan.vx, vy: s.cpuPlan.vy } : null,
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
    MAX_PULL: MAX_PULL,
    PULL_POWER: PULL_POWER,
    OBSTACLES: OBSTACLES,
    PLAYER_LINES: PLAYER_LINES,
    CPU_LINES: CPU_LINES,
    FORMATION_LINES: PLAYER_LINES,
    FORMATION_SLOTS: FORMATION_SLOTS,
    STAGES: STAGES,
    PLAYER_R: PLAYER_R,
    DEFAULT_FORMATION: DEFAULT_FORMATION,
    obstaclesFor: obstaclesFor,
    TURNS: TURNS,
    WIN_SCORE: WIN_SCORE,
    createGame: createGame,
    shoot: shoot,
    shootDrag: shootDrag,
    autoShot: autoShot,
    chooseShot: chooseShot,
    simulateShot: function (s, vx, vy) { return simulateShot(s, vx, vy); },
    update: update,
    setPaused: setPaused,
    getState: getState,
    consumeEvents: consumeEvents
  };
});
