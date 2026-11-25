/* test-smoke.js : TUTOR を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/tutor/engine.js']);
tryLoad(['game.js', 'projects/_labs/tutor/game.js']);

Harness.run({
  name: 'tutor',
  maxSteps: 12000,
  afterDone: 40,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result, '結果がない');
    h.assert(state.result.trialsDone === state.trialCount, '10回の本番が終わっていない');
    h.assert(state.result.samples > 0, '手本が記録されていない');
    h.assert(state.result.score >= 0, 'スコアが不正');
    var ranks = ['S', 'A', 'B', 'C', 'D'];
    h.assert(ranks.indexOf(state.result.rank) >= 0, 'ランクが不正');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(ranks.indexOf(els['result-title'].textContent) >= 0, '結果タイトルが不正');
    h.assert(els['result-cores'].textContent === String(state.result.cores), '結果コア数が状態と不一致');
    h.assert(els['result-samples'].textContent === String(state.result.samples), '結果サンプル数が状態と不一致');
  },
  summary: function (state) {
    print('  score=' + state.result.score + ' / rank=' + state.result.rank + ' / samples=' + state.result.samples + ' / hits=' + state.result.hits);
  }
});
