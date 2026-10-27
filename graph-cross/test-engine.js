/* test-engine.js : グラフクロスのルール・交差判定・生成のテスト（jsc で実行）
 * 実行例:
 *   cd universe/graph-cross && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('content.js');
  load('balance.js');
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

/* 2b) 係数パラメータの正規化と反映 */
var tuned = E.createGame({
  width: 1000, height: 620, deck: ['quad', 'wave', 'hold'],
  deckParams: { quad: { a: 2 }, wave: { a: 1.6, b: 2 } }
});
assert(tuned.deckParams.quad.a === 2, 'x²の係数を保持');
assert(tuned.deckParams.wave.a === 1.6 && tuned.deckParams.wave.b === 2, 'sinの係数を保持');
var clampedParams = E.createGame({
  width: 1000, height: 620, deck: ['quad', 'wave', 'hold'],
  deckParams: { quad: { a: 99 }, wave: { a: -1, b: 99 } }
});
assert(clampedParams.deckParams.quad.a === 2, 'x²係数の上限');
assert(clampedParams.deckParams.wave.a === 0.4, 'sin振幅の下限');
assert(clampedParams.deckParams.wave.b === 2.5, 'sin周波数の上限');
var customLimits = E.createGame({
  width: 1000, height: 620, deck: ['quad', 'wave', 'hold'],
  deckParams: { quad: { a: 1, b: 99 }, wave: { a: 1, b: 1, c: -99 } }
});
assert(customLimits.deckParams.quad.b === 1.5, '2次の初速上限');
assert(customLimits.deckParams.wave.c === -3, '位相の下限');
var pClamp = E.createGame({
  width: 1000, height: 620, deck: ['quad', 'wave', 'hold'],
  deckParams: { quad: { a: 1, b: 0, p: 99 } }
});
assert(pClamp.deckParams.quad.p === 4, '累乗pの上限');
var quadB = E.createGame({ width: 1000, height: 620, deck: ['quad', 'hold', 'up'], deckParams: { quad: { a: 1, b: 1 } }, rng: mulberry32(23) });
assert(quadB.vy === 120, '累乗のbが初速になる');
var power2 = E.createGame({ width: 1000, height: 620, deck: ['quad', 'hold', 'up'], deckParams: { quad: { a: 1, b: 0, p: 2 } }, rng: mulberry32(25) });
var power3 = E.createGame({ width: 1000, height: 620, deck: ['quad', 'hold', 'up'], deckParams: { quad: { a: 1, b: 0, p: 3 } }, rng: mulberry32(26) });
for (i = 0; i < 30; i++) { power2.rivals = []; power3.rivals = []; E.update(power2, 1 / 60); E.update(power3, 1 / 60); }
assert(power3.y > power2.y, 'pが大きいほど序盤はゆるく曲がる');
var waveC = E.createGame({ width: 1000, height: 620, deck: ['wave', 'hold', 'up'], deckParams: { wave: { a: 1, b: 1, c: 1 } }, rng: mulberry32(24) });
var wave0 = E.createGame({ width: 1000, height: 620, deck: ['wave', 'hold', 'up'], deckParams: { wave: { a: 1, b: 1, c: 0 } }, rng: mulberry32(24) });
for (i = 0; i < 20; i++) {
  waveC.rivals = []; wave0.rivals = [];
  E.update(waveC, 1 / 60); E.update(wave0, 1 / 60);
}
assert(Math.abs(waveC.y - wave0.y) > 1, 'sinの位相が軌道に反映される');
var triWave = E.createGame({ width: 1000, height: 620, deck: ['wave', 'hold', 'up'], deckParams: { wave: { a: 1, b: 1, c: 0, shape: 2 } }, rng: mulberry32(27) });
var sinWave = E.createGame({ width: 1000, height: 620, deck: ['wave', 'hold', 'up'], deckParams: { wave: { a: 1, b: 1, c: 0, shape: 0 } }, rng: mulberry32(27) });
for (i = 0; i < 25; i++) {
  triWave.rivals = []; sinWave.rivals = [];
  E.update(triWave, 1 / 60); E.update(sinWave, 1 / 60);
}
assert(Math.abs(triWave.y - sinWave.y) > 1, '波の形の違いが軌道に反映される');
assert(E.WAVE_SHAPES.length === 5, '波の形が5種類ある');

var slowQuad = E.createGame({ width: 1000, height: 620, deck: ['quad', 'hold', 'up'], deckParams: { quad: { a: 0.4 } }, rng: mulberry32(21) });
var fastQuad = E.createGame({ width: 1000, height: 620, deck: ['quad', 'hold', 'up'], deckParams: { quad: { a: 2 } }, rng: mulberry32(21) });
for (i = 0; i < 30; i++) { slowQuad.rivals = []; fastQuad.rivals = []; E.update(slowQuad, 1 / 60); E.update(fastQuad, 1 / 60); }
assert(fastQuad.y < slowQuad.y, 'x²の係数が大きいほど上に加速する');
var slowWave = E.createGame({ width: 1000, height: 620, deck: ['wave', 'hold', 'up'], deckParams: { wave: { a: 1, b: 0.5 } }, rng: mulberry32(22) });
var fastWave = E.createGame({ width: 1000, height: 620, deck: ['wave', 'hold', 'up'], deckParams: { wave: { a: 1, b: 2.5 } }, rng: mulberry32(22) });
for (i = 0; i < 30; i++) { slowWave.rivals = []; fastWave.rivals = []; E.update(slowWave, 1 / 60); E.update(fastWave, 1 / 60); }
assert(Math.abs(fastWave.y - slowWave.y) > 1, 'sinの周波数が動きに反映される');

