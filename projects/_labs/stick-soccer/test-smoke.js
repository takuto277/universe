function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/stick-soccer/engine.js']);
tryLoad(['game.js', 'projects/_labs/stick-soccer/game.js']);

Harness.run({
  name: 'stick-soccer',
  maxSteps: 20000,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, 'ゲームが終了しない: phase=' + state.phase);
    h.assert(state.phase === 'over', '終了状態が不正: ' + state.phase);
    h.assert(state.shots > 0, 'キック数が不正: ' + state.shots);
    h.assert(state.score.player >= 3 || state.score.cpu >= 3, '先に3点で終了していない');
    h.assert(state.score.player >= 0 && state.score.cpu >= 0, 'スコアが不正');
    h.assert(state.winner === 'player' || state.winner === 'cpu' || state.winner === 'draw', '勝敗が不正: ' + state.winner);
    var els = h.elements;
    var resultVisible = ['screen-over', 'screen-stage', 'screen-ending'].some(function (id) {
      return els[id] && els[id].classList.contains('visible');
    });
    h.assert(resultVisible, 'リザルト画面が出ていない');
    h.assert(els['screen-title'] && !els['screen-title'].classList.contains('visible'), 'タイトル画面が残っている');
    h.assert(els['you'] && els['you'].textContent === String(state.score.player), 'HUDの自分スコアが一致しない');
    h.assert(els['cpu'] && els['cpu'].textContent === String(state.score.cpu), 'HUDのCPUスコアが一致しない');
    h.assert(state.stage >= 0 && state.stage < state.stageTotal, 'ステージ番号が不正: ' + state.stage);
    h.assert(els['shots'] && els['shots'].textContent === 'STAGE ' + (state.stage + 1) + '/' + state.stageTotal + ' · KICK ' + state.shots, 'HUDのステージ/キック数が一致しない');
  },
  summary: function (state) {
    print('  最終: ' + state.score.player + ' - ' + state.score.cpu + ' / ' + state.winner + ' / KICK ' + state.shots);
  }
});
