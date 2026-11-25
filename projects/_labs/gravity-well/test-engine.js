/* test-engine.js : GRAVITY WELL のロジックテスト（jsc で実行） */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = GravityWellEngine; }

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function countFilled(grid) {
  var n = 0;
  for (var y = 0; y < grid.length; y++) {
    for (var x = 0; x < grid[y].length; x++) if (grid[y][x]) n++;
  }
  return n;
}

function blankExceptGap() {
  var g = E.makeGrid();
  for (var x = 0; x < E.COLS; x++) {
    if (x < 4 || x > 7) g[E.ROWS - 1][x] = 2;
  }
  return g;
}

/* --- 初期状態と開始 --- */
var g = E.createGame({ seed: 12345 });
assert(g.state.phase === 'start', '初期フェーズは start');
assert(g.state.timeLeft === E.GAME_TIME, '初期時間が120秒でない');
assert(g.state.grid.length === E.ROWS && g.state.grid[0].length === E.COLS, '盤面が12x12でない');

g.start();
var s = g.getState();
assert(s.phase === 'playing', 'start で playing にならない');
assert(s.active && s.active.cells.length === 4, '操作中ピースが4セルでない');
assert(s.queue.length >= 4, 'ネクストキューが足りない');
assert(s.grid.length === 12 && s.grid[0].length === 12, 'getState の盤面が不正');
assert(typeof s.timeLeft === 'number' && s.timeLeft <= 120, '時間が公開されていない');
assert(s.rotation && s.rotation.active === false, '回転情報が公開されていない');
assert(s.active.ghostY >= s.active.y, 'ゴースト位置が不正');

/* --- シード固定で同じ並び --- */
var a1 = E.createGame({ seed: 777 });
var a2 = E.createGame({ seed: 777 });
a1.start();
a2.start();
var bag = [];
for (var i = 0; i < 7; i++) {
  bag.push(a1.state.active.type);
  assert(a1.state.active.type === a2.state.active.type, '同一シードでピースが一致しない');
  a1.hardDrop();
  a2.hardDrop();
}
var sorted = bag.slice().sort().join(',');
assert(sorted === E.TYPES.slice().sort().join(','), '7-bag が7種を揃えていない: ' + sorted);

/* --- 左右移動と壁 --- */
g.restart();
var cx = g.state.active.x;
assert(g.moveLeft() === true, '左移動できない');
assert(g.state.active.x === cx - 1, '左移動の座標が不正');
assert(g.moveRight() === true, '右移動できない');
assert(g.state.active.x === cx, '右移動の座標が不正');
var guard = 0;
while (g.moveLeft() && guard++ < 20) { }
assert(g.state.active.x >= 0, '左端を越えた');
assert(g.moveLeft() === false, '左端で移動できてしまう');
guard = 0;
while (g.moveRight() && guard++ < 20) { }
assert(g.state.active.x < E.COLS, '右端を越えた');
assert(g.moveRight() === false, '右端で移動できてしまう');

/* --- ハードドロップで固定・次ピース --- */
g.restart();
var id0 = g.state.active.id;
var score0 = g.state.score;
assert(g.hardDrop() === true, 'ハードドロップできない');
assert(g.state.active.id === id0 + 1, '次のピースが出現しない');
assert(countFilled(g.state.grid) > 0, '固定後の盤面が空のまま');
assert(g.state.score === score0, 'ラインなしでスコアが増えた');

/* --- 盤面回転・入力ロック・+10点 --- */
g.restart();
var rotateId = g.state.active.id;
var rotationsBefore = g.state.rotations;
assert(g.rotateBoard(1) === true, '盤面を時計回りに回せない');
assert(g.state.score === 10, '回転で+10点にならない: ' + g.state.score);
assert(g.state.rotations === rotationsBefore + 1, '回転数が増えない');
assert(g.getState().rotation.active === true, '回転アニメーション情報が立たない');
assert(g.state.active.id === rotateId, '回転でピースが交換された');
assert(g.moveLeft() === false, '回転アニメーション中に移動できてしまう');
assert(g.rotateBoard(-1) === false, '回転アニメーション中に再回転できてしまう');
g.update(0.1);
g.update(0.1);
assert(g.state.rotation.active === false, '回転アニメーションが終わらない');
assert(g.moveLeft() === true || g.state.active.x === 0, '回転後に移動できない');
assert(g.state.score === 10, 'アニメーション終了でスコアが変化した');

/* --- 回転の座標変換 --- */
var map = E.makeGrid();
map[0][0] = 1;
var cw = E.rotateGrid(map, 1);
var ccw = E.rotateGrid(map, -1);
assert(cw[0][E.COLS - 1] === 1, '時計回りの座標変換が不正');
assert(ccw[E.ROWS - 1][0] === 1, '反時計回りの座標変換が不正');

