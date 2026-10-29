/* engine.js : ねむりのまもり（睡眠ゲージと騒音のコアロジック） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SleepGuardEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var START_SLEEP = 33;
  var MAX_SLEEP = 100;
  var QUIET_GAIN = 3.2;
  var TAP_GAIN = 2.4;
  var BASE_DRAIN = 5.0;
  var SPAWN_BASE = 3.2;
  var SPAWN_MIN = 1.15;
  var MAX_NOISES = 4;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 80;

  var NOISE_TYPES = [
    { id: 'clock', icon: '⏰', label: '目覚まし時計', drain: 1.0 },
    { id: 'phone', icon: '📱', label: 'スマホの通知', drain: 0.85 },
    { id: 'tv', icon: '📺', label: 'テレビ', drain: 1.15 },
    { id: 'door', icon: '🚪', label: 'ドアの物音', drain: 1.25 },
    { id: 'vacuum', icon: '🧹', label: '掃除機', drain: 1.35 },
    { id: 'bird', icon: '🐦', label: '朝の鳥', drain: 0.75 }
  ];

  var SLOTS = [
    { x: 0.16, y: 0.27 }, { x: 0.84, y: 0.27 },
    { x: 0.14, y: 0.53 }, { x: 0.86, y: 0.53 },
    { x: 0.28, y: 0.79 }, { x: 0.72, y: 0.79 },
    { x: 0.5, y: 0.16 }
  ];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  function pushEvent(state, event) {
    if (state.events.length >= MAX_EVENTS) state.events.shift();
    state.events.push(event);
  }

  function reset(state) {
    state.phase = 'idle';
    state.sleep = START_SLEEP;
    state.time = 0;
    state.score = 0;
    state.stopped = 0;
    state.noises = [];
    state.nextNoiseId = 1;
    state.spawnTimer = 1.4;
    state.over = false;
    state.result = null;
    state.events = [];
    return state;
  }

  function createGame(options) {
    options = options || {};
    var state = {
      width: Math.max(280, Number(options.width) || 480),
      height: Math.max(360, Number(options.height) || 800),
      rng: options.rng || Math.random
    };
    reset(state);
    return state;
  }

  function start(state) {
    if (!state || state.phase === 'run') return false;
    reset(state);
    state.phase = 'run';
    state.startedAt = Date.now();
    pushEvent(state, { type: 'start' });
    return true;
  }

  function activeDrain(state) {
    var drain = 0;
    for (var i = 0; i < state.noises.length; i++) {
      var type = NOISE_TYPES.filter(function (item) { return item.id === state.noises[i].type; })[0];
      drain += BASE_DRAIN * (type ? type.drain : 1);
    }
    return drain;
  }

  function spawnNoise(state) {
    if (!state || state.noises.length >= MAX_NOISES) return null;
    var free = SLOTS.filter(function (slot) {
      for (var i = 0; i < state.noises.length; i++) {
        var noise = state.noises[i];
        var dx = noise.x - slot.x * state.width;
        var dy = noise.y - slot.y * state.height;
        if (Math.sqrt(dx * dx + dy * dy) < 76) return false;
      }
      return true;
    });
    if (!free.length) return null;
    var slot = free[Math.floor(state.rng() * free.length)];
    var type = NOISE_TYPES[Math.floor(state.rng() * NOISE_TYPES.length)];
    var noise = {
      id: state.nextNoiseId++,
      type: type.id,
      icon: type.icon,
      label: type.label,
      x: slot.x * state.width,
      y: slot.y * state.height,
      r: Math.max(22, Math.min(state.width, state.height) * 0.055),
      born: state.time
    };
    state.noises.push(noise);
    pushEvent(state, { type: 'noise', noise: noise });
    return noise;
  }

  function update(state, dt) {
    if (!state || state.phase !== 'run') return state;
    dt = clamp(Number(dt) || 0, 0, MAX_DT);
    state.time += dt;

    if (state.noises.length === 0) {
      state.sleep += QUIET_GAIN * dt;
    } else {
      state.sleep -= activeDrain(state) * dt;
    }
    state.sleep = clamp(state.sleep, 0, MAX_SLEEP);

    if (state.sleep >= MAX_SLEEP) {
      state.sleep = MAX_SLEEP;
      state.phase = 'clear';
      state.over = true;
      state.result = 'clear';
      state.noises = [];
      pushEvent(state, { type: 'clear' });
      return state;
    }
    if (state.sleep <= 0) {
      state.sleep = 0;
      state.phase = 'over';
      state.over = true;
      state.result = 'over';
      state.noises = [];
      pushEvent(state, { type: 'over' });
      return state;
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnNoise(state);
      var interval = Math.max(SPAWN_MIN, SPAWN_BASE - state.time * 0.035);
      state.spawnTimer = interval * (0.8 + state.rng() * 0.45);
    }
    return state;
  }

  function tapAt(state, x, y) {
    if (!state || state.phase !== 'run') return null;
    for (var i = state.noises.length - 1; i >= 0; i--) {
      var noise = state.noises[i];
      var dx = x - noise.x;
      var dy = y - noise.y;
      if (dx * dx + dy * dy <= Math.pow(noise.r * 1.8, 2)) {
        state.noises.splice(i, 1);
        state.sleep = clamp(state.sleep + TAP_GAIN, 0, MAX_SLEEP);
        state.score += 10;
        state.stopped++;
        pushEvent(state, { type: 'silence', noise: noise });
        return noise;
      }
    }
    return null;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase !== 'run') return;
    if (state.noises.length) {
      var noise = state.noises[0];
      tapAt(state, noise.x, noise.y);
    }
  }

  function resize(state, width, height) {
    if (!state) return state;
    var oldW = state.width || 1;
    var oldH = state.height || 1;
    state.width = Math.max(280, Number(width) || state.width);
    state.height = Math.max(360, Number(height) || state.height);
    for (var i = 0; i < state.noises.length; i++) {
      state.noises[i].x = state.noises[i].x / oldW * state.width;
      state.noises[i].y = state.noises[i].y / oldH * state.height;
      state.noises[i].r = Math.max(22, Math.min(state.width, state.height) * 0.055);
    }
    return state;
  }

  function consumeEvents(state) {
    if (!state) return [];
    var events = state.events;
    state.events = [];
    return events;
  }

  function snapshot(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      sleep: state.sleep,
      maxSleep: MAX_SLEEP,
      time: state.time,
      score: state.score,
      stopped: state.stopped,
      over: state.over,
      result: state.result,
      noises: state.noises.map(function (noise) {
        return { id: noise.id, type: noise.type, icon: noise.icon, label: noise.label,
                 x: noise.x, y: noise.y, r: noise.r };
      })
    };
  }

  return {
    START_SLEEP: START_SLEEP,
    MAX_SLEEP: MAX_SLEEP,
    NOISE_TYPES: NOISE_TYPES,
    createGame: createGame,
    start: start,
    reset: reset,
    update: update,
    tapAt: tapAt,
    autoStep: autoStep,
    resize: resize,
    consumeEvents: consumeEvents,
    snapshot: snapshot,
    mulberry32: mulberry32
  };
});
