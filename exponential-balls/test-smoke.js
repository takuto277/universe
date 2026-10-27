/* test-smoke.js : BLOOM AUTO の2サイクル自動再生（jsc で実行）
 * 実行例:
 *   cd exponential-balls && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'exponential-balls/engine.js']);
tryLoad(['audio.js', 'exponential-balls/audio.js']);
tryLoad(['renderer.js', 'exponential-balls/renderer.js']);
tryLoad(['ui.js', 'exponential-balls/ui.js']);
tryLoad(['game.js', 'exponential-balls/game.js']);

Harness.run({
  name: 'exponential-balls auto',
  maxSteps: 8000,
  afterDone: 0,
  check: function (state, h) {
    if (!state || state.phase !== 'playing') { h.assert(false, '再生状態でない'); return; }
    h.assert(state.mode === 'auto', 'AUTOモードでない: ' + state.mode);
    h.assert(state.cycle >= 2, '2サイクルに達していない: ' + state.cycle);
    h.assert(state.maxCount === 2048, '最大ボール数が2048でない: ' + state.maxCount);
    h.assert(state.count === 1, 'サイクル境界で1個に戻っていない: ' + state.count);
    h.assert(state.time >= 48, '再生時間が48秒未満: ' + state.time);
    var els = h.elements;
    h.assert(els['start-overlay'] && !els['start-overlay'].classList.contains('visible'), 'スタート画面が残っている');
    h.assert(els['hud'] && !els['hud'].classList.contains('is-hidden'), 'HUDが表示されていない');
    h.assert(els['count'] && els['count'].textContent === '1', 'HUDのボール数が1でない: ' + (els['count'] ? els['count'].textContent : 'null'));
    h.assert(els['cycle'] && els['cycle'].textContent === 'CYCLE 3', 'HUDのサイクルが3でない: ' + (els['cycle'] ? els['cycle'].textContent : 'null'));
    h.assert(els['stat'] && els['stat'].textContent === 'BAR 1 / 12', 'HUDのバー表示が不正: ' + (els['stat'] ? els['stat'].textContent : 'null'));
    h.assert(els['mode-name'] && els['mode-name'].textContent === 'AUTO', 'HUDのモードがAUTOでない');
    h.assert(els['bpm'] && els['bpm'].textContent === '120 BPM', 'HUDのBPMが120でない');
  },
  summary: function (state) {
    print('  mode=' + state.mode + ' / cycle=' + state.cycle + ' / time=' + state.time.toFixed(1) + 's' +
      ' / max=' + state.maxCount + ' / count=' + state.count);
  }
});
