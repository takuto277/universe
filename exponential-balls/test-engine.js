/* test-engine.js : 倍々の時間・小節・倍々スケジュール（jsc で実行）
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

assert(E.BPM === 120, 'BPMが120でない');
assert(E.BAR_SECONDS === 2 && E.CYCLE_SECONDS === 24, '小節/サイクルの秒数が不正');
assert(E.MAX_COUNT === 2048 && E.BARS_PER_CYCLE === 12, '最大数/小節数が不正');
assert(E.ROOTS.length === 4, 'キーが4つでない');

var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start();
assert(game.state.phase === 'playing' && game.state.count === 1, '開始状態が不正');

var s = game.update(0);
assert(s.bar === 0 && s.beat === 0 && s.count === 1, 't=0の状態が不正');
assert(!s.split && !s.reset && !s.peak, 't=0でsplit/reset/peakが立つ');

s = game.update(2);
assert(s.bar === 1 && s.count === 2 && s.split === true && s.reset === false, 't=2で2個に分裂しない');
assert(s.maxCount === 2, '最大数が2でない');
s = game.update(2.1);
assert(s.split === false && s.count === 2, '同じ小節でsplitが残る');

var expected = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
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

game.reset();
assert(game.state.phase === 'start' && game.state.count === 1 && game.state.time === 0, 'resetでstartへ戻らない');

game.start();
assert(game.tap(0.5, 0.6) === true, 'タップできない');
assert(game.state.taps === 1 && game.state.lastTap.x === 0.5 && game.state.lastTap.y === 0.6, 'タップが記録されない');
assert(game.state.count === 1, 'タップで数が変わる');
game.reset();
assert(game.tap(0.5, 0.5) === false, '停止中にタップできる');

game = E.createGame();
game.autoStep();
assert(game.state.phase === 'playing', 'autoStepで開始できない');
game.update(7);
game.autoStep();
assert(game.state.taps === 1, 'autoStepのタップが不正');

log('engine tests OK (' + passed + ' assertions)');
