/* test-smoke.js : AMMO SHARE を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/ammo-share/engine.js']);
tryLoad(['game.js', 'projects/_labs/ammo-share/game.js']);

Harness.run({
  name: 'ammo-share',
  maxSteps: 9000,
  afterDone: 40,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'finished', '自動プレイで終了しない: ' + state.phase);
    h.assert(state.result && (state.result.reason === 'clear' || state.result.reason === 'hit'), '結果の理由が不正');
    h.assert(state.result.score >= 0, '結果スコアが不正');
    h.assert(state.result.accuracy >= 0 && state.result.accuracy <= 100, '命中率が不正');
    h.assert(state.debt >= 0 && state.purgeCharges >= 0, '返球数かPURGE残数が不正');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    var title = els['result-title'].textContent;
    h.assert(title === 'SURVIVED' || title === 'DOWN', '結果タイトルが不正: ' + title);
    h.assert(els['result-score'].textContent === String(state.result.score), '結果スコア表示が状態と不一致');
    h.assert(els['result-rank'].textContent.indexOf('RANK') === 0, 'ランク表示が不正');
  },
  summary: function (state) {
    print('  ' + state.result.reason + ' / score=' + state.result.score + ' / kills=' + state.result.kills + ' / acc=' + state.result.accuracy + '% / debt=' + state.result.debt);
  }
});
