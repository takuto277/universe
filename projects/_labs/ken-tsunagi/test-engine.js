function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['data.js', 'projects/_labs/ken-tsunagi/data.js']);
tryLoad(['engine.js', 'projects/_labs/ken-tsunagi/engine.js']);

var E = globalThis.KenTsunagiEngine;
var passed = 0;

function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}

function tickLoop(s, count, dt) {
  for (var i = 0; i < count; i++) E.tick(s, dt || 1 / 60);
  return s;
}

assert(E.total === 47, '47都道府県ではない: ' + E.total);
assert(E.regions.length === 8, '地方が8つではない');
for (var i = 0; i < E.prefectures.length; i++) {
  var p = E.prefectures[i];
  assert(p.rings.length > 0, p.label + ' の形がない');
  assert(p.circles.length > 0, p.label + ' の当たり判定がない');
  assert(p.center[0] >= 0 && p.center[0] <= E.data.mapW, p.label + ' のXが範囲外');
  assert(p.center[1] >= 0 && p.center[1] <= E.data.mapH, p.label + ' のYが範囲外');
  for (var j = 0; j < p.neighbors.length; j++) {
    var other = E.byCode[p.neighbors[j]];
    assert(other && other.neighbors.indexOf(p.code) >= 0, '隣接が片方向: ' + p.label);
  }
}
assert(E.byCode[1].neighbors.indexOf(2) >= 0, '北海道と青森がつながらない');
assert(E.byCode[47].neighbors.indexOf(46) >= 0, '沖縄と鹿児島がつながらない');

var s = E.createRun();
var st = E.getState(s);
assert(st.phase === 'run' && st.queueLength === 47 && st.activeCode === 1, '初期キューが不正');
assert(st.finishTimer === 0 && st.allDropped === false, '最初から60秒タイマーが動いている');
assert(st.hints === 3 && st.shakes === 3, 'ヒント・ゆらすの回数が不正');
assert(s.bodies.length === 0, '最初から箱に県がある');

E.setActiveX(s, 0.2);
assert(Math.abs(s.activeX - 0.2) < 0.2, 'アクティブ県のXを動かせない');
var dropped = E.dropActive(s);
assert(dropped && s.bodies.length === 1, '県を落とせない');
assert(s.queue.length === 46 && s.queue[0] === 2, '落とした後のキューが不正');
assert(s.dropped === 1, 'ドロップ数が不正');
tickLoop(s, 180);
var body = s.bodies[0];
assert(body.bounds.maxY <= E.world.h + 0.001, '県が床を突き抜ける: ' + body.bounds.maxY);
assert(body.bounds.minX >= -0.001 && body.bounds.maxX <= E.world.w + 0.001, '県が壁を突き抜ける');

s = E.createRun();
E.addPiece(s, 2, 0.5, 0.5);
E.addPiece(s, 3, 0.5, 0.5);
tickLoop(s, 3);
assert(s.bodies.length === 1 && s.bodies[0].members.length === 2, '隣接県同士が合体しない');
assert(s.merges >= 1 && s.score > 0, '合体スコアが入らない');
assert(E.consumeEvents(s).some(function (e) { return e.type === 'merge'; }), '合体イベントがない');

s = E.createRun();
E.addPiece(s, 1, 0.5, 0.5);
E.addPiece(s, 4, 0.5, 0.5);
tickLoop(s, 3);
assert(s.bodies.length === 2, '隣接していない県が合体してしまう');
assert(s.merges === 0, '非隣接の合体回数が不正');

s = E.createRun();
var tohoku = [2, 3, 4, 5, 6, 7];
for (i = 0; i < tohoku.length; i++) E.addPiece(s, tohoku[i], 0.5, 0.5);
tickLoop(s, 60);
assert(s.bodies.length === 1 && s.bodies[0].members.length === 6, '東北6県が1つにならない');
assert(s.awarded.tohoku === true, '東北完成ボーナスがない');
assert(E.consumeEvents(s).some(function (e) { return e.type === 'region' && e.region === 'tohoku'; }), '地方完成イベントがない');

s = E.createRun();
E.addPiece(s, 2, 0.5, 0.8);
s.hints = 3;
var hint = E.useHint(s);
assert(hint && hint.code === 1 && s.hints === 2, 'ヒントが使えない');
assert(hint.x > 0 && hint.x < E.world.w, 'ヒントのXが範囲外');
assert(E.useHint(s) !== null, '2回目のヒントが使えない');
assert(E.useHint(s) !== null, '3回目のヒントが使えない');
assert(E.useHint(s) === null, 'ヒント3回の上限が不正');
assert(s.hints === 0, 'ヒント回数が0にならない');

s = E.createRun();
E.addPiece(s, 2, 0.5, 0.8);
assert(E.shake(s) === true && s.shakes === 2, 'ゆらすが使えない');
assert(E.shake(s) === true, '2回目のゆらすが使えない');
assert(E.shake(s) === true, '3回目のゆらすが使えない');
assert(E.shake(s) === false, 'ゆらす3回の上限が不正');

s = E.createRun();
s.queue = [];
s.activeCode = null;
s.allDropped = true;
s.finishTimer = 0.2;
E.tick(s, 0.05);
assert(s.phase === 'run', '60秒タイマーが早すぎる');
for (var tt = 0; tt < 4; tt++) E.tick(s, 0.05);
assert(s.phase === 'over' && s.reason === 'timeout', '60秒で終了しない');

s = E.createRun();
var oldG = E.world.gravity;
E.world.gravity = 0;
E.addPiece(s, 1, 0.5, -0.2);
tickLoop(s, 12, 0.05);
assert(s.phase === 'over' && s.reason === 'overflow', '箱あふれにならない');
E.world.gravity = oldG;

s = E.createRun();
var ref = E.byCode[1];
var clearGravity = E.world.gravity;
E.world.gravity = 0;
for (i = 0; i < E.prefectures.length; i++) {
  var cp = E.prefectures[i];
  E.addPiece(s, cp.code, 0.5 + (cp.center[0] - ref.center[0]), 0.3 + (cp.center[1] - ref.center[1]));
}
tickLoop(s, 200);
assert(s.phase === 'clear', '47県を1つにしてもクリアにならない: ' + s.phase);
assert(E.largestMembers(s) === 47 && s.merges === 46, '47県の結合数が不正: ' + s.merges);
assert(s.score > 0, 'クリアスコアが0');
assert(E.consumeEvents(s).some(function (e) { return e.type === 'clear'; }), 'クリアイベントがない');
E.world.gravity = clearGravity;

s = E.createRun();
while (s.queue.length) E.dropActive(s);
assert(s.allDropped === true && s.finishTimer === E.world.finishLimit, '全ドロップ後に60秒タイマーが始まらない');
assert(s.activeCode === null, 'キューが空でも次の県が残る');

s = E.createRun();
E.setPaused(s, true);
var before = s.elapsed;
E.tick(s, 1);
E.dropActive(s);
assert(s.elapsed === before && s.bodies.length === 0, 'ポーズ中に進む');
E.setPaused(s, false);
E.tick(s, 0.1);
assert(s.elapsed > before, '再開後に進まない');

st = E.getState(s);
assert(st.id === 'ken-tsunagi' && st.total === 47 && st.paused === false, 'getStateが不正');

print('engine tests OK (' + passed + ' アサーション)');
