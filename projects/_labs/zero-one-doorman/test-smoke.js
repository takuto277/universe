/* test-smoke.js : 0.1秒ドアマンの自動プレイ */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = DoormanEngine; }
var g = E.createGame({ rng: E.mulberry32(11) });
var steps = 0;
while (g.phase !== 'over' && steps < 3000) {
  E.autoStep(g);
  E.update(g, 1 / 60);
  steps++;
}
if (g.phase !== 'over') throw new Error('game did not finish');
if (g.score <= 0) throw new Error('score did not increase');
print('smoke test OK [zero-one-doorman] (steps=' + steps + ')');
print('  最終: ' + g.score + 'pt / 仕分け' + g.served + ' / ミス' + g.missed + ' / 最大コンボ' + g.maxCombo);
