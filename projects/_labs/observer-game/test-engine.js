/* test-engine.js : 観測者（Observer）のルール・予測・ルール変更の検証（jsc で実行）
 * 実行例:
 *   cd projects/_labs/observer-game && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = ObserverEngine;
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
  while (!predicate(game.state) && steps < (limit || 1000)) {
    game.autoStep();
    steps++;
  }
  assert(steps < (limit || 1000), '自動進行が終わらない: phase=' + game.state.phase + ' turn=' + game.state.turn);
  return steps;
}

function resetBoard(game, rule, ex, ey, dir, bx, by, zigzag) {
  game.state.rule = rule;
  game.state.enemy = { x: ex, y: ey, dir: dir };
  game.state.beacon = { x: bx, y: by };
  game.state.zigzag = zigzag || 0;
}

/* 1) 初期化はシード固定で、位置とルールが有効 */
var a = E.createGame({ seed: 12345 });
var b = E.createGame({ seed: 12345 });
var c = E.createGame({ seed: 777 });
assert(a.state.phase === 'start', '初期フェーズがstartでない');
assert(a.state.enemy.x >= 0 && a.state.enemy.x < E.SIZE && a.state.enemy.y >= 0 && a.state.enemy.y < E.SIZE, '敵の初期位置が盤外');
assert(a.state.beacon.x >= 0 && a.state.beacon.x < E.SIZE && a.state.beacon.y >= 0 && a.state.beacon.y < E.SIZE, '灯の初期位置が盤外');
assert(!(a.state.enemy.x === a.state.beacon.x && a.state.enemy.y === a.state.beacon.y), '敵と灯が同じマス');
assert(Math.abs(a.state.enemy.x - a.state.beacon.x) + Math.abs(a.state.enemy.y - a.state.beacon.y) >= 3, '敵と灯が近すぎる');
assert(E.RULE_ORDER.indexOf(a.state.rule) >= 0, '初期ルールが不正');
assert(JSON.stringify(a.state.enemy) === JSON.stringify(b.state.enemy), '同じシードで敵の位置が変わる');
assert(a.state.rule === b.state.rule, '同じシードでルールが変わる');
assert(JSON.stringify(a.state.enemy) !== JSON.stringify(c.state.enemy) || a.state.rule !== c.state.rule, '別シードで盤面が同じ');
assert(a.getState().rule === undefined, 'getStateが現在ルールを漏らしている');
assert(a.getState().rulesEncountered.length === 0, 'プレイ中にルール履歴が出ている');
assert(a.getState().ruleCatalog.length === 6, 'ルール候補が6つでない');

/* 2) 各ルールの次の一手 */
var game = newGame();
resetBoard(game, 'straight', 1, 1, 1, 4, 4, 0);
var m = game.previewNext();
assert(m.x === 2 && m.y === 1 && m.dir === 1, 'まっすぐ: ' + JSON.stringify(m));
resetBoard(game, 'straight', 4, 1, 1, 0, 0, 0);
m = game.previewNext();
assert(m.x === 4 && m.y === 2 && m.dir === 2, '壁で右へ曲がる: ' + JSON.stringify(m));
resetBoard(game, 'right', 1, 1, 0, 4, 4, 0);
m = game.previewNext();
assert(m.x === 2 && m.y === 1 && m.dir === 1, '右回り: ' + JSON.stringify(m));
resetBoard(game, 'left', 1, 1, 0, 4, 4, 0);
m = game.previewNext();
assert(m.x === 0 && m.y === 1 && m.dir === 3, '左回り: ' + JSON.stringify(m));
resetBoard(game, 'zigzag', 2, 2, 0, 4, 4, 0);
m = game.previewNext();
assert(m.x === 3 && m.y === 2 && m.dir === 1, 'ジグザグ右: ' + JSON.stringify(m));
resetBoard(game, 'zigzag', 2, 2, 0, 4, 4, 1);
m = game.previewNext();
assert(m.x === 1 && m.y === 2 && m.dir === 3, 'ジグザグ左: ' + JSON.stringify(m));
resetBoard(game, 'toward', 1, 1, 0, 3, 1, 0);
m = game.previewNext();
assert(m.x === 2 && m.y === 1, '灯へ: ' + JSON.stringify(m));
resetBoard(game, 'away', 1, 1, 0, 3, 1, 0);
m = game.previewNext();
var options = game.getState().options;
var maxDistance = 0;
for (var oi = 0; oi < options.length; oi++) {
  maxDistance = Math.max(maxDistance, Math.abs(options[oi].x - 3) + Math.abs(options[oi].y - 1));
}
assert(Math.abs(m.x - 3) + Math.abs(m.y - 1) === maxDistance, '灯から: 最大距離へ動かない: ' + JSON.stringify(m));
resetBoard(game, 'toward', 1, 1, 0, 2, 1, 0);
m = game.previewNext();
assert(!(m.x === 2 && m.y === 1), '灯のマスへ移動している: ' + JSON.stringify(m));
assert(m.x >= 0 && m.x < E.SIZE && m.y >= 0 && m.y < E.SIZE, '移動先が盤外');