/* 3) x が進み、曲線が伸びる */
g = makeGame(2);
var x0 = g.worldX;
for (i = 0; i < 60; i++) E.update(g, 1 / 60);
assert(g.worldX > x0 + 150, 'xが進む: ' + g.worldX.toFixed(1));
assert(g.trail.length > 40, '曲線が伸びる: ' + g.trail.length);
assert(g.trail[g.trail.length - 1].x === g.headX, '最新点はヘッド位置');
assert(g.trail[g.trail.length - 1].mode === g.mode, '曲線の点にモードが残る');
assert(E.snapshot(g).modeFamily === 'none', 'ホールドの系統はnone');

/* 4) 曲線と敵カーブが交差すると得点・コンボ・エフェクトイベント */
g = makeGame(3);
g.rivals = [];
g.trail = [{ x: g.headX, y: g.y }];
g.rivals.push(lineRival(g.headX - 20, g.y, 100));
E.update(g, 1 / 60);
assert(g.score > 0 && g.combo === 1, '交差で得点とコンボ');
assert(g.stageHits === 1, '通常敵の交差でステージ進行');
assert(g.hits === 1 && g.rivals.length === 0, '敵カーブが消える');
var events = E.consumeEvents(g);
assert(events.some(function (e) { return e.type === 'hit'; }), 'hitイベント');
var hitEvent = events.filter(function (e) { return e.type === 'hit'; })[0];
assert(hitEvent.gain >= 100 && hitEvent.combo === 1, '得点とコンボがイベントに入る');

