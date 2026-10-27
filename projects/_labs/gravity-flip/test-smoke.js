/* test-smoke.js : 1回プレイして終了画面まで到達するスモークテスト（jsc で実行）
 * 実行例:
 *   cd universe && jsc gravity-flip/test-smoke.js
 *   cd projects/_labs/gravity-flip && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/gravity-flip/engine.js']);
tryLoad(['game.js', 'projects/_labs/gravity-flip/game.js']);

Harness.run({
  name: 'gravity-flip',
  maxSteps: 20000,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, 'トゲに当たって終了していない');
    h.assert(state.phase === 'over', '終了画面待ちのまま: phase=' + state.phase);
    h.assert(state.deathCause === 'spike', '死亡理由がspikeでない: ' + state.deathCause);
    h.assert(state.score > 0, 'スコアが伸びていない: ' + state.score);
    h.assert(state.distance > 0, '距離が0のまま');
    h.assert(state.time > 0, 'プレイ時間が0のまま');
    h.assert(state.best >= state.score, 'ベストがスコアより小さい');
    h.assert(state.flips >= 1, '反転が一度も起きていない');
    var els = h.elements;
    h.assert(els['screen-end'] && els['screen-end'].classList.contains('visible'), '終了画面が出ていない');
    h.assert(els['screen-start'] && !els['screen-start'].classList.contains('visible'), '開始画面が残っている');
    h.assert(els['score'] && els['score'].textContent === String(state.score), 'HUDのスコアが一致しない');
  },
  summary: function (state) {
    print('  最終: ' + state.score + '点 / ' + state.distance + 'm / コイン' + state.coins +
      ' / ' + state.time.toFixed(1) + '秒 / 反転' + state.flips + '回');
  }
});
