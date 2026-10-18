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
  var TOTAL_INNINGS = 10;
  var STRIKES_PER_INNING = 3;

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

  /* 配球ヒント: HINT_RATE の確率でヒント提示、そのうち HINT_MATCH の割合で本当にその球が来る */
  var HINT_RATE = 0.72;
  var HINT_MATCH = 0.55;

  /* CPU打者の読み: 直近の同じ球の多さで精度が上がる */
  var CPU_READ_BASE = 0.36;
  var CPU_READ_BONUS = 0.28;
  var CPU_READ_WINDOW = 10;

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

  /* 相手ピッチャーの1球を計画: { hint: 球種|または null, actual: 実際の球種 } */
  function planPitch(rng) {
    rng = rng || Math.random;
    if (rng() < HINT_RATE) {
      var hint = weightedPick(BASE_WEIGHTS, rng);
      var actual = (rng() < HINT_MATCH) ? hint : weightedPick(BASE_WEIGHTS, rng);
      return { hint: hint, actual: actual };
    }
    return { hint: null, actual: weightedPick(BASE_WEIGHTS, rng) };
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
    var accuracy = CPU_READ_BASE + CPU_READ_BONUS * Math.min(1, count / 5);
    var correct = rng() < accuracy;
    hist.push(chosenPitch);
    if (hist.length > 30) hist.shift();
    state.playerHistory = hist;
    return {
      guess: correct ? chosenPitch : randomPitchExcept(chosenPitch, rng),
      correct: correct,
      accuracy: accuracy
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
      inning: 1,
      half: 'top',
      strikes: 0,
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

  function endHalf(state) {
    var batting = battingTeam(state);
    if (state.linescore[batting][state.inning - 1] === null) {
      state.linescore[batting][state.inning - 1] = 0;
    }
    state.strikes = 0;
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

  function resolvePitch(state, batterGuess, actualPitch) {
    if (state.over) throw new Error('game is already over');
    var ev = {
      guess: batterGuess,
      actual: actualPitch,
      correct: batterGuess === actualPitch,
      runs: 0,
      strikeout: false,
      inningEnded: false,
      walkoff: false,
      gameEnded: false,
      result: null
    };
    var batting = battingTeam(state);

    if (ev.correct) {
      state.hits[batting] += 1;
      if (state.runners[2]) {
        addInningRun(state, batting);
        ev.runs = 1;
      }
      state.runners = [true, state.runners[0], state.runners[1]];

      if (state.half === 'bottom' && state.inning === state.totalInnings &&
        state.score.home > state.score.away) {
        ev.walkoff = true;
        ev.gameEnded = true;
        ev.result = 'home';
        finishGame(state, 'home');
      }
    } else {
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

  return {
    STRAIGHT: STRAIGHT,
    CURVE: CURVE,
    TOTAL_INNINGS: TOTAL_INNINGS,
    STRIKES_PER_INNING: STRIKES_PER_INNING,
    PITCH_ORDER: PITCH_ORDER,
    PITCH_LABELS: PITCH_LABELS,
    BASE_WEIGHTS: BASE_WEIGHTS,
    HINT_RATE: HINT_RATE,
    HINT_MATCH: HINT_MATCH,
    pitchLabel: pitchLabel,
    weightedPick: weightedPick,
    randomPitch: randomPitch,
    randomPitchExcept: randomPitchExcept,
    planPitch: planPitch,
    cpuBatterDecision: cpuBatterDecision,
    createGame: createGame,
    battingTeam: battingTeam,
    fieldingTeam: fieldingTeam,
    halfLabel: halfLabel,
    resolvePitch: resolvePitch
  };
});