/* 4b) 交差角度が急なほどボーナスが大きい */
function forceHit(slope, family, playerMode) {
  var game = makeGame(99, ['hold', 'up', 'wave']);
  game.rivals = [];
  var x = game.headX - 100;
  var len = 200;
  var localAtHead = game.headX - x;
  var rival = lineRival(x, 0, len);
  rival.slope = slope;
  rival.family = family || null;
  rival.baseY = game.y - slope * (localAtHead - len / 2);
  game.trail = [
    { x: game.headX - 5, y: game.y, mode: playerMode || 'hold' },
    { x: game.headX, y: game.y, mode: playerMode || 'hold' }
  ];
  game.rivals.push(rival);
  if (playerMode) E.setMode(game, playerMode);
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
var weakHit = forceHit(0, 'linear', 'up');
var plainHit = forceHit(0, 'linear', 'hold');
assert(weakHit.weak === true && weakHit.weakMult === 1.5, '同じ系統の関数で弱点ボーナス');
assert(plainHit.weak === false && plainHit.weakMult === 1, '系統が違うと弱点ボーナスなし');
assert(weakHit.gain > plainHit.gain, '弱点ボーナスで得点が増える');
assert(weakHit.playerFamily === 'linear' && weakHit.weakness === 'linear', '弱点イベントの系統');

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

/* 9a0) 未解放関数の扱い */
g = E.createGame({
  width: 1000, height: 620,
  deck: ['wave', 'quad', 'hold'],
  unlocked: ['hold', 'up', 'down'],
  rng: mulberry32(9010)
});
assert(g.unlocked.length === 3, '未解放リストを保持');
assert(g.deck.indexOf('wave') < 0 && g.deck.indexOf('quad') < 0, '未解放関数はデッキに入らない');
assert(g.deck.indexOf('hold') >= 0 && g.deck.indexOf('up') >= 0 && g.deck.indexOf('down') >= 0, '未解放時はスターターに戻る');

var starterOnly = E.createGame({
  width: 1000, height: 620,
  deck: ['hold', 'up', 'down'],
  unlocked: ['hold', 'up', 'down'],
  rng: mulberry32(9011)
});
assert(E.rotateDeck(starterOnly) === null, '未解放候補がない場合は入れ替えない');

var starterCheckpoint = E.makeCheckpoint(starterOnly);
var starterRestored = E.restoreCheckpoint(starterCheckpoint, { width: 1000, height: 620, rng: mulberry32(9012) });
assert(starterRestored.unlocked.length === 3 && starterRestored.deck.length === 3, 'チェックポイントに未解放リストを保存');

/* 9a1) 関数プレビュー */
var upPreview = E.modePreview('up', null, null, 10, 1);
assert(upPreview.length === 10 && upPreview[0].y === 0 && upPreview[9].y < upPreview[0].y, '上昇関数のプレビュー');
var wavePreview = E.modePreview('wave', null, null, 20, 1.4);
assert(wavePreview.some(function (p) { return p.y > 1; }) && wavePreview.some(function (p) { return p.y < -1; }), '波関数のプレビュー');

/* 9a2) チュートリアル用の的 */
g = makeGame(9291, ['hold', 'up', 'wave']);
g.rivals = [];
g.y = 330;
var tutTarget = E.spawnTutorialTarget(g);
assert(tutTarget && g.rivals.length === 1, 'チュートリアル用の的が1体出る');
assert(tutTarget.baseY === g.top + 70 && tutTarget.x === g.headX - 120 && tutTarget.len === 260, 'チュートリアル用の位置と長さ');
assert(tutTarget.shape === 'line' && tutTarget.family === 'linear', 'チュートリアル用の直線敵');
E.setMode(g, 'up');
g.spawnTimer = 999;
g.itemTimer = 999;
g.stageTarget = 999;
for (i = 0; i < 200; i++) E.update(g, 1 / 60);
assert(g.hits === 1 && g.rivals.length === 0, 'チュートリアル用の的は曲線と交差する');

/* 9b) ステージ進行とボス */
assert(E.stageTargetFor(1) === 8 && E.stageTargetFor(2) === 10, 'ステージ目標数');
assert(E.difficulty({ time: 0, stage: 5 }) > E.difficulty({ time: 0, stage: 1 }), 'ステージが進むと難易度が上がる');
assert(E.difficulty({ time: 0, stage: 100 }) === E.difficulty({ time: 0, stage: 9 }), 'ステージ難易度の上限');
var speedStage1 = makeGame(9011, ['hold', 'up', 'wave']);
speedStage1.rivals = [];
speedStage1.items = [];
speedStage1.spawnTimer = 999;
speedStage1.itemTimer = 999;
E.update(speedStage1, 1 / 60);
var speedStage5 = makeGame(9011, ['hold', 'up', 'wave']);
speedStage5.stage = 5;
speedStage5.rivals = [];
speedStage5.items = [];
speedStage5.spawnTimer = 999;
speedStage5.itemTimer = 999;
E.update(speedStage5, 1 / 60);
assert(speedStage5.speed > speedStage1.speed, '後半ステージはスクロールが少し速い');
g = makeGame(900, ['hold', 'up', 'wave']);
g.stageHits = g.stageTarget;
g.bossCooldown = 0;
g.rivals = [];
E.update(g, 1 / 60);
assert(g.boss && g.boss.hp === g.boss.maxHp && g.boss.maxHp >= 10, 'ボスが出現する');
var bossFamily = g.boss.family;
assert(E.FAMILY_LABELS[bossFamily], 'ボスに弱点系統がある');
assert(g.rivals.length === 0, 'ボス出現時に通常敵を片付ける');
var scoreBeforeBoss = g.score;

g.boss.x = g.headX - 100;
g.boss.len = 200;
g.boss.shape = 'line';
g.boss.amp = 0;
g.boss.slope = 0;
g.boss.waves = 1;
g.boss.baseY = g.y;
g.boss.centerY = g.y;
g.boss.family = 'linear';
g.boss.hp = 1;
g.boss.maxHp = 1;
g.boss.invuln = 0;
g.boss.flash = 0;
g.trail = [
  { x: g.headX - 5, y: g.y, mode: 'up' },
  { x: g.headX, y: g.y, mode: 'up' }
];
E.setMode(g, 'up');
E.update(g, 1 / 60);
assert(g.stageCleared && g.boss === null, 'ボスHP0でステージクリア');
var swapOffer = E.snapshot(g).deckSwapOffer;
assert(swapOffer && swapOffer.choices.length === 3, 'ステージクリアで交換先3択が出る');
assert(g.lastDeckSwap === null && g.deck.indexOf(swapOffer.oldKey) >= 0, '選択前は自動で入れ替えない');
assert(swapOffer.choices[0] !== swapOffer.choices[1] && swapOffer.choices[1] !== swapOffer.choices[2], '交換先が重複しない');
assert(swapOffer.choices.every(function (k) { return g.deck.indexOf(k) < 0 && E.MODES[k].genre === swapOffer.genre; }), '交換先は同じジャンルのデッキ外');
var swapChoice = swapOffer.choices[1];
var appliedSwap = E.applyDeckSwap(g, swapChoice);
assert(appliedSwap && appliedSwap.newKey === swapChoice && g.lastDeckSwap.newKey === swapChoice, '選んだ関数に入れ替わる');
var swappedDeck = g.deck.slice();
assert(swappedDeck.indexOf(swapChoice) >= 0 && swappedDeck.indexOf(appliedSwap.oldKey) < 0, '入れ替え後のデッキ');
assert(E.snapshot(g).deckSwapOffer === null, '選択後に交換オファーが消える');
assert(g.score > scoreBeforeBoss, 'ステージクリアでスコア獲得');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'stageClear'; }), 'stageClearイベント');
var scoreAfterClear = g.score;
var stageBefore = g.stage;
assert(E.nextStage(g) === true, '次のステージへ進める');
assert(g.stage === stageBefore + 1 && g.stageHits === 0 && !g.stageCleared, '次ステージの初期化');
assert(g.stageTarget === E.stageTargetFor(g.stage), '次ステージの目標数');
assert(g.trail.length === 0 && g.boss === null, '次ステージで曲線とボスをリセット');
assert(g.score === scoreAfterClear, 'スコアは持ち越す');
assert(E.nextStage(g) === false, 'クリア前は次ステージへ進めない');

/* 9b2) ボスの攻撃・フェーズ */
g = makeGame(9010, ['hold', 'up', 'wave']);
g.stageHits = g.stageTarget;
g.bossCooldown = 0;
g.rivals = [];
E.update(g, 1 / 60);
assert(g.boss && g.boss.phase === 1, 'ボスはフェーズ1から');
g.hp = 3;
g.boss.attackTimer = 0;
g.boss.warning = null;
E.update(g, 1 / 60);
assert(g.boss.warning && g.boss.warning.kind === 'laser', 'レーザー予告が出る');
var laserY = g.boss.warning.y;
g.y = laserY;
g.playerInvuln = 0;
g.boss.warning.timer = 0;
E.update(g, 1 / 60);
assert(g.hp === 2 && g.playerInvuln > 0, 'レーザー被弾でライフ-1と無敵');
var bossAttackEvents = E.consumeEvents(g);
assert(bossAttackEvents.some(function (e) { return e.type === 'bossLaser'; }), 'bossLaserイベント');
assert(bossAttackEvents.some(function (e) { return e.type === 'playerHit'; }), 'playerHitイベント');

