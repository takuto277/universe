/* test-frame-smoke.js : BLOOM FRAME のフレーム回収とHUD（jsc で実行）
 * 実行例:
 *   cd exponential-balls && jsc test-frame-smoke.js
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

if (!globalThis.__GAME__ || typeof globalThis.__GAME__.startFrame !== 'function') {
  throw new Error('startFrame がない');
}
globalThis.__GAME__.start = globalThis.__GAME__.startFrame;

Harness.run({
  name: 'exponential-balls frame',
  maxSteps: 12000,
  afterDone: 0,
  check: function (state, h) {
    if (!state || state.phase !== 'playing') { h.assert(false, '再生状態でない'); return; }
    h.assert(state.mode === 'frame', 'FRAMEモードでない: ' + state.mode);
    h.assert(state.captures >= 4, '4回以上キャプチャしていない: ' + state.captures);
    h.assert(state.count === state.balls.length && state.count > 1, 'ボール数とcountが不一致');
    h.assert(state.maxCount >= 4, '最大数が4未満: ' + state.maxCount);
    for (var i = 0; i < state.balls.length; i++) {
      var b = state.balls[i];
      h.assert(Math.hypot(b.vx, b.vy) > 0, '止まっているボールがある');
      h.assert(b.x >= 0 && b.x <= state.field.w && b.y >= 0 && b.y <= state.field.h, 'フィールド外のボールがある');
    }
    var els = h.elements;
    h.assert(els['start-overlay'] && !els['start-overlay'].classList.contains('visible'), 'スタート画面が残っている');
    h.assert(els['hud'] && !els['hud'].classList.contains('is-hidden'), 'HUDが表示されていない');
    h.assert(els['mode-name'] && els['mode-name'].textContent === 'FRAME', 'HUDのモードがFRAMEでない');
    h.assert(els['stat'] && els['stat'].textContent.indexOf('DOUBLES ') === 0, 'HUDのダブル表示が不正: ' + (els['stat'] ? els['stat'].textContent : 'null'));
    h.assert(els['hint'] && els['hint'].textContent === 'TOUCH THE LINE · TAP TO PUSH', 'ヒントがFRAME用でない');
    h.assert(els['bpm'] && els['bpm'].textContent === '120 BPM', 'HUDのBPMが120でない');
  },
  summary: function (state) {
    print('  mode=' + state.mode + ' / captures=' + state.captures + ' / count=' + state.count +
      ' / max=' + state.maxCount + ' / time=' + state.time.toFixed(1) + 's');
  }
});
