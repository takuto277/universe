/* test-tutorial.js : チュートリアルを最後まで進められるか（jsc で実行） */
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

var GAME = globalThis.__GAME__;
var sawSwitch = false;
var sawCross = false;
var sawItem = false;
var sawTarget = false;
var sawPanelTop = false;
GAME.start = GAME.startTutorial;
GAME.autoPlayStep = function () {
  var state = GAME.getState();
  var visual = document.getElementById('tutorial-visual');
  var html = visual ? visual.innerHTML : '';
  if (state && state.tutorial && state.tutorial.step === 0) {
    sawSwitch = html.indexOf('キー / 画面下のボタンで切替') >= 0;
    var slot = document.getElementById('slot-1');
    sawTarget = !!(slot && slot.classList.contains('tutorial-target'));
    if (slot && slot.listeners.click && slot.listeners.click[0]) slot.listeners.click[0]();
  } else if (state && state.tutorial && state.tutorial.step === 1) {
    sawCross = html.indexOf('CROSS!') >= 0;
  } else if (state && state.tutorial && state.tutorial.step === 2) {
    sawItem = html.indexOf('GET') >= 0;
    sawPanelTop = document.getElementById('tutorial-panel').classList.contains('tutorial-top');
    var down = document.getElementById('slot-2');
    if (down && down.listeners.click && down.listeners.click[0]) down.listeners.click[0]();
  }
};
GAME.isDone = function () {
  var state = GAME.getState();
  return !!(state && state.tutorial && state.tutorial.completed);
};

Harness.run({
  name: 'graph-cross-tutorial',
  maxSteps: 2000,
  afterDone: 50,
  check: function (state, h) {
    var els = h.elements;
    h.assert(state && state.tutorial && state.tutorial.completed, 'チュートリアルが完了しない');
    h.assert(state.phase === 'tutorialDone', 'チュートリアル完了後のフェーズが不正: ' + (state && state.phase));
    h.assert(state.score > 0, 'チュートリアル中にスコアが入っていない');
    h.assert(els['tutorial-panel'] && !els['tutorial-panel'].classList.contains('hidden'), 'チュートリアルパネルが消えている');
    h.assert(els['btn-tutorial-start'] && !els['btn-tutorial-start'].classList.contains('hidden'), '開始ボタンが出ていない');
    h.assert(els['btn-tutorial-skip'] && els['btn-tutorial-skip'].classList.contains('hidden'), 'スキップボタンが残っている');
    h.assert(els['tutorial-count'] && els['tutorial-count'].textContent === 'READY', '完了表示がREADYでない');
    h.assert(els['tutorial-title'] && els['tutorial-title'].textContent === '準備完了', '完了タイトルが不正');
    h.assert(els['tutorial-visual'] && els['tutorial-visual'].innerHTML.indexOf('READY') >= 0, '完了時の図解がない');
    h.assert(sawSwitch && sawCross && sawItem, '各ステップの図解が表示されない');
    h.assert(sawPanelTop, 'アイテムステップでパネルが上部に移動していない');
    h.assert(sawTarget, '押すボタンが強調されていない');
    h.assert(!document.getElementById('slot-1').classList.contains('tutorial-target'), '完了後もボタン強調が残っている');
  },
  summary: function (state) {
    print('  最終: チュートリアル完了 / ' + state.score + '点 / ' + state.time.toFixed(1) + '秒');
  }
});
