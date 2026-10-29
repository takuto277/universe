/* test-smoke.js : ねむりのまもりの自動プレイ */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/sleep-guard/engine.js']);
tryLoad(['game.js', 'projects/_labs/sleep-guard/game.js']);

Harness.run({
  name: 'sleep-guard',
  maxSteps: 20000,
  afterDone: 120,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'clear' || state.phase === 'over', '終了状態になっていない: ' + state.phase);
    h.assert(state.phase === 'clear', '自動操作でクリアできていない: ' + state.phase);
    h.assert(state.sleep === 100, 'クリア時に睡眠ゲージがMAXでない: ' + state.sleep);
    h.assert(state.score > 0 && state.stopped > 0, '騒音を止めた記録がない');
    var els = h.elements;
    h.assert(els['screen-end'] && els['screen-end'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['gauge-fill'] && els['gauge-fill'].style.width === '100%', 'ゲージ表示がMAXでない');
  },
  summary: function (state) {
    print('  最終: ' + state.sleep + '% / スコア' + state.score + ' / 停止' + state.stopped + ' / ' + state.time.toFixed(1) + '秒');
  }
});
