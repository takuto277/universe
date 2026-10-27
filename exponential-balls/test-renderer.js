/* test-renderer.js : ボールの分裂・リセット・タップの描画状態（jsc で実行）
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
renderer.update(1 / 60, state);
renderer.draw(state, 4.1);
assert(renderer.state().length === 4, 'タップでボール数が変わる');

state = { count: 1, root: { hue: 268 }, reset: true, split: false, cycle: 1, bar: 0, beat: 0 };
renderer.sync(state);
renderer.update(1 / 60, state);
renderer.draw(state, 24);
assert(renderer.state().length === 1, 'リセットで1個に戻らない: ' + renderer.state().length);

state = { count: 8, root: { hue: 188 }, reset: false, split: false, cycle: 0, bar: 3, beat: 0 };
renderer.sync(state);
assert(renderer.state().length === 8, '時間ジャンプの補正で8個にならない: ' + renderer.state().length);

print('renderer tests OK (' + passed + ' assertions)');
