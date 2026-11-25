/* test-smoke.js : MAPLESS を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/mapless/engine.js']);
tryLoad(['audio.js', 'projects/_labs/mapless/audio.js']);
tryLoad(['game.js', 'projects/_labs/mapless/game.js']);

Harness.run({
  name: 'mapless',
  maxSteps: 4000,
  afterDone: 120,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && state.result.clear === true, 'クリアにならない');
    h.assert(state.result.floors && state.result.floors.length === 3, '3フロアの結果がない');
    h.assert(state.result.score > 0, '結果スコアが0');
    h.assert(state.result.rank && state.result.rank.length === 1, 'ランクが不正');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['end-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-rank'].textContent.length === 1, 'ランク表示が不正');
    h.assert(els['end-score'].textContent !== '0', '結果スコアが0のまま');
    h.assert(els['floor'].textContent === '3/3', 'FLOOR表示が3/3でない: ' + els['floor'].textContent);
    h.assert(els['floor-name'].textContent.length > 0, 'フロア名が描画されていない');
  },
  summary: function (state) {
    print('  phase=' + state.phase + ' / rank=' + state.result.rank +
      ' / score=' + state.result.score + ' / floors=' + state.result.floors.length +
      ' / time=' + state.result.totalTime.toFixed(1));
  }
});
