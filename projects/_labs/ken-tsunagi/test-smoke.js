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
  maxSteps: 8000,
  afterDone: 180,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.cleared === true, '47県が1つになってもクリアにならない: phase=' + state.phase);
    h.assert(state.phase === 'clear', 'クリア画面待ちのまま: phase=' + state.phase);
    h.assert(state.largest === 47 && state.total === 47, '47県がつながっていない: ' + state.largest);
    h.assert(state.merges === 46, '合体回数が46ではない: ' + state.merges);
    h.assert(state.bodyCount === 1, '箱に複数の島が残っている: ' + state.bodyCount);
    h.assert(state.score > 15000, 'スコアが伸びていない: ' + state.score);
    h.assert(state.clearBonus > 0, 'クリアボーナスがない');
    h.assert(state.best && state.best.score >= state.score, 'ベストスコアが更新されていない');
    h.assert(state.best && state.best.time > 0, 'ベストタイムが記録されていない');

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
    print('  最終: ' + state.score + '点 / ' + state.largest + '/' + state.total +
      ' / ' + state.elapsed.toFixed(1) + 's / 合体' + state.merges + '回');
  }
});
