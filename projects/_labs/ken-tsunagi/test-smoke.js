function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['data.js', 'projects/_labs/ken-tsunagi/data.js']);
tryLoad(['engine.js', 'projects/_labs/ken-tsunagi/engine.js']);
tryLoad(['game.js', 'projects/_labs/ken-tsunagi/game.js']);

Harness.run({
  name: 'ken-tsunagi',
  maxSteps: 1200,
  afterDone: 180,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.cleared === true, '47県そろってもクリアにならない: phase=' + state.phase);
    h.assert(state.phase === 'clear', 'クリア画面待ちのまま: phase=' + state.phase);
    h.assert(state.placedCount === state.total, '47県そろっていない: ' + state.placedCount);
    h.assert(state.score > 5000, 'スコアが伸びていない: ' + state.score);
    h.assert(state.best && state.best.score >= state.score, 'ベストスコアが更新されていない');
    h.assert(state.best && state.best.time > 0, 'ベストタイムが記録されていない');
    h.assert(state.finishTime > 0 && state.clearBonus > 0, 'クリアタイムかボーナスが不正');

    var els = h.elements;
    h.assert(els['screen-clear'] && els['screen-clear'].classList.contains('visible'), 'クリア画面が出ていない');
    h.assert(els['screen-title'] && !els['screen-title'].classList.contains('visible'), 'タイトル画面が残っている');
    h.assert(els['score'] && els['score'].textContent === String(state.score), 'HUDのスコアが一致しない');
    h.assert(els['count'] && els['count'].textContent === '47/47', 'HUDの接続数が一致しない');
    h.assert(els['clear-score'] && els['clear-score'].textContent === String(state.score), 'クリア画面のスコアが一致しない');
    h.assert(els['clear-best-score'] && els['clear-best-score'].textContent === String(state.best.score), 'クリア画面のベストスコアが一致しない');
    h.assert(els['clear-time'] && els['clear-time'].textContent.length > 3, 'クリアタイムが表示されない');
  },
  summary: function (state) {
    print('  最終: ' + state.score + '点 / ' + state.placedCount + '/' + state.total +
      ' / ' + state.finishTime.toFixed(1) + 's / 最大コンボ' + state.bestCombo);
  }
});
