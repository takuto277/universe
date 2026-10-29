/* test-smoke.js : TETHER の60秒自動プレイと結果画面 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['audio.js', 'projects/_labs/tether/audio.js']);
tryLoad(['engine.js', 'projects/_labs/tether/engine.js']);
tryLoad(['renderer.js', 'projects/_labs/tether/renderer.js']);
tryLoad(['game.js', 'projects/_labs/tether/game.js']);

Harness.run({
  name: 'tether',
  maxSteps: 4500,
  afterDone: 60,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '60秒で終了していない');
    h.assert(state.result && state.result.height > 0, '高さが記録されていない');
    h.assert(state.result.anchors >= 1, 'アンカー使用数が不正');
    h.assert(state.stage >= 1, 'ステージが記録されていない');
    h.assert(h.elements['stage'].textContent.indexOf('STAGE') === 0, 'HUDのステージ表示が不正');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-height'].textContent.indexOf('m') > 0, '結果の高さ表示が不正');
    h.assert(els['result-stage'].textContent.indexOf('STAGE') === 0, '結果のステージ表示が不正');
    h.assert(els['result-best'].textContent.indexOf('BEST') === 0, '結果のベスト表示が不正');
  },
  summary: function (state) {
    print('  height=' + state.result.height + 'm / anchors=' + state.result.anchors + ' / time=' + state.result.time + 's');
  }
});
