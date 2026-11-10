/* test-engine.js : PRISM のコアロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = PrismEngine; }

function assert(cond, message) { if (!cond) throw new Error(message); }

function advanceToLevel(state, index) {
  var guard = 0;
  while (state.levelIndex < index && guard < 1000) {
    guard++;
    E.autoStep(state);
    E.update(state, 1 / 30);
  }
  return state.levelIndex === index;
}

var g = E.createGame();
assert(g.phase === 'idle', '初期状態はidle');
assert(g.targets.length === 0 && g.mirrors.length === 0, '開始前は盤面が空');

assert(E.start(g) === true && g.phase === 'playing', '開始できる');
assert(g.levelIndex === 0 && g.levelCount === E.LEVELS.length, 'レベル情報が入る');
assert(g.name === 'FIRST LIGHT', 'レベル名が入る');
assert(g.mirrors.length === 1 && g.targets.length === 2, 'レベル1の盤面');
assert(g.trace.lit.length === 1, '初期状態では片方のシグナルだけ点く');

var c = E.cellCenter(g.mirrors[0].x, g.mirrors[0].y);
assert(E.pick(g, c.x, c.y) === 0, 'ミラーのセルをタップで拾える');
assert(E.pick(g, c.x + E.CELL, c.y) === -1, '何もないセルは拾わない');

var l2 = E.createGame();
E.start(l2);
assert(advanceToLevel(l2, 1) === true, 'レベル2へ進める');
assert(l2.phase === 'playing' && l2.mirrors.length === 2, 'レベル2の盤面');
var t0 = l2.mirrors[0].type;
assert(E.toggle(l2, 0) === true, 'ミラーを回せる');
assert(l2.mirrors[0].type !== t0, 'ミラーの向きが変わる');
assert(l2.moves === 1, '操作回数が増える');
assert(l2.phase === 'playing', '1回では解けない');
E.toggle(l2, 0);
assert(l2.mirrors[0].type === t0, 'もう一度回すと元に戻る');

var s = E.createGame();
E.start(s);
var original = s.mirrors[0].type;
var solution = E.solve(s);
assert(solution && solution.types.length === 1, 'レベル1は解ける');
assert(s.phase === 'playing', 'solve は状態をクリアにしない');
assert(s.mirrors[0].type === original, 'solve はミラーの向きを変えない');

E.autoStep(s);
assert(s.phase === 'clear', 'autoStep でレベル1がクリアになる');
assert(s.trace.lit.length === 2, 'クリア時に全シグナルが点いている');
assert(s.moves > 0, 'autoStep は操作回数を数える');

var run = E.createGame();
E.start(run);
var seen = {};
var guard = 0;
while (run.phase !== 'over' && guard < 20000) {
  guard++;
  seen[run.levelIndex] = true;
  E.autoStep(run);
  E.update(run, 1 / 60);
}
assert(run.phase === 'over', '全レベルをクリアして終了する');
assert(Object.keys(seen).length === E.LEVELS.length, 'すべてのレベルに到達する');
assert(run.result && run.result.moves === run.totalMoves, '結果に合計操作回数が入る');
assert(run.result.moves > 0, '合計操作回数が0より大きい');
assert(run.result.time > 0, 'クリア時間が記録される');
assert(E.snapshot(run).over === true, 'スナップショットが終了を伝える');

var bad = E.createGame();
assert(E.toggle(bad, 0) === false, '開始前はミラーを回せない');

print('engine tests OK (levels=' + E.LEVELS.length + ', moves=' + run.result.moves + ')');
