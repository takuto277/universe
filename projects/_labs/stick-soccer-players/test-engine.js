function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/stick-soccer-players/engine.js']);
var E = globalThis.StickSoccerPlayersEngine;
var passed = 0;
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

assert(E.FIELD.w > 300 && E.FIELD.h > 500, 'field size is wrong');
assert(E.OBSTACLES.length === 22, '22 characters expected: ' + E.OBSTACLES.length);
assert(E.OBSTACLES.filter(function (c) { return c.team === 'player'; }).length === 11, 'player team should have 11');
assert(E.OBSTACLES.filter(function (c) { return c.team === 'cpu'; }).length === 11, 'CPU team should have 11');
assert(E.FORMATION_SLOTS.length === 9, 'nine formation slots expected');
assert(E.FORMATION_LINES.length === 4 && E.CPU_LINES.length === 4, 'four lines expected');
assert(E.isValidFormation(E.DEFAULT_FORMATION), 'default formation should be legal');
assert(E.STAGES.length === 3, 'three stages expected');
for (var stage = 0; stage < E.STAGES.length; stage++) {
  assert(E.isValidFormation(E.STAGES[stage].cpuFormation), 'CPU formation should be legal');
  assert(E.STAGES[stage].cpuFormation.length === 11, 'CPU formation should have 11');
}
assert(!E.isValidFormation([{ line: 0, slot: 0 }, { line: 0, slot: 1 }]), 'adjacent players should be rejected');
assert(E.isValidFormation([{ line: 0, slot: 0 }, { line: 1, slot: 1 }]), 'different lines may share adjacent slots');

for (var aiStage = 1; aiStage < E.STAGES.length; aiStage++) {
  var prev = E.STAGES[aiStage - 1].ai;
  var next = E.STAGES[aiStage].ai;
  assert(next.search > prev.search, 'later stages should search more choices');
  assert(next.angleNoise < prev.angleNoise, 'later stages should aim more accurately');
  assert(next.mistake < prev.mistake, 'later stages should make fewer mistakes');
  assert(next.power > prev.power, 'later stages should shoot harder');
  assert(next.think < prev.think && next.aim < prev.aim, 'later stages should act faster');
}

var invalid = E.createGame({ formation: [{ line: 0, slot: 0 }, { line: 0, slot: 1 }] });
assert(invalid.chars.length === 22, 'invalid formation should fall back');
assert(invalid.chars.filter(function (c) { return c.team === 'player'; }).length === 11, 'fallback should restore player team');

var s = E.createGame();
assert(s.phase === 'aim' && s.turn === 'player' && s.shots === 0, 'initial state is wrong');
assert(s.ball.x === E.CENTER.x && s.ball.y === E.CENTER.y, 'ball should start at center');
assert(s.winScore === 3, 'win score should be 3');

var custom = E.createGame({ formation: [{ line: 0, slot: 4 }] });
assert(custom.chars.length === 12, 'custom player plus CPU count is wrong');
assert(custom.chars[0].x === E.FORMATION_SLOTS[4] && custom.chars[0].team === 'player', 'custom position is wrong');

var hit = E.createGame({ formation: [{ line: 0, slot: 4 }] });
var c = hit.chars[0];
c.x = E.CENTER.x;
c.y = E.CENTER.y + 70;
hit.ball.x = E.CENTER.x;
hit.ball.y = E.CENTER.y + 20;
assert(E.pullCharacter(hit, 0, 0, 50) === true, 'pull should launch a player');
assert(hit.phase === 'moving' && hit.shots === 1, 'launch should start movement');
for (var i = 0; i < 20; i++) E.update(hit, 1 / 60);
assert(hit.ball.vy < 0, 'launched player should knock the ball forward: ' + hit.ball.vy);
assert(Number.isFinite(hit.ball.vx) && Number.isFinite(hit.ball.vy), 'ball velocity should stay finite');

var ballPush = (1 + E.BALL_REST) / (1 + E.BALL_MASS / E.CHAR_MASS);
var charPush = (1 + E.CHAR_REST) / 2;
var ratio = charPush / ballPush;
assert(ratio > 0.3 && ratio < 0.36, 'character knockback should be about 1/3 of ball knockback: ' + ratio.toFixed(3));

var goal = E.createGame();
goal.ball.x = E.CENTER.x;
goal.ball.y = E.FIELD.y + 40;
goal.ball.vy = -600;
goal.phase = 'moving';
goal.shots = 1;
E.update(goal, 0.08);
assert(goal.score.player === 1 && goal.phase === 'goal', 'top goal should score for player');
for (i = 0; i < 120 && goal.phase === 'goal'; i++) E.update(goal, 1 / 60);
assert(goal.turn === 'cpu', 'conceding side should kick off');

var cpuGoal = E.createGame();
cpuGoal.ball.x = E.CENTER.x;
cpuGoal.ball.y = E.FIELD.bottom - 40;
cpuGoal.ball.vy = 600;
cpuGoal.phase = 'moving';
cpuGoal.shots = 1;
E.update(cpuGoal, 0.08);
assert(cpuGoal.score.cpu === 1 && cpuGoal.phase === 'goal', 'bottom goal should score for CPU');

var finish = E.createGame();
finish.score.player = 2;
finish.ball.x = E.CENTER.x;
finish.ball.y = E.FIELD.y + 40;
finish.ball.vy = -600;
finish.phase = 'moving';
E.update(finish, 0.08);
for (i = 0; i < 120 && finish.phase !== 'over'; i++) E.update(finish, 1 / 60);
assert(finish.phase === 'over' && finish.winner === 'player', 'first to 3 should finish');

var noLimit = E.createGame();
noLimit.score.player = 1;
noLimit.score.cpu = 2;
noLimit.shots = 30;
noLimit.turn = 'cpu';
noLimit.ball.vx = 300;
noLimit.phase = 'moving';
for (i = 0; i < 120 && noLimit.phase !== 'over'; i++) E.update(noLimit, 1 / 60);
assert(noLimit.phase !== 'over', 'kick count should not end a first-to-3 match');

var auto = E.createGame();
assert(E.autoShot(auto, 'player') === true, 'auto shot should launch a player');
assert(auto.phase === 'moving' && auto.shots === 1, 'auto shot state is wrong');

var plan = E.choosePlan(E.createGame({ stage: 2 }), 'cpu');
assert(plan && plan.charIndex >= 0 && plan.charIndex < 22, 'CPU plan character is invalid');
assert(Number.isFinite(plan.vx) && Number.isFinite(plan.vy), 'CPU plan velocity is invalid');
var planChar = E.createGame({ stage: 2 }).chars[plan.charIndex];
assert(planChar.team === 'cpu', 'CPU plan should use a CPU character');

var paused = E.createGame();
E.setPaused(paused, true);
var before = { x: paused.ball.x, y: paused.ball.y };
E.update(paused, 0.1);
assert(paused.ball.x === before.x && paused.ball.y === before.y, 'paused game should not update');
assert(E.getState(paused).paused === true, 'paused state should be exposed');

print('engine tests OK (' + passed + ' アサーション)');
