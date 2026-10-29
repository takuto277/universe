function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['../../../tools/harness.js', 'tools/harness.js']);
tryLoad(['engine.js', 'projects/_labs/stick-soccer-players/engine.js']);
tryLoad(['game.js', 'projects/_labs/stick-soccer-players/game.js']);

var passed = 0;
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

var G = globalThis.__GAME__;
assert(G && G.start, 'game API is missing');
G.start();
var state = G.getState();
var player = null;
for (var i = 0; i < state.chars.length; i++) {
  if (state.chars[i].team === 'player') { player = state.chars[i]; break; }
}
assert(player, 'player character is missing');
var canvas = document.getElementById('game');
var rect = canvas.getBoundingClientRect();
function screen(x, y) { return { x: rect.left + x / 480 * rect.width, y: rect.top + y / 800 * rect.height }; }
function pointerEvent(type, x, y) {
  return { type: type, pointerId: 1, clientX: x, clientY: y, preventDefault: function () { } };
}
var start = screen(player.x - 16, player.y - 18);
var end = screen(player.x + 34, player.y - 18);
var listeners = canvas.listeners;
assert(listeners.pointerdown && listeners.pointermove && listeners.pointerup, 'pointer listeners are missing');
listeners.pointerdown[0](pointerEvent('pointerdown', start.x, start.y));
listeners.pointermove[0](pointerEvent('pointermove', end.x, end.y));
listeners.pointerup[0](pointerEvent('pointerup', end.x, end.y));
state = G.getState();
assert(state.phase === 'moving', 'drag should launch the player: ' + state.phase);
var launched = state.chars[player.index];
assert(launched.vx < 0, 'launch should point opposite the drag x: ' + launched.vx);
assert(launched.vy > 0, 'launch should include the offset drag component: ' + launched.vy);
assert(Math.abs(launched.vy) > 1, 'offset touch should change launch direction');

print('aim tests OK (' + passed + ' アサーション)');