/* --- 回転後の重力整地 --- */
var floating = E.makeGrid();
floating[0][5] = 1;
floating[E.ROWS - 1][5] = 1;
var settled = E.settleWithPiece(floating, [], 0, 0);
assert(settled[E.ROWS - 1][5] === 1, '最下段のセルが消えた');
assert(settled[E.ROWS - 2][5] === 1, '浮いたセルが落下しない');

var rotatedSettled = E.previewRotation(floating, [[0, 0]], 0, 0, 1);
assert(countFilled(rotatedSettled.grid) === 2, '回転でセルが消えた');

/* --- 盤面回転後の整地でもラインが消える --- */
var spin = E.createGame({ seed: 13 });
spin.start();
var column = E.makeGrid();
for (var cy = 0; cy < E.ROWS; cy++) column[cy][E.COLS - 1] = 4;
spin.state.grid = column;
spin.state.active = { type: 'I', value: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0]], x: 0, y: 0, id: 800 };
spin.state.score = 0;
spin.state.lines = 0;
spin.state.combo = 0;
assert(spin.rotateBoard(1) === true, '回転できない');
assert(spin.state.lines === 1, '回転後の整地でラインが消えない: ' + spin.state.lines);
assert(spin.state.score === 110, '回転+ラインのスコアが不正: ' + spin.state.score);
assert(spin.state.combo === 1, '回転ラインでコンボが増えない');
assert(spin.state.lastLock.count === 1, '回転ラインが lastLock に記録されない');

/* --- ライン消去とスコア --- */
g = E.createGame({ seed: 3 });
g.start();
g.state.grid = blankExceptGap();
g.state.active = { type: 'I', value: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0]], x: 4, y: 0, id: 900 };
g.state.score = 0;
g.state.lines = 0;
g.state.combo = 0;
g.hardDrop();
assert(g.state.lines === 1, '1ライン消去されない: ' + g.state.lines);
assert(g.state.score === 100, '1ラインのスコアが100でない: ' + g.state.score);
assert(g.state.combo === 1, 'コンボが1にならない');
assert(countFilled(g.state.grid) === 0, 'ライン消去後にセルが残る');

/* --- 連続ラインでコンボボーナス --- */
g.state.grid = blankExceptGap();
g.state.active = { type: 'I', value: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0]], x: 4, y: 0, id: 901 };
g.hardDrop();
assert(g.state.lines === 2, '2ライン目が消えない');
assert(g.state.combo === 2, 'コンボが2にならない');
assert(g.state.score === 250, 'コンボボーナスが不正: ' + g.state.score);

/* --- 消去なしでコンボリセット --- */
g.state.grid = E.makeGrid();
g.state.active = { type: 'I', value: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0]], x: 0, y: 0, id: 902 };
g.hardDrop();
assert(g.state.combo === 0, '消去なしでコンボが残る');
assert(g.state.score === 250, '消去なしでスコアが変化した');

/* --- 時間切れで victory --- */
var win = E.createGame({ seed: 11 });
win.start();
win.state.timeLeft = 0.05;
win.update(0.06);
assert(win.state.phase === 'victory', '時間切れで victory にならない: ' + win.state.phase);
assert(win.getState().over === true, 'victory で over が立たない');
assert(win.state.timeLeft === 0, '残り時間が0でない');
assert(win.state.result && win.state.result.reason === 'victory', '結果に理由がない');

/* --- 早期トップアウト --- */
var dead = E.createGame({ seed: 21 });
dead.start();
var top = E.makeGrid();
for (var yy = 0; yy < 4; yy++) {
  for (var xx = 0; xx < E.COLS; xx++) {
    if ((xx + yy) % 2 === 0) top[yy][xx] = 3;
  }
}
dead.state.grid = top;
dead.hardDrop();
assert(dead.state.phase === 'over', 'トップアウトしない: ' + dead.state.phase);
assert(dead.getState().over === true, 'トップアウトで over が立たない');
assert(dead.state.result && dead.state.result.reason === 'over', 'トップアウトの理由がない');

/* --- restart --- */
win.state.score = 999;
win.restart();
assert(win.state.phase === 'playing', 'restart で再開しない');
assert(win.state.score === 0 && win.state.lines === 0, 'restart でスコアが残る');
assert(win.state.timeLeft === E.GAME_TIME, 'restart で時間が戻らない');
assert(win.state.active !== null && win.state.active.id > 0, 'restart でピースが出ない');

/* --- エンジン内蔵 autoStep が終了可能 --- */
var auto = E.createGame({ seed: 31 });
auto.start();
for (var step = 0; step < 4000 && auto.state.phase === 'playing'; step++) {
  auto.autoStep();
  auto.update(0.05);
}
assert(auto.state.phase === 'over' || auto.state.phase === 'victory', 'autoStep が終了しない');

print('engine tests OK');
