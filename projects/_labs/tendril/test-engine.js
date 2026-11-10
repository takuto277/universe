/* test-engine.js : TENDRIL のコアロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = TendrilEngine; }

function assert(cond, message) { if (!cond) throw new Error(message); }

function seeded(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function simulate(state, seconds) {
  var step = 1 / 60;
  var n = Math.round(seconds / step);
  for (var i = 0; i < n && state.phase === 'playing'; i++) {
    E.autoStep(state);
    E.update(state, step);
  }
}

var g = E.createGame({ rng: seeded(7) });
assert(g.phase === 'idle', '初期状態はidle');
assert(g.orbs.length === 0, '開始前は餌がない');

assert(E.start(g) === true && g.phase === 'playing', '開始できる');
assert(g.orbs.length === 4, '餌が4個出る');
assert(g.spikes.length === 3, 'トゲが3個出る');
assert(g.body.length === g.bodyLen, '体のノード数が bodyLen と一致する');
assert(g.time === 0 && g.score === 0, '開始時にスコアと時間をリセットする');

var t = E.createGame({ rng: seeded(3) });
E.start(t);
var before = t.tentacle.len;
E.setPointer(t, t.head.x + 120, t.head.y, true);
for (var i = 0; i < 12; i++) E.update(t, 1 / 60);
assert(t.tentacle.len > before, '押している間は触手が伸びる');
E.setPointer(t, t.head.x + 120, t.head.y, false);
for (i = 0; i < 40; i++) E.update(t, 1 / 60);
assert(t.tentacle.len < 2, '離すと触手が戻る');

simulate(g, 46);
assert(g.phase === 'over', '45秒で終了する');
assert(g.result && g.result.score === g.score, '結果にスコアが入る');
assert(g.result.score > 0, '自動プレイで餌を捕食できる');
assert(g.result.eaten === g.eaten, '捕食数が結果と一致する');
assert(E.snapshot(g).over === true, 'スナップショットが終了を伝える');

var a = E.createGame({ rng: seeded(11) });
var b = E.createGame({ rng: seeded(11) });
E.start(a);
E.start(b);
for (i = 0; i < 900; i++) {
  E.autoStep(a); E.update(a, 1 / 60);
  E.autoStep(b); E.update(b, 1 / 60);
}
assert(a.score === b.score, '同じ乱数なら結果が再現する');

print('engine tests OK');
