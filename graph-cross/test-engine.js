/* test-engine.js : グラフクロスのルール・交差判定・生成のテスト（jsc で実行）
 * 実行例:
 *   cd universe/graph-cross && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = GraphCrossEngine;
}

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}
function log(m) { print(m); }

function mulberry32(seed) {
  var t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    var r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGame(seed, deck) {
  return E.createGame({
    width: 1000,
    height: 620,
    deck: deck,
    rng: mulberry32(seed == null ? 1 : seed)
  });
}

function lineRival(x, y, len) {
  return {
    x: x,
    len: len || 120,
    shape: 'line',
    baseY: y,
    amp: 0,
    waves: 1,
    phase: 0,
    slope: 0,
    dir: 1,
    label: 'y = x/2',
    hit: false
  };
}

/* 1) 初期状態 */
var g = makeGame(1);
assert(g.hp === E.MAX_HP && g.score === 0 && g.combo === 0, '初期HP・スコア・コンボ');
assert(g.mode === 'hold' && E.MODES[g.mode], '初期モード');
assert(g.deck.length === 3 && g.deck.join(',') === E.DEFAULT_DECK.join(','), '初期デッキ');
assert(g.rivals.length === 3, '導入用の敵カーブが3本');
assert(g.trail.length === 0, '曲線はまだ空');
assert(g.headX > 0 && g.top < g.bottom, '描画範囲');
assert(E.snapshot(g).x === 0, 'xの初期値');

/* 2) デッキのモードだけ使える */
var gUp = makeGame(11, ['hold', 'up', 'quad']);
assert(gUp.deck.join(',') === 'hold,up,quad', 'デッキ指定');
assert(E.setMode(gUp, 'down') === false, 'デッキ外のモードは使えない');
assert(E.setMode(gUp, 'up') === true, '上モードに切替');
assert(gUp.vy < 0, '上モードは上向き');
var y0 = gUp.y;
E.update(gUp, 1 / 60);
assert(gUp.y < y0, '上モードでyが減る');
E.setMode(gUp, 'quad');
assert(gUp.vy === 0, 'x²モードは速度0から加速');
var yq = gUp.y;
for (i = 0; i < 20; i++) E.update(gUp, 1 / 60);
assert(gUp.y < yq, 'x²モードで上に加速する');
var gDown = makeGame(12, ['hold', 'down', 'wave']);
E.setMode(gDown, 'down');
y0 = gDown.y;
E.update(gDown, 1 / 60);
assert(gDown.y > y0, '下モードでyが増える');
assert(!E.setMode({ over: true }, 'up'), '終了後はモード切替できない');
assert(E.setMode(gUp, 'unknown') === false, '不正なモードは無視');
var deckGame = E.createGame({ width: 1000, height: 620, deck: ['wave', 'quad', 'steepUp'], rng: mulberry32(5) });
assert(deckGame.mode === 'wave' && deckGame.deck.length === 3, '自由なデッキで開始');
assert(E.setMode(deckGame, 'hold') === false && E.setMode(deckGame, 'steepUp') === true, 'デッキ内のみ切替');
var brokenDeck = E.createGame({ width: 1000, height: 620, deck: ['up'] });
assert(brokenDeck.deck.join(',') === E.DEFAULT_DECK.join(','), '不正なデッキは既定値');

/* 3) x が進み、曲線が伸びる */
g = makeGame(2);
var x0 = g.worldX;
for (i = 0; i < 60; i++) E.update(g, 1 / 60);
assert(g.worldX > x0 + 150, 'xが進む: ' + g.worldX.toFixed(1));
assert(g.trail.length > 40, '曲線が伸びる: ' + g.trail.length);
assert(g.trail[g.trail.length - 1].x === g.headX, '最新点はヘッド位置');

/* 4) 曲線と敵カーブが交差すると得点・コンボ・エフェクトイベント */
g = makeGame(3);
g.rivals = [];
g.trail = [{ x: g.headX, y: g.y }];
g.rivals.push(lineRival(g.headX - 20, g.y, 100));
E.update(g, 1 / 60);
assert(g.score > 0 && g.combo === 1, '交差で得点とコンボ');
assert(g.hits === 1 && g.rivals.length === 0, '敵カーブが消える');
var events = E.consumeEvents(g);
assert(events.some(function (e) { return e.type === 'hit'; }), 'hitイベント');
var hitEvent = events.filter(function (e) { return e.type === 'hit'; })[0];
assert(hitEvent.gain >= 100 && hitEvent.combo === 1, '得点とコンボがイベントに入る');

