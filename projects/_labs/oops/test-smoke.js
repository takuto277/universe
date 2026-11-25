/* test-smoke.js : OOPS を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/oops/engine.js']);
tryLoad(['audio.js', 'projects/_labs/oops/audio.js']);
tryLoad(['game.js', 'projects/_labs/oops/game.js']);

Harness.run({
  name: 'oops',
  maxSteps: 8000,
  afterDone: 120,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && state.result.clear === true, '自動プレイでクリアできない');
    h.assert(state.result.correct === state.total, '正解数が問題数と一致しない');
    h.assert(state.result.score > 0, '結果スコアが0');
    h.assert(state.timeLeft > 0, 'クリア時に時間が残っていない');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['end-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-score'].textContent !== '0', '結果スコアが0のまま');
    h.assert(els['end-rank'].textContent.length === 1, 'ランク表示が不正');
    h.assert(els['choice-text-0'].textContent !== '—', '選択肢が描画されていない');
  },
  summary: function (state) {
    print('  phase=' + state.phase + ' / rank=' + state.result.rank +
      ' / score=' + state.result.score + ' / correct=' + state.result.correct +
      ' / combo=' + state.result.bestCombo + ' / timeLeft=' + state.result.timeLeft);
  }
});
