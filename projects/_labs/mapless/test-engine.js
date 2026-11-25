/* test-engine.js : MAPLESS のロジック検証（jsc で実行）
 *   cd projects/_labs/mapless && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = MaplessEngine;
}

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}

function newGame(seed) {
  var g = E.createGame({ seed: seed == null ? 20261126 : seed });
  E.start(g);
  return g;
}

function floorNeighbor(g, x, y) {
  for (var i = 0; i < 4; i++) {
    var d = [E.MOVE.up, E.MOVE.down, E.MOVE.left, E.MOVE.right][i];
    var nx = x + d.x;
    var ny = y + d.y;
    if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
    if (g.grid[ny][nx] === 0) return { x: nx, y: ny, dx: d.x, dy: d.y };
  }
  return null;
}

/* ---- 1. 開始と迷路 ---- */
var g = newGame(7);
assert(g.phase === 'playing', '開始後にplayingでない');
assert(g.floorIndex === 0 && g.floorCount === 3, 'フロアが1/3でない');
assert(g.grid.length === g.rows && g.grid[0].length === g.cols, 'グリッドサイズが不正');
assert(g.grid[g.player.y][g.player.x] === 0, '開始地点が壁');
assert(g.grid[g.exit.y][g.exit.x] === 0, '出口が壁');
assert(g.ink === g.maxInk, '開始インクが満タンでない');
assert(g.bottles.length === g.floorDef.bottles, 'インク瓶の数が設定と違う');
assert(g.exitDistance > 0, '出口距離が0');
assert(g.strokes.length === 0 && g.mud === 0, '開始時に地図が汚れている');

/* ---- 2. 同じシードの再現性 ---- */
var a = newGame(4242);
var b = newGame(4242);
assert(a.grid.join('|') === b.grid.join('|'), '同じシードで迷路が違う');
assert(a.exit.x === b.exit.x && a.exit.y === b.exit.y, '同じシードで出口が違う');
assert(a.bottles.length === b.bottles.length, '同じシードで瓶の数が違う');
for (var i = 0; i < a.bottles.length; i++) {
  assert(a.bottles[i].x === b.bottles[i].x && a.bottles[i].y === b.bottles[i].y, '同じシードで瓶の位置が違う');
}

/* ---- 3. 壁と移動 ---- */
var wallDir = null;
for (var d = 0; d < 4; d++) {
  var dir = [E.MOVE.up, E.MOVE.down, E.MOVE.left, E.MOVE.right][d];
  var wx = g.player.x + dir.x;
  var wy = g.player.y + dir.y;
  if (g.grid[wy] && g.grid[wy][wx] === 1) { wallDir = dir; break; }
}
assert(!!wallDir, '開始地点の隣に壁がない');
var blocked = E.move(g, wallDir.x, wallDir.y);
assert(blocked === false, '壁に移動できてしまう');
assert(g.events.length > 0 && g.events[g.events.length - 1].type === 'bump', '壁のイベントが出ない');

var path = g.pathToExit;
assert(path.length > 1, '出口への経路がない');
var step = { x: path[1].x - g.player.x, y: path[1].y - g.player.y };
assert(E.move(g, step.x, step.y) === true, '経路上の移動ができない');
assert(g.player.x === path[1].x && g.player.y === path[1].y, '移動後の位置が不正');

/* ---- 4. インク瓶 ---- */
var gb = newGame(11);
var bottle = gb.bottles[0];
var nb = floorNeighbor(gb, bottle.x, bottle.y);
assert(!!nb, '瓶の隣に床がない');
gb.player.x = nb.x;
gb.player.y = nb.y;
gb.ink = 50;
E.refreshNavigation(gb);
assert(E.move(gb, bottle.x - nb.x, bottle.y - nb.y) === true, '瓶のマスに移動できない');
assert(bottle.collected === true, '瓶が回収されない');
assert(gb.bottlesCollected === 1, '瓶の回収数が増えない');
assert(gb.ink === Math.min(gb.maxInk, 50 + E.BOTTLE_INK), '瓶でインクが回復しない: ' + gb.ink);

/* ---- 5. インクと泥 ---- */
var gd = newGame(21);
var ink0 = gd.ink;
assert(E.beginStroke(gd, 0.2, 0.2) === true, 'ストロークを開始できない');
assert(E.addStrokePoint(gd, 0.5, 0.2) === true, 'ストロークを伸ばせない');
assert(E.endStroke(gd) === true, 'ストロークを終了できない');
assert(gd.strokes.length === 1, 'ストロークが保存されない');
assert(gd.currentStroke === null, 'ストローク終了後もcurrentStrokeが残る');
assert(gd.ink < ink0, '描いてもインクが減らない');
assert(gd.mud > 0, '描いても泥が増えない');
var strokes = gd.strokes.length;
gd.ink = 0;
assert(E.beginStroke(gd, 0.6, 0.6) === false, 'インク0で描き始められる');
assert(gd.strokes.length === strokes, 'インク0でストロークが増えた');

