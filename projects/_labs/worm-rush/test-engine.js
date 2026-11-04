/* test-engine.js : WORM RUSH */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = WormRushEngine; }
var passed = 0;
function assert(cond, msg) { if (!cond) throw new Error('assert failed: ' + msg); passed++; }
function log(msg) { print(msg); }

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle', '開始前は待機');
assert(E.start(g) === true && g.phase === 'run', '開始できる');
assert(g.worms.length === 11 && g.player.length === E.START_LENGTH, 'プレイヤー+AI10匹');
assert(g.foods.length === E.FOOD_COUNT, '餌が生成される');

var x0 = g.player.x;
g.player.angle = 0;
E.setInput(g, { angle: 0, boost: false });
E.update(g, 0.1);
assert(g.player.x > x0, '入力方向に移動する');

g.foods = [{ id: 999, x: g.player.x, y: g.player.y, r: 5, color: '#fff', value: 2, phase: 0 }];
var len0 = g.player.length;
E.update(g, 0.016);
assert(g.player.length === len0 + 2, '餌を食べると伸びる');

g = E.createGame({ rng: E.mulberry32(2) });
E.start(g);
g.foods = [];
g.player.length = 20;
g.player.segments = [];
for (var i = 1; i < 20; i++) g.player.segments.push({ x: -i * 7, y: 0 });
E.setInput(g, { angle: 0, boost: true });
for (i = 0; i < 10; i++) E.update(g, 0.05);
assert(g.player.length < 20, 'ブーストで体が短くなる');

g = E.createGame({ rng: E.mulberry32(3) });
E.start(g);
var ai = g.worms[1];
ai.alive = false;
ai.respawnTimer = 0.1;
for (i = 0; i < 4; i++) E.update(g, 0.05);
assert(ai.alive === true, 'AIは死亡後に復活する');
assert(g.worms.filter(function (w) { return w.alive && !w.isPlayer; }).length === 10, 'AIの数が維持される');

g = E.createGame({ rng: E.mulberry32(4) });
E.start(g);
g.player.x = E.WORLD_RADIUS - 1;
g.player.y = 0;
g.player.angle = 0;
E.setInput(g, { angle: 0, boost: true });
E.update(g, 0.05);
assert(g.phase === 'over' && g.result, '境界に出るとゲームオーバー');

g = E.createGame({ rng: E.mulberry32(5) });
E.start(g);
g.player.invuln = 999;
E.autoStep(g);
for (i = 0; i < 600; i++) {
  E.autoStep(g);
  E.update(g, 1 / 60);
}
assert(g.phase === 'run' && g.time > 5, '自動操作でしばらく生存');
assert(g.leaderboard.length > 0, 'ランキングが出る');

log('engine tests OK (' + passed + ' assertions)');
