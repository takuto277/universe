/* test-engine.js : SHIFT ROOM の純粋ロジックテスト */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['engine.js', 'projects/_labs/shift-room/engine.js']);
var E = ShiftRoomEngine;
var passed = 0;

function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}

function makeGame(seed) {
  var game = E.createGame({ seed: seed });
  game.start();
  return game;
}

function slotWalkable(def, x, y, radius) {
  if (x < radius || y < radius || x > def.width - radius || y > def.height - radius) return false;
  for (var i = 0; i < def.walls.length; i++) {
    var wall = def.walls[i];
    var cx = Math.max(wall.x, Math.min(wall.x + wall.w, x));
    var cy = Math.max(wall.y, Math.min(wall.y + wall.h, y));
    var dx = x - cx;
    var dy = y - cy;
    if (dx * dx + dy * dy < radius * radius) return false;
  }
  return true;
}

function collectAllKeys(game) {
  game.setMove(0, 0);
  for (var i = 0; i < game.state.keys.length; i++) {
    var key = game.state.keys[i];
    if (key.collected) continue;
    game.state.player.x = key.x;
    game.state.player.y = key.y;
    game.update(1 / 60);
  }
}

/* --- 部屋データ --- */
assert(E.ROOMS.length === 3, '部屋が3つでない');
for (var r = 0; r < E.ROOMS.length; r++) {
  var roomDef = E.ROOMS[r];
  assert(roomDef.walls.length > 0, '部屋' + r + 'に壁がない');
  assert(roomDef.keySlots.length >= E.KEYS_PER_ROOM, '部屋' + r + 'の鍵スロットが不足');
  assert(roomDef.doorSlots.length >= 2, '部屋' + r + 'の扉スロットが不足');
  assert(slotWalkable(roomDef, roomDef.start.x, roomDef.start.y, 16), '部屋' + r + 'の開始位置が壁の中');
  for (var ks = 0; ks < roomDef.keySlots.length; ks++) {
    assert(slotWalkable(roomDef, roomDef.keySlots[ks].x, roomDef.keySlots[ks].y, 12), '部屋' + r + 'の鍵スロット' + ks + 'が壁の中');
  }
  for (var ds = 0; ds < roomDef.doorSlots.length; ds++) {
    assert(slotWalkable(roomDef, roomDef.doorSlots[ds].x, roomDef.doorSlots[ds].y, 26), '部屋' + r + 'の扉スロット' + ds + 'が壁の中');
  }
}
assert(E.KEYS_PER_ROOM === 3, '各室3鍵でない');
assert(E.TOTAL_TIME === 180, '制限時間が180秒でない');
assert(Math.abs(E.SHIFT_TIME - 0.8) < 0.0001, 'シフト時間が0.8秒でない');
assert(Math.abs(E.GAZE_ANGLE - 55 * Math.PI / 180) < 0.0001, '視線角が55度でない');

/* --- 初期状態と部屋セットアップ --- */
var g = E.createGame({ seed: 12345 });
assert(g.state.phase === 'start', '初期状態がstartでない');
assert(g.state.over === false, '初期状態が終了扱い');
g.start();
var s = g.getState();
assert(s.phase === 'playing' && s.over === false, '開始状態が不正');
assert(s.roomIndex === 0 && s.roomCount === 3, '部屋インデックスが不正');
assert(s.keys.length === 3 && s.keysCollected === 0, '鍵の初期配置が不正');
assert(s.door && s.door.open === false && s.doorOpen === false, '扉が初期状態で開いている');
assert(s.timeLeft === 180, '残り時間の初期値が不正');
assert(s.walls.length === E.ROOMS[0].walls.length, '壁データが取得できない');
assert(typeof g.isInGaze === 'function', '視線判定APIがない');
assert(typeof g.autoStep === 'function' && typeof g.update === 'function', 'APIが不足');

/* --- 視線判定（円錐の内外） --- */
var key0 = g.state.keys[0];
g.setMove(0, 0);
g.setAim(key0.x - g.state.player.x, key0.y - g.state.player.y);
assert(g.isInGaze(key0.x, key0.y, 0) === true, '狙った鍵が視線内にならない');
g.setAim(g.state.player.x - key0.x, g.state.player.y - key0.y);
assert(g.isInGaze(key0.x, key0.y, 0) === false, '逆方向の鍵が視線内になっている');

