/* test-engine.js : WORD FRONT のロジック（jsc で実行）
 *   cd projects/_labs/word-front && jsc test-engine.js
 */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['dictionary.js', 'projects/_labs/word-front/dictionary.js']);
tryLoad(['engine.js', 'projects/_labs/word-front/engine.js']);

var D = WordFrontDictionary;
var E = WordFrontEngine;

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function metaBoard(fill) {
  var board = [];
  for (var i = 0; i < 64; i++) board.push(fill || 'ゔ');
  return board;
}

function putWord(board, word, start, step) {
  for (var i = 0; i < word.length; i++) board[start + step * i] = word.charAt(i);
}

function makeGame(board, opts) {
  opts = opts || {};
  opts.board = board;
  opts.seed = opts.seed == null ? 77 : opts.seed;
  return E.createGame(opts);
}

/* ---- 1. 辞書 ---- */
assert(D && D.words, '辞書が読み込まれていない');
assert(D.words.length >= 500, '辞書が500語未満: ' + D.words.length);
assert(D.size === D.words.length, 'size と words が不一致');
var seen = {};
for (var i = 0; i < D.words.length; i++) {
  var w = D.words[i];
  assert(w.length >= 2 && w.length <= 6, '語長が2〜6でない: ' + w);
  assert(/^[ぁ-ん]+$/.test(w), 'ひらがな以外を含む: ' + w);
  assert(!seen[w], '辞書に重複: ' + w);
  seen[w] = true;
  assert(D.has(w), 'has() が辞書語を拒否: ' + w);
}
assert(D.has('あい'), 'あい が辞書にない');
assert(!D.has('あ'), '1文字を受け付けている');
assert(!D.has('ゔ'), '存在しない語を受け付けている');
assert(D.isPrefix('あ'), '接頭辞判定が失敗');
assert(E.inDictionary('いえ'), 'engine の辞書判定が失敗');

/* ---- 2. 盤面生成の決定性 ---- */
var ga = E.createGame({ seed: 424242 });
var gb = E.createGame({ seed: 424242 });
assert(ga.state.board.join('') === gb.state.board.join(''), '同じseedで盤面が違う');
ga.start();
gb.start();
assert(ga.getState().validStarts.join(',') === gb.getState().validStarts.join(','), '同じseedで開始候補が違う');
assert(ga.getState().placedCount >= 8, '配置単語が少なすぎる: ' + ga.getState().placedCount);
var generatedA = E.generateBoard(999);
var generatedB = E.generateBoard(999);
assert(generatedA.board.join('') === generatedB.board.join(''), 'generateBoard が決定論的でない');
assert(generatedA.placed.length >= 8, '生成盤面の保証単語数が不足');

/* ---- 3. 経路の隣接・再利用・辞書prefix ---- */
var board1 = metaBoard();
putWord(board1, 'あい', 0, 1);
putWord(board1, 'いえ', 1, 1);
var g1 = makeGame(board1);
g1.start();
var s1 = g1.getState();
assert(s1.validStarts.indexOf(0) >= 0, 'あい の開始マスが候補にない');
assert(g1.beginPath(0, 0) === true, '開始マスを選べない');
assert(g1.extendPath(7, 7) === false, '隣接していないマスに伸ばせた');
assert(g1.extendPath(1, 0) === true, '隣接マスに伸ばせない');
assert(g1.extendPath(0, 0) === false, '同じ単語内でマスを再利用できてしまう');
assert(g1.extendPath(1, 0) === false, '末尾以外のマスに戻れてしまう');
assert(g1.undoPath() === true, 'undo できない');
assert(g1.state.path.length === 1, 'undo 後の経路長が不正');
assert(g1.extendPath(1, 0) === true, 'undo 後に再延長できない');

/* ---- 4. 陣地獲得とカーソル前進 ---- */
var g2 = makeGame(board1);
g2.start();
assert(g2.beginPath(0, 0) === true, '開始できない');
assert(g2.extendPath(1, 0) === true, '2マス目を選べない');
g2.state.ownership[1] = E.CPU; /* 相手陣地を奪う状況を作る */
assert(g2.confirmPath() === true, '有効な単語を確定できない');
var s2 = g2.getState();
assert(s2.ownership[0] === 0, '開始マスを陣地にしてしまっている');
assert(s2.ownership[1] === E.PLAYER, '通過した相手陣地を奪えていない');
assert(s2.cursor && s2.cursor.index === 1 && s2.cursor.kana === 'い', 'カーソルが前進していない');
assert(s2.lastMove.word === 'あい', '直前の単語が違う');
assert(s2.lastMove.steals === 1, '奪った数が記録されていない');
assert(s2.scores.player === 1 && s2.scores.cpu === 0, '陣地スコアが不正');
assert(s2.turn === E.CPU, '手番がCPUに切り替わっていない');
assert(s2.phase === 'playing', 'CPUに手があるのに終了している');

