/* test-engine.js : TUTOR のロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = TutorEngine; }

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}
function log(message) { print(message); }

function fresh(seed) {
  var game = E.createGame({ rng: E.mulberry32(seed) });
  E.start(game);
  game.spawnTimer = 999;
  return game;
}

function finishDemos(game) {
  for (var i = 0; i < E.DEMO_COUNT; i++) {
    game.objects = [];
    game.spawnTimer = 999;
    game.demoTimer = E.DEMO_TIME - 0.001;
    E.update(game, 0.05);
  }
}

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle', '初期状態はidle');
assert(E.start(g) === true && g.phase === 'demo', '開始でデモが始まる');
assert(g.demoIndex === 0 && g.samples.length === 0 && g.objects.length === 0, 'デモの初期値');
assert(g.robot.x === E.W / 2, 'ロボットは中央');

g = fresh(2);
var x0 = g.robot.x;
E.setInput(g, 1);
E.update(g, 0.1);
assert(g.robot.x > x0, '入力でロボットが動く');
assert(g.samples.length >= 1, '手本が記録される');
assert(g.samples[0].a === 1, '入力が行動ラベルになる');

g = fresh(3);
g.objects = [
  { kind: 'core', x: g.robot.x + 60, y: 500, vy: 0, r: 11 },
  { kind: 'bomb', x: g.robot.x - 30, y: 600, vy: 0, r: 12 }
];
var f = E.featuresFor(g);
assert(Math.abs(f[0] - 0.25) < 1e-9, 'コアのdxを正規化する');
assert(Math.abs(f[1] - (-0.25)) < 1e-9, 'コアのdyを正規化する');
assert(Math.abs(f[2] - (-0.125)) < 1e-9, 'ボムのdxを正規化する');
assert(Math.abs(f[3] - (-0.125)) < 1e-9, 'ボムのdyを正規化する');

g.samples = [
  { f: [0.5, -0.5, -2, -1], a: 1 },
  { f: [-0.5, -0.5, -2, -1], a: -1 },
  { f: [0.0, -0.5, -2, -1], a: 0 }
];
assert(E.predict(g, [0.4, -0.5, -2, -1]) === 1, '右の手本から右を選ぶ');
assert(E.predict(g, [-0.4, -0.5, -2, -1]) === -1, '左の手本から左を選ぶ');
assert(E.predict(g, [0.02, -0.5, -2, -1]) === 0, '中央の手本から停止を選ぶ');

g = fresh(4);
g.objects = [{ kind: 'bomb', x: g.robot.x, y: E.ROBOT_Y, vy: 0, r: 12 }];
E.update(g, 0.016);
assert(g.hits === 1, 'デモのボム被弾を記録する');
assert(g.stun > 0, 'ボム被弾でスタンする');
assert(g.phase === 'demo' && g.demoIndex === 0, 'デモはボムで終了しない');

g = fresh(5);
finishDemos(g);
assert(g.phase === 'train', '3回の手本のあと学習に入る');
g.phaseTimer = 0.001;
E.update(g, 0.05);
assert(g.phase === 'eval' && g.trialIndex === 0, '学習後に本番が始まる');

g.objects = [{ kind: 'core', x: g.robot.x, y: E.ROBOT_Y, vy: 0, r: 11 }];
g.spawnTimer = 999;
g.trialCores = 0;
E.update(g, 0.016);
assert(g.trialCores === 1, '本番でコアを取れる');

g = fresh(6);
finishDemos(g);
g.phaseTimer = 0.001;
E.update(g, 0.05);
g.objects = [{ kind: 'bomb', x: g.robot.x, y: E.ROBOT_Y, vy: 0, r: 12 }];
g.spawnTimer = 999;
g.trialCores = 1;
E.update(g, 0.016);
assert(g.trialIndex === 0, '本番はボムで終了しない');
assert(g.hits === 1 && g.stun > 0, '本番のボム被弾を記録してスタンする');
assert(g.trialCores === 0, 'ボムでコアを1個失う');

g = fresh(7);
finishDemos(g);
g.phaseTimer = 0.001;
E.update(g, 0.05);
for (var i = 0; i < E.TRIAL_COUNT; i++) {
  g.objects = [];
  g.spawnTimer = 999;
  g.trialTimer = E.TRIAL_TIME - 0.001;
  E.update(g, 0.05);
}
assert(g.phase === 'finished', '10回の本番で終了する');
assert(g.trials.length === E.TRIAL_COUNT, '全トライアルが記録される');
assert(g.result && g.result.trialsDone === E.TRIAL_COUNT, '結果にトライアル数が入る');
assert(g.result.rank === 'D', '0コアはDランク');

var a = E.createGame({ rng: E.mulberry32(8) });
var b = E.createGame({ rng: E.mulberry32(8) });
E.start(a);
E.start(b);
for (i = 0; i < 60; i++) {
  E.update(a, 1 / 60);
  E.update(b, 1 / 60);
}
assert(a.objects.length === b.objects.length && a.objects.length > 0, '同じシードで同じ数のオブジェクト');
var same = true;
for (i = 0; i < a.objects.length; i++) {
  if (a.objects[i].x !== b.objects[i].x || a.objects[i].y !== b.objects[i].y) same = false;
}
assert(same, '同じシードで同じ配置');

g = E.snapshot(fresh(9));
assert(g && g.robot && Array.isArray(g.objects) && Array.isArray(g.trials), 'スナップショットの形');
assert(g.demoCount === E.DEMO_COUNT && g.trialCount === E.TRIAL_COUNT, 'スナップショットの定数');

g = E.createGame({ rng: E.mulberry32(10) });
E.start(g);
var steps = 0;
while (g.phase !== 'finished' && steps < 30000) {
  E.autoStep(g);
  E.update(g, 1 / 60);
  steps++;
}
assert(g.phase === 'finished', '自動操作で最後まで進む');
assert(g.result && g.result.samples > 0, '自動操作で手本が記録される');
assert(g.result.trialsDone === E.TRIAL_COUNT, '自動操作で10回の本番を行う');
log('auto: score=' + g.result.score + ' / rank=' + g.result.rank + ' / samples=' + g.result.samples + ' / steps=' + steps);

log('engine tests OK (' + passed + ' assertions)');
