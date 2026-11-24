/* test-smoke.js : REBEL BREAKOUT を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/rebel-breakout/engine.js']);
tryLoad(['game.js', 'projects/_labs/rebel-breakout/game.js']);

Harness.run({
  name: 'rebel-breakout',
  maxSteps: 12000,
  afterDone: 60,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && (state.result.reason === 'clear' || state.result.reason === 'down'), '結果の理由が不正');
    h.assert(state.result.time >= 0 && state.result.time <= state.duration + 0.1, '結果タイムが範囲外');
    h.assert(state.result.score >= 0, '結果スコアが不正');
    h.assert(state.player && state.balls && state.balls.length >= 1, 'プレイヤーかボールの状態がない');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    var title = els['result-title'].textContent;
    h.assert(title === 'CLEAR' || title === 'DOWN', '結果タイトルが不正: ' + title);
    h.assert(els['result-score'].textContent === String(state.result.score), '結果スコア表示が状態と不一致');
    h.assert(els['result-time'].textContent === state.result.time.toFixed(1) + 's', '結果タイム表示が状態と不一致');
    h.assert(els['result-rank'].textContent === state.result.rank, '結果ランク表示が状態と不一致');
  },
  summary: function (state) {
    print('  ' + state.result.reason + ' / time=' + state.result.time + ' / score=' + state.result.score +
      ' / rank=' + state.result.rank + ' / graze=' + state.result.nearMisses + ' / broken=' + state.result.shieldsBroken);
  }
});
