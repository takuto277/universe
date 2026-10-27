/* engine.js : 倍々（Exponential Bloom）の時間・小節・倍々スケジュール
 *
 * 120 BPM / 4/4。1小節ごとにボールが倍々になり、12小節で 1 → 2048。
 * 12小節（24秒）で1サイクル。サイクルが変わると1個に戻り、キーが変わる。
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

  var ROOTS = [
    { name: 'C minor', freq: 130.81, hue: 188 },
    { name: 'E♭ minor', freq: 155.56, hue: 268 },
    { name: 'F minor', freq: 174.61, hue: 330 },
    { name: 'G minor', freq: 196.00, hue: 44 }
  ];

  function createGame(options) {
    options = options || {};
    var listeners = [];
    var state = {
      phase: 'start',
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
      taps: 0,
      lastTap: null,
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

    function start() {
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
      state.taps = 0;
      state.lastTap = null;
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
      state.taps = 0;
      state.lastTap = null;
      emit();
    }

    function update(t) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(t) || t < 0) t = 0;
      var prevCycle = state.cycle;
      var prevBar = state.bar;
      var cycle = Math.floor(t / CYCLE_SECONDS);
      var cycleTime = t - cycle * CYCLE_SECONDS;
      var bar = Math.min(BARS_PER_CYCLE - 1, Math.floor(cycleTime / BAR_SECONDS));
      var barTime = cycleTime - bar * BAR_SECONDS;
      var beat = Math.min(BEATS_PER_BAR - 1, Math.floor(barTime / BEAT_SECONDS));
      var stepInBar = Math.min(STEPS_PER_BAR - 1, Math.floor(barTime / STEP_SECONDS));
      var count = Math.pow(2, bar);

      state.time = t;
      state.cycle = cycle;
      state.bar = bar;
      state.beat = beat;
      state.stepInBar = stepInBar;
      state.count = count;
      state.maxCount = Math.max(state.maxCount, count);
      state.peak = bar === BARS_PER_CYCLE - 1;
      state.reset = cycle !== prevCycle;
      state.split = !state.reset && bar !== prevBar && bar > 0;
      return getState();
    }

    function tap(x, y) {
      if (state.phase !== 'playing') return false;
      state.taps += 1;
      state.lastTap = { x: x, y: y, time: state.time };
      return true;
    }

    function getState() {
      return {
        phase: state.phase,
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
        taps: state.taps,
        lastTap: state.lastTap,
        bpm: BPM,
        barsPerCycle: BARS_PER_CYCLE,
        beatsPerBar: BEATS_PER_BAR,
        stepSeconds: STEP_SECONDS,
        beatSeconds: BEAT_SECONDS,
        barSeconds: BAR_SECONDS,
        cycleSeconds: CYCLE_SECONDS,
        maxBalls: MAX_COUNT,
        root: ROOTS[state.cycle % ROOTS.length],
        rootIndex: state.cycle % ROOTS.length
      };
    }

    function autoStep() {
      if (state.phase === 'start') {
        start();
        return;
      }
      if (state.phase === 'playing' && state.taps < 3 && state.time > 6 + state.taps * 3) {
        tap(0.5, 0.5);
      }
    }

    return {
      state: state,
      onChange: onChange,
      start: start,
      reset: resetState,
      update: update,
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
    ROOTS: ROOTS
  };
});