g.hp = 3;
g.playerInvuln = 0;
g.boss.attackTimer = 0;
g.boss.warning = null;
E.update(g, 1 / 60);
g.y = g.bottom - 20;
g.boss.warning.y = g.top + 20;
g.boss.warning.timer = 0;
E.update(g, 1 / 60);
assert(g.hp === 3, 'レーザーを高さで避けられる');

g.boss.warning = { kind: 'shots', y: g.y, timer: 0 };
g.boss.attackTimer = 999;
E.update(g, 1 / 60);
assert(g.bossShots.length >= 2, 'ボスが弾を撃つ');

g = makeGame(9011, ['hold', 'up', 'wave']);
g.stageHits = g.stageTarget;
g.bossCooldown = 0;
g.rivals = [];
E.update(g, 1 / 60);
g.boss.maxHp = 20;
g.boss.hp = 14;
g.boss.x = g.headX - 5;
g.boss.len = 100;
g.boss.shape = 'line';
g.boss.slope = 0;
g.boss.baseY = g.y;
g.boss.centerY = g.y;
g.boss.family = 'linear';
g.boss.attackTimer = 999;
g.boss.invuln = 0;
g.trail = [
  { x: g.headX - 5, y: g.y, mode: 'up' },
  { x: g.headX, y: g.y, mode: 'up' }
];
E.update(g, 1 / 60);
assert(g.boss.hp <= 13 && g.boss.phase >= 2, 'HPが減るとフェーズが上がる');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'bossPhase'; }), 'bossPhaseイベント');

/* 9c) ボスを逃がすとライフが減り、再出現待ちになる */
g = makeGame(901, ['hold', 'up', 'wave']);
g.stageHits = g.stageTarget;
g.bossCooldown = 0;
E.update(g, 1 / 60);
assert(g.boss, 'ボス再出現テストの準備');
var hpBeforeEscape = g.hp;
g.boss.x = -5000;
g.boss.len = 100;
E.update(g, 1 / 60);
assert(g.hp === hpBeforeEscape - 1, 'ボスを逃がすとライフ-1');
assert(g.boss === null && g.bossCooldown > 0, 'ボスは再出現待ち');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'bossEscape'; }), 'bossEscapeイベント');

/* 9d) ステージ間の強化 */
g = makeGame(902, ['hold', 'up', 'wave']);
g.stageCleared = true;
var choices = E.upgradeChoices(g);
assert(choices.length === 3, '強化の3択が出る');
assert(choices[0] !== choices[1] && choices[1] !== choices[2] && choices[0] !== choices[2], '3択が重複しない');
var hpBeforeUpgrade = g.hp;
assert(E.applyUpgrade(g, 'life') === true, 'ライフ強化');
assert(g.maxHp === 4 && g.hp === Math.min(4, hpBeforeUpgrade + 1), '最大ライフと回復');
assert(E.applyUpgrade(g, 'hit') === true && g.hitBonus === 2, '判定強化');
assert(E.applyUpgrade(g, 'combo') === true && g.comboWindow > E.COMBO_WINDOW, 'コンボ猶予強化');
assert(E.applyUpgrade(g, 'score') === true && g.scoreMult === 1.2, 'スコア強化');
assert(E.applyUpgrade(g, 'boss') === true && g.bossHpReduction === 3, 'ボス弱体化');
var deckSize = g.deck.length;
assert(E.applyUpgrade(g, 'slot') === true && g.deck.length === deckSize + 1, '関数スロット+1');
assert(E.snapshot(g).deck.length === deckSize + 1, '4枠デッキがスナップショットに入る');
assert(E.applyUpgrade(g, 'slot') === false, '4枠を超えて増やせない');
assert(E.applyUpgrade(g, 'beam') === true && g.upgrades.beam === 1, 'ビーム強化');
assert(E.applyUpgrade(g, 'beam') === false, 'ビーム強化は1回だけ');
assert(E.applyUpgrade(g, 'magnet') === true && g.upgrades.magnet === 1, 'アイテム磁石');
assert(E.applyUpgrade(g, 'magnet') === false, 'アイテム磁石は1回だけ');
assert(E.applyUpgrade(g, 'revive') === true && g.upgrades.revive === 1, 'リバイブ');
assert(E.applyUpgrade(g, 'revive') === false, 'リバイブは1回だけ');
assert(E.applyUpgrade(g, 'comboGuard') === true && g.upgrades.comboGuard === 1, 'コンボガード');
assert(E.applyUpgrade(g, 'bossBreaker') === true && g.upgrades.bossBreaker === 1, 'ボスブレイカー');
assert(g.upgrades.life === 1 && g.upgrades.slot === 1 && g.upgrades.beam === 1, '取得強化の記録');
assert(E.snapshot(g).maxHp === 4 && E.snapshot(g).hitBonus === 2, '強化がスナップショットに反映');
assert(E.applyUpgrade(g, 'unknown') === false, '不明な強化は無効');

/* 9d-1) スロット追加の関数3択 */
g = makeGame(925, ['hold', 'up', 'wave']);
g.stageCleared = true;
var slotPicks = E.slotChoices(g);
assert(slotPicks.length === 3, 'スロット追加は3択');
assert(slotPicks[0] !== slotPicks[1] && slotPicks[1] !== slotPicks[2] && slotPicks[0] !== slotPicks[2], 'スロット候補が重複しない');
assert(slotPicks.every(function (k) { return g.deck.indexOf(k) < 0; }), 'スロット候補はデッキ外');
var slotPick = slotPicks[1];
assert(E.applyUpgrade(g, 'slot', slotPick) === true && g.deck.indexOf(slotPick) >= 0, '選んだ関数をスロットに追加');
assert(g.deck.length === 4, '選択後に4枠になる');

