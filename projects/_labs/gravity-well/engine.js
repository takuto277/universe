/* engine.js : GRAVITY WELL のコアロジック（描画非依存）
 *
 * 12x12 の正方形ウェル。ピース自体は回転できず、盤面を90度回すと
 * 積み上がったブロックと操作中ピースが一緒に回り、その後で重力が働く。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GravityWellEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COLS = 12;
  var ROWS = 12;
  var GAME_TIME = 120;
  var ROT_TIME = 0.16;
  var DROP_TIME = 0.9;
  var LINE_SCORE = [0, 100, 300, 500, 800];

  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  var COLORS = {
    I: '#59e6ff',
    O: '#ffd95c',
    T: '#c07bff',
    S: '#5cff9d',
    Z: '#ff5f8f',
    J: '#5b8cff',
    L: '#ffab4d'
  };
  var SHAPES = {
    I: [[0, 0], [1, 0], [2, 0], [3, 0]],
    O: [[0, 0], [1, 0], [0, 1], [1, 1]],
    T: [[0, 0], [1, 0], [2, 0], [1, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
    J: [[0, 0], [0, 1], [1, 1], [2, 1]],
    L: [[2, 0], [0, 1], [1, 1], [2, 1]]
  };
  var VALUE = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
  var TYPE_BY_VALUE = ['', 'I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  function makeGrid() {
    var g = [];
    for (var y = 0; y < ROWS; y++) {
      var row = [];
      for (var x = 0; x < COLS; x++) row.push(0);
      g.push(row);
    }
    return g;
  }

  function copyGrid(grid) {
    var g = [];
    for (var y = 0; y < ROWS; y++) g.push(grid[y].slice());
    return g;
  }

  function copyCells(cells) {
    var out = [];
    for (var i = 0; i < cells.length; i++) out.push([cells[i][0], cells[i][1]]);
    return out;
  }

  function normalize(cells, ax, ay) {
    var i, minX = Infinity, minY = Infinity;
    for (i = 0; i < cells.length; i++) {
      if (cells[i][0] + ax < minX) minX = cells[i][0] + ax;
      if (cells[i][1] + ay < minY) minY = cells[i][1] + ay;
    }
    var out = [];
    for (i = 0; i < cells.length; i++) {
      out.push([cells[i][0] + ax - minX, cells[i][1] + ay - minY]);
    }
    return { cells: out, x: minX, y: minY };
  }

  function collides(grid, cells, x, y) {
    for (var i = 0; i < cells.length; i++) {
      var nx = x + cells[i][0];
      var ny = y + cells[i][1];
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && grid[ny][nx]) return true;
    }
    return false;
  }

  function dropY(grid, cells, x, startY) {
    var y = startY;
    while (!collides(grid, cells, x, y + 1)) y += 1;
    return y;
  }

  function place(grid, cells, x, y, value) {
    var g = copyGrid(grid);
    for (var i = 0; i < cells.length; i++) {
      var nx = x + cells[i][0];
      var ny = y + cells[i][1];
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) g[ny][nx] = value;
    }
    return g;
  }

  function clearRows(grid) {
    var kept = [];
    var rows = [];
    for (var y = 0; y < ROWS; y++) {
      var full = true;
      for (var x = 0; x < COLS; x++) {
        if (!grid[y][x]) { full = false; break; }
      }
      if (full) rows.push(y);
      else kept.push(grid[y].slice());
    }
    var out = [];
    while (out.length < rows.length) {
      var blank = [];
      for (var i = 0; i < COLS; i++) blank.push(0);
      out.push(blank);
    }
    for (var k = 0; k < kept.length; k++) out.push(kept[k]);
    return { grid: out, rows: rows, count: rows.length };
  }

  function rotateGrid(grid, dir) {
    var out = makeGrid();
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var v = grid[y][x];
        if (!v) continue;
        var nx, ny;
        if (dir > 0) { nx = ROWS - 1 - y; ny = x; }
        else { nx = y; ny = COLS - 1 - x; }
        out[ny][nx] = v;
      }
    }
    return out;
  }

  function transformCells(cells, x, y, dir) {
    var abs = [];
    for (var i = 0; i < cells.length; i++) {
      var ax = x + cells[i][0];
      var ay = y + cells[i][1];
      if (dir > 0) abs.push([ROWS - 1 - ay, ax]);
      else abs.push([ay, COLS - 1 - ax]);
    }
    return normalize(abs, 0, 0);
  }

  function pieceMask(cells, x, y) {
    var mask = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(false);
      mask.push(row);
    }
    for (var i = 0; i < cells.length; i++) {
      var nx = x + cells[i][0];
      var ny = y + cells[i][1];
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) mask[ny][nx] = true;
    }
    return mask;
  }

  /* 回転後に積み上がりを下へ詰める。操作中ピースは障害物として扱い、
   * スタックがピースへめり込まないようにする。 */
  function settleWithPiece(grid, cells, x, y) {
    var mask = pieceMask(cells, x, y);
    var out = makeGrid();
    for (var col = 0; col < COLS; col++) {
      var target = ROWS - 1;
      for (var row = ROWS - 1; row >= 0; row--) {
        if (mask[row][col]) {
          if (target >= row) target = row - 1;
          continue;
        }
        var v = grid[row][col];
        if (v) {
          if (target >= 0) out[target][col] = v;
          target -= 1;
        }
      }
    }
    return out;
  }

  function previewRotation(grid, cells, x, y, dir) {
    var g = rotateGrid(grid, dir);
    var p = transformCells(cells, x, y, dir);
    g = settleWithPiece(g, p.cells, p.x, p.y);
    var ny = dropY(g, p.cells, p.x, p.y);
    return { grid: g, cells: p.cells, x: p.x, y: ny };
  }

  function simulatePlacement(grid, cells, x, startY, value) {
    if (collides(grid, cells, x, startY)) return null;
    var y = dropY(grid, cells, x, startY);
    var g = place(grid, cells, x, y, value);
    var cleared = clearRows(g);
    return { x: x, y: y, grid: cleared.grid, cleared: cleared.count, rows: cleared.rows };
  }

  function evaluateGrid(grid) {
    var heights = [];
    var holes = 0;
    var aggregate = 0;
    var bump = 0;
    var maxH = 0;
    for (var x = 0; x < COLS; x++) {
      var top = -1;
      for (var y = 0; y < ROWS; y++) {
        if (grid[y][x]) { top = y; break; }
      }
      var h = top < 0 ? 0 : ROWS - top;
      heights.push(h);
      aggregate += h;
      if (h > maxH) maxH = h;
      if (top >= 0) {
        for (var yy = top + 1; yy < ROWS; yy++) if (!grid[yy][x]) holes += 1;
      }
    }
    for (var i = 1; i < heights.length; i++) bump += Math.abs(heights[i] - heights[i - 1]);
    return -(holes * 45 + aggregate * 2 + bump * 3 + maxH * 4);
  }

  function createGame(opts) {
    opts = opts || {};
    var initialSeed = opts.seed != null
      ? (opts.seed >>> 0)
      : (((typeof Date !== 'undefined' && Date.now) ? Date.now() : 1) ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
    var rng = initialSeed >>> 0;

    function rand() {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      return rng / 4294967296;
    }

    var state = {
      phase: 'start',
      grid: makeGrid(),
      active: null,
      queue: [],
      bag: [],
      score: 0,
      lines: 0,
      combo: 0,
      rotations: 0,
      timeLeft: GAME_TIME,
      dropTimer: 0,
      dropInterval: DROP_TIME,
      rotation: { active: false, dir: 1, elapsed: 0, duration: ROT_TIME, progress: 0 },
      result: null,
      lastLock: { id: 0, rows: [], count: 0, combo: 0, points: 0 },
      pieceId: 0,
      seed: initialSeed
    };

    function shuffledBag() {
      var bag = TYPES.slice();
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      return bag;
    }

    function drawType() {
      if (!state.bag.length) state.bag = shuffledBag();
      return state.bag.pop();
    }

    function fillQueue() {
      while (state.queue.length < 5) state.queue.push(drawType());
    }

    function takeNext() {
      fillQueue();
      var type = state.queue.shift();
      fillQueue();
      return type;
    }

    function endGame(reason) {
      if (state.phase === 'over' || state.phase === 'victory') return;
      state.phase = reason === 'victory' ? 'victory' : 'over';
      state.rotation.active = false;
      state.result = {
        score: state.score,
        lines: state.lines,
        rotations: state.rotations,
        reason: state.phase,
        timeLeft: state.timeLeft
      };
    }

    function spawn() {
      var type = takeNext();
      var base = SHAPES[type];
      var cells = copyCells(base);
      var minX = Infinity, maxX = -Infinity;
      for (var i = 0; i < cells.length; i++) {
        if (cells[i][0] < minX) minX = cells[i][0];
        if (cells[i][0] > maxX) maxX = cells[i][0];
      }
      if (minX !== 0) {
        for (i = 0; i < cells.length; i++) cells[i][0] -= minX;
        maxX -= minX;
      }
      var width = maxX + 1;
      var x = Math.floor((COLS - width) / 2);
      state.pieceId += 1;
      state.active = {
        type: type,
        value: VALUE[type],
        cells: cells,
        x: x,
        y: 0,
        id: state.pieceId
      };
      state.dropTimer = 0;
      if (collides(state.grid, cells, x, 0)) {
        endGame('over');
        return false;
      }
      return true;
    }

    function lockPiece() {
      if (!state.active) return;
      var a = state.active;
      var g = place(state.grid, a.cells, a.x, a.y, a.value);
      var cleared = clearRows(g);
      state.grid = cleared.grid;

      var points = 0;
      if (cleared.count > 0) {
        state.combo += 1;
        var bonus = state.combo > 1 ? (state.combo - 1) * 50 : 0;
        points = LINE_SCORE[cleared.count] + bonus;
        state.score += points;
        state.lines += cleared.count;
      } else {
        state.combo = 0;
      }
      state.lastLock = {
        id: state.lastLock.id + 1,
        rows: cleared.rows.slice(),
        count: cleared.count,
        combo: state.combo,
        points: points
      };
      spawn();
    }

    function canInput() {
      return state.phase === 'playing' && !state.rotation.active && !!state.active;
    }

    function start(seed) {
      if (seed != null) initialSeed = seed >>> 0;
      rng = initialSeed >>> 0;
      state.phase = 'playing';
      state.grid = makeGrid();
      state.active = null;
      state.queue = [];
      state.bag = [];
      state.score = 0;
      state.lines = 0;
      state.combo = 0;
      state.rotations = 0;
      state.timeLeft = GAME_TIME;
      state.dropTimer = 0;
      state.dropInterval = DROP_TIME;
      state.rotation = { active: false, dir: 1, elapsed: 0, duration: ROT_TIME, progress: 0 };
      state.result = null;
      state.lastLock = { id: 0, rows: [], count: 0, combo: 0, points: 0 };
      state.pieceId = 0;
      state.seed = initialSeed;
      spawn();
      return true;
    }

    function restart() {
      return start();
    }

    function moveLeft() {
      if (!canInput()) return false;
      var a = state.active;
      if (!collides(state.grid, a.cells, a.x - 1, a.y)) { a.x -= 1; return true; }
      return false;
    }

    function moveRight() {
      if (!canInput()) return false;
      var a = state.active;
      if (!collides(state.grid, a.cells, a.x + 1, a.y)) { a.x += 1; return true; }
      return false;
    }

    function softDrop() {
      if (!canInput()) return false;
      var a = state.active;
      if (!collides(state.grid, a.cells, a.x, a.y + 1)) {
        a.y += 1;
        state.dropTimer = 0;
        return true;
      }
      lockPiece();
      return true;
    }

    function hardDrop() {
      if (!canInput()) return false;
      var a = state.active;
      a.y = dropY(state.grid, a.cells, a.x, a.y);
      lockPiece();
      return true;
    }

    function rotateBoard(dir) {
      if (!canInput()) return false;
      dir = dir < 0 ? -1 : 1;
      var a = state.active;
      var p = transformCells(a.cells, a.x, a.y, dir);
      var g = rotateGrid(state.grid, dir);
      g = settleWithPiece(g, p.cells, p.x, p.y);
      var ny = dropY(g, p.cells, p.x, p.y);
      var cleared = clearRows(g);
      state.grid = cleared.grid;
      a.cells = p.cells;
      a.x = p.x;
      a.y = cleared.count > 0 ? dropY(state.grid, a.cells, a.x, ny) : ny;

      state.dropTimer = 0;
      state.rotations += 1;
      state.score += 10;
      if (cleared.count > 0) {
        state.combo += 1;
        var bonus = state.combo > 1 ? (state.combo - 1) * 50 : 0;
        var points = LINE_SCORE[cleared.count] + bonus;
        state.score += points;
        state.lines += cleared.count;
        state.lastLock = {
          id: state.lastLock.id + 1,
          rows: cleared.rows.slice(),
          count: cleared.count,
          combo: state.combo,
          points: points
        };
      }
      state.rotation = { active: true, dir: dir, elapsed: 0, duration: ROT_TIME, progress: 0 };
      if (collides(state.grid, a.cells, a.x, a.y)) endGame('over');
      return true;
    }

    function update(dt) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      if (dt > 0.1) dt = 0.1;
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        endGame('victory');
        return getState();
      }
      if (state.rotation.active) {
        state.rotation.elapsed += dt;
        state.rotation.progress = Math.min(1, state.rotation.elapsed / state.rotation.duration);
        if (state.rotation.elapsed >= state.rotation.duration) {
          state.rotation.active = false;
          state.rotation.progress = 1;
        }
        return getState();
      }
      state.dropTimer += dt;
      if (state.dropTimer >= state.dropInterval) {
        state.dropTimer = 0;
        var a = state.active;
        if (a && !collides(state.grid, a.cells, a.x, a.y + 1)) a.y += 1;
        else if (a) lockPiece();
      }
      return getState();
    }

    function autoStep() {
      if (!canInput()) return;
      var a = state.active;
      var bestX = a.x;
      var bestValue = -Infinity;
      var minDx = Infinity, maxDx = -Infinity;
      for (var i = 0; i < a.cells.length; i++) {
        if (a.cells[i][0] < minDx) minDx = a.cells[i][0];
        if (a.cells[i][0] > maxDx) maxDx = a.cells[i][0];
      }
      for (var x = -minDx; x <= COLS - 1 - maxDx; x++) {
        var res = simulatePlacement(state.grid, a.cells, x, 0, a.value);
        if (!res) continue;
        var value = res.cleared * 120 + evaluateGrid(res.grid);
        if (value > bestValue) { bestValue = value; bestX = x; }
      }
      if (a.x < bestX) { if (!moveRight()) hardDrop(); }
      else if (a.x > bestX) { if (!moveLeft()) hardDrop(); }
      else hardDrop();
    }

    function getState() {
      var a = state.active;
      var active = null;
      var ghostY = null;
      if (a) {
        ghostY = dropY(state.grid, a.cells, a.x, a.y);
        active = {
          id: a.id,
          type: a.type,
          value: a.value,
          cells: copyCells(a.cells),
          x: a.x,
          y: a.y,
          ghostY: ghostY
        };
      }
      return {
        phase: state.phase,
        over: state.phase === 'over' || state.phase === 'victory',
        grid: copyGrid(state.grid),
        active: active,
        queue: state.queue.slice(),
        score: state.score,
        lines: state.lines,
        combo: state.combo,
        rotations: state.rotations,
        timeLeft: state.timeLeft,
        dropInterval: state.dropInterval,
        rotation: {
          active: state.rotation.active,
          dir: state.rotation.dir,
          elapsed: state.rotation.elapsed,
          duration: state.rotation.duration,
          progress: state.rotation.progress
        },
        lastLock: {
          id: state.lastLock.id,
          rows: state.lastLock.rows.slice(),
          count: state.lastLock.count,
          combo: state.lastLock.combo,
          points: state.lastLock.points
        },
        result: state.result,
        seed: state.seed
      };
    }

    return {
      state: state,
      start: start,
      restart: restart,
      update: update,
      moveLeft: moveLeft,
      moveRight: moveRight,
      softDrop: softDrop,
      hardDrop: hardDrop,
      rotateBoard: rotateBoard,
      autoStep: autoStep,
      getState: getState
    };
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    GAME_TIME: GAME_TIME,
    ROT_TIME: ROT_TIME,
    TYPES: TYPES,
    COLORS: COLORS,
    SHAPES: SHAPES,
    VALUE: VALUE,
    TYPE_BY_VALUE: TYPE_BY_VALUE,
    createGame: createGame,
    makeGrid: makeGrid,
    copyGrid: copyGrid,
    collides: collides,
    dropY: dropY,
    place: place,
    clearRows: clearRows,
    rotateGrid: rotateGrid,
    transformCells: transformCells,
    settleWithPiece: settleWithPiece,
    previewRotation: previewRotation,
    simulatePlacement: simulatePlacement,
    evaluateGrid: evaluateGrid
  };
});
