/* test-engine.js : REBEL BREAKOUT のロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = RebelBreakoutEngine; }

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}
function log(message) { print(message); }

function fresh(seed) {
  var game = E.createGame({ rng: E.mulberry32(seed) });
  E.start(game);
  return game;
}

function stillBall(x, y, vx, vy) {
  return { id: 99, x: x, y: y, vx: vx, vy: vy, aim: 999, near: false };
}

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle', '初期状態はidle');
assert(E.start(g) === true && g.phase === 'playing', '開始できる');
assert(g.lives === E.MAX_LIVES, 'ライフが満タン');
assert(g.shields.length > 0, 'シールドが生成される');
assert(g.balls.length === 1, '開始時にボールが1つある');
assert(g.player.x === E.W / 2, 'プレイヤーは中央にいる');

var a = fresh(7);
var b = fresh(7);
assert(a.shields.length === b.shields.length, '同じシードでシールド数が同じ');
assert(a.balls[0].vx === b.balls[0].vx && a.balls[0].vy === b.balls[0].vy, '同じシードで初速が同じ');
assert(a.shields[0].x === b.shields[0].x && a.shields[0].y === b.shields[0].y, '同じシードでシールド配置が同じ');

g = fresh(2);
var x0 = g.player.x;
E.setInput(g, 1, 0);
E.update(g, 0.1);
assert(g.player.x > x0, '右入力で右に動く');
for (var i = 0; i < 200; i++) E.update(g, 0.05);
var half = E.PLAYER_SIZE / 2;
assert(g.player.x <= E.W - E.MARGIN - half + 1e-6, '右端で止まる');
assert(g.player.x >= E.MARGIN + half - 1e-6, '左端で止まる');

g = fresh(3);
g.shields = [];
g.nextSpawnIndex = E.BALL_SPAWN_TIMES.length;
g.balls = [stillBall(E.MARGIN + E.BALL_R + 5, E.H / 2, -400, 0)];
E.setInput(g, 0, 0);
E.update(g, 0.05);
assert(g.balls[0].x >= E.MARGIN + E.BALL_R - 1e-6, '左壁を突き抜けない');
assert(g.balls[0].vx > 0, '左壁で反射する');

g = fresh(4);
var target = { x: E.W * 0.3, y: 200, w: 80, h: 28, row: 0, color: '#fff' };
g.shields = [target];
g.nextSpawnIndex = E.BALL_SPAWN_TIMES.length;
g.balls = [stillBall(target.x, target.y, 10, 0)];
E.setInput(g, 0, 0);
E.update(g, 0.001);
assert(g.shields.length === 0, 'ボールが当たったシールドは消える');
assert(g.shieldsBroken === 1, '壊した数が増える');
var hasBreak = false;
for (i = 0; i < g.events.length; i++) if (g.events[i].type === 'break') hasBreak = true;
assert(hasBreak, 'breakイベントが出る');

g = fresh(5);
g.shields = [];
g.nextSpawnIndex = E.BALL_SPAWN_TIMES.length;
g.balls = [stillBall(g.player.x, g.player.y, 5, 0)];
g.player.invuln = 0;
E.update(g, 0.001);
assert(g.lives === E.MAX_LIVES - 1, '被弾でライフが1減る');
assert(g.hits === 1, '被弾数が増える');
assert(g.player.invuln > 0, '被弾後に無敵時間が入る');
assert(g.phase === 'playing', 'ライフが残っていれば続く');
var lives = g.lives;
E.update(g, 0.001);
assert(g.lives === lives, '無敵中は連続で減らない');

g = fresh(6);
g.shields = [];
g.nextSpawnIndex = E.BALL_SPAWN_TIMES.length;
g.balls = [stillBall(g.player.x, g.player.y, 5, 0)];
g.player.invuln = 0;
g.lives = 1;
E.update(g, 0.001);
assert(g.phase === 'finished', 'ライフ0で終了する');
assert(g.result && g.result.reason === 'down', '失敗理由がdown');
assert(g.result.rank === 'D' || g.result.rank === 'C' || g.result.rank === 'B', '失敗ランクが入る');

g = fresh(8);
var shieldsBefore = g.shields.length;
assert(E.swap(g) === true, 'SWAPできる');
assert(g.swaps === 1, 'SWAP回数が増える');
assert(g.shields.length === shieldsBefore - 1, 'SWAPでシールドを1つ使う');
assert(g.player.swapCd > 0, 'SWAP後にクールダウンが入る');
assert(E.swap(g) === false, 'クールダウン中はSWAPできない');

g = fresh(9);
g.shields = [];
assert(E.swap(g) === false, 'シールドが無いとSWAPできない');

g = fresh(10);
g.time = E.DURATION - 0.001;
g.shields = [];
g.balls = [];
E.update(g, 0.01);
assert(g.phase === 'finished', '60秒で終了する');
assert(g.result && g.result.reason === 'clear', '60秒生存はclear');
assert(g.result.rank === 'S', 'ライフ満タンclearはSランク');
assert(g.result.score > 0, 'clearにもスコアが入る');

g = fresh(11);
var snap = E.snapshot(g);
assert(snap && snap.player && snap.balls && snap.result === null, 'スナップショットの形');
assert(snap.maxLives === E.MAX_LIVES && snap.over === false, 'スナップショットの値');
assert(snap.shieldCount === undefined && snap.shields === g.shields.length, 'シールド数が入る');

g = E.createGame({ rng: E.mulberry32(12) });
var steps = 0;
while (g.phase !== 'finished' && steps < 20000) {
  E.autoStep(g);
  E.update(g, 1 / 60);
  steps++;
}
assert(g.phase === 'finished', '自動操作で必ず終了する');
assert(g.result && (g.result.reason === 'clear' || g.result.reason === 'down'), '自動操作の結果が入る');
log('auto: ' + g.result.reason + ' / time=' + g.result.time + ' / score=' + g.result.score +
  ' / graze=' + g.result.nearMisses + ' / broken=' + g.result.shieldsBroken + ' / steps=' + steps);

log('engine tests OK (' + passed + ' assertions)');
