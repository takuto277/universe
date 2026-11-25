/* test-smoke.js : SHADE を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/shade/engine.js']);
tryLoad(['game.js', 'projects/_labs/shade/game.js']);

Harness.run({
  name: 'shade',
  maxSteps: 4000,
  afterDone: 60,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && state.result.reason === 'clear', '自動プレイでCLEARしない: ' + (state.result && state.result.reason));
    h.assert(state.result.cleared === state.stages, 'クリア数が全ステージでない');
    h.assert(state.result.turns > 0 && state.result.turns <= state.stages * state.turnLimit, 'ターン数が範囲外');
    h.assert(state.result.shadows === state.maxShadows, '解の実行で残影を失っている');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    var title = els['result-title'].textContent;
    h.assert(title === 'ESCAPED' || title === 'CAUGHT', '結果タイトルが不正: ' + title);
    h.assert(els['result-stage'].textContent === state.result.cleared + '/' + state.stages, '結果ステージ表示が不一致');
    h.assert(els['result-turns'].textContent === String(state.result.turns), '結果ターン表示が不一致');
    h.assert(els['result-rank'].textContent === state.result.rank, '結果ランク表示が不一致');
  },
  summary: function (state) {
    print('  ' + state.result.reason + ' / cleared=' + state.result.cleared + '/' + state.result.stages +
      ' / turns=' + state.result.turns + ' / shadows=' + state.result.shadows +
      ' / caught=' + state.result.caught + ' / rank=' + state.result.rank + ' / seed=' + state.seed);
  }
});
