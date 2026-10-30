(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NightMiniGolfEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FIELD = { x: 24, y: 100, w: 432, h: 620 };
  FIELD.right = FIELD.x + FIELD.w;
  FIELD.bottom = FIELD.y + FIELD.h;
  var BALL_R = 7;
  var HOLE_R = 17;
  var FRICTION = 145;
  var SAND_FRICTION = 420;
  var STOP_SPEED = 9;
  var MAX_SPEED = 1000;
  var MIN_SPEED = 180;

  function wall(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
  function bumper(x, y, r) { return { x: x, y: y, r: r }; }
  function area(x, y, w, h, kind) { return { x: x, y: y, w: w, h: h, kind: kind }; }
  function hole(par, teeX, teeY, holeX, holeY, walls, bumpers, sand, water) {
    return { par: par, tee: { x: teeX, y: teeY }, hole: { x: holeX, y: holeY, r: HOLE_R }, walls: walls || [], bumpers: bumpers || [], sand: sand || [], water: water || [] };
  }

  var STAGES = [
    { id: 'garden', name: '月夜の庭', holes: [
      hole(2, 240, 650, 240, 150),
      hole(2, 110, 640, 370, 160),
      hole(3, 370, 640, 110, 160, [], [], [area(55, 500, 80, 80, 'sand')], [])
    ] },
    { id: 'green', name: '温室ホール', holes: [
      hole(3, 80, 650, 400, 155, [wall(205, 340, 150, 34)], [bumper(128, 430, 28)], [area(300, 520, 110, 70, 'sand')], []),
      hole(3, 400, 650, 80, 155, [wall(120, 380, 120, 32)], [bumper(350, 430, 30)], [], [area(205, 300, 90, 120, 'water')]),
      hole(4, 240, 650, 240, 145, [wall(100, 300, 75, 30), wall(305, 300, 75, 30)], [bumper(240, 390, 32)], [area(55, 500, 90, 80, 'sand')], [])
    ] },
    { id: 'roof', name: '屋上ナイト', holes: [
      hole(3, 105, 650, 375, 155, [wall(215, 300, 50, 150)], [bumper(335, 455, 28)], [], [area(70, 240, 100, 90, 'water')]),
      hole(4, 375, 650, 105, 155, [wall(160, 380, 90, 28), wall(300, 260, 85, 28)], [bumper(85, 430, 26)], [area(300, 520, 110, 80, 'sand')], []),
      hole(5, 240, 650, 240, 140, [wall(80, 350, 95, 28), wall(300, 350, 100, 28), wall(200, 250, 80, 28)], [bumper(240, 450, 32), bumper(130, 260, 24)], [area(55, 510, 80, 65, 'sand')], [area(340, 250, 70, 90, 'water')])
    ] }
  ];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function stageFor(i) { return STAGES[clamp(Number(i) || 0, 0, STAGES.length - 1)]; }
  function createBall(tee, side) {
    return { x: tee.x + side * 12, y: tee.y, vx: 0, vy: 0 };
  }
  function createGame(options) {
    options = options || {};
    var stageIndex = clamp(Number(options.stage) || 0, 0, STAGES.length - 1);
    var holeIndex = clamp(Number(options.hole) || 0, 0, STAGES[stageIndex].holes.length - 1);
    var h = STAGES[stageIndex].holes[holeIndex];
    var balls = { player: createBall(h.tee, -1), cpu: createBall(h.tee, 1) };
    var firstTurn = options.firstTurn === 'cpu' ? 'cpu' : 'player';
    return {
      phase: 'aim', paused: false, stage: stageIndex, hole: holeIndex,
      stageName: STAGES[stageIndex].name, par: h.par,
      turn: firstTurn, balls: balls,
      strokes: { player: 0, cpu: 0 },
      tee: h.tee, target: { x: h.hole.x, y: h.hole.y, r: h.hole.r },
      walls: h.walls, bumpers: h.bumpers, sand: h.sand, water: h.water,
      holeWinner: null, events: []
    };
  }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 80) s.events.shift();
  }

  function activeBall(s) { return s.balls[s.turn]; }

  function shootBall(s, dirX, dirY, power) {
    if (!s || s.phase !== 'aim' || s.paused) return false;
    var len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    var p = clamp(Number(power) || 0, 0.08, 1);
    var speed = MIN_SPEED + p * (MAX_SPEED - MIN_SPEED);
    var b = activeBall(s);
    b.vx = dirX / len * speed;
    b.vy = dirY / len * speed;
    s.strokes[s.turn]++;
    s.phase = 'moving';
    event(s, 'shoot', { turn: s.turn, power: p });
    return true;
  }

  function playerShoot(s, angle, power) {
    return shootBall(s, Math.sin(angle), Math.cos(angle), power);
  }

  function cpuShot(s) {
    if (!s || s.phase !== 'aim' || s.turn !== 'cpu') return false;
    var b = s.balls.cpu;
    var dx = s.target.x - b.x;
    var dy = s.target.y - b.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var speed = Math.min(MAX_SPEED, Math.sqrt(2 * FRICTION * dist) * 1.03 + 28);
    var power = clamp((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0.15, 1);
    return shootBall(s, dx / dist, dy / dist, power);
  }

  function autoShot(s) {
    if (!s || s.phase !== 'aim' || s.turn !== 'player') return false;
    var b = s.balls.player;
    var dx = s.target.x - b.x;
    var dy = s.target.y - b.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var speed = Math.min(MAX_SPEED, Math.sqrt(2 * FRICTION * dist) * 1.03 + 28);
    var power = clamp((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0.15, 1);
    return shootBall(s, dx / dist, dy / dist, power);
  }

  function insideRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function circleRectCollision(ball, r) {
    var nx = clamp(ball.x, r.x, r.x + r.w);
    var ny = clamp(ball.y, r.y, r.y + r.h);
    var dx = ball.x - nx, dy = ball.y - ny;
    var d2 = dx * dx + dy * dy;
    if (d2 >= BALL_R * BALL_R) return false;
    var d = Math.sqrt(d2), ux, uy;
    if (d < 0.0001) {
      var left = Math.abs(ball.x - r.x), right = Math.abs(r.x + r.w - ball.x);
      var top = Math.abs(ball.y - r.y), bottom = Math.abs(r.y + r.h - ball.y);
      var m = Math.min(left, right, top, bottom);
      if (m === left) { ux = -1; uy = 0; } else if (m === right) { ux = 1; uy = 0; } else if (m === top) { ux = 0; uy = -1; } else { ux = 0; uy = 1; }
    } else { ux = dx / d; uy = dy / d; }
    ball.x += ux * (BALL_R - d + 0.2);
    ball.y += uy * (BALL_R - d + 0.2);
    var vn = ball.vx * ux + ball.vy * uy;
    if (vn < 0) { ball.vx -= 1.72 * vn * ux; ball.vy -= 1.72 * vn * uy; }
    return true;
  }

  function resetBall(s, key) {
    var b = s.balls[key];
    b.x = s.tee.x + (key === 'player' ? -12 : 12);
    b.y = s.tee.y;
    b.vx = 0;
    b.vy = 0;
    s.phase = 'aim';
    s.turn = key;
    event(s, 'water', { turn: key });
  }

  function update(s, dt) {
    if (!s || s.paused || s.phase !== 'moving') return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    var key = s.turn;
    var b = s.balls[key];
    var steps = Math.max(1, Math.ceil(Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt / 5));
    var h = dt / steps;
    for (var st = 0; st < steps; st++) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.x - BALL_R < FIELD.x) { b.x = FIELD.x + BALL_R; b.vx = Math.abs(b.vx) * 0.72; }
      else if (b.x + BALL_R > FIELD.right) { b.x = FIELD.right - BALL_R; b.vx = -Math.abs(b.vx) * 0.72; }
      if (b.y - BALL_R < FIELD.y) { b.y = FIELD.y + BALL_R; b.vy = Math.abs(b.vy) * 0.72; }
      else if (b.y + BALL_R > FIELD.bottom) { b.y = FIELD.bottom - BALL_R; b.vy = -Math.abs(b.vy) * 0.72; }
      for (var i = 0; i < s.walls.length; i++) circleRectCollision(b, s.walls[i]);
      for (i = 0; i < s.bumpers.length; i++) {
        var bp = s.bumpers[i];
        var dx = b.x - bp.x, dy = b.y - bp.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        var rr = bp.r + BALL_R;
        if (d < rr) {
          var nx = dx / d, ny = dy / d;
          b.x = bp.x + nx * rr;
          b.y = bp.y + ny * rr;
          var vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.8 * vn * nx; b.vy -= 1.8 * vn * ny; }
          event(s, 'bumper', { x: bp.x, y: bp.y });
        }
      }
      for (i = 0; i < s.water.length; i++) if (insideRect(b.x, b.y, s.water[i])) {
        resetBall(s, key);
        s.strokes[key]++;
        return s;
      }
      var hd = Math.sqrt((b.x - s.target.x) * (b.x - s.target.x) + (b.y - s.target.y) * (b.y - s.target.y));
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (hd < s.target.r - BALL_R * 0.2 && sp < 300) {
        b.x = s.target.x; b.y = s.target.y; b.vx = 0; b.vy = 0;
        s.phase = 'holeover';
        s.holeWinner = key;
        event(s, 'holehole', { winner: key, strokes: s.strokes[key] });
        return s;
      }
    }
    var sand = false;
    for (var j = 0; j < s.sand.length; j++) if (insideRect(b.x, b.y, s.sand[j])) { sand = true; break; }
    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    var next = Math.max(0, speed - (sand ? SAND_FRICTION : FRICTION) * dt);
    if (speed > 0) { b.vx = b.vx / speed * next; b.vy = b.vy / speed * next; }
    if (next < STOP_SPEED) {
      b.vx = 0; b.vy = 0;
      s.turn = key === 'player' ? 'cpu' : 'player';
      s.phase = 'aim';
      event(s, 'turn', { turn: s.turn });
    }
    return s;
  }

  function getState(s) {
    if (!s) return null;
    return {
      id: 'night-mini-golf', phase: s.phase, paused: s.paused,
      stage: s.stage, stageTotal: STAGES.length, stageName: s.stageName,
      hole: s.hole, holeTotal: STAGES[s.stage].holes.length,
      par: s.par, turn: s.turn, strokes: s.strokes, holeWinner: s.holeWinner,
      balls: s.balls, tee: s.tee, target: s.target, walls: s.walls,
      bumpers: s.bumpers, sand: s.sand, water: s.water, over: false
    };
  }

  function setPaused(s, paused) { if (s && s.phase !== 'holeover') s.paused = !!paused; }
  function consumeEvents(s) { return s ? s.events.splice(0, s.events.length) : []; }

  return {
    FIELD: FIELD, BALL_R: BALL_R, HOLE_R: HOLE_R, STAGES: STAGES,
    createGame: createGame, playerShoot: playerShoot, shootBall: shootBall,
    cpuShot: cpuShot, autoShot: autoShot, update: update,
    getState: getState, setPaused: setPaused, consumeEvents: consumeEvents
  };
});
