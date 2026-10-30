function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/stick-colosseum/engine.js']);
var E = globalThis.StickColosseumEngine;
var passed = 0;
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

assert(E.CENTER.x === 240 && E.CENTER.y === 400, 'arena center is wrong');
assert(E.PRESETS.length === 3, 'three formation presets expected');
assert(E.STAGES.length === 3, 'three stages expected');
for (var i = 0; i < E.STAGES.length; i++) {
  assert(E.STAGES[i].radius > 150, 'arena radius is too small');
  assert(E.STAGES[i].cpuPreset, 'CPU preset is missing');
}
assert(E.PRESETS[0].spots.length === 5, 'each preset should have five spots');
for (i = 1; i < E.PRESETS.length; i++) {
  assert(E.PRESETS[i].spots.length === 5, 'each preset should have five spots');
}

var s = E.createGame();
assert(s.chars.length === 10, '10 characters expected');
assert(s.chars.filter(function (c) { return c.team === 'player'; }).length === 5, 'five player characters expected');
assert(s.chars.filter(function (c) { return c.team === 'cpu'; }).length === 5, 'five CPU characters expected');
assert(s.chars.every(function (c) { return c.guard === 1 && !c.out; }), 'all fighters should start with one guard');
assert(s.phase === 'aim' && s.turn === 'player' && s.score.player === 0 && s.score.cpu === 0, 'initial state is wrong');
assert(s.winScore === 3, 'win target should be 3 ringouts');

var launched = E.createGame();
var p = launched.chars[0];
assert(E.pullCharacter(launched, 0, 0, 50) === true, 'pull should launch a player');
assert(launched.phase === 'moving' && launched.shots === 1, 'launch should start movement');
assert(Math.abs(launched.chars[0].vy) > 100, 'launch should set character velocity');

var edge = E.createGame();
var e = edge.chars[0];
e.x = E.CENTER.x + edge.arenaRadius + 20;
e.vx = 400;
edge.phase = 'moving';
E.update(edge, 1 / 60);
assert(edge.phase !== 'ringout', 'guard should prevent an immediate ringout');
assert(edge.chars[0].guard === 0, 'guard should be consumed by the first edge contact');
assert(!edge.chars[0].out, 'guarded fighter should not be out');

var edge2 = E.createGame();
var e2 = edge2.chars[0];
e2.guard = 0;
e2.x = E.CENTER.x + edge2.arenaRadius + 20;
e2.vx = 400;
edge2.phase = 'moving';
E.update(edge2, 1 / 60);
assert(edge2.phase === 'ringout', 'unguarded edge contact should cause a ringout');
assert(edge2.score.cpu === 1, 'CPU should score when a player is ringed out');

var reset = E.createGame();
var r = reset.chars[0];
r.guard = 0;
r.x = E.CENTER.x + reset.arenaRadius + 20;
reset.phase = 'moving';
E.update(reset, 1 / 60);
for (i = 0; i < 90 && reset.phase === 'ringout'; i++) E.update(reset, 1 / 60);
assert(reset.phase === 'aim' && reset.turn === 'player', 'conceding side should take the next turn');
assert(reset.chars.filter(function (c) { return c.out; }).length === 1, 'ringed-out fighter should stay out');

var finish = E.createGame();
finish.score.player = 2;
var f = finish.chars[5];
f.guard = 0;
f.x = E.CENTER.x + finish.arenaRadius + 20;
finish.phase = 'moving';
E.update(finish, 1 / 60);
for (i = 0; i < 90 && finish.phase !== 'over'; i++) E.update(finish, 1 / 60);
assert(finish.phase === 'over' && finish.winner === 'player', 'first to 3 ringouts should finish');

for (i = 1; i < E.STAGES.length; i++) {
  var prev = E.STAGES[i - 1].ai;
  var next = E.STAGES[i].ai;
  assert(next.search >= prev.search, 'later stages should search more');
  assert(next.angleNoise < prev.angleNoise, 'later stages should aim more accurately');
  assert(next.mistake < prev.mistake, 'later stages should make fewer mistakes');
  assert(next.power > prev.power, 'later stages should hit harder');
  assert(next.think < prev.think && next.aim < prev.aim, 'later stages should act faster');
}

var auto = E.createGame();
assert(E.autoShot(auto, 'player') === true, 'auto shot should launch a player');
assert(auto.phase === 'moving' && auto.shots === 1, 'auto shot state is wrong');

var plan = E.choosePlan(E.createGame({ stage: 2 }), 'cpu');
assert(plan && plan.charIndex >= 0 && plan.charIndex < 10, 'CPU plan character is invalid');
assert(Number.isFinite(plan.vx) && Number.isFinite(plan.vy), 'CPU plan velocity is invalid');
assert(E.createGame({ stage: 2 }).chars[plan.charIndex].team === 'cpu', 'CPU plan should use a CPU fighter');

var paused = E.createGame();
E.setPaused(paused, true);
var before = { x: paused.chars[0].x, y: paused.chars[0].y };
E.update(paused, 0.1);
assert(paused.chars[0].x === before.x && paused.chars[0].y === before.y, 'paused game should not update');

print('engine tests OK (' + passed + ' アサーション)');
