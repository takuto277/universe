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

assert(E.STAGES.length === 3, 'three stages expected');
for (var i = 0; i < E.STAGES.length; i++) {
  assert(E.STAGES[i].length > 4000, 'stage should be long enough');
  assert(E.STAGES[i].time > 20, 'stage should have time');
  assert(E.STAGES[i].obstacles.length > 5, 'stage should have obstacles');
  assert(E.STAGES[i].milk.length > 0, 'stage should have milk');
}
var s = E.createGame();
assert(s.phase === 'playing' && s.stage === 0 && s.time === E.STAGES[0].time, 'initial state is wrong');
assert(s.chair.x === 240 && s.chair.y === 0, 'chair should start at the start line');
assert(s.chair.speed > 0, 'chair should start moving');
assert(E.getState(s).progress === 0, 'start progress should be zero');

var steer = E.createGame();
var x0 = steer.chair.x;
E.setSteer(steer, 1);
for (i = 0; i < 20; i++) E.update(steer, 1 / 60);
assert(steer.chair.x > x0, 'right steer should move right: ' + steer.chair.x);
assert(Math.abs(steer.chair.vx) > 1, 'steering should create lateral velocity');

var wall = E.createGame();
wall.chair.x = E.trackCenter(E.STAGES[0], 0) - E.STAGES[0].halfWidth - 100;
wall.chair.vx = -500;
E.update(wall, 1 / 60);
assert(wall.chair.x >= E.trackCenter(E.STAGES[0], wall.chair.y) - E.STAGES[0].halfWidth - 0.1, 'chair should stay inside the left wall');

var milk = E.createGame();
var m = milk.milks[0];
milk.chair.x = m.x;
milk.chair.y = m.wy;
var beforeTime = milk.time;
E.update(milk, 1 / 60);
assert(milk.milk === 1 && milk.time > beforeTime, 'milk should add time');
assert(m.taken, 'milk should be marked taken');

var finish = E.createGame();
finish.chair.y = -E.STAGES[0].length + 2;
E.update(finish, 1 / 60);
assert(finish.phase === 'clear' && finish.finishTime > 0, 'finish line should clear the stage');

var timeout = E.createGame();
timeout.time = 0.01;
E.update(timeout, 1 / 60);
assert(timeout.phase === 'over' && timeout.reason === 'timeup', 'time out should end the stage');

var pause = E.createGame();
E.setSteer(pause, 1);
E.setPaused(pause, true);
var px = pause.chair.x;
E.update(pause, 0.2);
assert(pause.chair.x === px, 'paused game should not move');

var drift = E.createGame();
drift.chair.speed = 300;
drift.chair.vx = 120;
drift.chair.steer = 1;
for (i = 0; i < 40; i++) E.update(drift, 1 / 60);
assert(drift.drift >= 0, 'drift gauge should be valid');
assert(isFinite(drift.chair.x) && isFinite(drift.chair.speed), 'physics should remain finite');

var state = E.getState(E.createGame({ stage: 2 }));
assert(state.stage === 2 && state.stageTotal === 3, 'stage metadata is wrong');
assert(state.centerX > 0 && state.halfWidth > 0, 'track state is missing');

print('engine tests OK (' + passed + ' アサーション)');
