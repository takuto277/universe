/* test-engine.js : 0.1秒ドアマンのコアロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = DoormanEngine; }
var passed = 0;
function assert(cond, msg) { if (!cond) throw new Error('assert failed: ' + msg); passed++; }
function log(msg) { print(msg); }

function passenger(tag, progress) {
  return {
    id: 1,
    tag: tag,
    lane: 0,
    progress: progress,
    speed: 0,
    born: 0,
    resolved: false,
    outcome: null,
    outTimer: 0,
    perfect: false
  };
}

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle' && g.score === 0, '開始前は待機状態');
assert(E.start(g) === true && g.phase === 'run', '開始できる');
assert(g.doorOpen === 0, 'ドアは閉まった状態から始まる');

E.press(g, 'open');
for (var i = 0; i < 3; i++) E.update(g, 0.05);
assert(g.doorOpen > 0.9, '開けると0.1秒で開く: ' + g.doorOpen);
E.press(g, 'close');
for (i = 0; i < 3; i++) E.update(g, 0.05);
assert(g.doorOpen < 0.1, '閉じると0.1秒で閉まる: ' + g.doorOpen);

g = E.createGame({ rng: E.mulberry32(2) });
E.start(g);
E.press(g, 'open');
for (i = 0; i < 12; i++) E.update(g, 0.05);
assert(g.doorTarget === 0, '放置するとドアが自動で反転する');

g = E.createGame({ rng: E.mulberry32(3) });
E.start(g);
g.spawnTimer = 999;
g.doorOpen = 1;
g.lastInputAt = g.time;
g.passengers = [passenger('dress', E.DOOR_LINE)];
E.update(g, 0.01);
assert(g.passengers[0].outcome === 'entered', 'ドレスは開いたドアから入れる');
assert(g.served === 1 && g.combo === 1 && g.score > 0, '入場成功で加点');

g = E.createGame({ rng: E.mulberry32(4) });
E.start(g);
g.spawnTimer = 999;
g.doorOpen = 0;
g.lastInputAt = g.time;
g.passengers = [passenger('suit', E.DOOR_LINE)];
E.update(g, 0.01);
assert(g.passengers[0].outcome === 'blocked', 'スーツは閉じたドアで止められる');
assert(g.served === 1 && g.score > 0, 'ブロック成功で加点');

g = E.createGame({ rng: E.mulberry32(5) });
E.start(g);
g.spawnTimer = 999;
g.doorOpen = 1;
g.lastInputAt = g.time;
g.passengers = [passenger('suit', E.DOOR_LINE)];
E.update(g, 0.01);
assert(g.passengers[0].outcome === 'intruded', 'スーツが開いたドアから入ると失敗');
assert(g.missed === 1 && g.combo === 0, '失敗でコンボリセット');

g = E.createGame({ rng: E.mulberry32(6) });
E.start(g);
g.spawnTimer = 999;
g.doorOpen = 0;
g.lastInputAt = g.time;
g.passengers = [passenger('dress', E.DOOR_LINE)];
E.update(g, 0.01);
assert(g.passengers[0].outcome === 'missed', 'ドレスを閉じたドアで止めると失敗');

g = E.createGame({ rng: E.mulberry32(8) });
E.start(g);
g.spawnTimer = 999;
g.doorOpen = 1;
g.passengers = [passenger('dress', E.DOOR_LINE)];
E.update(g, 0.01);
assert(g.passengers[0].outcome === 'entered' && g.score === 0, '操作していない場合は加点なし');

g = E.createGame({ rng: E.mulberry32(7) });
E.autoStep(g);
for (i = 0; i < 2400 && g.phase === 'run'; i++) {
  E.update(g, 1 / 60);
  E.autoStep(g);
}
assert(g.phase === 'over' && g.over === true, '自動操作で30秒終了');
assert(g.score > 0 && g.served > 0, '自動操作で仕分けスコアが入る');
assert(E.rank(g.score).length > 0, '結果ランクが出る');

log('engine tests OK (' + passed + ' assertions)');
