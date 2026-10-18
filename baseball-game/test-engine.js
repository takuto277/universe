/* test-engine.js : engine.js のルール検証とバランスシミュレーション（jsc で実行）
 * 実行例:
 *   cd universe/baseball-game && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = BaseballEngine;
}

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}
function log(m) { print(m); }

/* 1) 初期状態 */
var g = E.createGame();
assert(g.totalInnings === 3, '3回制');
assert(g.inning === 1 && g.half === 'top', '開始は1回表');
assert(g.strikes === 0 && g.balls === 0, 'カウント初期値');
assert(g.runners.length === 3 && !g.runners[0], 'ランナーなし');
assert(E.PITCH_ORDER.length === 9, '9球種');

/* 2) resolvePitch: 正解は状態を変えない */
g = E.createGame();
var ev = E.resolvePitch(g, 'curve', 'curve');
assert(ev.correct, '正解判定');
assert(g.strikes === 0, '正解ではストライクが増えない');
assert(g.hits.home === 0 && g.hits.away === 0, '正解だけでは安打にならない（resolveHit が担当）');

/* 3) resolvePitch: 不正解はストライク、3つでチェンジ */
g = E.createGame();
for (var i = 0; i < 2; i++) {
  var ev3 = E.resolvePitch(g, 'curve', 'straight');
  assert(!ev3.correct && !ev3.inningEnded, 'ストライク途中');
}
assert(g.strikes === 2, 'ストライク2');
var ev3b = E.resolvePitch(g, 'curve', 'straight');
assert(ev3b.strikeout && ev3b.inningEnded, '3ストライクでチェンジ');
assert(g.half === 'bottom' && g.strikes === 0, '攻守交代');

/* 4) resolveHit: 単打の進塁 */
g = E.createGame();
g.runners = [true, false, true];
var hs = E.resolveHit(g, 'single');
assert(hs.runs === 1, '単打で3塁ランナー生還');
assert(g.runners[0] === true && g.runners[1] === true && g.runners[2] === false, '単打の進塁');
assert(g.score.away === 1 && g.hits.away === 1, '得点と安打');

/* 5) resolveHit: 二塁打の進塁 */
g = E.createGame();
g.runners = [true, true, false];
var hd = E.resolveHit(g, 'double');
assert(hd.runs === 1, '二塁打で2塁ランナー生還');
assert(g.runners[1] === true && g.runners[2] === true && g.runners[0] === false, '二塁打の進塁');

/* 6) resolveHit: ホームラン（満塁） */
g = E.createGame();
g.runners = [true, true, true];
var hh = E.resolveHit(g, 'hr');
assert(hh.runs === 4, '満塁ホームランで4点');
assert(g.runners[0] === false && g.runners[1] === false && g.runners[2] === false, 'HRで塁が空');
assert(g.hits.away === 1, 'HRは安打1');

/* 7) resolveTake: ボール・四球 */
g = E.createGame();
for (var b = 0; b < 3; b++) {
  var tv = E.resolveTake(g, false);
  assert(!tv.walk && !tv.calledStrike, '3球目まではボール');
}
assert(g.balls === 3, 'ボール3');
var tv2 = E.resolveTake(g, false);
assert(tv2.walk, '4ボールで四球');
assert(g.balls === 0 && g.runners[0] === true, '四球で出塁・カウントリセット');
assert(g.hits.away === 0, '四球は安打ではない');

/* 8) resolveTake: 見逃しストライクとチェンジ */
g = E.createGame();
g.runners = [true, false, false];
var ts = E.resolveTake(g, true);
assert(ts.calledStrike && g.strikes === 1, '見逃しストライク');
assert(g.balls === 0 && g.runners[0] === true, '見逃しはボール数を変えない');
E.resolveTake(g, true);
var ts3 = E.resolveTake(g, true);
assert(ts3.strikeout && ts3.inningEnded, '見逃し3つでチェンジ');

/* 9) 四球の押し出しとサヨナラ */
g = E.createGame();
g.inning = 3; g.half = 'bottom';
g.score.home = 0; g.score.away = 0;
g.runners = [true, true, true];
g.balls = 3;
var wv = E.resolveTake(g, false);
assert(wv.walk && wv.runs === 1, '押し出し四球');
assert(wv.walkoff && wv.gameEnded && g.over && g.result === 'home', '押し出しサヨナラ');

/* 10) サヨナラヒット */
g = E.createGame();
g.inning = 3; g.half = 'bottom';
g.runners = [false, false, true];
var hv = E.resolveHit(g, 'single');
assert(hv.walkoff && g.result === 'home' && g.score.home === 1, 'サヨナラヒット');

