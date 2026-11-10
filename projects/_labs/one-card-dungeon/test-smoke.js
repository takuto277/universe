/* test-smoke.js : ONE CARD DUNGEON を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/one-card-dungeon/engine.js']);
tryLoad(['game.js', 'projects/_labs/one-card-dungeon/game.js']);

Harness.run({
  name: 'one-card-dungeon',
  maxSteps: 2000,
  afterDone: 60,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, '決着がついていない: ' + state.phase);
    h.assert(state.result, '結果がない');
    h.assert(state.result.floor >= 1, '到達階層が記録されていない');
    h.assert(state.result.turns > 0, 'ターン数が0のまま');
    h.assert(state.result.deck.length >= 8, 'デッキ内容が結果にない');

    var els = h.elements;
    h.assert(!els['screen-start'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['screen-end'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-floor'].textContent === String(state.result.floor), '結果フロア表示が状態と不一致');
    h.assert(els['end-turns'].textContent === String(state.result.turns), '結果ターン表示が状態と不一致');
  },
  summary: function (state) {
    print('  最終: ' + (state.win ? 'WIN' : 'LOSE') + ' / ' + state.result.rank + ' / ' + state.result.floor + 'F / HP ' + state.result.hp + ' / ' + state.result.turns + ' turns');
  }
});
