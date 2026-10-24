/* test-engine.js : 未知語de交渉 v3 の言語・3択・損得・契約の検証（jsc で実行）
 * 実行例:
 *   cd unknown-word-deal && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = LangEngine;
}

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}
function log(message) { print(message); }

function newGame(seed) {
  var game = E.createGame({ seed: seed == null ? 12345 : seed });
  game.start();
  return game;
}

function driveTo(game, predicate, limit) {
  var steps = 0;
  while (!predicate(game.state) && steps < (limit || 2000)) {
    game.autoStep();
    steps++;
  }
  assert(steps < (limit || 2000), '自動進行が終わらない: phase=' + game.state.phase + ' scene=' + game.state.sceneIndex);
  return steps;
}

function lineConcept(state, id) {
  for (var i = 0; i < state.line.length; i++) {
    if (state.line[i].concept === id) return state.line[i];
  }
  return null;
}

function choice(state, id) {
  for (var i = 0; i < state.choices.length; i++) {
    if (state.choices[i].id === id) return state.choices[i];
  }
  return null;
}

/* 1) 言語生成は7語・シード固定・重複なし */
var a = E.generateLanguage(12345);
var b = E.generateLanguage(12345);
var c = E.generateLanguage(777);
assert(JSON.stringify(a.words) === JSON.stringify(b.words), '同じシードで語彙が変わる');
assert(JSON.stringify(a.words) !== JSON.stringify(c.words), '別シードで語彙が同じ');
var seen = {};
E.CONCEPT_ORDER.forEach(function (id) { seen[a.words[id]] = true; });
assert(Object.keys(seen).length === 7, '語形が7語でない/重複している');
assert(E.CONCEPT_ORDER.length === 7 && E.GOODS.length === 3 && E.KNOWN_CONCEPTS.length === 4, '概念/品物/既知語の数');

/* 2) 文法: 主語・品物・欲しい・否定 */
var lang = a;
function parseConcepts(ids) { return E.parse(E.surface(ids, lang), lang); }
var want = parseConcepts(['me', 'bread', 'want']);
assert(want && want.type === 'want' && want.subject === 'me' && want.object === 'bread' && !want.negated, 'want文');
var youWant = parseConcepts(['you', 'fish', 'want']);
assert(youWant && youWant.subject === 'you' && youWant.object === 'fish', 'you want文');
var deny = parseConcepts(['me', 'gem', 'want', 'not']);
assert(deny && deny.negated === true && deny.object === 'gem', '否定文');
assert(parseConcepts(['bread', 'me', 'want']) === null, '語順が違う文を受理している');
assert(E.toJapanese(youWant) === 'あなたは魚が欲しい', '日本語訳: ' + E.toJapanese(youWant));
assert(E.toJapanese(deny) === '私は宝石が欲しくない', '否定の日本語訳: ' + E.toJapanese(deny));

/* 3) 1人目: 未知語は品物。正解で+10、既知語には意味が付く */
var game = newGame();
var s = game.getState();
assert(s.phase === 'scene' && s.scenePhase === 'guess' && s.sceneNumber === 1, '開始状態が不正');
assert(s.line.length === 3, '1人目の文が3語でない');
assert(lineConcept(s, 'bread').unknown && !lineConcept(s, 'bread').label, 'パンの語が未知になっていない');
assert(lineConcept(s, 'me').known && lineConcept(s, 'me').label === '私', '私の語が既知になっていない');
assert(lineConcept(s, 'want').known && lineConcept(s, 'want').label === '欲しい', '欲しいの語が既知になっていない');
assert(s.choices.length === 3 && !choice(s, 'bread').learned && !choice(s, 'bread').word, '最初の品物カードが未知でない');
assert(s.canChoose && !s.canNext, '選択/次への状態が不正');
assert(game.chooseItem('bread') === true, '正しい品で+10にならない');
assert(game.state.coins === 10 && game.state.learned.bread === true, '正解時の硬貨/学習が不正');
var result = game.getState().sceneResult;
assert(result.correct && result.target === 'bread' && result.coinsDelta === 10, '結果が不正');
assert(result.detail.indexOf(game.lang.words.bread) >= 0 && result.detail.indexOf('パン') >= 0, '結果の語/意味がない');
assert(game.getState().scenePhase === 'result' && game.getState().canNext, '結果フェーズへ移らない');

/* 4) 2人目: 覚えた語がカードに出る。間違えると+3、対象の語は学ぶ */
game.nextScene();
s = game.getState();
assert(s.sceneNumber === 2 && s.scenePhase === 'guess', '2人目へ進めない');
assert(s.learned.bread && choice(s, 'bread').word === game.lang.words.bread, '覚えたパンの語がカードに出ない');
assert(lineConcept(s, 'fish').unknown, '魚の語が未知でない');
assert(game.chooseItem('gem') === false, '間違った品が正解扱い');
assert(game.state.coins === 13 && game.state.learned.fish === true, '間違い時の硬貨/学習が不正: ' + game.state.coins);
result = game.getState().sceneResult;
assert(!result.correct && result.target === 'fish' && result.chosen === 'gem' && result.coinsDelta === 3, '間違い結果が不正');
assert(result.detail.indexOf('魚') >= 0 && result.detail.indexOf('宝石') >= 0, '間違い結果の説明が不足');

