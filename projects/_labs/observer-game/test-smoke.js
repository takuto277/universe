/* test-smoke.js : 観測者の1ラン自動プレイ（jsc で実行）
 * 実行例:
 *   cd projects/_labs/observer-game && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/observer-game/engine.js']);
tryLoad(['audio.js', 'projects/_labs/observer-game/audio.js']);
tryLoad(['ui.js', 'projects/_labs/observer-game/ui.js']);
tryLoad(['game.js', 'projects/_labs/observer-game/game.js']);

Harness.run({
  name: 'observer-game',
  maxSteps: 3000,
  afterDone: 400,
  check: function (state, h) {
    if (!state || !state.over) { h.assert(false, '終了していない'); return; }
    h.assert(state.phase === 'ending', 'エンド画面待ちでない: ' + state.phase);
    h.assert(state.rank === 'S', 'S評価でない: ' + state.rank);
    h.assert(state.correct === 10, '正解が10でない: ' + state.correct);
    h.assert(state.observations === 2 && state.misses === 0 && state.lives === 3, '観測/ミス/ライフが不正');
    h.assert(state.score === 109, 'スコアが109でない: ' + state.score);
    h.assert(state.rulesEncountered.length >= 1, '出会ったルールがない');
    h.assert(state.rule === undefined, 'getStateが現在ルールを漏らしている');
    h.assert(state.options.length === 0 && !state.canObserve, '終了後も操作できる');
    var els = h.elements;
    h.assert(els['ending-overlay'] && els['ending-overlay'].classList.contains('visible'), 'エンド画面が表示されていない');
    h.assert(els['start-overlay'] && !els['start-overlay'].classList.contains('visible'), 'スタート画面が残っている');
    h.assert(els['turn'] && els['turn'].textContent === '終了', 'HUDのターンが終了でない');
    h.assert(els['correct'] && els['correct'].textContent === '10', 'HUDの正解が10でない');
    h.assert(els['best-label-end'] && els['best-label-end'].textContent.indexOf('更新') < 0, 'localStorageなしで自己ベスト更新と表示している');
  },
  summary: function (state) {
    print('  評価=' + state.rank + ' / スコア=' + state.score +
      ' / 正解=' + state.correct + ' / 観測=' + state.observations +
      ' / ミス=' + state.misses + ' / ルール=' + state.rulesEncountered.length);
  }
});
