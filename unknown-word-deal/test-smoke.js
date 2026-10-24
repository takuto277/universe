/* test-smoke.js : 1ランを自動プレイで完走させるスモークテスト（jsc で実行）
 * 実行例:
 *   cd unknown-word-deal && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'unknown-word-deal/engine.js']);
tryLoad(['audio.js', 'unknown-word-deal/audio.js']);
tryLoad(['ui.js', 'unknown-word-deal/ui.js']);
tryLoad(['game.js', 'unknown-word-deal/game.js']);

Harness.run({
  name: 'unknown-word-deal',
  maxSteps: 2000,
  afterDone: 400,
  check: function (state, h) {
    if (!state || !state.over) { h.assert(false, '終了していない'); return; }
    h.assert(state.phase === 'ending', 'エンド画面待ちでない: ' + state.phase);
    h.assert(state.rank === 'S', 'S評価でない: ' + state.rank);
    h.assert(state.coins === 35 || state.coins === 30, '硬貨が35/30でない: ' + state.coins);
    h.assert(state.learned.bread && state.learned.fish && state.learned.gem, '3語を学べていない');
    h.assert(state.history.length === 3 && state.history.every(function (x) { return x.correct; }), '商人の履歴が不正');
    h.assert(state.review && state.review.optimal, '契約の読みが最適でない');
    var els = h.elements;
    h.assert(els['ending-overlay'] && els['ending-overlay'].classList.contains('visible'), 'エンド画面が表示されていない');
    h.assert(els['start-overlay'] && !els['start-overlay'].classList.contains('visible'), 'スタート画面が残っている');
    h.assert(els['contract-overlay'] && !els['contract-overlay'].classList.contains('visible'), '契約画面が残っている');
    h.assert(els['coins'] && els['coins'].textContent === String(state.coins), 'HUDの硬貨が一致しない');
    h.assert(els['best-label-end'] && els['best-label-end'].textContent.indexOf('更新') < 0, 'localStorageなしで自己ベスト更新と表示している');
  },
  summary: function (state) {
    print('  評価=' + state.rank + ' / 硬貨=' + state.coins +
      ' / 商人=' + state.history.map(function (x) { return x.correct ? '当' : '外'; }).join('') +
      ' / 契約=' + (state.review && state.review.optimal ? '最適' : '読み違い'));
  }
});
