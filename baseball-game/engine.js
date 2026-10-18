/* engine.js : ストレート or カーブ! 野球ゲームのコアロジック（UI非依存） */
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
  var PITCH_LABELS = { straight: 'ストレート', curve: 'カーブ' };

  function pitchLabel(pitch) { return PITCH_LABELS[pitch] || String(pitch); }

  function randomPitch() { return Math.random() < 0.5 ? STRAIGHT : CURVE; }

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
    pitchLabel: pitchLabel,
    randomPitch: randomPitch,
    createGame: createGame,
    battingTeam: battingTeam,
    fieldingTeam: fieldingTeam,
    halfLabel: halfLabel,
    resolvePitch: resolvePitch
  };
});
