/* test-engine.js : TETHER のテザー・更新・60秒終了（jsc で実行） */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/tether/engine.js']);
var E = TetherEngine;
var passed = 0;
function assert(cond, m) { if (!cond) throw new Error('assert failed: ' + m); passed++; }

assert(E.DURATION === 60, '60秒でない');
assert(E.ANCHORS.length >= 6, 'アンカーが6個未満');
assert(E.OBSTACLES.length >= 2, '障害物が2個未満');

var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start();
var s = game.getState();
assert(s.phase === 'playing', 'startでplayingにならない');
assert(s.anchors.length === E.ANCHORS.length, 'アンカー数が不正');
assert(s.tether && s.tether.anchorId === 0, '初期テザーがanchor0でない');
assert(s.anchors[0].used === true, '初期アンカーがusedでない');
assert(s.player.y > s.anchors[0].y - 120, 'プレイヤー位置が不正');

var len0 = s.tether.length;
game.setHold(true);
game.update(0.2, 0.1);
s = game.getState();
assert(s.holding === true, 'ホールドが記録されない');
assert(s.tether.length < len0, '巻き取りでテザーが短くならない');

var vy0 = s.player.vy;
game.setHold(false);
s = game.getState();
assert(s.tether === null, 'リリースでテザーが外れない');
assert(s.player.vy > vy0, 'リリースのスナップがない');

game.reset();
assert(game.state.phase === 'start' && game.state.tether === null, 'resetでstartに戻らない');

game.start();
var t = 0;
while (game.state.phase === 'playing' && t < 65) {
  game.autoStep();
  game.update(t, 1 / 60);
  t += 1 / 60;
}
s = game.getState();
assert(s.phase === 'finished', '60秒で終了しない');
assert(s.result && s.result.time === 60, '結果の時間が60秒でない');
assert(s.result.height > 0, '高さが0のまま');
assert(s.result.anchors >= 1, '使用アンカー数が不正');

print('engine tests OK (' + passed + ' assertions)');
