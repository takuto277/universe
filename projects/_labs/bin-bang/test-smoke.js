/* test-smoke.js : BIN BANG の60秒自動プレイと結果画面 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['audio.js', 'projects/_labs/bin-bang/audio.js']);
tryLoad(['engine.js', 'projects/_labs/bin-bang/engine.js']);
tryLoad(['renderer.js', 'projects/_labs/bin-bang/renderer.js']);
tryLoad(['game.js', 'projects/_labs/bin-bang/game.js']);

Harness.run({
  name: 'bin-bang',
  maxSteps: 5000,
  afterDone: 50,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '60秒で終了していない');
    h.assert(state.result && state.result.score > 0, 'スコアが記録されていない');
    h.assert(state.result.kills > 0, '撃破数が記録されていない');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-score'].textContent !== '0', '結果スコアが0のまま');
    h.assert(els['result-best'].textContent.indexOf('BEST') === 0, 'ベスト表示が不正');
    h.assert(els['result-kills'].textContent.indexOf('KILLS') === 0, '撃破表示が不正');
  },
  summary: function (state) {
    print('  score=' + state.result.score + ' / kills=' + state.result.kills + ' / combo=' + state.result.comboMax + ' / reason=' + state.result.reason);
  }
});
