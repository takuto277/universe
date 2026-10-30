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
  var SPAWN_BASE = 2.0;
  var SPAWN_MIN = 0.65;
  var MAX_NOISES = 8;
  var NOISE_GRACE = 2.0;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 80;

  var NOISE_TYPES = [
    { id: 'window', icon: '🪟', drain: 1.2, x: 0.708, y: 0.379, w: 0.389, h: 0.227 },
    { id: 'door', icon: '🚪', drain: 1.1, x: 0.050, y: 0.420, w: 0.100, h: 0.390 },
    { id: 'wall-clock', icon: '🕰️', drain: 1.0, x: 0.226, y: 0.281, w: 0.150, h: 0.094 },
    { id: 'ceiling-fan', icon: '🌀', drain: 1.3, x: 0.514, y: 0.220, w: 0.417, h: 0.115 },
    { id: 'tv', icon: '📺', drain: 1.2, x: 0.889, y: 0.508, w: 0.222, h: 0.109 },
    { id: 'radio', icon: '📻', drain: 1.1, x: 0.951, y: 0.395, w: 0.097, h: 0.055 },
    { id: 'alarm-clock', icon: '⏰', drain: 1.0, x: 0.233, y: 0.516, w: 0.069, h: 0.047 },
    { id: 'smartphone', icon: '📱', drain: 0.9, x: 0.294, y: 0.525, w: 0.032, h: 0.031 },
    { id: 'vacuum', icon: '🧹', drain: 1.4, x: 0.215, y: 0.658, w: 0.431, h: 0.137 },
    { id: 'cat', icon: '🐱', drain: 0.8, x: 0.604, y: 0.727, w: 0.444, h: 0.078 },
    { id: 'music-box', icon: '🎵', drain: 0.9, x: 0.205, y: 0.371, w: 0.110, h: 0.063 },
    { id: 'radiator', icon: '♨️', drain: 1.2, x: 0.247, y: 0.522, w: 0.160, h: 0.137 },
    { id: 'wind-chime', icon: '🎐', drain: 0.7, x: 0.847, y: 0.348, w: 0.056, h: 0.148 },
    { id: 'neighbor-speaker', icon: '🔊', drain: 1.3, x: 0.944, y: 0.238, w: 0.111, h: 0.070 },
    { id: 'bird', icon: '🐦', drain: 0.8, x: 0.756, y: 0.383, w: 0.069, h: 0.031 }
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
    state.spawnTimer = 0.8;
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
      var noise = state.noises[i];
      if (noise.active === false) continue;
      var type = NOISE_TYPES.filter(function (item) { return item.id === noise.type; })[0];
      drain += BASE_DRAIN * (type ? type.drain : 1);
    }
    return drain;
  }

  function spawnNoise(state) {
    if (!state || state.noises.length >= MAX_NOISES) return null;
    var used = {};
    for (var i = 0; i < state.noises.length; i++) used[state.noises[i].type] = true;
    var free = NOISE_TYPES.filter(function (type) { return !used[type.id]; });
    if (!free.length) return null;
    var type = free[Math.floor(state.rng() * free.length)];
    var w = Math.max(12, type.w * state.width);
    var h = Math.max(12, type.h * state.height);
    var noise = {
      id: state.nextNoiseId++,
      type: type.id,
      icon: type.icon,
      x: type.x * state.width,
      y: type.y * state.height,
      w: w,
      h: h,
      r: Math.max(w, h) / 2,
      born: state.time,
      active: false,
      activeAt: state.time + NOISE_GRACE
    };
    state.noises.push(noise);
    pushEvent(state, { type: 'noise', noise: noise });
    return noise;
  }

  function update(state, dt) {
    if (!state || state.phase !== 'run') return state;
    dt = clamp(Number(dt) || 0, 0, MAX_DT);
    state.time += dt;

    for (var ni = 0; ni < state.noises.length; ni++) {
      var pending = state.noises[ni];
      if (pending.active === false && state.time >= pending.activeAt) {
        pending.active = true;
        pushEvent(state, { type: 'noiseActive', noise: pending });
      }
    }

    var drain = activeDrain(state);
    if (drain === 0) {
      state.sleep += QUIET_GAIN * dt;
    } else {
      state.sleep -= drain * dt;
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
      var burst = 1 + (state.rng() < 0.45 ? 1 : 0);
      for (var n = 0; n < burst; n++) spawnNoise(state);
      var interval = Math.max(SPAWN_MIN, SPAWN_BASE - state.time * 0.045);
      state.spawnTimer = interval * (0.65 + state.rng() * 0.55);
    }
    return state;
  }

  function tapAt(state, x, y) {
    if (!state || state.phase !== 'run') return null;
    var bestIndex = -1;
    var bestScore = Infinity;
    var bestRadius = Infinity;
    for (var i = 0; i < state.noises.length; i++) {
      var candidate = state.noises[i];
      var dx = x - candidate.x;
      var dy = y - candidate.y;
      var hitRadius = candidate.w ? Math.max(26, Math.max(candidate.w, candidate.h) * 0.55) : candidate.r * 1.8;
      var dist2 = dx * dx + dy * dy;
      if (dist2 > hitRadius * hitRadius) continue;
      var score = dist2 / (hitRadius * hitRadius);
      if (score < bestScore || (score === bestScore && hitRadius < bestRadius)) {
        bestScore = score;
        bestRadius = hitRadius;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return null;
    var noise = state.noises.splice(bestIndex, 1)[0];
    state.sleep = clamp(state.sleep + TAP_GAIN, 0, MAX_SLEEP);
    state.score += 10;
    state.stopped++;
    pushEvent(state, { type: 'silence', noise: noise });
    return noise;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase !== 'run') return;
    while (state.noises.length) {
      var noise = state.noises[0];
      if (!tapAt(state, noise.x, noise.y)) break;
    }
  }

  function resize(state, width, height) {
    if (!state) return state;
    var oldW = state.width || 1;
    var oldH = state.height || 1;
    state.width = Math.max(280, Number(width) || state.width);
    state.height = Math.max(360, Number(height) || state.height);
    for (var i = 0; i < state.noises.length; i++) {
      var noise = state.noises[i];
      var type = NOISE_TYPES.filter(function (item) { return item.id === noise.type; })[0];
      if (type) {
        noise.x = type.x * state.width;
        noise.y = type.y * state.height;
        noise.w = Math.max(12, type.w * state.width);
        noise.h = Math.max(12, type.h * state.height);
        noise.r = Math.max(noise.w, noise.h) / 2;
      } else {
        noise.x = noise.x / oldW * state.width;
        noise.y = noise.y / oldH * state.height;
      }
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
        return { id: noise.id, type: noise.type, icon: noise.icon,
                 x: noise.x, y: noise.y, w: noise.w, h: noise.h, r: noise.r,
                 age: Math.max(0, state.time - noise.born),
                 active: noise.active !== false,
                 activeIn: Math.max(0, noise.activeAt - state.time) };
      })
    };
  }

  return {
    START_SLEEP: START_SLEEP,
    MAX_SLEEP: MAX_SLEEP,
    NOISE_GRACE: NOISE_GRACE,
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
