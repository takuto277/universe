function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['script.js', 'projects/_labs/jump-rush/script.js']);

Harness.run({
  name: 'jump-rush',
  maxSteps: 12000,
  afterDone: 260,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.cleared === true, '城に入ってもクリアにならない: phase=' + state.phase);
    h.assert(state.phase === 'clear', 'クリア画面待ちのまま: phase=' + state.phase);
    h.assert(state.lives >= 1, '自動プレイでライフを使い切った: ' + state.lives);
    h.assert(state.stomps >= 1, '敵を踏めていない: ' + state.stomps);
    h.assert(state.score > 3000, 'スコアが伸びていない: ' + state.score);
    h.assert(state.best >= state.score, 'ベストが更新されていない: ' + state.best);
    h.assert(state.finishTime > 10, 'クリアタイムが不正: ' + state.finishTime);
    h.assert(state.enemiesAlive < state.enemiesTotal, '敵が1体も減っていない');

    var els = h.elements;
    var expectedHearts = '';
    for (var i = 0; i < 3; i++) expectedHearts += i < state.lives ? '♥' : '♡';
    h.assert(els['screen-clear'] && els['screen-clear'].classList.contains('visible'), 'クリア画面が出ていない');
    h.assert(els['screen-title'] && !els['screen-title'].classList.contains('visible'), 'タイトル画面が残っている');
    h.assert(els['score'] && els['score'].textContent === String(state.score), 'HUDのスコアが一致しない');
    h.assert(els['lives'] && els['lives'].textContent === expectedHearts, 'HUDのライフが一致しない');
    h.assert(els['clear-score'] && els['clear-score'].textContent === String(state.score), 'クリア画面のスコアが一致しない');
    h.assert(els['clear-best'] && els['clear-best'].textContent === String(state.best), 'クリア画面のベストが一致しない');
    h.assert(els['clear-time'] && els['clear-time'].textContent === state.finishTime.toFixed(1) + 's', 'クリアタイムが一致しない');
    h.assert(els['clear-stomps'] && els['clear-stomps'].textContent === String(state.stomps), 'クリア画面の踏み数が一致しない');
  },
  summary: function (state) {
    print('  最終: ' + state.score + '点 / ' + state.distance + 'm / 踏み' + state.stomps +
      ' / ' + state.lives + 'ライフ / ' + state.finishTime.toFixed(1) + 's / BEST' + state.best);
  }
});
