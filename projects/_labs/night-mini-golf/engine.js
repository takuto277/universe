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
  var E_BALL_R = BALL_R;
  var HOLE_R = 17;
  var FRICTION = 145;
  var SAND_FRICTION = 420;
  var STOP_SPEED = 9;
  var MAX_DRAG = 150;
  var POWER = 6.2;
  var MAX_SPEED = 1000;

  function wall(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
  function bumper(x, y, r) { return { x: x, y: y, r: r }; }
  function area(x, y, w, h, kind) { return { x: x, y: y, w: w, h: h, kind: kind }; }
  function rotor(x, y, r, arms, speed, phase) { return { x: x, y: y, r: r, arms: arms, speed: speed, phase: phase || 0, angle: phase || 0 }; }
  function hole(par, teeX, teeY, holeX, holeY, walls, bumpers, sand, water, rotors) {
    return {
      par: par, tee: { x: teeX, y: teeY }, hole: { x: holeX, y: holeY, r: HOLE_R },
      walls: walls || [], bumpers: bumpers || [], sand: sand || [], water: water || [], rotors: rotors || []
    };
  }

  var STAGES = [
    {
      id: 'garden', name: '月夜の庭', holes: [
        hole(2, 240, 660, 240, 155, [], [], [area(55, 500, 80, 80, 'sand')], [area(360, 360, 65, 75, 'water')], [rotor(380, 480, 30, 2, 1.3, 0)]),
        hole(2, 105, 650, 375, 165, [], [], [area(315, 500, 85, 75, 'sand')], [area(55, 310, 65, 80, 'water')]),
        hole(3, 375, 650, 105, 165, [], [], [area(60, 500, 80, 75, 'sand')], [area(330, 255, 65, 80, 'water')])
      ]
    },
    {
      id: 'green', name: '温室ホール', holes: [
        hole(3, 75, 660, 405, 155,
          [wall(205, 340, 150, 34)],
          [bumper(128, 430, 28)],
          [area(300, 520, 110, 70, 'sand')], [], [rotor(240, 410, 55, 2, 1.2, 0)]),
        hole(3, 405, 660, 75, 155,
          [wall(120, 380, 120, 32)],
          [bumper(350, 430, 30)],
          [], [area(205, 300, 90, 120, 'water')], [rotor(240, 390, 52, 3, -1.0, 0.4)]),
        hole(4, 240, 660, 240, 145,
          [wall(100, 300, 75, 30), wall(305, 300, 75, 30)],
          [bumper(240, 390, 32)],
          [area(55, 500, 90, 80, 'sand')], [], [rotor(240, 400, 50, 2, 1.5, 0.8)])
      ]
    },
    {
      id: 'roof', name: '屋上ナイト', holes: [
        hole(3, 105, 660, 375, 155,
          [wall(215, 300, 50, 150)],
          [bumper(335, 455, 28)],
          [], [area(70, 240, 100, 90, 'water')], [rotor(250, 390, 56, 3, -1.4, 0.2)]),
        hole(4, 375, 660, 105, 155,
          [wall(160, 380, 90, 28), wall(300, 260, 85, 28)],
          [bumper(85, 430, 26)],
          [area(300, 520, 110, 80, 'sand')], [], [rotor(235, 410, 50, 2, 1.7, 0.5)]),
        hole(5, 240, 660, 240, 140,
          [wall(80, 350, 95, 28), wall(300, 350, 100, 28), wall(200, 250, 80, 28)],
          [bumper(240, 450, 32), bumper(130, 260, 24)],
          [area(55, 510, 80, 65, 'sand')], [area(340, 250, 70, 90, 'water')], [rotor(240, 410, 58, 3, -1.8, 1.1)])
      ]
    }
  ];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function stageFor(i) { return STAGES[clamp(Number(i) || 0, 0, STAGES.length - 1)]; }
  function holeFor(h, i) { return h.holes[clamp(Number(i) || 0, 0, h.holes.length - 1)]; }

  function createGame(options) {
    options = options || {};
    var stageIndex = clamp(Number(options.stage) || 0, 0, STAGES.length - 1);
    var holeIndex = clamp(Number(options.hole) || 0, 0, STAGES[stageIndex].holes.length - 1);
    var stage = STAGES[stageIndex];
    var h = stage.holes[holeIndex];
    return {
      phase: 'aim', paused: false, stage: stageIndex, hole: holeIndex,
      stageName: stage.name, par: h.par, strokes: 0,
      ball: { x: h.tee.x, y: h.tee.y, vx: 0, vy: 0 },
      tee: { x: h.tee.x, y: h.tee.y }, target: { x: h.hole.x, y: h.hole.y, r: h.hole.r },
      walls: h.walls, bumpers: h.bumpers, sand: h.sand, water: h.water,
      rotors: h.rotors.map(function (r) { return { x: r.x, y: r.y, r: r.r, arms: r.arms, speed: r.speed, phase: r.phase, angle: r.angle }; }),
      events: []
    };
  }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 80) s.events.shift();
  }

  function shoot(s, vx, vy) {
    if (!s || s.phase !== 'aim' || s.paused) return false;
    var speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 40) return false;
    if (speed > MAX_SPEED) { vx = vx / speed * MAX_SPEED; vy = vy / speed * MAX_SPEED; }
    s.ball.vx = vx;
    s.ball.vy = vy;
    s.phase = 'moving';
    s.strokes++;
    event(s, 'shoot', { vx: vx, vy: vy });
    return true;
  }

  function shootDrag(s, dx, dy) {
    if (!s || s.phase !== 'aim' || s.paused) return false;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 8) return false;
    if (len > MAX_DRAG) { dx = dx / len * MAX_DRAG; dy = dy / len * MAX_DRAG; }
    return shoot(s, -dx * POWER, -dy * POWER);
  }

  function autoShot(s) {
    if (!s || s.phase !== 'aim' || s.paused) return false;
    var dx = s.target.x - s.ball.x;
    var dy = s.target.y - s.ball.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var speed = Math.min(MAX_SPEED, Math.sqrt(2 * FRICTION * dist) * 1.02 + 24);
    return shoot(s, dx / dist * speed, dy / dist * speed);
  }

  function insideRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function circleRectCollision(ball, r) {
    var nx = clamp(ball.x, r.x, r.x + r.w);
    var ny = clamp(ball.y, r.y, r.y + r.h);
    var dx = ball.x - nx, dy = ball.y - ny;
    var d2 = dx * dx + dy * dy;
    if (d2 >= BALL_R * BALL_R) return false;
    var d = Math.sqrt(d2);
    var ux, uy;
    if (d < 0.0001) {
      var left = Math.abs(ball.x - r.x);
      var right = Math.abs(r.x + r.w - ball.x);
      var top = Math.abs(ball.y - r.y);
      var bottom = Math.abs(r.y + r.h - ball.y);
      var m = Math.min(left, right, top, bottom);
      if (m === left) { ux = -1; uy = 0; }
      else if (m === right) { ux = 1; uy = 0; }
      else if (m === top) { ux = 0; uy = -1; }
      else { ux = 0; uy = 1; }
    } else {
      ux = dx / d; uy = dy / d;
    }
    var overlap = BALL_R - d;
    ball.x += ux * (overlap + 0.2);
    ball.y += uy * (overlap + 0.2);
    var vn = ball.vx * ux + ball.vy * uy;
    if (vn < 0) {
      ball.vx -= 1.72 * vn * ux;
      ball.vy -= 1.72 * vn * uy;
    }
    return true;
  }

  function resetBall(s) {
    s.ball.x = s.tee.x;
    s.ball.y = s.tee.y;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.phase = 'aim';
  }

  function updateRotors(s, dt) {
    for (var i = 0; i < s.rotors.length; i++) s.rotors[i].angle += s.rotors[i].speed * dt;
  }

  function hitRotors(s, b) {
    for (var r = 0; r < s.rotors.length; r++) {
      var rot = s.rotors[r];
      for (var a = 0; a < rot.arms; a++) {
        var ang = rot.angle + a * Math.PI * 2 / rot.arms;
        var px = rot.x + Math.cos(ang) * rot.r;
        var py = rot.y + Math.sin(ang) * rot.r;
        var dx = b.x - px, dy = b.y - py;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        var rr = E_BALL_R + 8;
        if (d < rr) {
          var nx = dx / d, ny = dy / d;
          b.x = px + nx * rr;
          b.y = py + ny * rr;
          var vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= 1.8 * vn * nx;
            b.vy -= 1.8 * vn * ny;
          }
          event(s, 'rotor', { x: px, y: py });
        }
      }
    }
  }

  function update(s, dt) {
    if (!s || s.paused) return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    updateRotors(s, dt);
    if (s.phase !== 'moving') return s;
    var b = s.ball;
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
      hitRotors(s, b);
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
      for (i = 0; i < s.water.length; i++) {
        if (insideRect(b.x, b.y, s.water[i])) {
          s.strokes++;
          event(s, 'water', { x: b.x, y: b.y });
          resetBall(s);
          return s;
        }
      }
      var holeDist = Math.sqrt((b.x - s.target.x) * (b.x - s.target.x) + (b.y - s.target.y) * (b.y - s.target.y));
      var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (holeDist < s.target.r - BALL_R * 0.2 && speed < 300) {
        b.x = s.target.x;
        b.y = s.target.y;
        b.vx = 0;
        b.vy = 0;
        s.phase = 'sunk';
        event(s, 'sunk', { strokes: s.strokes, par: s.par });
        return s;
      }
    }
    var sand = false;
    for (var j = 0; j < s.sand.length; j++) if (insideRect(b.x, b.y, s.sand[j])) { sand = true; break; }
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    var next = Math.max(0, sp - (sand ? SAND_FRICTION : FRICTION) * dt);
    if (sp > 0) { b.vx = b.vx / sp * next; b.vy = b.vy / sp * next; }
    if (next < STOP_SPEED) {
      b.vx = 0;
      b.vy = 0;
      s.phase = 'aim';
      event(s, 'stop', {});
    }
    return s;
  }

  function previewDrag(s, dx, dy) {
    if (!s || s.phase !== 'aim') return [];
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 8) return [];
    if (len > MAX_DRAG) { dx = dx / len * MAX_DRAG; dy = dy / len * MAX_DRAG; }
    var sim = {
      phase: 'moving', ball: { x: s.ball.x, y: s.ball.y, vx: -dx * POWER, vy: -dy * POWER },
      walls: s.walls, bumpers: s.bumpers, sand: s.sand, water: s.water,
      rotors: s.rotors.map(function (r) { return { x: r.x, y: r.y, r: r.r, arms: r.arms, speed: r.speed, phase: r.phase, angle: r.angle }; }),
      target: s.target, tee: s.tee, strokes: 1, events: []
    };
    var points = [{ x: sim.ball.x, y: sim.ball.y }];
    for (var i = 0; i < 42 && sim.phase === 'moving'; i++) {
      update(sim, 1 / 60);
      points.push({ x: sim.ball.x, y: sim.ball.y });
    }
    return points;
  }

  function getState(s) {
    if (!s) return null;
    return {
      id: 'night-mini-golf', phase: s.phase, paused: s.paused,
      stage: s.stage, stageTotal: STAGES.length, stageName: s.stageName,
      hole: s.hole, holeTotal: STAGES[s.stage].holes.length,
      par: s.par, strokes: s.strokes,
      ball: { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy },
      tee: s.tee, target: s.target, walls: s.walls, bumpers: s.bumpers,
      sand: s.sand, water: s.water, rotors: s.rotors
    };
  }

  function consumeEvents(s) { return s ? s.events.splice(0, s.events.length) : []; }
  function setPaused(s, paused) { if (s && s.phase !== 'sunk') s.paused = !!paused; }

  return {
    FIELD: FIELD, BALL_R: BALL_R, HOLE_R: HOLE_R, STAGES: STAGES,
    createGame: createGame, shootDrag: shootDrag, autoShot: autoShot,
    update: update, previewDrag: previewDrag, getState: getState, consumeEvents: consumeEvents, setPaused: setPaused
  };
});
