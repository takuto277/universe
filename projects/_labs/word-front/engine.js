/* engine.js : WORD FRONT（しりとり陣取り）のコアロジック
 *
 * 8x8 のひらがな盤面を、8方向にたどって単語を作るしりとり。
 * 単語の開始マスは常に前の単語の終了マス（カーソル）。
 * 開始マスより後ろのマスが陣地になり、相手の陣地は奪える。
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WordFrontEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var BOARD = 8;
  var CELLS = BOARD * BOARD;
  var MIN_WORD = 2;
  var MAX_WORD = 6;
  var TIME_LIMIT = 180;
  var HINT_COST = 5;
  var CPU_DELAY = 0.55;
  var PLAYER = 1;
  var CPU = 2;
  var FILL_KANA = 'ああいいううええおおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわを';

  var NEIGHBORS = buildNeighbors();
  var SNAKE = buildSnake();

  var dict = root.WordFrontDictionary;
  var dictWords = [];
  if (dict && dict.words) dictWords = dict.words.slice();
  else if (dict && dict.WORD_LIST) dictWords = dict.WORD_LIST.slice();
  if (!dictWords.length) {
    dictWords = ['あい', 'うみ', 'やま', 'そら', 'はな', 'とり', 'さかな', 'もり', 'かぜ', 'ゆき'];
  }

  var TRIE = null;

  function buildNeighbors() {
    var all = [];
    for (var y = 0; y < BOARD; y++) {
      for (var x = 0; x < BOARD; x++) {
        var list = [];
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = x + dx;
            var ny = y + dy;
            if (nx >= 0 && nx < BOARD && ny >= 0 && ny < BOARD) list.push(ny * BOARD + nx);
          }
        }
        all.push(list);
      }
    }
    return all;
  }

  function buildSnake() {
    var path = [];
    for (var y = 0; y < BOARD; y++) {
      for (var x = 0; x < BOARD; x++) {
        path.push(y % 2 === 0 ? y * BOARD + x : y * BOARD + (BOARD - 1 - x));
      }
    }
    return path;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function xOf(i) { return i % BOARD; }
  function yOf(i) { return Math.floor(i / BOARD); }
  function indexOf(x, y) { return y * BOARD + x; }

  function isAdjacent(a, b) {
    var dx = Math.abs(xOf(a) - xOf(b));
    var dy = Math.abs(yOf(a) - yOf(b));
    return (dx <= 1 && dy <= 1 && (dx + dy) > 0);
  }

  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0;
    var text = String(seed == null ? 20261111 : seed);
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function emptyNode() { return { n: {}, end: false }; }

  function getTrie() {
    if (TRIE) return TRIE;
    TRIE = emptyNode();
    for (var i = 0; i < dictWords.length; i++) {
      var word = dictWords[i];
      if (!word || word.length < MIN_WORD || word.length > MAX_WORD) continue;
      var node = TRIE;
      for (var j = 0; j < word.length; j++) {
        var ch = word.charAt(j);
        if (!node.n[ch]) node.n[ch] = emptyNode();
        node = node.n[ch];
      }
      node.end = true;
    }
    return TRIE;
  }

  function inDictionary(word) {
    if (!word || word.length < MIN_WORD || word.length > MAX_WORD) return false;
    var node = getTrie();
    for (var i = 0; i < word.length; i++) {
      node = node.n[word.charAt(i)];
      if (!node) return false;
    }
    return !!node.end;
  }

  function isPrefix(prefix) {
    if (!prefix) return false;
    var node = getTrie();
    for (var i = 0; i < prefix.length; i++) {
      node = node.n[prefix.charAt(i)];
      if (!node) return false;
    }
    return true;
  }

  function wordFromPath(board, path) {
    var word = '';
    for (var i = 0; i < path.length; i++) word += board[path[i]];
    return word;
  }

  function isRecent(list, word) {
    if (!list) return false;
    for (var i = 0; i < list.length; i++) if (list[i] === word) return true;
    return false;
  }

  function countOwned(ownership, who) {
    var n = 0;
    for (var i = 0; i < CELLS; i++) if (ownership[i] === who) n++;
    return n;
  }

  function findBestMove(board, ownership, start, mover, recentWords) {
    var trie = getTrie();
    var first = trie.n[board[start]];
    if (!first) return null;
    var visited = [];
    var path = [start];
    var best = null;

    function consider() {
      var word = wordFromPath(board, path);
      if (isRecent(recentWords, word)) return;
      var steals = 0;
      for (var i = 1; i < path.length; i++) {
        var owner = ownership[path[i]];
        if (owner && owner !== mover) steals++;
      }
      var score = (path.length - 1) * 100 + steals * 70 + (word.length >= 4 ? 30 : 0);
      if (!best || score > best.score) {
        best = {
          path: path.slice(),
          word: word,
          score: score,
          steals: steals
        };
      }
    }

    function walk(node, depth) {
      if (node.end && depth >= MIN_WORD) consider();
      if (depth >= MAX_WORD) return;
      var last = path[path.length - 1];
      var list = NEIGHBORS[last];
      for (var i = 0; i < list.length; i++) {
        var nextIndex = list[i];
        if (visited[nextIndex]) continue;
        var nextNode = node.n[board[nextIndex]];
        if (!nextNode) continue;
        visited[nextIndex] = true;
        path.push(nextIndex);
        walk(nextNode, depth + 1);
        path.pop();
        visited[nextIndex] = false;
      }
    }

    visited[start] = true;
    walk(first, 1);
    return best;
  }

  function hasMoveFrom(board, start, recentWords) {
    var trie = getTrie();
    var first = trie.n[board[start]];
    if (!first) return false;
    var visited = [];
    var path = [start];

    function walk(node, depth) {
      if (node.end && depth >= MIN_WORD && !isRecent(recentWords, wordFromPath(board, path))) return true;
      if (depth >= MAX_WORD) return false;
      var last = path[path.length - 1];
      var list = NEIGHBORS[last];
      for (var i = 0; i < list.length; i++) {
        var nextIndex = list[i];
        if (visited[nextIndex]) continue;
        var nextNode = node.n[board[nextIndex]];
        if (!nextNode) continue;
        visited[nextIndex] = true;
        path.push(nextIndex);
        if (walk(nextNode, depth + 1)) return true;
        path.pop();
        visited[nextIndex] = false;
      }
      return false;
    }

    visited[start] = true;
    return walk(first, 1);
  }

  function validStartsOn(board, recentWords) {
    var starts = [];
    for (var i = 0; i < CELLS; i++) {
      if (hasMoveFrom(board, i, recentWords)) starts.push(i);
    }
    return starts;
  }

  function tryPlaceWord(word, board, rand) {
    for (var attempt = 0; attempt < 90; attempt++) {
      var start = Math.floor(rand() * CELLS) % CELLS;
      if (board[start]) continue;
      var path = [start];
      var used = {};
      used[start] = true;
      for (var i = 1; i < word.length; i++) {
        var last = path[path.length - 1];
        var list = NEIGHBORS[last];
        var choices = [];
        for (var j = 0; j < list.length; j++) {
          var next = list[j];
          if (!board[next] && !used[next]) choices.push(next);
        }
        if (!choices.length) break;
        var pick = choices[Math.floor(rand() * choices.length) % choices.length];
        path.push(pick);
        used[pick] = true;
      }
      if (path.length === word.length) return path;
    }
    return null;
  }

  function fillRest(board, rand) {
    for (var i = 0; i < CELLS; i++) {
      if (!board[i]) board[i] = FILL_KANA.charAt(Math.floor(rand() * FILL_KANA.length) % FILL_KANA.length);
    }
  }

  function forcePlace(board, rand) {
    var placed = [];
    var pos = 0;
    var startAt = Math.floor(rand() * dictWords.length) % dictWords.length;
    for (var i = 0; i < dictWords.length && placed.length < 9 && pos < CELLS; i++) {
      var word = dictWords[(startAt + i) % dictWords.length];
      if (word.length < MIN_WORD || word.length > MAX_WORD) continue;
      if (pos + word.length > CELLS) break;
      var path = [];
      for (var j = 0; j < word.length; j++) path.push(SNAKE[pos + j]);
      for (j = 0; j < word.length; j++) board[SNAKE[pos + j]] = word.charAt(j);
      placed.push({ word: word, cells: path });
      pos += word.length;
    }
    return placed;
  }

  function generateBoard(seed) {
    var base = hashSeed(seed);
    var best = null;
    for (var attempt = 0; attempt < 16; attempt++) {
      var rand = makeRng((base + attempt * 2654435761) >>> 0);
      var board = [];
      for (var i = 0; i < CELLS; i++) board.push('');
      var placed = [];
      var seen = {};
      var tries = 0;
      while (placed.length < 12 && tries < 520) {
        tries++;
        var word = dictWords[Math.floor(rand() * dictWords.length) % dictWords.length];
        if (!word || seen[word] || word.length < MIN_WORD || word.length > MAX_WORD) continue;
        var path = tryPlaceWord(word, board, rand);
        if (!path) continue;
        for (var j = 0; j < word.length; j++) board[path[j]] = word.charAt(j);
        placed.push({ word: word, cells: path });
        seen[word] = true;
      }
      if (placed.length >= 8) {
        fillRest(board, rand);
        /* 開始できるマスが多いほど手詰まりしにくい。候補を比較して盤面を選ぶ。 */
        var starts = validStartsOn(board).length;
        if (!best || starts > best.starts) {
          best = { board: board, placed: placed, seed: base, starts: starts };
        }
        if (best.starts >= 50) break;
      }
    }
    if (best) return best;

    var fallbackRand = makeRng((base ^ 0xa5a5a5a5) >>> 0);
    var fallbackBoard = [];
    for (var k = 0; k < CELLS; k++) fallbackBoard.push('');
    var forced = forcePlace(fallbackBoard, fallbackRand);
    fillRest(fallbackBoard, fallbackRand);
    return { board: fallbackBoard, placed: forced, seed: base };
  }

  function normalizeBoard(input) {
    if (!input) return null;
    if (input.length === CELLS && typeof input[0] === 'string') return input.slice();
    if (input.length === BOARD && input[0] && input[0].length === BOARD) {
      var flat = [];
      for (var y = 0; y < BOARD; y++) {
        for (var x = 0; x < BOARD; x++) flat.push(input[y][x]);
      }
      return flat;
    }
    return null;
  }

  function createGame(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? 20261111 : opts.seed;
    var customBoard = normalizeBoard(opts.board);
    var generated = customBoard ? { board: customBoard, placed: [] } : generateBoard(seed);
    var ownership = [];
    if (opts.ownership && opts.ownership.length === CELLS) {
      for (var oi = 0; oi < CELLS; oi++) {
        var owner = opts.ownership[oi] | 0;
        ownership.push(owner === PLAYER || owner === CPU ? owner : 0);
      }
    } else {
      for (var zi = 0; zi < CELLS; zi++) ownership.push(0);
    }

    var state = {
      phase: 'start',
      turn: PLAYER,
      seed: seed,
      board: generated.board.slice(),
      ownership: ownership,
      cursor: null,
      path: [],
      hintPath: null,
      validStarts: [],
      time: opts.timeLimit == null ? TIME_LIMIT : opts.timeLimit,
      timeLimit: opts.timeLimit == null ? TIME_LIMIT : opts.timeLimit,
      playerScore: 0,
      cpuScore: 0,
      lastMove: null,
      result: null,
      events: [],
      cpuThinking: false,
      cpuTimer: 0,
      cpuDelay: opts.cpuDelay == null ? CPU_DELAY : opts.cpuDelay,
      hintCost: HINT_COST,
      placedCount: generated.placed ? generated.placed.length : 0,
      recentWords: [],
      history: []
    };

    function emit(type, extra) {
      var ev = { type: type };
      if (extra) {
        for (var key in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, key)) ev[key] = extra[key];
        }
      }
      state.events.push(ev);
    }

    function refreshScores() {
      state.playerScore = countOwned(state.ownership, PLAYER);
      state.cpuScore = countOwned(state.ownership, CPU);
    }

    function cursorFromIndex(index) {
      return { x: xOf(index), y: yOf(index), index: index, kana: state.board[index] };
    }

    function start() {
      state.phase = 'playing';
      state.turn = PLAYER;
      state.time = state.timeLimit;
      for (var i = 0; i < CELLS; i++) state.ownership[i] = 0;
      state.cursor = null;
      state.path = [];
      state.hintPath = null;
      state.validStarts = validStartsOn(state.board, state.recentWords);
      state.playerScore = 0;
      state.cpuScore = 0;
      state.lastMove = null;
      state.result = null;
      state.events = [];
      state.cpuThinking = false;
      state.cpuTimer = 0;
      state.recentWords = [];
      state.history = [];
      state.validStarts = validStartsOn(state.board, state.recentWords);
      emit('start');
      if (!state.validStarts.length) finishGame(CPU, 'no-moves');
      return true;
    }

    function finishGame(winner, reason) {
      if (state.phase === 'over') return;
      state.phase = 'over';
      state.cpuThinking = false;
      state.cpuTimer = 0;
      state.turn = 0;
      refreshScores();
      state.result = {
        winner: winner === PLAYER ? 'player' : (winner === CPU ? 'cpu' : 'draw'),
        reason: reason,
        playerScore: state.playerScore,
        cpuScore: state.cpuScore,
        words: state.history.slice(),
        timeLeft: Math.max(0, state.time)
      };
      emit('finish', { winner: state.result.winner, reason: reason, playerScore: state.playerScore, cpuScore: state.cpuScore });
    }

    function finishByTime() {
      var winner = state.playerScore === state.cpuScore ? 0 : (state.playerScore > state.cpuScore ? PLAYER : CPU);
      finishGame(winner, 'time');
    }

    function executeMove(mover, path) {
      var word = wordFromPath(state.board, path);
      state.recentWords.push(word);
      if (state.recentWords.length > 8) state.recentWords.shift();
      var steals = 0;
      for (var i = 1; i < path.length; i++) {
        var owner = state.ownership[path[i]];
        if (owner && owner !== mover) steals++;
        state.ownership[path[i]] = mover;
      }
      var end = path[path.length - 1];
      state.cursor = cursorFromIndex(end);
      state.lastMove = {
        mover: mover === PLAYER ? 'player' : 'cpu',
        word: word,
        path: path.slice(),
        cells: path.slice(),
        start: path[0],
        end: end,
        steals: steals
      };
      state.history.push({
        mover: mover === PLAYER ? 'player' : 'cpu',
        word: word,
        path: path.slice(),
        steals: steals
      });
      state.path = [];
      state.hintPath = null;
      refreshScores();
      emit('confirm', { mover: mover === PLAYER ? 'player' : 'cpu', word: word, steals: steals, path: path.slice() });
      if (steals > 0) emit('steal', { mover: mover === PLAYER ? 'player' : 'cpu', count: steals });

      state.turn = mover === PLAYER ? CPU : PLAYER;
      var nextHasMove = hasMoveFrom(state.board, state.cursor.index, state.recentWords);
      if (!nextHasMove) {
        finishGame(mover, 'no-moves');
        return;
      }
      if (state.turn === CPU) {
        state.cpuThinking = true;
        state.cpuTimer = state.cpuDelay;
        emit('cpu-think');
      } else {
        state.cpuThinking = false;
        state.cpuTimer = 0;
      }
    }

    function cpuMove() {
      if (state.phase !== 'playing' || state.turn !== CPU || !state.cursor) return false;
      var move = findBestMove(state.board, state.ownership, state.cursor.index, CPU, state.recentWords);
      state.cpuThinking = false;
      state.cpuTimer = 0;
      if (!move) {
        finishGame(PLAYER, 'no-moves');
        return false;
      }
      emit('cpu', { word: move.word });
      executeMove(CPU, move.path);
      return true;
    }

    function update(dt) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.1, dt);
      state.time -= dt;
      if (state.time <= 0) {
        state.time = 0;
        refreshScores();
        finishByTime();
        return getState();
      }
      if (state.turn === CPU && state.cpuThinking) {
        state.cpuTimer -= dt;
        if (state.cpuTimer <= 0) cpuMove();
      }
      return getState();
    }

    function beginPath(x, y) {
      if (state.phase !== 'playing' || state.turn !== PLAYER) return false;
      var index;
      if (y == null && typeof x === 'number' && x >= 0 && x < CELLS) index = x;
      else {
        if (x < 0 || x >= BOARD || y < 0 || y >= BOARD) return false;
        index = indexOf(x, y);
      }
      if (state.cursor) {
        if (index !== state.cursor.index) return false;
      } else if (state.validStarts.indexOf(index) < 0) {
        return false;
      }
      state.path = [index];
      state.hintPath = null;
      emit('begin');
      return true;
    }

    function extendPath(x, y) {
      if (state.phase !== 'playing' || state.turn !== PLAYER || !state.path.length) return false;
      var index;
      if (y == null && typeof x === 'number' && x >= 0 && x < CELLS) index = x;
      else {
        if (x < 0 || x >= BOARD || y < 0 || y >= BOARD) return false;
        index = indexOf(x, y);
      }
      var last = state.path[state.path.length - 1];
      if (index === last || state.path.indexOf(index) >= 0) return false;
      if (!isAdjacent(last, index)) return false;
      if (state.path.length >= MAX_WORD) return false;
      var nextWord = wordFromPath(state.board, state.path) + state.board[index];
      if (!isPrefix(nextWord)) return false;
      state.path.push(index);
      state.hintPath = null;
      emit('extend');
      return true;
    }

    function undoPath() {
      if (state.phase !== 'playing' || state.turn !== PLAYER) return false;
      if (!state.path.length) return false;
      state.path.pop();
      state.hintPath = null;
      emit('undo');
      return true;
    }

    function confirmPath() {
      if (state.phase !== 'playing' || state.turn !== PLAYER) return false;
      if (state.path.length < MIN_WORD || state.path.length > MAX_WORD) return false;
      if (state.cursor && state.path[0] !== state.cursor.index) return false;
      if (!state.cursor && state.validStarts.indexOf(state.path[0]) < 0) return false;
      var word = wordFromPath(state.board, state.path);
      if (!inDictionary(word) || isRecent(state.recentWords, word)) return false;
      var path = state.path.slice();
      executeMove(PLAYER, path);
      return true;
    }

    function hint() {
      if (state.phase !== 'playing' || state.turn !== PLAYER) return null;
      var move = null;
      if (state.cursor) {
        move = findBestMove(state.board, state.ownership, state.cursor.index, PLAYER, state.recentWords);
      } else {
        for (var i = 0; i < state.validStarts.length; i++) {
          var candidate = findBestMove(state.board, state.ownership, state.validStarts[i], PLAYER, state.recentWords);
          if (candidate && (!move || candidate.score > move.score)) move = candidate;
        }
      }
      if (!move) {
        finishGame(CPU, 'no-moves');
        return null;
      }
      state.time = Math.max(0, state.time - HINT_COST);
      state.path = move.path.slice();
      state.hintPath = move.path.slice();
      emit('hint', { cost: HINT_COST, word: move.word });
      if (state.time <= 0) {
        refreshScores();
        finishByTime();
      }
      return move.path.slice();
    }

    function autoStep() {
      if (state.phase !== 'playing' || state.turn !== PLAYER) return false;
      var move = null;
      if (state.cursor) {
        move = findBestMove(state.board, state.ownership, state.cursor.index, PLAYER, state.recentWords);
      } else {
        for (var i = 0; i < state.validStarts.length; i++) {
          var candidate = findBestMove(state.board, state.ownership, state.validStarts[i], PLAYER, state.recentWords);
          if (candidate && (!move || candidate.score > move.score)) move = candidate;
        }
      }
      if (!move) {
        finishGame(CPU, 'no-moves');
        return false;
      }
      state.path = move.path.slice();
      state.hintPath = null;
      return confirmPath();
    }

    function restart(newSeed) {
      var nextSeed = newSeed == null ? ((hashSeed(state.seed) + 1) >>> 0) : newSeed;
      var generatedNext = customBoard ? null : generateBoard(nextSeed);
      var nextBoard = customBoard ? customBoard.slice() : generatedNext.board;
      state.seed = nextSeed;
      state.board = nextBoard;
      state.placedCount = generatedNext ? generatedNext.placed.length : state.placedCount;
      state.ownership = [];
      for (var i = 0; i < CELLS; i++) state.ownership.push(0);
      start();
      return true;
    }

    function getState() {
      refreshScores();
      return {
        phase: state.phase,
        over: state.phase === 'over',
        turn: state.turn,
        board: state.board.slice(),
        ownership: state.ownership.slice(),
        cursor: state.cursor ? cursorFromIndex(state.cursor.index) : null,
        path: state.path.slice(),
        pathWord: wordFromPath(state.board, state.path),
        hintPath: state.hintPath ? state.hintPath.slice() : null,
        validStarts: state.validStarts.slice(),
        time: Math.max(0, state.time),
        timeLimit: state.timeLimit,
        scores: {
          player: state.playerScore,
          cpu: state.cpuScore
        },
        playerScore: state.playerScore,
        cpuScore: state.cpuScore,
        lastMove: state.lastMove ? {
          mover: state.lastMove.mover,
          word: state.lastMove.word,
          path: state.lastMove.path.slice(),
          cells: state.lastMove.cells.slice(),
          start: state.lastMove.start,
          end: state.lastMove.end,
          steals: state.lastMove.steals
        } : null,
        result: state.result ? {
          winner: state.result.winner,
          reason: state.result.reason,
          playerScore: state.result.playerScore,
          cpuScore: state.result.cpuScore,
          words: state.result.words.slice(),
          timeLeft: state.result.timeLeft
        } : null,
        placedCount: state.placedCount,
        history: state.history.slice(),
        events: state.events.slice()
      };
    }

    return {
      state: state,
      start: start,
      update: update,
      beginPath: beginPath,
      extendPath: extendPath,
      undoPath: undoPath,
      confirmPath: confirmPath,
      hint: hint,
      autoStep: autoStep,
      getState: getState,
      restart: restart,
      cpuMove: cpuMove
    };
  }

  return {
    BOARD: BOARD,
    CELLS: CELLS,
    MIN_WORD: MIN_WORD,
    MAX_WORD: MAX_WORD,
    TIME_LIMIT: TIME_LIMIT,
    HINT_COST: HINT_COST,
    PLAYER: PLAYER,
    CPU: CPU,
    createGame: createGame,
    generateBoard: generateBoard,
    hasMoveFrom: hasMoveFrom,
    findBestMove: findBestMove,
    inDictionary: inDictionary,
    isPrefix: isPrefix,
    indexOf: indexOf,
    xOf: xOf,
    yOf: yOf
  };
});
