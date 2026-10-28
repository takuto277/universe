/* test-race3d-smoke.js : BLOOM RACE 3D（20球・3Dギミック・最後の1球）の自動再生
 * 実行例:
 *   cd exponential-balls && jsc test-race3d-smoke.js
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

if (!globalThis.__GAME__ || typeof globalThis.__GAME__.startRace3D !== 'function') {
  throw new Error('startRace3D がない');
}
globalThis.__GAME__.start = globalThis.__GAME__.startRace3D;

Harness.run({
  name: 'exponential-balls race3d',
  maxSteps: 6000,
  afterDone: 0,
  check: function (state, h) {
    if (!state || state.phase !== 'finished') { h.assert(false, '3Dレースが終了していない'); return; }
    h.assert(state.mode === 'race3d', 'RACE3Dモードでない: ' + state.mode);
    h.assert(state.race3d && state.race3d.result, '3Dレース結果がない');
    h.assert(state.race3d.alive === 1 && state.race3d.balls.length === 1, '3Dで最後の1球になっていない');
    h.assert(state.race3d.eliminated === 19, '3Dで19球が脱落していない: ' + state.race3d.eliminated);
    h.assert(state.race3d.result.winnerId >= 1 && state.race3d.result.winnerId <= 20, '3D勝者IDが不正');
    h.assert(state.race3d.result.time > 0, '3D勝者タイムが不正');
    var els = h.elements;
    h.assert(els['result-overlay'] && els['result-overlay'].classList.contains('visible'), '3D結果画面が出ていない');
    h.assert(els['result-title'] && els['result-title'].textContent.indexOf('BALL ') === 0, '3D勝者タイトルが不正');
    h.assert(els['result-winner'] && els['result-winner'].textContent.indexOf('BALL ') === 0, '3D勝者表示が不正');
    h.assert(els['mode-name'] && els['mode-name'].textContent === 'RACE 3D', 'HUDのモードがRACE 3Dでない');
  },
  summary: function (state) {
    print('  mode=' + state.mode + ' / winner=BALL ' + state.race3d.result.winnerId +
      ' / time=' + state.race3d.result.time.toFixed(1) + 's / eliminated=' + state.race3d.eliminated);
  }
});
