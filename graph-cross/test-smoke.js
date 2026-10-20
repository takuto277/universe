/* test-smoke.js : 1回プレイして終了画面まで到達するスモークテスト（jsc で実行）
 * 実行例:
 *   cd universe && jsc graph-cross/test-smoke.js
 *   cd universe/graph-cross && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'graph-cross/engine.js']);
tryLoad(['game.js', 'graph-cross/game.js']);

Harness.run({
  name: 'graph-cross',
  maxSteps: 20000,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, 'ライフが尽きていない');
    h.assert(state.phase === 'over', '終了画面待ちのまま: phase=' + state.phase);
    h.assert(state.deathCause === 'miss', '終了理由がmissでない: ' + state.deathCause);
    h.assert(state.hp === 0, 'HPが0でない: ' + state.hp);
    h.assert(state.x > 0, 'xが進んでいない');
    h.assert(state.time > 0, 'プレイ時間が0');
    h.assert(state.best >= state.score, 'ベストがスコアより小さい');
    h.assert(state.maxCombo >= 0, '最大コンボが不正');
    h.assert(state.deck && state.deck.length === 3, 'デッキが3つでない');
    var els = h.elements;
    h.assert(els['screen-end'] && els['screen-end'].classList.contains('visible'), '終了画面が出ていない');
    h.assert(els['screen-start'] && !els['screen-start'].classList.contains('visible'), '開始画面が残っている');
    h.assert(els['score'] && els['score'].textContent === String(state.score), 'HUDのスコアが一致しない');
    h.assert(els['life'] && els['life'].textContent.indexOf('●') < 0, 'ライフ表示が0になっていない: ' + els['life'].textContent);
  },
  summary: function (state) {
    print('  最終: ' + state.score + '点 / x=' + state.x + ' / 最大コンボx' + state.maxCombo +
      ' / ' + state.time.toFixed(1) + '秒 / 交差' + state.hits + '回 / ミス' + state.misses + '回');
  }
});
