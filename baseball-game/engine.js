/* engine.js : 9球種ベースボールゲームのコアロジック（UI非依存） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.BaseballEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STRAIGHT = 'straight';
  var CURVE = 'curve';
  var TOTAL_INNINGS = 3;
  var STRIKES_PER_INNING = 3;
  var BALLS_PER_WALK = 4;

  var PITCH_ORDER = [
    'straight', 'curve', 'slider', 'cutter', 'fork',
    'changeup', 'shoot', 'sinker', 'knuckle'
  ];

  var PITCH_LABELS = {
    straight: 'ストレート',
    curve: 'カーブ',
    slider: 'スライダー',
    cutter: 'カットボール',
    fork: 'フォーク',
    changeup: 'チェンジアップ',
    shoot: 'シュート',
    sinker: 'シンカー',
    knuckle: 'ナックル'
  };

  /* CPUピッチャーの球種使用率（合計100） */
  var BASE_WEIGHTS = {
    straight: 22,
    curve: 12,
    slider: 16,
    cutter: 10,
    fork: 11,
    changeup: 10,
    shoot: 7,
    sinker: 7,
    knuckle: 5
  };

  /* 球種ごとのストライクゾーン率（見逃したときストライクになる確率） */
  var ZONE_RATES = {
    straight: 0.70,
    cutter: 0.68,
    slider: 0.55,
    curve: 0.48,
    shoot: 0.55,
    fork: 0.40,
    sinker: 0.45,
    changeup: 0.62,
    knuckle: 0.50
  };

  /* 配球ヒント: HINT_RATE の確率でヒント提示、そのうち HINT_MATCH の割合で本当にその球が来る */
  var HINT_RATE = 0.72;
  var HINT_MATCH = 0.62;

  /* CPU打者の読み: 頻度・連投・交互パターンで精度が上がる */
  var CPU_READ_BASE = 0.44;
  var CPU_READ_BONUS = 0.28;
  var CPU_READ_WINDOW = 10;
  var CPU_STREAK_BONUS = 0.03;
  var CPU_STREAK_CAP = 0.09;
  var CPU_PATTERN_BONUS = 0.12;
  var CPU_READ_MAX = 0.9;

  /* タイミング判定のしきい値（中央からのズレ%） */
  var TIMING_BANDS = { hr: 7, double: 18 };

  function pitchLabel(pitch) { return PITCH_LABELS[pitch] || String(pitch); }

  function weightedPick(weights, rng) {
    rng = rng || Math.random;
    var total = 0, k;
    for (k in weights) {
      if (Object.prototype.hasOwnProperty.call(weights, k)) total += weights[k];
    }
    var r = rng() * total;
    for (var i = 0; i < PITCH_ORDER.length; i++) {
      k = PITCH_ORDER[i];
      if (weights[k] == null) continue;
      r -= weights[k];
      if (r <= 0) return k;
    }
    return PITCH_ORDER[0];
  }

  function randomPitch(rng) {
    rng = rng || Math.random;
    return PITCH_ORDER[Math.floor(rng() * PITCH_ORDER.length) % PITCH_ORDER.length];
  }

  function randomPitchExcept(key, rng) {
    rng = rng || Math.random;
    var k = randomPitch(rng);
    var guard = 0;
    while (k === key && guard < 50) { k = randomPitch(rng); guard++; }
    return k;
  }

  /* 相手ピッチャーの1球を計画:
   * { hint: 球種|または null, actual: 実際の球種, zone: ストライクゾーンか } */
  function planPitch(rng) {
    rng = rng || Math.random;
    var hint = null;
    var actual;
    if (rng() < HINT_RATE) {
      hint = weightedPick(BASE_WEIGHTS, rng);
      actual = (rng() < HINT_MATCH) ? hint : weightedPick(BASE_WEIGHTS, rng);
    } else {
      actual = weightedPick(BASE_WEIGHTS, rng);
    }
    return { hint: hint, actual: actual, zone: rng() < (ZONE_RATES[actual] || 0.5) };
  }

  /* タイミングのズレ(%)から打球結果を決める */
  function timingResult(offset) {
    var a = Math.abs(offset);
    if (a <= TIMING_BANDS.hr) return 'hr';
    if (a <= TIMING_BANDS.double) return 'double';
    return 'single';
  }

  /* CPU打者の予想を決める（プレイヤーの投球履歴を読む）。
   * state.playerHistory に投球を記録する副作用あり。 */
  function cpuBatterDecision(state, chosenPitch, rng) {
    rng = rng || Math.random;
    var hist = state.playerHistory || [];
    var count = 0;
    for (var i = Math.max(0, hist.length - CPU_READ_WINDOW); i < hist.length; i++) {
      if (hist[i] === chosenPitch) count++;
    }
    var streak = 0;
    for (var s = hist.length - 1; s >= 0 && hist[s] === chosenPitch; s--) streak++;
    var pattern = false;
    if (hist.length >= 4) {
      var a = hist[hist.length - 4], b = hist[hist.length - 3];
      var c = hist[hist.length - 2], d = hist[hist.length - 1];
      if (a === c && b === d && a !== b) pattern = true;
    }
    var accuracy = CPU_READ_BASE +
      CPU_READ_BONUS * Math.min(1, count / 5) +
      Math.min(CPU_STREAK_CAP, CPU_STREAK_BONUS * streak) +
      (pattern ? CPU_PATTERN_BONUS : 0);
    if (accuracy > CPU_READ_MAX) accuracy = CPU_READ_MAX;
    var correct = rng() < accuracy;
    hist.push(chosenPitch);
    if (hist.length > 30) hist.shift();
    state.playerHistory = hist;
    return {
      guess: correct ? chosenPitch : randomPitchExcept(chosenPitch, rng),
      correct: correct,
      accuracy: accuracy,
      streak: streak,
      pattern: pattern
    };
  }

  function createGame() {
    var linescore = { away: [], home: [] };
    for (var i = 0; i < TOTAL_INNINGS; i++) {
      linescore.away.push(null);
      linescore.home.push(null);
    }
    return {
      totalInnings: TOTAL_INNINGS,
      strikesPerInning: STRIKES_PER_INNING,
      ballsPerWalk: BALLS_PER_WALK,
      inning: 1,
      half: 'top',
      strikes: 0,
      balls: 0,
      runners: [false, false, false],
      score: { away: 0, home: 0 },
      hits: { away: 0, home: 0 },
      linescore: linescore,
      playerHistory: [],
      over: false,
      result: null
    };
  }

  function battingTeam(state) { return state.half === 'top' ? 'away' : 'home'; }

  function fieldingTeam(state) { return state.half === 'top' ? 'home' : 'away'; }

  function halfLabel(state) {
    return state.inning + '回' + (state.half === 'top' ? '表' : '裏');
  }

  function addInningRun(state, team) {
    var idx = state.inning - 1;
    if (state.linescore[team][idx] === null) state.linescore[team][idx] = 0;
    state.linescore[team][idx] += 1;
    state.score[team] += 1;
  }

  function finishGame(state, result) {
    state.over = true;
    state.result = result;
  }

  function checkWalkoff(state, ev) {
    if (state.half === 'bottom' && state.inning === state.totalInnings &&
      state.score.home > state.score.away) {
      ev.walkoff = true;
      ev.gameEnded = true;
      ev.result = 'home';
      finishGame(state, 'home');
    }
  }

  function endHalf(state) {
    var batting = battingTeam(state);
    if (state.linescore[batting][state.inning - 1] === null) {
      state.linescore[batting][state.inning - 1] = 0;
    }
    state.strikes = 0;
    state.balls = 0;
    state.runners = [false, false, false];

    if (state.half === 'top') {
      if (state.inning === state.totalInnings && state.score.home > state.score.away) {
        finishGame(state, 'home');
        return { gameEnded: true, result: 'home' };
      }
      state.half = 'bottom';
    } else {
      if (state.inning === state.totalInnings) {
        var r = state.score.home > state.score.away ? 'home' :
          (state.score.home < state.score.away ? 'away' : 'draw');
        finishGame(state, r);
        return { gameEnded: true, result: r };
      }
      state.inning += 1;
      state.half = 'top';
    }
    return { gameEnded: false, result: null };
  }

  /* 空振り/見逃し以外の判定: 予想が当たったかだけを返す（進塁は resolveHit で行う） */
  function resolvePitch(state, batterGuess, actualPitch) {
    if (state.over) throw new Error('game is already over');
    var ev = {
      guess: batterGuess,
      actual: actualPitch,
      correct: batterGuess === actualPitch,
      strikeout: false,
      inningEnded: false,
      gameEnded: false,
      result: null
    };
    if (!ev.correct) {
      state.strikes += 1;
      if (state.strikes >= STRIKES_PER_INNING) {
        ev.strikeout = true;
        ev.inningEnded = true;
        var ended = endHalf(state);
        ev.gameEnded = ended.gameEnded;
        ev.result = ended.result;
      }
    }
    return ev;
  }

  /* 見逃し: zone=true なら見逃しストライク、false ならボール（4球で四球） */
  function resolveTake(state, inZone) {
    if (state.over) throw new Error('game is already over');
    var ev = {
      took: true,
      inZone: !!inZone,
      walk: false,
      calledStrike: false,
      runs: 0,
      strikeout: false,
      inningEnded: false,
      walkoff: false,
      gameEnded: false,
      result: null
    };
    if (inZone) {
      state.strikes += 1;
      ev.calledStrike = true;
      if (state.strikes >= STRIKES_PER_INNING) {
        ev.strikeout = true;
        ev.inningEnded = true;
        var ended = endHalf(state);
        ev.gameEnded = ended.gameEnded;
        ev.result = ended.result;
      }
      return ev;
    }
    state.balls += 1;
    if (state.balls >= BALLS_PER_WALK) {
      var batting = battingTeam(state);
      if (state.runners[2]) {
        addInningRun(state, batting);
        ev.runs = 1;
      }
      state.runners = [true, state.runners[0], state.runners[1]];
      state.balls = 0;
      ev.walk = true;
      checkWalkoff(state, ev);
    }
    return ev;
  }

  /* 打球結果: 'single' | 'double' | 'hr' で進塁・得点を適用 */
  function resolveHit(state, kind) {
    if (state.over) throw new Error('game is already over');
    var batting = battingTeam(state);
    var ev = {
      kind: kind,
      runs: 0,
      walkoff: false,
      gameEnded: false,
      result: null
    };
    if (kind === 'hr') {
      for (var i = 0; i < 3; i++) {
        if (state.runners[i]) { addInningRun(state, batting); ev.runs++; }
      }
      addInningRun(state, batting);
      ev.runs++;
      state.runners = [false, false, false];
    } else {
      var bases = kind === 'double' ? 2 : 1;
      var before = state.runners;
      var after = [false, false, false];
      for (var j = 2; j >= 0; j--) {
        if (!before[j]) continue;
        var dest = j + bases;
        if (dest >= 3) { addInningRun(state, batting); ev.runs++; }
        else after[dest] = true;
      }
      after[bases - 1] = true;
      state.runners = after;
    }
    state.hits[batting] += 1;
    state.balls = 0;
    checkWalkoff(state, ev);
    return ev;
  }

  return {
    STRAIGHT: STRAIGHT,
    CURVE: CURVE,
    TOTAL_INNINGS: TOTAL_INNINGS,
    STRIKES_PER_INNING: STRIKES_PER_INNING,
    BALLS_PER_WALK: BALLS_PER_WALK,
    PITCH_ORDER: PITCH_ORDER,
    PITCH_LABELS: PITCH_LABELS,
    BASE_WEIGHTS: BASE_WEIGHTS,
    ZONE_RATES: ZONE_RATES,
    HINT_RATE: HINT_RATE,
    HINT_MATCH: HINT_MATCH,
    CPU_READ_BASE: CPU_READ_BASE,
    CPU_READ_BONUS: CPU_READ_BONUS,
    CPU_PATTERN_BONUS: CPU_PATTERN_BONUS,
    TIMING_BANDS: TIMING_BANDS,
    pitchLabel: pitchLabel,
    weightedPick: weightedPick,
    randomPitch: randomPitch,
    randomPitchExcept: randomPitchExcept,
    planPitch: planPitch,
    timingResult: timingResult,
    cpuBatterDecision: cpuBatterDecision,
    createGame: createGame,
    battingTeam: battingTeam,
    fieldingTeam: fieldingTeam,
    halfLabel: halfLabel,
    resolvePitch: resolvePitch,
    resolveTake: resolveTake,
    resolveHit: resolveHit
  };
});
