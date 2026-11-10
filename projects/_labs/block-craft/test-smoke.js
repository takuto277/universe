/* test-smoke.js : BLOCK CRAFT のサンドボックスを Harness.run で自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/block-craft/engine.js']);
tryLoad(['game.js', 'projects/_labs/block-craft/game.js']);

Harness.run({
  name: 'block-craft',
  endless: true,
  maxSteps: 240,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'play', 'サンドボックスがplayのまま: ' + state.phase);
    h.assert(state.size && state.size.x === 30, 'world size is missing');
    h.assert(typeof state.seed === 'number', 'world seed should be numeric');
    h.assert(state.edits > 0, '自動操作でブロックが編集されていない');
    h.assert(state.selected >= 0 && state.selected < state.hotbar.length, 'selected slot is invalid');
    h.assert(state.hotbar.length === 5, 'hotbar is missing blocks');
  },
  summary: function (state, info) {
    print('  phase=' + state.phase + ' / edits=' + state.edits + ' / steps=' + info.steps);
  }
});
