function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/stick-soccer/engine.js']);
var E = globalThis.StickSoccerEngine;
var passed = 0;
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

assert(E.FIELD.w > 300 && E.FIELD.h > 500, 'field size is wrong');
assert(E.OBSTACLES.length === 22, '22 stick obstacles expected: ' + E.OBSTACLES.length);
assert(E.DEFAULT_FORMATION.length === 11, 'default formation should have 11 players');
assert(E.FORMATION_LINES.length === 4 && E.CPU_LINES.length === 4, 'both teams should have 4 lines');
assert(E.FORMATION_SLOTS.length === 9, 'nine formation slots per line expected');
assert(E.isValidFormation(E.DEFAULT_FORMATION), 'default formation should be legal');
assert(E.STAGES.length === 3, 'three stages expected');
assert(E.STAGES[0].cpuFormation.length === 11 && E.STAGES[1].cpuFormation.length === 11 && E.STAGES[2].cpuFormation.length === 11, 'each CPU formation should have 11 players');
for (var stageFormation = 0; stageFormation < E.STAGES.length; stageFormation++) {
  assert(E.isValidFormation(E.STAGES[stageFormation].cpuFormation), 'CPU stage formation should not have adjacent players');
}
assert(E.isValidFormation([{ line: 0, slot: 0 }, { line: 0, slot: 2 }]), 'two-slot spacing should be legal');
assert(!E.isValidFormation([{ line: 0, slot: 0 }, { line: 0, slot: 1 }]), 'adjacent players in one line should be illegal');
assert(E.isValidFormation([{ line: 0, slot: 0 }, { line: 1, slot: 1 }]), 'adjacent slots in different lines should be legal');
assert(!E.isValidFormation([{ line: 0, slot: 0 }, { line: 0, slot: 0 }]), 'duplicate formation positions should be illegal');
assert(!E.isValidFormation([{ line: 9, slot: 0 }]), 'invalid line should be illegal');

var invalid = E.createGame({ formation: [{ line: 0, slot: 0 }, { line: 0, slot: 1 }] });
assert(invalid.obstacles.length === 22, 'invalid formation should fall back to the default');
assert(invalid.obstacles.filter(function (p) { return p.team === 'player'; }).length === 11, 'fallback should restore 11 players');
assert(E.TURNS === 12 && E.WIN_SCORE === 3, 'turn or win limit is wrong');

var custom = E.createGame({ formation: [{ line: 0, slot: 2 }, { line: 2, slot: 0 }] });
assert(custom.obstacles.length === 13, 'custom player formation plus CPU count is wrong: ' + custom.obstacles.length);
assert(custom.obstacles[0].x === E.FORMATION_SLOTS[2] && custom.obstacles[1].y === E.FORMATION_LINES[2].y, 'custom formation positions are wrong');
assert(custom.obstacles[0].team === 'player' && custom.obstacles[2].team === 'cpu', 'obstacle teams are wrong');

var expectedLines = [[1, 4, 4, 2], [1, 3, 5, 2], [1, 4, 3, 3]];
for (var stageIndex = 0; stageIndex < E.STAGES.length; stageIndex++) {
  var stageGame = E.createGame({ stage: stageIndex });
  assert(stageGame.obstacles.length === 22, 'stage ' + (stageIndex + 1) + ' should have 22 obstacles');
  assert(stageGame.stage === stageIndex && stageGame.stageName === E.STAGES[stageIndex].name, 'stage metadata is wrong');
  var stageLines = [0, 0, 0, 0];
  for (var oi = 0; oi < stageGame.obstacles.length; oi++) {
    if (stageGame.obstacles[oi].team === 'cpu') stageLines[stageGame.obstacles[oi].line]++;
  }
  assert(stageLines.join('/') === expectedLines[stageIndex].join('/'), 'stage ' + (stageIndex + 1) + ' CPU lines are wrong: ' + stageLines.join('/'));
}
assert(E.createGame({ stage: 99 }).stage === 2, 'stage should clamp to the last stage');

var s = E.createGame();
var st = E.getState(s);
assert(st.phase === 'aim' && st.turn === 'player' && st.shots === 0, 'initial state is wrong');
assert(st.ball.x === E.CENTER.x && st.ball.y === E.CENTER.y, 'ball should start at center');
assert(st.score.player === 0 && st.score.cpu === 0, 'scores should start at zero');

assert(E.shootDrag(s, 0, 0) === false, 'zero drag should not shoot');
E.shootDrag(s, 0, E.MAX_PULL);
st = E.getState(s);
assert(st.phase === 'moving' && st.shots === 1, 'drag should shoot and count a kick');
assert(st.ball.vy < -500, 'dragging down should shoot upward: ' + st.ball.vy);
assert(Math.abs(st.ball.vx) < 1, 'straight drag should not add sideways speed');

