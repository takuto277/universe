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
  maxSteps: 30000,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, 'ゲームが終了しない');
    h.assert(state.phase === 'clear' || state.phase === 'ending', '終了状態が不正: ' + state.phase);
    h.assert(state.stage >= 0 && state.stage < state.stageTotal, 'ステージ番号が不正');
    h.assert(state.hole >= 0 && state.hole < state.holeTotal, 'ホール番号が不正');
    h.assert(state.par >= 2, 'PARが不正');
    h.assert(state.totalStrokes >= 3, 'ストローク数が不正');
    var els = h.elements;
    h.assert(els['screen-stage'] && els['screen-stage'].classList.contains('visible'), 'ステージクリア画面が出ていない');
    h.assert(els['hole'] && els['hole'].textContent.indexOf('/') >= 0, 'HOLE HUDが不正');
    h.assert(els['par'] && els['par'].textContent.indexOf('PAR') >= 0, 'PAR HUDが不正');
  },
  summary: function (state) {
    print('  最終: ' + state.stageName + ' / ' + state.totalStrokes + ' strokes');
  }
});
