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
  maxSteps: 40000,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.phase === 'clear' || state.phase === 'over', 'ゲームが終了しない: ' + state.phase);
    h.assert(state.stage >= 0 && state.stage < state.stageTotal, 'ステージ番号が不正');
    h.assert(state.time >= 0, '残り時間が不正');
    h.assert(isFinite(state.chair.x) && isFinite(state.chair.speed), '物理値が不正');
    var els = h.elements;
    var resultVisible = ['screen-over', 'screen-stage', 'screen-ending'].some(function (id) {
      return els[id] && els[id].classList.contains('visible');
    });
    h.assert(resultVisible, 'リザルト画面が出ていない');
    h.assert(els['screen-title'] && !els['screen-title'].classList.contains('visible'), 'タイトル画面が残っている');
    h.assert(els['time'], 'TIME HUDがない');
    h.assert(els['speed'], 'SPEED HUDがない');
    h.assert(els['shots'] && els['shots'].textContent.indexOf('STAGE ') === 0, 'STAGE HUDが不正');
  },
  summary: function (state) {
    print('  最終: ' + state.phase + ' / STAGE ' + (state.stage + 1) + ' / TIME ' + state.time.toFixed(1) + ' / MILK ' + state.milk);
  }
});