/* 11) 3回表終了でホームリードなら試合終了（3回裏は無し） */
g = E.createGame();
g.inning = 3; g.half = 'top';
g.score.home = 2; g.score.away = 1;
E.resolvePitch(g, 'a', 'b');
E.resolvePitch(g, 'a', 'b');
var eg = E.resolvePitch(g, 'a', 'b');
assert(eg.gameEnded && g.result === 'home' && g.over, '3回表終了で試合終了');

/* 12) 3回裏終了で同点なら引き分け */
g = E.createGame();
g.inning = 3; g.half = 'bottom';
g.score.home = 1; g.score.away = 1;
E.resolvePitch(g, 'a', 'b');
E.resolvePitch(g, 'a', 'b');
var eg2 = E.resolvePitch(g, 'a', 'b');
assert(eg2.gameEnded && g.result === 'draw', '同点引き分け');

/* 13) timingResult のしきい値 */
assert(E.timingResult(0) === 'hr', '中央はHR');
assert(E.timingResult(-10) === "hr" && E.timingResult(10) === "hr", "HR帯の端");
assert(E.timingResult(11) === "double" && E.timingResult(-24) === "double", "二塁打帯");
assert(E.timingResult(25) === "single" && E.timingResult(-50) === "single", "単打帯");

/* 14) 配球スタイル: 重み・得意/苦手・ゾーン率補正 */
var styleKeys14 = Object.keys(E.PITCH_STYLES);
assert(styleKeys14.length === 4, '4つの配球スタイル');
for (var s14 = 0; s14 < styleKeys14.length; s14++) {
  var sk14 = styleKeys14[s14];
  var st14 = E.PITCH_STYLES[sk14];
  assert(typeof st14.name === 'string' && st14.name.length > 0, 'スタイル名: ' + sk14);
  for (var w14 = 0; w14 < E.PITCH_ORDER.length; w14++) {
    assert(st14.weights[E.PITCH_ORDER[w14]] > 0, sk14 + ' の重み: ' + E.PITCH_ORDER[w14]);
  }
  assert(st14.good.length >= 1 && st14.bad.length >= 1, sk14 + ' の得意/苦手が空');
  for (var gi14 = 0; gi14 < st14.good.length; gi14++) {
    var gp14 = st14.good[gi14];
    assert(E.PITCH_LABELS[gp14], '得意球が未知: ' + gp14);
    assert(st14.bad.indexOf(gp14) < 0, '得意と苦手が重複: ' + gp14);
    assert(E.zoneRateFor(sk14, gp14) > E.ZONE_RATES[gp14], '得意球はゾーン率UP: ' + sk14 + '/' + gp14);
  }
  for (var bi14 = 0; bi14 < st14.bad.length; bi14++) {
    var bp14 = st14.bad[bi14];
    assert(E.PITCH_LABELS[bp14], '苦手球が未知: ' + bp14);
    assert(E.zoneRateFor(sk14, bp14) < E.ZONE_RATES[bp14], '苦手球はゾーン率DOWN: ' + sk14 + '/' + bp14);
  }
  for (var pk14 = 0; pk14 < E.PITCH_ORDER.length; pk14++) {
    var z14 = E.zoneRateFor(sk14, E.PITCH_ORDER[pk14]);
    assert(z14 >= 0.12 && z14 <= 0.92, 'ゾーン率の範囲: ' + z14);
  }
}

