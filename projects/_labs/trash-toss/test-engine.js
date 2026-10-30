/* test-engine.js : TRASH TOSS のスワイプ・投擲・スコア・30秒 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/trash-toss/engine.js']);
var E = TrashTossEngine;
var passed = 0;
function assert(cond, m) { if (!cond) throw new Error('assert failed: ' + m); passed++; }

assert(E.DURATION === 30, '30秒でない');
assert(E.DEPTH_START === 15, '前後移動が15秒でない');
assert(E.THROW_COOLDOWN > 0, '投擲クールダウンがない');

var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start();
var s = game.getState();
assert(s.phase === 'playing' && s.timeLeft === 30, '開始状態が不正');
assert(s.bin.x === 0 && Math.abs(s.bin.z - 3.4) < 0.001, '初期の箱位置が不正');

// スワイプの長さで奥行き、横で左右
game.setAim(-80, 220);
s = game.getState();
assert(s.aimActive === true && s.preview.length === 25, '軌道プレビューがない');
assert(s.aim.x < 0, '左スワイプで左を狙えない');
assert(s.aim.z > 4, '長いスワイプで奥を狙えない');

// 箱を狙った位置に固定して投げる
game.state.bin.x = s.aim.x;
game.state.bin.z = s.aim.z;
game.state.bin.targetX = s.aim.x;
game.state.bin.targetZ = s.aim.z;
game.state.bin.timer = 999;
assert(game.throwCurrent() === true, '投げられない');
s = game.getState();
assert(s.throws === 1 && s.projectiles.length === 1, '投擲が記録されない');
assert(game.throwCurrent() === false, 'クールダウン中に投げられる');
for (var i = 0; i < 100; i++) game.update(i / 60, 1 / 60);
s = game.getState();
assert(s.score === 1, '箱に入ってもスコアが増えない');
assert(s.perfects === 1, '中央投擲がPERFECTにならない');
assert(s.bestStreak === 1, '連続成功が記録されない');

// 外したらストリークが切れる
game.update(1, 0.3);
game.state.bin.x = 2.2;
game.state.bin.z = 5.0;
game.state.bin.targetX = 2.2;
game.state.bin.targetZ = 5.0;
game.setAim(-2.8, 70);
game.throwCurrent();
for (var mi = 0; mi < 100; mi++) game.update(2 + mi / 60, 1 / 60);
s = game.getState();
assert(s.throws === 2 && s.score === 1 && s.streak === 0, 'ミスでストリークが切れない');

// 15秒から前後移動
var depth = E.createGame();
depth.start();
for (var di = 0; di < 320 && depth.getState().phase === 'playing'; di++) depth.update(di / 60, 0.1);
s = depth.getState();
assert(s.depthPhase === true, '15秒で前後移動が始まらない');

// 30秒で終了
var end = E.createGame();
end.start();
for (var ei = 0; ei < 620 && end.getState().phase === 'playing'; ei++) end.update(ei / 60, 0.1);
s = end.getState();
assert(s.phase === 'finished' && s.result, '30秒で終了しない');
assert(s.result.throws === 0 && s.result.accuracy === 0, 'ノースローの結果が不正');

// 自動プレイ
var auto = E.createGame();
auto.start();
var steps = 0;
while (auto.getState().phase !== 'finished' && steps < 2200) {
  auto.autoStep();
  auto.update(steps / 60, 1 / 60);
  steps++;
}
s = auto.getState();
assert(s.phase === 'finished', '自動プレイが終了しない');
assert(s.result.score > 0, '自動プレイで1個も入らない');
assert(s.result.bestStreak >= 1, '自動プレイのストリークが記録されない');

print('engine tests OK (' + passed + ' assertions)');
