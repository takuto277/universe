/* test-engine.js : THERMO の熱交換・移動・失敗・5ルームクリア */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/thermo/engine.js']);
var E = ThermoEngine;
var passed = 0;
function assert(cond, m) { if (!cond) throw new Error('assert failed: ' + m); passed++; }

assert(E.LEVELS.length === 5, '5ルームでない');
assert(E.SAFE_MIN === 20 && E.SAFE_MAX === 80, '安全帯が20-80でない');
assert(E.EXCHANGE === 15, '交換量が15でない');

var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start();
var s = game.getState();
assert(s.phase === 'playing' && s.level === 1, '開始状態が不正');
assert(s.temp === 50, '初期体温が50でない');
assert(s.grid[3][4] === '~', 'ステージ1の水がない');

// 水の手前で向きを下にし、水は通れない
game.state.player.x = 4;
game.state.player.y = 2;
game.state.player.facing = 'D';
assert(game.move(0, 1) === false, '水に移動できてしまう');
s = game.getState();
assert(s.player.y === 2 && s.grid[3][4] === '~', '水の移動失敗で状態が変わる');

// 水の熱を吸って凍らせる（体温 +15）
assert(game.action() === true, '水に交換できない');
s = game.getState();
assert(s.temp === 65, '水の吸熱で体温が+15されない');
assert(s.grid[3][4] === '*', '水が氷にならない');
assert(game.move(0, 1) === true, '氷の上を歩けない');

// 扉に熱を放出して開く（体温 -15）
game.state.player.x = 4;
game.state.player.y = 4;
game.state.player.facing = 'D';
assert(game.action() === true, '扉に交換できない');
s = game.getState();
assert(s.temp === 50, '扉への放熱で体温が-15されない');
assert(s.grid[5][4] === 'O', '扉が開かない');

// 安全帯を超えると失敗し、リトライで元に戻る
var fail = E.createGame();
fail.start();
fail.state.player.x = 4;
fail.state.player.y = 2;
fail.state.player.facing = 'D';
fail.state.temp = 80;
fail.action();
s = fail.getState();
assert(s.phase === 'failed' && s.reason === 'OVERHEAT', '過熱で失敗しない');
assert(fail.retryLevel() === true, '失敗後にリトライできない');
s = fail.getState();
assert(s.phase === 'playing' && s.temp === 50 && s.grid[3][4] === '~', 'リトライで初期化されない');

// 自動プレイで5ルームをクリアする
var auto = E.createGame();
auto.start();
var steps = 0;
while (auto.getState().phase !== 'finished' && steps < 500) {
  auto.autoPlayStep();
  auto.update(steps / 60, 1 / 60);
  steps++;
}
s = auto.getState();
assert(s.phase === 'finished', '5ルームをクリアできない');
assert(s.result && s.result.allClear === true, 'ALL CLEARにならない');
assert(s.result.levelCount === 5 && s.result.level === 5, '最終ルームの記録が不正');
assert(s.result.totalMoves > 0, '総移動数が記録されない');

print('engine tests OK (' + passed + ' assertions)');
