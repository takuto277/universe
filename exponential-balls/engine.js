/* engine.js : BLOOM の時間・小節・倍々スケジュールと FRAME モード
 *
 * AUTO : 120 BPM / 4/4。1小節ごとに 1 → 2 → ... → 2048。12小節でリセット。
 * FRAME: ボールが上部のラインに触れると2個に増え、ラインと逆の下向き180度へ飛ぶ。
 *        ボールは常に360度のどれかの方向へ動き、壁で跳ね返る。子ボールの色はだんだん濃くなる。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ExponentialEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BPM = 120;
  var BEATS_PER_BAR = 4;
  var STEPS_PER_BEAT = 4;
  var STEPS_PER_BAR = BEATS_PER_BAR * STEPS_PER_BEAT;
  var BARS_PER_CYCLE = 12;
  var STEP_SECONDS = 60 / BPM / STEPS_PER_BEAT;
  var BEAT_SECONDS = STEP_SECONDS * STEPS_PER_BEAT;
  var BAR_SECONDS = BEAT_SECONDS * BEATS_PER_BAR;
  var CYCLE_SECONDS = BAR_SECONDS * BARS_PER_CYCLE;
  var MAX_COUNT = Math.pow(2, BARS_PER_CYCLE - 1);

  var FIELD = { w: 390, h: 844 };
  var LINE = { x: 55, y: 220, w: 280, h: 4 };
  var FRAME_MAX = MAX_COUNT;
  var TAU = Math.PI * 2;

  var RACE = {
    total: 20,
    ballRadius: 7,
    gravity: 360,
    damping: 0.9995,
    maxSpeed: 560,
    wallBounce: 0.9,
    arena: { left: 38, right: 352, top: 180, bottom: 812 },
    voidY: 800,
    startY: 215,
    suddenDeath: 38,
    riseSpeed: 22,
    maxTime: 70,
    pegs: [
      { x: 95, y: 300 }, { x: 195, y: 300 }, { x: 295, y: 300 },
      { x: 70, y: 370 }, { x: 145, y: 382 }, { x: 245, y: 382 }, { x: 320, y: 370 },
      { x: 100, y: 450 }, { x: 195, y: 462 }, { x: 290, y: 450 },
      { x: 70, y: 532 }, { x: 145, y: 542 }, { x: 245, y: 542 }, { x: 320, y: 532 },
      { x: 100, y: 612 }, { x: 290, y: 612 }, { x: 195, y: 682 }
    ],
    bumpers: [
      { x: 85, y: 695, baseX: 85, amp: 22, speed: 1.8, phase: 0, r: 15 },
      { x: 305, y: 695, baseX: 305, amp: 30, speed: 2.2, phase: 1.7, r: 15 },
      { x: 195, y: 760, baseX: 195, amp: 48, speed: 1.4, phase: 2.4, r: 15 }
    ],
    spinners: [
      { x: 195, y: 410, len: 62, half: 4, angle: 0, speed: 4.2 },
      { x: 100, y: 590, len: 48, half: 4, angle: 1.2, speed: -5.0 },
      { x: 285, y: 520, len: 48, half: 4, angle: 2.4, speed: 4.6 },
      { x: 60, y: 470, len: 36, half: 4, angle: 0.6, speed: -3.8 }
    ],
    wells: [
      { x: 118, y: 350, r: 58, strength: 150 },
      { x: 278, y: 640, r: 54, strength: 190 }
    ],
    boosters: [
      { x: 72, y: 420, angle: 0.3, power: 240, r: 26 },
      { x: 318, y: 560, angle: 2.85, power: 260, r: 26 },
      { x: 198, y: 315, angle: 1.57, power: 200, r: 24 }
    ],
    portals: [
      { x: 78, y: 520, r: 14, target: 1, hue: 190 },
      { x: 312, y: 260, r: 14, target: 0, hue: 40 }
    ],
    conveyor: { x: 225, y: 575, w: 110, h: 8, vx: -75 }
  };

  var RACE3D = {
    total: 20,
    ballRadius: 6.5,
    gravity: 180,
    damping: 0.9995,
    maxSpeed: 520,
    bounds: { x: 165, y: 125, zMin: 0, zMax: 2460 },
    startZ: 2190,
    voidZ: 0,
    suddenDeath: 55,
    riseSpeed: 20,
    maxTime: 90,
    pegs: [
      { x: -110, y: -80, z: 2100 }, { x: 0, y: -90, z: 2070 }, { x: 110, y: -80, z: 2100 },
      { x: -70, y: 20, z: 1950 }, { x: 70, y: 20, z: 1950 }, { x: 0, y: 100, z: 1920 },
      { x: -130, y: -40, z: 1780 }, { x: 0, y: -10, z: 1760 }, { x: 130, y: -40, z: 1780 },
      { x: -80, y: 80, z: 1580 }, { x: 80, y: 80, z: 1580 }, { x: 0, y: -100, z: 1550 },
      { x: -120, y: 30, z: 1320 }, { x: 0, y: 30, z: 1300 }, { x: 120, y: 30, z: 1320 },
      { x: -60, y: -70, z: 1080 }, { x: 60, y: -70, z: 1080 }, { x: 0, y: 80, z: 1050 },
      { x: -110, y: 40, z: 840 }, { x: 0, y: -20, z: 820 }, { x: 110, y: 40, z: 840 },
      { x: -70, y: -80, z: 600 }, { x: 70, y: -80, z: 600 }, { x: 0, y: 70, z: 570 },
      { x: -100, y: 20, z: 360 }, { x: 100, y: 20, z: 360 }, { x: 0, y: -50, z: 300 }
    ],
    bumpers: [
      { x: -90, y: -40, z: 2000, baseX: -90, amp: 30, speed: 1.8, phase: 0, r: 16 },
      { x: 90, y: 40, z: 1660, baseX: 90, amp: 34, speed: 2.2, phase: 1.7, r: 16 },
      { x: 0, y: 0, z: 1380, baseX: 0, amp: 54, speed: 1.4, phase: 2.4, r: 18 },
      { x: -90, y: 50, z: 920, baseX: -90, amp: 36, speed: 2.0, phase: 0.7, r: 16 },
      { x: 80, y: -40, z: 480, baseX: 80, amp: 44, speed: 2.4, phase: 2.9, r: 18 }
    ],
    spinners: [
      { x: 0, y: 0, z: 2180, len: 70, half: 4, angle: 0, speed: 4.0 },
      { x: -40, y: 40, z: 1870, len: 55, half: 4, angle: 1.1, speed: -4.6 },
      { x: 40, y: -40, z: 1500, len: 58, half: 4, angle: 2.2, speed: 4.2 },
      { x: 0, y: 0, z: 1210, len: 62, half: 4, angle: 0.7, speed: -4.0 },
      { x: -60, y: 20, z: 860, len: 48, half: 4, angle: 2.7, speed: 4.8 },
      { x: 60, y: -20, z: 430, len: 50, half: 4, angle: 1.5, speed: -4.4 }
    ],
    portals: [
      { x: -120, y: 0, z: 2020, r: 14, target: 1, hue: 195 },
      { x: 120, y: 0, z: 1480, r: 14, target: 0, hue: 40 },
      { x: 0, y: -100, z: 1120, r: 14, target: 3, hue: 280 },
      { x: 0, y: 100, z: 500, r: 14, target: 2, hue: 330 }
    ],
    wells: [
      { x: -80, y: -60, z: 1740, r: 60, strength: 140 },
      { x: 80, y: 60, z: 1280, r: 60, strength: 170 },
      { x: -70, y: 50, z: 760, r: 55, strength: 160 },
      { x: 80, y: -50, z: 340, r: 55, strength: 180 }
    ],
    boosters: [
      { x: 0, y: -100, z: 2120, r: 24, vx: 0, vy: 80, vz: -120, power: 240 },
      { x: -130, y: 80, z: 1420, r: 24, vx: 140, vy: -40, vz: -60, power: 220 },
      { x: 130, y: -80, z: 700, r: 24, vx: -120, vy: 60, vz: -80, power: 230 }
    ],
    plates: [
      { x: -60, y: 0, z: 2040, r: 62, bounce: 0.58 },
      { x: 70, y: -30, z: 1810, r: 58, bounce: 0.62 },
      { x: -30, y: 60, z: 1590, r: 66, bounce: 0.55 },
      { x: 60, y: 40, z: 1350, r: 60, bounce: 0.6 },
      { x: -70, y: -40, z: 1140, r: 64, bounce: 0.56 },
      { x: 30, y: 30, z: 940, r: 62, bounce: 0.62 },
      { x: -50, y: -30, z: 720, r: 60, bounce: 0.58 },
      { x: 60, y: 30, z: 510, r: 64, bounce: 0.6 },
      { x: 0, y: 0, z: 260, r: 68, bounce: 0.56 }
    ],
    slows: [
      { x: -40, y: 30, z: 1960, r: 92 },
      { x: 50, y: -40, z: 1710, r: 96 },
      { x: -60, y: -20, z: 1450, r: 90 },
      { x: 60, y: 30, z: 1180, r: 94 },
      { x: -40, y: 40, z: 900, r: 92 },
      { x: 50, y: -30, z: 640, r: 96 },
      { x: 0, y: 0, z: 380, r: 100 }
    ],
    fans: [
      { x: 40, y: 30, z: 1880, r: 58, power: 120 },
      { x: -50, y: -30, z: 1620, r: 62, power: 130 },
      { x: 50, y: -40, z: 1320, r: 58, power: 120 },
      { x: -40, y: 40, z: 1050, r: 62, power: 130 },
      { x: 40, y: 30, z: 780, r: 58, power: 120 },
      { x: -30, y: -30, z: 540, r: 60, power: 130 }
    ]
  };

  var ROOTS = [
    { name: 'C minor', freq: 130.81, hue: 188 },
    { name: 'E♭ minor', freq: 155.56, hue: 268 },
    { name: 'F minor', freq: 174.61, hue: 330 },
    { name: 'G minor', freq: 196.00, hue: 44 }
  ];

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function createGame(options) {
    options = options || {};
    var listeners = [];
    var state = {
      phase: 'start',
      mode: 'auto',
      time: 0,
      cycle: 0,
      bar: 0,
      beat: 0,
      stepInBar: 0,
      count: 1,
      maxCount: 1,
      split: false,
      reset: false,
      peak: false,
      captures: 0,
      frameReset: false,
      captureEvents: [],
      balls: [],
      race: null,
      race3d: null,
      startedAt: 0
    };

    function emit() {
      var snap = getState();
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](snap); } catch (e) { /* UIの描画失敗で進行を止めない */ }
      }
    }

    function onChange(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    function clock(t) {
      state.time = t;
      state.cycle = Math.floor(t / CYCLE_SECONDS);
      var cycleTime = t - state.cycle * CYCLE_SECONDS;
      state.bar = Math.min(BARS_PER_CYCLE - 1, Math.floor(cycleTime / BAR_SECONDS));
      var barTime = cycleTime - state.bar * BAR_SECONDS;
      state.beat = Math.min(BEATS_PER_BAR - 1, Math.floor(barTime / BEAT_SECONDS));
      state.stepInBar = Math.min(STEPS_PER_BAR - 1, Math.floor(barTime / STEP_SECONDS));
      state.peak = state.bar === BARS_PER_CYCLE - 1;
    }

    function hueNow() {
      return ROOTS[state.cycle % ROOTS.length].hue;
    }

    function makeBall(x, y, speedMin, speedMax, immune, depth, angle) {
      var a = angle == null ? Math.random() * TAU : angle;
      var speed = rnd(speedMin, speedMax);
      return {
        x: x,
        y: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        hue: (hueNow() + rnd(-22, 22) + 360) % 360,
        depth: depth || 0,
        immune: immune || 0
      };
    }

    function initialBall() {
      var b = makeBall(FIELD.w / 2, LINE.y + 30, 110, 170, 0, 0);
      var speed = Math.hypot(b.vx, b.vy);
      var angle = -Math.PI / 2 + rnd(-0.55, 0.55);
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
      return b;
    }

    function start(mode) {
      var chosen = mode === 'frame' ? 'frame' : mode === 'race' ? 'race' : mode === 'race3d' ? 'race3d' : 'auto';
      state.mode = chosen;
      state.phase = 'playing';
      state.time = 0;
      state.cycle = 0;
      state.bar = 0;
      state.beat = 0;
      state.stepInBar = 0;
      state.count = 1;
      state.maxCount = 1;
      state.split = false;
      state.reset = false;
      state.peak = false;
      state.captures = 0;
      state.frameReset = false;
      state.captureEvents = [];
      state.balls = chosen === 'frame' ? [initialBall()] : [];
      state.race = chosen === 'race' ? createRaceState() : null;
      state.race3d = chosen === 'race3d' ? createRace3DState() : null;
      state.startedAt = Date.now();
      emit();
      return true;
    }

    function resetState() {
      state.phase = 'start';
      state.time = 0;
      state.cycle = 0;
      state.bar = 0;
      state.beat = 0;
      state.stepInBar = 0;
      state.count = 1;
      state.maxCount = 1;
      state.split = false;
      state.reset = false;
      state.peak = false;
      state.captures = 0;
      state.frameReset = false;
      state.captureEvents = [];
      state.balls = [];
      state.race = null;
      state.race3d = null;
      emit();
    }

    function update(t) {
      if (state.phase !== 'playing' || state.mode !== 'auto') return getState();
      if (!isFinite(t) || t < 0) t = 0;
      if (t < state.time) t = state.time;
      var prevCycle = state.cycle;
      var prevBar = state.bar;
      clock(t);
      var count = Math.pow(2, state.bar);
      state.count = count;
      state.maxCount = Math.max(state.maxCount, count);
      state.reset = state.cycle !== prevCycle;
      state.split = !state.reset && state.bar !== prevBar && state.bar > 0;
      state.balls = [];
      return getState();
    }

    function crossedLine(ball, prevY) {
      if (ball.x < LINE.x || ball.x > LINE.x + LINE.w) return false;
      var before = prevY - LINE.y;
      var after = ball.y - LINE.y;
      return (before <= 0 && after >= 0) || (before >= 0 && after <= 0);
    }

    function spawnFromLine(parent) {
      var base = rnd(Math.PI * 0.18, Math.PI * 0.82);
      var pair = [];
      for (var i = 0; i < 2; i++) {
        var angle = base + (i === 0 ? -1 : 1) * rnd(0.05, 0.22);
        angle = Math.max(Math.PI * 0.1, Math.min(Math.PI * 0.9, angle));
        var speed = rnd(90, 170);
        var b = makeBall(
          parent.x + rnd(-8, 8),
          LINE.y + rnd(14, 24),
          speed, speed, 0.35, (parent.depth || 0) + 1, angle
        );
        b.hue = (parent.hue + rnd(-6, 6) + 360) % 360;
        pair.push(b);
      }
      return pair;
    }

    function updateFrame(t, dt) {
      if (state.phase !== 'playing' || state.mode !== 'frame') return getState();
      if (!isFinite(t) || t < 0) t = 0;
      if (t < state.time) t = state.time;
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      clock(t);
      state.split = false;
      state.reset = false;
      state.frameReset = false;
      state.captureEvents = [];

      var kept = [];
      var captured = [];
      for (var i = 0; i < state.balls.length; i++) {
        var b = state.balls[i];
        var prevY = b.y;
        b.immune = Math.max(0, b.immune - dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) || 1; }
        if (b.x > FIELD.w) { b.x = FIELD.w; b.vx = -Math.abs(b.vx) || -1; }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) || 1; }
        if (b.y > FIELD.h) { b.y = FIELD.h; b.vy = -Math.abs(b.vy) || -1; }
        if (Math.abs(b.vx) + Math.abs(b.vy) < 0.01) {
          var fresh = makeBall(b.x, b.y, 70, 130, 0, b.depth);
          b.vx = fresh.vx;
          b.vy = fresh.vy;
        }
        if (crossedLine(b, prevY) && b.immune <= 0) {
          captured.push(b);
        } else {
          kept.push(b);
        }
      }

      state.balls = kept;
      for (var c = 0; c < captured.length; c++) {
        var parent = captured[c];
        state.captures += 1;
        state.captureEvents.push({ x: parent.x, y: LINE.y, hue: parent.hue, time: t, reset: false });
        var pair = spawnFromLine(parent);
        state.balls.push(pair[0]);
        state.balls.push(pair[1]);
      }

      state.count = state.balls.length;
      state.maxCount = Math.max(state.maxCount, state.count);

      if (state.count > FRAME_MAX) {
        state.balls = [initialBall()];
        state.count = 1;
        state.frameReset = true;
        state.captureEvents.push({
          x: LINE.x + LINE.w / 2,
          y: LINE.y,
          hue: hueNow(),
          time: t,
          reset: true
        });
      }

      return getState();
    }

    function createRaceState() {
      var balls = [];
      for (var i = 0; i < RACE.total; i++) {
        var col = i % 5;
        var row = Math.floor(i / 5);
        balls.push({
          id: i + 1,
          hue: (i * 18) % 360,
          x: RACE.arena.left + 50 + col * 50 + rnd(-8, 8),
          y: RACE.startY + row * 12 + rnd(-3, 3),
          vx: rnd(-90, 90),
          vy: rnd(0, 60),
          r: RACE.ballRadius,
          alive: true,
          portalCd: 0,
          portalUses: 0,
          boostCd: 0
        });
      }
      return {
        alive: RACE.total,
        balls: balls,
        eliminated: 0,
        voidY: RACE.voidY,
        events: [],
        result: null,
        bumpers: RACE.bumpers.map(function (b) {
          return { x: b.x, baseX: b.baseX, amp: b.amp, speed: b.speed, phase: b.phase, r: b.r, y: b.y };
        }),
        spinners: RACE.spinners.map(function (s) {
          return { x: s.x, y: s.y, len: s.len, half: s.half, angle: s.angle, speed: s.speed };
        }),
        portals: RACE.portals.map(function (p) {
          return { x: p.x, y: p.y, r: p.r, target: p.target, hue: p.hue };
        })
      };
    }

    function finishRace(t, r, winner) {
      r.alive = 1;
      r.result = {
        winnerId: winner.id,
        winnerHue: winner.hue,
        time: Math.min(t, RACE.maxTime),
        total: RACE.total,
        eliminated: RACE.total - 1,
        alive: 1
      };
      for (var i = 0; i < r.balls.length; i++) {
        if (r.balls[i] !== winner) r.balls[i].alive = false;
      }
      winner.alive = true;
      r.events.push({ type: 'winner', x: winner.x, y: winner.y, hue: winner.hue, id: winner.id });
      state.phase = 'finished';
      state.time = Math.min(t, RACE.maxTime);
    }

    function bounceCircle(b, cx, cy, cr, rest, boost) {
      var dx = b.x - cx;
      var dy = b.y - cy;
      var d = Math.hypot(dx, dy);
      var min = b.r + cr;
      if (d >= min) return false;
      var nx = dx / (d || 1);
      var ny = dy / (d || 1);
      b.x = cx + nx * min;
      b.y = cy + ny * min;
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + rest) * vn * nx;
        b.vy -= (1 + rest) * vn * ny;
      }
      if (boost) {
        b.vx += nx * boost;
        b.vy += ny * boost;
      }
      return true;
    }

    function collideSpinner(b, s) {
      var ux = Math.cos(s.angle);
      var uy = Math.sin(s.angle);
      var dx = b.x - s.x;
      var dy = b.y - s.y;
      var along = Math.max(-s.len, Math.min(s.len, dx * ux + dy * uy));
      var px = s.x + ux * along;
      var py = s.y + uy * along;
      var nx = b.x - px;
      var ny = b.y - py;
      var d = Math.hypot(nx, ny);
      var min = b.r + s.half;
      if (d >= min) return false;
      nx = nx / (d || 1);
      ny = ny / (d || 1);
      b.x = px + nx * min;
      b.y = py + ny * min;
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= 1.65 * vn * nx;
        b.vy -= 1.65 * vn * ny;
      }
      var tangent = s.speed * along * 0.6;
      b.vx += -uy * tangent;
      b.vy += ux * tangent;
      return true;
    }

    function updateRace(t, dt) {
      if (state.phase !== 'playing' || state.mode !== 'race' || !state.race) return getState();
      if (!isFinite(t) || t < 0) t = 0;
      if (t < state.time) t = state.time;
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      clock(t);
      var r = state.race;
      r.events = [];
      if (t > RACE.suddenDeath) {
        r.voidY = Math.max(320, RACE.voidY - (t - RACE.suddenDeath) * RACE.riseSpeed);
      }
      var si;
      for (si = 0; si < r.spinners.length; si++) {
        r.spinners[si].angle += r.spinners[si].speed * dt;
      }
      for (var mb = 0; mb < r.bumpers.length; mb++) {
        r.bumpers[mb].x = r.bumpers[mb].baseX + Math.sin(t * r.bumpers[mb].speed + r.bumpers[mb].phase) * r.bumpers[mb].amp;
      }

      var balls = r.balls;
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        if (!b.alive) continue;
        b.portalCd = Math.max(0, b.portalCd - dt);
        b.boostCd = Math.max(0, b.boostCd - dt);
        b.vy += RACE.gravity * dt;
        b.vx *= RACE.damping;
        b.vy *= RACE.damping;
        var speed = Math.hypot(b.vx, b.vy);
        if (speed > RACE.maxSpeed) {
          b.vx = b.vx / speed * RACE.maxSpeed;
          b.vy = b.vy / speed * RACE.maxSpeed;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.x - b.r < RACE.arena.left) { b.x = RACE.arena.left + b.r; b.vx = Math.abs(b.vx) * RACE.wallBounce; }
        if (b.x + b.r > RACE.arena.right) { b.x = RACE.arena.right - b.r; b.vx = -Math.abs(b.vx) * RACE.wallBounce; }
        if (b.y - b.r < RACE.arena.top) { b.y = RACE.arena.top + b.r; b.vy = Math.abs(b.vy) * RACE.wallBounce; }

        for (var p = 0; p < RACE.pegs.length; p++) {
          bounceCircle(b, RACE.pegs[p].x, RACE.pegs[p].y, 5, 0.72, 0);
        }
        for (var bu = 0; bu < r.bumpers.length; bu++) {
          if (bounceCircle(b, r.bumpers[bu].x, r.bumpers[bu].y, r.bumpers[bu].r, 1.0, 150)) {
            r.events.push({ type: 'bumper', x: b.x, y: b.y, hue: b.hue });
          }
        }
        for (si = 0; si < r.spinners.length; si++) {
          if (collideSpinner(b, r.spinners[si])) {
            r.events.push({ type: 'spinner', x: b.x, y: b.y, hue: b.hue });
          }
        }
        for (var wl = 0; wl < RACE.wells.length; wl++) {
          var well = RACE.wells[wl];
          var wdx = well.x - b.x;
          var wdy = well.y - b.y;
          var wd = Math.hypot(wdx, wdy);
          if (wd < well.r && wd > 0) {
            var pull = well.strength * (1 - wd / well.r);
            b.vx += (wdx / wd) * pull * dt;
            b.vy += (wdy / wd) * pull * dt;
            b.vx += (-wdy / wd) * pull * 0.45 * dt;
            b.vy += (wdx / wd) * pull * 0.45 * dt;
          }
        }
        if (b.boostCd <= 0) {
          for (var bo = 0; bo < RACE.boosters.length; bo++) {
            var boost = RACE.boosters[bo];
            var bdx = b.x - boost.x;
            var bdy = b.y - boost.y;
            if (bdx * bdx + bdy * bdy < Math.pow(boost.r + b.r, 2)) {
              b.vx += Math.cos(boost.angle) * boost.power;
              b.vy += Math.sin(boost.angle) * boost.power;
              b.boostCd = 0.32;
              r.events.push({ type: 'boost', x: b.x, y: b.y, hue: b.hue });
              break;
            }
          }
        }

        var conv = RACE.conveyor;
        if (b.x > conv.x && b.x < conv.x + conv.w && b.y + b.r > conv.y && b.y + b.r < conv.y + 16 && b.vy > 0) {
          b.y = conv.y - b.r;
          b.vy = -Math.abs(b.vy) * 0.28 - 25;
          b.vx += conv.vx * 0.6;
        }

        for (var po = 0; po < r.portals.length; po++) {
          var portal = r.portals[po];
          if (b.portalCd > 0 || b.portalUses >= 2) continue;
          var pdx = b.x - portal.x;
          var pdy = b.y - portal.y;
          if (pdx * pdx + pdy * pdy < Math.pow(b.r + portal.r, 2)) {
            var target = r.portals[portal.target];
            b.x = target.x;
            b.y = target.y - 20;
            b.vx *= 0.7;
            b.vy = -120;
            b.portalCd = 0.7;
            b.portalUses += 1;
            r.events.push({ type: 'portal', x: target.x, y: target.y, hue: portal.hue });
            break;
          }
        }
      }

      for (var a = 0; a < balls.length; a++) {
        if (!balls[a].alive) continue;
        for (var c = a + 1; c < balls.length; c++) {
          if (!balls[c].alive) continue;
          var ba = balls[a];
          var bb = balls[c];
          var ddx = bb.x - ba.x;
          var ddy = bb.y - ba.y;
          var dist = Math.hypot(ddx, ddy);
          var minD = ba.r + bb.r;
          if (dist >= minD || dist <= 0) continue;
          var nx = ddx / dist;
          var ny = ddy / dist;
          var overlap = (minD - dist) / 2;
          ba.x -= nx * overlap;
          ba.y -= ny * overlap;
          bb.x += nx * overlap;
          bb.y += ny * overlap;
          var rvx = bb.vx - ba.vx;
          var rvy = bb.vy - ba.vy;
          var vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            var imp = -(1 + 0.8) * vn / 2;
            ba.vx -= imp * nx;
            ba.vy -= imp * ny;
            bb.vx += imp * nx;
            bb.vy += imp * ny;
          }
        }
      }

      var below = [];
      for (var e = 0; e < balls.length; e++) {
        if (balls[e].alive && balls[e].y - balls[e].r > r.voidY) below.push(balls[e]);
      }
      below.sort(function (a, b) { return b.y - a.y; });
      for (var k = 0; k < below.length; k++) {
        if (r.alive <= 1) break;
        var gone = below[k];
        gone.alive = false;
        r.alive -= 1;
        r.eliminated += 1;
        r.events.push({ type: 'eliminate', x: gone.x, y: gone.y, hue: gone.hue, id: gone.id });
      }

      if (r.alive <= 1 || t >= RACE.maxTime) {
        var winner = null;
        for (var w = 0; w < balls.length; w++) {
          if (balls[w].alive && (!winner || balls[w].y < winner.y)) winner = balls[w];
        }
        if (winner) finishRace(t, r, winner);
        return getState();
      }
      return getState();
    }

    function raceSnapshot() {
      var r = state.race;
      if (!r) return null;
      return {
        elapsed: state.time,
        alive: r.alive,
        total: RACE.total,
        eliminated: RACE.total - r.alive,
        ballRadius: RACE.ballRadius,
        voidY: r.voidY,
        arena: RACE.arena,
        balls: r.balls.filter(function (b) { return b.alive; }).map(function (b) {
          return { id: b.id, hue: b.hue, x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r };
        }),
        pegs: RACE.pegs,
        bumpers: r.bumpers.map(function (b) {
          return { x: b.x, y: b.y, r: b.r };
        }),
        spinners: r.spinners.map(function (s) {
          return { x: s.x, y: s.y, len: s.len, half: s.half, angle: s.angle };
        }),
        wells: RACE.wells,
        boosters: RACE.boosters,
        portals: r.portals.map(function (p) {
          return { x: p.x, y: p.y, r: p.r, hue: p.hue };
        }),
        conveyor: RACE.conveyor,
        result: r.result,
        events: r.events.slice()
      };
    }

    function createRace3DState() {
      var balls = [];
      for (var i = 0; i < RACE3D.total; i++) {
        balls.push({
          id: i + 1,
          hue: (i * 18) % 360,
          x: rnd(-130, 130),
          y: rnd(-100, 100),
          z: RACE3D.startZ + rnd(-10, 20),
          vx: rnd(-70, 70),
          vy: rnd(-50, 50),
          vz: rnd(-30, 0),
          r: RACE3D.ballRadius,
          alive: true,
          portalCd: 0,
          portalUses: 0,
          boostCd: 0
        });
      }
      return {
        alive: RACE3D.total,
        balls: balls,
        eliminated: 0,
        voidZ: RACE3D.voidZ,
        events: [],
        result: null,
        bumpers: RACE3D.bumpers.map(function (b) {
          return { x: b.x, y: b.y, z: b.z, baseX: b.baseX, amp: b.amp, speed: b.speed, phase: b.phase, r: b.r };
        }),
        spinners: RACE3D.spinners.map(function (s) {
          return { x: s.x, y: s.y, z: s.z, len: s.len, half: s.half, angle: s.angle, speed: s.speed };
        }),
        portals: RACE3D.portals.map(function (p) {
          return { x: p.x, y: p.y, z: p.z, r: p.r, target: p.target, hue: p.hue };
        })
      };
    }

    function finishRace3D(t, r, winner) {
      r.alive = 1;
      r.result = {
        winnerId: winner.id,
        winnerHue: winner.hue,
        time: Math.min(t, RACE3D.maxTime),
        total: RACE3D.total,
        eliminated: RACE3D.total - 1,
        alive: 1
      };
      for (var i = 0; i < r.balls.length; i++) {
        if (r.balls[i] !== winner) r.balls[i].alive = false;
      }
      winner.alive = true;
      r.events.push({ type: 'winner', x: winner.x, y: winner.y, z: winner.z, hue: winner.hue, id: winner.id });
      state.phase = 'finished';
      state.time = Math.min(t, RACE3D.maxTime);
    }

    function bounceSphere3D(b, cx, cy, cz, cr, rest, boost) {
      var dx = b.x - cx;
      var dy = b.y - cy;
      var dz = b.z - cz;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var min = b.r + cr;
      if (d >= min) return false;
      var nx = dx / (d || 1);
      var ny = dy / (d || 1);
      var nz = dz / (d || 1);
      b.x = cx + nx * min;
      b.y = cy + ny * min;
      b.z = cz + nz * min;
      var vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        b.vx -= (1 + rest) * vn * nx;
        b.vy -= (1 + rest) * vn * ny;
        b.vz -= (1 + rest) * vn * nz;
      }
      if (boost) {
        b.vx += nx * boost;
        b.vy += ny * boost;
        b.vz += nz * boost;
      }
      return true;
    }

    function collideSpinner3D(b, s) {
      var ux = Math.cos(s.angle);
      var uy = Math.sin(s.angle);
      var dx = b.x - s.x;
      var dy = b.y - s.y;
      var along = Math.max(-s.len, Math.min(s.len, dx * ux + dy * uy));
      var px = s.x + ux * along;
      var py = s.y + uy * along;
      var nx = b.x - px;
      var ny = b.y - py;
      var nz = b.z - s.z;
      var d = Math.sqrt(nx * nx + ny * ny + nz * nz);
      var min = b.r + s.half;
      if (d >= min) return false;
      nx = nx / (d || 1);
      ny = ny / (d || 1);
      nz = nz / (d || 1);
      b.x = px + nx * min;
      b.y = py + ny * min;
      b.z = s.z + nz * min;
      var vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        b.vx -= 1.65 * vn * nx;
        b.vy -= 1.65 * vn * ny;
        b.vz -= 1.65 * vn * nz;
      }
      var tangent = s.speed * along * 0.6;
      b.vx += -uy * tangent;
      b.vy += ux * tangent;
      return true;
    }

    function updateRace3D(t, dt) {
      if (state.phase !== 'playing' || state.mode !== 'race3d' || !state.race3d) return getState();
      if (!isFinite(t) || t < 0) t = 0;
      if (t < state.time) t = state.time;
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      clock(t);
      var r = state.race3d;
      r.events = [];
      if (t > RACE3D.suddenDeath) {
        r.voidZ = Math.min(620, (t - RACE3D.suddenDeath) * RACE3D.riseSpeed);
      }
      var si;
      for (si = 0; si < r.spinners.length; si++) {
        r.spinners[si].angle += r.spinners[si].speed * dt;
      }
      for (var mb = 0; mb < r.bumpers.length; mb++) {
        r.bumpers[mb].x = r.bumpers[mb].baseX + Math.sin(t * r.bumpers[mb].speed + r.bumpers[mb].phase) * r.bumpers[mb].amp;
      }

      var balls = r.balls;
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        if (!b.alive) continue;
        b.portalCd = Math.max(0, b.portalCd - dt);
        b.boostCd = Math.max(0, b.boostCd - dt);
        b.vz -= RACE3D.gravity * dt;
        b.vx *= RACE3D.damping;
        b.vy *= RACE3D.damping;
        b.vz *= RACE3D.damping;
        var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        if (speed > RACE3D.maxSpeed) {
          b.vx = b.vx / speed * RACE3D.maxSpeed;
          b.vy = b.vy / speed * RACE3D.maxSpeed;
          b.vz = b.vz / speed * RACE3D.maxSpeed;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;

        if (b.x - b.r < -RACE3D.bounds.x) { b.x = -RACE3D.bounds.x + b.r; b.vx = Math.abs(b.vx) * 0.86; }
        if (b.x + b.r > RACE3D.bounds.x) { b.x = RACE3D.bounds.x - b.r; b.vx = -Math.abs(b.vx) * 0.86; }
        if (b.y - b.r < -RACE3D.bounds.y) { b.y = -RACE3D.bounds.y + b.r; b.vy = Math.abs(b.vy) * 0.86; }
        if (b.y + b.r > RACE3D.bounds.y) { b.y = RACE3D.bounds.y - b.r; b.vy = -Math.abs(b.vy) * 0.86; }
        if (b.z + b.r > RACE3D.bounds.zMax) { b.z = RACE3D.bounds.zMax - b.r; b.vz = -Math.abs(b.vz) * 0.86; }

        for (var p = 0; p < RACE3D.pegs.length; p++) {
          bounceSphere3D(b, RACE3D.pegs[p].x, RACE3D.pegs[p].y, RACE3D.pegs[p].z, 5, 0.78, 0);
        }
        for (var bu = 0; bu < r.bumpers.length; bu++) {
          if (bounceSphere3D(b, r.bumpers[bu].x, r.bumpers[bu].y, r.bumpers[bu].z, r.bumpers[bu].r, 1.0, 150)) {
            r.events.push({ type: 'bumper', x: b.x, y: b.y, z: b.z, hue: b.hue });
          }
        }
        for (si = 0; si < r.spinners.length; si++) {
          if (collideSpinner3D(b, r.spinners[si])) {
            r.events.push({ type: 'spinner', x: b.x, y: b.y, z: b.z, hue: b.hue });
          }
        }
        for (var wl = 0; wl < RACE3D.wells.length; wl++) {
          var well = RACE3D.wells[wl];
          var wdx = well.x - b.x;
          var wdy = well.y - b.y;
          var wdz = well.z - b.z;
          var wd = Math.sqrt(wdx * wdx + wdy * wdy + wdz * wdz);
          if (wd < well.r && wd > 0) {
            var pull = well.strength * (1 - wd / well.r);
            b.vx += (wdx / wd) * pull * dt;
            b.vy += (wdy / wd) * pull * dt;
            b.vz += (wdz / wd) * pull * dt;
            b.vx += (-wdy / wd) * pull * 0.45 * dt;
            b.vy += (wdx / wd) * pull * 0.45 * dt;
          }
        }
        if (b.boostCd <= 0) {
          for (var bo = 0; bo < RACE3D.boosters.length; bo++) {
            var boost = RACE3D.boosters[bo];
            var bdx = b.x - boost.x;
            var bdy = b.y - boost.y;
            var bdz = b.z - boost.z;
            if (bdx * bdx + bdy * bdy + bdz * bdz < Math.pow(boost.r + b.r, 2)) {
              b.vx += boost.vx;
              b.vy += boost.vy;
              b.vz += boost.vz;
              b.boostCd = 0.32;
              r.events.push({ type: 'boost', x: b.x, y: b.y, z: b.z, hue: b.hue });
              break;
            }
          }
        }
        for (var po = 0; po < r.portals.length; po++) {
          var portal = r.portals[po];
          if (b.portalCd > 0 || b.portalUses >= 2) continue;
          var pdx = b.x - portal.x;
          var pdy = b.y - portal.y;
          var pdz = b.z - portal.z;
          if (pdx * pdx + pdy * pdy + pdz * pdz < Math.pow(b.r + portal.r, 2)) {
            var target = r.portals[portal.target];
            b.x = target.x;
            b.y = target.y;
            b.z = target.z;
            b.vx *= 0.72;
            b.vy *= 0.72;
            b.vz = 80;
            b.portalCd = 0.7;
            b.portalUses += 1;
            r.events.push({ type: 'portal', x: target.x, y: target.y, z: target.z, hue: portal.hue });
            break;
          }
        }

        for (var sw = 0; sw < RACE3D.slows.length; sw++) {
          var slow = RACE3D.slows[sw];
          var sdx = b.x - slow.x;
          var sdy = b.y - slow.y;
          var sdz = b.z - slow.z;
          if (sdx * sdx + sdy * sdy + sdz * sdz < slow.r * slow.r) {
            var slowFactor = Math.max(0, 1 - 2.4 * dt);
            b.vx *= slowFactor;
            b.vy *= slowFactor;
            b.vz *= slowFactor;
          }
        }
        for (var fn = 0; fn < RACE3D.fans.length; fn++) {
          var fan = RACE3D.fans[fn];
          var fdx = b.x - fan.x;
          var fdy = b.y - fan.y;
          var fdz = b.z - fan.z;
          if (fdx * fdx + fdy * fdy + fdz * fdz < fan.r * fan.r) {
            b.vz += fan.power * dt;
            b.vx += -fdy * 0.35 * dt;
            b.vy += fdx * 0.35 * dt;
          }
        }
        for (var pl = 0; pl < RACE3D.plates.length; pl++) {
          var plate = RACE3D.plates[pl];
          var pldx = b.x - plate.x;
          var pldy = b.y - plate.y;
          if (b.vz < 0 && b.z - b.r < plate.z && b.z + b.r > plate.z - 14 &&
              pldx * pldx + pldy * pldy < Math.pow(plate.r + b.r, 2)) {
            b.z = plate.z + b.r;
            b.vz = Math.abs(b.vz) * plate.bounce + 35;
            b.vx += rnd(-75, 75);
            b.vy += rnd(-60, 60);
            r.events.push({ type: 'plate', x: b.x, y: b.y, z: plate.z, hue: b.hue });
          }
        }
      }

      for (var a = 0; a < balls.length; a++) {
        if (!balls[a].alive) continue;
        for (var c = a + 1; c < balls.length; c++) {
          if (!balls[c].alive) continue;
          var ba = balls[a];
          var bb = balls[c];
          var ddx = bb.x - ba.x;
          var ddy = bb.y - ba.y;
          var ddz = bb.z - ba.z;
          var dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
          var minD = ba.r + bb.r;
          if (dist >= minD || dist <= 0) continue;
          var nx = ddx / dist;
          var ny = ddy / dist;
          var nz = ddz / dist;
          var overlap = (minD - dist) / 2;
          ba.x -= nx * overlap;
          ba.y -= ny * overlap;
          ba.z -= nz * overlap;
          bb.x += nx * overlap;
          bb.y += ny * overlap;
          bb.z += nz * overlap;
          var rvx = bb.vx - ba.vx;
          var rvy = bb.vy - ba.vy;
          var rvz = bb.vz - ba.vz;
          var vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            var imp = -(1 + 0.8) * vn / 2;
            ba.vx -= imp * nx;
            ba.vy -= imp * ny;
            ba.vz -= imp * nz;
            bb.vx += imp * nx;
            bb.vy += imp * ny;
            bb.vz += imp * nz;
          }
        }
      }

      var below = [];
      for (var e = 0; e < balls.length; e++) {
        if (balls[e].alive && balls[e].z - balls[e].r < r.voidZ) below.push(balls[e]);
      }
      below.sort(function (a, b) { return a.z - b.z; });
      for (var k = 0; k < below.length; k++) {
        if (r.alive <= 1) break;
        var gone = below[k];
        gone.alive = false;
        r.alive -= 1;
        r.eliminated += 1;
        r.events.push({ type: 'eliminate', x: gone.x, y: gone.y, z: gone.z, hue: gone.hue, id: gone.id });
      }

      if (r.alive <= 1 || t >= RACE3D.maxTime) {
        var winner = null;
        for (var w = 0; w < balls.length; w++) {
          if (balls[w].alive && (!winner || balls[w].z > winner.z)) winner = balls[w];
        }
        if (winner) finishRace3D(t, r, winner);
        return getState();
      }
      return getState();
    }

    function race3dSnapshot() {
      var r = state.race3d;
      if (!r) return null;
      return {
        elapsed: state.time,
        alive: r.alive,
        total: RACE3D.total,
        eliminated: RACE3D.total - r.alive,
        ballRadius: RACE3D.ballRadius,
        voidZ: r.voidZ,
        bounds: RACE3D.bounds,
        balls: r.balls.filter(function (b) { return b.alive; }).map(function (b) {
          return { id: b.id, hue: b.hue, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, r: b.r };
        }),
        pegs: RACE3D.pegs,
        bumpers: r.bumpers.map(function (b) {
          return { x: b.x, y: b.y, z: b.z, r: b.r };
        }),
        spinners: r.spinners.map(function (s) {
          return { x: s.x, y: s.y, z: s.z, len: s.len, half: s.half, angle: s.angle };
        }),
        portals: r.portals.map(function (p) {
          return { x: p.x, y: p.y, z: p.z, r: p.r, hue: p.hue };
        }),
        wells: RACE3D.wells,
        boosters: RACE3D.boosters,
        plates: RACE3D.plates,
        slows: RACE3D.slows,
        fans: RACE3D.fans,
        result: r.result,
        events: r.events.slice()
      };
    }

    function getState() {
      var balls = state.mode === 'frame' ? state.balls.map(function (b) {
        return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, hue: b.hue, depth: b.depth || 0 };
      }) : [];
      return {
        phase: state.phase,
        mode: state.mode,
        time: state.time,
        race: state.mode === 'race' ? raceSnapshot() : null,
        race3d: state.mode === 'race3d' ? race3dSnapshot() : null,
        cycle: state.cycle,
        bar: state.bar,
        beat: state.beat,
        stepInBar: state.stepInBar,
        count: state.count,
        maxCount: state.maxCount,
        split: state.split,
        reset: state.reset,
        peak: state.peak,
        captures: state.captures,
        frameReset: state.frameReset,
        captureEvents: state.captureEvents.slice(),
        balls: balls,
        bpm: BPM,
        barsPerCycle: BARS_PER_CYCLE,
        beatsPerBar: BEATS_PER_BAR,
        stepSeconds: STEP_SECONDS,
        beatSeconds: BEAT_SECONDS,
        barSeconds: BAR_SECONDS,
        cycleSeconds: CYCLE_SECONDS,
        maxBalls: FRAME_MAX,
        maxAutoBalls: MAX_COUNT,
        field: FIELD,
        line: LINE,
        root: ROOTS[state.cycle % ROOTS.length],
        rootIndex: state.cycle % ROOTS.length
      };
    }

    function tap(x, y) {
      if (state.phase !== 'playing') return false;
      if (state.mode === 'frame') {
        var radiusSq = 120 * 120;
        for (var i = 0; i < state.balls.length; i++) {
          var b = state.balls[i];
          var dx = b.x - x;
          var dy = b.y - y;
          var d2 = dx * dx + dy * dy;
          if (d2 > radiusSq) continue;
          var d = Math.sqrt(d2) || 1;
          var force = 260 * (1 - d / 120);
          b.vx += (dx / d) * force;
          b.vy += (dy / d) * force;
        }
        return true;
      }
      if (state.mode === 'race' || state.mode === 'race3d') return false;
      return false;
    }

    function autoStep() {
      if (state.phase === 'start') start('auto');
    }

    return {
      state: state,
      onChange: onChange,
      start: start,
      reset: resetState,
      update: update,
      updateFrame: updateFrame,
      updateRace: updateRace,
      updateRace3D: updateRace3D,
      tap: tap,
      autoStep: autoStep,
      getState: getState
    };
  }

  return {
    createGame: createGame,
    BPM: BPM,
    BEATS_PER_BAR: BEATS_PER_BAR,
    STEPS_PER_BEAT: STEPS_PER_BEAT,
    STEPS_PER_BAR: STEPS_PER_BAR,
    BARS_PER_CYCLE: BARS_PER_CYCLE,
    STEP_SECONDS: STEP_SECONDS,
    BEAT_SECONDS: BEAT_SECONDS,
    BAR_SECONDS: BAR_SECONDS,
    CYCLE_SECONDS: CYCLE_SECONDS,
    MAX_COUNT: MAX_COUNT,
    FRAME_MAX: FRAME_MAX,
    FIELD: FIELD,
    LINE: LINE,
    FRAME: LINE,
    RACE: RACE,
    RACE3D: RACE3D,
    ROOTS: ROOTS
  };
});
