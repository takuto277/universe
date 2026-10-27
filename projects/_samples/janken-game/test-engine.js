/* test-engine.js : engine.js のルール検証とバランスシミュレーション（jsc で実行）
 * 実行例:
 *   cd projects/_samples/janken-game && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = JankenEngine;
}

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}
function log(m) { print(m); }

function assertThrows(fn, m) {
  var threw = false;
  try { fn(); } catch (e) { threw = true; }
  assert(threw, m);
}

/* 決定的な rng: 与えた数列を順番に返す（使い切ったら最後の値を返し続ける） */
function seq(values) {
  var i = 0;
  return function () {
    var v = values[Math.min(i, values.length - 1)];
    i++;
    return v;
  };
}
function mulberry32(seed) {
  var t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    var r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* 1) 初期状態 */
var g = E.createGame({ style: 'rocky' });
assert(g.hp.player === 8 && g.hp.cpu === 8, 'HP初期値 8/8');
assert(g.round === 1 && !g.over && g.winner === null, '開始状態');
assert(g.cpuStyle === 'rocky', 'スタイル指定');
assert(g.gauge === 0 && g.history.length === 0, 'ゲージと履歴の初期値');
assert(E.HANDS.length === 3 && E.isHand('rock') && !E.isHand('gun'), '手の定義');

/* 2) 勝敗判定 */
assert(E.beats('rock', 'scissors') && E.beats('scissors', 'paper') && E.beats('paper', 'rock'), '三すくみ');
assert(!E.beats('rock', 'paper') && !E.beats('rock', 'rock'), '勝てない組み合わせ');
assert(E.counterOf('rock') === 'paper' && E.counterOf('scissors') === 'rock' && E.counterOf('paper') === 'scissors', 'カウンター');
assert(E.judge('rock', 'scissors') === 'win', 'プレイヤー勝ち');
assert(E.judge('rock', 'paper') === 'lose', 'プレイヤー負け');
assert(E.judge('rock', 'rock') === 'draw', 'あいこ');

/* 3) あいこはノーカウント */
g = E.createGame({ style: 'rocky', rng: seq([0.1]) });
var ev = E.resolveRound(g, 'rock', seq([0.1]));
assert(ev.cpuHand === 'rock' && ev.result === 'draw', 'あいこ判定');
assert(g.hp.player === 8 && g.hp.cpu === 8, 'あいこでダメージなし');
assert(g.playerStreak === 0 && g.cpuStreak === 0, 'あいこで連勝は増減しない');
assert(g.gauge === 0, 'あいこでゲージは増えない');
assert(g.round === 2 && g.history.length === 1, 'ラウンドが進む');

/* 4) 勝ち/負け/連勝ボーナス/ゲージ */
g = E.createGame({ style: 'rocky', rng: seq([0.1]) });
var ev1 = E.resolveRound(g, 'paper', seq([0.1]));
assert(ev1.cpuHand === 'rock' && ev1.result === 'win' && ev1.damage === 1, '勝ちは1ダメージ');
assert(g.hp.cpu === 7 && g.gauge === 1 && g.playerStreak === 1, 'HP/ゲージ/連勝の更新');
var ev2 = E.resolveRound(g, 'paper', seq([0.1]));
assert(ev2.damage === 1 && g.playerStreak === 2 && g.gauge === 2, '2連勝はまだ1ダメージ');
var ev3 = E.resolveRound(g, 'paper', seq([0.99, 0.1]));
assert(ev3.cpuHand === 'rock' && ev3.damage === 2, '3連勝目は2ダメージ');
assert(g.hp.cpu === 4 && g.playerStreak === 3 && g.gauge === 3, '連勝ボーナス後の状態');

/* 5) 負けで連勝リセット・CPUの連勝ボーナス */
g = E.createGame({ style: 'rocky', rng: seq([0.1]) });
E.resolveRound(g, 'paper', seq([0.1]));
assert(g.playerStreak === 1, 'プレイヤー連勝');
var lose1 = E.resolveRound(g, 'scissors', seq([0.1]));
assert(lose1.result === 'lose' && lose1.damage === 1, '負けは1ダメージ');
assert(g.hp.player === 7 && g.playerStreak === 0 && g.cpuStreak === 1, '負けで連勝リセット');
var lose2 = E.resolveRound(g, 'scissors', seq([0.1]));
var lose3 = E.resolveRound(g, 'scissors', seq([0.99, 0.1]));
assert(lose2.damage === 1 && lose3.damage === 2, 'CPUも3連勝目は2ダメージ');
assert(g.hp.player === 8 - 1 - 1 - 2 && g.cpuStreak === 3, 'CPU連勝ボーナス後の状態');

