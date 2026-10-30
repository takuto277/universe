function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/night-mini-golf/engine.js']);
var E = globalThis.NightMiniGolfEngine;
var passed = 0;
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

assert(E.STAGES.length === 3, 'three stages expected');
for (var i = 0; i < E.STAGES.length; i++) {
  assert(E.STAGES[i].holes.length === 3, 'three holes per stage expected');
  for (var h = 0; h < 3; h++) assert(E.STAGES[i].holes[h].par >= 2, 'par is invalid');
}

var s = E.createGame();
assert(s.phase === 'aim' && s.turn === 'player', 'initial state is wrong');
assert(s.balls.player.x !== s.balls.cpu.x && s.balls.player.y === s.balls.cpu.y, 'both balls should start at the tee');
assert(s.strokes.player === 0 && s.strokes.cpu === 0, 'strokes should start at zero');
assert(Math.abs(s.target.x - 240) < 1, 'target is missing');
E.playerShoot(s, Math.PI / 2, 0.45);
assert(s.phase === 'moving' && s.strokes.player === 1, 'player shot should move the ball');
for (i = 0; i < 2000 && s.phase === 'moving'; i++) E.update(s, 1 / 60);
assert(s.phase === 'aim' && s.turn === 'cpu', 'turn should switch to CPU after player shot');

var cpu = E.createGame({ firstTurn: 'cpu' });
assert(cpu.turn === 'cpu', 'CPU should be able to start a hole');
assert(E.cpuShot(cpu) === true, 'CPU shot should fire');
assert(cpu.strokes.cpu === 1, 'CPU shot should count');
for (i = 0; i < 2000 && cpu.phase === 'moving'; i++) E.update(cpu, 1 / 60);
assert(cpu.phase === 'holeover' || (cpu.phase === 'aim' && cpu.turn === 'player'), 'CPU shot should resolve');

var sink = E.createGame();
sink.balls.player.x = sink.target.x;
sink.balls.player.y = sink.target.y + sink.target.r + 4;
sink.balls.player.vy = -180;
sink.phase = 'moving';
for (i = 0; i < 120 && sink.phase !== 'holeover'; i++) E.update(sink, 1 / 60);
assert(sink.phase === 'holeover' && sink.holeWinner === 'player', 'player should win the hole');

var water = E.createGame({ stage: 2, hole: 0 });
var waterArea = water.water[0];
water.balls.player.x = waterArea.x + waterArea.w / 2;
water.balls.player.y = waterArea.y + waterArea.h / 2;
water.phase = 'moving';
water.strokes.player = 1;
E.update(water, 1 / 60);
assert(water.strokes.player >= 2, 'water should add a penalty');
assert(water.balls.player.x !== water.balls.cpu.x, 'water should reset the player ball');

for (h = 0; h < 3; h++) {
  var auto = E.createGame({ stage: 0, hole: h });
  var steps = 0;
  while (auto.phase !== 'holeover' && steps < 3000) {
    if (auto.phase === 'aim') {
      if (auto.turn === 'player') E.autoShot(auto); else E.cpuShot(auto);
    }
    E.update(auto, 1 / 60);
    steps++;
  }
  assert(auto.phase === 'holeover', 'auto play should finish stage 1 hole ' + (h + 1));
}

var state = E.getState(s);
assert(state.balls && state.strokes && state.turn, 'match state is missing');
assert(state.par === 2 && state.hole === 0, 'hole metadata is wrong');

print('engine tests OK (' + passed + ' アサーション)');
