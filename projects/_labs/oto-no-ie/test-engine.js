function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['data.js', 'projects/_labs/oto-no-ie/data.js']);
tryLoad(['engine.js', 'projects/_labs/oto-no-ie/engine.js']);

var E = globalThis.OtoNoIeEngine;
var passed = 0;

function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}

function applySolution(game) {
  var sol = E.solutionFor(game.levelIndex);
  E.clearCharms(game);
  for (var i = 0; i < sol.length; i++) {
    assert(E.placeCharm(game, i, sol[i][0], sol[i][1]), 'solution charm ' + i + ' cannot be placed');
  }
  return sol;
}

assert(E.total === 5, '5 levels expected: ' + E.total);
for (var i = 0; i < E.total; i++) {
  var def = E.levels[i];
  assert(def.grid.length === 9, 'level height is not 9');
  for (var rr = 0; rr < def.grid.length; rr++) assert(def.grid[rr].length === 7, 'level width is not 7');
  assert(def.solution.length >= 1 && def.solution.length <= def.maxCharms, 'solution exceeds charms');
}

var g = E.createGame();
var st = E.getState(g);
assert(st.levelIndex === 0 && st.phase === 'build' && st.range === 3, 'initial level state is wrong');
assert(st.maxCharms === 3 && st.charms.length === 3, 'charm slots are wrong');
assert(st.levelTitle === 'はじまりの廊下', 'level title is wrong');

assert(!E.placeCharm(g, 0, 0, 0), 'charm placed on a wall');
assert(!E.placeCharm(g, 0, 1, 0), 'charm placed on the start');
assert(!E.placeCharm(g, 0, 5, 5), 'charm placed on the exit');
assert(E.placeCharm(g, 0, 4, 1), 'charm cannot be placed on floor');
assert(g.selectedSlot === 1, 'slot does not advance after placement');
assert(!E.placeCharm(g, 0, 2, 1), 'charm placed on an open door');
assert(E.removeCharmAt(g, 4, 1), 'charm cannot be removed');
assert(g.selectedSlot === 0 && g.charms[0] === null, 'remove does not clear the slot');

g = E.createGame();
var sol = applySolution(g);
var res = E.simulate(g);
assert(res.ok === true, 'level 1 solution fails: ' + res.reason);
assert(res.segments.length === 4, 'level 1 segment count is wrong');
assert(res.segments[0].type === 'charm' && res.segments[3].type === 'exit', 'level 1 segment types are wrong');
assert(res.segments[0].path.length === 4, 'first charm should be 4 steps away: ' + res.segments[0].path.length);

g = E.createGame();
E.loadLevel(g, 1);
sol = applySolution(g);
res = E.simulate(g);
assert(res.ok === true, 'glass level solution fails: ' + res.reason);
assert(res.segments[0].path.length > 10, 'glass route should go around the glass: ' + res.segments[0].path.length);
assert(E.soundCells(g.level, { r: sol[0][0], c: sol[0][1] }).some(function (c) {
  return c.r === g.level.start.r && c.c === g.level.start.c;
}), 'sound should pass through glass');

g = E.createGame();
sol = applySolution(g);
assert(E.run(g) !== null && g.phase === 'running', 'run does not enter running phase');
E.completeRun(g);
assert(g.phase === 'clear', 'level 1 should clear after run');
assert(E.getState(g).result.ok === true, 'result is not stored');
E.nextLevel(g);
assert(g.levelIndex === 1 && g.phase === 'build', 'nextLevel does not load level 2');
assert(g.charms.every(function (c) { return c === null; }), 'next level does not clear charms');

g = E.createGame();
E.clearCharms(g);
res = E.run(g);
assert(res.ok === false && res.reason === 'exit-unheard', 'empty level should fail with exit-unheard: ' + res.reason);
E.completeRun(g);
assert(g.phase === 'fail', 'failure phase is not set');
E.retry(g);
assert(g.phase === 'build' && g.result === null, 'retry does not return to build');

g = E.createGame();
for (i = 0; i < E.total; i++) {
  applySolution(g);
  assert(E.run(g).ok === true, 'level ' + i + ' solution fails');
  E.completeRun(g);
  if (i < E.total - 1) {
    assert(g.phase === 'clear', 'intermediate level should be clear: ' + i);
    E.nextLevel(g);
  } else {
    assert(g.phase === 'ending', 'final level should end the game: ' + g.phase);
    assert(E.getState(g).cleared === true, 'final state is not cleared');
  }
}

g = E.createGame();
E.placeCharm(g, 0, 4, 1);
E.setPaused(g, true);
assert(E.getState(g).paused === true, 'pause is not set');
assert(E.run(g) === null, 'can run while paused');
E.setPaused(g, false);
assert(E.selectSlot(g, 2) === undefined && g.selectedSlot === 2, 'slot selection failed');

print('engine tests OK (' + passed + ' アサーション)');
