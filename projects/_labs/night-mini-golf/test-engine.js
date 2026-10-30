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
var s = E.createGame({ stage: 0, hole: 0 });
assert(s.phase === 'aim' && s.strokes === 0, 'initial state is wrong');
assert(s.ball.x === s.tee.x && s.ball.y === s.tee.y, 'ball should start at tee');
assert(E.shootDrag(s, 0, 0) === false, 'zero drag should not shoot');
E.shootDrag(s, 0, 60);
assert(s.phase === 'moving' && s.strokes === 1, 'drag should shoot and count');
for (i = 0; i < 600 && s.phase === 'moving'; i++) E.update(s, 1 / 60);
assert(s.phase !== 'moving', 'ball should stop');

var wall = E.createGame({ stage: 0, hole: 0 });
wall.ball.x = E.FIELD.x + 20;
wall.ball.y = 300;
wall.ball.vx = -500;
wall.ball.vy = 0;
wall.phase = 'moving';
wall.strokes = 1;
E.update(wall, 0.08);
assert(wall.ball.x >= E.FIELD.x + E.BALL_R - 0.1, 'ball should bounce from field edge');

var water = E.createGame({ stage: 2, hole: 0 });
water.ball.x = water.water[0].x + 10;
water.ball.y = water.water[0].y + 10;
water.ball.vx = 0;
water.ball.vy = 0;
water.phase = 'moving';
water.strokes = 1;
E.update(water, 0.05);
assert(water.strokes >= 2, 'water should add a penalty stroke');
assert(water.phase === 'aim' && water.ball.x === water.tee.x, 'water should reset ball to tee');

var sink = E.createGame({ stage: 0, hole: 0 });
sink.ball.x = sink.target.x;
sink.ball.y = sink.target.y + sink.target.r + 4;
sink.ball.vx = 0;
sink.ball.vy = -180;
sink.phase = 'moving';
sink.strokes = 1;
for (i = 0; i < 120 && sink.phase !== 'sunk'; i++) E.update(sink, 1 / 60);
assert(sink.phase === 'sunk', 'ball should sink in the cup');

for (h = 0; h < 3; h++) {
  var auto = E.createGame({ stage: 0, hole: h });
  var steps = 0;
  while (auto.phase !== 'sunk' && steps < 2000) {
    if (auto.phase === 'aim') E.autoShot(auto);
    E.update(auto, 1 / 60);
    steps++;
  }
  assert(auto.phase === 'sunk', 'auto shot should sink stage 1 hole ' + (h + 1));
}

var preview = E.previewDrag(s, 0, 60);
assert(preview.length > 2, 'trajectory preview should return points');

var rotor = E.createGame({ stage: 2, hole: 0 });
var beforeAngle = rotor.rotors[0].angle;
E.update(rotor, 0.2);
assert(rotor.rotors[0].angle !== beforeAngle, 'rotor should animate');

var state = E.getState(s);
assert(state.hole === 0 && state.holeTotal === 3 && state.par === 2, 'hole state is wrong');
assert(typeof state.stageName === 'string', 'stage name is missing');

print('engine tests OK (' + passed + ' アサーション)');
