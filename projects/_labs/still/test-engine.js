/* test-engine.js : STILL のロジック検証（jsc で実行）
 *   cd projects/_labs/still && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = StillEngine;
}

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}
function newGame(seed) {
  var g = E.createGame({ seed: seed == null ? 12345 : seed });
  g.start();
  return g;
}
function step(g, n) {
  for (var i = 0; i < n; i++) {
    g.autoStep();
    g.update(1 / 60);
  }
}

/* 1) 初期化 */
var g = newGame(12345);
assert(g.state.phase === 'playing', '開始後にplayingでない');
assert(g.state.room === 0, '最初の部屋が0でない');
assert(g.state.enemies.length === 3, '部屋Aの敵が3体でない');
assert(g.state.timeLeft === E.TOTAL_TIME, '制限時間が60秒でない');
assert(g.state.player.x === E.ROOMS[0].start.x, '開始位置が不正');

/* 2) 止まると時が進まず、制限時間だけ減る */
var px = g.state.player.x;
var py = g.state.player.y;
for (var t2 = 0; t2 < 30; t2++) g.update(1 / 60);
assert(g.state.flow < 0.01, '停止時のflowが0でない: ' + g.state.flow);
assert(g.state.player.x === px && g.state.player.y === py, '停止時にプレイヤーが動く');
assert(g.state.timeLeft < E.TOTAL_TIME - 0.4, '停止時に制限時間が減らない');

/* 3) 動くとflowが上がり、移動する */
g.setMove(1, 0);
for (var t3 = 0; t3 < 30; t3++) g.update(1 / 60);
assert(g.state.flow > 0.5, '移動時のflowが上がらない: ' + g.state.flow);
assert(g.state.player.x > px + 40, '移動でプレイヤーが進まない');

/* 4) 射撃で弾が出る */
var g2 = newGame(1);
g2.setAim(1, 0);
g2.setFiring(true);
g2.update(0.12);
var friendly = 0;
for (var i = 0; i < g2.state.bullets.length; i++) if (g2.state.bullets[i].friendly) friendly++;
assert(friendly > 0, '射撃で弾が出ない');
g2.setFiring(false);

/* 5) 敵を倒すとスコアとEXITが開く */
var g3 = newGame(2);
for (var e = 0; e < g3.state.enemies.length; e++) {
  if (e > 0) g3.state.enemies[e].alive = false;
}
g3.state.enemies[0].x = g3.state.player.x + 90;
g3.state.enemies[0].y = g3.state.player.y;
g3.state.enemies[0].fireTimer = 99;
g3.setAim(1, 0);
g3.setFiring(true);
g3.setMove(0, 1);
var guard = 0;
while (g3.state.enemies[0].alive && guard < 240) {
  g3.update(1 / 60);
  guard++;
}
assert(!g3.state.enemies[0].alive, '弾が敵に当たらない');
assert(g3.state.kills === 1, '撃破数が1でない');
assert(g3.state.score >= 120, '撃破スコアが入らない');
assert(g3.state.exitOpen === true, '全滅後にEXITが開かない');

/* 6) EXITに触れると次の部屋へ */
g3.state.player.x = g3.state.exit.x;
g3.state.player.y = g3.state.exit.y;
g3.update(1 / 60);
assert(g3.state.phase === 'roomclear', 'EXITでroomclearにならない: ' + g3.state.phase);
for (var t6 = 0; t6 < 80; t6++) g3.update(1 / 60);
assert(g3.state.room === 1 && g3.state.phase === 'playing', '次の部屋へ進まない');
assert(g3.state.enemies.length === 4, '部屋Bの敵が4体でない');

/* 7) 被弾で終了 */
var g4 = newGame(3);
g4.state.player.invuln = 0;
g4.state.bullets.push({
  x: g4.state.player.x, y: g4.state.player.y, vx: 1, vy: 0,
  r: 5, friendly: false, life: 1, color: '#fff'
});
g4.update(1 / 60);
assert(g4.state.phase === 'over', '被弾で終了しない');
assert(g4.state.result && g4.state.result.reason === 'hit', '終了理由がhitでない');

/* 8) 時間切れ */
var g5 = newGame(4);
g5.state.timeLeft = 0.01;
g5.update(0.1);
assert(g5.state.phase === 'over', '時間切れで終了しない');
assert(g5.state.result && g5.state.result.reason === 'time', '終了理由がtimeでない');
assert(g5.state.result.score === g5.state.score, '結果スコアが不一致');

/* 9) シード再現性 */
var a = newGame(777);
var b = newGame(777);
assert(a.state.enemies[0].x === b.state.enemies[0].x, '同シードで敵位置が違う');
assert(a.state.enemies[0].type === b.state.enemies[0].type, '同シードで敵種が違う');
var c = newGame(888);
assert(a.state.enemies[0].angle !== c.state.enemies[0].angle ||
  a.state.enemies[0].fireTimer !== c.state.enemies[0].fireTimer, '別シードで敵の内部状態が同じ');

/* 10) 自動プレイが終了する */
var auto = newGame(12345);
var guard2 = 0;
while (auto.state.phase !== 'over' && auto.state.phase !== 'victory' && guard2 < 8000) {
  auto.autoStep();
  auto.update(1 / 60);
  guard2++;
}
assert(auto.state.phase === 'over' || auto.state.phase === 'victory', '自動プレイが終了しない');
assert(auto.state.result && auto.state.result.score > 0, '自動プレイでスコアが入らない');
assert(auto.state.kills > 0, '自動プレイで敵を倒せていない');

print('engine tests OK (' + passed + ' assertions)');
print('  auto: phase=' + auto.state.phase + ' score=' + auto.state.result.score +
  ' kills=' + auto.state.kills + ' steps=' + guard2);