/* --- 壁は視線を遮らない --- */
var wall = E.ROOMS[0].walls[0];
var wallX = wall.x + wall.w / 2;
var wallY = wall.y + wall.h / 2;
g.setAim(wallX - g.state.player.x, wallY - g.state.player.y);
assert(g.isInGaze(wallX, wallY, 0) === true, '壁が視線を遮っている');
assert(g.isInGaze(wallX - g.state.player.x, wallY - g.state.player.y, 0) === false, '視線外の点が視線内になっている');

/* --- 見続けている鍵はシフトしない --- */
var watched = makeGame(222);
var watchedKey = watched.state.keys[0];
watched.setMove(0, 0);
watched.setAim(watchedKey.x - watched.state.player.x, watchedKey.y - watched.state.player.y);
var watchedX = watchedKey.x;
var watchedY = watchedKey.y;
for (var wf = 0; wf < 150; wf++) watched.update(1 / 60);
assert(watchedKey.x === watchedX && watchedKey.y === watchedY, '見ている鍵が移動した');
assert(watchedKey.unseen === 0, '見ている鍵のunseenが0でない');

/* --- 見ていない鍵は0.8秒でシフトする --- */
var unwatched = makeGame(222);
var hiddenKey = unwatched.state.keys[0];
unwatched.setMove(0, 0);
unwatched.setAim(unwatched.state.player.x - hiddenKey.x, unwatched.state.player.y - hiddenKey.y);
var hiddenX = hiddenKey.x;
var hiddenY = hiddenKey.y;
for (var uf = 0; uf < 30; uf++) unwatched.update(1 / 60);
assert(hiddenKey.x === hiddenX && hiddenKey.y === hiddenY, '0.5秒未満でシフトした');
assert(hiddenKey.unseen > 0.3, 'unseenタイマーが進んでいない');
for (var uf2 = 30; uf2 < 70; uf2++) unwatched.update(1 / 60);
assert(hiddenKey.x !== hiddenX || hiddenKey.y !== hiddenY, '0.8秒経ってもシフトしない');
assert(!unwatched.isInGaze(hiddenKey.x, hiddenKey.y, hiddenKey.r), 'シフト先が視線内になっている');

/* --- 鍵の取得 --- */
var pick = makeGame(333);
var pickKey = pick.state.keys[0];
pick.state.player.x = pickKey.x;
pick.state.player.y = pickKey.y;
pick.update(1 / 60);
var pickState = pick.getState();
assert(pickKey.collected === true, '触れた鍵が回収されない');
assert(pickState.keysCollected === 1, 'keysCollectedが増えない');
assert(pickState.totalKeys === 1, 'totalKeysが増えない');
assert(pickState.score >= 100, '鍵取得のスコアが入らない');
var sawKeyEvent = false;
for (var pe = 0; pe < pickState.events.length; pe++) {
  if (pickState.events[pe].type === 'key') sawKeyEvent = true;
}
assert(sawKeyEvent, '鍵取得イベントがない');

/* --- 扉は3鍵までロック、取得後に開く --- */
var unlock = makeGame(444);
var doorBefore = unlock.state.door;
unlock.state.player.x = doorBefore.x;
unlock.state.player.y = doorBefore.y;
unlock.update(1 / 60);
assert(unlock.state.phase === 'playing', '鍵なしで扉を抜けられた');
assert(unlock.state.roomIndex === 0, '鍵なしで部屋が進んだ');
collectAllKeys(unlock);
var unlockState = unlock.getState();
assert(unlockState.keysCollected === 3, '3鍵を集められない');
assert(unlockState.doorOpen === true, '3鍵後も扉が開かない');
assert(unlockState.totalKeys === 3, 'totalKeysが3でない');
assert(unlockState.score >= 300, '鍵のスコアが合わない');
var sawDoorEvent = false;
for (var de = 0; de < unlockState.events.length; de++) {
  if (unlockState.events[de].type === 'dooropen') sawDoorEvent = true;
}
assert(sawDoorEvent, '扉開放イベントがない');

