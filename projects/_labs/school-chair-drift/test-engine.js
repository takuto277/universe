function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/school-chair-drift/engine.js']);
var E = globalThis.SchoolChairDriftEngine;
var passed = 0;
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

assert(E.STAGES.length === 3, 'three courses expected');
assert(E.LAPS === 3, 'three laps expected');
for (var i = 0; i < E.STAGES.length; i++) {
  var st = E.STAGES[i];
  assert(st.halfWidth > 2, 'course width is too small');
  assert(st.obstacles.length > 5, 'course obstacles are missing');
  assert(st.itemBoxes.length > 3, 'item boxes are missing');
  var p0 = E.coursePoint(st, 0);
  var p1 = E.coursePoint(st, st.length);
  assert(Math.abs(p0.x - p1.x) < 0.001 && Math.abs(p0.z - p1.z) < 0.001, 'course should loop');
  var tan = E.courseTangent(st, 0);
  assert(Math.abs(Math.sqrt(tan.x * tan.x + tan.z * tan.z) - 1) < 0.001, 'course tangent should be normalized');
}

var s = E.createGame();
assert(s.racers.length === 4, 'four racers expected');
assert(s.racers[0].isPlayer && s.racers.filter(function (r) { return r.team === 'cpu'; }).length === 3, 'CPU racers are missing');
assert(s.phase === 'countdown' && s.countdown > 3, 'countdown should start the race');
assert(s.racers.some(function (r) { return r.lap === 0 && !r.finished; }), 'racers should start at the line');

var start = E.createGame();
for (i = 0; i < 220; i++) E.update(start, 1 / 60);
assert(start.phase === 'playing', 'countdown should release the race');

var steer = E.createGame();
steer.phase = 'playing';
E.setSteer(steer, 1);
for (i = 0; i < 30; i++) E.update(steer, 1 / 60);
assert(steer.racers[0].x > -1.35, 'steering should move the player right');

var box = E.createGame();
box.phase = 'playing';
box.racers[0].s = box.itemBoxes[0].s;
box.racers[0].x = box.itemBoxes[0].x;
E.update(box, 1 / 60);
assert(box.racers[0].item, 'item box should give an item');
assert(['milk', 'eraser', 'tray'].indexOf(box.racers[0].item) >= 0, 'item type is invalid');
assert(E.useItem(box, 'player') === true, 'player should use an item');
assert(!box.racers[0].item, 'used item should clear');

var lap = E.createGame();
lap.phase = 'playing';
lap.racers[0].lap = 2;
lap.racers[0].s = E.STAGES[0].length - 1;
lap.racers[0].speed = 30;
E.update(lap, 1 / 20);
assert(lap.racers[0].finished, 'third lap should finish');
assert(lap.phase === 'clear' && lap.place === 1, 'first-place finish should clear the course');

var second = E.createGame();
second.phase = 'playing';
second.racers[1].finished = true;
second.racers[1].finishOrder = 1;
second.finishCount = 1;
second.racers[0].lap = 2;
second.racers[0].s = E.STAGES[0].length - 1;
second.racers[0].speed = 30;
E.update(second, 1 / 20);
assert(second.phase === 'over' && second.place === 2, 'non-first finish should end the race');

var milk = E.createGame();
milk.phase = 'playing';
milk.racers[0].item = 'milk';
E.useItem(milk, 'player');
assert(milk.racers[0].boost > 0, 'milk should boost');

var trap = E.createGame();
trap.phase = 'playing';
trap.racers[0].item = 'eraser';
trap.racers[0].s = 20;
E.useItem(trap, 'player');
assert(trap.traps.length === 1, 'eraser should create a trap');

var timeout = E.createGame();
timeout.phase = 'playing';
timeout.raceTime = 260;
E.update(timeout, 1 / 60);
assert(timeout.phase === 'over' && timeout.reason === 'timeup', 'time limit should end the race');

var pause = E.createGame();
pause.phase = 'playing';
E.setPaused(pause, true);
var beforeS = pause.racers[0].s;
E.update(pause, 0.2);
assert(pause.racers[0].s === beforeS, 'paused race should not move');

var state = E.getState(start);
assert(state.racers.length === 4 && state.laps === 3, 'race state is missing');
assert(state.place >= 1 && state.place <= 4, 'place is invalid');
assert(state.player.item === null || typeof state.player.item === 'string', 'player item state is invalid');
assert(typeof state.stageName === 'string' && state.stageName.length > 0, 'stage name is missing');

print('engine tests OK (' + passed + ' アサーション)');
