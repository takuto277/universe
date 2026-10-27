/* test-engine.js : engine.js のルール検証とバランスシミュレーション（jsc で実行）
 * 実行例:
 *   cd projects/_labs/baseball-game && jsc test-engine.js
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

/* 3b) resolvePlayerSwing: 予想外しは明らかなボール球だけボール、際どいボール/ゾーン球は空振り */
g = E.createGame('power'); /* 剛球派: ストレート91% / フォーク20% / カーブ48% */
var swb = E.resolvePlayerSwing(g, 'curve', 'fork', false);
assert(!swb.correct && swb.ball && swb.take, '明らかなボール球(ゾーン20%)はボール扱い');
assert(g.strikes === 0 && g.balls === 1, '空振りストライクにならない');
assert(!swb.strikeout && !swb.inningEnded, 'チェンジにならない');
assert(swb.take.calledStrike === false, '見逃しストライクでもない');
g = E.createGame('power');
var swb2 = E.resolvePlayerSwing(g, 'curve', 'straight', false);
assert(!swb2.correct && swb2.whiff && !swb2.ball, '際どいボール球(ゾーン91%)は空振り');
assert(g.strikes === 1 && g.balls === 0, '際どいボール球の予想外しはストライク');
g = E.createGame('power');
var swc = E.resolvePlayerSwing(g, 'straight', 'straight', true);
assert(swc.correct && g.strikes === 0 && g.balls === 0, '正解はカウント不変');
assert(!swc.ball && !swc.whiff, '正解はボール/空振りフラグなし');
g = E.createGame('power');
var swd = E.resolvePlayerSwing(g, 'curve', 'straight', true);
assert(!swd.correct && swd.whiff && !swd.ball, '予想外し+ゾーン球は空振り');
assert(g.strikes === 1, 'ゾーン球の予想外しはストライク');
g = E.createGame('power');
g.balls = 3;
var swf = E.resolvePlayerSwing(g, 'curve', 'fork', false);
assert(swf.ball && swf.take.walk && g.runners[0] === true, '予想外しの4球目明らかなボールは四球');
g = E.createGame('power');
E.resolvePlayerSwing(g, 'curve', 'straight', true);
E.resolvePlayerSwing(g, 'curve', 'straight', true);
var swk = E.resolvePlayerSwing(g, 'curve', 'straight', true);
assert(swk.strikeout && swk.inningEnded, '予想外し3球でチェンジ');
g = E.createGame();
g.over = true;
var swThrew = false;
try { E.resolvePlayerSwing(g, 'a', 'b', false); } catch (e2) { swThrew = true; }
assert(swThrew, '試合終了後は例外');

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