/* 9d0) プリズムクロス */
g = makeGame(909, ['hold', 'up', 'wave']);
g.rivals = [];
g.items = [];
g.allies = [];
g.boss = null;
g.stageHits = 0;
g.stageTarget = 99;
g.upgrades = { beam: 1 };
g.beamCooldown = 0;
g.y = 300;
g.spawnTimer = 99;
g.itemTimer = 99;
g.trail = [
  { x: 420, y: 300, mode: 'hold' },
  { x: 418, y: 300, mode: 'hold' }
];
var beamA = lineRival(400, 300, 200);
var beamB = lineRival(400, 330, 200);
var beamC = lineRival(410, 270, 100);
g.rivals = [beamA, beamB, beamC];
E.update(g, 1 / 60);
var beamEvents = E.consumeEvents(g).filter(function (e) { return e.type === 'beam'; });
assert(beamEvents.length === 1, 'ビームは1回だけ発動する');
assert(beamEvents[0].kills.length === 2, 'ビームで縦線上の敵を撃ち抜く');
assert(g.rivals.length === 0 && g.hits === 3, 'ビーム撃破もステージ進行に数える');
assert(g.beamCooldown > 0, 'ビームのクールダウン');
g.rivals = [lineRival(400, 300, 200)];
g.trail = [
  { x: 420, y: 300, mode: 'hold' },
  { x: 418, y: 300, mode: 'hold' }
];
E.update(g, 1 / 60);
var cooldownEvents = E.consumeEvents(g);
assert(!cooldownEvents.some(function (e) { return e.type === 'beam'; }), 'クールダウン中はビームが出ない');
assert(g.hits === 4, '通常交差は継続する');

/* 9d0a) アイテム磁石 */
g = makeGame(926, ['hold', 'up', 'wave']);
g.upgrades = { magnet: 1 };
g.rivals = [];
g.boss = null;
g.stageHits = 0;
g.stageTarget = 99;
g.spawnTimer = 999;
g.itemTimer = 999;
g.y = 300;
g.trail = [{ x: g.headX, y: g.y, mode: 'hold' }];
g.items = [{ x: g.headX + 80, y: g.y + 80, type: 'score', r: 12, phase: 0 }];
var noMagnet = makeGame(926, ['hold', 'up', 'wave']);
noMagnet.rivals = [];
noMagnet.boss = null;
noMagnet.stageHits = 0;
noMagnet.stageTarget = 99;
noMagnet.spawnTimer = 999;
noMagnet.itemTimer = 999;
noMagnet.y = 300;
noMagnet.trail = [{ x: noMagnet.headX, y: noMagnet.y, mode: 'hold' }];
noMagnet.items = [{ x: noMagnet.headX + 80, y: noMagnet.y + 80, type: 'score', r: 12, phase: 0 }];
for (i = 0; i < 20; i++) {
  E.update(g, 1 / 60);
  E.update(noMagnet, 1 / 60);
}
assert(g.items.length === 0 && noMagnet.items.length === 1, '磁石が近くのアイテムを回収する');

/* 9d0b) コンボガード */
g = makeGame(927, ['hold', 'up', 'wave']);
g.upgrades = { comboGuard: 1 };
g.combo = 5;
g.comboTimer = 1;
g.hp = 3;
g.rivals = [lineRival(-300, g.y, 100)];
g.trail = [];
g.items = [];
g.itemTimer = 999;
g.spawnTimer = 999;
g.boss = null;
g.stageTarget = 99;
E.update(g, 1 / 60);
assert(g.combo === 5 && g.guardUsed === true && g.hp === 2, 'コンボガードでコンボを維持');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'guard'; }), 'guardイベント');
g.rivals = [lineRival(-300, g.y, 100)];
E.update(g, 1 / 60);
assert(g.combo === 0 && g.hp === 1, 'コンボガードは1ステージ1回');

/* 9d0c) リバイブ */
g = makeGame(928, ['hold', 'up', 'wave']);
g.upgrades = { revive: 1 };
g.hp = 1;
g.rivals = [lineRival(-300, g.y, 100)];
g.trail = [];
g.items = [];
g.itemTimer = 999;
g.spawnTimer = 999;
g.boss = null;
g.stageTarget = 99;
E.update(g, 1 / 60);
assert(!g.over && g.hp === 1 && g.reviveUsed === true, 'リバイブで1ライフ復活');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'revive'; }), 'reviveイベント');
g.rivals = [lineRival(-300, g.y, 100)];
E.update(g, 1 / 60);
assert(g.over === true && g.hp === 0, 'リバイブは1ラン1回');

/* 9d0d) ボスブレイカー */
g = makeGame(929, ['hold', 'up', 'wave']);
g.stageHits = g.stageTarget;
g.bossCooldown = 0;
g.rivals = [];
E.update(g, 1 / 60);
g.boss.x = g.headX - 5;
g.boss.len = 100;
g.boss.shape = 'line';
g.boss.amp = 0;
g.boss.slope = 0;
g.boss.waves = 1;
g.boss.baseY = g.y;
g.boss.centerY = g.y;
g.boss.family = 'linear';
g.boss.hp = 20;
g.boss.maxHp = 20;
g.boss.invuln = 0;
g.upgrades = { bossBreaker: 1 };
g.trail = [
  { x: g.headX - 5, y: g.y, mode: 'up' },
  { x: g.headX, y: g.y, mode: 'up' }
];
E.setMode(g, 'up');
E.update(g, 1 / 60);
var bossBreakerHit = E.consumeEvents(g).filter(function (e) { return e.type === 'bossHit'; })[0];
assert(bossBreakerHit && bossBreakerHit.damage === 3, 'ボスブレイカーで弱点ダメージ+1');

