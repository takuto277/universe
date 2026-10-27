/* test-smoke.js : 1回プレイして終了画面まで到達するスモークテスト（jsc で実行）
 * 実行例:
 *   cd universe && jsc graph-cross/test-smoke.js
 *   cd universe/graph-cross && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../tools/harness.js', 'tools/harness.js']);
tryLoad(['content.js', 'graph-cross/content.js']);
tryLoad(['balance.js', 'graph-cross/balance.js']);
tryLoad(['gacha.js', 'graph-cross/gacha.js']);
tryLoad(['engine.js', 'graph-cross/engine.js']);
tryLoad(['renderer.js', 'graph-cross/renderer.js']);
tryLoad(['ui.js', 'graph-cross/ui.js']);
tryLoad(['game.js', 'graph-cross/game.js']);

Harness.run({
  name: 'graph-cross',
  maxSteps: 20000,
  afterDone: 200,
  check: function (state, h) {
    if (!state) { h.assert(false, '状態が取得できない'); return; }
    h.assert(state.x > 0, 'xが進んでいない');
    h.assert(state.time > 0, 'プレイ時間が0');
    h.assert(state.best >= state.score, 'ベストがスコアより小さい');
    h.assert(state.maxCombo >= 0, '最大コンボが不正');
    h.assert(state.deck && state.deck.length === 3, 'デッキが3つでない');
    h.assert(state.deckParams && typeof state.deckParams === 'object', '係数パラメータがない');
    h.assert(state.stage >= 1, 'ステージ番号が不正');
    var els = h.elements;
    h.assert(els['btn-tutorial'], 'チュートリアルボタンがない');
    h.assert(els['tutorial-panel'] && els['tutorial-panel'].classList.contains('hidden'), 'チュートリアルパネルが残っている');
    h.assert(els['screen-start'] && !els['screen-start'].classList.contains('visible'), '開始画面が残っている');
    h.assert(els['score'] && els['score'].textContent === String(state.score), 'HUDのスコアが一致しない');
    if (state.stageCleared) {
      h.assert(state.phase === 'clear', 'ステージクリア画面待ちのまま: phase=' + state.phase);
      h.assert(state.boss === null, 'クリア後もボスが残っている');
      h.assert(els['screen-clear'] && els['screen-clear'].classList.contains('visible'), 'ステージクリア画面が出ていない');
    } else {
      h.assert(state.over === true, 'ライフが尽きていない');
      h.assert(state.phase === 'over', '終了画面待ちのまま: phase=' + state.phase);
      h.assert(state.deathCause === 'miss' || state.deathCause === 'bossEscape' || state.deathCause === 'bossAttack', '終了理由が不正: ' + state.deathCause);
      h.assert(state.hp === 0, 'HPが0でない: ' + state.hp);
      h.assert(els['screen-end'] && els['screen-end'].classList.contains('visible'), '終了画面が出ていない');
      h.assert(els['btn-retry'] && !els['btn-retry'].classList.contains('hidden'), 'ステージやり直しボタンが出ていない');
      h.assert(els['life'] && els['life'].textContent.indexOf('●') < 0, 'ライフ表示が0になっていない: ' + els['life'].textContent);
      var retry = els['btn-retry'];
      h.assert(retry.listeners.click && retry.listeners.click.length > 0, 'リトライのクリック配線がない');
      retry.listeners.click[0]({});
      var afterRetry = window.__GAME__.getState();
      h.assert(afterRetry.phase === 'run', 'リトライでステージ開始に戻らない: ' + afterRetry.phase);
      h.assert(afterRetry.hp > 0 && afterRetry.score === 0, 'リトライで開始時点が復元されない');
    }
  },
  summary: function (state) {
    print('  最終: ' + state.score + '点 / STAGE ' + state.stage + (state.stageCleared ? ' CLEAR' : '') +
      ' / x=' + state.x + ' / 最大コンボx' + state.maxCombo +
      ' / ' + state.time.toFixed(1) + '秒 / 交差' + state.hits + '回 / ミス' + state.misses + '回');
  }
});
