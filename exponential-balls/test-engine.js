/* test-engine.js : BLOOM の時間・小節・AUTO/FRAME の検証（jsc で実行）
 * 実行例:
 *   cd exponential-balls && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = ExponentialEngine;
}

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}
function log(message) { print(message); }
function speed(b) { return Math.hypot(b.vx, b.vy); }

assert(E.BPM === 120, 'BPMが120でない');
assert(E.BAR_SECONDS === 2 && E.CYCLE_SECONDS === 24, '小節/サイクルの秒数が不正');
assert(E.MAX_COUNT === 2048 && E.BARS_PER_CYCLE === 12, '最大数/小節数が不正');
assert(E.FRAME_MAX === 2048 && E.FIELD.w === 390 && E.FIELD.h === 844, 'FRAMEの定数が不正');
assert(E.LINE && E.LINE.w === 280, 'LINEの定数が不正');
assert(E.ROOTS.length === 4, 'キーが4つでない');

/* AUTO: 時間と小節で倍々 */
var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start();
assert(game.state.phase === 'playing' && game.state.mode === 'auto' && game.state.count === 1, 'AUTO開始状態が不正');

var s = game.update(0);
assert(s.bar === 0 && s.beat === 0 && s.count === 1, 't=0の状態が不正');
assert(!s.split && !s.reset && !s.peak, 't=0でsplit/reset/peakが立つ');

s = game.update(2);
assert(s.bar === 1 && s.count === 2 && s.split === true && s.reset === false, 't=2で2個に分裂しない');
assert(s.maxCount === 2, '最大数が2でない');
s = game.update(2.1);
assert(s.split === false && s.count === 2, '同じ小節でsplitが残る');

var expected = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
game = E.createGame();
game.start();
for (var bar = 0; bar < 12; bar++) {
  s = game.update(bar * E.BAR_SECONDS + 0.2);
  assert(s.bar === bar, 'barが' + bar + 'でない: ' + s.bar);
  assert(s.count === expected[bar], 'bar' + bar + 'の数が' + expected[bar] + 'でない: ' + s.count);
}
s = game.update(22.2);
assert(s.bar === 11 && s.peak === true && s.count === 2048, 'ピークが2048/peakでない');
assert(s.maxCount === 2048, '最大数が2048でない');

s = game.update(24);
assert(s.cycle === 1 && s.bar === 0 && s.count === 1, 'サイクル境界で1個に戻らない');
assert(s.reset === true && s.split === false, 'サイクル境界のresetが不正');
assert(s.rootIndex === 1, 'サイクルでキーが変わらない');
s = game.update(24.2);
assert(s.reset === false && s.count === 1, 'resetが残る');

s = game.update(24.5);
assert(s.bar === 0 && s.beat === 1 && s.stepInBar === 4, 't=24.5のbeat/stepが不正');
s = game.update(26);
assert(s.bar === 1 && s.count === 2, '2サイクル目の分裂が不正');

s = game.update(48);
assert(s.cycle === 2 && s.bar === 0 && s.count === 1, '2サイクル目の境界が不正');
assert(s.maxCount === 2048, '最大数がサイクルをまたいで保持されない');
assert(game.state.phase === 'playing', '2サイクル後に停止している');

game = E.createGame();
game.start();
s = game.update(10);
assert(s.bar === 5 && s.count === 32 && s.split === true, '時間が飛んだときの補正が不正');
s = game.update(5);
assert(s.time === 10 && s.bar === 5 && s.count === 32, '時計が巻き戻っている');

game.reset();
assert(game.state.phase === 'start' && game.state.count === 1 && game.state.time === 0, 'resetでstartへ戻らない');

game = E.createGame();
game.autoStep();
assert(game.state.phase === 'playing' && game.state.mode === 'auto', 'autoStepでAUTO開始できない');

/* FRAME: 上部ラインに触れると2個に増え、下向きに発射され、色の深さが増える */
game = E.createGame();
game.start('frame');
assert(game.state.phase === 'playing' && game.state.mode === 'frame', 'FRAME開始状態が不正');
assert(game.state.count === 1 && game.state.balls.length === 1, 'FRAMEの初期ボールが1個でない');
assert(speed(game.state.balls[0]) > 0, '初期ボールが止まっている');
var frameState = game.getState();
assert(frameState.line && frameState.field, 'ライン/フィールドがない');

game.state.balls[0].x = E.LINE.x + E.LINE.w / 2;
game.state.balls[0].y = E.LINE.y;
game.state.balls[0].immune = 0;
s = game.updateFrame(0.5, 1 / 60);
assert(s.count === 2 && s.balls.length === 2, 'ラインで倍々にならない: ' + s.count);
assert(s.captures === 1 && s.captureEvents.length === 1, 'キャプチャが記録されない');
assert(s.captureEvents[0].y === E.LINE.y, 'キャプチャ位置がラインでない');
for (var i = 0; i < s.balls.length; i++) {
  assert(speed(s.balls[i]) > 0, '増えたボールが止まっている');
  assert(s.balls[i].vy > 0, '増えたボールが下向きでない');
  assert(s.balls[i].depth === 1, '増えたボールの色の深さが1でない: ' + s.balls[i].depth);
  assert(s.balls[i].x >= 0 && s.balls[i].x <= E.FIELD.w && s.balls[i].y >= 0 && s.balls[i].y <= E.FIELD.h, 'ボールがフィールド外');
}