/* ---- 5. CPU の着手 ---- */
for (var cpuTick = 0; cpuTick < 20; cpuTick++) g2.update(0.1);
var s3 = g2.getState();
assert(s3.lastMove && s3.lastMove.mover === 'cpu', 'CPUが着手していない');
assert(s3.lastMove.word === 'いえ', 'CPUの単語が想定外: ' + s3.lastMove.word);
assert(s3.ownership[2] === E.CPU, 'CPUが陣地を取れていない');
assert(s3.cursor.index === 2, 'CPU後のカーソルが不正');
assert(s3.turn === E.PLAYER, 'CPU後に手番が戻っていない');

/* ---- 6. カーソル開始の強制 ---- */
assert(g2.beginPath(0, 0) === false, 'カーソル以外のマスから開始できてしまう');
assert(g2.beginPath(2, 0) === true, 'カーソルから開始できない');

/* ---- 7. 手がない側の負け ---- */
var board2 = metaBoard();
putWord(board2, 'あう', 0, 1);
putWord(board2, 'うる', 1, 8);
var g3 = makeGame(board2);
g3.start();
g3.beginPath(0, 0);
g3.extendPath(1, 0);
g3.confirmPath();
for (var cpuTick2 = 0; cpuTick2 < 20; cpuTick2++) g3.update(0.1); /* CPU が うる を打つ。る から始まる語はない。 */
var s4 = g3.getState();
assert(s4.phase === 'over', '手がないのに終了しない');
assert(s4.result && s4.result.reason === 'no-moves', '終了理由が no-moves でない');
assert(s4.result.winner === 'cpu', '手がない側の負けになっていない: ' + s4.result.winner);

var board3 = metaBoard();
putWord(board3, 'あい', 0, 1);
var g4 = makeGame(board3);
g4.start();
g4.beginPath(0, 0);
g4.extendPath(1, 0);
g4.confirmPath();
var s5 = g4.getState();
assert(s5.phase === 'over' && s5.result.winner === 'player', '相手に手がなくても勝てない');

/* ---- 8. タイマー終了は陣地数で決まる ---- */
var g5 = makeGame(board1, { timeLimit: 1 });
g5.start();
g5.state.ownership[0] = E.PLAYER;
g5.state.ownership[1] = E.PLAYER;
g5.state.ownership[2] = E.CPU;
g5.state.time = 0.05;
g5.update(0.1);
var s6 = g5.getState();
assert(s6.phase === 'over', '時間切れで終了しない');
assert(s6.result && s6.result.reason === 'time', '終了理由が time でない');
assert(s6.result.winner === 'player', '陣地が多い側の勝ちになっていない');
assert(s6.scores.player === 2 && s6.scores.cpu === 1, '時間切れスコアが不正');

/* ---- 9. ヒントは時間を5秒消費する ---- */
var g6 = makeGame(board1);
g6.start();
var before = g6.state.time;
var hintPath = g6.hint();
assert(hintPath && hintPath.length === 2, 'ヒント経路が不正');
assert(Math.abs((before - g6.state.time) - E.HINT_COST) < 0.001, 'ヒントの時間コストが5秒でない');
assert(g6.confirmPath() === true, 'ヒント経路を確定できない');

/* ---- 10. 自動プレイが終了する ---- */
var auto = E.createGame({ seed: 20261111, timeLimit: 30, cpuDelay: 0.05 });
auto.start();
var steps = 0;
while (auto.state.phase !== 'over' && steps < 4000) {
  auto.update(0.05);
  if (auto.state.turn === E.PLAYER) auto.autoStep();
  steps++;
}
assert(auto.state.phase === 'over', '自動プレイが終了しない (steps=' + steps + ')');
var sf = auto.getState();
assert(sf.result && sf.result.winner, '自動プレイ結果がない');
assert(typeof sf.scores.player === 'number' && typeof sf.scores.cpu === 'number', 'スコアが数値でない');
assert(sf.board.length === 64 && sf.ownership.length === 64, '盤面スナップショット長が不正');

print('engine tests OK (' + D.words.length + ' words, ' + steps + ' auto steps)');
