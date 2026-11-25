/* test-smoke.js : SHIFT ROOM を実ブラウザ相当のハーネスで自動プレイ */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/shift-room/engine.js']);
tryLoad(['audio.js', 'projects/_labs/shift-room/audio.js']);
tryLoad(['game.js', 'projects/_labs/shift-room/game.js']);

Harness.run({
  name: 'shift-room',
  maxSteps: 30000,
  afterDone: 400,
  check: function (state, h) {
    if (!state) {
      h.assert(false, '状態が取得できない');
      return;
    }
    h.assert(state.over === true, '自動プレイで終了しない: ' + state.phase);
    h.assert(state.phase === 'victory' || state.phase === 'over', '終了フェーズが不正: ' + state.phase);
    h.assert(typeof state.totalKeys === 'number', 'keysが未定義');
    h.assert(typeof state.roomsCleared === 'number', 'roomsが未定義');
    h.assert(typeof state.score === 'number', 'scoreが未定義');
    h.assert(state.result && typeof state.result.rank === 'string', '結果にランクがない');

    var els = h.elements;
    h.assert(els['end-overlay'] && els['end-overlay'].classList.contains('visible'), 'エンド画面が表示されていない');
    h.assert(els['start-overlay'] && !els['start-overlay'].classList.contains('visible'), 'スタート画面が残っている');
    h.assert(els['end-rank'] && els['end-rank'].textContent, 'エンド画面のランクが空');
    h.assert(els['end-time'] && els['end-time'].textContent.indexOf('TIME') === 0, 'エンド画面のタイム表示が不正');
    h.assert(els['end-score'] && els['end-score'].textContent.indexOf('SCORE') === 0, 'エンド画面のスコア表示が不正');
    h.assert(els['hud'] && els['hud'].classList.contains('is-hidden'), '終了後もHUDが表示されている');
  },
  summary: function (state) {
    print('  phase=' + state.phase + ' / keys=' + state.totalKeys +
      ' / rooms=' + state.roomsCleared + ' / score=' + state.score +
      ' / rank=' + (state.result ? state.result.rank : '-') +
      ' / shifts=' + state.shifts);
  }
});
