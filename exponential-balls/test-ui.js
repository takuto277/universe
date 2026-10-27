/* test-ui.js : モード選択・START・HOME・HUDの検証（jsc で実行）
 * 実行例:
 *   cd exponential-balls && jsc test-ui.js
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

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}
function click(id) {
  var el = document.getElementById(id);
  var list = el.listeners.click || [];
  for (var i = 0; i < list.length; i++) list[i]({ preventDefault: function () { } });
}
function hasClass(id, name) {
  return document.getElementById(id).classList.contains(name);
}
function text(id) {
  return document.getElementById(id).textContent;
}

var game = ExponentialEngine.createGame();
var renderer = ExponentialRenderer.create(document.createElement('canvas'));
var ui = ExponentialUI.create(game, renderer);

assert(hasClass('start-overlay', 'visible'), '初期スタート画面が出ていない');
assert(hasClass('hud', 'is-hidden'), '初期HUDが表示されている');
assert(hasClass('mode-auto', 'selected'), 'AUTOが初期選択されていない');
assert(!hasClass('mode-frame', 'selected'), 'FRAMEが初期選択されている');
assert(text('mode-auto-state') === 'SELECTED' && text('mode-frame-state') === 'SELECT', '選択表示が不正');
assert(text('btn-start') === 'START AUTO', '開始ボタンがSTART AUTOでない: ' + text('btn-start'));

click('mode-frame');
assert(game.state.phase === 'start', 'モード選択だけで開始してしまう');
assert(hasClass('start-overlay', 'visible'), 'モード選択でスタート画面が消える');
assert(hasClass('mode-frame', 'selected') && !hasClass('mode-auto', 'selected'), 'FRAME選択が反映されない');
assert(text('mode-frame-state') === 'SELECTED' && text('mode-auto-state') === 'SELECT', 'FRAMEの選択表示が不正');
assert(text('btn-start') === 'START FRAME', '開始ボタンがSTART FRAMEでない: ' + text('btn-start'));

click('btn-start');
assert(game.state.phase === 'playing' && game.state.mode === 'frame', 'FRAMEで開始できない');
assert(!hasClass('start-overlay', 'visible'), '開始後もスタート画面が残る');
assert(!hasClass('hud', 'is-hidden'), '開始後もHUDが隠れている');
assert(text('mode-name') === 'FRAME', 'HUDのモードがFRAMEでない');
assert(text('stat') === 'DOUBLES 0', 'HUDのDOUBLESが0でない: ' + text('stat'));
assert(text('hint') === 'TOUCH THE LINE · TAP TO PUSH', 'FRAMEのヒントが不正');

game.updateFrame(0.1, 1 / 60);
ui.update(game.getState());
assert(text('stat') === 'DOUBLES 0', '更新後のDOUBLES表示が不正');

click('btn-home');
assert(game.state.phase === 'start', 'HOMEでホームに戻らない');
assert(hasClass('start-overlay', 'visible'), 'HOME後もスタート画面が隠れている');
assert(hasClass('hud', 'is-hidden'), 'HOME後もHUDが表示されている');
assert(renderer.state().length === 0, 'HOME後もAUTOのボールが残る');
assert(text('btn-start') === 'START FRAME' && hasClass('mode-frame', 'selected'), 'HOME後も選択が保持されない');

click('mode-auto');
assert(text('btn-start') === 'START AUTO' && hasClass('mode-auto', 'selected'), 'AUTOに選択し直せない');
click('btn-start');
assert(game.state.phase === 'playing' && game.state.mode === 'auto', 'AUTOで開始できない');
assert(text('mode-name') === 'AUTO', 'HUDのモードがAUTOでない');
assert(text('hint') === 'DOUBLE ON EVERY BAR · TAP TO PUSH', 'AUTOのヒントが不正');
assert(text('stat') === 'BAR 1 / 12', 'AUTOのバー表示が不正: ' + text('stat'));

game.update(0.1);
ui.update(game.getState());
assert(text('count') === '1', 'AUTOの初期カウントが1でない: ' + text('count'));

print('ui tests OK (' + passed + ' assertions)');