var beforeX = s.balls[0].x;
var beforeY = s.balls[0].y;
s = game.updateFrame(0.6, 0.05);
assert(s.balls.length === 2, '移動だけで数が変わる');
assert(s.balls[0].x !== beforeX || s.balls[0].y !== beforeY, 'ボールが動いていない');

var fresh = E.createGame();
fresh.start('frame');
var many = [];
for (var m = 0; m < E.FRAME_MAX; m++) {
  many.push({ x: 10, y: 400, vx: 10, vy: 10, hue: 188, immune: 0 });
}
many[0].x = E.LINE.x + E.LINE.w / 2;
many[0].y = E.LINE.y;
fresh.state.balls = many;
s = fresh.updateFrame(1, 1 / 60);
assert(s.frameReset === true && s.count === 1, '上限で1個に戻らない');
assert(s.maxCount >= E.FRAME_MAX, '上限の最大数が記録されない');

/* タップでFRAMEのボールを押し返せる */
game = E.createGame();
game.start('frame');
var tapped = game.state.balls[0];
var oldVx = tapped.vx;
var oldVy = tapped.vy;
assert(game.tap(tapped.x - 10, tapped.y) === true, 'FRAMEでタップできない');
assert(tapped.vx !== oldVx || tapped.vy !== oldVy, 'タップでボールが弾かれない');
game.reset();
game.start('auto');
assert(game.tap(10, 10) === false, 'AUTOでエンジン側のタップが有効になっている');


/* RACE: 縦下り、タップの前後、ゲート、ゴースト、結果 */
assert(E.RACE && E.RACE.gates.length === 3, 'RACEの定数が不正');
game = E.createGame();
game.start('race');
assert(game.state.phase === 'playing' && game.state.mode === 'race', 'RACE開始状態が不正');
s = game.getState();
assert(s.race && s.race.timeLeft === 60, 'RACEの初期時間が不正');
assert(s.race.gates.length === 3 && s.race.gateIndex === 0, 'RACEのゲートが不正');
assert(s.race.player && s.race.ghost, 'RACEのプレイヤー/ゴーストがない');
var racePlayer = game.state.race.player;
var startY = racePlayer.y;
var ghostStart = game.state.race.ghost.y;
s = game.updateRace(0.5, 1 / 60);
assert(s.race.player.y > startY, 'プレイヤーが下へ進まない');
assert(s.race.ghost.y > ghostStart, 'ゴーストが進まない');
assert(s.race.timeLeft < 60, 'RACEの残り時間が減らない');

game = E.createGame();
game.start('race');
racePlayer = game.state.race.player;
var oldVy = racePlayer.vy;
assert(game.tap(racePlayer.x, racePlayer.y - 60) === true, 'RACEで後ろをタップできない');
assert(racePlayer.vy > oldVy, '後ろタップで加速しない');
var boostedVy = racePlayer.vy;
game.tap(racePlayer.x, racePlayer.y + 60);
assert(racePlayer.vy < boostedVy, '前タップで減速しない');
var oldVx = racePlayer.vx;
game.tap(racePlayer.x - 70, racePlayer.y);
assert(racePlayer.vx > oldVx, '横タップでステアしない');
assert(game.tap(racePlayer.x + 300, racePlayer.y) === false, '遠いタップが効いてしまう');

game = E.createGame();
game.start('race');
var race = game.state.race;
var gate = race.gates[0];
race.player.x = gate.gapX;
race.player.y = gate.y - 1;
race.player.vy = 100;
s = game.updateRace(0.1, 0.02);
assert(s.race.gatesPassed === 1, 'ゲートを通過できない');
assert(s.race.events.length > 0 && s.race.events[0].type === 'gate', 'ゲート通過イベントがない');

game = E.createGame();
game.start('race');
race = game.state.race;
gate = race.gates[0];
race.player.x = gate.gapX + gate.gapW;
race.player.y = gate.y - 1;
race.player.vy = 100;
s = game.updateRace(0.1, 0.02);
assert(s.race.gatesPassed === 0, 'ゲート外で通過してしまう');
assert(s.race.events.length > 0 && s.race.events[0].type === 'hit', 'ゲート衝突イベントがない');
assert(s.race.player.y < gate.y, 'ゲート衝突で押し戻されない');

game = E.createGame();
game.start('race');
race = game.state.race;
race.player.x = (race.trackLeft + race.trackRight) / 2;
race.player.y = race.finishY - 1;
race.player.vy = 200;
s = game.updateRace(20, 1 / 60);
assert(s.phase === 'finished' && s.race.result, 'ゴールで終了しない');
assert(s.race.result.status === 'win' && s.race.result.time < s.race.result.ghostTime, 'ゴール結果が不正');
assert(s.race.result.gatesPassed === 0, '未通過ゲート数が不正');

game = E.createGame();
game.start('race');
s = game.updateRace(61, 1 / 60);
assert(s.phase === 'finished' && s.race.result.status === 'dnf', '60秒でDNFにならない');
assert(s.race.result.time === 60, 'DNFの記録時間が60秒でない');

game = E.createGame();
game.start('race');
s = game.updateRace(30, 1 / 60);
assert(s.race.ghost.finished === true && s.race.ghost.time > 0, 'ゴーストがゴールしない');

log('engine tests OK (' + passed + ' assertions)');
