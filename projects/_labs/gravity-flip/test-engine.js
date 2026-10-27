/* test-engine.js : 重力フリップのルール・生成・バランスのテスト（jsc で実行）
 * 実行例:
 *   cd projects/_labs/gravity-flip && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = GravityFlipEngine;
}

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}
function log(m) { print(m); }

function mulberry32(seed) {
  var t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    var r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGame(seed, width, height) {
  return E.createGame({
    width: width || 960,
    height: height || 540,
    rng: mulberry32(seed == null ? 1 : seed)
  });
}

/* 1) 初期状態 */
var g = makeGame(1);
assert(g.gravity === 1 && g.onSurface === 'floor', '床から開始');
assert(g.y === g.floorY - E.PLAYER_SIZE / 2, '床に接地した高さ');
assert(g.score === 0 && g.distance === 0 && !g.over, 'スコアと距離の初期値');
assert(g.floorY > g.ceilY && g.playerX > 0, '画面内の床・天井・プレイヤー位置');
assert(E.snapshot(g).speed === E.BASE_SPEED, '初期速度');
assert(g.obstacles.length === 2 && g.obstacles[0].side === 'floor' && g.obstacles[1].side === 'ceiling', '導入パターン');
assert(g.coinList.length === 3, '導入コイン');
assert(g.nextSpawnAt > 340, '導入パターンの右側が空くまで自然生成を待つ: ' + g.nextSpawnAt);

/* 2) 反転で重力と速度の向きが変わる */
assert(E.flip(g) === true, '反転できる');
assert(g.gravity === -1 && g.vy < 0, '反転で上向きの初速');
assert(g.onSurface === null, '反転直後は空中');
assert(g.flips === 1, '反転回数を数える');
assert(E.flip({ over: true }) === false, '終了後は反転できない');
E.flip(g);
assert(g.gravity === 1 && g.vy > 0, '再反転で下向き');

/* 3) 天井まで移動して張り付く */
g = makeGame(2);
E.flip(g);
for (var i = 0; i < 120; i++) E.update(g, 1 / 60);
assert(g.onSurface === 'ceiling', '反転後は天井に張り付く: ' + g.onSurface);
assert(Math.abs(g.y - (g.ceilY + E.PLAYER_SIZE / 2)) < 1e-6, '天井の高さ');

/* 4) 速度は距離で上がり、上限で止まる */
g = makeGame(3);
for (i = 0; i < 60 * 8; i++) {
  g.obstacles = [];
  g.over = false;
  E.update(g, 1 / 60);
}
var speed8 = g.speed;
assert(speed8 > E.BASE_SPEED, '時間経過で加速する');
assert(g.distance > 0 && g.score > 0, '距離とスコアが伸びる');
g.distance = 999999;
E.update(g, 1 / 60);
assert(g.speed === E.MAX_SPEED, '速度が上限で止まる');

/* 5) コイン取得 */
g = makeGame(4);
g.obstacles = [];
g.coinList = [{ x: g.playerX + 8, side: 'floor', r: E.COIN_RADIUS, collected: false }];
var coinsBefore = g.coinCount;
E.update(g, 1 / 60);
assert(g.coinCount === coinsBefore + 1, 'コインを取ると加算される');
assert(g.coinList.length === 0, '取ったコインは消える');
assert(g.score >= 10, 'コイン分のスコアが入る');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'coin'; }), 'コインイベント');

/* 6) トゲに当たると終了し、その後の更新は止まる */
g = makeGame(5);
g.obstacles = [{ side: 'floor', x: g.playerX - 30, w: 60, h: 60, count: 2 }];
g.coinList = [];
E.update(g, 1 / 60);
assert(g.over && g.deathCause === 'spike', 'トゲでゲームオーバー');
var distanceAtDeath = g.distance;
for (i = 0; i < 30; i++) E.update(g, 1 / 60);
assert(g.distance === distanceAtDeath, '終了後は進まない');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'death'; }), '死亡イベント');

/* 7) 天井のトゲにも当たる */
g = makeGame(6);
g.obstacles = [{ side: 'ceiling', x: g.playerX - 30, w: 60, h: 60, count: 2 }];
g.coinList = [];
g.gravity = -1;
g.onSurface = 'ceiling';
g.y = g.ceilY + E.PLAYER_SIZE / 2;
E.update(g, 1 / 60);
assert(g.over, '天井のトゲでゲームオーバー');

/* 8) トゲ同士が重ならず、反転できる間隔が空いている */
var minGap = Infinity;
var sawObstacle = false;
for (var gs = 0; gs < 5; gs++) {
  g = makeGame(700 + gs);
  var guard = 0;
  while (!g.over && guard++ < 60 * 12) {
    E.update(g, 1 / 60);
    if (g.obstacles.length === 0) continue;
    sawObstacle = true;
    var sorted = g.obstacles.slice().sort(function (a, b) { return a.x - b.x; });
    for (var k = 1; k < sorted.length; k++) {
      var gap = sorted[k].x - (sorted[k - 1].x + sorted[k - 1].w);
      if (gap < minGap) minGap = gap;
    }
  }
}
assert(sawObstacle, 'トゲが生成される');
assert(minGap > 50, 'トゲ同士が重ならない: minGap=' + minGap.toFixed(1));

/* 9) 何もしないプレイヤーは早めに死ぬ */
var dumbTimes = [];
for (var s = 0; s < 5; s++) {
  g = makeGame(100 + s);
  var steps = 0;
  while (!g.over && steps < 60 * 30) { E.update(g, 1 / 60); steps++; }
  dumbTimes.push(steps / 60);
  assert(g.over, '放置でゲームオーバーになる');
}
log('  放置プレイの生存時間: ' + dumbTimes.map(function (v) { return v.toFixed(1) + 's'; }).join(' / '));

/* 10) 上手いプレイヤーは長く生き残れる（間隔と速度のバランス確認） */
function runBot(seed, seconds) {
  var game = makeGame(seed);
  var lastFlip = -10;
  var steps = Math.floor(seconds * 60);
  for (var step = 0; step < steps && !game.over; step++) {
    var side = game.gravity > 0 ? 'floor' : 'ceiling';
    var lead = Math.max(130, game.speed * 0.62);
    var nearest = Infinity;
    for (var k = 0; k < game.obstacles.length; k++) {
      var o = game.obstacles[k];
      if (o.side !== side) continue;
      var edge = o.x + o.w - game.playerX;
      if (edge > 0 && edge < nearest) nearest = edge;
    }
    if (nearest < lead && game.time - lastFlip > 0.2) {
      E.flip(game);
      lastFlip = game.time;
    }
    E.update(game, 1 / 60);
  }
  return game;
}

var survived = [];
for (s = 0; s < 6; s++) {
  g = runBot(500 + s, 60);
  survived.push(g.time);
  assert(!g.over, '上手いプレイで60秒生き残れる (seed=' + (500 + s) + ', ' + g.time.toFixed(1) + 's)');
}
log('  自動プレイの生存時間: ' + survived.map(function (v) { return v.toFixed(1) + 's'; }).join(' / '));

log('engine tests OK (' + passed + ' アサーション)');
