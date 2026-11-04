function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/block-craft/engine.js']);
tryLoad(['game.js', 'projects/_labs/block-craft/game.js']);

var failed = 0;
function assert(cond, message) { if (!cond) { failed++; print('SMOKE FAIL: ' + message); } }
var G = globalThis.__GAME__;
assert(G && G.id === 'block-craft', 'game API is missing');
G.start();
var started = G.getState();
assert(started && started.phase === 'play', 'game did not start');
assert(started.size && started.size.x === 30, 'world size is missing');
for (var i = 0; i < 240; i++) G.autoPlayStep();
var state = G.getState();
assert(state.phase === 'play', 'sandbox should stay in play mode');
assert(state.edits > 0, 'automated mining/placing should edit the world');
assert(state.selected >= 0 && state.selected < state.hotbar.length, 'selected slot is invalid');
assert(state.hotbar.length === 5, 'hotbar is missing blocks');
if (failed) print('smoke test NG [block-craft]');
else print('smoke test OK [block-craft] (steps=240, edits=' + state.edits + ')');