/* 3) 観測はスコアを増やさず、ターンだけ進む */
resetBoard(game, 'straight', 1, 1, 1, 4, 4, 0);
var beforeRule = game.state.rule;
game.observe();
assert(game.state.turn === 2 && game.state.observations === 1, '観測のターン/回数が不正');
assert(game.state.correct === 0 && game.state.lives === 3 && game.state.rule === beforeRule, '観測でスコア/ルールが変わる');
assert(game.state.enemy.x === 2 && game.state.enemy.y === 1, '観測で敵が動かない');
assert(game.getState().trail.length === 2, '観測で軌跡が増えない');

/* 4) 正解の予測で+1、ルールは維持 */
game = newGame();
resetBoard(game, 'right', 1, 1, 0, 4, 4, 0);
beforeRule = game.state.rule;
var next = game.previewNext();
assert(game.predict(next.x, next.y) === true, '正解の予測が通らない');
assert(game.state.correct === 1 && game.state.lives === 3 && game.state.turn === 2, '正解の状態が不正');
assert(game.state.rule === beforeRule && game.state.ruleVersion === 1, '正解でルールが変わる');
assert(game.getState().lastMove.arrow.length > 0, '直前の移動がない');

/* 5) 外すとライフ-1、ルールが変わる */
game = newGame();
resetBoard(game, 'straight', 1, 1, 1, 4, 4, 0);
var wrong = { x: 1, y: 2 };
assert(game.predict(wrong.x, wrong.y) === false, '間違った予測が成功扱い');
assert(game.state.misses === 1 && game.state.lives === 2 && game.state.turn === 2, '外れの状態が不正');
assert(game.state.rule !== 'straight' && game.state.ruleVersion === 2, '外れでルールが変わらない');
assert(game.state.ruleLog.length === 2, 'ルール履歴が増えない');
assert(game.state.enemy.x === 2 && game.state.enemy.y === 1, '外れでも実際の移動が起きていない');

/* 6) 灯を動かす（2回まで）。敵は動かない */
game = newGame();
var enemyBefore = { x: game.state.enemy.x, y: game.state.enemy.y };
assert(game.moveBeacon(4, 4) === true, '灯を動かせない');
assert(game.state.beacon.x === 4 && game.state.beacon.y === 4 && game.state.probesUsed === 1, '灯の移動が不正');
assert(game.state.turn === 2 && game.state.enemy.x === enemyBefore.x && game.state.enemy.y === enemyBefore.y, '灯の移動で敵が動く');
assert(game.moveBeacon(game.state.enemy.x, game.state.enemy.y) === false, '敵のマスに灯を置ける');
assert(game.moveBeacon(4, 4) === false, '同じマスに灯を置ける');
assert(game.moveBeacon(-1, 0) === false, '盤外に灯を置ける');
assert(game.moveBeacon(0, 0) === true, '2回目の灯を動かせない');
assert(game.moveBeacon(1, 1) === false, '3回目の灯を動かせる');

