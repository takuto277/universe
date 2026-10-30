/* test-engine.js : ORBIT WARD の防御・パルス・ミス・60秒 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/orbit-ward/engine.js']);
var E = OrbitWardEngine;
var passed = 0;
function assert(cond, m) { if (!cond) throw new Error('assert failed: ' + m); passed++; }

assert(E.DURATION === 60, '60秒でない');
assert(E.START_HP === 10, 'コアが10でない');

var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start(20261031);
var s = game.getState();
assert(s.phase === 'playing' && s.time === 0 && s.hp === 10, '開始状態が不正');
assert(s.shieldAngle < -1 && s.shieldAngle > -2, '初期シールド角度が不正');
assert(game.setShieldAngle(0) === true && Math.abs(game.getState().shieldAngle) < 0.001, 'シールド角度を変更できない');

// 最初のシャードを迎撃する
var guard = 0;
while (game.getState().shards.length === 0 && guard++ < 400) game.update(guard / 60, 1 / 60);
s = game.getState();
assert(s.shards.length > 0, 'シャードが出現しない');
var shard = s.shards[0];
game.setShieldAngle(shard.angle);
guard = 0;
while (game.getState().blocks === 0 && guard++ < 500) game.update(guard / 60, 1 / 60);
s = game.getState();
assert(s.blocks > 0, 'シールドで迎撃できない');
assert(s.perfectBlocks > 0, '角度を合わせてもPERFECTにならない');
assert(s.score > 0, '迎撃スコアがない');
assert(s.pulseCharge > 0, 'PULSEチャージがたまらない');
assert(s.combo > 0 && s.bestCombo > 0, 'チェーンが記録されない');

// チャージを満たしてパルスで全消去
guard = 0;
while (game.getState().shards.length === 0 && guard++ < 400) game.update(10 + guard / 60, 1 / 60);
game.state.pulseCharge = 1;
assert(game.pulse() === true, 'PULSEを発動できない');
s = game.getState();
assert(s.pulseUses === 1, 'PULSE使用数が記録されない');
assert(s.shards.length === 0, 'PULSEでシャードが消えない');
assert(s.pulseCharge === 0, 'PULSE後にチャージが残る');

// 角度を外すとコアが傷つく
var miss = E.createGame();
miss.start(20261031);
guard = 0;
while (miss.getState().shards.length === 0 && guard++ < 400) miss.update(guard / 60, 1 / 60);
var bad = miss.getState().shards[0];
miss.setShieldAngle(bad.angle + Math.PI);
guard = 0;
while (miss.getState().hp === 10 && guard++ < 800) miss.update(guard / 60, 1 / 60);
s = miss.getState();
assert(s.hp < 10, 'シールドを外してもコアが傷つかない');
assert(s.misses > 0 && s.combo === 0, 'ミスでチェーンが切れない');

// 自動プレイで60秒を終える（固定シード）
var auto = E.createGame();
auto.start(20261031);
var steps = 0;
while (auto.getState().phase !== 'finished' && steps < 5000) {
  auto.autoStep();
  auto.update(steps / 60, 1 / 60);
  steps++;
}
s = auto.getState();
assert(s.phase === 'finished', '60秒で終了しない');
assert(s.result && s.result.score > 0, '結果スコアがない');
assert(s.result.blocks > 0 && s.result.perfectBlocks > 0, '結果に迎撃数がない');
assert(s.result.rank && s.result.rank !== '—', 'ランクがない');
assert(s.result.time <= 60, '結果時間が60秒を超える');
assert(s.result.hp >= 0, '結果HPが不正');

print('engine tests OK (' + passed + ' assertions)');
