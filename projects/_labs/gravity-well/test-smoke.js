/* test-smoke.js : GRAVITY WELL を game.js ごと起動し、AIで1プレイ完走する */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/gravity-well/engine.js']);
tryLoad(['audio.js', 'projects/_labs/gravity-well/audio.js']);

if (typeof window !== 'undefined') window.location = { search: '?seed=24681357' };
tryLoad(['game.js', 'projects/_labs/gravity-well/game.js']);

Harness.run({
  name: 'gravity-well',
  maxSteps: 30000,
  afterDone: 400,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.over === true, '自動プレイで終了しない: ' + state.phase);
    h.assert(state.phase === 'over' || state.phase === 'victory', '終了フェーズが不正: ' + state.phase);
    h.assert(state.result && state.result.score === state.score, '結果スコアが状態と不一致');
    h.assert(state.score > 0, 'スコアが0のまま: ' + state.score);
    h.assert(state.lines >= 0 && state.rotations >= 0, 'ライン/回転数が不正');
    h.assert(state.grid.length === 12 && state.grid[0].length === 12, '盤面が12x12でない');
    if (state.phase === 'victory') h.assert(state.timeLeft === 0, 'victory なのに残り時間がある');

    var els = h.elements;
    h.assert(els['start-overlay'] && !els['start-overlay'].classList.contains('visible'), '開始後もスタート画面が残る');
    h.assert(els['end-overlay'] && els['end-overlay'].classList.contains('visible'), 'エンド画面が表示されていない');
    h.assert(els['end-score'] && els['end-score'].textContent === String(state.score), 'エンドスコア表示が不一致');
    h.assert(els['hud'] && els['hud'].classList.contains('is-hidden'), '終了後もHUDが表示されている');
  },
  summary: function (state) {
    print('  score=' + state.score + ' / lines=' + state.lines +
      ' / rotations=' + state.rotations + ' / phase=' + state.phase);
  }
});
