/* test-engine.js : BIN BANG の射撃・BANG・被弾・60秒終了 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['engine.js', 'projects/_labs/bin-bang/engine.js']);
var E = BinBangEngine;
var passed = 0;
function assert(cond, m) { if (!cond) throw new Error('assert failed: ' + m); passed++; }

assert(E.DURATION === 60, '60秒でない');
assert(E.LIVES === 3, 'ライフが3でない');
assert(E.BURST_COOLDOWN > 0, 'BANGクールダウンがない');

var game = E.createGame();
assert(game.state.phase === 'start', '初期状態がstartでない');
game.start();
var s = game.getState();
assert(s.phase === 'playing' && s.lives === 3 && s.timeLeft === 60, '開始状態が不正');

// オート射撃
game.update(0, 0.25);
s = game.getState();
assert(s.bullets.length > 0, '自動射撃されない');
assert(s.bullets[0].vy < 0, '弾が上へ飛ばない');

// BANGで扇状に弾が出て、クールダウンする
var before = game.getState().bullets.length;
assert(game.burst() === true, 'BANGできない');
s = game.getState();
assert(s.bullets.length > before + 5, 'BANGの弾が少ない');
assert(s.burstCooldown > 0, 'BANGのクールダウンがない');
assert(game.burst() === false, 'BANGが連発できる');

// 移動
game.setTargetX(60);
game.update(0.2, 0.1);
s = game.getState();
assert(s.player.x < 180, '移動先へ動かない');

// 敵が下に抜けるとライフが減る
var dmg = E.createGame();
dmg.start();
dmg.state.enemies.push({ type: 'bag', x: dmg.state.player.x, y: dmg.state.player.y + 80, vx: 0, vy: 0, r: 18, hp: 1, maxHp: 1, score: 100, hue: 42, drift: 0, phase: 0 });
dmg.update(0, 1 / 60);
s = dmg.getState();
assert(s.lives === 2, 'ゴミが下に抜けてもライフが減らない');
assert(s.invuln > 0, '被弾後の無敵がない');

// 60秒で終了
var end = E.createGame();
end.start();
end.state.time = E.DURATION - 0.01;
end.update(0, 1 / 60);
s = end.getState();
assert(s.phase === 'finished' && s.result.reason === 'time', '60秒で終了しない');

// 自動プレイで最後まで進む
var auto = E.createGame();
auto.start();
var steps = 0;
while (auto.getState().phase !== 'finished' && steps < 5000) {
  auto.autoStep();
  auto.update(steps / 60, 1 / 60);
  steps++;
}
s = auto.getState();
assert(s.phase === 'finished', '自動プレイが終了しない');
assert(s.result && s.result.score > 0, 'スコアが記録されない');
assert(s.result.kills > 0, '撃破数が記録されない');
assert(s.result.comboMax >= 1, 'コンボ最大が記録されない');

print('engine tests OK (' + passed + ' assertions)');
