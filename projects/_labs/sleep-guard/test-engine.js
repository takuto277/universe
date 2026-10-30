/* test-engine.js : ねむりのまもりのコアロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = SleepGuardEngine; }
var passed = 0;
function assert(cond, msg) { if (!cond) throw new Error('assert failed: ' + msg); passed++; }
function log(msg) { print(msg); }

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle' && g.sleep === E.START_SLEEP, '開始前は1/3ゲージ');
assert(E.start(g) === true && g.phase === 'run', '開始できる');
E.update(g, 1);
assert(g.sleep > E.START_SLEEP && g.sleep < 38, '静かな時間でゲージが増える: ' + g.sleep);

for (var i = 0; i < 30 && g.noises.length === 0; i++) E.update(g, 0.1);
assert(g.noises.length > 0, '騒音が出現する');
var noise = g.noises[0];
var beforeTap = g.sleep;
var tapped = E.tapAt(g, noise.x, noise.y);
assert(tapped && tapped.id === noise.id, '騒音をタップで止められる');
assert(g.noises.length === 0, 'タップ後に騒音が消える');
assert(g.sleep > beforeTap, 'タップでゲージが少し回復');
assert(g.score === 10 && g.stopped === 1, 'スコアと停止数');

g = E.createGame({ rng: E.mulberry32(2) });
E.start(g);
g.noises.push({ id: 99, type: 'tv', icon: '📺', label: 'テレビ', x: 100, y: 100, r: 24 });
g.sleep = 50;
E.update(g, 1);
assert(g.sleep < 50, '騒音中はゲージが減る: ' + g.sleep);
assert(E.tapAt(g, 0, 0) === null, '何もない場所のタップは無効');

g = E.createGame({ rng: E.mulberry32(3) });
E.start(g);
for (i = 0; i < 30 && g.noises.length === 0; i++) E.update(g, 0.1);
assert(g.noises.length > 0 && g.noises[0].active === false, '出現直後はまだ鳴っていない');
var graceSleep = g.sleep;
for (i = 0; i < 15; i++) E.update(g, 0.05);
assert(g.noises[0].active === false && g.sleep === graceSleep, '2秒前はゲージが減らない');
for (i = 0; i < 30; i++) E.update(g, 0.05);
assert(g.noises[0].active === true, '2秒後に騒音が鳴り始める');
var afterActive = g.sleep;
E.update(g, 0.05);
assert(g.sleep < afterActive, '鳴り始めたらゲージが減る');

g = E.createGame({ rng: E.mulberry32(3) });
E.start(g);
g.sleep = 99.9;
E.update(g, 0.05);
assert(g.phase === 'clear' && g.result === 'clear' && g.sleep === E.MAX_SLEEP, 'MAXでクリア');

g = E.createGame({ rng: E.mulberry32(4) });
E.start(g);
g.sleep = 0.1;
g.noises.push({ id: 1, type: 'door', icon: '🚪', label: 'ドア', x: 100, y: 100, r: 24 });
E.update(g, 0.05);
assert(g.phase === 'over' && g.result === 'over' && g.sleep === 0, '0でゲームオーバー');

g = E.createGame({ rng: E.mulberry32(5) });
E.autoStep(g);
assert(g.phase === 'run', 'autoStepで開始');
for (i = 0; i < 5000 && g.phase === 'run'; i++) {
  E.update(g, 1 / 60);
  E.autoStep(g);
}
assert(g.phase === 'clear', '自動操作でクリアできる: ' + g.phase);
assert(E.snapshot(g).noises.length === 0, 'クリア後の騒音なし');

log('engine tests OK (' + passed + ' assertions)');
