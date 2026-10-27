/* engine.js : 未知語de交渉 v4（文法と意図を読むスマホゲーム）
 *
 * 品物は最初から見えている。未知語は「私 / あなた / 否定」などの文法語。
 * 商人の短い文としぐさを読み、差し出す / 受け取る / 断る を選ぶ。
 * 迷ったら2硬貨で未知語の意味を確認できる。3人のあと契約書を読む。
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
    bread: { label: 'パン', kind: 'noun' },
    fish: { label: '魚', kind: 'noun' },
    gem: { label: '宝石', kind: 'noun' },
    me: { label: '私', kind: 'pronoun' },
    you: { label: 'あなた', kind: 'pronoun' },
    want: { label: '欲しい', kind: 'verb' },
    not: { label: '否定', kind: 'particle' }
  };
  var CONCEPT_ORDER = ['bread', 'fish', 'gem', 'me', 'you', 'want', 'not'];
  var GOODS = ['bread', 'fish', 'gem'];
  var ACTIONS = {
    give: { label: '差し出す', sub: '品を渡す' },
    take: { label: '受け取る', sub: '品をもらう' },
    refuse: { label: '断る', sub: '取引しない' }
  };
  var CONFIRM_COST = 2;
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
    var subject = meaning.subject === 'me' ? '私は' : 'あなたは';
    return subject + CONCEPTS[meaning.object].label + 'が' + (meaning.negated ? '欲しくない' : '欲しい');
  }

  function shuffleScenes(scenes, seed) {
    var rng = mulberry32((seed ^ 0x85ebca6b) >>> 0);
    var out = scenes.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function buildScenes(lang) {
    return [
      {
        id: 'bread',
        item: 'bread',
        unknown: 'me',
        correctAction: 'give',
        merchant: { name: 'ムウ', title: '市場の顔役', accent: 'amber' },
        line: ['me', 'bread', 'want'],
        gesture: '商人は自分の胸に手を当て、目の前の品をそっと差し出した。',
        prompt: 'どうする?',
        explain: '「? パン 欲しい」なら、欲しがっているのは商人自身。パンを差し出すのが正解。',
        revealCorrect: 'ムウはパンを受け取り、満足そうにうなずいた。',
        revealWrong: 'ムウはあなたの返事を聞いて、首をかしげた。'
      },
      {
        id: 'fish',
        item: 'fish',
        unknown: 'not',
        correctAction: 'refuse',
        merchant: { name: 'リサ', title: '新顔の商人', accent: 'teal' },
        line: ['me', 'fish', 'want', 'not'],
        gesture: '商人は品を押し返し、首を横に振った。',
        prompt: 'どうする?',
        explain: '「私 魚 欲しい ?」の ? が否定なら、魚は欲しくない。断るのが正解。',
        revealCorrect: 'リサは魚を引っ込め、安堵したように笑った。',
        revealWrong: 'リサは魚を押しつけられて、困った顔をした。'
      },
      {
        id: 'gem',
        item: 'gem',
        unknown: null,
        correctAction: 'take',
        merchant: { name: 'ゼン', title: '老練な商人', accent: 'violet' },
        line: ['me', 'gem', 'want', 'not'],
        gesture: '商人は「いらない」と言いながら、品をあなたのほうへ押し出した。',
        prompt: 'どうする?',
        explain: '「私 宝石 欲しい 否定」= 欲しくない。でも、押し出すしぐさは「持っていけ」。だから受け取るのが正解。',
        revealCorrect: 'ゼンは宝石をあなたに押し出し、したり顔で硬貨を数えた。',
        revealWrong: 'ゼンは宝石を引っ込め、つまらなそうにあくびをした。'
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
    var scenes = shuffleScenes(buildScenes(lang), initialSeed);
    var gameApi = null;
    var listeners = [];
    var state = {
      seed: initialSeed >>> 0,
      hasStarted: false,
      phase: 'start',
      sceneIndex: 0,
      scenePhase: 'guess',
      coins: 0,
      learned: {},
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

    function initialLearned() {
      var learned = {};
      for (var i = 0; i < CONCEPT_ORDER.length; i++) {
        var id = CONCEPT_ORDER[i];
        learned[id] = isGood(id) || id === 'want' || id === 'you';
      }
      return learned;
    }

    function initRun(seed) {
      state.seed = seed >>> 0;
      lang = generateLanguage(state.seed);
      scenes = shuffleScenes(buildScenes(lang), state.seed);
      if (gameApi) {
        gameApi.lang = lang;
        gameApi.scenes = scenes;
      }
      state.phase = 'scene';
      state.sceneIndex = 0;
      state.scenePhase = 'guess';
      state.coins = 0;
      state.learned = initialLearned();
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

    function canConfirm() {
      if (state.phase !== 'scene' || state.scenePhase !== 'guess') return false;
      var scene = currentScene();
      return !!(scene && scene.unknown && !state.learned[scene.unknown]);
    }

    function confirmWord() {
      if (!canConfirm()) return false;
      var scene = currentScene();
      state.coins -= CONFIRM_COST;
      state.learned[scene.unknown] = true;
      state.sceneResult = null;
      emit();
      return true;
    }

    function chooseAction(action) {
      if (state.phase !== 'scene' || state.scenePhase !== 'guess') return false;
      if (!ACTIONS[action]) return false;
      var scene = currentScene();
      var correct = action === scene.correctAction;
      var delta = correct ? 10 : 3;
      state.coins += delta;
      if (scene.unknown) state.learned[scene.unknown] = true;

      var unknownPart = scene.unknown
        ? '『' + lang.words[scene.unknown] + '』は「' + CONCEPTS[scene.unknown].label + '」だった。 '
        : '';
      var actionPart = correct ? '' : '正解は「' + ACTIONS[scene.correctAction].label + '」。 ';
      var result = {
        correct: correct,
        chosenAction: action,
        chosenLabel: ACTIONS[action].label,
        correctAction: scene.correctAction,
        correctLabel: ACTIONS[scene.correctAction].label,
        coinsDelta: delta,
        title: correct ? '正解!' : '読み違えた',
        detail: unknownPart + actionPart + scene.explain,
        message: correct ? scene.revealCorrect : scene.revealWrong
      };
      state.sceneResult = result;
      state.history.push({
        sceneNumber: state.sceneIndex + 1,
        correct: correct,
        chosenLabel: result.chosenLabel,
        correctLabel: result.correctLabel,
        coinsDelta: delta,
        unknown: scene.unknown
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
        if (state.scenePhase === 'guess') { chooseAction(currentScene().correctAction); return; }
        if (state.scenePhase === 'result') { nextScene(); return; }
      }
      if (state.phase === 'contract' && state.contract && !state.contract.decided) {
        if (state.contract.effect > 0) signContract();
        else refuseContract();
      }
    }

    function lineView(scene) {
      return scene.line.map(function (id) {
        var known = !!state.learned[id];
        return {
          word: lang.words[id],
          concept: id,
          label: known ? CONCEPTS[id].label : null,
          known: known,
          unknown: !known
        };
      });
    }

    function actionsView() {
      return ['give', 'take', 'refuse'].map(function (id) {
        return { id: id, label: ACTIONS[id].label, sub: ACTIONS[id].sub };
      });
    }

    function contractMemoView() {
      return ['me', 'you', 'want', 'fish'].map(function (id) {
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
        item: scene ? {
          id: scene.item,
          label: CONCEPTS[scene.item].label,
          word: lang.words[scene.item]
        } : null,
        line: scene ? lineView(scene) : [],
        gesture: scene ? scene.gesture : '',
        prompt: scene ? scene.prompt : '',
        unknownWord: scene && scene.unknown ? lang.words[scene.unknown] : '',
        canConfirm: canConfirm(),
        confirmCost: CONFIRM_COST,
        actions: actionsView(),
        learned: {
          bread: !!state.learned.bread,
          fish: !!state.learned.fish,
          gem: !!state.learned.gem,
          me: !!state.learned.me,
          you: !!state.learned.you,
          want: !!state.learned.want,
          not: !!state.learned.not
        },
        coins: state.coins,
        sceneResult: state.sceneResult,
        history: state.history.slice(),
        canAct: state.phase === 'scene' && state.scenePhase === 'guess',
        canNext: state.phase === 'scene' && state.scenePhase === 'result',
        nextLabel: state.sceneIndex >= scenes.length - 1 ? '契約書へ' : '次の商人へ',
        contract: contractView(),
        contractMemo: contractMemoView(),
        contractDecided: !!(state.contract && state.contract.decided),
        contractSigned: !!(state.contract && state.contract.signed),
        review: reviewView(),
        rank: state.rank,
        score: state.score,
        endedAt: state.endedAt,
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
      confirmWord: confirmWord,
      chooseAction: chooseAction,
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
    ACTIONS: ACTIONS,
    CONFIRM_COST: CONFIRM_COST
  };
});
