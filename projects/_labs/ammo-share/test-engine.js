/* test-engine.js : AMMO SHARE のロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = AmmoShareEngine; }

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

function drone(x, y, hp) {
  return {
    type: 'drone', x: x, baseX: x, y: y, vy: 0, r: 13,
    hp: hp == null ? 1 : hp, maxHp: hp == null ? 1 : hp,
    score: 10, color: '#ff7bc8', shape: 'tri', weave: 0, freq: 0, phase: 0, flash: 0
  };
}

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle', '初期状態はidle');
assert(E.start(g) === true && g.phase === 'playing', '開始できる');
assert(g.time === 0 && g.score === 0 && g.shots === 0, '初期値');
assert(g.purgeCharges === E.PURGE_START, 'PURGEの初期数');
assert(g.player.x === E.W / 2, 'プレイヤーは中央');

g = fresh(2);
E.setFiring(g, true);
E.update(g, 0.016);
assert(g.shots === 1 && g.bullets.length === 1, '射撃すると弾が出る');
E.update(g, 0.016);
assert(g.shots === 1, 'クールダウン中は撃てない');
for (var i = 0; i < 20; i++) E.update(g, 0.016);
assert(g.shots > 1, '押し続けると再び撃てる');

g = fresh(3);
E.setFiring(g, true);
E.update(g, 0.02);
E.setFiring(g, false);
assert(g.shots === 1, '1発だけ撃つ');
for (i = 0; i < 20; i++) E.update(g, 0.05);
assert(g.pending.length === 1, '外した弾が返球予約になる');
assert(g.threats.length === 0, '予約中はまだ敵弾にならない');
for (i = 0; i < 34; i++) E.update(g, 0.05);
assert(g.threats.length >= 1, '予約後に赤い敵弾として降ってくる');

g = fresh(4);
g.player.x = 240;
g.enemies = [drone(240, 600, 1)];
E.setFiring(g, true);
for (i = 0; i < 12; i++) E.update(g, 0.016);
assert(g.kills === 1, '弾が敵を倒す');
assert(g.score >= 10, '撃破でスコアが入る');
assert(g.hits >= 1, '命中数が増える');
assert(g.enemies.length === 0, '倒した敵は消える');

g = fresh(5);
g.player.x = 240;
g.enemies = [drone(240, 600, 2)];
E.setFiring(g, true);
for (i = 0; i < 30; i++) E.update(g, 0.016);
assert(g.kills === 1, '複数HPの敵も倒せる');
assert(g.hits >= 2, '複数回の命中が必要');

g = fresh(6);
g.player.x = 240;
g.threats = [{ x: 240, y: E.PLAYER_Y, vy: 0, r: E.THREAT_R }];
E.update(g, 0.016);
assert(g.phase === 'finished', '返球に当たると終了する');
assert(g.result && g.result.reason === 'hit', '失敗理由がhit');

g = fresh(7);
g.enemies = [drone(123, E.H + 30, 1)];
E.update(g, 0.016);
assert(g.enemies.length === 0 && g.breaches === 1, '下に抜けた敵は消える');
assert(g.pending.length === 1, '抜けた敵も返球予約になる');

g = fresh(8);
g.pending = [{ x: 100, at: 5 }];
g.threats = [{ x: 200, y: 100, vy: 300, r: E.THREAT_R }];
var before = g.score;
assert(E.purge(g) === true, 'PURGEできる');
assert(g.purgeCharges === E.PURGE_START - 1, 'PURGEで残数が減る');
assert(g.pending.length === 0 && g.threats.length === 0, 'PURGEで返球が消える');
assert(g.score === before + 2, '消した返球がスコアになる');
E.purge(g);
assert(E.purge(g) === false, '残数0ではPURGEできない');

g = fresh(9);
g.purgeCharges = 0;
g.player.x = 240;
g.enemies = [{
  type: 'gold', x: 240, baseX: 240, y: 600, vy: 0, r: 10,
  hp: 1, maxHp: 1, score: 60, color: '#ffd166', shape: 'star',
  weave: 0, freq: 0, phase: 0, flash: 0
}];
E.setFiring(g, true);
for (i = 0; i < 12; i++) E.update(g, 0.016);
assert(g.kills === 1, '金の敵を倒せる');
assert(g.purgeCharges === 1, '金の敵でPURGEが回復する');

g = fresh(10);
g.time = E.DURATION - 0.01;
E.update(g, 0.05);
assert(g.phase === 'finished' && g.result.reason === 'clear', '60秒生存でCLEAR');
assert(g.score >= 200, '生存ボーナスが入る');
assert(g.result.rank, 'ランクが入る');

g = fresh(11);
var snap = E.snapshot(g);
assert(snap && snap.player && Array.isArray(snap.enemies) && snap.result === null, 'スナップショットの形');
assert(snap.duration === E.DURATION && snap.purgeCharges === E.PURGE_START, 'スナップショットの値');
assert(snap.accuracy === 0, '未射撃の命中率は0');

g = E.createGame({ rng: E.mulberry32(12) });
E.start(g);
var steps = 0;
while (g.phase !== 'finished' && steps < 20000) {
  E.autoStep(g);
  E.update(g, 1 / 60);
  steps++;
}
assert(g.phase === 'finished', '自動操作で必ず終了する');
assert(g.result && g.result.shots >= 0 && g.result.accuracy >= 0, '自動操作の結果が入る');
log('auto: ' + g.result.reason + ' / score=' + g.result.score + ' / kills=' + g.result.kills + ' / acc=' + g.result.accuracy + '% / steps=' + steps);

log('engine tests OK (' + passed + ' assertions)');
