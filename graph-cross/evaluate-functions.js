/* evaluate-functions.js : 関数の軌道メトリクスを測る簡易評価ツール（jsc）
 *
 * 目的:
 *   - 操作しやすさ・上下カバー範囲・暴走しやすさの一次指標を出す
 *   - レアリティやガチャ排出率を決める前の材料にする
 *
 * 実行:
 *   cd graph-cross && jsc evaluate-functions.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['content.js', 'graph-cross/content.js']);
tryLoad(['balance.js', 'graph-cross/balance.js']);
tryLoad(['engine.js', 'graph-cross/engine.js']);

var C = (typeof GraphContent !== 'undefined') ? GraphContent : null;
var E = (typeof GraphCrossEngine !== 'undefined') ? GraphCrossEngine : null;
if (!C || !E) throw new Error('content.js / engine.js を読み込めません');

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deckFor(key) {
  if (key === 'hold') return ['hold', 'up', 'down'];
  if (key === 'up') return ['up', 'down', 'hold'];
  if (key === 'down') return ['down', 'up', 'hold'];
  return [key, 'hold', key === 'up' ? 'down' : 'up'];
}

function measure(key, seed) {
  var g = E.createGame({
    width: 1000,
    height: 620,
    deck: deckFor(key),
    rng: mulberry32(seed)
  });
  g.rivals = [];
  g.items = [];
  g.boss = null;
  g.spawnTimer = 999;
  g.itemTimer = 999;
  g.stageTarget = 999;
  g.hp = 99;
  g.y = (g.top + g.bottom) / 2;
  g.trail = [];
  E.setMode(g, key);

  var dt = 1 / 60;
  var minY = g.y;
  var maxY = g.y;
  var prevY = g.y;
  var maxSpeed = 0;
  var path = 0;
  var dir = 0;
  var turns = 0;
  var edgeTime = null;
  var field = g.bottom - g.top;

  for (var i = 1; i <= 120; i++) {
    E.update(g, dt);
    var dy = g.y - prevY;
    var speed = Math.abs(dy) / dt;
    if (speed > maxSpeed) maxSpeed = speed;
    path += Math.abs(dy);
    if (dy > 0.001) {
      if (dir < 0) turns++;
      dir = 1;
    } else if (dy < -0.001) {
      if (dir > 0) turns++;
      dir = -1;
    }
    if (edgeTime === null && (g.y <= g.top + 12.01 || g.y >= g.bottom - 12.01)) {
      edgeTime = i * dt;
    }
    if (g.y < minY) minY = g.y;
    if (g.y > maxY) maxY = g.y;
    prevY = g.y;
  }

  return {
    coverage: field > 0 ? Math.min(1, (maxY - minY) / field) : 0,
    maxSpeed: maxSpeed,
    edgeTime: edgeTime,
    turns: turns,
    path: path,
    finalY: g.y
  };
}

function average(key) {
  var seeds = [1, 2, 3, 4, 5];
  var total = { coverage: 0, maxSpeed: 0, edgeTime: 0, edgeCount: 0, turns: 0, path: 0 };
  for (var i = 0; i < seeds.length; i++) {
    var r = measure(key, seeds[i]);
    total.coverage += r.coverage;
    total.maxSpeed += r.maxSpeed;
    total.turns += r.turns;
    total.path += r.path;
    if (r.edgeTime != null) {
      total.edgeTime += r.edgeTime;
      total.edgeCount++;
    }
  }
  var n = seeds.length;
  return {
    coverage: total.coverage / n,
    maxSpeed: total.maxSpeed / n,
    edgeTime: total.edgeCount ? (total.edgeTime / total.edgeCount) : null,
    turns: total.turns / n,
    path: total.path / n
  };
}

print('| 関数 | ジャンル | カバー率 | 最大速度(px/s) | 端到達(s) | 方向転換 | 軌道長(px) |');
print('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
for (var k = 0; k < E.MODE_KEYS.length; k++) {
  var key = E.MODE_KEYS[k];
  var a = average(key);
  var edge = a.edgeTime == null ? '-' : a.edgeTime.toFixed(2);
  print('| ' + C.formatModeLabel(key, null) + ' | ' + C.GENRE_LABELS[C.MODES[key].genre] + ' | ' +
    Math.round(a.coverage * 100) + '% | ' +
    Math.round(a.maxSpeed) + ' | ' + edge + ' | ' +
    a.turns.toFixed(1) + ' | ' + Math.round(a.path) + ' |');
}
