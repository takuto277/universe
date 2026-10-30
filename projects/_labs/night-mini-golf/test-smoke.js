function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/night-mini-golf/engine.js']);
tryLoad(['game.js', 'projects/_labs/night-mini-golf/game.js']);

Harness.run({
  name: 'night-mini-golf',
  maxSteps: 60000,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, 'ゲームが終了しない');
    h.assert(state.phase === 'clear' || state.phase === 'over' || state.phase === 'ending', '終了状態が不正: ' + state.phase);
    h.assert(state.holesWon && state.holesWon.player >= 0 && state.holesWon.cpu >= 0, 'ホール勝敗が不正');
    h.assert(state.strokes && state.strokes.player >= 0 && state.strokes.cpu >= 0, 'ストロークが不正');
    var els = h.elements;
    var resultVisible = ['screen-stage', 'screen-over', 'screen-ending'].some(function (id) {
      return els[id] && els[id].classList.contains('visible');
    });
    h.assert(resultVisible, 'リザルト画面が出ていない');
    h.assert(els['you'] && els['cpu'], 'スコアHUDがない');
    h.assert(els['turn'] && els['shots'], 'ターンHUDがない');
  },
  summary: function (state) {
    print('  最終: ' + state.phase + ' / YOU ' + state.holesWon.player + ' - ' + state.holesWon.cpu + ' CPU');
  }
});