/* ---- 6. 出口とフロアクリア ---- */
var gf = newGame(31);
var last = null;
var guard = 0;
while (gf.phase === 'playing' && guard++ < 400) {
  var p = gf.pathToExit;
  assert(p.length > 1, '出口への経路が途切れた');
  last = { x: p[1].x - gf.player.x, y: p[1].y - gf.player.y };
  E.move(gf, last.x, last.y);
  E.update(gf, 0.1);
}
assert(gf.phase === 'floorClear', '出口でフロアクリアにならない');
assert(gf.floorScores.length === 1, 'フロアスコアが1件でない');
assert(gf.floorScores[0].score > 0, 'フロアスコアが0');
var cleared = gf.floorScores[0];
assert(cleared.time > 0, 'クリア時間が0');
assert(E.nextFloor(gf) === true, '次のフロアへ進めない');
assert(gf.phase === 'playing' && gf.floorIndex === 1, '次のフロアが開始されない');
assert(gf.ink === gf.maxInk && gf.mud === 0 && gf.strokes.length === 0, '次フロアで状態がリセットされない');
assert(gf.time === 0, '次フロアで時間がリセットされない');

/* ---- 7. スコア計算 ---- */
var gs = newGame(41);
var exit = gs.exit;
var en = floorNeighbor(gs, exit.x, exit.y);
assert(!!en, '出口の隣に床がない');
gs.player.x = en.x;
gs.player.y = en.y;
gs.time = gs.floorDef.par;
gs.ink = 50;
gs.mud = 10;
gs.bottlesCollected = 1;
E.refreshNavigation(gs);
assert(E.move(gs, exit.x - en.x, exit.y - en.y) === true, '出口マスへ移動できない');
assert(gs.phase === 'floorClear', '出口でフロアクリアにならない');
var score = gs.floorScores[0];
assert(score.timeBonus === E.TIME_BONUS, '時間ボーナスが満額でない: ' + score.timeBonus);
assert(score.inkBonus === 150, 'インクボーナスが150でない: ' + score.inkBonus);
assert(score.bottleBonus === E.BOTTLE_BONUS, '瓶ボーナスが300でない');
assert(score.mudPenalty === 40, '泥ペナルティが40でない: ' + score.mudPenalty);
assert(score.score === 1000 + E.TIME_BONUS + 150 + E.BOTTLE_BONUS - 40, '合計スコアが不正: ' + score.score);

/* ---- 8. ランク ---- */
assert(E.rankFor(5600) === 'S', '5600がSでない');
assert(E.rankFor(5599) === 'A', '5599がAでない');
assert(E.rankFor(5000) === 'A', '5000がAでない');
assert(E.rankFor(4300) === 'B', '4300がBでない');
assert(E.rankFor(3600) === 'C', '3600がCでない');
assert(E.rankFor(3599) === 'D', '3599がDでない');

/* ---- 9. 自動プレイで3フロア完走 ---- */
var ga = newGame(77);
var steps = 0;
while (ga.phase !== 'over' && steps < 2000) {
  E.autoStep(ga);
  E.update(ga, 0.05);
  steps++;
}
assert(ga.phase === 'over', '自動プレイで終了しない (steps=' + steps + ')');
assert(ga.result && ga.result.clear === true, '自動プレイでクリアにならない');
assert(ga.result.floors.length === 3, '3フロア分の結果がない');
assert(ga.result.score > 0, '結果スコアが0');
assert(typeof ga.result.rank === 'string' && ga.result.rank.length === 1, 'ランクがない');
assert(ga.floorScores.length === 3, 'フロアスコアが3件でない');
for (var f = 0; f < ga.floorScores.length; f++) {
  assert(ga.floorScores[f].score >= 0, 'フロアスコアが負');
}

/* ---- 10. スナップショット ---- */
var snap = E.snapshot(ga);
assert(snap && snap.phase === 'over', 'スナップショットのphaseが不正');
assert(snap.floorCount === 3, 'スナップショットのfloorCountが不正');
assert(snap.floorScores.length === 3, 'スナップショットのフロア数が不正');
assert(typeof snap.ink === 'number' && typeof snap.mud === 'number', 'スナップショットの数値が不正');
assert(snap.result && snap.result.rank, 'スナップショットに結果がない');

print('engine tests OK (' + passed + ' assertions, ' + steps + ' auto steps)');
