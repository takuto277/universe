/* test-engine.js : 未知語de交渉 v4 の文法・行動・確認・契約の検証（jsc で実行）
 * 実行例:
 *   cd projects/_labs/unknown-word-deal && jsc test-engine.js
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

var CONCEPTS_LABEL = { bread: 'パン', fish: '魚', gem: '宝石', me: '私', you: 'あなた', want: '欲しい', not: '否定' };

function wrongAction(scene) {
  return scene.correctAction === 'give' ? 'take' : 'give';
}

function lineConcept(state, id) {
  for (var i = 0; i < state.line.length; i++) {
    if (state.line[i].concept === id) return state.line[i];
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
assert(E.CONCEPT_ORDER.length === 7 && E.GOODS.length === 3 && E.CONFIRM_COST === 2, '概念/品物/確認コスト');

/* 2) 文法: 主語・品物・欲しい・否定 */
var lang = a;
function parseConcepts(ids) { return E.parse(E.surface(ids, lang), lang); }
var want = parseConcepts(['me', 'bread', 'want']);
assert(want && want.type === 'want' && want.subject === 'me' && want.object === 'bread' && !want.negated, 'want文');
var deny = parseConcepts(['me', 'fish', 'want', 'not']);
assert(deny && deny.negated === true && deny.object === 'fish', '否定文');
var youWant = parseConcepts(['you', 'gem', 'want']);
assert(youWant && youWant.subject === 'you' && youWant.object === 'gem', 'you want文');
assert(parseConcepts(['bread', 'me', 'want']) === null, '語順が違う文を受理している');
assert(E.toJapanese(youWant) === 'あなたは宝石が欲しい', '日本語訳: ' + E.toJapanese(youWant));
assert(E.toJapanese(deny) === '私は魚が欲しくない', '否定の日本語訳: ' + E.toJapanese(deny));

/* 3) 3人の場面: 品物は見えていて、未知語だけが隠れる。順番はシードで変わる */
var game = newGame();
var s = game.getState();
assert(s.phase === 'scene' && s.scenePhase === 'guess' && s.sceneNumber === 1, '開始状態が不正');
assert(game.scenes.length === 3, '場面数が3でない');
var itemIds = game.scenes.map(function (sc) { return sc.item; }).sort().join(',');
assert(itemIds === 'bread,fish,gem', '品物が3種類そろっていない');
for (var gi = 0; gi < game.scenes.length; gi++) {
  var gs = game.scenes[gi];
  assert(gs.gesture.indexOf(CONCEPTS_LABEL[gs.item]) < 0, 'しぐさが正解の品を直接名指ししている: ' + gs.item);
}
assert(s.item && s.item.label === CONCEPTS_LABEL[s.item.id], '品物が見えていない');
assert(s.line.length === game.scenes[0].line.length, '1人目の文の語数が不正');
assert(lineConcept(s, s.item.id).known && lineConcept(s, s.item.id).label === s.item.label, '品物の語が既知でない');
assert(lineConcept(s, 'want').known && lineConcept(s, 'want').label === '欲しい', 'want が既知でない');
assert(s.actions.length === 3 && s.actions[0].id === 'give' && s.actions[1].id === 'take' && s.actions[2].id === 'refuse', '行動の選択肢が不正');
assert(s.canAct && !s.canNext, '行動/次への状態が不正');

var firstUnknown = game.scenes[0].unknown;
if (firstUnknown) {
  assert(s.canConfirm && s.confirmCost === 2, '確認ができない');
  assert(game.confirmWord() === true, '未知語を確認できない');
  assert(game.state.coins === -2, '確認コストが-2でない: ' + game.state.coins);
  s = game.getState();
  assert(!s.canConfirm && lineConcept(s, firstUnknown).known, '確認後に未知語が既知でない');
  assert(game.confirmWord() === false, '同じ語を二度確認できてしまう');
} else {
  assert(!s.canConfirm, '未知語がない場面で確認できる');
}

/* 4) 正しい行動で+10、間違えると+3。行動後は必ず語を学ぶ */
var firstScene = game.scenes[0];
assert(game.chooseAction(firstScene.correctAction) === true, '正しい行動が通らない');
var expected = (firstUnknown ? 8 : 10);
assert(game.state.coins === expected, '1人目の硬貨が不正: ' + game.state.coins);
if (firstUnknown) assert(game.state.learned[firstUnknown], '未知語を学べていない');
var result = game.getState().sceneResult;
assert(result.correct && result.correctAction === firstScene.correctAction && result.coinsDelta === 10, '正解結果が不正');
if (firstUnknown) assert(result.detail.indexOf(CONCEPTS_LABEL[firstUnknown]) >= 0, '正解の説明に意味がない');
assert(game.getState().scenePhase === 'result' && game.getState().canNext, '結果フェーズへ移らない');
game.nextScene();

