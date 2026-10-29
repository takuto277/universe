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
assert(E.STAGES.length >= 3, 'ステージが3個未満');
assert(E.STAGES[1].target > E.STAGES[0].target && E.STAGES[1].speed > E.STAGES[0].speed, 'ステージが難しくなっていない');

var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start();
var s = game.getState();
assert(s.phase === 'playing', 'startでplayingにならない');
assert(s.anchors.length === E.ANCHORS.length, 'アンカー数が不正');
assert(s.tether && s.tether.anchorId === 0, '初期テザーがanchor0でない');
assert(s.anchors[0].used === true, '初期アンカーがusedでない');
assert(s.player.y > s.anchors[0].y - 120, 'プレイヤー位置が不正');
assert(s.stage === 1 && s.stageTarget === E.STAGES[0].target, '初期ステージが不正');

game.state.tether.length = 120;
var len0 = 120;
game.setHold(true);
game.update(0.2, 0.1);
s = game.getState();
assert(s.holding === true, 'ホールドが記録されない');
assert(s.tether.length < len0 && s.tether.length >= E.MIN_LENGTH, '巻き取りでテザーが短くならない / 中央まで寄りすぎる');

var vy0 = s.player.vy;
game.setHold(false);
s = game.getState();
assert(s.tether === null, 'リリースでテザーが外れない');
assert(s.player.vy > vy0, 'リリースのスナップがない');

// 床まで落ちても画面外に出ず、anchor0 に再び掛かって再開できる
game.state.tether = null;
game.state.player.x = 0;
game.state.player.y = 110;
game.state.player.vy = -600;
game.update(0.2, 1 / 60);
s = game.getState();
assert(s.player.y === 110, '床より下に落ちる');
assert(s.player.vy === 0, '床で下向き速度が残る');
assert(s.tether && s.tether.anchorId === 0, '床で再びテザーが掛からない');
assert(s.rescues === 1, '床救助が記録されない');
game.setHold(true);
game.update(0.25, 0.1);
s = game.getState();
assert(s.tether && s.tether.length >= E.MIN_LENGTH, '床救助後にテザーが維持されない');

game.reset();
assert(game.state.phase === 'start' && game.state.tether === null, 'resetでstartに戻らない');

// ロープが長いほど、離したときの速度が大きい
function launchSpeed(length) {
  var g = E.createGame();
  g.start();
  g.state.tether = { anchorId: 0, length: length };
  g.state.holding = true;
  g.state.player.vx = 0;
  g.state.player.vy = 0;
  g.setHold(false);
  var out = g.getState();
  return Math.sqrt(out.player.vx * out.player.vx + out.player.vy * out.player.vy);
}
assert(launchSpeed(120) > launchSpeed(80), '長いロープの方が速く飛ばない');

// ホールド中だけ、一定距離内のアンカー（使用済みも含む）に掛かる
game.start();
game.state.tether = null;
game.state.holding = false;
game.state.attachCooldown = 0;
game.state.player.x = 70;
game.state.player.y = 520;
game.state.player.vx = 0;
game.state.player.vy = 0;
game.update(0.1, 1 / 60);
s = game.getState();
assert(s.tether === null, 'ホールドしていないのにアンカーへ掛かる');
game.setHold(true);
s = game.getState();
assert(s.tether && s.tether.anchorId === 1, '2個目のアンカーに掛からない');
assert(s.anchors[1].used === true, '2個目のアンカーがusedにならない');
game.setHold(false);
game.state.tether = null;
game.state.holding = false;
game.state.attachCooldown = 0;
game.state.player.x = 0;
game.state.player.y = 190;
game.state.player.vx = 0;
game.state.player.vy = 0;
game.setHold(true);
s = game.getState();
assert(s.tether && s.tether.anchorId === 0, '使用済みアンカーに再び掛からない');

// 高速でも回転バーを貫通しない
var fast = E.createGame();
fast.start();
fast.state.tether = null;
fast.state.holding = false;
fast.state.attachCooldown = 999;
var bar = fast.state.obstacles[0];
bar.angle = 0;
fast.state.player.x = 0;
fast.state.player.y = bar.y - 40;
fast.state.player.vx = 0;
fast.state.player.vy = 1800;
fast.update(0.1, 0.05);
s = fast.getState();
assert(s.events.some(function (e) { return e.type === 'hit'; }), '高速で回転バーを貫通する');

// バンパーと風のギミック
var gimmick = E.createGame();
gimmick.start();
assert(gimmick.state.bumpers.length >= 3, 'バンパーが3個未満');
assert(gimmick.state.winds.length >= 2, '風ゾーンが2個未満');
gimmick.state.tether = null;
gimmick.state.holding = false;
gimmick.state.attachCooldown = 999;
var b = gimmick.state.bumpers[0];
gimmick.state.player.x = b.x;
gimmick.state.player.y = b.y - b.r - 4;
gimmick.state.player.vx = 0;
gimmick.state.player.vy = -200;
gimmick.update(0.1, 1 / 60);
s = gimmick.getState();
assert(s.events.some(function (e) { return e.type === 'bump'; }), 'バンパーが反応しない');

// 目標高さに達すると次のステージへ進み、最後はALL CLEAR
function setHeight(g, meters) {
  g.state.tether = null;
  g.state.holding = false;
  g.state.attachCooldown = 999;
  g.state.player.x = 0;
  g.state.player.y = 110 + meters * 10;
  g.state.player.vx = 0;
  g.state.player.vy = 0;
  g.state.maxY = g.state.player.y;
  g.update(0.1, 1 / 60);
  return g.getState();
}
var stages = E.createGame();
stages.start();
s = setHeight(stages, E.STAGES[0].target);
assert(s.stage === 2 && s.stageTarget === E.STAGES[1].target, 'ステージ1がクリアされない');
assert(s.events.some(function (e) { return e.type === 'stage'; }), 'ステージクリアイベントがない');
for (var si = 1; si < E.STAGES.length - 1; si++) {
  s = setHeight(stages, E.STAGES[si].target);
  assert(s.stage === si + 2, 'ステージ' + (si + 1) + 'が進まない');
}
s = setHeight(stages, E.STAGES[E.STAGES.length - 1].target);
assert(s.phase === 'finished', '最終ステージで終了しない');
assert(s.result && s.result.cleared === true, 'ALL CLEARにならない');
assert(s.result.stagesCleared === E.STAGES.length, 'クリア数が不正');

game.reset();
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
