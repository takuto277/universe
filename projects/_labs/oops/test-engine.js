/* test-engine.js : OOPS のロジック検証（jsc で実行）
 *   cd projects/_labs/oops && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = OopsEngine;
}

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}

function newGame(seed) {
  var g = E.createGame({ seed: seed == null ? 20261124 : seed });
  E.start(g);
  return g;
}

function tick(g, ms) {
  var left = ms;
  while (left > 0) {
    var d = Math.min(50, left);
    E.update(g, d);
    left -= d;
  }
}

function answerCurrent(g, correct) {
  var q = g.current;
  var index = correct ? q.a : E.wrongIndexFor(q);
  assert(E.answer(g, index) === true, '回答できない');
  return index;
}

/* 1) 初期化とデッキ */
var g = E.createGame({ seed: 7 });
assert(g.phase === 'idle', '初期状態はidle');
assert(g.questions.length === E.TOTAL_QUESTIONS, '問題数が18でない');
assert(g.current === null, '開始前は問題がない');
assert(g.timeLeft === E.START_TIME, '開始前の残り時間が90でない');
E.start(g);
assert(g.phase === 'question' && g.index === 0, '開始後にquestionでない');
assert(g.current && g.current.choices.length === 4, '4択でない');
assert(g.timeLeft === E.START_TIME, '開始時の残り時間が90でない');

/* 2) 正解では時間が減らず、スコアとコンボが増える */
var firstScore = g.score;
answerCurrent(g, true);
assert(g.score > firstScore, '正解でスコアが増えない');
assert(g.timeLeft === E.START_TIME, '正解で時間が減った');
assert(g.combo === 1, '正解でコンボが1にならない');
assert(g.phase === 'reveal', '回答後にrevealにならない');
assert(g.reveal && g.reveal.wrong === false, '正解のrevealが不正');
tick(g, E.REVEAL_MS + 150);
assert(g.phase === 'question' && g.index === 1, '次の問題へ進まない');

/* 3) 誤答で時間が10秒進み、コンボが消える */
var before = g.timeLeft;
answerCurrent(g, false);
assert(g.timeLeft === before - E.WRONG_PENALTY, '誤答で10秒減らない');
assert(g.combo === 0, '誤答でコンボが消えない');
assert(g.wrong === 1, '誤答カウントが増えない');
assert(g.reveal && g.reveal.wrong === true && g.reveal.penalty === 10, '誤答のrevealが不正');
tick(g, E.REVEAL_MS + 150);
assert(g.index === 2, '誤答後に次の問題へ進まない');

/* 4) スキップは時間も得点も動かさない */
var scoreBeforeSkip = g.score;
var timeBeforeSkip = g.timeLeft;
var indexBeforeSkip = g.index;
assert(E.skip(g, false) === true, 'スキップできない');
assert(g.timeLeft === timeBeforeSkip, 'スキップで時間が減った');
assert(g.score === scoreBeforeSkip, 'スキップでスコアが増えた');
assert(g.skipped === 1, 'スキップ数が増えない');
assert(g.combo === 0, 'スキップでコンボが残る');
tick(g, E.REVEAL_MS + 150);
assert(g.index === indexBeforeSkip + 1, 'スキップ後に進まない');

/* 5) 時間切れは自動スキップになる */
var g2 = newGame(11);
tick(g2, E.QUESTION_MS + 120);
assert(g2.phase === 'reveal', '時間切れでrevealにならない');
assert(g2.reveal && g2.reveal.timedOut === true, '時間切れフラグが立たない');
assert(g2.skipped === 1, '時間切れがスキップとして数えられない');
assert(g2.timeLeft === E.START_TIME, '時間切れで時間が減った');

/* 6) 連続正解でコンボと倍率が上がる */
var g3 = newGame(21);
for (var c = 1; c <= 3; c++) {
  answerCurrent(g3, true);
  assert(g3.combo === c, 'コンボが連続で増えない: ' + g3.combo);
  tick(g3, E.REVEAL_MS + 150);
}
assert(g3.bestCombo === 3, 'ベストコンボが3でない');
assert(E.multiplierFor(1) === 1, 'コンボ1の倍率が1でない');
assert(E.multiplierFor(5) > E.multiplierFor(2), 'コンボ倍率が増えない');

/* 7) スピードボーナスの段階 */
assert(E.speedBonus(500).label === 'FLASH', '速答がFLASHでない');
assert(E.speedBonus(2000).label === 'FAST', '中速がFASTでない');
assert(E.speedBonus(3500).label === 'OK', '遅めがOKでない');
assert(E.speedBonus(6000).label === 'SLOW', '超過がSLOWでない');
assert(E.speedBonus(500).bonus > E.speedBonus(5000).bonus, '速いほどボーナスが高くない');

/* 8) 9回の誤答で時間が尽きてゲームオーバー */
var g4 = newGame(31);
for (var w = 0; w < 9; w++) {
  assert(g4.phase === 'question', 'ゲームオーバー前に終了した: ' + g4.phase);
  answerCurrent(g4, false);
  tick(g4, E.REVEAL_MS + 150);
}
assert(g4.phase === 'over', '9回の誤答で終了しない');
assert(g4.timeLeft === 0, '残り時間が0でない');
assert(g4.result && g4.result.clear === false, 'ゲームオーバーなのにclearがtrue');
assert(typeof g4.result.rank === 'string' && g4.result.rank.length === 1, 'ランクが入っていない');
assert(g4.wrong === 9, '誤答数が9でない');

/* 9) 全問正解でクリア */
var g5 = newGame(41);
for (var i = 0; i < E.TOTAL_QUESTIONS; i++) {
  answerCurrent(g5, true);
  tick(g5, E.REVEAL_MS + 150);
}
assert(g5.phase === 'over', '全問回答で終了しない');
assert(g5.result && g5.result.clear === true, 'クリアフラグが立たない');
assert(g5.result.correct === E.TOTAL_QUESTIONS, '正解数が18でない');
assert(g5.result.wrong === 0 && g5.result.skipped === 0, '正解のみなのに誤答/スキップがある');
assert(g5.result.timeBonus > 0, 'クリア時のタイムボーナスがない');
assert(g5.result.rank === 'S', '全問正解のランクがSでない: ' + g5.result.rank);

/* 10) autoStepで完走できる */
var g6 = newGame(51);
var guard = 0;
while (g6.phase !== 'over' && guard < 5000) {
  E.autoStep(g6);
  E.update(g6, 16);
  guard++;
}
assert(g6.phase === 'over', 'autoStepで終了しない');
assert(g6.result && g6.result.clear === true, 'autoStepでクリアできない');
assert(guard < 5000, 'autoStepが終わらない');

/* 11) 同じシードは同じ出題順になる */
var a = newGame(99);
var b = newGame(99);
assert(a.current.q === b.current.q, '同じシードで問題が違う');
assert(a.current.choices.join('|') === b.current.choices.join('|'), '同じシードで選択肢が違う');

/* 12) snapshotは答えを漏らさない */
var snap = E.snapshot(a);
assert(snap && snap.current, 'snapshotに問題がない');
assert(snap.current.a === undefined, 'snapshotが正解を漏らしている');
assert(snap.current.q === a.current.q, 'snapshotの問題が不一致');

print('engine tests OK (' + passed + ' assertions)');
