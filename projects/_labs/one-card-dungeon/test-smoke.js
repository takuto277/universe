/* test-smoke.js : ONE CARD DUNGEON の自動プレイ */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = OneCardEngine; }
var g = E.createGame({ rng: E.mulberry32(11) });
var steps = 0;
E.autoStep(g);
while (!g.over && steps < 500) {
  E.autoStep(g);
  steps++;
}
if (!g.over) throw new Error('game did not finish');
if (!g.result) throw new Error('result missing');
print('smoke test OK [one-card-dungeon] (steps=' + steps + ')');
print('  最終: ' + (g.win ? 'WIN' : 'LOSE') + ' / ' + g.result.rank + ' / ' + g.result.floor + 'F / HP ' + g.result.hp + ' / ' + g.result.turns + ' turns');