/* 7) ターン上限とライフ0で終了 */
game = newGame();
game.state.turn = E.MAX_TURNS;
game.observe();
assert(game.state.phase === 'ending' && game.state.endedReason === '12ターン終了', 'ターン上限で終わらない');
assert(game.state.rank === 'C', '0正解の評価がCでない');
assert(game.state.score === 9, '0正解3ライフのスコアが9でない: ' + game.state.score);
assert(game.getState().rulesEncountered.length >= 1, '終了時のルール履歴がない');
assert(game.getState().over === true, '終了状態がoverでない');
assert(game.observe() === false && game.predict(0, 0) === false, '終了後も操作できる');

game = newGame();
game.state.lives = 1;
resetBoard(game, 'straight', 1, 1, 1, 4, 4, 0);
game.predict(1, 2);
assert(game.state.phase === 'ending' && game.state.endedReason === 'ライフが尽きた', 'ライフ0で終わらない');

/* 8) 評価の境界 */
[7, 5, 3, 0].forEach(function (correct) {
  var g = newGame();
  g.state.correct = correct;
  g.state.turn = E.MAX_TURNS;
  g.observe();
  var expected = correct >= 7 ? 'S' : (correct >= 5 ? 'A' : (correct >= 3 ? 'B' : 'C'));
  assert(g.state.rank === expected, correct + '正解の評価が' + expected + 'でない: ' + g.state.rank);
});

/* 9) 自動プレイ: 2回観測 + 10回正解でS */
game = newGame();
driveTo(game, function (st) { return st.phase === 'ending'; });
assert(game.state.correct === 10, '自動プレイの正解数が10でない: ' + game.state.correct);
assert(game.state.observations === 2, '自動プレイの観測数が2でない: ' + game.state.observations);
assert(game.state.misses === 0 && game.state.lives === 3, '自動プレイでミスしている');
assert(game.state.rank === 'S' && game.state.score === 109, '自動プレイがS/109でない: ' + game.state.rank + '/' + game.state.score);
assert(game.state.turn > E.MAX_TURNS, '自動プレイでターン上限を超えていない');
assert(game.getState().rulesEncountered.length === 1, '自動プレイのルール履歴が1でない');

/* 10) 同じシードで盤面/ルールが再現し、スタートへ戻れる */
game = newGame(12345);
var snapshot = {
  enemy: JSON.stringify(game.state.enemy),
  beacon: JSON.stringify(game.state.beacon),
  rule: game.state.rule
};
game.restart(12345);
assert(JSON.stringify(game.state.enemy) === snapshot.enemy, '再挑戦で敵の位置が変わる');
assert(JSON.stringify(game.state.beacon) === snapshot.beacon, '再挑戦で灯の位置が変わる');
assert(game.state.rule === snapshot.rule, '再挑戦でルールが変わる');
assert(game.state.turn === 1 && game.state.correct === 0 && game.state.lives === 3, '再挑戦で状態がリセットされない');
game.backToStart();
assert(game.state.phase === 'start', 'スタートへ戻れない');

/* 11) 複数シードの自動プレイで盤外・灯の重なりがない */
for (var seed = 1; seed <= 20; seed++) {
  var g = newGame(seed);
  while (g.state.phase !== 'ending') g.autoStep();
  assert(g.state.rank === 'S', 'シード' + seed + 'でSにならない');
  for (var i = 0; i < g.state.trail.length; i++) {
    var t = g.state.trail[i];
    assert(t.x >= 0 && t.x < E.SIZE && t.y >= 0 && t.y < E.SIZE, '軌跡が盤外: seed=' + seed);
    assert(!(t.x === g.state.beacon.x && t.y === g.state.beacon.y), '敵が灯のマスに入った: seed=' + seed);
  }
}

log('engine tests OK (' + passed + ' assertions)');