var g = E.createGame();
g.ball.x = E.CENTER.x;
g.ball.y = E.FIELD.y + 40;
g.ball.vx = 0;
g.ball.vy = -600;
g.phase = 'moving';
g.shots = 1;
E.update(g, 0.08);
assert(g.score.player === 1 && g.phase === 'goal', 'top goal should score for player: ' + g.phase);
assert(g.goalSide === 'player', 'goal side should be player');
for (i = 0; i < 120 && g.phase === 'goal'; i++) E.update(g, 1 / 60);
assert(g.turn === 'cpu' && g.phase === 'cpuThink', 'conceding side should kick off after a goal: ' + g.turn + '/' + g.phase);

g = E.createGame();
g.ball.x = E.CENTER.x;
g.ball.y = E.FIELD.bottom - 40;
g.ball.vx = 0;
g.ball.vy = 600;
g.phase = 'moving';
g.shots = 1;
E.update(g, 0.08);
assert(g.score.cpu === 1 && g.phase === 'goal', 'bottom goal should score for cpu: ' + g.phase);
assert(g.goalSide === 'cpu', 'goal side should be cpu');

g = E.createGame();
g.ball.x = E.FIELD.x + 40;
g.ball.y = E.CENTER.y;
g.ball.vx = -600;
g.ball.vy = 0;
g.phase = 'moving';
g.shots = 1;
E.update(g, 0.1);
assert(g.ball.vx > 0, 'ball should bounce from the left wall');
assert(g.ball.x >= E.FIELD.x + E.BALL_R - 0.1, 'ball penetrated the wall');

g = E.createGame({ formation: [{ line: 0, slot: 2 }] });
var o = g.obstacles[0];
g.ball.x = o.x + o.r + E.BALL_R + 8;
g.ball.y = o.y;
g.ball.vx = -500;
g.ball.vy = 0;
g.phase = 'moving';
g.shots = 1;
E.update(g, 0.08);
assert(g.ball.vx > 0, 'ball should bounce from a stick obstacle: ' + g.ball.vx);

s = E.createGame();
E.shootDrag(s, 90, 0);
for (var i = 0; i < 600 && s.phase === 'moving'; i++) E.update(s, 1 / 60);
assert(s.phase !== 'moving', 'shot should eventually stop');
assert(s.turn === 'cpu' || s.phase === 'goal' || s.phase === 'over', 'turn should switch after a shot: ' + s.turn + '/' + s.phase);

s = E.createGame();
s.score.player = 2;
s.ball.x = E.CENTER.x;
s.ball.y = E.FIELD.y + 40;
s.ball.vy = -600;
s.phase = 'moving';
s.shots = 1;
E.update(s, 0.08);
assert(s.phase === 'goal', 'third goal should enter goal phase');
for (i = 0; i < 120 && s.phase !== 'over'; i++) E.update(s, 1 / 60);
assert(s.phase === 'over' && s.winner === 'player', '3 goals should finish the game: ' + s.winner);

s = E.createGame();
s.score.player = 1;
s.score.cpu = 2;
s.shots = E.TURNS;
s.ball.vx = 300;
s.ball.vy = 0;
s.phase = 'moving';
E.update(s, 0.05);
for (i = 0; i < 120 && s.phase !== 'over'; i++) E.update(s, 1 / 60);
assert(s.phase === 'over' && s.winner === 'cpu', 'turn limit should resolve by score: ' + s.winner);

s = E.createGame();
s.score.player = 1;
s.score.cpu = 1;
s.shots = E.TURNS;
s.ball.vx = 300;
s.ball.vy = 0;
s.phase = 'moving';
E.update(s, 0.05);
for (i = 0; i < 120 && s.phase !== 'over'; i++) E.update(s, 1 / 60);
assert(s.phase === 'over' && s.winner === 'draw', 'tied turn limit should be a draw: ' + s.winner);

s = E.createGame();
var fixed = function () { return 0.5; };
var planA = E.chooseShot(s, 'player', fixed);
var planB = E.chooseShot(s, 'player', fixed);
assert(planA && isFinite(planA.vx) && isFinite(planA.vy), 'AI shot is invalid');
assert(planA.vx === planB.vx && planA.vy === planB.vy, 'fixed RNG should make AI shots deterministic');
var aiSpeed = Math.sqrt(planA.vx * planA.vx + planA.vy * planA.vy);
assert(aiSpeed <= E.MAX_PULL * E.PULL_POWER + 0.001, 'AI shot should respect max pull power: ' + aiSpeed);
var sim = E.simulateShot(s, planA.vx, planA.vy);
assert(sim && typeof sim.goal !== 'undefined', 'shot simulation failed');

s = E.createGame();
s.phase = 'aim';
s.turn = 'player';
assert(E.autoShot(s, 'player') === true, 'auto shot did not fire');
assert(s.phase === 'moving' && s.shots === 1, 'auto shot state is wrong');

print('engine tests OK (' + passed + ' アサーション)');
