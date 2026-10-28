/* test-smoke.js : 1試合を自動プレイで完走させるスモークテスト（jsc で実行）
 * 実行例:
 *   cd universe && jsc janken-game/test-smoke.js
 *   cd projects/_samples/janken-game && jsc test-smoke.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_samples/janken-game/engine.js']);
tryLoad(['renderer.js', 'projects/_samples/janken-game/renderer.js']);
tryLoad(['game.js', 'projects/_samples/janken-game/game.js']);

var E = (typeof JankenEngine !== 'undefined') ? JankenEngine : null;

/* 結果画面の履歴に並んでいる行(ラウンド番号と中身)を取り出す */
function parseEndHistory(html) {
  var rows = [];
  var re = /data-round="(\d+)"[\s\S]*?<\/li>/g;
  var m;
  while ((m = re.exec(html || '')) !== null) {
    rows.push({ round: Number(m[1]), html: m[0] });
  }
  return rows;
}

Harness.run({
  name: 'janken-game',
  maxSteps: 20000,
  afterDone: 400,
  check: function (state, h) {
    if (!state || !state.over) { h.assert(false, '試合が終了していない'); return; }
    h.assert(state.phase === 'over', 'エンド画面待ちのまま終わった: phase=' + state.phase);
    h.assert(state.winner === 'player' || state.winner === 'cpu', '勝者が決まっていない: ' + state.winner);
    if (state.winner === 'player') h.assert(state.hp.cpu === 0, 'CPUのHPが0でない: ' + state.hp.cpu);
    if (state.winner === 'cpu') h.assert(state.hp.player === 0, 'あなたのHPが0でない: ' + state.hp.player);
    h.assert(state.history.length >= 1, 'ラウンド履歴が空');
    h.assert(state.gauge >= 0 && state.gauge <= state.gaugeMax, 'ゲージが範囲外: ' + state.gauge);
    var last = state.history[state.history.length - 1];
    h.assert(state.round === last.round + 1, 'roundカウンタ不整合: ' + state.round);
    var els = h.elements;
    h.assert(els['screen-end'] && els['screen-end'].classList.contains('visible'), 'エンド画面が表示されていない');
    h.assert(els['screen-start'] && !els['screen-start'].classList.contains('visible'), 'スタート画面が残っている');

    /* 結果画面には直近5ラウンド(それ未満なら全ラウンド)の手が並ぶ */
    var endHistory = els['end-history'];
    h.assert(endHistory, '結果画面の履歴要素がない');
    var rows = parseEndHistory(endHistory.innerHTML);
    var expectedCount = Math.min(5, state.history.length);
    h.assert(rows.length === expectedCount,
      '結果画面の履歴件数が想定と違う: ' + rows.length + ' (期待 ' + expectedCount + ')');
    var expectedEntries = state.history.slice(state.history.length - expectedCount);
    h.assert(rows.map(function (row) { return row.round; }).join(',') ===
      expectedEntries.map(function (entry) { return entry.round; }).join(','),
      '結果画面の履歴が直近のラウンドと違う');
    for (var r = 0; r < expectedEntries.length; r++) {
      var entry = expectedEntries[r];
      h.assert(rows[r].html.indexOf(E.HAND_MARKS[entry.player]) >= 0,
        'R' + entry.round + ' の自分の手が履歴にない');
      h.assert(rows[r].html.indexOf(E.HAND_MARKS[entry.cpu]) >= 0,
        'R' + entry.round + ' のCPUの手が履歴にない');
    }
  },
  summary: function (state) {
    print('  最終: あなた HP ' + state.hp.player + ' - CPU HP ' + state.hp.cpu +
      ' / 結果=' + state.winner + ' / ' + state.history.length + 'ラウンド / クセ=' + state.styleName);
  }
});