/* --- 部屋遷移 --- */
var door = unlock.state.door;
unlock.state.player.x = door.x;
unlock.state.player.y = door.y;
unlock.update(1 / 60);
assert(unlock.state.phase === 'transition', '開いた扉で遷移しない');
assert(unlock.state.roomsCleared === 1, 'クリア部屋数が増えない');
assert(unlock.state.roomIndex === 1, '扉に触れた時点で次の部屋へ進まない');
for (var tf = 0; tf < 80; tf++) unlock.update(1 / 60);
var nextRoom = unlock.getState();
assert(nextRoom.phase === 'playing', '遷移後にプレイ状態へ戻らない');
assert(nextRoom.roomIndex === 1, '次の部屋へ進んでいない');
assert(nextRoom.keys.length === 3 && nextRoom.keysCollected === 0, '次の部屋の鍵が初期化されない');
assert(nextRoom.totalKeys === 3, '総鍵数が部屋間で保持されない');
assert(nextRoom.doorOpen === false, '次の部屋の扉が開いている');

/* --- 壁は移動を遮る --- */
var wallGame = makeGame(555);
wallGame.state.player.x = 100;
wallGame.state.player.y = 140;
wallGame.setMove(1, 0);
for (var mf = 0; mf < 40; mf++) wallGame.update(1 / 60);
assert(wallGame.state.player.x < 120, '壁をすり抜けた');

/* --- タイマー終了 --- */
var timeout = makeGame(666);
timeout.state.timeLeft = 0.005;
timeout.update(1 / 60);
var timeoutState = timeout.getState();
assert(timeoutState.phase === 'over' && timeoutState.over === true, '時間切れで終了しない');
assert(timeoutState.result && timeoutState.result.won === false, '時間切れ結果が不正');
assert(timeoutState.result.rank === 'D', '時間切れのランクが不正');
assert(timeoutState.timeLeft === 0, '時間切れ後も残り時間がある');

/* --- 決定論的な乱数 --- */
var detA = makeGame(777);
var detB = makeGame(777);
var detAState = detA.getState();
var detBState = detB.getState();
for (var dk = 0; dk < 3; dk++) {
  assert(detAState.keys[dk].x === detBState.keys[dk].x && detAState.keys[dk].y === detBState.keys[dk].y, '同じseedで鍵配置が違う');
}
assert(detAState.door.x === detBState.door.x && detAState.door.y === detBState.door.y, '同じseedで扉配置が違う');
for (var ds = 0; ds < 600; ds++) {
  detA.autoStep();
  detA.update(1 / 60);
  detB.autoStep();
  detB.update(1 / 60);
}
var detAEnd = detA.getState();
var detBEnd = detB.getState();
assert(Math.abs(detAEnd.player.x - detBEnd.player.x) < 0.001, '同じseedでプレイヤー位置が違う');
assert(Math.abs(detAEnd.player.y - detBEnd.player.y) < 0.001, '同じseedでプレイヤー位置が違う(y)');
assert(detAEnd.score === detBEnd.score, '同じseedでスコアが違う');
assert(Math.abs(detAEnd.timeLeft - detBEnd.timeLeft) < 0.001, '同じseedで残り時間が違う');

/* --- 自動プレイで3部屋を完走 --- */
var auto = makeGame(20261111);
var steps = 0;
while (!auto.getState().over && steps < 20000) {
  auto.autoStep();
  auto.update(1 / 60);
  steps++;
}
var autoState = auto.getState();
assert(autoState.over === true, '自動プレイが終了しない');
assert(autoState.phase === 'victory', '自動プレイが勝利で終わらない: ' + autoState.phase + ' steps=' + steps);
assert(autoState.roomsCleared === 3, '自動プレイで3部屋クリアできない: ' + autoState.roomsCleared);
assert(autoState.totalKeys === 9, '自動プレイで9鍵集められない: ' + autoState.totalKeys);
assert(autoState.score > 0, '自動プレイのスコアが0');
assert(autoState.result && autoState.result.rank, '自動プレイのランクがない');
assert(autoState.timeLeft > 0, '自動プレイで時間切れしている');

print('engine tests OK (' + passed + ' assertions, auto steps=' + steps + ')');