/* 6) 見切りゲージと必殺「先読み」 */
g = E.createGame({ style: 'rocky', rng: seq([0.1]) });
assertThrows(function () { E.startRead(g, seq([0.5])); }, 'ゲージ未満で先読みできてしまう');
E.resolveRound(g, 'paper', seq([0.1]));
E.resolveRound(g, 'paper', seq([0.1]));
E.resolveRound(g, 'paper', seq([0.99, 0.1]));
assert(E.canUseRead(g), '3勝でゲージ満タン');
var preview = E.startRead(g, seq([0.99]));
assert(preview === 'paper', '先読みでCPUの手が見える');
assert(g.gauge === 0 && g.preview === 'paper', 'ゲージ消費とプレビュー保持');
assert(!E.canUseRead(g), '先読み中は再使用できない');
var readWin = E.resolveRound(g, 'scissors', seq([0.5]));
assert(readWin.usedRead && readWin.cpuHand === 'paper' && readWin.result === 'win', '先読みはプレビュー通り');
assert(readWin.damage === 3, '先読み中の勝ちは3ダメージ');
assert(g.hp.cpu === 4 - 3 && g.gauge === 1, '先読み後のHPとゲージ');
assert(g.preview === null, 'プレビューはリセットされる');

/* 7) 不正入力と終了後の操作 */
g = E.createGame({ style: 'rocky', rng: seq([0.1]) });
assertThrows(function () { E.resolveRound(g, 'gun', seq([0.1])); }, '不正な手を受け付けてしまう');
g = E.createGame({ style: 'rocky', hp: 3, rng: seq([0.1]) });
E.resolveRound(g, 'paper', seq([0.1]));
E.resolveRound(g, 'paper', seq([0.1]));
var fin = E.resolveRound(g, 'paper', seq([0.99, 0.1]));
assert(fin.over && fin.winner === 'player', 'HP0で決着');
assert(g.hp.cpu === 0 && g.over && g.winner === 'player', '決着状態');
assertThrows(function () { E.resolveRound(g, 'paper', seq([0.1])); }, '終了後も打ててしまう');
assert(E.snapshot(g).over === true, 'snapshotに決着状態');
assert(E.snapshot(g).history.length === 3, 'snapshotに履歴');

/* 8) あなたの出しグセを読む: 同じ手を出し続けると読まれる */
g = E.createGame({ style: 'rocky', rng: seq([0.1]) });
E.resolveRound(g, 'rock', seq([0.1]));               /* r1: 読みなし */
E.resolveRound(g, 'rock', seq([0.1]));               /* r2: 遷移データなし */
for (var i = 0; i < 4; i++) {
  E.resolveRound(g, 'rock', seq([0.99, 0.1]));       /* r3-r6: 読みは外れる(0.99) */
}
var snap = E.snapshot(g);
assert(snap.predictability > 0.8, '出しグセの偏りを検出: ' + snap.predictability.toFixed(2));
assert(snap.readAccuracy === 0.55, '読み精度が上限に達する');
var readEv = E.resolveRound(g, 'rock', seq([0.0]));  /* r7: 読みが発動 */
assert(readEv.cpuHand === 'paper', '読まれるとカウンターを出される: ' + readEv.cpuHand);
assert(readEv.result === 'lose', '読まれた側は負ける');

/* 9) スタイルの出方（統計） */
function rate(fn, n, rng) {
  var hit = 0;
  for (var i = 0; i < n; i++) if (fn(rng)) hit++;
  return hit / n;
}
var rng = mulberry32(12345);
g = E.createGame({ style: 'rocky', rng: rng });
assert(rate(function (r) { return E.chooseCpuHand(g, r) === 'rock'; }, 3000, rng) > 0.45, 'ぐうたろうはグー多め');
g = E.createGame({ style: 'copycat', rng: rng });
g.lastPlayerHand = 'rock';
assert(rate(function (r) { return E.chooseCpuHand(g, r) === 'rock'; }, 3000, rng) > 0.45, 'まねっこは前の手をまねる');
g = E.createGame({ style: 'counter', rng: rng });
g.lastPlayerHand = 'rock';
assert(rate(function (r) { return E.chooseCpuHand(g, r) === 'paper'; }, 3000, rng) > 0.45, 'あとだしは勝つ手を出す');
g = E.createGame({ style: 'cycler', rng: rng });
g.lastCpuHand = 'rock';
assert(rate(function (r) { return E.chooseCpuHand(g, r) === 'paper'; }, 3000, rng) > 0.6, 'ぐるぐるは順番に出す');

/* 10) バランスシミュレーション: ランダムなプレイヤーとの勝率 */
var STYLES = E.STYLE_KEYS;
var totalGames = 0;
for (var s = 0; s < STYLES.length; s++) {
  var style = STYLES[s];
  var wins = 0;
  var games = 500;
  for (var k = 0; k < games; k++) {
    var r = mulberry32(1000 + s * 10000 + k);
    var game = E.createGame({ style: style, rng: r });
    var guard = 0;
    while (!game.over && guard++ < 500) {
      if (E.canUseRead(game) && r() < 0.3) E.startRead(game, r);
      E.resolveRound(game, E.HANDS[Math.floor(r() * 3)], r);
    }
    assert(guard < 500, 'シミュレーションが終わらない: ' + style);
    if (game.winner === 'player') wins++;
    totalGames++;
  }
  var wr = (wins / games * 100).toFixed(1);
  log('  ぐうたらプレイヤー vs ' + E.styleInfo(style).name + ': 勝率 ' + wr + '%');
  assert(wins / games > 0.1 && wins / games < 0.9, '勝率が極端: ' + style + ' ' + wr + '%');
}
log('engine tests OK (' + passed + ' アサーション + ' + totalGames + ' 試合シミュレーション)');
