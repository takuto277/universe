/* test-smoke.js : DEBT を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/debt/engine.js']);
tryLoad(['audio.js', 'projects/_labs/debt/audio.js']);
tryLoad(['game.js', 'projects/_labs/debt/game.js']);

Harness.run({
  name: 'debt',
  maxSteps: 3000,
  afterDone: 60,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result, '結果がない');
    h.assert(state.result.rank && state.result.rank.length === 1, 'ランクが不正');
    if (state.result.clear) {
      h.assert(state.result.score > 0, 'クリアなのにスコアが0');
    } else {
      h.assert(state.result.defaulted === true, 'デフォルトフラグが立たない');
    }
    h.assert(state.history.length === state.days, '履歴が5日分でない');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['end-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-rank'].textContent.length === 1, 'ランク表示が不正');
    h.assert(els['day'].textContent === '5/5', 'DAY表示が5/5でない: ' + els['day'].textContent);
    h.assert(els['offer-name-0'].textContent !== '—', 'オファーが描画されていない');
  },
  summary: function (state) {
    print('  ' + (state.result.clear ? 'CLEAR' : 'DEFAULT') +
      ' / score=' + state.result.score + ' / rank=' + state.result.rank +
      ' / assets=' + state.result.assets + ' / interest=' + state.result.totalInterest);
  }
});
