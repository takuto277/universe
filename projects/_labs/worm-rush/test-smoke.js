/* test-smoke.js : WORM RUSH の自動プレイ */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = WormRushEngine; }
var g = E.createGame({ rng: E.mulberry32(11) });
E.autoStep(g);
var steps = 0;
while (g.phase === 'run' && steps < 1200) {
  E.autoStep(g);
  E.update(g, 1 / 60);
  steps++;
}
if (g.phase !== 'run' && !g.result) throw new Error('unexpected state');
print('smoke test OK [worm-rush] (steps=' + steps + ')');
print('  最終: ' + (g.player.alive ? 'ALIVE' : 'DEAD') + ' / 長さ' + g.player.length + ' / スコア' + g.player.score + ' / AI' + g.worms.filter(function(w){return w.alive && !w.isPlayer;}).length);
