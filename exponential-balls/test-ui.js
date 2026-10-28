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
function pointer(id, x, y) {
  var el = document.getElementById(id);
  var list = el.listeners.pointerdown || [];
  var event = { clientX: x, clientY: y, preventDefault: function () { } };
  for (var i = 0; i < list.length; i++) list[i](event);
}
function pointerMove(id, x, y) {
  var el = document.getElementById(id);
  var list = el.listeners.pointermove || [];
  var event = { clientX: x, clientY: y, preventDefault: function () { } };
  for (var i = 0; i < list.length; i++) list[i](event);
}
function pointerUp(id) {
  var el = document.getElementById(id);
  var list = el.listeners.pointerup || [];
  for (var i = 0; i < list.length; i++) list[i]({});
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

click('btn-home');
click('mode-race');
assert(text('btn-start') === 'START RACE' && hasClass('mode-race', 'selected'), 'RACEを選択できない');
click('btn-start');
assert(game.state.phase === 'playing' && game.state.mode === 'race', 'RACEで開始できない');
assert(text('mode-name') === 'RACE', 'HUDのモードがRACEでない');
assert(text('count-label') === 'ALIVE', 'RACEのカウントラベルがALIVEでない');
assert(text('count') === '20', 'RACEの初期球数が20でない: ' + text('count'));
assert(text('cycle') === 'TIME 0.0', 'HUDのTIME表示が不正: ' + text('cycle'));
assert(text('stat') === 'OUT 0', 'HUDのOUT表示が不正: ' + text('stat'));
assert(text('hint') === 'NO TAP · LAST BALL WINS', 'RACEのヒントが不正');

var raceBefore = JSON.stringify(game.getState().race.balls);
pointer('canvas', 450, 160);
assert(JSON.stringify(game.getState().race.balls) === raceBefore, 'RACEでタップ介入できてしまう');

game.updateRace(0.5, 1 / 60);
ui.update(game.getState());
assert(text('count') === '20', 'RACEの初期の生存数が変わった');

var guard = 0;
while (game.state.phase === 'playing' && guard < 6000) {
  game.updateRace(guard / 60, 1 / 60);
  guard += 1;
}
ui.render(game.getState());
assert(hasClass('result-overlay', 'visible'), 'RACE結果画面が出ていない');
assert(hasClass('start-overlay', 'visible') === false, '結果画面でスタート画面が残る');
assert(/^BALL \d+ WINS$/.test(text('result-title')), '勝者タイトルが不正: ' + text('result-title'));
assert(text('result-winner') === 'BALL ' + game.state.race.result.winnerId, '勝者表示が不正');
assert(text('result-sub') === '19 balls out. Last ball standing.', '結果サブが不正: ' + text('result-sub'));
assert(/s$/.test(text('result-time')), '勝者タイム表示が不正');

click('btn-race-again');
assert(game.state.phase === 'playing' && game.state.mode === 'race', 'RACE AGAINで再開できない');
assert(hasClass('result-overlay', 'visible') === false, '再開後も結果画面が残る');
assert(!hasClass('hud', 'is-hidden'), '再開後もHUDが隠れている');
assert(text('count') === '20', '再開後の初期球数が20でない');

click('btn-home');
assert(game.state.phase === 'start', 'RACE HOMEで戻れない');
assert(hasClass('start-overlay', 'visible'), 'RACE HOME後にスタート画面が出ない');
assert(text('btn-start') === 'START RACE', 'RACE HOME後の選択が保持されない');

click('mode-race3d');
assert(text('btn-start') === 'START 3D' && hasClass('mode-race3d', 'selected'), 'RACE 3Dを選択できない');
click('btn-start');
assert(game.state.phase === 'playing' && game.state.mode === 'race3d', 'RACE 3Dで開始できない');
assert(text('mode-name') === 'RACE 3D', 'HUDのモードがRACE 3Dでない');
assert(text('count-label') === 'ALIVE', 'RACE 3DのカウントラベルがALIVEでない');
assert(text('count') === '20', 'RACE 3Dの初期球数が20でない: ' + text('count'));
assert(text('cycle') === 'TIME 0.0', 'RACE 3DのTIME表示が不正');
assert(text('hint') === 'DRAG TO ORBIT · UP/DOWN TO TILT', 'RACE 3Dのヒントが不正');

var race3dBefore = JSON.stringify(game.getState().race3d.balls);
var camBefore = renderer.camera();
pointer('canvas', 450, 160);
pointerMove('canvas', 485, 205);
var camAfter = renderer.camera();
assert(camAfter.yaw !== camBefore.yaw || camAfter.elev !== camBefore.elev, 'RACE 3Dでドラッグしてもカメラが動かない');
pointerUp('canvas');
assert(JSON.stringify(game.getState().race3d.balls) === race3dBefore, 'RACE 3Dでドラッグ介入できてしまう');

game.updateRace3D(0.5, 1 / 60);
ui.update(game.getState());
assert(text('count') === '20', 'RACE 3Dの初期生存数が変わった');

var guard3d = 0;
while (game.state.phase === 'playing' && guard3d < 6000) {
  game.updateRace3D(guard3d / 60, 1 / 60);
  guard3d += 1;
}
ui.render(game.getState());
assert(hasClass('result-overlay', 'visible'), 'RACE 3Dの結果画面が出ていない');
assert(/^BALL \d+ WINS$/.test(text('result-title')), 'RACE 3Dの勝者タイトルが不正');
assert(text('result-winner') === 'BALL ' + game.state.race3d.result.winnerId, 'RACE 3Dの勝者表示が不正');
assert(/s$/.test(text('result-time')), 'RACE 3Dの勝者タイム表示が不正');

click('btn-race-again');
assert(game.state.phase === 'playing' && game.state.mode === 'race3d', 'RACE 3D AGAINで再開できない');
assert(hasClass('result-overlay', 'visible') === false, 'RACE 3D再開後も結果画面が残る');

click('btn-home');
assert(game.state.phase === 'start', 'RACE 3D HOMEで戻れない');
assert(text('btn-start') === 'START 3D', 'RACE 3D HOME後の選択が保持されない');

print('ui tests OK (' + passed + ' assertions)');
