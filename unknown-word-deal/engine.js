/* engine.js : 未知語de交渉 v3（スマホ向け・1画面1判断）
 *
 * 1ラン = 3人の商人 + 最後の契約書。
 * 各商人は短い文で品物を求める。文の中の未知語がどの品かを
 * 3つの品物カードから選ぶ。当たれば+10硬貨、外れれば+3硬貨。
 * 最後に契約書を読んで、署名するか断るかを選ぶ。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LangEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONCEPTS = {
    bread: { label: 'パン', kind: 'noun', group: '品物' },
    fish: { label: '魚', kind: 'noun', group: '品物' },
    gem: { label: '宝石', kind: 'noun', group: '品物' },
    me: { label: '私', kind: 'pronoun', group: '人' },
    you: { label: 'あなた', kind: 'pronoun', group: '人' },
    want: { label: '欲しい', kind: 'verb', group: '動き' },
    not: { label: '否定', kind: 'particle', group: '文法' }
  };
  var CONCEPT_ORDER = ['bread', 'fish', 'gem', 'me', 'you', 'want', 'not'];
  var GOODS = ['bread', 'fish', 'gem'];
  var KNOWN_CONCEPTS = ['me', 'you', 'want', 'not'];
  var ONSETS = ['k', 'm', 't', 'r', 'p', 'n', 's', 'g', 'z', 'h', 'b', 'd', 'v', 'l'];
  var VOWELS = ['a', 'i', 'u', 'e', 'o'];

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generateLanguage(seed) {
    var rand = mulberry32(seed >>> 0);
    var pool = [];
    for (var i = 0; i < ONSETS.length; i++) {
      for (var j = 0; j < VOWELS.length; j++) pool.push(ONSETS[i] + VOWELS[j]);
    }
    for (var k = pool.length - 1; k > 0; k--) {
      var n = Math.floor(rand() * (k + 1));
      var tmp = pool[k];
      pool[k] = pool[n];
      pool[n] = tmp;
    }
    var words = {};
    var byWord = {};
    for (var c = 0; c < CONCEPT_ORDER.length; c++) {
      var id = CONCEPT_ORDER[c];
      words[id] = pool[c];
      byWord[pool[c]] = id;
    }
    return { seed: seed >>> 0, words: words, byWord: byWord };
  }

  function surface(concepts, lang) {
    return concepts.map(function (id) { return lang.words[id]; });
  }

  function isGood(id) { return GOODS.indexOf(id) >= 0; }
  function isPronoun(id) { return id === 'me' || id === 'you'; }

  function classify(concepts) {
    if (!concepts || !concepts.length) return null;
    var c = concepts.slice();
    var negated = false;
    if (c[c.length - 1] === 'not') {
      negated = true;
      c.pop();
    }
    if (!c.length || c[c.length - 1] !== 'want') return null;
    c.pop();
    if (c.length === 2 && isPronoun(c[0]) && isGood(c[1])) {
      return { type: 'want', subject: c[0], object: c[1], negated: negated };
    }
    if (c.length === 1 && isGood(c[0])) {
      return { type: 'want', subject: null, object: c[0], negated: negated };
    }
    return null;
  }

  function parse(tokens, lang) {
    var concepts = [];
    for (var i = 0; i < tokens.length; i++) {
      var id = lang.byWord[tokens[i]];
      if (!id) return null;
      concepts.push(id);
    }
    return classify(concepts);
  }

  function toJapanese(meaning) {
    if (!meaning) return '';
    var subject = meaning.subject === 'me' ? '私は' : (meaning.subject === 'you' ? 'あなたは' : '');
    return subject + CONCEPTS[meaning.object].label + 'が' + (meaning.negated ? '欲しくない' : '欲しい');
  }

  function buildScenes(lang) {
    return [
      {
        id: 'bread',
        target: 'bread',
        merchant: { name: 'ムウ', title: '市場の顔役', accent: 'amber' },
        line: ['me', 'bread', 'want'],
        gesture: 'ムウはパンのほうを一瞬見た。',
        prompt: 'ムウが欲しいのはどれ?',
        twist: '',
        revealCorrect: 'ムウはパンを受け取り、満足そうにうなずいた。',
        revealWrong: 'ムウは代わりの品を受け取り、硬貨を3枚だけ置いた。'
      },
      {
        id: 'fish',
        target: 'fish',
        merchant: { name: 'リサ', title: '新顔の商人', accent: 'teal' },
        line: ['me', 'fish', 'want'],
        gesture: 'リサは魚のにおいを確かめるように笑った。',
        prompt: 'リサが欲しいのはどれ?',
        twist: '',
        revealCorrect: 'リサは魚を受け取り、うれしそうに袋へ入れた。',
        revealWrong: 'リサは代わりの品を渋々受け取った。'
      },
      {
        id: 'gem',
        target: 'gem',
        merchant: { name: 'ゼン', title: '老練な商人', accent: 'violet' },
        line: ['me', 'gem', 'want', 'not'],
        gesture: 'ゼンは宝石を布の下からのぞかせた。',
        prompt: 'ゼンが本当に欲しいのはどれ?',
        twist: '「いらない」と言っているが、しぐさは宝石を見ている。',
        revealCorrect: 'ゼンは「いらない」と言いながら、宝石を大事そうに包んだ。',
        revealWrong: 'ゼンは代わりの品を一瞥して、肩をすくめた。'
      }
    ];
  }

  function createContract(seed, lang) {
    var rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    var subject = rng() < 0.5 ? 'you' : 'me';
    var item = 'fish';
    return {
      tokens: surface([subject, item, 'want'], lang),
      subject: subject,
      item: item,
      effect: subject === 'you' ? 5 : -5,
      meaning: subject === 'you' ? 'あなたは魚が欲しい' : '私は魚が欲しい',
      decided: false,
      signed: false
    };
  }

  function createGame(options) {
    options = options || {};
    var initialSeed = (typeof options === 'number') ? options :
      (options.seed != null ? (options.seed >>> 0) : 12345);
    var lang = generateLanguage(initialSeed);
    var scenes = buildScenes(lang);
    var gameApi = null;
    var listeners = [];
    var state = {
      seed: initialSeed >>> 0,
      hasStarted: false,
      phase: 'start',
      sceneIndex: 0,
      scenePhase: 'guess',
      coins: 0,
      learned: { bread: false, fish: false, gem: false },
      sceneResult: null,
      history: [],
      contract: null,
      rank: null,
      score: 0,
      startedAt: 0,
      endedAt: 0
    };

    function emit() {
      var snap = getState();
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](snap); } catch (e) { /* UIの描画失敗で進行を止めない */ }
      }
    }

    function onChange(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    function currentScene() { return scenes[state.sceneIndex]; }
    function wordOf(conceptId) { return lang.words[conceptId]; }

    function initRun(seed) {
      state.seed = seed >>> 0;
      lang = generateLanguage(state.seed);
      scenes = buildScenes(lang);
      if (gameApi) {
        gameApi.lang = lang;
        gameApi.scenes = scenes;
      }
      state.phase = 'scene';
      state.sceneIndex = 0;
      state.scenePhase = 'guess';
      state.coins = 0;
      state.learned = { bread: false, fish: false, gem: false };
      state.sceneResult = null;
      state.history = [];
      state.contract = null;
      state.rank = null;
      state.score = 0;
      state.startedAt = Date.now();
      state.endedAt = 0;
      emit();
    }

    function nextSeed() {
      return Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
    }

    function start() {
      if (state.phase === 'scene' || state.phase === 'contract') return false;
      var seed = state.hasStarted ? nextSeed() : state.seed;
      state.hasStarted = true;
      initRun(seed);
      return true;
    }

    function restart(seed) {
      state.hasStarted = true;
      initRun(seed == null ? nextSeed() : (seed >>> 0));
      return true;
    }

    function backToStart() {
      state.phase = 'start';
      emit();
      return true;
    }

    function chooseItem(item) {
      if (state.phase !== 'scene' || state.scenePhase !== 'guess') return false;
      if (GOODS.indexOf(item) < 0) return false;
      var scene = currentScene();
      var correct = item === scene.target;
      var delta = correct ? 10 : 3;
      state.coins += delta;
      state.learned[scene.target] = true;

      var targetWord = lang.words[scene.target];
      var targetLabel = CONCEPTS[scene.target].label;
      var chosenLabel = CONCEPTS[item].label;
      var result = {
        correct: correct,
        chosen: item,
        chosenLabel: chosenLabel,
        target: scene.target,
        targetLabel: targetLabel,
        targetWord: targetWord,
        coinsDelta: delta,
        title: correct ? '正解!' : '読み違えた',
        message: correct ? scene.revealCorrect : scene.revealWrong,
        detail: '『' + targetWord + '』は' + targetLabel + 'だった。' +
          (correct ? '' : ' あなたは' + chosenLabel + 'を選んだ。')
      };
      state.sceneResult = result;
      state.history.push({
        sceneNumber: state.sceneIndex + 1,
        correct: correct,
        chosenLabel: chosenLabel,
        targetLabel: targetLabel,
        targetWord: targetWord,
        coinsDelta: delta
      });
      state.scenePhase = 'result';
      emit();
      return correct;
    }

    function nextScene() {
      if (state.phase !== 'scene' || state.scenePhase !== 'result') return false;
      if (state.sceneIndex < scenes.length - 1) {
        state.sceneIndex += 1;
        state.scenePhase = 'guess';
        state.sceneResult = null;
        emit();
        return true;
      }
      state.phase = 'contract';
      state.contract = createContract(state.seed, lang);
      emit();
      return true;
    }

    function finishContract(signed) {
      var contract = state.contract;
      if (!contract) return false;
      contract.decided = true;
      contract.signed = signed;
      if (signed) state.coins += contract.effect;
      state.score = state.coins;
      state.rank = state.coins >= 30 ? 'S' : (state.coins >= 23 ? 'A' : (state.coins >= 15 ? 'B' : 'C'));
      state.phase = 'ending';
      state.endedAt = Date.now();
      emit();
      return true;
    }

    function signContract() {
      if (state.phase !== 'contract' || !state.contract || state.contract.decided) return false;
      return finishContract(true);
    }

    function refuseContract() {
      if (state.phase !== 'contract' || !state.contract || state.contract.decided) return false;
      return finishContract(false);
    }

    function autoStep() {
      if (state.phase === 'start') { start(); return; }
      if (state.phase === 'scene') {
        if (state.scenePhase === 'guess') { chooseItem(currentScene().target); return; }
        if (state.scenePhase === 'result') { nextScene(); return; }
      }
      if (state.phase === 'contract' && state.contract && !state.contract.decided) {
        if (state.contract.effect > 0) signContract();
        else refuseContract();
      }
    }

    function lineView(scene) {
      return scene.line.map(function (id) {
        var known = KNOWN_CONCEPTS.indexOf(id) >= 0 || state.learned[id];
        return {
          word: lang.words[id],
          concept: id,
          label: known ? CONCEPTS[id].label : null,
          known: known,
          unknown: !known,
          isItem: GOODS.indexOf(id) >= 0
        };
      });
    }

    function choicesView() {
      return GOODS.map(function (id) {
        return {
          id: id,
          label: CONCEPTS[id].label,
          word: state.learned[id] ? lang.words[id] : null,
          learned: !!state.learned[id]
        };
      });
    }

    function knownWordsView() {
      return KNOWN_CONCEPTS.map(function (id) {
        return { id: id, word: lang.words[id], label: CONCEPTS[id].label };
      });
    }

    function contractMemoView() {
      return ['me', 'you', 'want'].map(function (id) {
        return { id: id, word: lang.words[id], label: CONCEPTS[id].label };
      });
    }

    function contractView() {
      var c = state.contract;
      if (!c) return null;
      return {
        tokens: c.tokens.slice(),
        decided: !!c.decided,
        signed: !!c.signed,
        meaning: c.decided ? c.meaning : null,
        effect: c.decided ? c.effect : null
      };
    }

    function reviewView() {
      var c = state.contract;
      if (!c || !c.decided) return null;
      var optimal = c.effect > 0 ? c.signed : !c.signed;
      return {
        tokens: c.tokens.slice(),
        meaning: c.meaning,
        effect: c.effect,
        signed: c.signed,
        optimal: optimal,
        correctChoice: c.effect > 0 ? '署名する' : '断る',
        playerChoice: c.signed ? '署名する' : '断る'
      };
    }

    function getState() {
      var scene = currentScene();
      var phaseLabel = state.phase === 'contract' ? '契約' : (state.phase === 'ending' ? '結果' : '商談');
      return {
        phase: state.phase,
        over: state.phase === 'ending',
        seed: state.seed,
        sceneIndex: state.sceneIndex,
        sceneNumber: state.sceneIndex + 1,
        sceneCount: scenes.length,
        scenePhase: state.scenePhase,
        phaseLabel: phaseLabel,
        merchant: scene ? scene.merchant : null,
        line: scene ? lineView(scene) : [],
        gesture: scene ? scene.gesture : '',
        prompt: scene ? scene.prompt : '',
        twist: scene ? scene.twist : '',
        unknownWord: scene ? lang.words[scene.target] : '',
        choices: choicesView(),
        knownWords: knownWordsView(),
        learned: {
          bread: !!state.learned.bread,
          fish: !!state.learned.fish,
          gem: !!state.learned.gem
        },
        coins: state.coins,
        sceneResult: state.sceneResult,
        history: state.history.slice(),
        canChoose: state.phase === 'scene' && state.scenePhase === 'guess',
        canNext: state.phase === 'scene' && state.scenePhase === 'result',
        nextLabel: state.sceneIndex >= scenes.length - 1 ? '契約書へ' : '次の商人へ',
        contract: contractView(),
        contractMemo: contractMemoView(),
        contractDecided: !!(state.contract && state.contract.decided),
        contractSigned: !!(state.contract && state.contract.signed),
        review: reviewView(),
        rank: state.rank,
        score: state.score,
        elapsedMs: state.startedAt ? ((state.endedAt || Date.now()) - state.startedAt) : 0
      };
    }

    gameApi = {
      state: state,
      lang: lang,
      scenes: scenes,
      onChange: onChange,
      start: start,
      restart: restart,
      backToStart: backToStart,
      chooseItem: chooseItem,
      nextScene: nextScene,
      signContract: signContract,
      refuseContract: refuseContract,
      autoStep: autoStep,
      getState: getState,
      conceptLabel: function (id) { return CONCEPTS[id] ? CONCEPTS[id].label : ''; },
      wordOf: wordOf
    };
    return gameApi;
  }

  return {
    createGame: createGame,
    generateLanguage: generateLanguage,
    surface: surface,
    parse: parse,
    classify: classify,
    toJapanese: toJapanese,
    CONCEPTS: CONCEPTS,
    CONCEPT_ORDER: CONCEPT_ORDER,
    GOODS: GOODS,
    KNOWN_CONCEPTS: KNOWN_CONCEPTS
  };
});
