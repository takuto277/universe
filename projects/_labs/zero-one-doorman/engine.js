/* engine.js : 0.1秒ドアマン（ドア開閉と乗客仕分けのコアロジック） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DoormanEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DURATION = 30;
  var DOOR_HOLD = 0.45;
  var DOOR_SPEED = 10;
  var DOOR_LINE = 0.82;
  var MAX_PASSENGERS = 6;
  var SPAWN_START = 1.2;
  var SPAWN_MIN = 0.55;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 100;

  var TYPES = {
    dress: { label: 'ドレス', allowed: true, color: '#ff7bc8' },
    suit: { label: 'スーツ', allowed: false, color: '#6d8fd8' }
  };

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
    state.time = 0;
    state.remaining = DURATION;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.served = 0;
    state.missed = 0;
    state.perfect = 0;
    state.doorOpen = 0;
    state.doorTarget = 0;
    state.doorHold = 0;
    state.lastInputAt = -99;
    state.spawnTimer = 0.6;
    state.passengers = [];
    state.nextId = 1;
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
    pushEvent(state, { type: 'start' });
    return true;
  }

  function press(state, action) {
    if (!state || state.phase !== 'run') return false;
    if (action !== 'open' && action !== 'close') return false;
    state.doorTarget = action === 'open' ? 1 : 0;
    state.doorHold = DOOR_HOLD;
    state.lastInputAt = state.time;
    pushEvent(state, { type: action, target: state.doorTarget });
    return true;
  }

  function spawnPassenger(state) {
    if (state.passengers.length >= MAX_PASSENGERS) return null;
    var tag = state.rng() < 0.48 ? 'dress' : 'suit';
    var lane = (state.rng() * 2 - 1) * 0.9;
    var passenger = {
      id: state.nextId++,
      tag: tag,
      lane: lane,
      progress: 0,
      speed: 0.22 + state.rng() * 0.09,
      born: state.time,
      resolved: false,
      outcome: null,
      outTimer: 0,
      perfect: false
    };
    state.passengers.push(passenger);
    pushEvent(state, { type: 'spawn', passenger: passenger });
    return passenger;
  }

  function resolvePassenger(state, passenger) {
    if (passenger.resolved) return;
    var open = state.doorOpen > 0.5;
    var allowed = TYPES[passenger.tag].allowed;
    var success = open ? allowed : !allowed;
    var controlled = state.time - state.lastInputAt <= 0.5;
    passenger.resolved = true;
    passenger.outTimer = 0;

    if (success) {
      passenger.outcome = open ? 'entered' : 'blocked';
      if (!controlled) {
        state.combo = 0;
        pushEvent(state, { type: 'ignored', passenger: passenger });
        return;
      }
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.served++;
      state.score += (open ? 10 : 15) + Math.min(10, state.combo * 2);
      if (state.time - state.lastInputAt <= 0.1) {
        state.perfect++;
        state.score += 5;
        passenger.perfect = true;
      }
      pushEvent(state, { type: passenger.outcome, passenger: passenger });
    } else {
      state.combo = 0;
      state.missed++;
      passenger.outcome = open ? 'intruded' : 'missed';
      pushEvent(state, { type: passenger.outcome, passenger: passenger });
    }
  }

  function update(state, dt) {
    if (!state || state.phase !== 'run') return state;
    dt = clamp(Number(dt) || 0, 0, MAX_DT);
    state.time += dt;
    state.remaining = Math.max(0, DURATION - state.time);

    if (state.doorHold > 0) {
      state.doorHold -= dt;
      if (state.doorHold <= 0) {
        state.doorTarget = state.doorTarget ? 0 : 1;
        state.doorHold = DOOR_HOLD;
        pushEvent(state, { type: 'auto', target: state.doorTarget });
      }
    }

    var diff = state.doorTarget - state.doorOpen;
    var step = DOOR_SPEED * dt;
    if (Math.abs(diff) <= step) state.doorOpen = state.doorTarget;
    else state.doorOpen += diff > 0 ? step : -step;

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnPassenger(state);
      var interval = Math.max(SPAWN_MIN, SPAWN_START - state.time * 0.022);
      state.spawnTimer = interval * (0.72 + state.rng() * 0.5);
    }

    for (var i = state.passengers.length - 1; i >= 0; i--) {
      var passenger = state.passengers[i];
      if (!passenger.resolved) {
        passenger.progress += passenger.speed * dt;
        if (passenger.progress >= DOOR_LINE) resolvePassenger(state, passenger);
      } else {
        passenger.outTimer += dt;
        if (passenger.outTimer >= 0.85) state.passengers.splice(i, 1);
      }
    }

    if (state.time >= DURATION) {
      state.remaining = 0;
      state.phase = 'over';
      state.over = true;
      state.result = {
        score: state.score,
        served: state.served,
        missed: state.missed,
        maxCombo: state.maxCombo,
        perfect: state.perfect
      };
      pushEvent(state, { type: 'finish', result: state.result });
    }
    return state;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase !== 'run') return;
    var nearest = null;
    for (var i = 0; i < state.passengers.length; i++) {
      var passenger = state.passengers[i];
      if (passenger.resolved) continue;
      if (!nearest || passenger.progress > nearest.progress) nearest = passenger;
    }
    if (nearest) press(state, TYPES[nearest.tag].allowed ? 'open' : 'close');
  }

  function rank(score) {
    if (score >= 350) return '伝説の0.1秒';
    if (score >= 250) return '一流ドアマン';
    if (score >= 150) return '一人前ドアマン';
    if (score >= 70) return '見習いドアマン';
    return '新人ドアマン';
  }

  function snapshot(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      time: state.time,
      remaining: state.remaining,
      score: state.score,
      combo: state.combo,
      maxCombo: state.maxCombo,
      served: state.served,
      missed: state.missed,
      perfect: state.perfect,
      doorOpen: state.doorOpen,
      doorTarget: state.doorTarget,
      over: state.over,
      result: state.result,
      rank: rank(state.score),
      passengers: state.passengers.map(function (p) {
        return {
          id: p.id,
          tag: p.tag,
          label: TYPES[p.tag].label,
          lane: p.lane,
          progress: p.progress,
          resolved: p.resolved,
          outcome: p.outcome,
          outTimer: p.outTimer,
          perfect: p.perfect
        };
      })
    };
  }

  function consumeEvents(state) {
    if (!state) return [];
    var events = state.events;
    state.events = [];
    return events;
  }

  return {
    DURATION: DURATION,
    DOOR_HOLD: DOOR_HOLD,
    DOOR_LINE: DOOR_LINE,
    TYPES: TYPES,
    createGame: createGame,
    start: start,
    press: press,
    update: update,
    autoStep: autoStep,
    snapshot: snapshot,
    consumeEvents: consumeEvents,
    rank: rank,
    mulberry32: mulberry32
  };
});