/* 9d0e) 通常敵ギミック */
function gimmickGame(seed) {
  var g = makeGame(seed, ['hold', 'up', 'wave']);
  g.rivals = [];
  g.items = [];
  g.boss = null;
  g.stageHits = 0;
  g.stageTarget = 99;
  g.spawnTimer = 999;
  g.itemTimer = 999;
  g.y = 300;
  g.trail = [{ x: g.headX, y: g.y, mode: 'hold' }];
  return g;
}

g = gimmickGame(9301);
var armorRival = lineRival(g.headX - 120, g.y, 200);
armorRival.family = 'linear';
armorRival.armor = true;
armorRival.hp = 2;
armorRival.maxHp = 2;
armorRival.invuln = 0;
g.rivals = [armorRival];
E.update(g, 1 / 60);
assert(g.rivals.length === 1 && armorRival.hp === 1 && g.hits === 0, '装甲は通常交差1回では壊れない');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'armorHit'; }), 'armorHitイベント');
armorRival.invuln = 0;
g.trail = [{ x: g.headX, y: g.y, mode: 'hold' }];
E.update(g, 1 / 60);
assert(g.rivals.length === 0 && g.hits === 1, '装甲は2回目で壊れる');

g = gimmickGame(9302);
var weakArmor = lineRival(g.headX - 120, g.y, 200);
weakArmor.family = 'linear';
weakArmor.armor = true;
weakArmor.hp = 2;
weakArmor.maxHp = 2;
weakArmor.invuln = 0;
g.rivals = [weakArmor];
g.trail = [{ x: g.headX, y: g.y, mode: 'up' }];
E.setMode(g, 'up');
E.update(g, 1 / 60);
assert(g.rivals.length === 0, '弱点交差なら装甲を一撃で壊せる');

g = gimmickGame(9303);
var splitter = lineRival(g.headX - 120, g.y, 200);
splitter.family = 'wave';
splitter.splitter = true;
splitter.hp = 1;
splitter.maxHp = 1;
splitter.invuln = 0;
g.rivals = [splitter];
E.update(g, 1 / 60);
assert(g.rivals.length === 2, '分裂敵は撃破で2体に分かれる');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'split'; }), 'splitイベント');

g = gimmickGame(9304);
var jammer = lineRival(g.headX - 120, g.y, 200);
jammer.family = 'wave';
jammer.jammer = true;
jammer.hp = 1;
jammer.maxHp = 1;
jammer.invuln = 0;
g.rivals = [jammer];
E.update(g, 1 / 60);
var jamEvents = E.consumeEvents(g).filter(function (e) { return e.type === 'jam'; });
assert(jamEvents.length === 1, 'jamイベント');
var jamSlot = jamEvents[0].slot;
assert(g.jamTimers[jamSlot] > 0, 'ジャマーがスロットを封印');
assert(E.setMode(g, g.deck[jamSlot]) === false, '封印中の関数は選べない');
g.trail = [{ x: g.headX, y: g.y, mode: 'hold' }];
for (i = 0; i < 200; i++) E.update(g, 1 / 60);
assert(g.jamTimers[jamSlot] === 0, 'ジャムは時間で解除');
assert(E.setMode(g, g.deck[jamSlot]) === true, '解除後は選べる');

/* 9d1) ストレス解消モード */
g = E.createGame({ width: 1000, height: 620, deck: ['hold', 'up', 'wave'], mode: 'stress', rng: mulberry32(908) });
assert(g.gameMode === 'stress' && E.snapshot(g).infiniteLives === true, 'ストレスモードの無限ライフ');
g.hp = 1;
g.rivals = [lineRival(-200, g.y, 100)];
E.update(g, 1 / 60);
assert(g.hp === 1 && !g.over, 'ストレスモードではミスでHPが減らない');
g.stageHits = g.stageTarget;
g.bossCooldown = 0;
g.rivals = [];
E.update(g, 1 / 60);
assert(!g.boss, 'ストレスモードではボスが出ない');
for (i = 0; i < 180; i++) E.update(g, 1 / 60);
assert(!g.over && g.rivals.length > 0, 'ストレスモードは敵が多く出て終わらない');
assert(E.snapshot(g).items >= 0 && E.snapshot(g).multi >= 0, 'ストレスモードのスナップショット');

/* 9d2) マルチクロス */
g = makeGame(905, ['hold', 'up', 'wave']);
g.rivals = [];
g.coinList = [];
g.items = [];
g.itemTimer = 999;
g.trail = [{ x: g.headX - 5, y: g.y, mode: 'hold' }, { x: g.headX, y: g.y, mode: 'hold' }];
g.rivals.push(lineRival(g.headX - 100, g.y, 200));
E.update(g, 1 / 60);
var firstHit = E.consumeEvents(g).filter(function (e) { return e.type === 'hit'; })[0];
g.rivals.push(lineRival(g.headX - 100, g.y, 200));
g.trail = [{ x: g.headX - 5, y: g.y, mode: 'hold' }, { x: g.headX, y: g.y, mode: 'hold' }];
E.update(g, 1 / 60);
var secondHit = E.consumeEvents(g).filter(function (e) { return e.type === 'hit'; })[0];
assert(firstHit && secondHit, 'マルチクロスのヒットが起きる');
assert(secondHit.multi >= 2 && secondHit.multiMult > 1, '連続交差でマルチ倍率');
assert(secondHit.gain > firstHit.gain, 'マルチで得点アップ');
for (i = 0; i < 40; i++) { g.rivals = []; E.update(g, 1 / 60); }
assert(g.multi === 0, '時間切れでマルチ終了');

