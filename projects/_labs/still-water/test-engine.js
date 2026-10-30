/* test-engine.js : STILL WATER のキャスト・アタリ・リール・8投 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/still-water/engine.js']);
var E = StillWaterEngine;
var passed = 0;
function assert(cond, m) { if (!cond) throw new Error('assert failed: ' + m); passed++; }

assert(E.CASTS === 8, '8投でない');
assert(E.FISH.length === 5, '魚が5種でない');

var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start();
var s = game.getState();
assert(s.phase === 'aim' && s.castsLeft === 8, '開始状態が不正');
assert(typeof game.setAimX === 'function', 'setAimXがない');

// チャージしてキャスト
assert(game.setAimX(0.8) === true, '狙いを変更できない');
assert(game.getState().aimX > 0.7, '右の狙いが記録されない');
game.press();
for (var i = 0; i < 80; i++) game.update(i / 60, 1 / 60);
s = game.getState();
assert(s.charge > 0.5, 'ホールドでチャージされない');
game.release();
s = game.getState();
assert(s.phase === 'wait' && s.castsLeft === 7, 'キャストされない');
assert(s.power > 0.5, 'キャストパワーが不正');
assert(s.spot === 'rocks', '右の遠投で岩場にならない');

// アタリを待ってフッキング
var guard = 0;
while (game.getState().phase === 'wait' && guard++ < 300) game.update(guard / 60, 1 / 60);
s = game.getState();
assert(s.phase === 'bite', 'アタリにならない');
game.press();
s = game.getState();
assert(s.phase === 'reel' && s.holding === true, 'フッキングできない');
assert(s.hookQuality === 'perfect', '即フッキングがPERFECTでない');

// リールで釣り上げる（テンションを交互に逃がす）
guard = 0;
while (game.getState().phase === 'reel' && guard++ < 1200) {
  if (game.state.tension > 0.72 && game.state.holding) game.release();
  else if (game.state.tension < 0.5 && !game.state.holding) game.press();
  game.update(guard / 60, 1 / 60);
}
s = game.getState();
assert(s.phase === 'caught', '釣り上げられない');
assert(s.catchesCount === 1 && s.score > 0, '釣果が記録されない');
assert(s.streak === 1 && s.bestStreak === 1, 'ストリークが記録されない');
assert(s.perfectHooks === 1, 'PERFECT HOOK数が記録されない');

// アタリを逃すとキャストを消費して次のアタリへ
var miss = E.createGame();
miss.start();
miss.press();
for (var mi = 0; mi < 80; mi++) miss.update(mi / 60, 1 / 60);
miss.release();
guard = 0;
while (miss.getState().phase === 'wait' && guard++ < 300) miss.update(guard / 60, 1 / 60);
assert(miss.getState().phase === 'bite', 'ミステストのアタリがない');
for (var bi = 0; bi < 120 && miss.getState().phase === 'bite'; bi++) miss.update(bi / 60, 1 / 60);
s = miss.getState();
assert(s.phase === 'escaped', 'アタリを逃してもescapedにならない');

// 自動プレイで8投を終える
var auto = E.createGame();
auto.start();
var steps = 0;
while (auto.getState().phase !== 'finished' && steps < 8000) {
  auto.autoStep();
  auto.update(steps / 60, 1 / 60);
  steps++;
}
s = auto.getState();
assert(s.phase === 'finished', '8投で終了しない');
assert(s.result && s.result.score > 0, '自動プレイのスコアがない');
assert(s.result.catchesCount > 0, '自動プレイで釣れない');
assert(s.result.misses === 0, '自動プレイでミスしている');

print('engine tests OK (' + passed + ' assertions)');
