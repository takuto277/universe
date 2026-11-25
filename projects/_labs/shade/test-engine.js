/* test-engine.js : SHADE のロジック */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = ShadeEngine; }

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}
function log(message) { print(message); }

function fresh(seed) {
  var g = E.createGame({ seed: seed });
  E.start(g);
  return g;
}

function playSolution(g) {
  var stage = g.stage;
  var sol = stage.solution.slice();
  for (var i = 0; i < sol.length; i++) E.act(g, sol[i]);
}

var g = E.createGame({ seed: 1 });
assert(g.phase === 'idle', '初期状態はidle');
assert(E.start(g) === true && g.phase === 'playing', '開始できる');
assert(g.stage && g.stage.walls && g.stage.sockets.length >= 2, 'ステージが生成される');
assert(g.shadows === E.MAX_SHADOWS, '残影が満タン');
assert(g.stage.solution && g.stage.solution.length <= E.TURN_LIMIT, '解がターン上限内');
var lampUsed = false;
for (var i = 0; i < g.stage.solution.length; i++) if (g.stage.solution[i] === 'lamp') lampUsed = true;
assert(lampUsed, '解は光源切替を含む');
assert(g.stage.seen[g.stage.start.y][g.stage.start.x] === false, '開始位置は見えていない');
assert(g.stage.lit[g.stage.exit.y][g.stage.exit.x] === true, '開始ソケットでは出口が明るい');
assert(typeof E.snapshot(g).lampRisk === 'boolean', 'lampRiskの初期値が入る');

var a = fresh(7);
var b = fresh(7);
assert(JSON.stringify(a.stage.walls) === JSON.stringify(b.stage.walls), '同じシードで壁が同じ');
assert(JSON.stringify(a.stage.sockets) === JSON.stringify(b.stage.sockets), '同じシードでソケットが同じ');
assert(JSON.stringify(a.stage.guards) === JSON.stringify(b.stage.guards), '同じシードで見張りが同じ');
assert(JSON.stringify(a.stage.solution) === JSON.stringify(b.stage.solution), '同じシードで解が同じ');

// 解を実行すると全ステージクリアできる
for (var seed = 1; seed <= 20; seed++) {
  g = fresh(seed);
  for (var s = 0; s < E.STAGES; s++) {
    assert(g.phase === 'playing', 'ステージ' + (s + 1) + 'でプレイ中');
    assert(g.stage.solution.length <= E.TURN_LIMIT, '解が上限内 seed=' + seed);
    playSolution(g);
  }
  assert(g.phase === 'finished', '全ステージ後に終了 seed=' + seed);
  assert(g.result && g.result.reason === 'clear', '解でCLEAR seed=' + seed);
  assert(g.result.cleared === E.STAGES, 'クリア数が全ステージ');
  assert(g.shadows === E.MAX_SHADOWS, '解では残影を失わない seed=' + seed);
  assert(g.result.score > 0, 'スコアが入る');
}

// 壁への移動は無効で、ターンを消費しない
g = fresh(3);
var found = false;
for (var y = 1; y < E.ROWS - 1 && !found; y++) {
  for (var x = 1; x < E.COLS - 1 && !found; x++) {
    if (!g.stage.walls[y][x]) continue;
    var pairs = [
      { px: x + 1, py: y, dir: 'W' },
      { px: x - 1, py: y, dir: 'E' },
      { px: x, py: y + 1, dir: 'N' },
      { px: x, py: y - 1, dir: 'S' }
    ];
    for (var p = 0; p < pairs.length; p++) {
      var q = pairs[p];
      if (q.px < 1 || q.py < 1 || q.px >= E.COLS - 1 || q.py >= E.ROWS - 1) continue;
      if (g.stage.walls[q.py][q.px]) continue;
      if (g.stage.start.x === q.px && g.stage.start.y === q.py) continue;
      g.player = { x: q.px, y: q.py };
      var turnBefore = g.turn;
      var ok = E.act(g, q.dir);
      assert(ok === false, '壁への移動はfalse');
      assert(g.turn === turnBefore, '壁への移動はターンを消費しない');
      found = true;
      break;
    }
  }
}
assert(found, '壁へ移動できる配置が見つかる');