/* 4b) 交差角度が急なほどボーナスが大きい */
function forceHit(slope) {
  var game = makeGame(99);
  game.rivals = [];
  var x = game.headX - 100;
  var len = 200;
  var localAtHead = game.headX - x;
  var rival = lineRival(x, 0, len);
  rival.slope = slope;
  rival.baseY = game.y - slope * (localAtHead - len / 2);
  game.trail = [{ x: game.headX - 5, y: game.y }, { x: game.headX, y: game.y }];
  game.rivals.push(rival);
  E.update(game, 1 / 60);
  var hits = E.consumeEvents(game).filter(function (e) { return e.type === 'hit'; });
  assert(hits.length === 1, '角度テスト用の交差が起きる (slope=' + slope + ')');
  return hits[0];
}
var flatHit = forceHit(0);
var steepHit = forceHit(3);
assert(steepHit.angle > flatHit.angle, '急な交差ほど角度が大きい');
assert(steepHit.mult > flatHit.mult, '急な交差ほど倍率が高い');
assert(steepHit.gain > flatHit.gain, '急な交差ほど得点が高い');

/* 5) 交差しなければ画面外でミスになりHPが減る */
g = makeGame(4);
g.rivals = [lineRival(-200, g.y, 100)];
var hpBefore = g.hp;
E.update(g, 1 / 60);
assert(g.hp === hpBefore - 1, 'ミスでHPが減る');
assert(g.combo === 0, 'ミスでコンボが切れる');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'miss'; }), 'missイベント');

/* 6) 5コンボでHPが回復する（最大3） */
g = makeGame(5);
g.rivals = [];
g.combo = 4;
g.comboTimer = 2;
g.hp = 2;
g.trail = [{ x: g.headX, y: g.y }];
g.rivals.push(lineRival(g.headX - 20, g.y, 100));
E.update(g, 1 / 60);
assert(g.combo === 5 && g.hp === 3, '5コンボでHP回復');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'hit' && e.heal; }), '回復イベント');

/* 7) HP0で終了し、更新も止まる */
g = makeGame(6);
g.hp = 1;
g.rivals = [lineRival(-200, g.y, 100)];
E.update(g, 1 / 60);
assert(g.over && g.hp === 0 && g.deathCause === 'miss', 'HP0でゲームオーバー');
var stoppedX = g.worldX;
E.update(g, 1 / 60);
assert(g.worldX === stoppedX, '終了後はxが進まない');

/* 8) コンボの制限時間が切れると0に戻る */
g = makeGame(7);
g.combo = 3;
g.comboTimer = 0.05;
g.rivals = [];
for (i = 0; i < 10; i++) E.update(g, 1 / 60);
assert(g.combo === 0 && g.comboTimer === 0, '時間切れでコンボ終了');

/* 9) 敵カーブが時間とともに増える */
g = makeGame(8);
g.hp = 999;
var spawned = 0;
for (i = 0; i < 60 * 12; i++) {
  E.update(g, 1 / 60);
  spawned = Math.max(spawned, g.rivals.length);
  if (g.over) break;
}
assert(spawned >= 3, '敵カーブが生成され続ける: max=' + spawned);
assert(g.hits + g.misses > 0, '交差かミスが発生している');

/* 10) 何もしないより、敵の高さに合わせて動く方が長く/多く当たる */
function play(seed, smart, seconds) {
  var game = makeGame(seed);
  var steps = Math.floor(seconds * 60);
  for (var step = 0; step < steps && !game.over; step++) {
    if (smart) {
      var target = null;
      var best = Infinity;
      for (var k = 0; k < game.rivals.length; k++) {
        var r = game.rivals[k];
        if (r.x + r.len < game.headX) continue;
        var priority;
        var local;
        if (r.x <= game.headX) {
          priority = -1;
          local = game.headX - r.x;
        } else {
          priority = r.x - game.headX;
          local = 0;
        }
        if (priority < best) {
          best = priority;
          target = E.rivalY(r, local);
        }
      }
      if (target != null) {
        if (game.y > target + 10) E.setMode(game, 'up');
        else if (game.y < target - 10) E.setMode(game, 'down');
        else E.setMode(game, 'hold');
      } else {
        E.setMode(game, 'hold');
      }
    }
    E.update(game, 1 / 60);
  }
  return game;
}

var dumbTimes = [];
var smartTimes = [];
var smartHits = 0;
for (var s = 0; s < 5; s++) {
  var dumb = play(300 + s, false, 40);
  var smart = play(300 + s, true, 40);
  dumbTimes.push(dumb.time);
  smartTimes.push(smart.time);
  smartHits += smart.hits;
  assert(smart.hits > dumb.hits, '狙う方が当たる (seed=' + (300 + s) + ')');
}
log('  何もしない生存: ' + dumbTimes.map(function (v) { return v.toFixed(1) + 's'; }).join(' / '));
log('  狙うプレイ生存: ' + smartTimes.map(function (v) { return v.toFixed(1) + 's'; }).join(' / '));
assert(smartHits > 0, '狙うプレイで交差が発生する');

log('engine tests OK (' + passed + ' アサーション)');
