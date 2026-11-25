/* engine.js : OOPS のコアロジック（UI非依存）
 *
 * 時計は止まっている。誤答したときだけ、時が進む。
 * 90秒の「誤答予算」で18問に挑む4択クイズ。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OopsEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var START_TIME = 90;
  var WRONG_PENALTY = 10;
  var TOTAL_QUESTIONS = 18;
  var QUESTION_MS = 7000;
  var REVEAL_MS = 850;
  var BASE_POINTS = 100;
  var TIME_BONUS_PER_SEC = 15;

  var QUESTIONS = [
    { category: 'さんすう', q: '三角形の内角の和は？', choices: ['90度', '180度', '270度', '360度'], a: 1 },
    { category: 'せいかつ', q: '1ダースは何個？', choices: ['6個', '10個', '12個', '24個'], a: 2 },
    { category: 'ひっかけ', q: '地球に一番近い天体は？', choices: ['月', '太陽', '火星', '金星'], a: 0 },
    { category: 'ちず', q: '太陽系で地球は太陽から数えて何番目？', choices: ['2番目', '3番目', '4番目', '5番目'], a: 1 },
    { category: 'さんすう', q: '1時間は何秒？', choices: ['600秒', '1800秒', '3600秒', '6000秒'], a: 2 },
    { category: 'いきもの', q: 'コウモリは何類？', choices: ['鳥類', '哺乳類', '爬虫類', '両生類'], a: 1 },
    { category: 'いきもの', q: 'カエルは何類？', choices: ['魚類', '爬虫類', '両生類', '哺乳類'], a: 2 },
    { category: 'ひっかけ', q: '1 + 1 × 2 の答えは？', choices: ['2', '3', '4', '5'], a: 1 },
    { category: 'ちず', q: '日本で一番長い川は？', choices: ['利根川', '信濃川', '石狩川', '淀川'], a: 1 },
    { category: 'ちず', q: '富士山の高さは？', choices: ['3,576m', '3,676m', '3,776m', '3,876m'], a: 2 },
    { category: 'しぜん', q: '1年で昼が最も短い日は？', choices: ['春分', '夏至', '秋分', '冬至'], a: 3 },
    { category: 'スポーツ', q: 'サッカーは1チーム何人（フィールド）？', choices: ['9人', '10人', '11人', '12人'], a: 2 },
    { category: 'スポーツ', q: 'バスケットボールは1チーム何人（コート）？', choices: ['4人', '5人', '6人', '7人'], a: 1 },
    { category: 'しぜん', q: '水が氷になると体積は？', choices: ['増える', '減る', '変わらない', '0になる'], a: 0 },
    { category: 'ことば', q: '「ありがとう」を英語で？', choices: ['Good morning', 'Thank you', 'Excuse me', 'Good night'], a: 1 },
    { category: 'せいかつ', q: 'うるう年は何日？', choices: ['364日', '365日', '366日', '367日'], a: 2 },
    { category: 'しぜん', q: '虹は日本で一般に何色？', choices: ['5色', '6色', '7色', '8色'], a: 2 },
    { category: 'せいかつ', q: '時計の長い針が1周すると何分？', choices: ['1分', '10分', '60分', '12時間'], a: 2 },
    { category: 'ことば', q: 'ひらがなの「あ」は何画？', choices: ['1画', '2画', '3画', '4画'], a: 2 },
    { category: 'ことば', q: '「山」を英語で？', choices: ['River', 'Mountain', 'Sky', 'Forest'], a: 1 },
    { category: 'せいかつ', q: '信号機の「止まれ」は何色？', choices: ['青', '黄', '赤', '白'], a: 2 },
    { category: 'さんすう', q: '1メートルは何センチ？', choices: ['10cm', '50cm', '100cm', '1000cm'], a: 2 },
    { category: 'おんがく', q: 'ドレミファソラシは全部で何音？', choices: ['5音', '6音', '7音', '8音'], a: 2 },
    { category: 'ひっかけ', q: '「しんぶんし」を逆から読むと？', choices: ['しんぶんし', 'しぶんしん', 'しんしぶん', 'んしぶんし'], a: 0 },
    { category: 'ちず', q: '日本で一番高い山は？', choices: ['北岳', '奥穂高岳', '富士山', '立山'], a: 2 }
  ];

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function buildDeck(rng) {
    var deck = shuffle(QUESTIONS, rng).slice(0, TOTAL_QUESTIONS);
    var out = [];
    for (var i = 0; i < deck.length; i++) {
      var item = deck[i];
      out.push({
        category: item.category,
        q: item.q,
        choices: item.choices.slice(),
        a: item.a
      });
    }
    return out;
  }

  function createGame(opts) {
    opts = opts || {};
    var rng = opts.seed == null ? Math.random : makeRng(opts.seed);
    return {
      phase: 'idle',
      rng: rng,
      seed: opts.seed == null ? null : opts.seed,
      questions: buildDeck(rng),
      index: 0,
      current: null,
      elapsedMs: 0,
      revealLeft: 0,
      reveal: null,
      timeLeft: START_TIME,
      score: 0,
      combo: 0,
      bestCombo: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      clear: false,
      result: null
    };
  }

  function loadQuestion(state) {
    state.current = state.questions[state.index] || null;
    state.elapsedMs = 0;
    state.reveal = null;
    state.revealLeft = 0;
    state.phase = state.current ? 'question' : 'over';
  }

  function start(state) {
    if (!state) return false;
    state.questions = buildDeck(state.rng);
    state.index = 0;
    state.timeLeft = START_TIME;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.correct = 0;
    state.wrong = 0;
    state.skipped = 0;
    state.clear = false;
    state.result = null;
    loadQuestion(state);
    return true;
  }

  function speedBonus(elapsedMs) {
    if (elapsedMs <= 1200) return { bonus: 100, label: 'FLASH' };
    if (elapsedMs <= 2600) return { bonus: 60, label: 'FAST' };
    if (elapsedMs <= 4500) return { bonus: 30, label: 'OK' };
    return { bonus: 0, label: 'SLOW' };
  }

  function multiplierFor(combo) {
    return 1 + Math.min(Math.max(combo - 1, 0), 4) * 0.1;
  }

  function wrongIndexFor(question) {
    return (question.a + 1) % question.choices.length;
  }

  function enterReveal(state, reveal) {
    state.reveal = reveal;
    state.revealLeft = REVEAL_MS;
    state.phase = 'reveal';
  }

  function answer(state, choiceIndex) {
    if (!state || state.phase !== 'question' || !state.current) return false;
    var question = state.current;
    var chosen = choiceIndex;
    var isCorrect = chosen === question.a;

    if (isCorrect) {
      var speed = speedBonus(state.elapsedMs);
      var comboAfter = state.combo + 1;
      var multiplier = multiplierFor(comboAfter);
      var gained = Math.round((BASE_POINTS + speed.bonus) * multiplier);
      state.combo = comboAfter;
      if (state.combo > state.bestCombo) state.bestCombo = state.combo;
      state.score += gained;
      state.correct++;
      enterReveal(state, {
        chosen: chosen,
        correctIndex: question.a,
        wrong: false,
        skipped: false,
        timedOut: false,
        gained: gained,
        penalty: 0,
        label: speed.label,
        multiplier: multiplier
      });
    } else {
      state.combo = 0;
      state.wrong++;
      state.timeLeft = Math.max(0, state.timeLeft - WRONG_PENALTY);
      enterReveal(state, {
        chosen: chosen,
        correctIndex: question.a,
        wrong: true,
        skipped: false,
        timedOut: false,
        gained: 0,
        penalty: WRONG_PENALTY,
        label: 'OOPS',
        multiplier: 1
      });
    }
    return true;
  }

  function skip(state, timedOut) {
    if (!state || state.phase !== 'question' || !state.current) return false;
    state.combo = 0;
    state.skipped++;
    enterReveal(state, {
      chosen: -1,
      correctIndex: state.current.a,
      wrong: false,
      skipped: true,
      timedOut: !!timedOut,
      gained: 0,
      penalty: 0,
      label: timedOut ? 'TIME OUT' : 'SKIP',
      multiplier: 1
    });
    return true;
  }

  function nextQuestion(state) {
    state.reveal = null;
    state.revealLeft = 0;
    state.index++;
    if (state.timeLeft <= 0) {
      finish(state, false);
      return;
    }
    if (state.index >= state.questions.length) {
      finish(state, true);
      return;
    }
    loadQuestion(state);
  }

  function update(state, dtMs) {
    if (!state) return;
    var dt = dtMs;
    if (!(dt > 0)) return;
    if (dt > 200) dt = 200;

    if (state.phase === 'question') {
      state.elapsedMs += dt;
      if (state.elapsedMs >= QUESTION_MS) skip(state, true);
    } else if (state.phase === 'reveal') {
      state.revealLeft -= dt;
      if (state.revealLeft <= 0) nextQuestion(state);
    }
  }

  function rankFor(state) {
    if (!state.clear) {
      if (state.correct >= 12) return 'C';
      if (state.correct >= 7) return 'D';
      return 'E';
    }
    if (state.score >= 5200) return 'S';
    if (state.score >= 4000) return 'A';
    if (state.score >= 2800) return 'B';
    return 'C';
  }

  function finish(state, clear) {
    state.clear = !!clear;
    state.phase = 'over';
    var timeBonus = clear ? Math.round(state.timeLeft * TIME_BONUS_PER_SEC) : 0;
    state.score += timeBonus;
    state.result = {
      score: state.score,
      timeLeft: state.timeLeft,
      timeBonus: timeBonus,
      correct: state.correct,
      wrong: state.wrong,
      skipped: state.skipped,
      bestCombo: state.bestCombo,
      clear: state.clear,
      rank: rankFor(state)
    };
  }

  function autoStep(state) {
    if (!state || state.phase !== 'question' || !state.current) return;
    answer(state, state.current.a);
  }

  function snapshot(state) {
    if (!state) return null;
    var current = state.current
      ? { category: state.current.category, q: state.current.q, choices: state.current.choices.slice() }
      : null;
    return {
      phase: state.phase,
      current: current,
      index: state.index,
      total: state.questions.length,
      elapsedMs: state.elapsedMs,
      reveal: state.reveal,
      timeLeft: state.timeLeft,
      score: state.score,
      combo: state.combo,
      bestCombo: state.bestCombo,
      correct: state.correct,
      wrong: state.wrong,
      skipped: state.skipped,
      clear: state.clear,
      result: state.result
    };
  }

  return {
    START_TIME: START_TIME,
    WRONG_PENALTY: WRONG_PENALTY,
    TOTAL_QUESTIONS: TOTAL_QUESTIONS,
    QUESTION_MS: QUESTION_MS,
    REVEAL_MS: REVEAL_MS,
    BASE_POINTS: BASE_POINTS,
    QUESTIONS: QUESTIONS,
    createGame: createGame,
    start: start,
    answer: answer,
    skip: skip,
    update: update,
    autoStep: autoStep,
    snapshot: snapshot,
    wrongIndexFor: wrongIndexFor,
    speedBonus: speedBonus,
    multiplierFor: multiplierFor
  };
});