/* 14b) pitcherPitch: 履歴記録・傾向集計・ゾーン率の実測 */
var st14c = E.createGame('breaking');
st14c.strikes = 2;
var N14 = 30000, zoneCount14 = {}, typeCount14 = {};
for (var t14 = 0; t14 < N14; t14++) {
  var pp14 = E.pitcherPitch(st14c);
  assert(E.PITCH_LABELS[pp14.actual], '未知の球種: ' + pp14.actual);
  typeCount14[pp14.actual] = (typeCount14[pp14.actual] || 0) + 1;
  if (pp14.zone) zoneCount14[pp14.actual] = (zoneCount14[pp14.actual] || 0) + 1;
}
assert(st14c.pitcherHistory.length === N14, '投球履歴が記録される');
assert(st14c.pitcherHistory[0].strikes === 2 && st14c.pitcherHistory[0].balls === 0, '履歴にカウント');
var tend14 = E.pitchTendencies(st14c);
assert(tend14.style === 'breaking' && tend14.styleName === '変化球派', '傾向のスタイル情報');
assert(tend14.rows[2].total === N14, '2ストライク行の集計数: ' + tend14.rows[2].total);
var sum14 = 0;
for (var j14 = 0; j14 < tend14.rows[2].items.length; j14++) sum14 += tend14.rows[2].items[j14].count;
assert(sum14 === N14, '行の内訳合計');
assert(tend14.rows[2].items[0].pitch === 'slider', '変化球派の2ストライクはスライダー最多: ' + tend14.rows[2].items[0].pitch);
assert(tend14.rows[0].items.length === 0 && tend14.rows[1].items.length === 0, '他カウントは空');
var slz14 = zoneCount14.slider / typeCount14.slider;
var stz14 = zoneCount14.straight / typeCount14.straight;
assert(Math.abs(slz14 - E.zoneRateFor('breaking', 'slider')) < 0.03, '得意球ゾーン率実測: ' + slz14);
assert(Math.abs(stz14 - E.zoneRateFor('breaking', 'straight')) < 0.03, '苦手球ゾーン率実測: ' + stz14);

/* 14c) tendencyWeights: カウントでクセが変わる */
var w14a = E.tendencyWeights(E.createGame('power'));
assert(Math.abs(w14a.straight - 34 * 1.6) < 1e-9, '0-0はストレート賭け: ' + w14a.straight);
var st14b = E.createGame('power');
st14b.balls = 2;
var w14b = E.tendencyWeights(st14b);
assert(Math.abs(w14b.straight - 34 * 1.8) < 1e-9, 'ボール先行はストレート: ' + w14b.straight);
assert(Math.abs(w14b.cutter - 14 * 1.3) < 1e-9, 'ボール先行はカット: ' + w14b.cutter);
var st14d = E.createGame('power');
st14d.strikes = 2;
var w14d = E.tendencyWeights(st14d);
assert(Math.abs(w14d.straight - 34 * 1.9) < 1e-9, '2ストライクの剛球派はストレート: ' + w14d.straight);
assert(Math.abs(w14d.slider - 12 * 1.4) < 1e-9, '2ストライクの剛球派はスライダー: ' + w14d.slider);

/* 14d) createGame: スタイルはランダムに選ばれ、指定もできる */
var seen14 = {};
for (var n14 = 0; n14 < 400; n14++) {
  var g14 = E.createGame();
  seen14[g14.pitcherStyle] = true;
  assert(g14.pitcherHistory.length === 0, '履歴は初期化');
}
assert(Object.keys(seen14).length === 4, 'ランダムに4スタイル登場: ' + Object.keys(seen14).join(','));
assert(E.createGame('tricky').pitcherStyle === 'tricky', 'スタイル指定');

/* 15) CPUの読み: 基本・連投・パターン */
var st15 = E.createGame();
var dec15 = E.cpuBatterDecision(st15, 'straight');
assert(Math.abs(dec15.accuracy - E.CPU_READ_BASE) < 1e-9, '履歴なしの読み');
assert(st15.playerHistory.length === 1, '投球履歴が記録される');

st15 = E.createGame();
for (var h15 = 0; h15 < 10; h15++) st15.playerHistory.push('curve');
var dec15b = E.cpuBatterDecision(st15, 'curve');
assert(dec15b.accuracy > 0.65, '10連投は読みが鋭い: ' + dec15b.accuracy);
assert(dec15b.streak >= 10, '連投数検出');

st15 = E.createGame();
st15.playerHistory = ['straight', 'curve', 'straight', 'curve'];
var dec15c = E.cpuBatterDecision(st15, 'straight');
assert(dec15c.pattern, '交互パターン検出');
assert(dec15c.accuracy >= E.CPU_READ_BASE + E.CPU_PATTERN_BONUS, 'パターンで読み上昇');

var accRuns = 6000, correctSum = 0;
for (var c15 = 0; c15 < accRuns; c15++) {
  var s15 = E.createGame();
  if (E.cpuBatterDecision(s15, 'straight').correct) correctSum++;
}
var rate0 = correctSum / accRuns;
assert(Math.abs(rate0 - E.CPU_READ_BASE) < 0.03, '履歴なし精度: ' + rate0);

