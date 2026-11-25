/* engine.js : SHADE（影渡り）のコアロジック */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShadeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COLS = 13;
  var ROWS = 9;
  var CELL = 52;
  var PAD = 26;
  var W = COLS * CELL + PAD * 2;
  var H = ROWS * CELL + PAD * 2;
  var TURN_LIMIT = 10;
  var STAGES = 5;
  var MAX_SHADOWS = 3;
  var MAX_EVENTS = 120;
  var MAX_ATTEMPTS = 600;

  var DIRS = {
    E: { x: 1, y: 0, ox: 1, oy: 0 },
    S: { x: 0, y: 1, ox: 0, oy: 1 },
    W: { x: -1, y: 0, ox: -1, oy: 0 },
    N: { x: 0, y: -1, ox: 0, oy: -1 }
  };
  var MOVES = ['E', 'S', 'W', 'N'];
  var CARDINALS = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
  ];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  function inInterior(x, y) { return x >= 1 && y >= 1 && x <= COLS - 2 && y <= ROWS - 2; }
  function ri(rng, n) { return Math.floor(rng() * n); }
  function pick(rng, arr) { return arr[ri(rng, arr.length)]; }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  function emit(state, type, extra) {
    var ev = { type: type, t: state.turn };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      }
    }
    state.events.push(ev);
    if (state.events.length > MAX_EVENTS) state.events.shift();
  }

  function isWall(stage, x, y) {
    if (!inBounds(x, y)) return true;
    return !!stage.walls[y][x];
  }

  function guardAt(stage, x, y) {
    for (var i = 0; i < stage.guards.length; i++) {
      if (stage.guards[i].x === x && stage.guards[i].y === y) return true;
    }
    return false;
  }

  // セル中心どうしを結ぶ線が壁を横切らないか。壁セル以外の内外は問わない。
  function lineClear(stage, ax, ay, bx, by) {
    if (ax === bx && ay === by) return true;
    var dx = bx - ax;
    var dy = by - ay;
    var steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 8);
    if (steps < 2) return true;
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var cx = Math.floor(ax + 0.5 + dx * t);
      var cy = Math.floor(ay + 0.5 + dy * t);
      if (cx === ax && cy === ay) continue;
      if (cx === bx && cy === by) continue;
      if (isWall(stage, cx, cy)) return false;
    }
    return true;
  }

  function litAt(stage, socket, x, y) {
    if (!inBounds(x, y)) return false;
    return lineClear(stage, socket.x, socket.y, x, y);
  }

  function inCone(stage, guard, x, y) {
    var dx = x - guard.x;
    var dy = y - guard.y;
    if (dx === 0 && dy === 0) return false;
    var dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist > guard.range) return false;
    var v = DIRS[guard.dir];
    var dot = dx * v.x + dy * v.y;
    if (dot <= 0) return false;
    var cross = dx * v.y - dy * v.x;
    if (Math.abs(cross) > dot) return false;
    return lineClear(stage, guard.x, guard.y, x, y);
  }

  function guardSees(stage, guard, socket, x, y) {
    if (!litAt(stage, socket, x, y)) return false;
    return inCone(stage, guard, x, y);
  }

  function computeMaps(stage, lampIndex) {
    var socket = stage.sockets[lampIndex];
    var lit = [];
    var seen = [];
    var x, y, i;
    for (y = 0; y < ROWS; y++) {
      lit[y] = [];
      seen[y] = [];
      for (x = 0; x < COLS; x++) {
        lit[y][x] = !isWall(stage, x, y) && litAt(stage, socket, x, y);
        seen[y][x] = false;
      }
    }
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        if (!lit[y][x]) continue;
        for (i = 0; i < stage.guards.length; i++) {
          if (inCone(stage, stage.guards[i], x, y)) { seen[y][x] = true; break; }
        }
      }
    }
    return { lit: lit, seen: seen };
  }

  function recompute(state) {
    var maps = computeMaps(state.stage, state.lamp);
    state.stage.lit = maps.lit;
    state.stage.seen = maps.seen;
    state.lampRisk = false;
    var n = state.stage.sockets.length;
    if (n > 1 && state.player) {
      var next = (state.lamp + 1) % n;
      var nextMaps = computeMaps(state.stage, next);
      state.lampRisk = !!nextMaps.seen[state.player.y][state.player.x];
    }
  }

  function manhattan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function opposite(dir) {
    var v = DIRS[dir];
    if (v.x === 1) return 'W';
    if (v.x === -1) return 'E';
    if (v.y === 1) return 'N';
    return 'S';
  }

  function makeWalls() {
    var walls = [];
    for (var y = 0; y < ROWS; y++) {
      walls[y] = [];
      for (var x = 0; x < COLS; x++) {
        walls[y][x] = !inInterior(x, y);
      }
    }
    return walls;
  }

  function solveStage(stage, limit) {
    var socketCount = stage.sockets.length;
    var maps = [];
    for (var k = 0; k < socketCount; k++) maps[k] = computeMaps(stage, k);

    var start = stage.start;
    var exit = stage.exit;
    if (maps[0].seen[start.y][start.x]) return null;

    var nodes = [];
    var seen = {};
    function key(x, y, lamp) { return (lamp * ROWS + y) * COLS + x; }
    var startKey = key(start.x, start.y, 0);
    seen[startKey] = true;
    nodes.push({ x: start.x, y: start.y, lamp: 0, dist: 0, parent: -1, action: null });
    var head = 0;

    while (head < nodes.length) {
      var cur = nodes[head];
      var curIndex = head;
      head++;

      for (var m = 0; m < MOVES.length; m++) {
        var d = DIRS[MOVES[m]];
        var nx = cur.x + d.x;
        var ny = cur.y + d.y;
        if (!inBounds(nx, ny) || isWall(stage, nx, ny) || guardAt(stage, nx, ny)) continue;
        if (maps[cur.lamp].seen[ny][nx]) continue;
        var nd = cur.dist + 1;
        if (nd > limit) continue;
        var node = { x: nx, y: ny, lamp: cur.lamp, dist: nd, parent: curIndex, action: MOVES[m] };
        if (nx === exit.x && ny === exit.y) return reconstruct(nodes, head - 1, node);
        var nk = key(nx, ny, cur.lamp);
        if (seen[nk]) continue;
        seen[nk] = true;
        nodes.push(node);
      }

      if (socketCount > 1) {
        var nl = (cur.lamp + 1) % socketCount;
        if (!maps[nl].seen[cur.y][cur.x]) {
          var nd2 = cur.dist + 1;
          if (nd2 <= limit) {
            var nk2 = key(cur.x, cur.y, nl);
            if (!seen[nk2]) {
              seen[nk2] = true;
              nodes.push({ x: cur.x, y: cur.y, lamp: nl, dist: nd2, parent: curIndex, action: 'lamp' });
            }
          }
        }
      }
    }
    return null;
  }

  function reconstruct(nodes, headIndex, node) {
    var actions = [node.action];
    var p = node.parent;
    while (p >= 0) {
      var parentNode = nodes[p];
      if (parentNode.action) actions.push(parentNode.action);
      p = parentNode.parent;
    }
    actions.reverse();
    return actions;
  }

  function listSpecial(stage) {
    return {
      exit: stage.exit,
      sockets: stage.sockets,
      guards: stage.guards,
      start: stage.start
    };
  }

  function isSpecial(stage, x, y) {
    if (stage.exit && stage.exit.x === x && stage.exit.y === y) return true;
    if (stage.start && stage.start.x === x && stage.start.y === y) return true;
    if (guardAt(stage, x, y)) return true;
    for (var i = 0; i < stage.sockets.length; i++) {
      if (stage.sockets[i].x === x && stage.sockets[i].y === y) return true;
    }
    return false;
  }

  function tryBuild(rng, stageIndex) {
    var walls = makeWalls();
    var stage = {
      walls: walls,
      sockets: [],
      guards: [],
      start: null,
      exit: null,
      lamp: 0,
      lit: null,
      seen: null,
      solution: null
    };

    // 1. 出口と、出口を隠す壁 W、その奥の socket1 を決める
    var exit = null;
    var d = null;
    var block = null;
    var socket1 = null;
    for (var t = 0; t < 100 && !exit; t++) {
      var ex = 1 + ri(rng, COLS - 2);
      var ey = 1 + ri(rng, ROWS - 2);
      var dd = pick(rng, CARDINALS);
      var wx = ex + dd.x;
      var wy = ey + dd.y;
      var s1x = ex + dd.x * 3;
      var s1y = ey + dd.y * 3;
      if (!inInterior(wx, wy) || !inInterior(s1x, s1y)) continue;
      exit = { x: ex, y: ey };
      d = dd;
      block = { x: wx, y: wy };
      socket1 = { x: s1x, y: s1y };
    }
    if (!exit) return null;
    stage.exit = exit;
    walls[block.y][block.x] = true;

    // 2. 出口が明るく見える位置に socket0 を置く
    var socket0 = null;
    for (t = 0; t < 250 && !socket0; t++) {
      var sx = 1 + ri(rng, COLS - 2);
      var sy = 1 + ri(rng, ROWS - 2);
      if (sx === exit.x && sy === exit.y) continue;
      if (sx === block.x && sy === block.y) continue;
      if (sx === socket1.x && sy === socket1.y) continue;
      if (!lineClear(stage, sx, sy, exit.x, exit.y)) continue;
      socket0 = { x: sx, y: sy };
    }
    if (!socket0) return null;
    if (lineClear(stage, socket1.x, socket1.y, exit.x, exit.y)) return null;
    stage.sockets = [socket0, socket1];

    // 3. 出口を見張る guard（W とは別方向から出口を向く）
    var gdOptions = [];
    for (var ci = 0; ci < CARDINALS.length; ci++) {
      var c = CARDINALS[ci];
      if (c.x === d.x && c.y === d.y) continue;
      gdOptions.push(c);
    }
    var gd = pick(rng, gdOptions);
    var k = 2 + ri(rng, 2);
    var gx = exit.x + gd.x * k;
    var gy = exit.y + gd.y * k;
    if (!inInterior(gx, gy)) return null;
    if (gx === socket0.x && gy === socket0.y) return null;
    if (gx === socket1.x && gy === socket1.y) return null;
    var gdName = gd.x === 1 ? 'E' : (gd.x === -1 ? 'W' : (gd.y === 1 ? 'S' : 'N'));
    var guard = { x: gx, y: gy, dir: opposite(gdName), range: k + 1 };
    stage.guards.push(guard);
    if (!litAt(stage, socket0, exit.x, exit.y)) return null;
    if (!inCone(stage, guard, exit.x, exit.y)) return null;

    // 4. 見た目と遮蔽のための壁（条件を壊さないものだけ足す）
    var extra = 3 + stageIndex * 2 + ri(rng, 3);
    for (t = 0; t < extra; t++) {
      var wx2 = 1 + ri(rng, COLS - 2);
      var wy2 = 1 + ri(rng, ROWS - 2);
      if (walls[wy2][wx2]) continue;
      if ((wx2 === exit.x && wy2 === exit.y) ||
          (wx2 === block.x && wy2 === block.y) ||
          (wx2 === socket0.x && wy2 === socket0.y) ||
          (wx2 === socket1.x && wy2 === socket1.y) ||
          (wx2 === guard.x && wy2 === guard.y)) continue;
      walls[wy2][wx2] = true;
      if (!litAt(stage, socket0, exit.x, exit.y) || !inCone(stage, guard, exit.x, exit.y)) {
        walls[wy2][wx2] = false;
      }
    }

    // 5. スタート位置（出口から離れ、開始時に見えない）
    var start = null;
    for (t = 0; t < 300 && !start; t++) {
      var sx2 = 1 + ri(rng, COLS - 2);
      var sy2 = 1 + ri(rng, ROWS - 2);
      if (walls[sy2][sx2]) continue;
      if (guardAt(stage, sx2, sy2)) continue;
      if (sx2 === exit.x && sy2 === exit.y) continue;
      if (sx2 === socket0.x && sy2 === socket0.y) continue;
      if (sx2 === socket1.x && sy2 === socket1.y) continue;
      if (manhattan(sx2, sy2, exit.x, exit.y) < 4) continue;
      if (guardSees(stage, guard, socket0, sx2, sy2)) continue;
      start = { x: sx2, y: sy2 };
    }
    if (!start) return null;
    stage.start = start;

    // 6. 追加の見張り（難易度に応じて）
    var extraGuards = stageIndex >= 3 ? 2 : (stageIndex >= 1 ? 1 : 0);
    for (var g = 0; g < extraGuards; g++) {
      var placed = null;
      for (t = 0; t < 80 && !placed; t++) {
        var ax = 1 + ri(rng, COLS - 2);
        var ay = 1 + ri(rng, ROWS - 2);
        if (walls[ay][ax]) continue;
        if (guardAt(stage, ax, ay)) continue;
        if (isSpecial(stage, ax, ay)) continue;
        if (ax === start.x && ay === start.y) continue;
        var dirName = pick(rng, MOVES);
        var cand = { x: ax, y: ay, dir: dirName, range: 3 + ri(rng, 3) };
        if (guardSees(stage, cand, socket0, start.x, start.y)) continue;
        if (guardSees(stage, cand, socket0, exit.x, exit.y) && guardSees(stage, guard, socket0, exit.x, exit.y)) {
          // 出口はすでに見えているので追加でも問題ない
        }
        placed = cand;
      }
      if (placed) stage.guards.push(placed);
    }

    // 7. ソケットを確定（3つ目は後半のみ）
    stage.sockets = [socket0, socket1];
    stage.lamp = 0;
    if (stageIndex >= 2) {
      var socket2 = null;
      for (t = 0; t < 80 && !socket2; t++) {
        var qx = 1 + ri(rng, COLS - 2);
        var qy = 1 + ri(rng, ROWS - 2);
        if (walls[qy][qx]) continue;
        if (guardAt(stage, qx, qy)) continue;
        if (isSpecial(stage, qx, qy)) continue;
        if (qx === start.x && qy === start.y) continue;
        socket2 = { x: qx, y: qy };
      }
      if (socket2) {
        if (rng() < 0.5) stage.sockets = [socket0, socket2, socket1];
        else stage.sockets = [socket0, socket1, socket2];
      }
    }

    // 8. ソルバで解けるか確認
    var solution = solveStage(stage, TURN_LIMIT);
    if (!solution || solution.length < 4) return null;
    var usedLamp = false;
    for (var s = 0; s < solution.length; s++) if (solution[s] === 'lamp') usedLamp = true;
    if (!usedLamp) return null;
    stage.solution = solution;
    return stage;
  }

  function fallbackStage() {
    var walls = makeWalls();
    var stage = {
      walls: walls,
      sockets: [{ x: 1, y: 3 }, { x: 3, y: 3 }],
      guards: [],
      start: { x: 1, y: 1 },
      exit: { x: 2, y: 1 },
      lamp: 0,
      lit: null,
      seen: null,
      solution: null
    };
    stage.solution = solveStage(stage, TURN_LIMIT) || ['E'];
    return stage;
  }

  function generateStage(seed, index) {
    var rng = mulberry32((seed + (index + 1) * 0x9E3779B1) >>> 0);
    for (var i = 0; i < MAX_ATTEMPTS; i++) {
      var stage = tryBuild(rng, index);
      if (stage) return stage;
    }
    return fallbackStage();
  }

  function createGame(opts) {
    opts = opts || {};
    var seed = (opts.seed != null)
      ? (opts.seed >>> 0)
      : (Math.floor(Math.random() * 0x7FFFFFFF) >>> 0);
    return {
      seed: seed,
      phase: 'idle',
      stageIndex: 0,
      stage: null,
      player: null,
      lamp: 0,
      turn: 0,
      shadows: MAX_SHADOWS,
      totalTurns: 0,
      wastedTurns: 0,
      caught: 0,
      undoStack: [],
      solutionIndex: 0,
      lampRisk: false,
      events: [],
      result: null
    };
  }

  function resetStage(state) {
    var stage = state.stage;
    state.player = { x: stage.start.x, y: stage.start.y };
    state.lamp = 0;
    state.turn = 0;
    state.undoStack = [];
    state.solutionIndex = 0;
    recompute(state);
  }

  function loadStage(state, index) {
    state.stageIndex = index;
    state.stage = generateStage(state.seed, index);
    resetStage(state);
    emit(state, 'stageStart', { stage: index + 1 });
  }

  function start(state) {
    if (!state) return false;
    state.phase = 'playing';
    state.stageIndex = 0;
    state.shadows = MAX_SHADOWS;
    state.totalTurns = 0;
    state.wastedTurns = 0;
    state.caught = 0;
    state.events = [];
    state.result = null;
    state.stage = null;
    loadStage(state, 0);
    return true;
  }

  function isSeen(state, x, y) {
    return !!(state.stage.seen && state.stage.seen[y] && state.stage.seen[y][x]);
  }

  function finish(state, reason) {
    if (state.phase === 'finished') return;
    state.phase = 'finished';
    var cleared = reason === 'clear' ? STAGES : state.stageIndex;
    var spare = Math.max(0, STAGES * TURN_LIMIT - state.totalTurns - Math.round(state.wastedTurns * 0.5));
    var score = cleared * 200 + state.shadows * 150 + spare * 8 - state.caught * 30;
    if (score < 0) score = 0;
    var rank;
    if (reason === 'clear') {
      rank = state.shadows === 3 ? 'S' : (state.shadows === 2 ? 'A' : (state.shadows === 1 ? 'B' : 'C'));
    } else {
      rank = cleared >= 3 ? 'B' : (cleared >= 1 ? 'C' : 'D');
    }
    state.result = {
      reason: reason,
      cleared: cleared,
      stages: STAGES,
      shadows: state.shadows,
      turns: state.totalTurns,
      wastedTurns: state.wastedTurns,
      caught: state.caught,
      score: score,
      rank: rank
    };
    emit(state, 'finish', { reason: reason });
  }

  function act(state, action) {
    if (!state || state.phase !== 'playing') return false;
    var stage = state.stage;
    var p = state.player;
    var prev = { x: p.x, y: p.y, lamp: state.lamp, turn: state.turn };

    if (action === 'lamp') {
      if (stage.sockets.length < 2) return false;
      state.lamp = (state.lamp + 1) % stage.sockets.length;
      emit(state, 'lamp', { socket: state.lamp });
    } else if (DIRS[action]) {
      var d = DIRS[action];
      var nx = p.x + d.x;
      var ny = p.y + d.y;
      if (!inBounds(nx, ny) || isWall(stage, nx, ny) || guardAt(stage, nx, ny)) return false;
      p.x = nx;
      p.y = ny;
    } else {
      return false;
    }

    state.turn++;
    recompute(state);
    state.undoStack.push(prev);
    if (state.undoStack.length > 200) state.undoStack.shift();

    if (isSeen(state, p.x, p.y)) {
      state.caught++;
      state.wastedTurns += state.turn;
      state.shadows--;
      emit(state, 'caught', { x: p.x, y: p.y, shadows: state.shadows });
      if (state.shadows <= 0) finish(state, 'down');
      else resetStage(state);
      return true;
    }

    if (p.x === stage.exit.x && p.y === stage.exit.y) {
      state.totalTurns += state.turn;
      emit(state, 'clear', { x: stage.exit.x, y: stage.exit.y, stage: state.stageIndex + 1 });
      if (state.stageIndex >= STAGES - 1) finish(state, 'clear');
      else loadStage(state, state.stageIndex + 1);
      return true;
    }

    if (state.turn >= TURN_LIMIT) {
      state.wastedTurns += state.turn;
      state.shadows--;
      emit(state, 'timeout', { x: p.x, y: p.y, shadows: state.shadows });
      if (state.shadows <= 0) finish(state, 'down');
      else resetStage(state);
      return true;
    }

    return true;
  }

  function undo(state) {
    if (!state || state.phase !== 'playing') return false;
    if (!state.undoStack.length) return false;
    var prev = state.undoStack.pop();
    state.player.x = prev.x;
    state.player.y = prev.y;
    state.lamp = prev.lamp;
    state.turn = prev.turn;
    recompute(state);
    emit(state, 'undo');
    return true;
  }

  function safeMoves(state) {
    var out = [];
    if (!state || state.phase !== 'playing' || !state.stage) return out;
    var stage = state.stage;
    var p = state.player;
    for (var i = 0; i < MOVES.length; i++) {
      var d = DIRS[MOVES[i]];
      var nx = p.x + d.x;
      var ny = p.y + d.y;
      if (!inBounds(nx, ny) || isWall(stage, nx, ny) || guardAt(stage, nx, ny)) continue;
      if (isSeen(state, nx, ny)) continue;
      out.push(MOVES[i]);
    }
    return out;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase !== 'playing') return;
    var solution = state.stage.solution;
    if (!solution || !solution.length) return;
    if (state.solutionIndex >= solution.length) {
      // 念のため解を引き直す（通常は stage 読み込み時に必ず解がある）
      var again = solveStage(state.stage, TURN_LIMIT);
      if (!again || !again.length) return;
      state.stage.solution = again;
      state.solutionIndex = 0;
    }
    var action = solution[state.solutionIndex++];
    act(state, action);
  }

  function snapshot(state) {
    if (!state) return null;
    var stage = state.stage;
    var litCount = 0;
    var seenCount = 0;
    if (stage && stage.lit) {
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          if (stage.lit[y][x]) litCount++;
          if (stage.seen[y][x]) seenCount++;
        }
      }
    }
    return {
      phase: state.phase,
      over: state.phase === 'finished',
      seed: state.seed,
      stage: state.stageIndex + 1,
      stages: STAGES,
      turn: state.turn,
      turnLimit: TURN_LIMIT,
      maxShadows: MAX_SHADOWS,
      shadows: state.shadows,
      totalTurns: state.totalTurns,
      wastedTurns: state.wastedTurns,
      caught: state.caught,
      lamp: state.lamp,
      socketCount: stage ? stage.sockets.length : 0,
      litCount: litCount,
      seenCount: seenCount,
      guardCount: stage ? stage.guards.length : 0,
      solutionLength: (stage && stage.solution) ? stage.solution.length : 0,
      canUndo: state.undoStack.length > 0,
      lampRisk: !!state.lampRisk,
      player: state.player ? { x: state.player.x, y: state.player.y } : null,
      exit: stage ? { x: stage.exit.x, y: stage.exit.y } : null,
      score: scoreOf(state),
      result: state.result
    };
  }

  function scoreOf(state) {
    if (!state) return 0;
    if (state.phase === 'finished' && state.result) return state.result.score;
    var cleared = state.stageIndex;
    var spare = Math.max(0, STAGES * TURN_LIMIT - state.totalTurns - state.turn - Math.round(state.wastedTurns * 0.5));
    var score = cleared * 200 + state.shadows * 150 + spare * 8 - state.caught * 30;
    return score < 0 ? 0 : score;
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    CELL: CELL,
    PAD: PAD,
    W: W,
    H: H,
    TURN_LIMIT: TURN_LIMIT,
    STAGES: STAGES,
    MAX_SHADOWS: MAX_SHADOWS,
    DIRS: DIRS,
    MOVES: MOVES,
    createGame: createGame,
    start: start,
    act: act,
    undo: undo,
    autoStep: autoStep,
    snapshot: snapshot,
    safeMoves: safeMoves,
    scoreOf: scoreOf,
    solveStage: solveStage,
    mulberry32: mulberry32
  };
});
