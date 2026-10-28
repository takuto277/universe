/* test-race-smoke.js : BLOOM RACE（20球・ノータップ・最後の1球）の自動再生
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
    h.assert(state.race.alive === 1 && state.race.balls.length === 1, '最後の1球になっていない');
    h.assert(state.race.eliminated === 19, '19球が脱落していない: ' + state.race.eliminated);
    h.assert(state.race.result.winnerId >= 1 && state.race.result.winnerId <= 20, '勝者IDが不正');
    h.assert(state.race.result.time > 0, '勝者タイムが不正');
    var els = h.elements;
    h.assert(els['start-overlay'] && !els['start-overlay'].classList.contains('visible'), 'スタート画面が残っている');
    h.assert(els['result-overlay'] && els['result-overlay'].classList.contains('visible'), '結果画面が出ていない');
    h.assert(els['result-title'] && els['result-title'].textContent.indexOf('BALL ') === 0, '勝者タイトルが不正: ' + (els['result-title'] ? els['result-title'].textContent : 'null'));
    h.assert(els['result-winner'] && els['result-winner'].textContent.indexOf('BALL ') === 0, '勝者表示が不正');
    h.assert(els['result-sub'] && els['result-sub'].textContent === '19 balls out. Last ball standing.', '結果サブが不正');
    h.assert(els['result-time'] && /s$/.test(els['result-time'].textContent), '勝者タイム表示が不正');
    h.assert(els['mode-name'] && els['mode-name'].textContent === 'RACE', 'HUDのモードがRACEでない');
  },
  summary: function (state) {
    print('  mode=' + state.mode + ' / winner=BALL ' + state.race.result.winnerId +
      ' / time=' + state.race.result.time.toFixed(1) + 's / eliminated=' + state.race.eliminated);
  }
});
