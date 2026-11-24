/* test-smoke.js : TWIN を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/twin/engine.js']);
tryLoad(['game.js', 'projects/_labs/twin/game.js']);

Harness.run({
  name: 'twin',
  maxSteps: 12000,
  afterDone: 40,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && (state.result.reason === 'clear' || state.result.reason === 'down'), '結果の理由が不正');
    h.assert(state.result.stage >= 1 && state.result.stage <= state.stages, '結果のステージが不正');
    h.assert(state.result.score >= 0, '結果スコアが不正');
    h.assert(state.twins && state.twins.front && state.twins.rear, '2体の状態がない');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    var title = els['result-title'].textContent;
    h.assert(title === 'CLEAR' || title === 'DOWN', '結果タイトルが不正: ' + title);
    h.assert(els['result-score'].textContent === String(state.result.score), '結果スコア表示が状態と不一致');
  },
  summary: function (state) {
    print('  ' + state.result.reason + ' / stage=' + state.result.stage + ' / score=' + state.result.score + ' / gates=' + state.result.gates + ' / hits=' + state.result.hits);
  }
});
