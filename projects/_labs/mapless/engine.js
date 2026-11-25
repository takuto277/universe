/* engine.js : MAPLESS のコアロジック（UI非依存）
 *
 * 見えない迷路を、足元の灯りと自分の手描き地図だけで抜ける。
 * インクは有限。描くほど紙は濁る。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MaplessEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FLOORS = [
    {
      name: 'INK CELLAR',
      sub: '第1階 インクの地下室',
      cols: 13,
      rows: 9,
      vision: 3.3,
      maxInk: 100,
      bottles: 2,
      par: 90
    },
    {
      name: 'PAPER HALLS',
      sub: '第2階 紙の広間',
      cols: 15,
      rows: 11,
      vision: 3.0,
      maxInk: 110,
      bottles: 2,
      par: 150
    },
    {
      name: 'THE DEEP MAP',
      sub: '第3階 深い地図',
      cols: 17,
      rows: 13,
      vision: 2.8,
      maxInk: 120,
      bottles: 3,
      par: 210
    }
  ];

  var MOVE = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  var DIRS = [MOVE.up, MOVE.down, MOVE.left, MOVE.right];

  var BASE_SCORE = 1000;
  var TIME_BONUS = 600;
  var TIME_PENALTY = 3;
  var INK_BONUS = 3;
  var BOTTLE_BONUS = 300;
  var MUD_PENALTY = 4;
  var INK_PER_UNIT = 9;
  var BOTTLE_INK = 32;
  var MUD_CELLS_X = 44;
  var MUD_CELLS_Y = 34;
  var MUD_BASE = 0.10;
  var MUD_OVERLAP = 0.08;
  var MUD_SCALE = 0.55;
  var MIN_SEGMENT = 0.0025;

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function makeGrid(cols, rows, fill) {
    var grid = [];
    for (var y = 0; y < rows; y++) {
      var row = [];
      for (var x = 0; x < cols; x++) row.push(fill);
      grid.push(row);
    }
    return grid;
  }

  function inBounds(floor, x, y) {
    return x >= 0 && y >= 0 && x < floor.cols && y < floor.rows;
  }

  function generateMaze(cols, rows, rng) {
    var grid = makeGrid(cols, rows, 1);
    var stack = [{ x: 1, y: 1 }];
    grid[1][1] = 0;

    while (stack.length) {
      var cur = stack[stack.length - 1];
      var options = [];
      var dirs = shuffle(DIRS, rng);
      for (var i = 0; i < dirs.length; i++) {
        var nx = cur.x + dirs[i].x * 2;
        var ny = cur.y + dirs[i].y * 2;
        if (nx <= 0 || ny <= 0 || nx >= cols - 1 || ny >= rows - 1) continue;
        if (grid[ny][nx] === 0) continue;
        options.push({ x: nx, y: ny, wx: cur.x + dirs[i].x, wy: cur.y + dirs[i].y });
      }
      if (!options.length) {
        stack.pop();
        continue;
      }
      var next = options[0];
      grid[next.wy][next.wx] = 0;
      grid[next.y][next.x] = 0;
      stack.push({ x: next.x, y: next.y });
    }
    return grid;
  }

  function bfs(grid, cols, rows, sx, sy) {
    var dist = makeGrid(cols, rows, -1);
    var prev = makeGrid(cols, rows, null);
    var queue = [{ x: sx, y: sy }];
    dist[sy][sx] = 0;
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      for (var i = 0; i < DIRS.length; i++) {
        var nx = cur.x + DIRS[i].x;
        var ny = cur.y + DIRS[i].y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (grid[ny][nx] === 1 || dist[ny][nx] >= 0) continue;
        dist[ny][nx] = dist[cur.y][cur.x] + 1;
        prev[ny][nx] = { x: cur.x, y: cur.y };
        queue.push({ x: nx, y: ny });
      }
    }
    return { dist: dist, prev: prev };
  }

  function floorNeighbors(grid, cols, rows, x, y) {
    var n = 0;
    for (var i = 0; i < DIRS.length; i++) {
      var nx = x + DIRS[i].x;
      var ny = y + DIRS[i].y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (grid[ny][nx] === 0) n++;
    }
    return n;
  }

  function buildFloor(state, index) {
    var def = FLOORS[index];
    var grid = generateMaze(def.cols, def.rows, state.rng);
    var start = { x: 1, y: 1 };
    var search = bfs(grid, def.cols, def.rows, start.x, start.y);

    var exit = { x: start.x, y: start.y };
    var maxDist = -1;
    for (var y = 0; y < def.rows; y++) {
      for (var x = 0; x < def.cols; x++) {
        if (grid[y][x] === 0 && search.dist[y][x] > maxDist) {
          maxDist = search.dist[y][x];
          exit = { x: x, y: y };
        }
      }
    }

    var spots = [];
    for (var yy = 0; yy < def.rows; yy++) {
      for (var xx = 0; xx < def.cols; xx++) {
        if (grid[yy][xx] !== 0) continue;
        if ((xx === start.x && yy === start.y) || (xx === exit.x && yy === exit.y)) continue;
        if (floorNeighbors(grid, def.cols, def.rows, xx, yy) === 1) {
          spots.push({ x: xx, y: yy, d: search.dist[yy][xx] });
        }
      }
    }
    spots = shuffle(spots, state.rng).sort(function (a, b) { return b.d - a.d; });

    var bottles = [];
    for (var b = 0; b < def.bottles && spots.length; b++) {
      var spot = spots.shift();
      bottles.push({ x: spot.x, y: spot.y, collected: false });
    }
    if (bottles.length < def.bottles) {
      for (var ry = 1; ry < def.rows - 1 && bottles.length < def.bottles; ry += 2) {
        for (var rx = 1; rx < def.cols - 1 && bottles.length < def.bottles; rx += 2) {
          if (grid[ry][rx] !== 0) continue;
          if (rx === start.x && ry === start.y) continue;
          if (rx === exit.x && ry === exit.y) continue;
          var dup = false;
          for (var bi = 0; bi < bottles.length; bi++) {
            if (bottles[bi].x === rx && bottles[bi].y === ry) dup = true;
          }
          if (!dup) bottles.push({ x: rx, y: ry, collected: false });
        }
      }
    }

    state.floorIndex = index;
    state.floorDef = def;
    state.floorName = def.name;
    state.floorSub = def.sub;
    state.cols = def.cols;
    state.rows = def.rows;
    state.grid = grid;
    state.player = { x: start.x, y: start.y };
    state.exit = exit;
    state.bottles = bottles;
    state.bottlesCollected = 0;
    state.ink = def.maxInk;
    state.maxInk = def.maxInk;
    state.mud = 0;
    state.mudCells = {};
    state.strokes = [];
    state.currentStroke = null;
    state.time = 0;
    state.steps = 0;
    state.inkUsed = 0;
    state.autoStroke = false;
    state.exitDistance = search.dist[exit.y][exit.x];
    state.pathToExit = [];
    refreshNavigation(state);
  }

  function refreshNavigation(state) {
    var search = bfs(state.grid, state.cols, state.rows, state.player.x, state.player.y);
    state.exitDistance = search.dist[state.exit.y][state.exit.x];
    var path = [];
    var cur = { x: state.exit.x, y: state.exit.y };
    var guard = 0;
    while (cur && guard++ < 600) {
      path.push({ x: cur.x, y: cur.y });
      if (cur.x === state.player.x && cur.y === state.player.y) break;
      cur = search.prev[cur.y][cur.x];
    }
    path.reverse();
    state.pathToExit = path;
  }

  function createGame(opts) {
    opts = opts || {};
    return {
      phase: 'idle',
      seed: opts.seed == null ? null : opts.seed,
      rng: opts.seed == null ? Math.random : makeRng(opts.seed),
      floorIndex: 0,
      floorCount: FLOORS.length,
      floorDef: FLOORS[0],
      floorName: FLOORS[0].name,
      floorSub: FLOORS[0].sub,
      cols: FLOORS[0].cols,
      rows: FLOORS[0].rows,
      grid: [],
      player: { x: 1, y: 1 },
      exit: { x: 1, y: 1 },
      bottles: [],
      bottlesCollected: 0,
      ink: 0,
      maxInk: 0,
      mud: 0,
      strokes: [],
      currentStroke: null,
      mudCells: {},
      time: 0,
      steps: 0,
      inkUsed: 0,
      exitDistance: 0,
      pathToExit: [],
      floorScores: [],
      totalScore: 0,
      result: null,
      events: []
    };
  }

  function start(state) {
    if (!state) return false;
    state.phase = 'playing';
    state.floorIndex = 0;
    state.floorScores = [];
    state.totalScore = 0;
    state.result = null;
    state.events = [];
    buildFloor(state, 0);
    return true;
  }

  function pushEvent(state, type, data) {
    var ev = { type: type };
    if (data) for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) ev[k] = data[k];
    state.events.push(ev);
  }

  function bottleAt(state, x, y) {
    for (var i = 0; i < state.bottles.length; i++) {
      var b = state.bottles[i];
      if (!b.collected && b.x === x && b.y === y) return b;
    }
    return null;
  }

  function move(state, dx, dy) {
    if (!state || state.phase !== 'playing') return false;
    if (!dx && !dy) return false;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    var nx = state.player.x + dx;
    var ny = state.player.y + dy;
    if (!inBounds(state.floorDef, nx, ny) || state.grid[ny][nx] === 1) {
      pushEvent(state, 'bump', { x: nx, y: ny });
      return false;
    }

    state.player.x = nx;
    state.player.y = ny;
    state.steps++;

    var bottle = bottleAt(state, nx, ny);
    if (bottle) {
      bottle.collected = true;
      state.bottlesCollected++;
      state.ink = Math.min(state.maxInk, state.ink + BOTTLE_INK);
      pushEvent(state, 'bottle', { x: nx, y: ny, collected: state.bottlesCollected });
    }

    if (nx === state.exit.x && ny === state.exit.y) {
      finishFloor(state);
      return true;
    }

    refreshNavigation(state);
    pushEvent(state, 'move', { x: nx, y: ny });
    return true;
  }

  function finishFloor(state) {
    endStroke(state);
    var def = state.floorDef;
    var time = state.time;
    var timeBonus = Math.max(0, Math.round(TIME_BONUS - Math.max(0, time - def.par) * TIME_PENALTY));
    var inkBonus = Math.round(Math.max(0, state.ink) * INK_BONUS);
    var bottleBonus = state.bottlesCollected * BOTTLE_BONUS;
    var mudPenalty = Math.round(state.mud * MUD_PENALTY);
    var score = Math.max(0, BASE_SCORE + timeBonus + inkBonus + bottleBonus - mudPenalty);

    var entry = {
      floor: state.floorIndex + 1,
      name: def.name,
      time: time,
      ink: state.ink,
      inkUsed: state.inkUsed,
      mud: state.mud,
      bottles: state.bottlesCollected,
      bottlesTotal: state.bottles.length,
      timeBonus: timeBonus,
      inkBonus: inkBonus,
      bottleBonus: bottleBonus,
      mudPenalty: mudPenalty,
      score: score
    };
    state.floorScores.push(entry);
    state.totalScore += score;
    state.phase = 'floorClear';
    pushEvent(state, 'floorClear', { floor: state.floorIndex + 1, score: score });
  }

  function finishGame(state) {
    state.phase = 'over';
    var rank = rankFor(state.totalScore);
    state.result = {
      score: state.totalScore,
      rank: rank,
      clear: true,
      floors: state.floorScores.slice(),
      totalTime: totalTime(state)
    };
    pushEvent(state, 'gameClear', { score: state.totalScore, rank: rank });
  }

  function totalTime(state) {
    var t = 0;
    for (var i = 0; i < state.floorScores.length; i++) t += state.floorScores[i].time;
    return t;
  }

  function nextFloor(state) {
    if (!state || state.phase !== 'floorClear') return false;
    if (state.floorIndex + 1 >= FLOORS.length) {
      finishGame(state);
      return true;
    }
    buildFloor(state, state.floorIndex + 1);
    state.phase = 'playing';
    pushEvent(state, 'nextFloor', { floor: state.floorIndex + 1 });
    return true;
  }

  function update(state, dt) {
    if (!state || state.phase !== 'playing') return;
    if (!isFinite(dt) || dt <= 0) return;
    state.time += Math.min(0.25, dt);
  }

  // ---- drawing ----

  function mudCellKey(gx, gy) {
    return gx + ',' + gy;
  }

  function addMudAt(state, x, y) {
    var gx = Math.max(0, Math.min(MUD_CELLS_X - 1, Math.floor(x * MUD_CELLS_X)));
    var gy = Math.max(0, Math.min(MUD_CELLS_Y - 1, Math.floor(y * MUD_CELLS_Y)));
    var key = mudCellKey(gx, gy);
    var prev = state.mudCells[key] || 0;
    var inc = MUD_BASE + prev * MUD_OVERLAP;
    state.mudCells[key] = Math.min(2.2, prev + inc);
    state.mud = Math.min(100, state.mud + inc * MUD_SCALE);
  }

  function beginStroke(state, x, y) {
    if (!state || state.phase !== 'playing') return false;
    if (state.ink <= 0) return false;
    if (!isFinite(x) || !isFinite(y)) return false;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    state.currentStroke = { points: [{ x: x, y: y }] };
    return true;
  }

  function addStrokePoint(state, x, y) {
    if (!state || state.phase !== 'playing' || !state.currentStroke) return false;
    if (state.ink <= 0) return false;
    if (!isFinite(x) || !isFinite(y)) return false;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    var pts = state.currentStroke.points;
    var last = pts[pts.length - 1];
    var dx = x - last.x;
    var dy = y - last.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < MIN_SEGMENT) return false;

    var cost = dist * INK_PER_UNIT;
    if (cost > state.ink) cost = state.ink;
    state.ink = Math.max(0, state.ink - cost);
    state.inkUsed += cost;
    pts.push({ x: x, y: y });

    var steps = Math.max(1, Math.ceil(dist * 44));
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      addMudAt(state, last.x + dx * t, last.y + dy * t);
    }
    if (state.ink <= 0) pushEvent(state, 'inkEmpty');
    return true;
  }

  function endStroke(state) {
    if (!state || !state.currentStroke) return false;
    if (state.currentStroke.points.length >= 2) {
      state.strokes.push(state.currentStroke);
      state.currentStroke = null;
      return true;
    }
    state.currentStroke = null;
    return false;
  }

  // ---- scoring ----

  function rankFor(score) {
    if (score >= 5600) return 'S';
    if (score >= 5000) return 'A';
    if (score >= 4300) return 'B';
    if (score >= 3600) return 'C';
    return 'D';
  }

  // ---- auto play ----

  function cellCenter(state, cell) {
    return {
      x: (cell.x + 0.5) / state.cols,
      y: (cell.y + 0.5) / state.rows
    };
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'floorClear') {
      nextFloor(state);
      return;
    }
    if (state.phase !== 'playing') return;

    if (!state.autoStroke) {
      var c = cellCenter(state, state.player);
      if (beginStroke(state, c.x, c.y)) state.autoStroke = true;
    }

    var path = state.pathToExit;
    if (!path || path.length < 2) return;
    var next = path[1];
    var dx = next.x - state.player.x;
    var dy = next.y - state.player.y;
    if (move(state, dx, dy)) {
      if (state.phase === 'playing') {
        var cc = cellCenter(state, state.player);
        addStrokePoint(state, cc.x, cc.y);
      }
    }
    if (state.phase !== 'playing' && state.currentStroke) {
      endStroke(state);
      state.autoStroke = false;
    }
  }

  function snapshot(state) {
    if (!state) return null;
    var bottles = [];
    for (var i = 0; i < state.bottles.length; i++) {
      var b = state.bottles[i];
      bottles.push({ x: b.x, y: b.y, collected: !!b.collected });
    }
    var current = state.currentStroke
      ? state.currentStroke.points.map(function (p) { return { x: p.x, y: p.y }; })
      : [];
    return {
      phase: state.phase,
      floorIndex: state.floorIndex,
      floorCount: state.floorCount,
      floorName: state.floorName,
      floorSub: state.floorSub,
      cols: state.cols,
      rows: state.rows,
      player: { x: state.player.x, y: state.player.y },
      exit: { x: state.exit.x, y: state.exit.y },
      exitDistance: state.exitDistance,
      bottles: bottles,
      bottlesCollected: state.bottlesCollected,
      ink: state.ink,
      maxInk: state.maxInk,
      mud: state.mud,
      clarity: Math.max(0, 100 - state.mud),
      time: state.time,
      steps: state.steps,
      strokes: state.strokes.length,
      currentStroke: current,
      floorScores: state.floorScores.slice(),
      totalScore: state.totalScore,
      visionRadius: state.floorDef ? state.floorDef.vision : 3,
      result: state.result
    };
  }

  return {
    FLOORS: FLOORS,
    MOVE: MOVE,
    BASE_SCORE: BASE_SCORE,
    TIME_BONUS: TIME_BONUS,
    BOTTLE_BONUS: BOTTLE_BONUS,
    BOTTLE_INK: BOTTLE_INK,
    INK_PER_UNIT: INK_PER_UNIT,
    VISION: FLOORS[0].vision,
    createGame: createGame,
    start: start,
    move: move,
    update: update,
    nextFloor: nextFloor,
    beginStroke: beginStroke,
    addStrokePoint: addStrokePoint,
    endStroke: endStroke,
    autoStep: autoStep,
    rankFor: rankFor,
    snapshot: snapshot,
    refreshNavigation: refreshNavigation,
    generateMaze: generateMaze
  };
});
