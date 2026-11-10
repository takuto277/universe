/* test-smoke.js : TENDRIL を実際の game.js ごと起動して自動プレイする */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/tendril/engine.js']);
tryLoad(['renderer.js', 'projects/_labs/tendril/renderer.js']);
tryLoad(['game.js', 'projects/_labs/tendril/game.js']);

Harness.run({
  name: 'tendril',
  maxSteps: 4200,
  afterDone: 60,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'over', '45秒で終了していない: ' + state.phase);
    h.assert(state.result && state.result.score > 0, '餌を捕食できていない');
    h.assert(state.eaten > 0, '捕食数が0');
    h.assert(state.bodyLen >= 12, '体の長さが初期値以上');
    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-score'].textContent === String(state.result.score), '結果スコア表示が状態と不一致');
    h.assert(els['result-eaten'].textContent === String(state.result.eaten), '捕食数表示が状態と不一致');
  },
  summary: function (state) {
    print('  score=' + state.result.score + ' / eaten=' + state.result.eaten + ' / nodes=' + state.bodyLen);
  }
});
