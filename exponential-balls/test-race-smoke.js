/* test-race-smoke.js : BLOOM RACE（縦下り・3ゲート・ゴースト）の自動再生
 * 実行例:
 *   cd exponential-balls && jsc test-race-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'exponential-balls/engine.js']);
tryLoad(['audio.js', 'exponential-balls/audio.js']);
tryLoad(['renderer.js', 'exponential-balls/renderer.js']);
tryLoad(['ui.js', 'exponential-balls/ui.js']);
tryLoad(['game.js', 'exponential-balls/game.js']);

if (!globalThis.__GAME__ || typeof globalThis.__GAME__.startRace !== 'function') {
  throw new Error('startRace がない');
}
globalThis.__GAME__.start = globalThis.__GAME__.startRace;

Harness.run({
  name: 'exponential-balls race',
  maxSteps: 5000,
  afterDone: 0,
  check: function (state, h) {
    if (!state || state.phase !== 'finished') { h.assert(false, 'レースが終了していない'); return; }
    h.assert(state.mode === 'race', 'RACEモードでない: ' + state.mode);
    h.assert(state.race && state.race.result, 'レース結果がない');
    h.assert(state.race.result.status === 'win', '自動走行でゴーストに勝てない: ' + state.race.result.status);
    h.assert(state.race.gatesPassed === 3, '3ゲートを通過していない: ' + state.race.gatesPassed);
    h.assert(state.race.result.time < state.race.result.ghostTime, 'タイムがゴーストより遅い');
    h.assert(state.race.ghost.finished || state.race.ghost.time == null, 'ゴースト状態が不正');
    var els = h.elements;
    h.assert(els['start-overlay'] && !els['start-overlay'].classList.contains('visible'), 'スタート画面が残っている');
    h.assert(els['result-overlay'] && els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-title'] && els['result-title'].textContent === 'YOU WIN', '結果タイトルが不正: ' + (els['result-title'] ? els['result-title'].textContent : 'null'));
    h.assert(els['result-time'] && /s$/.test(els['result-time'].textContent), '自分のタイム表示が不正');
    h.assert(els['result-ghost'] && /s$/.test(els['result-ghost'].textContent), 'ゴーストのタイム表示が不正');
    h.assert(els['mode-name'] && els['mode-name'].textContent === 'RACE', 'HUDのモードがRACEでない');
  },
  summary: function (state) {
    print('  mode=' + state.mode + ' / status=' + state.race.result.status +
      ' / time=' + state.race.result.time.toFixed(1) + 's / ghost=' + state.race.result.ghostTime.toFixed(1) + 's' +
      ' / gates=' + state.race.gatesPassed);
  }
});