/* 9d3) アイテムと追加グラフ */
g = makeGame(906, ['hold', 'up', 'wave']);
g.rivals = [];
g.items = [];
g.itemTimer = 999;
g.trail = [{ x: g.headX, y: g.y, mode: 'hold' }];
g.items.push({ x: g.headX, y: g.y, type: 'graph', r: 12, phase: 0 });
E.update(g, 1 / 60);
assert(g.items.length === 0 && g.allies.length === 1, '非対称グラフのアイテムで追加グラフ');
var itemEvents = E.consumeEvents(g);
assert(itemEvents.some(function (e) { return e.type === 'itemPickup'; }), 'itemPickupイベント');
assert(itemEvents.some(function (e) { return e.type === 'allySpawn'; }), 'allySpawnイベント');

g.hp = 2;
g.items = [{ x: g.headX, y: g.y, type: 'life', r: 12, phase: 0 }];
g.itemTimer = 999;
g.trail = [{ x: g.headX, y: g.y, mode: 'hold' }];
E.update(g, 1 / 60);
assert(g.hp === 3, 'ライフアイテムで回復');

g.items = [{ x: g.headX, y: g.y, type: 'score', r: 12, phase: 0 }];
g.itemTimer = 999;
g.trail = [{ x: g.headX, y: g.y, mode: 'hold' }];
var scoreBeforeItem = g.score;
E.update(g, 1 / 60);
assert(g.score >= scoreBeforeItem + 500, 'スコアアイテム');

/* 9d4) 追加グラフが敵を交差する */
g = makeGame(907, ['hold', 'up', 'wave']);
g.rivals = [];
g.items = [];
g.itemTimer = 999;
g.y = g.top + 30;
g.allies = [{
  x0: 0, x1: g.width, baseY: (g.top + g.bottom) / 2,
  amp: 30, freq: 0.05, phase: 0, slope: 0,
  life: 9, maxLife: 9, age: 0, cooldown: 0
}];
g.rivals.push(lineRival(g.headX - 100, (g.top + g.bottom) / 2, 200));
E.update(g, 1 / 60);
assert(g.rivals.length === 0, '追加グラフが通常敵を迎撃する');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'allyHit'; }), 'allyHitイベント');
var allyMoveA = E.allyY(g.allies[0], 500, 0);
var allyMoveB = E.allyY(g.allies[0], 500, 1);
assert(Math.abs(allyMoveA - allyMoveB) > 1, '追加グラフが時間で動く');

/* 9d5) 交差判定が ally.age に追従する（age=0では外れ、age=1では当たる） */
g = makeGame(908, ['hold', 'up', 'wave']);
g.rivals = [];
g.items = [];
g.itemTimer = 999;
g.trail = [];
g.y = g.top + 20;
var ally = {
  x0: 0, x1: g.width, baseY: (g.top + g.bottom) / 2,
  amp: 0, freq: 1, phase: 0, slope: 0,
  life: 9, maxLife: 9, age: 1, cooldown: 0
};
var hitX = 200;
var hitY = E.allyY(ally, hitX, 1);
assert(Math.abs(hitY - E.allyY(ally, hitX, 0)) > 12, 'ageで交差位置が変わる配置');
g.allies = [ally];
g.rivals.push(lineRival(hitX, hitY, 150));
E.update(g, 1 / 60);
assert(g.rivals.length === 0, 'ageを渡した交差判定が敵を迎撃する');
assert(E.consumeEvents(g).some(function (e) { return e.type === 'allyHit'; }), 'age追従のallyHitイベント');

/* 9e) デッキの強制ローテーション */
g = makeGame(903, ['hold', 'up', 'wave']);
var deckBefore = g.deck.slice();
var swap1 = E.rotateDeck(g);
assert(swap1 && g.deck.length === 3, 'デッキを1枠だけ入れ替える');
assert(g.deck[swap1.slot] === swap1.newKey && g.deck.indexOf(swap1.oldKey) < 0, '新しい関数が入る');
assert(g.deck[0] !== g.deck[1] && g.deck[1] !== g.deck[2] && g.deck[0] !== g.deck[2], '入れ替え後も重複しない');
assert(E.MODES[swap1.oldKey].genre === E.MODES[swap1.newKey].genre, '同じジャンル内で入れ替わる');
assert(g.lastDeckSwap.newKey === swap1.newKey, '最後の入れ替えを記録');
var swap2 = E.rotateDeck(g);
assert(swap2 && g.deck.length === 3 && g.lastDeckSwap.newKey === swap2.newKey, '2回目も入れ替えられる');
assert(E.snapshot(g).lastDeckSwap.newKey === swap2.newKey, '入れ替えがスナップショットに入る');

function genresOf(deck) {
  var out = {};
  for (var qi = 0; qi < deck.length; qi++) out[E.MODES[deck[qi]].genre] = true;
  return out;
}
g = makeGame(910, ['up', 'down', 'hold']);
for (i = 0; i < 20; i++) {
  var swapN = E.rotateDeck(g);
  assert(swapN, 'ジャンルを保った入れ替えが続く');
  assert(E.MODES[swapN.oldKey].genre === E.MODES[swapN.newKey].genre, '毎回同じジャンル');
  var gs = genresOf(g.deck);
  assert(gs.up && gs.down && gs.other, '上昇/下降/その他のジャンルが消えない');
}


