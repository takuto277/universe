/* test-smoke.js : TRASH TOSS の30秒自動プレイと結果画面 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['audio.js', 'projects/_labs/trash-toss/audio.js']);
tryLoad(['engine.js', 'projects/_labs/trash-toss/engine.js']);
tryLoad(['renderer.js', 'projects/_labs/trash-toss/renderer.js']);
tryLoad(['game.js', 'projects/_labs/trash-toss/game.js']);

Harness.run({
  name: 'trash-toss',
  maxSteps: 2300,
  afterDone: 40,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '30秒で終了していない');
    h.assert(state.result && state.result.score > 0, '入った数が記録されていない');
    h.assert(state.result.throws > 0, '投げ数が記録されていない');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-score'].textContent !== '0', '結果のINが0のまま');
    h.assert(els['result-best'].textContent.indexOf('BEST') === 0, 'ベスト表示が不正');
    h.assert(els['result-accuracy'].textContent.indexOf('ACC') === 0, '命中率表示が不正');
  },
  summary: function (state) {
    print('  in=' + state.result.score + ' / throws=' + state.result.throws + ' / acc=' + Math.round(state.result.accuracy * 100) + '% / perfect=' + state.result.perfects);
  }
});
