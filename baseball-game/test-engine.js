/* test-engine.js : engine.js のルール検証（jsc で実行）
 * 実行例:
 *   cd universe && jsc baseball-game/test-engine.js
 *   cd universe/baseball-game && jsc test-engine.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'baseball-game/engine.js']);
var E = (typeof globalThis !== 'undefined' ? globalThis : this).BaseballEngine;

function assert(cond, m) {
  if (!cond) { print('FAIL: ' + m); throw new Error(m); }
}

/* 1) 初期状態 */
var g = E.createGame();
assert(g.inning === 1 && g.half === 'top', '初期は1回表');
assert(g.linescore.away.length === 10 && g.linescore.home.length === 10, 'ラインスコアは10回分');
assert(g.strikes === 0 && g.runners.length === 3 && !g.over, 'カウント・塁の初期化');

/* 2) 正解でヒット、満塁なら1点・全員1つ進塁 */
g = E.createGame();
g.half = 'bottom';
g.runners = [true, true, true];
var ev = E.resolvePitch(g, 'straight', 'straight');
assert(ev.correct && ev.runs === 1, '満塁ヒットで1点');
assert(g.score.home === 1, 'ホームに得点が入る');
assert(g.runners[0] && g.runners[1] && g.runners[2], '満塁キープ');
assert(g.hits.home === 1, '安打カウント+1');
assert(g.linescore.home[0] === 1, 'ラインスコアに記録');

/* 3) 3ストライクで三振→チェンジ（攻守交代） */
g = E.createGame();
E.resolvePitch(g, 'straight', 'curve');
assert(g.strikes === 1, 'ストライク1');
E.resolvePitch(g, 'curve', 'straight');
assert(g.strikes === 2, 'ストライク2');
ev = E.resolvePitch(g, 'straight', 'curve');
assert(ev.strikeout && ev.inningEnded && !ev.gameEnded, '三振でチェンジ');
assert(g.half === 'bottom' && g.inning === 1, '1回裏へ');
assert(g.strikes === 0, 'カウントリセット');

/* 4) 9回裏終了で10回表へ */
g = E.createGame();
g.inning = 9; g.half = 'bottom';
E.resolvePitch(g, 'straight', 'curve');
E.resolvePitch(g, 'straight', 'curve');
ev = E.resolvePitch(g, 'straight', 'curve');
assert(g.inning === 10 && g.half === 'top' && !g.over, '10回表へ');

/* 5) 10回表終了時にホームリードならゲームセット */
g = E.createGame();
g.inning = 10; g.half = 'top'; g.score.home = 4; g.score.away = 2;
E.resolvePitch(g, 'straight', 'curve');
E.resolvePitch(g, 'straight', 'curve');
ev = E.resolvePitch(g, 'straight', 'curve');
assert(ev.gameEnded && g.over && g.result === 'home', '10回表でホーム勝利');

/* 6) 10回表終了時にリードなしなら10回裏へ */
g = E.createGame();
g.inning = 10; g.half = 'top'; g.score.home = 2; g.score.away = 2;
E.resolvePitch(g, 'straight', 'curve');
E.resolvePitch(g, 'straight', 'curve');
ev = E.resolvePitch(g, 'straight', 'curve');
assert(!g.over && g.half === 'bottom' && g.inning === 10, '10回裏へ');

/* 7) サヨナラ勝ち */
g = E.createGame();
g.inning = 10; g.half = 'bottom'; g.score.home = 3; g.score.away = 3;
g.runners = [false, false, true];
ev = E.resolvePitch(g, 'curve', 'curve');
assert(ev.runs === 1 && ev.walkoff && g.over && g.result === 'home' && g.score.home === 4, 'サヨナラ勝ち');

/* 8) ランナーなしヒットではサヨナラにならない */
g = E.createGame();
g.inning = 10; g.half = 'bottom'; g.score.home = 3; g.score.away = 4;
ev = E.resolvePitch(g, 'curve', 'curve');
assert(ev.runs === 0 && !g.over, '得点なしなら継続');

/* 9) 10回裏終了で同点→引き分け */
g = E.createGame();
g.inning = 10; g.half = 'bottom'; g.score.home = 4; g.score.away = 4;
E.resolvePitch(g, 'straight', 'curve');
E.resolvePitch(g, 'straight', 'curve');
ev = E.resolvePitch(g, 'straight', 'curve');
assert(ev.gameEnded && g.over && g.result === 'draw', '引き分け');