/* 9e2) 関数合成 */
g = E.createGame({
  width: 1000, height: 620, deck: ['fusion', 'up', 'hold'],
  fusion: { primary: 'quad', secondary: 'wave' },
  deckParams: { quad: { a: 1.5, b: 0, p: 2 }, wave: { a: 1, b: 2, c: 0, shape: 0 } },
  rng: mulberry32(930)
});
assert(g.fusion && g.fusion.primary === 'quad' && g.fusion.secondary === 'wave', '合成設定を保持');
assert(g.deckParams.quad && g.deckParams.wave, 'デッキ外の合成元パラメータも保持');
var fusionStart = g.y;
for (i = 0; i < 60; i++) { g.rivals = []; g.items = []; E.update(g, 1 / 60); }
assert(g.y !== fusionStart, '合成関数が軌道に反映される');
assert(E.snapshot(g).fusion.primary === 'quad', '合成設定がスナップショットに入る');
var fusionDeck = E.createGame({
  width: 1000, height: 620, deck: ['fusion', 'up', 'down'],
  fusion: { primary: 'quad', secondary: 'wave' }, rng: mulberry32(931)
});
for (i = 0; i < 12; i++) E.rotateDeck(fusionDeck);
assert(fusionDeck.deck.indexOf('fusion') === 0, '強制入れ替えで合成カードは消えない');
var badFusion = E.createGame({ width: 1000, height: 620, deck: ['fusion', 'up', 'hold'], fusion: { primary: 'quad', secondary: 'quad' }, rng: mulberry32(932) });
assert(badFusion.fusion === null, '不正な合成設定は無効');

/* 9e3) ステージ開始チェックポイント */
g = makeGame(940, ['hold', 'up', 'wave']);
g.deck.push('down');
g.deckParams.down = E.normalizeParams(g.deckParams).down;
g.fusion = { primary: 'quad', secondary: 'wave' };
g.stage = 3;
g.stageTarget = 12;
g.score = 1234;
g.maxHp = 4;
g.hp = 2;
g.hitBonus = 2;
g.comboWindow = 3.4;
g.scoreMult = 1.2;
g.bossHpReduction = 3;
g.upgrades = { life: 2 };
g.reviveUsed = true;
g.maxCombo = 9;
g.time = 42;
g.worldX = 5000;
var cp = E.makeCheckpoint(g);
g.score = 0;
g.hp = 0;
var restored = E.restoreCheckpoint(cp, { width: 1000, height: 620, rng: mulberry32(941) });
assert(restored, 'チェックポイントから復元できる');
assert(restored.deck.length === 4 && restored.deck[3] === 'down', '4枠デッキも復元');
assert(restored.fusion && restored.fusion.primary === 'quad', '合成設定も復元');
assert(JSON.stringify(restored.deckParams.quad) === JSON.stringify(E.normalizeParams({}).quad), '合成元の係数も既定値で補完');
assert(JSON.stringify(restored.deckParams.wave) === JSON.stringify(cp.deckParams.wave), '保存済みの係数を維持');
assert(restored.stage === 3 && restored.stageTarget === 12 && restored.stageHits === 0, 'ステージ進行を復元');
assert(restored.score === 1234 && restored.hp === 2 && restored.maxHp === 4, 'スコアとライフを復元');
assert(restored.hitBonus === 2 && restored.comboWindow === 3.4 && restored.scoreMult === 1.2, '強化値を復元');
assert(restored.bossHpReduction === 3 && restored.upgrades.life === 2, 'ボス弱体化と強化履歴を復元');
assert(restored.reviveUsed === true, 'リバイブ使用済みも復元');
assert(restored.time === 42 && restored.worldX === 5000, '難易度とx位置を復元');
assert(restored.combo === 0 && restored.multi === 0 && restored.boss === null, 'ステージ内の状態をリセット');
assert(!restored.over && !restored.stageCleared, '再開可能な状態');

/* 9f) 追加された関数の軌道 */
var directCases = [
  ['expo', -1], ['log', -1], ['sigmoid', -1], ['gauss', -1], ['easeDown', 1]
];
for (var dc = 0; dc < directCases.length; dc++) {
  var modeKey = directCases[dc][0];
  var direction = directCases[dc][1];
  var dg = E.createGame({ width: 1000, height: 620, deck: [modeKey, 'hold', 'up'], rng: mulberry32(920 + dc) });
  var startY = dg.y;
  for (i = 0; i < 60; i++) { dg.rivals = []; dg.items = []; E.update(dg, 1 / 60); }
  if (direction < 0) assert(dg.y < startY, modeKey + ' は上方向に動く');
  else assert(dg.y > startY, modeKey + ' は下方向に動く');
  assert(E.MODES[modeKey] && E.MODES[modeKey].genre, modeKey + ' にジャンルがある');
}
assert(E.MODE_KEYS.length === 13, '関数カードが13種類ある');

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
      function chooseMode(up) {
        var prefs = up ? ['up', 'steepUp', 'quad', 'expo', 'log', 'sigmoid', 'wave'] : ['down', 'steepDown', 'quadDown', 'easeDown', 'wave'];
        for (var p = 0; p < prefs.length; p++) {
          if (game.deck.indexOf(prefs[p]) >= 0) { E.setMode(game, prefs[p]); return; }
        }
        if (game.deck.indexOf('hold') >= 0) E.setMode(game, 'hold');
        else E.setMode(game, game.deck[0]);
      }
      if (target != null) {
        if (game.y > target + 10) chooseMode(true);
        else if (game.y < target - 10) chooseMode(false);
        else if (game.deck.indexOf('hold') >= 0) E.setMode(game, 'hold');
        else chooseMode(true);
      } else if (game.deck.indexOf('hold') >= 0) {
        E.setMode(game, 'hold');
      } else {
        chooseMode(true);
      }
    }
    E.update(game, 1 / 60);
    if (game.stageCleared) E.nextStage(game);
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
