function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['data.js', 'projects/_labs/oto-no-ie/data.js']);
tryLoad(['engine.js', 'projects/_labs/oto-no-ie/engine.js']);
tryLoad(['game.js', 'projects/_labs/oto-no-ie/game.js']);

Harness.run({
  name: 'oto-no-ie',
  maxSteps: 400,
  afterDone: 150,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.cleared === true, '全室クリアにならない: phase=' + state.phase);
    h.assert(state.phase === 'ending', 'エンディングにならない: phase=' + state.phase);
    h.assert(state.levelIndex === state.levelTotal - 1, '最終レベルではない: ' + state.levelIndex);
    h.assert(state.result && state.result.ok === true, '最後のシミュレーションが成功していない');

    var els = h.elements;
    h.assert(els['screen-ending'] && els['screen-ending'].classList.contains('visible'), 'エンディング画面が出ていない');
    h.assert(els['screen-title'] && !els['screen-title'].classList.contains('visible'), 'タイトル画面が残っている');
    h.assert(els['level'] && els['level'].textContent === '5/5', 'HUDのレベルが一致しない: ' + els['level'].textContent);
  },
  summary: function (state) {
    print('  最終: ' + (state.levelIndex + 1) + '/' + state.levelTotal + '室 / 鈴' + state.charmsUsed + '個 / ' + state.levelTitle);
  }
});