/* 10) 10回裏終了でビジターリード→ビジター勝利 */
g = E.createGame();
g.inning = 10; g.half = 'bottom'; g.score.home = 3; g.score.away = 5;
E.resolvePitch(g, 'straight', 'curve');
E.resolvePitch(g, 'straight', 'curve');
ev = E.resolvePitch(g, 'straight', 'curve');
assert(ev.gameEnded && g.over && g.result === 'away', 'ビジター勝利');

/* 11) ランダム1000試合の不変条件チェック */
var stats = { home: 0, away: 0, draw: 0, pitches: 0, runs: 0, hits: 0, maxPitches: 0 };
for (var i = 0; i < 1000; i++) {
  g = E.createGame();
  var pitches = 0;
  while (!g.over) {
    assert(pitches < 1000, '試合が終わらない');
    var pp11 = E.planPitch();
    E.resolvePitch(g, pp11.hint || 'straight', pp11.actual);
    pitches++;
    assert(g.inning >= 1 && g.inning <= 10, 'イニング範囲: ' + g.inning);
    assert(g.strikes >= 0 && g.strikes <= 2, 'ストライク範囲: ' + g.strikes);
  }
  assert(g.inning === 10, '必ず10回まで進む');
  if (g.result === 'home') { assert(g.score.home > g.score.away, '勝敗整合 home'); stats.home++; }
  else if (g.result === 'away') { assert(g.score.away > g.score.home, '勝敗整合 away'); stats.away++; }
  else { assert(g.score.home === g.score.away, '引き分け整合'); stats.draw++; }
  var sa = 0, sh = 0;
  for (var k = 0; k < 10; k++) { sa += g.linescore.away[k] || 0; sh += g.linescore.home[k] || 0; }
  assert(sa === g.score.away && sh === g.score.home, 'ラインスコア合計一致');
  stats.pitches += pitches;
  stats.runs += g.score.home + g.score.away;
  stats.hits += g.hits.home + g.hits.away;
  if (pitches > stats.maxPitches) stats.maxPitches = pitches;
}

/* 12) 重み付き抽選: 全9球種が出て、ストレートが最多 */
var countsW = {};
var N12 = 30000;
for (var w = 0; w < N12; w++) {
  var kk = E.weightedPick(E.BASE_WEIGHTS);
  countsW[kk] = (countsW[kk] || 0) + 1;
}
for (var pi = 0; pi < E.PITCH_ORDER.length; pi++) {
  assert(countsW[E.PITCH_ORDER[pi]] > 0, '抽選に ' + E.PITCH_ORDER[pi] + ' が出ない');
}
var straightShare = countsW.straight / N12;
assert(Math.abs(straightShare - 0.22) < 0.03, 'ストレート比率がおかしい: ' + straightShare);
var maxKey = E.PITCH_ORDER[0];
for (pi = 0; pi < E.PITCH_ORDER.length; pi++) {
  if (countsW[E.PITCH_ORDER[pi]] > countsW[maxKey]) maxKey = E.PITCH_ORDER[pi];
}
assert(maxKey === 'straight', '最多球種がストレートでない');

/* 13) planPitch: ヒント提示率72% / ヒント的中率55%＋重なり分 */
var N13 = 20000, hinted = 0, matched = 0;
for (var t13 = 0; t13 < N13; t13++) {
  var pl = E.planPitch();
  assert(E.PITCH_LABELS[pl.actual], 'planPitch が未知の球種: ' + pl.actual);
  if (pl.hint) {
    hinted++;
    if (pl.actual === pl.hint) matched++;
  }
}
var hintRate = hinted / N13;
var matchRate = matched / hinted;
assert(Math.abs(hintRate - 0.72) < 0.03, 'ヒント提示率がおかしい: ' + hintRate);
assert(matchRate > 0.55 && matchRate < 0.72, 'ヒント的中率がおかしい: ' + matchRate);

