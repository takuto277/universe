/* test-smoke.js : WORD FRONT を game.js ごと起動して自動対戦する
 *   cd projects/_labs/word-front && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['dictionary.js', 'projects/_labs/word-front/dictionary.js']);
tryLoad(['engine.js', 'projects/_labs/word-front/engine.js']);
tryLoad(['audio.js', 'projects/_labs/word-front/audio.js']);
tryLoad(['game.js', 'projects/_labs/word-front/game.js']);

Harness.run({
  name: 'word-front',
  maxSteps: 30000,
  afterDone: 400,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }

    h.assert(state.phase === 'over' && state.over === true, '自動対戦が終了していない: ' + state.phase);
    h.assert(state.board && state.board.length === 64, '盤面が64マスでない');
    h.assert(state.ownership && state.ownership.length === 64, '陣地が64マスでない');
    h.assert(state.result && state.result.winner, '勝敗結果がない');
    h.assert(state.result.reason === 'time' || state.result.reason === 'no-moves', '終了理由が不正: ' + state.result.reason);
    h.assert(typeof state.scores.player === 'number' && typeof state.scores.cpu === 'number', '陣地スコアが数値でない');
    h.assert(state.scores.player >= 0 && state.scores.cpu >= 0, '陣地スコアが負数');
    h.assert(state.result.playerScore === state.scores.player, '結果とスコアが不一致 (player)');
    h.assert(state.result.cpuScore === state.scores.cpu, '結果とスコアが不一致 (cpu)');

    var els = h.elements;
    h.assert(!els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残っている');
    h.assert(els['end-overlay'].classList.contains('visible'), 'エンド画面が表示されていない');
    h.assert(els['end-title'] && els['end-title'].textContent.length > 0, 'エンド画面の勝敗表示が空');
    h.assert(els['end-player'] && els['end-player'].textContent === String(state.scores.player), 'エンド画面のあなたの陣地が不一致');
    h.assert(els['end-cpu'] && els['end-cpu'].textContent === String(state.scores.cpu), 'エンド画面のCPU陣地が不一致');
    h.assert(els['time'] && els['time'].textContent.length > 0, 'タイマー表示が空');
  },
  summary: function (state) {
    print('  勝者=' + state.result.winner +
      ' / 理由=' + state.result.reason +
      ' / 陣地=' + state.scores.player + '-' + state.scores.cpu +
      ' / ことば=' + state.history.length +
      ' / のこり=' + Math.ceil(state.time) + 's');
  }
});
