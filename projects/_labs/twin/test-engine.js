/* test-engine.js : TWIN のロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = TwinEngine; }

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

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle', '初期状態はidle');
assert(E.start(g) === true && g.phase === 'playing', '開始できる');
assert(g.lives === E.MAX_LIVES, 'ライフが満タン');
assert(g.stage === 0 && g.gates.length > 0, 'ステージ1のゲートがある');
assert(g.lagOwner === 'front', '最初はFRONTが遅延する');
assert(g.twins.front.lag === E.DELAY && g.twins.rear.lag === 0, '遅延の割り当てが正しい');

var a = fresh(7);
var b = fresh(7);
var same = a.gates.length === b.gates.length;
for (var i = 0; i < a.gates.length && same; i++) {
  if (a.gates[i].center !== b.gates[i].center) same = false;
}
assert(same, '同じシードで同じゲート列になる');

var cfg = E.STAGES[0];
for (i = 0; i < a.gates.length; i++) {
  var gate = a.gates[i];
  assert(gate.center - gate.half >= E.MARGIN - 1e-9, 'ゲートが左端からはみ出さない');
  assert(gate.center + gate.half <= E.W - E.MARGIN + 1e-9, 'ゲートが右端からはみ出さない');
  if (i > 0) {
    assert(Math.abs(gate.center - a.gates[i - 1].center) <= cfg.delta + 1e-9, '隣接ゲートのズレが到達可能');
  }
}

g = fresh(2);
var rear0 = g.twins.rear.x;
var front0 = g.twins.front.x;
E.setInput(g, 1);
E.update(g, 0.1);
assert(g.twins.rear.x > rear0, '遅延なしのREARはすぐ動く');
assert(Math.abs(g.twins.front.x - front0) < 1e-6, '遅延ありのFRONTはまだ動かない');
for (i = 0; i < 30; i++) E.update(g, 0.02);
assert(g.twins.front.x > front0 + 1, '遅延後にFRONTが追従する');

g = fresh(3);
E.swap(g);
assert(g.lagOwner === 'rear' && g.twins.rear.lag === E.DELAY && g.twins.front.lag === 0, 'SWAPで遅延側が入れ替わる');
var f0 = g.twins.front.x;
var r0 = g.twins.rear.x;
E.setInput(g, -1);
E.update(g, 0.1);
assert(g.twins.front.x < f0, 'SWAP後のFRONTはすぐ動く');
assert(Math.abs(g.twins.rear.x - r0) < 1e-6, 'SWAP後のREARはまだ動かない');

g = fresh(4);
gate = g.gates[0];
g.twins.front.x = gate.center;
g.twins.rear.x = gate.center;
g.distance = gate.y - 1;
g.time = 5;
g.history = [{ t: 0, dir: 0 }];
g.input = 0;
var passedBefore = g.gatesPassed;
var livesBefore = g.lives;
E.update(g, 0.05);
assert(g.gatesPassed >= passedBefore + 1, '開口部にいるとゲートを通過できる');
assert(g.lives === livesBefore, '通過ではライフが減らない');

g = fresh(5);
gate = g.gates[0];
g.twins.front.x = E.MARGIN;
g.twins.rear.x = E.MARGIN;
g.distance = gate.y - 1;
g.time = 5;
g.lives = 1;
g.history = [{ t: 0, dir: 0 }];
g.input = 0;
E.update(g, 0.05);
assert(g.phase === 'finished', 'ライフ0で終了する');
assert(g.result && g.result.reason === 'down', '失敗理由がdown');

g = fresh(6);
g.gates = [];
g.distance = E.STAGES[0].target - 0.1;
E.update(g, 0.05);
assert(g.phase === 'clear' && g.clearTimer > 0, '目標到達でステージクリア');
for (i = 0; i < 40; i++) E.update(g, 0.05);
assert(g.stage === 1 && g.phase === 'playing', 'クリア後に次のステージが始まる');
assert(g.lives === E.MAX_LIVES, 'ステージクリアでライフが回復する');
assert(g.distance < 100, '次ステージは下から始まる');

g = fresh(8);
g.stage = E.STAGES.length - 1;
g.gates = [];
g.distance = E.STAGES[g.stage].target - 0.1;
E.update(g, 0.05);
for (i = 0; i < 40; i++) E.update(g, 0.05);
assert(g.phase === 'finished' && g.result && g.result.reason === 'clear', '最終ステージクリアでCLEAR');
assert(g.result.score > 0, 'CLEARにもスコアが入る');

g = fresh(9);
var snap = E.snapshot(g);
assert(snap && snap.twins && snap.gates && snap.result === null, 'スナップショットの形');
assert(snap.maxLives === E.MAX_LIVES && snap.stage === 1, 'スナップショットの値');
assert(snap.lagOwner === 'front', 'スナップショットの遅延側');

g = E.createGame({ rng: E.mulberry32(10) });
E.start(g);
var steps = 0;
while (g.phase !== 'finished' && steps < 20000) {
  E.autoStep(g);
  E.update(g, 1 / 60);
  steps++;
}
assert(g.phase === 'finished', '自動操作で必ず終了する');
assert(g.result && g.result.score >= 0 && g.result.stage >= 1, '自動操作の結果が入る');
log('auto: ' + (g.result.reason) + ' / stage=' + g.result.stage + ' / score=' + g.result.score + ' / steps=' + steps);

log('engine tests OK (' + passed + ' assertions)');
