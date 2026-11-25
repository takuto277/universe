/* test-smoke.js : AFTERIMAGE を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/afterimage/engine.js']);
tryLoad(['audio.js', 'projects/_labs/afterimage/audio.js']);
tryLoad(['game.js', 'projects/_labs/afterimage/game.js']);

Harness.run({
  name: 'afterimage',
  maxSteps: 7000,
  afterDone: 140,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over' || state.phase === 'victory', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && state.result.score > 0, '結果スコアが入っていない');
    h.assert(state.result.heightM > 0, '高度が0mのまま');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['end-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-height'].textContent !== '0m', '結果の高度が0mのまま');
    h.assert(/^\d+m$/.test(els['height'].textContent), 'HUDの高度表示が不正: ' + els['height'].textContent);
  },
  summary: function (state) {
    print('  phase=' + state.phase + ' / height=' + state.heightM + 'm' +
      ' / checkpoints=' + state.checkpoints + ' / score=' + state.result.score +
      ' / rank=' + state.result.rank);
  }
});
