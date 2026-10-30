function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/school-chair-drift/engine.js']);
tryLoad(['game.js', 'projects/_labs/school-chair-drift/game.js']);

Harness.run({
  name: 'school-chair-drift',
  maxSteps: 60000,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'clear' || state.phase === 'over', 'レースが終了しない: ' + state.phase);
    h.assert(state.stage >= 0 && state.stage < state.stageTotal, 'ステージ番号が不正');
    h.assert(state.lap >= 1 && state.lap <= state.laps, 'ラップが不正');
    h.assert(state.place >= 1 && state.place <= 4, '順位が不正');
    var els = h.elements;
    var resultVisible = ['screen-over', 'screen-stage', 'screen-ending'].some(function (id) {
      return els[id] && els[id].classList.contains('visible');
    });
    h.assert(resultVisible, 'リザルト画面が出ていない');
    h.assert(els['lap'] && els['lap'].textContent.indexOf('/') >= 0, 'LAP HUDが不正');
    h.assert(els['rank'] && els['rank'].textContent.indexOf('/') >= 0, 'RANK HUDが不正');
  },
  summary: function (state) {
    print('  最終: ' + state.phase + ' / ' + state.place + '位 / STAGE ' + (state.stage + 1) + ' / LAP ' + state.lap + '/' + state.laps);
  }
});
