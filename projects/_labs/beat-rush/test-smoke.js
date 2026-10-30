/* test-smoke.js : BEAT RUSH の自動プレイ */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = BeatRushEngine; }
var g = E.createGame({ rng: E.mulberry32(11) });
var steps = 0;
while (g.phase !== 'over' && steps < 2400) {
  E.autoStep(g);
  E.update(g, 1 / 60);
  steps++;
}
if (g.phase !== 'over') throw new Error('game did not finish');
if (!g.result || g.result.score <= 0) throw new Error('score did not increase');
print('smoke test OK [beat-rush] (steps=' + steps + ')');
print('  最終: ' + g.result.score + 'pt / ' + g.result.rank + ' / ' + g.result.accuracy.toFixed(1) + '% / combo ' + g.result.maxCombo);
