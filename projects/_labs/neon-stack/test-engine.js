/* test-engine.js : ネオンスタックのルール・重なり・PERFECT・カメラのテスト（jsc で実行）
 * 実行例:
 *   cd projects/_labs/neon-stack && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = NeonStackEngine;
}

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}
function log(m) { print(m); }

/* 1) 初期状態 */
var g = E.createGame();
assert(g.blocks.length === 1 && g.height === 0, '土台1個・高さ0から開始');
assert(g.score === 0 && g.combo === 0 && g.perfects === 0, 'スコア・コンボ・PERFECTの初期値');
assert(!g.over && g.overReason === null, '開始時はプレイ中');
assert(g.moving && g.moving.w === E.BLOCK_WIDTH, '次のブロックは土台と同じ幅');
assert(g.moving.x === -E.FIELD_HALF && g.moving.dir === 1, '左端から右へ動き始める');
assert(g.moving.y === E.BLOCK_HEIGHT, '次のブロックは土台の上');
assert(typeof g.moving.hue === 'number', '次のブロックに描画用の色相がある');
assert(g.speed === E.BASE_SPEED, '初期速度');

/* 2) 左右に往復し、範囲から出ない */
g = E.createGame();
var minX = Infinity, maxX = -Infinity, flips = 0, prevDir = g.moving.dir;
for (var i = 0; i < 60 * 4; i++) {
  E.update(g, 1 / 60);
  if (g.moving.x < minX) minX = g.moving.x;
  if (g.moving.x > maxX) maxX = g.moving.x;
  if (g.moving.dir !== prevDir) flips++;
  prevDir = g.moving.dir;
}
assert(minX >= -E.FIELD_HALF - 1e-6, '左端を越えない: ' + minX);
assert(maxX <= E.FIELD_HALF + 1e-6, '右端を越えない: ' + maxX);
assert(flips >= 2, '左右に往復する: flips=' + flips);

/* 3) 中心で落とすと PERFECT。幅は減らずコンボとボーナスが入る */
g = E.createGame();
g.moving.x = g.blocks[0].x;
var r = E.drop(g);
assert(r && r.placed && r.perfect && !r.over, '中心ならPERFECTで設置');
assert(r.width === E.BLOCK_WIDTH, 'PERFECTで幅が減らない');
assert(g.height === 1 && g.blocks.length === 2, '高さが1増える');
assert(g.combo === 1 && g.maxCombo === 1 && g.perfects === 1, 'コンボとPERFECT数');
assert(g.score === 25, 'PERFECTボーナス込みのスコア: ' + g.score);
assert(g.lastDrop.perfect === true && g.lastDrop.gain === 25, '直前の判定を保持');
assert(g.moving.w === E.BLOCK_WIDTH, '次のブロックも同じ幅');
assert(g.speed > E.BASE_SPEED, '高さに応じて速度が上がる: ' + g.speed);

var events = E.consumeEvents(g);
assert(events.some(function (ev) { return ev.type === 'place' && ev.perfect; }), 'PERFECTイベント');
assert(E.consumeEvents(g).length === 0, 'イベントは消費すると空になる');

/* 4) 連続PERFECTでコンボが伸びる */
g.moving.x = g.blocks[g.blocks.length - 1].x;
r = E.drop(g);
assert(r.perfect && r.combo === 2, '2連続PERFECT');
assert(g.maxCombo === 2 && g.perfects === 2, '最大コンボとPERFECT数が増える');
assert(g.score === 55, '2回目のボーナスが増える: ' + g.score);

/* 5) ずらすと重なった幅だけが残り、コンボはリセット */
g = E.createGame();
g.moving.x = 20;
r = E.drop(g);
assert(r.placed && !r.perfect, 'ずれていても重なれば設置');
assert(Math.abs(r.width - (E.BLOCK_WIDTH - 20)) < 1e-6, '重なり幅だけ残る: ' + r.width);
assert(Math.abs(g.blocks[1].x - 10) < 1e-6, '残った幅の中心に寄る');
assert(g.combo === 0 && g.maxCombo === 0 && g.perfects === 0, 'PERFECTでないとコンボは0');
assert(g.score === 10, '通常設置は10点');
assert(g.moving.w === r.width, '次のブロックは残った幅になる');

/* 6) 完全に外れたらゲームオーバー */
g = E.createGame();
g.moving.x = E.BLOCK_WIDTH;
r = E.drop(g);
assert(r && r.over && !r.placed, '重なり0ならゲームオーバー');
assert(g.over && g.overReason === 'miss' && g.moving === null, '終了状態になる');
assert(g.height === 0 && g.blocks.length === 1, '外したブロックは積まれない');
assert(g.debris.length === 1, '外れたブロックは落下する');
var debrisCount = g.debris.length;
for (i = 0; i < 60 * 3; i++) E.update(g, 1 / 60);
assert(g.debris.length === 0, '落ちたブロックはやがて消える: ' + g.debris.length);
assert(E.drop(g) === null, '終了後は落とせない');
assert(g.blocks.length === 1 && g.debris.length === 0, '終了後も状態は変わらない');

/* 7) わずかな重なりも許さない */
g = E.createGame();
g.moving.x = E.BLOCK_WIDTH - 1;
r = E.drop(g);
assert(r.over, '重なりが最小値以下なら終了');

/* 8) 中心付近の許容誤差の外は PERFECT にならない */
g = E.createGame();
var tol = E.perfectTolerance(E.BLOCK_WIDTH);
assert(tol > 0 && tol < E.BLOCK_WIDTH / 2, 'PERFECTの許容幅が現実的: ' + tol);
g.moving.x = tol + 1;
r = E.drop(g);
assert(!r.perfect && r.width < E.BLOCK_WIDTH, '許容誤差の外は幅が減る');

/* 9) 高さで速度が上がり、上限で止まる */
g = E.createGame();
for (i = 0; i < 30; i++) {
  g.moving.x = g.blocks[g.blocks.length - 1].x;
  E.drop(g);
  E.update(g, 1 / 60);
}
assert(g.height === 30, '30段まで積める');
assert(g.speed > E.BASE_SPEED, '高さ30で加速している: ' + g.speed);
assert(g.speed < E.MAX_SPEED, 'まだ上限ではない: ' + g.speed);
assert(g.cameraY > 200, 'カメラが塔を追う: ' + g.cameraY.toFixed(1));
assert(g.maxCombo === 30 && g.perfects === 30, '30連続PERFECT');

for (i = 0; i < 120; i++) {
  g.moving.x = g.blocks[g.blocks.length - 1].x;
  E.drop(g);
  E.update(g, 1 / 60);
}
assert(g.speed === E.MAX_SPEED, '速度が上限で止まる: ' + g.speed);
assert(g.cameraY > 1000, '高く積むほどカメラが上がる: ' + g.cameraY.toFixed(1));

/* 10) リサイズしても壊れない */
E.resize(g, 400, 820);
var snap = E.snapshot(g);
assert(snap.viewW === 400 && snap.viewH === 820, 'ビューサイズを保持');
assert(snap.moving && snap.moving.w > 0 && snap.moving.x >= -E.FIELD_HALF, 'リサイズ後もブロックが動く');

/* 11) リセットで初期状態に戻る */
E.reset(g);
assert(g.height === 0 && g.score === 0 && !g.over && g.blocks.length === 1, 'リセットで最初から');
assert(g.cameraY === 0 && g.debris.length === 0, 'カメラと破片も初期化');

log('engine tests OK (' + passed + ' アサーション)');
