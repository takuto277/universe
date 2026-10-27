/* test-smoke.js : 1試合を自動プレイで完走させるスモークテスト（jsc で実行）
 * 実行例:
 *   cd universe && jsc baseball-game/test-smoke.js
 *   cd projects/_labs/baseball-game && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/baseball-game/engine.js']);
tryLoad(['game.js', 'projects/_labs/baseball-game/game.js']);

Harness.run({
  name: 'baseball-game',
  maxSteps: 80000,
  afterDone: 400,
  check: function (state, h) {
    if (!state || !state.over) { h.assert(false, '試合が終了していない'); return; }
    h.assert(state.inning === 3, '3回で終わっていない: ' + state.inning);
    var sumH = 0, sumA = 0;
    for (var k = 0; k < state.totalInnings; k++) {
      sumA += state.linescore.away[k] || 0;
      sumH += state.linescore.home[k] || 0;
    }
    h.assert(sumH === state.score.home && sumA === state.score.away, 'ラインスコア不整合');
    if (state.result === 'home') h.assert(state.score.home > state.score.away, '勝敗不整合(home)');
    if (state.result === 'away') h.assert(state.score.away > state.score.home, '勝敗不整合(away)');
    if (state.result === 'draw') h.assert(state.score.home === state.score.away, '引き分け不整合');
    h.assert(state.pitcherHistory.length >= 6 && state.playerHistory.length >= 9, '投球の記録が少なすぎる');
    for (var ph = 0; ph < state.playerHistory.length; ph++) {
      h.assert(typeof state.playerHistory[ph] === 'string', 'playerHistoryに非文字列が混入:  index ' + ph);
    }
    for (var pth = 0; pth < state.pitcherHistory.length; pth++) {
      h.assert(typeof state.pitcherHistory[pth].pitch === 'string', 'pitcherHistoryに非文字列が混入: index ' + pth);
    }
    h.assert(state.hits.home + state.hits.away > 0 || (state.score.home === 0 && state.score.away === 0),
      '安打0なのに得点あり');
    var els = h.elements;
    h.assert(els['screen-end'] && els['screen-end'].classList.contains('visible'), 'エンド画面が表示されていない');
  },
  summary: function (state) {
    print('  最終: あなた ' + state.score.home + ' - ' + state.score.away + ' CPU  安打 ' +
      state.hits.home + '/' + state.hits.away + '  結果=' + state.result);
  }
});