// UNDO は位置とターンを戻す
g = fresh(4);
var moves = E.safeMoves(g);
if (moves.length) {
  var before = { x: g.player.x, y: g.player.y, turn: g.turn };
  E.act(g, moves[0]);
  assert(g.turn === before.turn + 1, '移動でターンが進む');
  assert(E.undo(g) === true, 'UNDOできる');
  assert(g.player.x === before.x && g.player.y === before.y && g.turn === before.turn, 'UNDOで位置とターンが戻る');
}

// 見えているマスへ入ると見つかり、残影を失ってやり直す
g = fresh(5);
var caughtNow = false;
for (y = 1; y < E.ROWS - 1 && !caughtNow; y++) {
  for (x = 1; x < E.COLS - 1 && !caughtNow; x++) {
    if (!g.stage.seen[y][x]) continue;
    var neigh = [
      { px: x + 1, py: y, dir: 'W' },
      { px: x - 1, py: y, dir: 'E' },
      { px: x, py: y + 1, dir: 'N' },
      { px: x, py: y - 1, dir: 'S' }
    ];
    for (p = 0; p < neigh.length; p++) {
      var n = neigh[p];
      if (n.px < 1 || n.py < 1 || n.px >= E.COLS - 1 || n.py >= E.ROWS - 1) continue;
      if (g.stage.walls[n.py][n.px] || g.stage.seen[n.py][n.px]) continue;
      if (g.stage.exit.x === n.px && g.stage.exit.y === n.py) continue;
      var targetGuard = false;
      for (var gi = 0; gi < g.stage.guards.length; gi++) {
        if (g.stage.guards[gi].x === x && g.stage.guards[gi].y === y) targetGuard = true;
      }
      if (targetGuard) continue;
      var shBefore = g.shadows;
      g.player = { x: n.px, y: n.py };
      E.act(g, n.dir);
      assert(g.shadows === shBefore - 1, '見つかると残影が減る');
      assert(g.turn === 0 && g.player.x === g.stage.start.x, '見つかるとステージをやり直す');
      caughtNow = true;
      break;
    }
  }
}
assert(caughtNow, '見張りの視界へ入るテストが見つかる');

// ターン上限で残影を失う
g = fresh(6);
moves = E.safeMoves(g);
for (i = 0; i < moves.length; i++) {
  var d = E.DIRS[moves[i]];
  var tx = g.player.x + d.x;
  var ty = g.player.y + d.y;
  if (tx === g.stage.exit.x && ty === g.stage.exit.y) continue;
  g.turn = E.TURN_LIMIT - 1;
  var sh2 = g.shadows;
  E.act(g, moves[i]);
  assert(g.shadows === sh2 - 1, 'ターン切れで残影が減る');
  assert(g.turn === 0, 'ターン切れでやり直す');
  break;
}

// 全ステージクリア後のスナップショットと結果
g = fresh(9);
for (s = 0; s < E.STAGES; s++) playSolution(g);
var snap = E.snapshot(g);
assert(snap && snap.over === true && snap.result, '終了スナップショット');
assert(snap.stage === E.STAGES && snap.turnLimit === E.TURN_LIMIT, 'スナップショットの値');
assert(typeof snap.lampRisk === 'boolean', 'lampRisk が入る');
assert(snap.result.rank === 'S' || snap.result.rank === 'A', 'クリアランク');
assert(snap.score === snap.result.score, 'スコアが一致');

// 自動操作で終了する（複数シード）
for (seed = 20; seed <= 60; seed += 7) {
  g = E.createGame({ seed: seed });
  var steps = 0;
  while (g.phase !== 'finished' && steps < 4000) { E.autoStep(g); steps++; }
  assert(g.phase === 'finished', '自動操作で終了 seed=' + seed);
  assert(g.result && g.result.reason === 'clear', '自動操作でCLEAR seed=' + seed);
}

log('engine tests OK (' + passed + ' assertions)');
