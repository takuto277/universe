/* test-smoke.js : BEAT RUSH を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['audio.js', 'projects/_labs/beat-rush/audio.js']);
tryLoad(['engine.js', 'projects/_labs/beat-rush/engine.js']);
tryLoad(['game.js', 'projects/_labs/beat-rush/game.js']);

Harness.run({
  name: 'beat-rush',
  maxSteps: 2600,
  afterDone: 200,
  check: function (state, h) {
    h.assert(typeof BeatRushAudio === 'object', 'audio.js が読み込まれていない');
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over' && state.over === true, '30秒で終了していない: ' + state.phase);
    h.assert(state.result && state.result.score > 0, 'スコアが記録されていない');
    h.assert(state.result.accuracy > 0, '精度が0のまま');
    h.assert(state.judged > 0, '自動操作でノートを叩けていない');
    h.assert(state.result.rank && state.result.rank.length === 1, 'ランクが不正: ' + state.result.rank);

    var els = h.elements;
    h.assert(!els['screen-start'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['screen-end'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['end-score'].textContent === String(state.result.score), '結果スコア表示が状態と不一致');
    h.assert(els['end-rank'].textContent === state.result.rank, '結果ランク表示が状態と不一致');
  },
  summary: function (state) {
    print('  最終: ' + state.result.score + 'pt / ' + state.result.rank + ' / accuracy ' + state.result.accuracy.toFixed(1) + '% / combo ' + state.result.maxCombo);
  }
});
