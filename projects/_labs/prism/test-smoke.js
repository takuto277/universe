/* test-smoke.js : PRISM を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/prism/engine.js']);
tryLoad(['renderer.js', 'projects/_labs/prism/renderer.js']);
tryLoad(['game.js', 'projects/_labs/prism/game.js']);

Harness.run({
  name: 'prism',
  maxSteps: 3000,
  afterDone: 60,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over', '全レベルをクリアしていない: ' + state.phase);
    h.assert(state.levelIndex === state.levelCount, '最終レベルに到達していない');
    h.assert(state.result && state.result.moves > 0, '合計操作回数が不正');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-moves'].textContent === String(state.result.moves), '結果の操作回数が状態と不一致');
    h.assert(els['level'].textContent.indexOf('LV') === 0, 'HUDのレベル表示が不正');
  },
  summary: function (state) {
    print('  moves=' + state.result.moves + ' / time=' + state.result.time + 's / levels=' + state.levelCount);
  }
});
