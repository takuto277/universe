/* engine.js : TWIN（一人二役クライム）のコアロジック */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TwinEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 480;
  var MARGIN = 26;
  var TWIN_R = 11;
  var OFFSET = 120;
  var DELAY = 0.4;
  var STEER = 200;
  var GATE_GAP = 145;
  var FIRST_GATE = 260;
  var MAX_LIVES = 3;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 120;
  var CLEAR_TIME = 1.4;

  // gap はゲートの開口幅、delta は隣り合うゲート中心の最大ズレ。
  // 2体のxをずらせる量は STEER * DELAY = 80 なので、delta はそれを超えない。
  var STAGES = [
    { climb: 78, gap: 88, delta: 40, target: 1120 },
    { climb: 96, gap: 76, delta: 44, target: 1400 },
    { climb: 114, gap: 66, delta: 48, target: 1680 }
  ];

  var COLORS = { front: '#5df4ff', rear: '#ff7bc8' };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  function emit(state, type, extra) {
    var ev = { type: type, t: state.time };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      }
    }
    state.events.push(ev);
    if (state.events.length > MAX_EVENTS) state.events.shift();
  }

  function makeTwins() {
    return {
      front: { key: 'front', x: W / 2, y: OFFSET, dir: 0, lag: DELAY, color: COLORS.front },
      rear: { key: 'rear', x: W / 2, y: 0, dir: 0, lag: 0, color: COLORS.rear }
    };
  }

  function applyLag(state) {
    state.twins.front.lag = state.lagOwner === 'front' ? DELAY : 0;
    state.twins.rear.lag = state.lagOwner === 'rear' ? DELAY : 0;
  }

  function resetTwins(state) {
    state.distance = 0;
    state.twins.front.x = W / 2;
    state.twins.front.y = OFFSET;
    state.twins.front.dir = 0;
    state.twins.rear.x = W / 2;
    state.twins.rear.y = 0;
    state.twins.rear.dir = 0;
    applyLag(state);
  }

  function buildStage(state) {
    var cfg = STAGES[state.stage];
    var half = cfg.gap / 2;
    var minC = MARGIN + half;
    var maxC = W - MARGIN - half;
    var center = W / 2;
    state.gates = [];
    for (var y = FIRST_GATE; y <= cfg.target + GATE_GAP; y += GATE_GAP) {
      center = clamp(center + (state.rng() * 2 - 1) * cfg.delta, minC, maxC);
      state.gates.push({
        y: y,
        center: center,
        half: half,
        frontPassed: false,
        rearPassed: false
      });
    }
    resetTwins(state);
  }

  function createGame(opts) {
    opts = opts || {};
    return {
      rng: opts.rng || Math.random,
      phase: 'idle',
      stage: 0,
      time: 0,
      distance: 0,
      totalDistance: 0,
      lives: MAX_LIVES,
      gateScore: 0,
      stageBonus: 0,
      gatesPassed: 0,
      hits: 0,
      swaps: 0,
      input: 0,
      history: [{ t: 0, dir: 0 }],
      lagOwner: 'front',
      twins: makeTwins(),
      gates: [],
      events: [],
      result: null,
      clearTimer: 0
    };
  }

  function start(state) {
    if (!state) return false;
    state.phase = 'playing';
    state.stage = 0;
    state.time = 0;
    state.distance = 0;
    state.totalDistance = 0;
    state.lives = MAX_LIVES;
    state.gateScore = 0;
    state.stageBonus = 0;
    state.gatesPassed = 0;
    state.hits = 0;
    state.swaps = 0;
    state.input = 0;
    state.history = [{ t: 0, dir: 0 }];
    state.lagOwner = 'front';
    state.twins = makeTwins();
    state.events = [];
    state.result = null;
    state.clearTimer = 0;
    applyLag(state);
    buildStage(state);
    emit(state, 'start');
    return true;
  }

  function sampleDir(state, lag) {
    var target = state.time - lag;
    var dir = 0;
    for (var i = 0; i < state.history.length; i++) {
      if (state.history[i].t <= target + 1e-9) dir = state.history[i].dir;
      else break;
    }
    return dir;
  }

  function setInput(state, dir) {
    if (!state || state.phase !== 'playing') return false;
    dir = sign(dir);
    if (dir === state.input) return true;
    state.input = dir;
    state.history.push({ t: state.time, dir: dir });
    if (state.history.length > 256) state.history.shift();
    return true;
  }

  function swap(state) {
    if (!state || state.phase !== 'playing') return false;
    state.lagOwner = state.lagOwner === 'front' ? 'rear' : 'front';
    state.swaps++;
    applyLag(state);
    emit(state, 'swap', { lag: state.lagOwner });
    return true;
  }

  function scoreOf(state) {
    return Math.floor((state.totalDistance + state.distance) / 10) + state.gateScore + state.stageBonus;
  }

  function finish(state, reason) {
    state.phase = 'finished';
    state.clearTimer = 0;
    state.result = {
      reason: reason,
      stage: state.stage + 1,
      stages: STAGES.length,
      height: Math.floor((state.totalDistance + state.distance) / 10),
      score: scoreOf(state),
      gates: state.gatesPassed,
      hits: state.hits,
      swaps: state.swaps
    };
    emit(state, 'finish', { reason: reason });
  }

  function fail(state) {
    if (state.lives <= 0) finish(state, 'down');
  }

  function checkTwinGates(state, twin) {
    var flag = twin.key + 'Passed';
    for (var i = 0; i < state.gates.length; i++) {
      var gate = state.gates[i];
      if (gate[flag]) continue;
      if (gate.y > twin.y) break;
      gate[flag] = true;
      if (Math.abs(twin.x - gate.center) <= gate.half) {
        state.gatesPassed++;
        state.gateScore += 12;
        emit(state, 'pass', { twin: twin.key });
      } else {
        state.hits++;
        state.lives--;
        twin.x = gate.center;
        emit(state, 'hit', { twin: twin.key, lives: state.lives });
        if (state.lives <= 0) {
          fail(state);
          return;
        }
      }
    }
  }

  function updateTwin(state, twin, y, dt) {
    twin.dir = sampleDir(state, twin.lag);
    twin.x = clamp(twin.x + twin.dir * STEER * dt, MARGIN, W - MARGIN);
    twin.y = y;
  }

  function advanceStage(state) {
    state.totalDistance += STAGES[state.stage].target;
    state.distance = 0;
    if (state.stage >= STAGES.length - 1) {
      finish(state, 'clear');
      return;
    }
    state.stage++;
    state.clearTimer = 0;
    state.phase = 'playing';
    state.input = 0;
    state.history = [{ t: state.time, dir: 0 }];
    buildStage(state);
    emit(state, 'stageStart', { stage: state.stage + 1 });
  }

  function update(state, dt) {
    if (!state) return;
    dt = clamp(dt, 0, MAX_DT);
    if (state.phase === 'clear') {
      state.clearTimer -= dt;
      if (state.clearTimer <= 0) advanceStage(state);
      return;
    }
    if (state.phase !== 'playing') return;

    state.time += dt;
    var cfg = STAGES[state.stage];
    state.distance += cfg.climb * dt;

    updateTwin(state, state.twins.front, state.distance + OFFSET, dt);
    updateTwin(state, state.twins.rear, state.distance, dt);

    checkTwinGates(state, state.twins.front);
    if (state.phase === 'playing') checkTwinGates(state, state.twins.rear);

    if (state.phase === 'playing' && state.distance >= cfg.target) {
      state.phase = 'clear';
      state.clearTimer = CLEAR_TIME;
      state.lives = MAX_LIVES;
      state.stageBonus += 100;
      emit(state, 'stageClear', { stage: state.stage + 1 });
    }
  }

  function nextGateFor(state, key) {
    var flag = key + 'Passed';
    var twin = state.twins[key];
    for (var i = 0; i < state.gates.length; i++) {
      var gate = state.gates[i];
      if (!gate[flag] && gate.y >= twin.y) return gate;
    }
    return null;
  }

  function projectedMiss(state, key, dir) {
    var twin = state.twins[key];
    var gate = nextGateFor(state, key);
    if (!gate) return 0;
    var cfg = STAGES[state.stage];
    var timeTo = Math.max(0, (gate.y - twin.y) / cfg.climb);
    var moveTime = Math.max(0, timeTo - twin.lag);
    var x = clamp(twin.x + dir * STEER * moveTime, MARGIN, W - MARGIN);
    return Math.abs(x - gate.center) / Math.max(1, gate.half);
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') {
      start(state);
      return;
    }
    if (state.phase !== 'playing') return;
    var bestDir = 0;
    var bestCost = Infinity;
    for (var d = -1; d <= 1; d++) {
      var cost = projectedMiss(state, 'front', d) + projectedMiss(state, 'rear', d);
      if (cost < bestCost) {
        bestCost = cost;
        bestDir = d;
      }
    }
    setInput(state, bestDir);
  }

  function snapshot(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      stage: state.stage + 1,
      stages: STAGES.length,
      time: state.time,
      distance: state.distance,
      totalDistance: state.totalDistance,
      height: Math.floor((state.totalDistance + state.distance) / 10),
      lives: state.lives,
      maxLives: MAX_LIVES,
      score: scoreOf(state),
      gatesPassed: state.gatesPassed,
      hits: state.hits,
      swaps: state.swaps,
      lagOwner: state.lagOwner,
      clearTimer: state.clearTimer,
      twins: {
        front: {
          x: state.twins.front.x,
          y: state.twins.front.y,
          dir: state.twins.front.dir,
          lag: state.twins.front.lag,
          color: COLORS.front
        },
        rear: {
          x: state.twins.rear.x,
          y: state.twins.rear.y,
          dir: state.twins.rear.dir,
          lag: state.twins.rear.lag,
          color: COLORS.rear
        }
      },
      gates: state.gates.map(function (gate) {
        return {
          y: gate.y,
          center: gate.center,
          half: gate.half,
          frontPassed: gate.frontPassed,
          rearPassed: gate.rearPassed
        };
      }),
      result: state.result
    };
  }

  return {
    W: W,
    MARGIN: MARGIN,
    TWIN_R: TWIN_R,
    OFFSET: OFFSET,
    DELAY: DELAY,
    STEER: STEER,
    GATE_GAP: GATE_GAP,
    FIRST_GATE: FIRST_GATE,
    MAX_LIVES: MAX_LIVES,
    STAGES: STAGES,
    COLORS: COLORS,
    createGame: createGame,
    start: start,
    update: update,
    setInput: setInput,
    swap: swap,
    autoStep: autoStep,
    snapshot: snapshot,
    scoreOf: scoreOf,
    mulberry32: mulberry32
  };
});
