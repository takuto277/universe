/* test-engine.js : 未知語de交渉 v4 の文法・行動・確認・契約の検証（jsc で実行）
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

/* 3) 1人目: 品物は見えていて、未知語は me。行動は「差し出す」 */
var game = newGame();
var s = game.getState();
assert(s.phase === 'scene' && s.scenePhase === 'guess' && s.sceneNumber === 1, '開始状態が不正');
assert(s.item && s.item.id === 'bread' && s.item.label === 'パン', '品物が見えていない');
assert(s.line.length === 3, '1人目の文が3語でない');
assert(lineConcept(s, 'me').unknown && !lineConcept(s, 'me').label, 'me が未知になっていない');
assert(lineConcept(s, 'bread').known && lineConcept(s, 'bread').label === 'パン', '品物の語が既知でない');
assert(lineConcept(s, 'want').known && lineConcept(s, 'want').label === '欲しい', 'want が既知でない');
assert(s.canConfirm && s.confirmCost === 2, '確認ができない');
assert(s.actions.length === 3 && s.actions[0].id === 'give' && s.actions[1].id === 'take' && s.actions[2].id === 'refuse', '行動の選択肢が不正');
assert(s.canAct && !s.canNext, '行動/次への状態が不正');

/* 4) 確認は2硬貨で未知語を開示し、行動の前に選べる */
assert(game.confirmWord() === true, '未知語を確認できない');
assert(game.state.coins === -2, '確認コストが-2でない: ' + game.state.coins);
s = game.getState();
assert(!s.canConfirm && lineConcept(s, 'me').known && lineConcept(s, 'me').label === '私', '確認後にmeが既知でない');
assert(game.confirmWord() === false, '同じ語を二度確認できてしまう');

/* 5) 正しい行動で+10、間違えると+3。行動後は必ず語を学ぶ */
assert(game.chooseAction('give') === true, '正しい「差し出す」が通らない');
assert(game.state.coins === 8 && game.state.learned.me, '確認+正解の硬貨/学習が不正: ' + game.state.coins);
var result = game.getState().sceneResult;
assert(result.correct && result.correctAction === 'give' && result.coinsDelta === 10, '正解結果が不正');
assert(result.detail.indexOf('私') >= 0 && result.detail.indexOf('差し出す') >= 0, '正解の説明が不足');
assert(game.getState().scenePhase === 'result' && game.getState().canNext, '結果フェーズへ移らない');

/* 6) 2人目: not を確認して「断る」 */
game.nextScene();
s = game.getState();
assert(s.sceneNumber === 2 && s.item.id === 'fish', '2人目へ進めない');
assert(lineConcept(s, 'me').known && lineConcept(s, 'me').label === '私', '1人目のmeが引き継がれない');
assert(lineConcept(s, 'not').unknown, 'not が未知でない');
assert(game.confirmWord() === true && game.state.coins === 6, '2人目の確認が不正');
assert(game.chooseAction('refuse') === true, '2人目の正解「断る」が通らない');
assert(game.state.coins === 16 && game.state.learned.not, '2人目の硬貨/学習が不正: ' + game.state.coins);

/* 7) 3人目: すべて既知。しぐさから「受け取る」を選ぶ */
game.nextScene();
s = game.getState();
assert(s.sceneNumber === 3 && s.item.id === 'gem', '3人目へ進めない');
assert(!s.canConfirm && lineConcept(s, 'not').known && lineConcept(s, 'not').label === '否定', '3人目でnotが既知でない');
assert(lineConcept(s, 'me').label === '私' && lineConcept(s, 'gem').label === '宝石', '3人目の既知語が不正');
assert(game.chooseAction('take') === true, '3人目の正解「受け取る」が通らない');
assert(game.state.coins === 26 && game.state.learned.gem, '3人目の硬貨/学習が不正: ' + game.state.coins);
game.nextScene();
assert(game.state.phase === 'contract' && game.state.contract, '3人目後に契約へ進めない');
s = game.getState();
assert(s.contract.tokens.length === 3 && s.contract.meaning === null, '契約の語数/未決定状態が不正');
assert(s.contractMemo.length === 3, '契約メモが不正');

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
game.chooseAction('take');
game.nextScene();
game.chooseAction('give');
game.nextScene();
game.chooseAction('give');
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
