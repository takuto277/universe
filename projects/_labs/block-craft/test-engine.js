function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/block-craft/engine.js']);
var E = globalThis.BlockCraftEngine;
var passed = 0;
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

var g = E.createGame({ seed: 42 });
assert(g.phase === 'play', 'game should start in play phase');
assert(E.WORLD.x === 30 && E.WORLD.z === 30, 'world size is wrong');
assert(E.HOTBAR.length === 5, 'hotbar should have five blocks');
assert(g.position.y > 0 && g.position.y < E.WORLD.y, 'spawn height is invalid');
assert(E.getBlock(g.world, Math.floor(g.position.x), Math.floor(g.position.y) - 1, Math.floor(g.position.z)) !== 0, 'spawn should be on solid ground');

var found = 0;
for (var x = 0; x < E.WORLD.x; x++) for (var z = 0; z < E.WORLD.z; z++) {
  if (E.getBlock(g.world, x, 0, z) === E.BLOCKS.STONE) found++;
}
assert(found > 0, 'world should have stone below the surface');

var start = { x: g.position.x, y: g.position.y, z: g.position.z };
E.setInput(g, { forward: 1 });
for (var i = 0; i < 60; i++) E.update(g, 1 / 60);
assert(Math.abs(g.position.z - start.z) > 0.5 || Math.abs(g.position.x - start.x) > 0.5, 'forward input should move the player');
E.setInput(g, { forward: 0 });

g.position.y = g.spawn.y + 3;
g.velocity.y = 0;
for (i = 0; i < 240; i++) E.update(g, 1 / 60);
assert(g.onGround === true, 'player should land on solid ground');
assert(g.position.y > 0, 'player should not fall through the world');

var lookTarget = E.createGame({ seed: 42 });
lookTarget.pitch = -1.2;
var target = E.getTarget(lookTarget);
assert(target && target.type !== 0, 'looking down should hit a block');
assert(target.normal.y === 1, 'top face normal should point upward');
assert(E.mine(lookTarget) === true && E.getState(lookTarget).edits === 1, 'mine should remove the targeted block');
assert(E.getBlock(lookTarget.world, target.x, target.y, target.z) === 0, 'mined block should be air');

var placeGame = E.createGame({ seed: 9 });
E.setBlock(placeGame.world, 15, 11, 15, E.BLOCKS.STONE);
placeGame.position.x = 15.5; placeGame.position.y = 13.01; placeGame.position.z = 15.5;
placeGame.pitch = -1.55;
var placeTarget = E.getTarget(placeGame);
assert(placeTarget && placeTarget.type === E.BLOCKS.STONE, 'test block should be targetable');
E.setSelected(placeGame, 2);
assert(E.place(placeGame) === true, 'place should put a selected block beside the target');
var placed = E.getState(placeGame);
assert(placed.edits === 1 && placed.lastAction === 'place', 'place should be counted');
assert(E.getBlock(placeGame.world, placeTarget.x, placeTarget.y + 1, placeTarget.z) === E.BLOCKS.STONE, 'selected block should be placed');

E.look(g, 1, 0);
assert(Math.abs(g.yaw) > 0, 'look should rotate yaw');
var yaw0 = g.yaw;
E.look(g, 0, 10);
assert(g.pitch >= -1.35 && g.pitch <= 1.35, 'pitch should be clamped');
assert(g.yaw === yaw0, 'vertical look should not change yaw');

var state = E.getState(g);
assert(state.id === 'block-craft' && state.size.x === 30, 'state metadata is wrong');
assert(state.selectedName === E.BLOCK_INFO[E.HOTBAR[state.selected]].name, 'selected block name is wrong');

print('engine tests OK (' + passed + ' アサーション)');