/* 5) 2人目・3人目: 未知語を確認し、正しい行動で学ぶ */
for (var si = 1; si < game.scenes.length; si++) {
  s = game.getState();
  var scene = game.scenes[si];
  assert(s.sceneNumber === si + 1 && s.item.id === scene.item, '場面の品物が一致しない');
  if (scene.unknown) {
    assert(lineConcept(s, scene.unknown).unknown, '未知語が隠れていない: ' + scene.unknown);
    var beforeConfirm = game.state.coins;
    assert(game.confirmWord() === true && game.state.coins === beforeConfirm - 2, '未知語の確認が不正');
    s = game.getState();
    assert(lineConcept(s, scene.unknown).label === CONCEPTS_LABEL[scene.unknown] || lineConcept(s, scene.unknown).label, '確認後のラベルが不正');
    assert(game.confirmWord() === false, '同じ語を二度確認できてしまう');
  } else {
    assert(!s.canConfirm, '未知語がない場面で確認できる');
  }
  var beforeAction = game.state.coins;
  assert(game.chooseAction(scene.correctAction) === true, '正しい行動が通らない: ' + scene.correctAction);
  assert(game.state.coins === beforeAction + 10, '正解の硬貨が不正');
  if (scene.unknown) assert(game.state.learned[scene.unknown], '未知語を学べていない: ' + scene.unknown);
  assert(game.getState().sceneResult.correct, '正解結果が不正');
  if (si < game.scenes.length - 1) game.nextScene();
}
assert(game.state.coins === 26, '全問正解の硬貨が26でない: ' + game.state.coins);
game.nextScene();
assert(game.state.phase === 'contract' && game.state.contract, '3人目後に契約へ進めない');
s = game.getState();
assert(s.contract.tokens.length === 3 && s.contract.meaning === null, '契約の語数/未決定状態が不正');
assert(s.contractMemo.length === 4, '契約メモが不正');
assert(s.contractMemo.some(function (m) { return m.id === 'fish' && m.label === '魚'; }), '契約メモに魚の語がない');

/* 8) 契約: 署名で効果、拒否で増減なし */
var contract = game.state.contract;
var before = game.state.coins;
assert(game.signContract() === true, '契約に署名できない');
assert(game.state.coins === before + contract.effect, '署名の硬貨効果が不正');
s = game.getState();
assert(s.phase === 'ending' && s.review && s.review.signed === true, '署名後の終了状態が不正');
assert(s.review.effect === contract.effect && s.review.correctChoice === (contract.effect > 0 ? '署名する' : '断る'), 'レビューが不正');
assert(s.endedAt > 0, 'endedAt が記録されていない');

game = newGame();
driveTo(game, function (st) { return st.phase === 'contract'; });
before = game.state.coins;
assert(game.refuseContract() === true, '契約を拒否できない');
assert(game.state.coins === before, '拒否で硬貨が変わった');
assert(game.getState().review.playerChoice === '断る', '拒否のレビューが不正');

/* 9) 自動プレイ: 全問正解 + 契約最適でS */
game = newGame();
driveTo(game, function (st) { return st.phase === 'ending'; });
assert(game.state.learned.me && game.state.learned.not, '自動プレイでme/notを学べていない');
assert(game.state.history.length === 3 && game.state.history.every(function (h) { return h.correct; }), '自動プレイの履歴が不正');
assert(game.getState().review.optimal === true, '自動プレイの契約が最適でない');
assert(game.state.coins === 35 || game.state.coins === 30, '自動プレイの硬貨が35/30でない: ' + game.state.coins);
assert(game.state.rank === 'S', '自動プレイがSでない: ' + game.state.rank);

/* 10) 全問間違いでも最後まで進み、語は学べる */
game = newGame();
for (var wi = 0; wi < game.scenes.length; wi++) {
  game.chooseAction(wrongAction(game.scenes[wi]));
  if (wi < game.scenes.length - 1) game.nextScene();
}
game.nextScene();
assert(game.state.phase === 'contract' && game.state.coins === 9, '全問間違いの進行/硬貨が不正: ' + game.state.coins);
assert(game.state.learned.me && game.state.learned.not, '間違えてもme/notを学べていない');
game.refuseContract();
assert(game.state.phase === 'ending' && game.state.rank === 'C', '全問間違いの評価がCでない: ' + game.state.rank);
assert(game.getState().history.every(function (h) { return !h.correct; }), '全問間違いの履歴が不正');

/* 11) シード再挑戦とスタートへ戻る */
game = newGame(12345);
var breadWord = game.lang.words.bread;
game.restart(12345);
assert(game.state.seed === 12345 && game.state.phase === 'scene', '再挑戦のシード/状態が不正');
assert(game.lang.words.bread === breadWord, '同じシードで言語が変わる');
assert(game.state.coins === 0 && !game.state.learned.me, '再挑戦で状態がリセットされない');
game.backToStart();
assert(game.state.phase === 'start', 'スタートへ戻れない');

/* 12) 全問正解でも、+5の契約を断るとSのまま契約評価だけが甘くなる */
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