/* 14) cpuBatterDecision: 履歴なし36%台 / 連投で64%まで上昇 */
var accRuns = 6000, correctSum = 0;
for (var c14 = 0; c14 < accRuns; c14++) {
  var st14 = E.createGame();
  var dec = E.cpuBatterDecision(st14, 'straight');
  if (dec.correct) correctSum++;
  assert(st14.playerHistory.length === 1 && st14.playerHistory[0] === 'straight', '投球履歴が記録されない');
  if (!dec.correct) assert(dec.guess !== 'straight', '不正解時の予想が実際と一致している');
}
var rate0 = correctSum / accRuns;
assert(Math.abs(rate0 - 0.36) < 0.03, '履歴なしの読み精度がおかしい: ' + rate0);

var st14b = E.createGame();
for (var h14 = 0; h14 < 10; h14++) st14b.playerHistory.push('curve');
var dec2 = E.cpuBatterDecision(st14b, 'curve');
assert(Math.abs(dec2.accuracy - 0.64) < 1e-9, '連投時の読み精度がおかしい: ' + dec2.accuracy);

for (var r14 = 0; r14 < 500; r14++) {
  assert(E.randomPitchExcept('sinker') !== 'sinker', '除外抽選が失敗');
}

/* 15) バランスシミュレーション（ヒント追従プレイヤー vs CPU） */
var SIM_N = 300;
var sim = { home: 0, away: 0, draw: 0, homeRuns: 0, awayRuns: 0, homePitches: 0 };
var simSpam = { cpuRuns: 0 };
for (var s15 = 0; s15 < SIM_N; s15++) {
  var sg = E.createGame();
  var p15 = 0;
  while (!sg.over) {
    if (sg.half === 'top') {
      var thrown = E.randomPitch();
      var d15 = E.cpuBatterDecision(sg, thrown);
      E.resolvePitch(sg, d15.guess, thrown);
    } else {
      var pp15 = E.planPitch();
      E.resolvePitch(sg, pp15.hint || 'straight', pp15.actual);
      sim.homePitches++;
    }
    p15++;
    assert(p15 < 1000, 'シミュレーションが終わらない');
  }
  if (sg.result === 'home') sim.home++;
  else if (sg.result === 'away') sim.away++;
  else sim.draw++;
  sim.homeRuns += sg.score.home;
  sim.awayRuns += sg.score.away;
}

for (var s15b = 0; s15b < SIM_N; s15b++) {
  var g15 = E.createGame();
  var p15b = 0;
  while (!g15.over) {
    if (g15.half === 'top') {
      var thrown15 = 'straight';
      var d15b = E.cpuBatterDecision(g15, thrown15);
      E.resolvePitch(g15, d15b.guess, thrown15);
    } else {
      var pp15b = E.planPitch();
      E.resolvePitch(g15, pp15b.hint || 'straight', pp15b.actual);
    }
    p15b++;
    assert(p15b < 1000, 'spamシミュレーションが終わらない');
  }
  simSpam.cpuRuns += g15.score.away;
}

print('engine tests OK (15 項目 + ヒント追従1000試合)');
print('  勝敗: home ' + stats.home + ' / away ' + stats.away + ' / draw ' + stats.draw);
print('  平均投球数: ' + (stats.pitches / 1000).toFixed(1) + ' / 最大: ' + stats.maxPitches);
print('  平均合計得点: ' + (stats.runs / 1000).toFixed(1) + ' / 平均合計安打: ' + (stats.hits / 1000).toFixed(1));
print('  ヒント提示率: ' + (hintRate * 100).toFixed(1) + '% / 的中率: ' + (matchRate * 100).toFixed(1) + '%');
print('  読み精度: 履歴なし ' + (rate0 * 100).toFixed(1) + '% / 連投 ' + (dec2.accuracy * 100).toFixed(1) + '%');
print('  ヒント追従プレイ: あなた ' + (sim.homeRuns / SIM_N).toFixed(1) + ' - ' +
  (sim.awayRuns / SIM_N).toFixed(1) + ' CPU  勝率 ' +
  (sim.home / SIM_N * 100).toFixed(0) + '% (勝' + sim.home + ' 負' + sim.away + ' 分' + sim.draw + ')');
print('  CPU得点: 配球を散らす ' + (sim.awayRuns / SIM_N).toFixed(1) +
  ' / 同じ球ばかり(ストレート連投) ' + (simSpam.cpuRuns / SIM_N).toFixed(1));
