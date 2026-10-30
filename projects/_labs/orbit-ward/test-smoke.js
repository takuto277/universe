/* test-smoke.js : ORBIT WARD の自動プレイと結果画面 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['audio.js', 'projects/_labs/orbit-ward/audio.js']);
tryLoad(['engine.js', 'projects/_labs/orbit-ward/engine.js']);
tryLoad(['renderer.js', 'projects/_labs/orbit-ward/renderer.js']);
tryLoad(['game.js', 'projects/_labs/orbit-ward/game.js']);

Harness.run({
  name: 'orbit-ward',
  maxSteps: 7000,
  afterDone: 60,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '60秒で終了していない');
    h.assert(state.result && state.result.score > 0, '結果スコアがない');
    h.assert(state.result.blocks > 0, '迎撃数がない');
    h.assert(state.result.rank && state.result.rank !== '—', 'ランクがない');
    var els = h.elements;
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-score'].textContent !== '0', '結果スコアが0のまま');
    h.assert(els['result-rank'].textContent.indexOf('RANK') === 0, 'ランク表示が不正');
  },
  summary: function (state) {
    print('  score=' + state.result.score + ' / blocks=' + state.result.blocks + ' / perfect=' + state.result.perfectBlocks + ' / misses=' + state.result.misses + ' / ' + Math.round(state.result.time) + 's');
  }
});
