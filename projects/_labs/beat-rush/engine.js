/* engine.js : BEAT RUSH（4レーンリズムゲームのコアロジック） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BeatRushEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DURATION = 30;
  var BPM = 128;
  var BEAT = 60 / BPM;
  var APPROACH = 1.7;
  var LANES = 4;
  var WINDOWS = { perfect: 0.055, good: 0.11, ok: 0.18 };
  var MAX_DT = 0.05;
  var MAX_EVENTS = 120;
  var PATTERN = [0, 1, 2, 3, 2, 1, 0, 2, 3, 1, 2, 0, 1, 3, 2, 1];

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

  function buildChart(state) {
    var notes = [];
    var id = 1;
    var step = 0;
    for (var t = 2; t < DURATION - 1.1; t += BEAT) {
      var lane = PATTERN[step % PATTERN.length];
      notes.push({ id: id++, lane: lane, time: t, hit: false, judgment: null, offset: 0 });
      if (step % 8 === 7) {
        notes.push({ id: id++, lane: (lane + 2) % LANES, time: t, hit: false, judgment: null, offset: 0 });
      }
      step++;
    }
    state.notes = notes;
    state.totalNotes = notes.length;
  }

  function reset(state) {
    state.phase = 'idle';
    state.time = 0;
    state.remaining = DURATION;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.perfect = 0;
    state.good = 0;
    state.ok = 0;
    state.missed = 0;
    state.weighted = 0;
    state.judged = 0;
    state.over = false;
    state.result = null;
    state.events = [];
    buildChart(state);
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

  function judgeOffset(abs) {
    if (abs <= WINDOWS.perfect) return 'PERFECT';
    if (abs <= WINDOWS.good) return 'GOOD';
    if (abs <= WINDOWS.ok) return 'OK';
    return null;
  }

  function press(state, lane) {
    if (!state || state.phase !== 'run') return null;
    lane = Number(lane);
    if (lane < 0 || lane >= LANES || lane !== Math.floor(lane)) return null;
    var best = null;
    var bestAbs = Infinity;
    for (var i = 0; i < state.notes.length; i++) {
      var note = state.notes[i];
      if (note.hit || note.lane !== lane) continue;
      var abs = Math.abs(state.time - note.time);
      if (abs <= WINDOWS.ok && abs < bestAbs) {
        bestAbs = abs;
        best = note;
      }
    }
    if (!best) {
      pushEvent(state, { type: 'empty', lane: lane });
      return null;
    }
    var judgment = judgeOffset(bestAbs);
    best.hit = true;
    best.judgment = judgment;
    best.offset = state.time - best.time;
    state.judged++;
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    if (judgment === 'PERFECT') {
      state.perfect++;
      state.weighted += 1;
      state.score += 100 + Math.min(100, state.combo * 2);
    } else if (judgment === 'GOOD') {
      state.good++;
      state.weighted += 0.7;
      state.score += 60 + Math.min(60, state.combo);
    } else {
      state.ok++;
      state.weighted += 0.4;
      state.score += 30;
    }
    pushEvent(state, { type: 'hit', lane: lane, judgment: judgment, offset: best.offset, note: best });
    return best;
  }

  function missNote(state, note) {
    note.hit = true;
    note.judgment = 'MISS';
    state.missed++;
    state.judged++;
    state.combo = 0;
    pushEvent(state, { type: 'miss', lane: note.lane, note: note });
  }

  function accuracy(state) {
    if (!state.judged) return 100;
    return state.weighted / state.judged * 100;
  }

  function rank(acc) {
    if (acc >= 97) return 'S';
    if (acc >= 90) return 'A';
    if (acc >= 80) return 'B';
    if (acc >= 65) return 'C';
    return 'D';
  }

  function finish(state) {
    state.phase = 'over';
    state.over = true;
    state.remaining = 0;
    var acc = accuracy(state);
    state.result = {
      score: state.score,
      maxCombo: state.maxCombo,
      perfect: state.perfect,
      good: state.good,
      ok: state.ok,
      missed: state.missed,
      total: state.totalNotes,
      accuracy: acc,
      rank: rank(acc)
    };
    pushEvent(state, { type: 'finish', result: state.result });
  }

  function update(state, dt) {
    if (!state || state.phase !== 'run') return state;
    dt = clamp(Number(dt) || 0, 0, MAX_DT);
    state.time += dt;
    state.remaining = Math.max(0, DURATION - state.time);

    for (var i = 0; i < state.notes.length; i++) {
      var note = state.notes[i];
      if (!note.hit && state.time - note.time > WINDOWS.ok) missNote(state, note);
    }

    if (state.time >= DURATION) finish(state);
    return state;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase !== 'run') return;
    var next = null;
    for (var i = 0; i < state.notes.length; i++) {
      var note = state.notes[i];
      if (note.hit) continue;
      if (!next || note.time < next.time) next = note;
    }
    if (next && Math.abs(state.time - next.time) <= 0.03) press(state, next.lane);
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
      perfect: state.perfect,
      good: state.good,
      ok: state.ok,
      missed: state.missed,
      judged: state.judged,
      totalNotes: state.totalNotes,
      accuracy: accuracy(state),
      rank: rank(accuracy(state)),
      over: state.over,
      result: state.result,
      notes: state.notes.map(function (n) {
        return { id: n.id, lane: n.lane, time: n.time, hit: n.hit, judgment: n.judgment, offset: n.offset };
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
    BPM: BPM,
    BEAT: BEAT,
    APPROACH: APPROACH,
    LANES: LANES,
    WINDOWS: WINDOWS,
    createGame: createGame,
    start: start,
    press: press,
    update: update,
    autoStep: autoStep,
    snapshot: snapshot,
    consumeEvents: consumeEvents,
    rank: rank,
    accuracy: accuracy,
    mulberry32: mulberry32
  };
});