/* 14) 配球スタイル: 持ち球(arsenal)・重み・得意/苦手・ゾーン率補正 */
var styleKeys14 = Object.keys(E.PITCH_STYLES);
assert(styleKeys14.length === 4, '4つの配球スタイル');
for (var s14 = 0; s14 < styleKeys14.length; s14++) {
  var sk14 = styleKeys14[s14];
  var st14 = E.PITCH_STYLES[sk14];
  assert(typeof st14.name === 'string' && st14.name.length > 0, 'スタイル名: ' + sk14);
  assert(st14.arsenal && st14.arsenal.length === 5, sk14 + ' の持ち球は5球種');
  for (var a14 = 0; a14 < st14.arsenal.length; a14++) {
    var ap14 = st14.arsenal[a14];
    assert(E.PITCH_ORDER.indexOf(ap14) >= 0, '持ち球が未知: ' + ap14);
    assert(E.PITCH_LABELS[ap14], '持ち球にラベルがない: ' + ap14);
    assert(st14.weights[ap14] > 0, sk14 + ' の持ち球の重み: ' + ap14);
  }
  assert(st14.arsenal.indexOf(st14.primary) >= 0, sk14 + ' の看板球は持ち球');
  assert(st14.primary === st14.good[0], sk14 + ' の得意1番手は看板球');
  for (var fk14 in st14.finish) {
    if (Object.prototype.hasOwnProperty.call(st14.finish, fk14)) {
      assert(st14.arsenal.indexOf(fk14) >= 0, sk14 + ' の決め球は持ち球: ' + fk14);
    }
  }
  assert(st14.good.length >= 1 && st14.bad.length >= 1, sk14 + ' の得意/苦手が空');
  for (var gi14 = 0; gi14 < st14.good.length; gi14++) {
    var gp14 = st14.good[gi14];
    assert(E.PITCH_LABELS[gp14], '得意球が未知: ' + gp14);
    assert(st14.arsenal.indexOf(gp14) >= 0, '得意球は持ち球: ' + sk14 + '/' + gp14);
    assert(st14.bad.indexOf(gp14) < 0, '得意と苦手が重複: ' + gp14);
    assert(E.zoneRateFor(sk14, gp14) > E.ZONE_RATES[gp14], '得意球はゾーン率UP: ' + sk14 + '/' + gp14);
  }
  for (var bi14 = 0; bi14 < st14.bad.length; bi14++) {
    var bp14 = st14.bad[bi14];
    assert(E.PITCH_LABELS[bp14], '苦手球が未知: ' + bp14);
    assert(st14.arsenal.indexOf(bp14) >= 0, '苦手球は持ち球: ' + sk14 + '/' + bp14);
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
var arsenal14 = E.PITCH_STYLES.breaking.arsenal;
for (var tk14 in typeCount14) {
  if (Object.prototype.hasOwnProperty.call(typeCount14, tk14)) {
    assert(arsenal14.indexOf(tk14) >= 0, '持ち球以外を投げた: ' + tk14);
  }
}
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

var st14e = E.createGame('breaking');
st14e.balls = 0; st14e.strikes = 1;
var w14e = E.tendencyWeights(st14e);
assert(Math.abs(w14e.slider - 24 * 1.5) < 1e-9, '1ストライクは看板球(変化球派): ' + w14e.slider);
assert(Math.abs(w14e.straight - 16) < 1e-9, '1ストライク(0-1)はストレート補正なし: ' + w14e.straight);

var st14f = E.createGame('power');
st14f.balls = 1; st14f.strikes = 0;
var w14f = E.tendencyWeights(st14f);
assert(Math.abs(w14f.straight - 34 * 1.8) < 1e-9, '1ボール先行でもストレート: ' + w14f.straight);
assert(Math.abs(w14f.cutter - 14 * 1.3) < 1e-9, '1ボール先行でもカット: ' + w14f.cutter);

var st14g = E.createGame('power');
st14g.balls = 2; st14g.strikes = 2;
var w14g = E.tendencyWeights(st14g);
assert(Math.abs(w14g.straight - 34 * 1.9) < 1e-9, '2ストライクはボール先行でも決め球優先: ' + w14g.straight);

/* 14c-2) tendencyWeights: 持ち球以外の重みは常に0 */
var countSeqs14 = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [3, 2]];
for (var s14b = 0; s14b < styleKeys14.length; s14b++) {
  for (var c14 = 0; c14 < countSeqs14.length; c14++) {
    var sg14 = E.createGame(styleKeys14[s14b]);
    sg14.balls = countSeqs14[c14][0];
    sg14.strikes = countSeqs14[c14][1];
    var ww14 = E.tendencyWeights(sg14);
    for (var p14 = 0; p14 < E.PITCH_ORDER.length; p14++) {
      var kk14 = E.PITCH_ORDER[p14];
      var inAr14 = E.PITCH_STYLES[styleKeys14[s14b]].arsenal.indexOf(kk14) >= 0;
      assert(inAr14 ? ww14[kk14] > 0 : ww14[kk14] === 0,
        '持ち球の重み: ' + styleKeys14[s14b] + ' ' + kk14 + ' @' + countSeqs14[c14].join('-'));
    }
  }
}

/* 14c-3) pitchTendencies: 持ち球と看板球を返す */
var tend14x = E.pitchTendencies(E.createGame('tricky'));
assert(tend14x.arsenal === E.PITCH_STYLES.tricky.arsenal, '傾向に持ち球が含まれる');
assert(tend14x.primary === 'changeup', '傾向に看板球が含まれる');

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

/* 15a) readAccuracy: 読み精度の計算（副作用なし） */
var st15r = E.createGame();
var r15 = E.readAccuracy(st15r, 'straight');
assert(Math.abs(r15.accuracy - E.CPU_READ_BASE) < 1e-9, 'readAccuracy: 履歴なしの基本精度');
assert(r15.streak === 0 && !r15.pattern && r15.count === 0, 'readAccuracy: 初期状態');
st15r.playerHistory = ['straight', 'curve', 'straight', 'curve'];
var r15b = E.readAccuracy(st15r, 'straight');
assert(r15b.pattern && r15b.count === 2, 'readAccuracy: 交互パターン検出');
assert(st15r.playerHistory.length === 4, 'readAccuracyは履歴を変更しない');
var exp15 = E.CPU_READ_BASE + E.CPU_READ_BONUS * (2 / 5) + E.CPU_PATTERN_BONUS;
assert(Math.abs(r15b.accuracy - exp15) < 1e-9, 'readAccuracy: 精度計算: ' + r15b.accuracy);
var dec15r = E.cpuBatterDecision(st15r, 'straight', function () { return 0.999; });
assert(Math.abs(dec15r.accuracy - r15b.accuracy) < 1e-9, 'cpuBatterDecisionとreadAccuracyの精度一致');
assert(st15r.playerHistory.length === 5, 'cpuBatterDecisionは履歴を1件追加');
var r15c = E.readAccuracy(st15r, 'straight');
assert(r15c.streak === 1, '直前の1球だけでは連投扱いにしない: ' + r15c.streak);

/* 15b) 守備側のゾーン判定: 見送り→ボール、ボール球スイング、ゾーン率 */
var script15 = function (seq) {
  var i = 0;
  return function () { return seq[Math.min(i++, seq.length - 1)]; };
};
var st15z = E.createGame();
var pz15 = E.resolveCpuAtBat(st15z, 'straight', script15([0.9, 0.9]));
assert(pz15.zone === false && pz15.swung === false && st15z.balls === 1, 'ボールは見送られボールカウント');
assert(st15z.playerHistory.length === 1 && st15z.playerHistory[0] === 'straight', '見送りも履歴に残る');
var st15c = E.createGame();
var pc15 = E.resolveCpuAtBat(st15c, 'straight', script15([0.9, 0.1, 0.99, 0.99]));
assert(pc15.zone === false && pc15.swung === true && pc15.chased === true, 'ボール球に手を出す');
assert(st15c.strikes === 1, 'ボール球を空振りでストライク');
var st15k = E.createGame();
var pk15 = E.resolveCpuAtBat(st15k, 'straight', script15([0.1, 0.01, 0.9]));
assert(pk15.zone === true && pk15.chased === false && pk15.hit && pk15.hit.kind === 'single', 'ゾーンで読み勝ち=ヒット');
assert(st15k.hits.away === 1 && st15k.runners[0] === true, 'ヒットの進塁');

var st15ch = E.createGame();
assert(E.cpuChaseRate(st15ch) === E.CPU_CHASE_BASE, '基本の食い付き率');
st15ch.strikes = 2;
assert(E.cpuChaseRate(st15ch) === E.CPU_CHASE_PROTECT, '追い込まれると食い付く');
st15ch = E.createGame();
st15ch.balls = 3;
assert(E.cpuChaseRate(st15ch) === E.CPU_CHASE_PATIENT, 'ボール先行は慎重');

/* 15c) CPUは明らかなボール球に手を出さない（3ボールなら見送って四球） */
var st15d = E.createGame();
st15d.balls = 3;
var pd15 = E.resolveCpuAtBat(st15d, 'fork', script15([0.9, 0.2]));
assert(pd15.zone === false && pd15.swung === false && pd15.take.walk,
  '3ボールのボール球は振らずに四球');

/* 15d) ゾーン内の球は必ずスイング */
var st15e = E.createGame();
var pe15 = E.resolveCpuAtBat(st15e, 'straight', script15([0.1, 0.9, 0.99, 0.99]));
assert(pe15.zone === true && pe15.swung === true, 'ゾーン内は必ずスイング');

var N15 = 6000;
for (var zt15 = 0; zt15 < 2; zt15++) {
  var zk15 = zt15 === 0 ? 'straight' : 'fork';
  var zc15 = 0;
  var sg15 = null;
  for (var i15 = 0; i15 < N15; i15++) {
    if (!sg15 || sg15.over) sg15 = E.createGame();
    var p15 = E.resolveCpuAtBat(sg15, zk15);
    if (p15.zone) zc15++;
  }
  var est15 = zc15 / N15;
  assert(Math.abs(est15 - E.ZONE_RATES[zk15]) < 0.03, 'ゾーン率(' + zk15 + '): ' + est15);
}

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
      E.resolveCpuAtBat(sg, cpuPitch(sg));
    } else {
      var actual = E.pitcherPitch(sg);
      var act = smartAttack(sg);
      if (act.action === 'take') {
        E.resolveTake(sg, actual.zone);
      } else {
        var ev2 = E.resolvePlayerSwing(sg, act.pitch, actual.actual, actual.zone);
        if (ev2.correct) E.resolveHit(sg, actual.zone ? E.timingResult(robotTiming()) : 'single');
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
