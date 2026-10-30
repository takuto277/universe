/* test-engine.js : BEAT RUSH のコアロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = BeatRushEngine; }
var passed = 0;
function assert(cond, msg) { if (!cond) throw new Error('assert failed: ' + msg); passed++; }
function log(msg) { print(msg); }

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle' && g.totalNotes > 40, '開始前の譜面がある');
assert(E.start(g) === true && g.phase === 'run', '開始できる');

var note = g.notes[0];
g.time = note.time;
var hit = E.press(g, note.lane);
assert(hit && hit.hit && hit.judgment === 'PERFECT', 'ドンピシャでPERFECT');
assert(g.combo === 1 && g.perfect === 1 && g.score > 0, 'PERFECTで加点');

var early = E.press(g, (note.lane + 1) % 4);
assert(early === null, 'ノートのないレーンは空振り');

g = E.createGame({ rng: E.mulberry32(2) });
E.start(g);
g.time = g.notes[0].time + 0.3;
E.update(g, 0.01);
assert(g.missed === 1 && g.combo === 0, '判定外はMISS');

g = E.createGame({ rng: E.mulberry32(3) });
E.start(g);
g.time = g.notes[0].time + 0.08;
var good = E.press(g, g.notes[0].lane);
assert(good && good.judgment === 'GOOD', '少しズレるとGOOD');

g = E.createGame({ rng: E.mulberry32(4) });
E.start(g);
g.time = E.DURATION - 0.01;
E.update(g, 0.02);
assert(g.phase === 'over' && g.result && g.result.rank.length === 1, '30秒で終了してランクが出る');

g = E.createGame({ rng: E.mulberry32(5) });
E.autoStep(g);
for (var i = 0; i < 2400 && g.phase === 'run'; i++) {
  E.update(g, 1 / 60);
  E.autoStep(g);
}
assert(g.phase === 'over' && g.score > 0, '自動操作で30秒完走');
assert(g.result.accuracy > 90, '自動操作は高精度: ' + g.result.accuracy);

log('engine tests OK (' + passed + ' assertions)');
