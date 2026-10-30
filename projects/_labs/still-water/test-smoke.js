/* test-smoke.js : STILL WATER の8投自動プレイと結果画面 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['audio.js', 'projects/_labs/still-water/audio.js']);
tryLoad(['engine.js', 'projects/_labs/still-water/engine.js']);
tryLoad(['renderer.js', 'projects/_labs/still-water/renderer.js']);
tryLoad(['game.js', 'projects/_labs/still-water/game.js']);

Harness.run({
  name: 'still-water',
  maxSteps: 9000,
  afterDone: 50,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '8投で終了していない');
    h.assert(state.result && state.result.score > 0, 'スコアが記録されていない');
    h.assert(state.result.catchesCount > 0, '釣果が記録されていない');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-score'].textContent !== '0', '結果スコアが0のまま');
    h.assert(els['result-meta'].textContent.indexOf('CATCHES') > 0, '結果メタ表示が不正');
  },
  summary: function (state) {
    print('  score=' + state.result.score + ' / catches=' + state.result.catchesCount + ' / total=' + state.result.totalCm + 'cm / misses=' + state.result.misses);
  }
});
