/* test-engine.js : AFTERIMAGE のロジック検証（jsc で実行）
 *   cd projects/_labs/afterimage && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = AfterimageEngine;
}

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}
function newGame(seed) {
  var g = E.createGame({ seed: seed == null ? 12345 : seed });
  g.start();
  return g;
}
function frames(g, n) {
  for (var i = 0; i < n; i++) g.update(1 / 60);
}
function countKind(g, kind) {
  var n = 0;
  for (var i = 0; i < g.state.platforms.length; i++) if (g.state.platforms[i].kind === kind) n++;
  return n;
}
function findBeacon(g, id) {
  for (var i = 0; i < g.state.platforms.length; i++) {
    if (g.state.platforms[i].beacon && g.state.platforms[i].beaconId === id) return g.state.platforms[i];
  }
  return null;
}

/* 1) 初期化 */
var g = newGame(12345);
assert(g.state.phase === 'playing', '開始後にplayingでない');
assert(g.state.lives === E.MAX_LIVES, 'ライフが3でない');
assert(g.state.heightM === 0, '開始高度が0mでない');
assert(g.state.platforms.length > 12, '塔の足場が少なすぎる');
assert(g.state.player.onGround === true, '開始時に地面に立っていない');

/* 2) ジャンプと頂点の残像 */
var jump = newGame(1);
jump.pressJump();
jump.update(1 / 60);
assert(jump.state.player.vy > 0, 'ジャンプで上向き速度が出ない');
assert(jump.state.player.onGround === false, 'ジャンプ後も地上扱い');
frames(jump, 28);
assert(jump.state.pendingTrails.length > 0 || countKind(jump, 'trail') > 0, '頂点の残像が予約されない');
frames(jump, 20);
assert(countKind(jump, 'trail') > 0, '残像の足場が固まらない');
var trailCount = countKind(jump, 'trail');
frames(jump, 240);
assert(countKind(jump, 'trail') < trailCount, '残像が時間で消えない');

/* 3) 残像から跳ぶと少し高くなる */
var a = newGame(2);
var b = newGame(2);
assert(E.JUMP_V > 0, 'ジャンプ速度定数がない');
a.state.player.onGround = true;
a.state.player.groundId = 0;
a.state.player.fromTrail = false;
a.pressJump();
a.update(1 / 60);
var normalVy = a.state.player.vy;
b.state.platforms.push({
  id: 999, x: b.state.player.x - 20, y: b.state.player.y, w: 40,
  kind: 'trail', beacon: false, beaconId: -1, checked: false,
  life: 3, maxLife: 3
});
b.state.player.onGround = true;
b.state.player.groundId = 999;
b.state.player.fromTrail = true;
b.pressJump();
b.update(1 / 60);
assert(b.state.player.vy > normalVy, '残像からのジャンプが高くならない: ' + normalVy + ' vs ' + b.state.player.vy);

/* 4) チェックポイント */
var cp = newGame(3);
var beacon = findBeacon(cp, 0);
assert(beacon, '最初のチェックポイントがない');
cp.state.cameraY = Math.max(0, beacon.y - 230);
cp.state.player.x = beacon.x + beacon.w / 2;
cp.state.player.y = beacon.y + 26;
cp.state.player.vy = -1;
cp.state.player.onGround = false;
cp.state.player.groundId = -1;
frames(cp, 30);
assert(cp.state.checkpoints === 1, 'チェックポイントが1回でない: ' + cp.state.checkpoints);
assert(Math.abs(cp.state.respawn.y - beacon.y) < 1, '再開位置がチェックポイントでない');
assert(beacon.checked === true, 'チェックポイントがcheckedにならない');

/* 5) 落下でライフが減り、0で終了 */
var fall = newGame(4);
for (var f = 0; f < 3; f++) {
  fall.state.cameraY = 1200;
  fall.state.player.y = 900;
  fall.update(1 / 60);
}
assert(fall.state.phase === 'over', '3回落ちても終了しない');
assert(fall.state.result && fall.state.result.reason === 'fall', '終了理由がfallでない');
assert(fall.state.lives === 0, 'ライフが0でない');

/* 6) 時間切れ */
var time = newGame(5);
time.state.timeLeft = 0.01;
time.update(0.05);
assert(time.state.phase === 'over', '時間切れで終了しない');
assert(time.state.result && time.state.result.reason === 'time', '終了理由がtimeでない');

/* 7) 頂上で勝利 */
var win = newGame(6);
var goal = null;
for (var i = 0; i < win.state.platforms.length; i++) {
  if (win.state.platforms[i].kind === 'goal') { goal = win.state.platforms[i]; break; }
}
assert(goal, '頂上の足場がない');
win.state.cameraY = Math.max(0, goal.y - 230);
win.state.player.x = goal.x + goal.w / 2;
win.state.player.y = goal.y + 1.5;
win.state.player.vy = -1;
win.state.player.onGround = false;
win.state.player.groundId = -1;
frames(win, 12);
assert(win.state.phase === 'victory', '頂上で勝利しない: ' + win.state.phase);
assert(win.state.result && win.state.result.reason === 'victory', '終了理由がvictoryでない');
assert(win.state.result.rank === 'S' || win.state.result.rank === 'A' || win.state.result.rank === 'B', '勝利ランクが不正');

/* 8) 塔の再現性 */
var t1 = E.generateTower(777);
var t2 = E.generateTower(777);
var t3 = E.generateTower(888);
assert(t1.length === t2.length, '同シードで塔の長さが違う');
assert(t1[5].x === t2[5].x && t1[5].y === t2[5].y, '同シードで足場が違う');
assert(t1.length !== t3.length || t1[5].x !== t3[5].x || t1[5].y !== t3[5].y, '別シードで塔が同じ');

/* 9) 自動プレイが終了する */
var auto = newGame(12345);
var guard = 0;
while (auto.state.phase !== 'over' && auto.state.phase !== 'victory' && guard < 8000) {
  auto.autoStep();
  auto.update(1 / 60);
  guard++;
}
assert(auto.state.phase === 'over' || auto.state.phase === 'victory', '自動プレイが終了しない');
assert(auto.state.maxY > 80, '自動プレイがほとんど登れていない: maxY=' + auto.state.maxY);
assert(auto.state.result && auto.state.result.score > 0, '自動プレイでスコアが入らない');

print('engine tests OK (' + passed + ' assertions)');
print('  auto: phase=' + auto.state.phase + ' height=' + auto.state.heightM + 'm' +
  ' score=' + auto.state.result.score + ' steps=' + guard);
