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
    duration: 60,
    worldHeight: 4200,
    finishY: 4200,
    startY: 300,
    trackLeft: 45,
    trackRight: 345,
    gapW: 110,
    ballRadius: 10,
    gravity: 150,
    drag: 1.25,
    sideDrag: 2.4,
    maxSpeed: 200,
    ghostSpeed: 180,
    tapRadius: 140,
    tapForce: 220,
    gates: [
      { y: 1150, gapX: 105 },
      { y: 2450, gapX: 270 },
      { y: 3550, gapX: 170 }
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
      var chosen = mode === 'frame' ? 'frame' : mode === 'race' ? 'race' : 'auto';
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
      var cx = (RACE.trackLeft + RACE.trackRight) / 2;
      return {
        duration: RACE.duration,
        finishY: RACE.finishY,
        worldHeight: RACE.worldHeight,
        trackLeft: RACE.trackLeft,
        trackRight: RACE.trackRight,
        gapW: RACE.gapW,
        player: { x: cx, y: RACE.startY, vx: 0, vy: 50, radius: RACE.ballRadius },
        ghost: { x: cx, y: RACE.startY, time: null, finished: false },
        gates: RACE.gates.map(function (g) {
          return { y: g.y, gapX: g.gapX, gapW: RACE.gapW, passed: false };
        }),
        gateIndex: 0,
        gatesPassed: 0,
        result: null,
        events: [],
        beatHit: false,
        tapCount: 0
      };
    }

    function nearBeat(t) {
      var phase = t % BEAT_SECONDS;
      return phase < 0.1 || BEAT_SECONDS - phase < 0.1;
    }

    function finishRace(reason, t, r) {
      var ghostTime = (RACE.finishY - RACE.startY) / RACE.ghostSpeed;
      var playerTime = reason === 'timeup' ? RACE.duration : Math.min(t, RACE.duration);
      var status = reason === 'timeup' ? 'dnf' : (playerTime < ghostTime ? 'win' : 'lose');
      r.result = {
        status: status,
        time: playerTime,
        ghostTime: ghostTime,
        gatesPassed: r.gatesPassed,
        gateCount: r.gates.length
      };
      r.events.push({ type: 'finish', x: r.player.x, y: r.player.y, hue: hueNow(), result: status });
      state.phase = 'finished';
      state.time = playerTime;
    }

    function updateRace(t, dt) {
      if (state.phase !== 'playing' || state.mode !== 'race' || !state.race) return getState();
      if (!isFinite(t) || t < 0) t = 0;
      if (t < state.time) t = state.time;
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      clock(t);
      var r = state.race;
      var p = r.player;
      var g = r.ghost;
      r.events = [];
      r.beatHit = false;

      g.y = Math.min(r.finishY, RACE.startY + RACE.ghostSpeed * t);
      g.finished = g.y >= r.finishY;
      g.time = g.finished ? (r.finishY - RACE.startY) / RACE.ghostSpeed : null;
      var ghostTargetX = (RACE.trackLeft + RACE.trackRight) / 2;
      for (var gi = 0; gi < r.gates.length; gi++) {
        if (g.y < r.gates[gi].y + 220) { ghostTargetX = r.gates[gi].gapX; break; }
      }
      g.x += (ghostTargetX - g.x) * Math.min(1, dt * 4.5);

      if (t >= RACE.duration) {
        finishRace('timeup', t, r);
        return getState();
      }

      p.vy += RACE.gravity * dt;
      p.vx *= Math.max(0, 1 - RACE.sideDrag * dt);
      p.vy *= Math.max(0, 1 - RACE.drag * dt);
      var speed = Math.hypot(p.vx, p.vy);
      if (speed > RACE.maxSpeed) {
        var k = RACE.maxSpeed / speed;
        p.vx *= k;
        p.vy *= k;
      }

      var prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < RACE.trackLeft + p.radius) { p.x = RACE.trackLeft + p.radius; p.vx = Math.abs(p.vx) * 0.45; }
      if (p.x > RACE.trackRight - p.radius) { p.x = RACE.trackRight - p.radius; p.vx = -Math.abs(p.vx) * 0.45; }
      if (p.y < RACE.startY) { p.y = RACE.startY; p.vy = Math.abs(p.vy) * 0.3; }

      for (var i = 0; i < r.gates.length; i++) {
        var gate = r.gates[i];
        if (gate.passed) continue;
        if (prevY < gate.y && p.y >= gate.y) {
          var half = gate.gapW / 2 - p.radius;
          if (p.x < gate.gapX - half || p.x > gate.gapX + half) {
            p.y = gate.y - p.radius - 1;
            p.vy = -Math.abs(p.vy) * 0.35 - 10;
            p.vx += (p.x < gate.gapX ? -1 : 1) * 90;
            r.events.push({ type: 'hit', x: p.x, y: gate.y, hue: hueNow() });
            break;
          }
          gate.passed = true;
          r.gatesPassed += 1;
          r.gateIndex = Math.min(r.gates.length, r.gatesPassed);
          r.events.push({ type: 'gate', x: p.x, y: gate.y, hue: hueNow() });
        }
      }

      if (p.y >= r.finishY) {
        p.y = r.finishY;
        finishRace('finish', t, r);
      }
      return getState();
    }

    function raceSnapshot() {
      var r = state.race;
      if (!r) return null;
      var p = r.player;
      var g = r.ghost;
      return {
        duration: r.duration,
        timeLeft: Math.max(0, r.duration - state.time),
        elapsed: state.time,
        finishY: r.finishY,
        worldHeight: r.worldHeight,
        trackLeft: r.trackLeft,
        trackRight: r.trackRight,
        gapW: r.gapW,
        player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, radius: p.radius },
        ghost: { x: g.x, y: g.y, time: g.time, finished: g.finished },
        gates: r.gates.map(function (gate) {
          return { y: gate.y, gapX: gate.gapX, gapW: gate.gapW, passed: gate.passed };
        }),
        gateIndex: r.gateIndex,
        gatesPassed: r.gatesPassed,
        result: r.result,
        events: r.events.slice(),
        beatHit: r.beatHit,
        tapCount: r.tapCount
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
      if (state.mode !== 'race' || !state.race) return false;
      var p = state.race.player;
      var rdx = p.x - x;
      var rdy = p.y - y;
      var dist = Math.hypot(rdx, rdy);
      if (dist > RACE.tapRadius) return false;
      var strength = RACE.tapForce * (1 - dist / RACE.tapRadius);
      var onBeat = nearBeat(state.time);
      var mult = onBeat ? 1.35 : 1;
      p.vx += (rdx / (dist || 1)) * strength * mult;
      p.vy += (rdy / (dist || 1)) * strength * mult;
      state.race.beatHit = onBeat;
      state.race.tapCount += 1;
      return true;
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
    ROOTS: ROOTS
  };
});
