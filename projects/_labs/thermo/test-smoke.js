/* test-smoke.js : THERMO の5ルーム自動クリアと結果画面 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['audio.js', 'projects/_labs/thermo/audio.js']);
tryLoad(['engine.js', 'projects/_labs/thermo/engine.js']);
tryLoad(['renderer.js', 'projects/_labs/thermo/renderer.js']);
tryLoad(['game.js', 'projects/_labs/thermo/game.js']);

Harness.run({
  name: 'thermo',
  maxSteps: 500,
  afterDone: 40,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '5ルームをクリアしていない');
    h.assert(state.result && state.result.allClear === true, 'ALL CLEARにならない');
    h.assert(state.temp >= state.safeMin && state.temp <= state.safeMax, '体温が安全帯の外');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['state-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['state-eyebrow'].textContent === 'ALL CLEAR', '結果の見出しが不正');
    h.assert(els['state-title'].textContent === 'ESCAPED', '結果のタイトルが不正');
    h.assert(els['state-stats'].textContent.indexOf('MOVES') === 0, '結果の統計が不正');
  },
  summary: function (state) {
    print('  rooms=' + state.result.levelCount + ' / moves=' + state.result.totalMoves + ' / time=' + state.result.totalTime.toFixed(1) + 's');
  }
});
