/* test-smoke.js : STILL を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/still/engine.js']);
tryLoad(['audio.js', 'projects/_labs/still/audio.js']);
tryLoad(['game.js', 'projects/_labs/still/game.js']);

Harness.run({
  name: 'still',
  maxSteps: 9000,
  afterDone: 120,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over' || state.phase === 'victory', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && state.result.score > 0, '結果スコアが入っていない');
    h.assert(state.kills > 0, '敵を1体も倒せていない');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['end-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-score'].textContent !== '0', '結果スコアが0のまま');
    h.assert(/^\d:\d\d$/.test(els['time'].textContent), 'HUDの時間表示が不正: ' + els['time'].textContent);
  },
  summary: function (state) {
    print('  phase=' + state.phase + ' / score=' + state.result.score +
      ' / kills=' + state.kills + ' / rooms=' + state.roomsCleared +
      ' / time=' + state.result.timeLeft.toFixed(1) + ' / rank=' + state.result.rank);
  }
});
