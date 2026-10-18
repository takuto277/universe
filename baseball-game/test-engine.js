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
    var guess = Math.random() < 0.5 ? 'straight' : 'curve';
    E.resolvePitch(g, guess, E.randomPitch());
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

print('engine tests OK (11 項目 + ランダム1000試合)');
print('  勝敗: home ' + stats.home + ' / away ' + stats.away + ' / draw ' + stats.draw);
print('  平均投球数: ' + (stats.pitches / 1000).toFixed(1) + ' / 最大: ' + stats.maxPitches);
print('  平均合計得点: ' + (stats.runs / 1000).toFixed(1) + ' / 平均合計安打: ' + (stats.hits / 1000).toFixed(1));