/* 5) 3人目: 否定の文でも、しぐさと消去法で宝石を選ぶ */
game.nextScene();
s = game.getState();
assert(s.sceneNumber === 3 && s.twist.length > 0, '3人目のひねりがない');
assert(s.learned.bread && s.learned.fish, '3人目までにパン/魚が学べていない');
assert(lineConcept(s, 'gem').unknown && lineConcept(s, 'not').label === '否定', '3人目の未知語/否定が不正');
assert(choice(s, 'gem').learned === false && choice(s, 'bread').learned === true, '3人目の品物カードが不正');
assert(game.chooseItem('gem') === true, '3人目で宝石を選べない');
assert(game.state.coins === 23 && game.state.learned.gem === true, '3人目の精算/学習が不正');
game.nextScene();
assert(game.state.phase === 'contract' && game.state.contract, '3人目後に契約へ進めない');
s = game.getState();
assert(s.contract.tokens.length === 3, '契約の語数が3でない');
assert(s.contract.meaning === null && s.contract.effect === null, '契約の答えが署名前に見えている');
assert(s.contractMemo.length === 3 && s.knownWords.length === 4, '契約メモ/既知語の数が不正');

/* 6) 契約: 署名で効果、拒否で増減なし。読みの正解/不正解が review に出る */
var contract = game.state.contract;
var before = game.state.coins;
assert(game.signContract() === true, '契約に署名できない');
assert(game.state.coins === before + contract.effect, '署名の硬貨効果が不正');
s = game.getState();
assert(s.phase === 'ending' && s.review && s.review.signed === true, '署名後の終了状態が不正');
assert(s.review.effect === contract.effect && s.review.correctChoice === (contract.effect > 0 ? '署名する' : '断る'), 'レビューの正解が不正');
assert(s.contract.meaning !== null && s.contract.effect === contract.effect, '署名後に契約の意味が出ない');

game = newGame();
driveTo(game, function (st) { return st.phase === 'contract'; });
before = game.state.coins;
assert(game.refuseContract() === true, '契約を拒否できない');
assert(game.state.coins === before, '拒否で硬貨が変わった');
s = game.getState();
assert(s.phase === 'ending' && s.review.signed === false && s.review.playerChoice === '断る', '拒否のレビューが不正');

/* 7) 自動プレイ: 全問正解 + 契約最適でS評価 */
game = newGame();
driveTo(game, function (st) { return st.phase === 'ending'; });
assert(game.state.learned.bread && game.state.learned.fish && game.state.learned.gem, '自動プレイで3語を学べていない');
assert(game.state.history.length === 3 && game.state.history.every(function (h) { return h.correct; }), '自動プレイの履歴が不正');
assert(game.getState().review.optimal === true, '自動プレイの契約が最適でない');
assert(game.state.coins === 35 || game.state.coins === 30, '自動プレイの硬貨が35/30でない: ' + game.state.coins);
assert(game.state.rank === 'S', '自動プレイがSでない: ' + game.state.rank);

/* 8) 全問間違いでも最後まで進み、学びは残る */
game = newGame();
game.chooseItem('fish');
game.nextScene();
game.chooseItem('bread');
game.nextScene();
game.chooseItem('bread');
game.nextScene();
assert(game.state.phase === 'contract' && game.state.coins === 9, '全問間違いの進行/硬貨が不正: ' + game.state.coins);
assert(game.state.learned.bread && game.state.learned.fish && game.state.learned.gem, '間違えても対象の語を学べていない');
game.refuseContract();
assert(game.state.phase === 'ending' && game.state.rank === 'C', '全問間違いの評価がCでない: ' + game.state.rank);
assert(game.getState().history.every(function (h) { return !h.correct; }), '全問間違いの履歴が不正');

/* 9) シード再挑戦とスタートへ戻る */
game = newGame(12345);
var breadWord = game.lang.words.bread;
game.restart(12345);
assert(game.state.seed === 12345 && game.state.phase === 'scene', '再挑戦のシード/状態が不正');
assert(game.lang.words.bread === breadWord, '同じシードで言語が変わる');
assert(game.state.coins === 0 && !game.state.learned.bread, '再挑戦で状態がリセットされない');
game.backToStart();
assert(game.state.phase === 'start', 'スタートへ戻れない');

/* 10) ヒント用の単語リストと選択肢の公開範囲 */
game = newGame();
s = game.getState();
assert(s.knownWords.map(function (w) { return w.id; }).join(',') === 'me,you,want,not', '既知語リストが不正');
assert(s.contractMemo.map(function (w) { return w.id; }).join(',') === 'me,you,want', '契約メモが不正');
assert(s.choices.map(function (g) { return g.id; }).join(',') === 'bread,fish,gem', '品物の並びが不正');

/* 11) 全問正解でも、+5の契約を断るとSのまま契約評価だけが甘くなる */
var positiveGame = null;
for (var seed = 1; seed < 80; seed++) {
  var candidate = E.createGame({ seed: seed });
  candidate.start();
  while (candidate.state.phase !== 'contract') candidate.autoStep();
  if (candidate.state.contract.effect > 0) {
    positiveGame = candidate;
    break;
  }
}
assert(positiveGame !== null, '+5の契約になるシードが見つからない');
assert(positiveGame.state.coins === 30, '全問正解の硬貨が30でない');
assert(positiveGame.refuseContract() === true, '契約を拒否できない');
assert(positiveGame.state.coins === 30 && positiveGame.state.rank === 'S', '拒否時にS/30でない');
assert(positiveGame.getState().review.optimal === false, '良い契約を断ったのに最適扱い');
assert(positiveGame.getState().endedAt > 0, 'endedAt が記録されていない');

log('engine tests OK (' + passed + ' assertions)');
