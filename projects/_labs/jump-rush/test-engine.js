function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['script.js', 'projects/_labs/jump-rush/script.js']);

var J = window.JumpRush;
var C = J.constants;
var passed = 0;

function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}

function quietRun() {
  var s = J.createRun();
  for (var i = 0; i < s.enemies.length; i++) s.enemies[i].alive = false;
  return s;
}

function steps(s, count, dt) {
  for (var i = 0; i < count; i++) J.update(s, dt || 1 / 60);
  return s;
}

var types = {};
for (var i = 0; i < J.enemyDefs.length; i++) types[J.enemyDefs[i].type] = true;
assert(types.walk && types.hop && types.hover && types.shoot, '4種類の敵パターンがない');
assert(J.blockDefs.some(function (b) { return b.type === 'break'; }), '壊せるブロックがない');
assert(J.blockDefs.some(function (b) { return b.type === 'solid'; }), '壊せないブロックがない');
for (i = 0; i < J.ground.length - 1; i++) {
  var gap = J.ground[i + 1][0] - J.ground[i][1];
  assert(gap > 0 && gap <= 90, '穴の幅が不正: ' + gap);
}

var s = J.createRun();
assert(s.phase === 'run' && s.lives === 3, '3ライフで開始しない');
assert(s.x === C.START_X && s.onGround && s.vy === 0, '開始位置か接地状態が不正');
assert(s.blocks.length === J.blockDefs.length && s.enemies.length === J.enemyDefs.length, 'レベルが初期化されない');
assert(s.score === 0 && s.stomps === 0 && s.distance === 0, 'スコアの初期値が不正');

var hold = quietRun();
var tap = quietRun();
J.pressJump(hold);
steps(hold, 42);
var holdPeak = hold.y;
J.pressJump(tap);
steps(tap, 3);
J.releaseJump(tap);
steps(tap, 39);
assert(holdPeak < tap.y - 20, '押しっぱなしで高く跳べない: hold=' + holdPeak + ' tap=' + tap.y);

s = quietRun();
s.x = 1000;
s.y = 680;
s.vy = 100;
s.onGround = false;
var enemy = s.enemies[0];
enemy.alive = true;
enemy.type = 'walk';
enemy.x = 1000;
enemy.y = 700;
enemy.w = 38;
enemy.h = 30;
J.update(s, 1 / 60);
assert(enemy.alive === false, '上から踏んでも敵が倒れない');
assert(s.stomps === 1 && s.lives === 3, '踏み数かライフが不正');
assert(s.vy < 0, '踏んだ後に跳ね返らない');

s = quietRun();
s.x = 1450;
s.y = 700;
s.onGround = true;
enemy = s.enemies[0];
enemy.alive = true;
enemy.type = 'walk';
enemy.x = 1450;
enemy.y = 700;
enemy.w = 38;
enemy.h = 30;
J.update(s, 1 / 60);
assert(s.lives === 2 && s.phase === 'dying', '横から当たってもライフが減らない');
assert(s.deathKind === 'enemy', '横接触のダメージ理由が不正');

s = quietRun();
s.x = 890;
s.y = 770;
s.vy = 200;
s.onGround = false;
J.update(s, 1 / 60);
assert(s.lives === 2 && s.phase === 'dying' && s.deathKind === 'pit', '穴に落ちてもライフが減らない');

s = quietRun();
var breakable = s.blocks[0];
breakable.alive = true;
s.x = breakable.x + breakable.w / 2;
s.y = 630;
s.vy = -300;
s.onGround = false;
J.update(s, 1 / 60);
assert(breakable.alive === false, '下から壊せるブロックが壊れない');
assert(s.blockBonus >= 40 && s.vy > 0, '壊したときの加点か反動が不正');

s = quietRun();
var solid = null;
for (i = 0; i < s.blocks.length; i++) {
  if (s.blocks[i].type === 'solid' && s.blocks[i].x === 250) solid = s.blocks[i];
}
s.x = solid.x + solid.w / 2;
s.y = 690;
s.vy = -900;
s.onGround = false;
J.update(s, 1 / 60);
assert(solid.alive === true, '壊せないブロックが壊れた');
assert(s.vy === 0 && s.y > 640, '壊せないブロックで頭を打っても止まらない');

s = quietRun();
s.paused = true;
var px = s.x;
J.update(s, 1);
assert(s.x === px, 'ポーズ中に進んでしまう');
s.paused = false;

s = quietRun();
s.x = C.FLAG_X - 10;
steps(s, 1);
assert(s.phase === 'flag', 'ポールに触れても旗シーケンスが始まらない');
steps(s, 180);
assert(s.phase === 'clear', '城に入ってもクリアにならない: ' + s.phase);
assert(s.finishTime > 0 && s.clearBonus > 0 && s.score > 1000, 'クリア報酬が不正');
assert(s.best >= s.score, 'クリア時にベストが更新されない');

s = quietRun();
for (i = 0; i < 3; i++) {
  s.invuln = 0;
  assert(J.damage(s, 'enemy') === true, 'ダメージを受け付けない: ' + i);
  steps(s, 60);
}
assert(s.phase === 'over' && s.lives === 0, '3回ダメージでゲームオーバーにならない');
assert(s.best >= s.score, 'ゲームオーバー時にベストが更新されない');

var state = J.getState(s);
assert(state.over === true && state.lives === 0 && state.best > 0, 'getState の終了状態が不正');

print('engine tests OK (' + passed + ' アサーション)');
