/* engine.js : PRISM のコアロジック（グリッド上の光線追跡とミラー回転） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PrismEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COLS = 9;
  var ROWS = 13;
  var CELL = 38;
  var BOARD_W = COLS * CELL;
  var BOARD_H = ROWS * CELL;
  var BOARD_X = (390 - BOARD_W) / 2;
  var BOARD_Y = 165;

  var LEVELS = [
    {
      name: 'FIRST LIGHT',
      emitters: [
        { x: 0, y: 10, dx: 1, dy: 0, hue: 186 },
        { x: 0, y: 2, dx: 1, dy: 0, hue: 302 }
      ],
      mirrors: [{ x: 4, y: 2, type: '/', rot: true }],
      walls: [{ x: 6, y: 6 }, { x: 2, y: 6 }],
      targets: [
        { x: 8, y: 10, hue: 186 },
        { x: 4, y: 6, hue: 302 }
      ]
    },
    {
      name: 'CROSS',
      emitters: [{ x: 0, y: 2, dx: 1, dy: 0, hue: 186 }],
      mirrors: [
        { x: 3, y: 2, type: '/', rot: true },
        { x: 3, y: 7, type: '/', rot: true }
      ],
      walls: [],
      targets: [{ x: 7, y: 7, hue: 186 }]
    },
    {
      name: 'TWO SIGNALS',
      emitters: [{ x: 0, y: 6, dx: 1, dy: 0, hue: 186 }],
      mirrors: [
        { x: 3, y: 6, type: '\\', rot: true },
        { x: 3, y: 2, type: '\\', rot: true }
      ],
      walls: [],
      targets: [
        { x: 6, y: 2, hue: 186 },
        { x: 8, y: 2, hue: 186 }
      ]
    },
    {
      name: 'DETOUR',
      emitters: [{ x: 0, y: 10, dx: 1, dy: 0, hue: 302 }],
      mirrors: [
        { x: 3, y: 10, type: '\\', rot: true },
        { x: 3, y: 5, type: '\\', rot: true },
        { x: 6, y: 5, type: '\\', rot: true }
      ],
      walls: [{ x: 6, y: 10 }, { x: 1, y: 8 }],
      targets: [{ x: 6, y: 1, hue: 302 }]
    },
    {
      name: 'PRISM GATE',
      emitters: [
        { x: 0, y: 1, dx: 1, dy: 0, hue: 186 },
        { x: 0, y: 12, dx: 1, dy: 0, hue: 302 }
      ],
      mirrors: [
        { x: 2, y: 1, type: '/', rot: true },
        { x: 2, y: 6, type: '/', rot: true },
        { x: 5, y: 12, type: '\\', rot: true },
        { x: 5, y: 8, type: '\\', rot: true }
      ],
      walls: [{ x: 4, y: 3 }, { x: 4, y: 9 }],
      targets: [
        { x: 7, y: 6, hue: 186 },
        { x: 8, y: 8, hue: 302 }
      ]
    }
  ];

  function mirrorAt(mirrors, x, y) {
    for (var i = 0; i < mirrors.length; i++) {
      if (mirrors[i].x === x && mirrors[i].y === y) return mirrors[i];
    }
    return null;
  }

  function wallAt(walls, x, y) {
    for (var i = 0; i < walls.length; i++) {
      if (walls[i].x === x && walls[i].y === y) return true;
    }
    return false;
  }

  function targetAt(targets, x, y) {
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].x === x && targets[i].y === y) return targets[i];
    }
    return null;
  }

  function cloneLevel(def) {
    var mirrors = [];
    var walls = [];
    var targets = [];
    var emitters = [];
    var i;
    for (i = 0; i < def.mirrors.length; i++) {
      mirrors.push({ x: def.mirrors[i].x, y: def.mirrors[i].y, type: def.mirrors[i].type, rot: !!def.mirrors[i].rot });
    }
    for (i = 0; i < def.walls.length; i++) walls.push({ x: def.walls[i].x, y: def.walls[i].y });
    for (i = 0; i < def.targets.length; i++) {
      targets.push({ id: i, x: def.targets[i].x, y: def.targets[i].y, hue: def.targets[i].hue });
    }
    for (i = 0; i < def.emitters.length; i++) {
      emitters.push({ x: def.emitters[i].x, y: def.emitters[i].y, dx: def.emitters[i].dx, dy: def.emitters[i].dy, hue: def.emitters[i].hue });
    }
    return { name: def.name, mirrors: mirrors, walls: walls, targets: targets, emitters: emitters };
  }

  function createGame() {
    return {
      phase: 'idle',
      time: 0,
      levelIndex: 0,
      levelCount: LEVELS.length,
      name: '',
      emitters: [],
      mirrors: [],
      walls: [],
      targets: [],
      trace: { segments: [], hits: [], lit: [] },
      moves: 0,
      totalMoves: 0,
      clearTimer: 0,
      result: null
    };
  }

  function computeTrace(s) {
    var segments = [];
    var hits = [];
    var lit = [];
    var litSeen = {};

    for (var e = 0; e < s.emitters.length; e++) {
      var em = s.emitters[e];
      var x = em.x;
      var y = em.y;
      var dx = em.dx;
      var dy = em.dy;
      var sx = x;
      var sy = y;
      var guard = 0;

      while (guard < 400) {
        guard++;
        var nx = x + dx;
        var ny = y + dy;

        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
          segments.push({ x1: sx, y1: sy, x2: x + dx * 0.45, y2: y + dy * 0.45, hue: em.hue });
          break;
        }
        if (wallAt(s.walls, nx, ny)) {
          segments.push({ x1: sx, y1: sy, x2: x + dx * 0.5, y2: y + dy * 0.5, hue: em.hue });
          break;
        }

        var m = mirrorAt(s.mirrors, nx, ny);
        if (m) {
          x = nx;
          y = ny;
          segments.push({ x1: sx, y1: sy, x2: x, y2: y, hue: em.hue });
          hits.push({ x: x, y: y, hue: em.hue });
          var t;
          if (m.type === '/') {
            t = dx;
            dx = -dy;
            dy = -t;
          } else {
            t = dx;
            dx = dy;
            dy = t;
          }
          sx = x;
          sy = y;
          continue;
        }

        var tgt = targetAt(s.targets, nx, ny);
        if (tgt && !litSeen[tgt.id]) {
          litSeen[tgt.id] = true;
          lit.push(tgt.id);
        }
        x = nx;
        y = ny;
      }
    }

    s.trace = { segments: segments, hits: hits, lit: lit };
    return s.trace;
  }

  function isSolved(s) {
    return s.targets.length > 0 && s.trace.lit.length === s.targets.length;
  }

  function loadLevel(s, index) {
    var level = cloneLevel(LEVELS[index]);
    s.levelIndex = index;
    s.name = level.name;
    s.emitters = level.emitters;
    s.mirrors = level.mirrors;
    s.walls = level.walls;
    s.targets = level.targets;
    s.moves = 0;
    s.clearTimer = 0;
    computeTrace(s);
  }

  function start(s) {
    if (!s) return false;
    s.phase = 'playing';
    s.time = 0;
    s.totalMoves = 0;
    s.result = null;
    loadLevel(s, 0);
    return true;
  }

  function toggle(s, index) {
    if (!s || s.phase !== 'playing') return false;
    var m = s.mirrors[index];
    if (!m || !m.rot) return false;
    m.type = m.type === '/' ? '\\' : '/';
    s.moves++;
    computeTrace(s);
    checkWin(s);
    return true;
  }

  function checkWin(s) {
    if (s.phase === 'playing' && isSolved(s)) {
      s.phase = 'clear';
      s.clearTimer = 0.85;
      s.totalMoves += s.moves;
    }
  }

  function advance(s) {
    if (s.levelIndex + 1 < s.levelCount) {
      loadLevel(s, s.levelIndex + 1);
      s.phase = 'playing';
    } else {
      s.phase = 'over';
      s.result = {
        moves: s.totalMoves,
        time: Math.round(s.time * 10) / 10
      };
    }
  }

  function update(s, dt) {
    if (!s) return s;
    if (!(dt > 0)) return s;
    if (dt > 0.05) dt = 0.05;
    s.time += dt;
    if (s.phase === 'clear') {
      s.clearTimer -= dt;
      if (s.clearTimer <= 0) advance(s);
    }
    return s;
  }

  function solve(s) {
    var rot = [];
    var i;
    for (i = 0; i < s.mirrors.length; i++) {
      if (s.mirrors[i].rot) rot.push(i);
    }
    if (rot.length > 12) return null;

    var original = [];
    for (i = 0; i < s.mirrors.length; i++) original.push(s.mirrors[i].type);

    var total = 1 << rot.length;
    for (var mask = 0; mask < total; mask++) {
      for (var k = 0; k < rot.length; k++) {
        s.mirrors[rot[k]].type = ((mask >> k) & 1) ? '\\' : '/';
      }
      computeTrace(s);
      if (isSolved(s)) {
        var types = [];
        for (i = 0; i < rot.length; i++) types.push(s.mirrors[rot[i]].type);
        for (i = 0; i < s.mirrors.length; i++) s.mirrors[i].type = original[i];
        computeTrace(s);
        return { idx: rot, types: types };
      }
    }

    for (i = 0; i < s.mirrors.length; i++) s.mirrors[i].type = original[i];
    computeTrace(s);
    return null;
  }

  function autoStep(s) {
    if (!s) return;
    if (s.phase === 'idle') { start(s); return; }
    if (s.phase !== 'playing') return;
    var solved = solve(s);
    if (!solved) return;
    for (var k = 0; k < solved.idx.length; k++) {
      var mi = solved.idx[k];
      if (s.mirrors[mi].type !== solved.types[k]) toggle(s, mi);
      if (s.phase !== 'playing') break;
    }
    if (s.phase === 'playing') checkWin(s);
  }

  function pick(s, wx, wy) {
    if (!s) return -1;
    var cx = Math.floor((wx - BOARD_X) / CELL);
    var cy = Math.floor((wy - BOARD_Y) / CELL);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return -1;
    for (var i = 0; i < s.mirrors.length; i++) {
      if (s.mirrors[i].x === cx && s.mirrors[i].y === cy) return s.mirrors[i].rot ? i : -1;
    }
    return -1;
  }

  function cellCenter(x, y) {
    return { x: BOARD_X + (x + 0.5) * CELL, y: BOARD_Y + (y + 0.5) * CELL };
  }

  function snapshot(s) {
    if (!s) return null;
    var mirrors = [];
    var targets = [];
    var i;
    for (i = 0; i < s.mirrors.length; i++) {
      mirrors.push({ x: s.mirrors[i].x, y: s.mirrors[i].y, type: s.mirrors[i].type, rot: s.mirrors[i].rot });
    }
    var litSet = {};
    for (i = 0; i < s.trace.lit.length; i++) litSet[s.trace.lit[i]] = true;
    for (i = 0; i < s.targets.length; i++) {
      targets.push({ x: s.targets[i].x, y: s.targets[i].y, lit: !!litSet[s.targets[i].id] });
    }
    return {
      phase: s.phase,
      over: s.phase === 'over',
      time: Math.round(s.time * 100) / 100,
      levelIndex: s.levelIndex + 1,
      levelCount: s.levelCount,
      name: s.name,
      moves: s.moves,
      totalMoves: s.totalMoves,
      lit: s.trace.lit.length,
      targetCount: s.targets.length,
      trace: { segments: s.trace.segments, hits: s.trace.hits, lit: s.trace.lit },
      mirrors: mirrors,
      targets: targets,
      result: s.result
    };
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    CELL: CELL,
    BOARD: { x: BOARD_X, y: BOARD_Y, w: BOARD_W, h: BOARD_H },
    LEVELS: LEVELS,
    W: 390,
    H: 844,
    createGame: createGame,
    start: start,
    toggle: toggle,
    update: update,
    autoStep: autoStep,
    solve: solve,
    pick: pick,
    cellCenter: cellCenter,
    snapshot: snapshot
  };
});
