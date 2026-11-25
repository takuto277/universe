/* engine.js : TUTOR（3回の手本でAIを鍛えるゲーム） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TutorEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 480;
  var H = 800;
  var ROBOT_Y = 700;
  var ROBOT_R = 16;
  var SPEED = 330;
  var DEMO_COUNT = 3;
  var DEMO_TIME = 6;
  var TRAIN_PAUSE = 1.2;
  var TRIAL_COUNT = 10;
  var TRIAL_TIME = 5;
  var EVAL_SPEED = 3;
  var SAMPLE_INTERVAL = 0.05;
  var MAX_SAMPLES = 900;
  var K = 5;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 120;
  var CATCH_R = 38;
  var HIT_R = 22;
  var OBJECT_BAND = 36;

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
    var ev = { type: type, t: state.phase === 'eval' ? state.trialTimer : state.demoTimer };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      }
    }
    state.events.push(ev);
    if (state.events.length > MAX_EVENTS) state.events.shift();
  }

  function createGame(opts) {
    opts = opts || {};
    return {
      rng: opts.rng || Math.random,
      phase: 'idle',
      demoIndex: 0,
      demoTimer: 0,
      demoCores: 0,
      sampleTimer: 0,
      phaseTimer: 0,
      samples: [],
      robot: { x: W / 2, y: ROBOT_Y, r: ROBOT_R },
      input: 0,
      aiDir: 0,
      objects: [],
      spawnTimer: 0,
      trialIndex: 0,
      trialTimer: 0,
      trialCores: 0,
      hits: 0,
      stun: 0,
      trials: [],
      events: [],
      result: null
    };
  }

  function start(state) {
    if (!state) return false;
    state.phase = 'demo';
    state.demoIndex = 0;
    state.samples = [];
    state.trials = [];
    state.events = [];
    state.result = null;
    state.phaseTimer = 0;
    state.trialIndex = 0;
    state.trialTimer = 0;
    state.trialCores = 0;
    state.hits = 0;
    state.stun = 0;
    setupDemo(state);
    emit(state, 'start');
    return true;
  }

  function setupDemo(state) {
    state.phase = 'demo';
    state.demoTimer = 0;
    state.demoCores = 0;
    state.sampleTimer = 0;
    state.objects = [];
    state.spawnTimer = 0.35;
    state.robot.x = W / 2;
    state.input = 0;
    state.aiDir = 0;
    state.stun = 0;
    emit(state, 'demoStart', { index: state.demoIndex });
  }

  function spawnObject(state) {
    var bombChance = 0.22;
    if (state.phase === 'eval') bombChance = Math.min(0.32, 0.22 + state.trialIndex * 0.008);
    var kind = state.rng() < bombChance ? 'bomb' : 'core';
    state.objects.push({
      kind: kind,
      x: 38 + state.rng() * (W - 76),
      y: -26,
      vy: 340 + state.rng() * 80,
      r: kind === 'core' ? 11 : 12
    });
  }

  function nearestOf(state, kind) {
    var best = null;
    var bestY = -Infinity;
    for (var i = 0; i < state.objects.length; i++) {
      var obj = state.objects[i];
      if (obj.kind !== kind) continue;
      if (obj.y > ROBOT_Y + 10) continue;
      if (obj.y > bestY) {
        bestY = obj.y;
        best = obj;
      }
    }
    return best;
  }

  function featuresFor(state) {
    var robot = state.robot;
    var core = nearestOf(state, 'core');
    var bomb = nearestOf(state, 'bomb');
    return [
      core ? clamp((core.x - robot.x) / 240, -2, 2) : -2,
      core ? clamp((core.y - robot.y) / 800, -1, 0) : -1,
      bomb ? clamp((bomb.x - robot.x) / 240, -2, 2) : -2,
      bomb ? clamp((bomb.y - robot.y) / 800, -1, 0) : -1
    ];
  }

  function recordSample(state) {
    state.samples.push({ f: featuresFor(state), a: state.input });
    if (state.samples.length > MAX_SAMPLES) state.samples.shift();
  }

  function predict(state, features) {
    var samples = state.samples;
    if (!samples.length) return 0;
    var candidates = [];
    for (var i = 0; i < samples.length; i++) {
      var sample = samples[i];
      var d = 0;
      for (var j = 0; j < features.length; j++) {
        var diff = features[j] - sample.f[j];
        d += diff * diff;
      }
      candidates.push({ d: d, a: sample.a });
    }
    candidates.sort(function (a, b) { return a.d - b.d; });
    var count = Math.min(K, candidates.length);
    var weighted = 0;
    var total = 0;
    for (i = 0; i < count; i++) {
      var w = 1 / (candidates[i].d + 1e-4);
      weighted += w * candidates[i].a;
      total += w;
    }
    var vote = total > 0 ? weighted / total : 0;
    if (vote > 0.06) return 1;
    if (vote < -0.06) return -1;
    return 0;
  }

  function aiDirection(state) {
    return predict(state, featuresFor(state));
  }

  function moveRobot(state, dir, dt) {
    state.robot.x = clamp(
      state.robot.x + dir * SPEED * dt,
      ROBOT_R + 6,
      W - ROBOT_R - 6
    );
  }

  function updateObjects(state, dt) {
    for (var i = state.objects.length - 1; i >= 0; i--) {
      var obj = state.objects[i];
      obj.y += obj.vy * dt;
      if (obj.y > H + 40) {
        state.objects.splice(i, 1);
        continue;
      }
      if (Math.abs(obj.y - ROBOT_Y) > OBJECT_BAND) continue;
      var dx = Math.abs(obj.x - state.robot.x);
      if (obj.kind === 'core') {
        if (dx >= CATCH_R) continue;
        state.objects.splice(i, 1);
        if (state.phase === 'eval') state.trialCores++;
        else state.demoCores++;
        emit(state, 'catch', { x: obj.x, y: obj.y });
      } else if (dx < HIT_R) {
        state.objects.splice(i, 1);
        state.hits++;
        state.stun = 0.6;
        if (state.phase === 'eval') state.trialCores = Math.max(0, state.trialCores - 1);
        else state.demoCores = Math.max(0, state.demoCores - 1);
        emit(state, 'bomb', { x: obj.x, y: obj.y });
      }
    }
  }

  function startTraining(state) {
    state.phase = 'train';
    state.phaseTimer = TRAIN_PAUSE;
    state.objects = [];
    state.robot.x = W / 2;
    state.input = 0;
    state.aiDir = 0;
    // 左右反転した手本も加え、少ないデモで左右の判断を補う。
    var mirrored = [];
    for (var i = 0; i < state.samples.length; i++) {
      var sample = state.samples[i];
      mirrored.push({ f: [-sample.f[0], sample.f[1], -sample.f[2], sample.f[3]], a: -sample.a });
    }
    state.samples = state.samples.concat(mirrored);
    emit(state, 'train', { samples: state.samples.length });
  }

  function advanceDemo(state) {
    if (state.demoIndex >= DEMO_COUNT - 1) {
      startTraining(state);
      return;
    }
    state.demoIndex++;
    setupDemo(state);
  }

  function startTrial(state, index) {
    state.phase = 'eval';
    state.trialIndex = index;
    state.trialTimer = 0;
    state.trialCores = 0;
    state.objects = [];
    state.spawnTimer = 0.3;
    state.robot.x = W / 2;
    state.aiDir = 0;
    state.input = 0;
    state.stun = 0;
    emit(state, 'trialStart', { index: index });
  }

  function rankOf(cores) {
    if (cores >= 34) return 'S';
    if (cores >= 26) return 'A';
    if (cores >= 19) return 'B';
    if (cores >= 11) return 'C';
    return 'D';
  }

  function finish(state) {
    var cores = 0;
    for (var i = 0; i < state.trials.length; i++) {
      cores += state.trials[i].cores;
    }
    state.phase = 'finished';
    state.result = {
      score: cores,
      cores: cores,
      trials: TRIAL_COUNT,
      trialsDone: state.trials.length,
      hits: state.hits,
      samples: state.samples.length,
      rank: rankOf(cores),
      perTrial: state.trials.map(function (trial) { return trial.cores; })
    };
    emit(state, 'finish', { score: cores });
  }

  function endTrial(state) {
    state.trials.push({
      cores: state.trialCores,
      time: state.trialTimer
    });
    if (state.trialIndex + 1 < TRIAL_COUNT) {
      startTrial(state, state.trialIndex + 1);
    } else {
      finish(state);
    }
  }

  function update(state, dt) {
    if (!state || state.phase === 'idle' || state.phase === 'finished') return;
    dt = clamp(dt, 0, MAX_DT);

    if (state.phase === 'demo') {
      state.demoTimer += dt;
      state.sampleTimer += dt;
      if (state.stun <= 0) moveRobot(state, state.input, dt);
      state.stun = Math.max(0, state.stun - dt);
      state.spawnTimer -= dt;
      while (state.spawnTimer <= 0) {
        spawnObject(state);
        state.spawnTimer += 0.5 + state.rng() * 0.14;
      }
      updateObjects(state, dt);
      while (state.sampleTimer >= SAMPLE_INTERVAL) {
        recordSample(state);
        state.sampleTimer -= SAMPLE_INTERVAL;
      }
      if (state.demoTimer >= DEMO_TIME) advanceDemo(state);
      return;
    }

    if (state.phase === 'train') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) startTrial(state, 0);
      return;
    }

    if (state.phase === 'eval') {
      var simDt = Math.min(0.12, dt * EVAL_SPEED);
      state.trialTimer += simDt;
      state.aiDir = aiDirection(state);
      if (state.stun <= 0) moveRobot(state, state.aiDir, simDt);
      state.stun = Math.max(0, state.stun - simDt);
      state.spawnTimer -= simDt;
      while (state.spawnTimer <= 0) {
        spawnObject(state);
        state.spawnTimer += 0.5 + state.rng() * 0.14;
      }
      updateObjects(state, simDt);
      if (state.trialTimer >= TRIAL_TIME) endTrial(state);
    }
  }

  function setInput(state, dir) {
    if (!state || state.phase !== 'demo') return false;
    state.input = sign(dir);
    return true;
  }

  function autoDirection(state) {
    var robot = state.robot;
    var bomb = nearestOf(state, 'bomb');
    if (bomb) {
      var dy = ROBOT_Y - bomb.y;
      if (dy > 0 && dy < 170 && Math.abs(bomb.x - robot.x) < 42) {
        return robot.x < bomb.x ? -1 : 1;
      }
    }
    var core = nearestOf(state, 'core');
    if (core) {
      var dx = core.x - robot.x;
      if (Math.abs(dx) < 6) return 0;
      return dx > 0 ? 1 : -1;
    }
    if (robot.x < W / 2 - 10) return 1;
    if (robot.x > W / 2 + 10) return -1;
    return 0;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') {
      start(state);
      return;
    }
    if (state.phase !== 'demo') return;
    state.input = autoDirection(state);
  }

  function scoreSoFar(state) {
    var total = 0;
    for (var i = 0; i < state.trials.length; i++) total += state.trials[i].cores;
    if (state.phase === 'eval') total += state.trialCores;
    return total;
  }

  function snapshot(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      demoIndex: state.demoIndex + 1,
      demoCount: DEMO_COUNT,
      demoTimer: state.demoTimer,
      demoTime: DEMO_TIME,
      demoCores: state.demoCores,
      samples: state.samples.length,
      robot: { x: state.robot.x, y: state.robot.y, r: state.robot.r },
      input: state.input,
      aiDir: state.aiDir,
      objects: state.objects.map(function (obj) {
        return { kind: obj.kind, x: obj.x, y: obj.y, r: obj.r };
      }),
      trialIndex: state.trialIndex + 1,
      trialCount: TRIAL_COUNT,
      trialTimer: state.trialTimer,
      trialTime: TRIAL_TIME,
      trialCores: state.trialCores,
      hits: state.hits,
      stun: state.stun,
      trials: state.trials.map(function (trial) {
        return { cores: trial.cores, time: trial.time };
      }),
      scoreSoFar: scoreSoFar(state),
      phaseTimer: state.phaseTimer,
      result: state.result
    };
  }

  return {
    W: W,
    H: H,
    ROBOT_Y: ROBOT_Y,
    ROBOT_R: ROBOT_R,
    SPEED: SPEED,
    DEMO_COUNT: DEMO_COUNT,
    DEMO_TIME: DEMO_TIME,
    TRAIN_PAUSE: TRAIN_PAUSE,
    TRIAL_COUNT: TRIAL_COUNT,
    TRIAL_TIME: TRIAL_TIME,
    EVAL_SPEED: EVAL_SPEED,
    SAMPLE_INTERVAL: SAMPLE_INTERVAL,
    CATCH_R: CATCH_R,
    HIT_R: HIT_R,
    createGame: createGame,
    start: start,
    update: update,
    setInput: setInput,
    autoStep: autoStep,
    featuresFor: featuresFor,
    predict: predict,
    aiDirection: aiDirection,
    scoreSoFar: scoreSoFar,
    snapshot: snapshot,
    mulberry32: mulberry32
  };
});
