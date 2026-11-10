/* test-smoke.js : 0.1秒ドアマンを実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/zero-one-doorman/engine.js']);
tryLoad(['game.js', 'projects/_labs/zero-one-doorman/game.js']);

Harness.run({
  name: 'zero-one-doorman',
  maxSteps: 2600,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over' && state.over === true, '30秒で終了していない: ' + state.phase);
    h.assert(state.result && state.result.score > 0, 'スコアが記録されていない');
    h.assert(state.result.served > 0, '自動操作で仕分けできていない');
    h.assert(state.rank && state.rank.length > 0, 'ランクが不正: ' + state.rank);

    var els = h.elements;
    h.assert(!els['screen-start'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['screen-end'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-score'].textContent === String(state.result.score), '結果スコア表示が状態と不一致');
    h.assert(els['end-served'].textContent === String(state.result.served), '結果仕分け表示が状態と不一致');
    h.assert(els['end-rank'].textContent === state.rank, '結果ランク表示が状態と不一致');
  },
  summary: function (state) {
    print('  最終: ' + state.result.score + 'pt / ' + state.rank + ' / 仕分け' + state.result.served + ' / ミス' + state.result.missed + ' / 最大コンボ' + state.result.maxCombo);
  }
});