/* 16) フル試合の不変条件（スマート戦略1000試合） */
var stats = { home: 0, away: 0, draw: 0, pitches: 0, runs: 0, hits: 0, homeRuns: 0, awayRuns: 0, maxPitches: 0 };
var smartAttack = function (state) {
  var w = E.tendencyWeights(state);
  var best = null, bestW = -1;
  for (var i = 0; i < E.PITCH_ORDER.length; i++) {
    if (w[E.PITCH_ORDER[i]] > bestW) { bestW = w[E.PITCH_ORDER[i]]; best = E.PITCH_ORDER[i]; }
  }
  if (E.zoneRateFor(state.pitcherStyle, best) < 0.5 && Math.random() < 0.3) return { action: 'take' };
  return { action: 'swing', pitch: best };
};
var robotTiming = function () { return (Math.random() + Math.random() - 1) * 30; };

function playFullGame(cpuPitch) {
  var sg = E.createGame();
  var pitches = 0;
  while (!sg.over) {
    assert(pitches < 2000, '試合が終わらない');
    pitches++;
    if (sg.half === 'top') {
      var thrown = cpuPitch(sg);
      var dec = E.cpuBatterDecision(sg, thrown);
      var ev = E.resolvePitch(sg, dec.guess, thrown);
      if (ev.correct) E.resolveHit(sg, Math.random() < 0.15 ? 'double' : 'single');
    } else {
      var actual = E.pitcherPitch(sg);
      var act = smartAttack(sg);
      if (act.action === 'take') {
        E.resolveTake(sg, actual.zone);
      } else {
        var ev2 = E.resolvePitch(sg, act.pitch, actual.actual);
        if (ev2.correct) E.resolveHit(sg, E.timingResult(robotTiming()));
      }
    }
    assert(sg.inning >= 1 && sg.inning <= 3, 'イニング範囲: ' + sg.inning);
    assert(sg.strikes >= 0 && sg.strikes <= 2, 'ストライク範囲: ' + sg.strikes);
    assert(sg.balls >= 0 && sg.balls <= 3, 'ボール範囲: ' + sg.balls);
  }
  return { g: sg, pitches: pitches };
}

for (var i16 = 0; i16 < 1000; i16++) {
  var res = playFullGame(function () { return E.randomPitch(); });
  var sg2 = res.g;
  if (sg2.result === 'home') { assert(sg2.score.home > sg2.score.away, '勝敗整合 home'); stats.home++; }
  else if (sg2.result === 'away') { assert(sg2.score.away > sg2.score.home, '勝敗整合 away'); stats.away++; }
  else { assert(sg2.score.home === sg2.score.away, '引き分け整合'); stats.draw++; }
  var sa = 0, sh = 0;
  for (var k = 0; k < 3; k++) { sa += sg2.linescore.away[k] || 0; sh += sg2.linescore.home[k] || 0; }
  assert(sa === sg2.score.away && sh === sg2.score.home, 'ラインスコア合計一致');
  stats.pitches += res.pitches;
  stats.runs += sg2.score.home + sg2.score.away;
  stats.hits += sg2.hits.home + sg2.hits.away;
  stats.homeRuns += sg2.score.home;
  stats.awayRuns += sg2.score.away;
  if (res.pitches > stats.maxPitches) stats.maxPitches = res.pitches;
}

/* 17) 配球を変えないと罰される（同球連投 vs 配球を散らす） */
var SIM_N = 300;
var spam = { cpuRuns: 0 }, mixed = { cpuRuns: 0 };
for (var s17 = 0; s17 < SIM_N; s17++) {
  spam.cpuRuns += playFullGame(function () { return 'straight'; }).g.score.away;
}
for (var s17b = 0; s17b < SIM_N; s17b++) {
  mixed.cpuRuns += playFullGame(function () { return E.randomPitch(); }).g.score.away;
}
assert(spam.cpuRuns / SIM_N > mixed.cpuRuns / SIM_N * 1.5, '同じ球ばかりだと失点が増える');

log('engine tests OK (' + passed + ' アサーション + スマート1000試合)');
log('  勝敗: home ' + stats.home + ' / away ' + stats.away + ' / draw ' + stats.draw);
log('  平均投球数: ' + (stats.pitches / 1000).toFixed(1) + ' / 最大: ' + stats.maxPitches);
log('  平均合計得点: ' + (stats.runs / 1000).toFixed(1) + ' / 平均合計安打: ' + (stats.hits / 1000).toFixed(1));
log('  平均得点: home ' + (stats.homeRuns / 1000).toFixed(1) + ' / away ' + (stats.awayRuns / 1000).toFixed(1));
log('  CPU得点: 配球を散らす ' + (mixed.cpuRuns / SIM_N).toFixed(1) +
  ' / ストレート連投 ' + (spam.cpuRuns / SIM_N).toFixed(1));
