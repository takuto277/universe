/* engine.js : BLOOM の時間・小節・倍々スケジュールと FRAME モード
 *
 * AUTO : 120 BPM / 4/4。1小節ごとに 1 → 2 → ... → 2048。12小節でリセット。
 * FRAME: ボールが上部のフレームに入ると、その場で2個に増える。
 *        ボールは常に360度のどれかの方向へ動き、壁で跳ね返る。
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
  var FRAME = { x: 55, y: 220, w: 280, h: 76 };
  var FRAME_MAX = MAX_COUNT;
  var TAU = Math.PI * 2;

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

    function makeBall(x, y, speedMin, speedMax, immune) {
      var angle = Math.random() * TAU;
      var speed = rnd(speedMin, speedMax);
      return {
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hue: (hueNow() + rnd(-22, 22) + 360) % 360,
        immune: immune || 0
      };
    }

    function initialBall() {
      var b = makeBall(FIELD.w / 2, FRAME.y + FRAME.h + 30, 110, 170, 0);
      var speed = Math.hypot(b.vx, b.vy);
      var angle = -Math.PI / 2 + rnd(-0.55, 0.55);
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
      return b;
    }

    function start(mode) {
      var chosen = mode === 'frame' ? 'frame' : 'auto';
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

    function insideFrame(ball) {
      return ball.x >= FRAME.x && ball.x <= FRAME.x + FRAME.w &&
        ball.y >= FRAME.y && ball.y <= FRAME.y + FRAME.h;
    }

    function spawnFromFrame() {
      var x = FRAME.x + FRAME.w / 2 + rnd(-FRAME.w * 0.34, FRAME.w * 0.34);
      var y = FRAME.y + FRAME.h + rnd(8, 26);
      return makeBall(x, y, 90, 180, 0.4);
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
        b.immune = Math.max(0, b.immune - dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) || 1; }
        if (b.x > FIELD.w) { b.x = FIELD.w; b.vx = -Math.abs(b.vx) || -1; }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) || 1; }
        if (b.y > FIELD.h) { b.y = FIELD.h; b.vy = -Math.abs(b.vy) || -1; }
        if (Math.abs(b.vx) + Math.abs(b.vy) < 0.01) {
          var fresh = makeBall(b.x, b.y, 70, 130, 0);
          b.vx = fresh.vx;
          b.vy = fresh.vy;
        }
        if (insideFrame(b) && b.immune <= 0) {
          captured.push({ x: b.x, y: b.y, hue: b.hue });
        } else {
          kept.push(b);
        }
      }

      state.balls = kept;
      for (var c = 0; c < captured.length; c++) {
        state.captures += 1;
        state.captureEvents.push({ x: captured[c].x, y: captured[c].y, hue: captured[c].hue, time: t, reset: false });
        state.balls.push(spawnFromFrame());
        state.balls.push(spawnFromFrame());
      }

      state.count = state.balls.length;
      state.maxCount = Math.max(state.maxCount, state.count);

      if (state.count > FRAME_MAX) {
        state.balls = [initialBall()];
        state.count = 1;
        state.frameReset = true;
        state.captureEvents.push({
          x: FRAME.x + FRAME.w / 2,
          y: FRAME.y + FRAME.h / 2,
          hue: hueNow(),
          time: t,
          reset: true
        });
      }

      return getState();
    }

    function getState() {
      var balls = state.mode === 'frame' ? state.balls.map(function (b) {
        return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, hue: b.hue };
      }) : [];
      return {
        phase: state.phase,
        mode: state.mode,
        time: state.time,
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
        frame: FRAME,
        root: ROOTS[state.cycle % ROOTS.length],
        rootIndex: state.cycle % ROOTS.length
      };
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
    FRAME: FRAME,
    ROOTS: ROOTS
  };
});
