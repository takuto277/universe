/* test-smoke.js : 自動プレイでゲームオーバーとリザルト画面まで到達するスモークテスト（jsc で実行）
 * 実行例:
 *   cd universe && jsc projects/_labs/neon-stack/test-smoke.js
 *   cd projects/_labs/neon-stack && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['audio.js', 'projects/_labs/neon-stack/audio.js']);
tryLoad(['engine.js', 'projects/_labs/neon-stack/engine.js']);
tryLoad(['game.js', 'projects/_labs/neon-stack/game.js']);

Harness.run({
  name: 'neon-stack',
  maxSteps: 20000,
  afterDone: 200,
  check: function (state, h) {
    h.assert(typeof NeonStackAudio === 'object', 'audio.js が読み込まれていない');
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, '外れたのにゲームオーバーになっていない');
    h.assert(state.phase === 'over', 'リザルト画面待ちのまま: phase=' + state.phase);
    h.assert(state.overReason === 'miss', '終了理由がmissでない: ' + state.overReason);
    h.assert(state.height >= 10, '十分に積み上がっていない: ' + state.height);
    h.assert(state.perfects >= 10, 'PERFECTが記録されていない: ' + state.perfects);
    h.assert(state.maxCombo >= 10, '最大コンボが伸びていない: ' + state.maxCombo);
    h.assert(state.score > 300, 'スコアが伸びていない: ' + state.score);
    h.assert(state.cameraY > 50, 'カメラが塔を追っていない: ' + state.cameraY);
    h.assert(state.best >= state.score && state.best > 0, 'ベストが更新されていない: ' + state.best);
    h.assert(state.lastDrop !== null, '直前の判定が残っていない');
    h.assert(state.viewW > 0 && state.viewH > 0, 'ビューサイズが不正');

    var els = h.elements;
    h.assert(els['screen-end'] && els['screen-end'].classList.contains('visible'), 'リザルト画面が出ていない');
    h.assert(els['screen-start'] && !els['screen-start'].classList.contains('visible'), '開始画面が残っている');
    h.assert(els['score'] && els['score'].textContent === String(state.score), 'HUDのスコアが一致しない');
    h.assert(els['height'] && els['height'].textContent === String(state.height), 'HUDの高さが一致しない');
    h.assert(els['perfect'] && els['perfect'].textContent === String(state.perfects), 'HUDのPERFECT数が一致しない');
    h.assert(els['combo'] && els['combo'].textContent === String(state.maxCombo), 'HUDの最大コンボが一致しない');
    h.assert(els['end-score'] && els['end-score'].textContent === String(state.score), 'リザルトのスコアが一致しない');
    h.assert(els['end-best'] && els['end-best'].textContent === String(state.best), 'リザルトのベストが一致しない');
    h.assert(els['end-height'] && els['end-height'].textContent === String(state.height), 'リザルトの高さが一致しない');
  },
  summary: function (state) {
    print('  最終: ' + state.score + '点 / 高さ' + state.height + ' / 最大コンボ' + state.maxCombo +
      ' / PERFECT' + state.perfects + ' / カメラ' + state.cameraY.toFixed(0) + ' / BEST' + state.best);
  }
});
