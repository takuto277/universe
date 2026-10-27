/* test-renderer.js : AUTOの分裂・タップ・リセットとFRAME描画の検証（jsc で実行）
 * 実行例:
 *   cd exponential-balls && jsc test-renderer.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['../tools/harness.js', 'tools/harness.js']);
tryLoad(['renderer.js', 'exponential-balls/renderer.js']);

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}

var canvas = document.createElement('canvas');
var renderer = ExponentialRenderer.create(canvas);
assert(renderer && typeof renderer.sync === 'function', 'rendererを作れない');
assert(typeof renderer.drawFrame === 'function', 'drawFrameがない');

var state = { count: 1, root: { hue: 188 }, reset: true, split: false, cycle: 0, bar: 0, beat: 0 };
renderer.sync(state);
assert(renderer.state().length === 1, '初期のボールが1個でない: ' + renderer.state().length);

state = { count: 4, root: { hue: 210 }, reset: false, split: true, cycle: 0, bar: 2, beat: 0 };
renderer.sync(state);
renderer.update(1 / 60, state);
assert(renderer.state().length === 4, '分裂後のボールが4個でない: ' + renderer.state().length);

state = { count: 4, root: { hue: 210 }, reset: false, split: false, cycle: 0, bar: 2, beat: 1 };
renderer.sync(state);
renderer.update(1 / 60, state);
renderer.draw(state, 4);
assert(renderer.state().length === 4, '同数のsyncでボール数が変わる');

var tapped = renderer.state()[0];
var tapVx = tapped.vx;
var tapVy = tapped.vy;
renderer.tap(tapped.x + 20, tapped.y + 20);
assert(renderer.state()[0].vx !== tapVx || renderer.state()[0].vy !== tapVy, 'タップで近くのボールが押し返されない');

state = { count: 1, root: { hue: 268 }, reset: true, split: false, cycle: 1, bar: 0, beat: 0 };
renderer.sync(state);
renderer.update(1 / 60, state);
renderer.draw(state, 24);
assert(renderer.state().length === 1, 'リセットで1個に戻らない: ' + renderer.state().length);

state = { count: 8, root: { hue: 188 }, reset: false, split: false, cycle: 0, bar: 3, beat: 0 };
renderer.sync(state);
assert(renderer.state().length === 8, '時間ジャンプの補正で8個にならない: ' + renderer.state().length);

var frameState = {
  mode: 'frame', count: 2, root: { hue: 188 }, cycle: 0, bar: 0, beat: 0,
  line: { x: 55, y: 220, w: 280, h: 4 }, field: { w: 390, h: 844 },
  balls: [
    { x: 120, y: 380, vx: 30, vy: -10, hue: 188, depth: 0 },
    { x: 220, y: 320, vx: -20, vy: 14, hue: 210, depth: 2 }
  ],
  captureEvents: [{ x: 195, y: 220, hue: 188, reset: false }],
  frameReset: false
};
renderer.update(1 / 60, frameState);
renderer.drawFrame(frameState, 1);
assert(renderer.state().length === 8, 'FRAME描画でAUTOの状態が壊れる');

frameState.captureEvents = [{ x: 195, y: 220, hue: 188, reset: true }];
frameState.frameReset = true;
renderer.drawFrame(frameState, 1.1);

var raceState = {
  mode: 'race', root: { hue: 188 }, cycle: 0, bar: 0, beat: 0, field: { w: 390, h: 844 },
  race: {
    duration: 60, timeLeft: 59.4, finishY: 4200, worldHeight: 4200,
    trackLeft: 45, trackRight: 345, gapW: 110,
    player: { x: 195, y: 320, vx: 10, vy: 120, radius: 10 },
    ghost: { x: 195, y: 280, time: null, finished: false },
    gates: [
      { y: 1150, gapX: 105, gapW: 110, passed: false },
      { y: 2450, gapX: 270, gapW: 110, passed: false },
      { y: 3550, gapX: 170, gapW: 110, passed: false }
    ],
    gateIndex: 0, gatesPassed: 0, result: null, events: [], beatHit: false, tapCount: 0
  }
};
var beforeRace = renderer.state().length;
renderer.update(1 / 60, raceState);
renderer.drawRace(raceState, 1);
assert(renderer.state().length === beforeRace, 'RACE描画でAUTOの状態が壊れる');

raceState.race.player.y = 4190;
raceState.race.gates[0].passed = true;
raceState.race.captureEvents = [];
renderer.update(1 / 60, raceState);
renderer.drawRace(raceState, 23);

print('renderer tests OK (' + passed + ' assertions)');
