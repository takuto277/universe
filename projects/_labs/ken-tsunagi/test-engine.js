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

function placeAt(s, code) {
  var t = E.target(code);
  return E.tryPlace(s, code, t.x, t.y);
}

assert(E.total === 47, '47都道府県ではない: ' + E.total);
assert(E.prefectures.length === 47, '都道府県データが47件ではない');
assert(E.regions.length === 8, '地方が8つではない');
assert(E.regionCodes('kanto').length === 7, '関東の県数が不正');
assert(E.regionCodes('kyushu').indexOf(47) >= 0, '沖縄が九州・沖縄にない');

var codes = {};
for (var i = 0; i < E.prefectures.length; i++) {
  var p = E.prefectures[i];
  assert(!codes[p.code], '都道府県コードが重複: ' + p.code);
  codes[p.code] = true;
  assert(p.rings.length > 0 && p.rings[0].length >= 3, p.label + ' の形がない');
  assert(p.label && p.region, p.label + ' の名前か地方がない');
  assert(p.center[0] >= 0 && p.center[0] <= E.data.mapW + 0.001, p.label + ' のX座標が範囲外');
  assert(p.center[1] >= 0 && p.center[1] <= E.data.mapH + 0.001, p.label + ' のY座標が範囲外');
  for (var j = 0; j < p.neighbors.length; j++) {
    var other = E.byCode[p.neighbors[j]];
    assert(other && other.neighbors.indexOf(p.code) >= 0, '隣接が片方向: ' + p.label + ' -> ' + p.neighbors[j]);
  }
}

var s = E.createRun();
var state = E.getState(s);
assert(state.phase === 'run' && state.placedCount === 0 && state.total === 47, '初期状態が不正');
assert(state.timeLeft === E.timeLimit && state.hints === E.hintCount, 'タイマーかヒントの初期値が不正');
assert(state.regionFilter === 'hokkaido', '最初の地方が北海道ではない');

var miss = E.tryPlace(s, 13, 0, 0);
assert(miss.ok === false && miss.reason === 'target', '間違った位置で置けてしまう');
assert(s.timeLeft === E.timeLimit - E.missPenalty && s.combo === 0, 'ミスの時間ペナルティがない');
assert(E.consumeEvents(s).some(function (e) { return e.type === 'miss'; }), 'ミスイベントがない');

s = E.createRun();
var tokyo = E.byCode[13];
var kanagawa = E.byCode[14];
var r1 = placeAt(s, 13);
assert(r1.ok && s.placedCount === 1 && s.score === 100, '東京を正しく置けない');
assert(r1.neighbors === 0 && r1.combo === 1, '東京のコンボか隣接数が不正');
var r2 = placeAt(s, 14);
assert(r2.ok && r2.neighbors >= 1, '神奈川と東京がつながらない');
assert(r2.combo === 2 && r2.gain > 100, '隣接ボーナスかコンボボーナスがない');
assert(s.score === 260, '連続配置のスコアが不正: ' + s.score);
assert(kanagawa.neighbors.indexOf(13) >= 0 && tokyo.neighbors.indexOf(14) >= 0, '東京と神奈川が隣接していない');

s = E.createRun();
var hokkaido = E.byCode[1];
assert(placeAt(s, 1).ok, '北海道を置けない');
assert(s.regionFilter === 'tohoku', '北海道完成後に東北へ進まない: ' + s.regionFilter);
assert(E.regionComplete(s, 'hokkaido'), '北海道が完成扱いにならない');

s = E.createRun();
var hint = E.useHint(s);
assert(hint && hint.code === 1 && s.hints === E.hintCount - 1, 'ヒントが使えない');
assert(s.selectedCode === 1 && s.regionFilter === 'hokkaido', 'ヒントで選択されない');
assert(E.useHint(s) && E.useHint(s), '3回目のヒントが使えない');
assert(E.useHint(s) === null && s.hints === 0, 'ヒントが3回を超える');

s = E.createRun();
E.selectRegion(s, 'kanto');
assert(s.regionFilter === 'kanto', '地方を切り替えられない');
assert(E.tray(s).length === 7, '関東のトレイが7件ではない');
E.selectPiece(s, 13);
assert(s.selectedCode === 13 && s.regionFilter === 'kanto', 'ピースを選択できない');

s = E.createRun();
for (var k = 0; k < E.regionCodes('kanto').length; k++) {
  var code = E.regionCodes('kanto')[k];
  var result = placeAt(s, code);
  assert(result.ok, E.byCode[code].label + ' を置けない');
}
assert(E.regionComplete(s, 'kanto'), '関東が完成しない');
var events = E.consumeEvents(s);
assert(events.some(function (e) { return e.type === 'region' && e.region === 'kanto'; }), '地方完成イベントがない');

s = E.createRun();
for (var ti = 0; ti < 1000; ti++) E.tick(s, 0.1);
assert(Math.abs(s.timeLeft - (E.timeLimit - 100)) < 1e-6 && s.phase === 'run', 'タイマーが進まない');
for (ti = 0; ti < 1000; ti++) E.tick(s, 0.1);
assert(s.phase === 'over' && s.timeLeft === 0, '時間切れにならない');

s = E.createRun();
for (var n = 0; n < E.prefectures.length; n++) {
  var placed = placeAt(s, E.prefectures[n].code);
  assert(placed.ok, E.prefectures[n].label + ' を置けない');
}
state = E.getState(s);
assert(state.phase === 'clear' && state.cleared === true, '47県そろってもクリアにならない: ' + state.phase);
assert(state.placedCount === 47 && state.clearBonus > 0, 'クリア時の加算が不正');
assert(state.score > 4700 && state.bestCombo >= 40, 'クリアスコアが不正: ' + state.score);
assert(E.consumeEvents(s).some(function (e) { return e.type === 'clear'; }), 'クリアイベントがない');

s = E.createRun();
E.setPaused(s, true);
E.tick(s, 10);
assert(s.timeLeft === E.timeLimit, 'ポーズ中に時間が進む');
assert(E.tryPlace(s, 1, E.target(1).x, E.target(1).y).ok === false, 'ポーズ中に置ける');
E.setPaused(s, false);
E.tick(s, 1);
assert(s.timeLeft < E.timeLimit, '再開後に時間が進まない');

print('engine tests OK (' + passed + ' アサーション)');
