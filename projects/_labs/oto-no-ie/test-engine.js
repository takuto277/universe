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
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

function applySolution(game) {
  var sol = E.solutionFor(game.levelIndex);
  E.clearItems(game);
  var i;
  for (i = 0; i < sol.bells.length; i++) {
    assert(E.placeItem(game, 'bell', i, sol.bells[i][0], sol.bells[i][1]), 'bell solution ' + i + ' cannot be placed');
  }
  for (i = 0; i < sol.mirrors.length; i++) {
    assert(E.placeItem(game, 'mirror', i, sol.mirrors[i][0], sol.mirrors[i][1]), 'mirror solution ' + i + ' cannot be placed');
  }
  return sol;
}

assert(E.total === 7, '7 levels expected: ' + E.total);
for (var i = 0; i < E.total; i++) {
  var def = E.levels[i];
  assert(def.grid.length === 9, 'level height is not 9');
  for (var rr = 0; rr < def.grid.length; rr++) assert(def.grid[rr].length === 7, 'level width is not 7');
  assert(def.solution.length >= 1 && def.solution.length <= (def.maxBells || 3), 'bell solution exceeds limit');
  assert((def.mirrorSolution || []).length <= (def.maxMirrors || 2), 'mirror solution exceeds limit');
}

var g = E.createGame();
var st = E.getState(g);
assert(st.levelIndex === 0 && st.phase === 'build' && st.range === 3, 'initial level state is wrong');
assert(st.maxBells === 3 && st.maxMirrors === 2, 'initial item limits are wrong');
assert(st.bells.length === 3 && st.mirrors.length === 2, 'initial item arrays are wrong');
assert(st.selected.type === 'bell' && st.selected.index === 0, 'initial selection is wrong');

assert(!E.placeItem(g, 'bell', 0, 0, 0), 'bell placed on a wall');
assert(!E.placeItem(g, 'bell', 0, 1, 0), 'bell placed on the start');
assert(E.placeItem(g, 'bell', 0, 4, 1), 'bell cannot be placed on floor');
assert(!E.placeItem(g, 'bell', 0, 2, 1), 'bell placed on an open door');
assert(E.removeItemAt(g, 4, 1), 'bell cannot be removed');
assert(g.bells[0] === null, 'remove does not clear the bell slot');

g = E.createGame();
applySolution(g);
var res = E.simulate(g);
assert(res.ok === true, 'level 1 solution fails: ' + res.reason);
assert(res.segments.length === 4, 'level 1 segment count is wrong');

g = E.createGame();
E.loadLevel(g, 1);
applySolution(g);
res = E.simulate(g);
assert(res.ok === true, 'glass level solution fails: ' + res.reason);
assert(res.segments[0].path.length > 10, 'glass route should go around the glass: ' + res.segments[0].path.length);
assert(E.soundCells(g, { r: 1, c: 4 }).some(function (c) {
  return c.r === g.level.start.r && c.c === g.level.start.c;
}), 'sound should pass through glass');

g = E.createGame();
E.loadLevel(g, 5);
assert(g.level.maxBells === 1 && g.level.maxMirrors === 2, 'mirror room limits are wrong');
assert(E.placeItem(g, 'bell', 0, 1, 5), 'mirror room bell cannot be placed');
assert(!E.placeItem(g, 'bell', 1, 2, 5), 'second bell should be rejected');
res = E.simulate(g);
assert(res.ok === false && res.reason === 'unheard', 'mirror room should be unheard without mirrors: ' + res.reason);
assert(E.placeItem(g, 'mirror', 0, 1, 3), 'first mirror cannot be placed');
res = E.simulate(g);
assert(res.ok === false && res.reason === 'exit-unheard', 'mirror room should need a second mirror: ' + res.reason);
assert(E.placeItem(g, 'mirror', 1, 4, 5), 'second mirror cannot be placed');
res = E.simulate(g);
assert(res.ok === true, 'two-mirror solution fails: ' + res.reason);

g = E.createGame();
E.loadLevel(g, 6);
applySolution(g);
res = E.simulate(g);
assert(res.ok === true, 'absorber room solution fails: ' + res.reason);
assert(E.cellAt(g.level, 2, 2) === 'A', 'absorber tile is missing');
assert(!E.soundCells(g, { r: 1, c: 5 }).some(function (c) { return c.r === 2 && c.c === 4; }), 'sound should not pass through a sound absorber');

g = E.createGame();
applySolution(g);
assert(E.run(g) !== null && g.phase === 'running', 'run does not enter running phase');
E.completeRun(g);
assert(g.phase === 'clear', 'level 1 should clear after run');
E.nextLevel(g);
assert(g.levelIndex === 1 && g.phase === 'build', 'nextLevel does not load level 2');

g = E.createGame();
E.clearItems(g);
res = E.run(g);
assert(res.ok === false && res.reason === 'exit-unheard', 'empty level should fail with exit-unheard');
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
E.selectItem(g, 'mirror', 0);
assert(g.selected.type === 'mirror' && g.selected.index === 0, 'mirror selection failed');
E.setPaused(g, true);
assert(E.getState(g).paused === true, 'pause is not set');
assert(E.run(g) === null, 'can run while paused');
E.setPaused(g, false);

print('engine tests OK (' + passed + ' アサーション)');
