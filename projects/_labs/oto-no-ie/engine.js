(function (root, factory) {
  'use strict';
  var api = factory(root.OTO_LEVELS);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OtoNoIeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LEVELS) {
  'use strict';
  if (!LEVELS || !LEVELS.length) throw new Error('OTO_LEVELS is required');
  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var TOTAL = LEVELS.length;

  function idx(w, r, c) { return r * w + c; }
  function cellAt(level, r, c) {
    if (r < 0 || c < 0 || r >= level.h || c >= level.w) return '#';
    return level.grid[r][c];
  }
  function isMovePass(ch) { return ch === 'S' || ch === 'E' || ch === '.' || ch === 'D' || ch === 'A'; }
  function isSoundPass(ch) { return ch === 'S' || ch === 'E' || ch === '.' || ch === 'D' || ch === '!'; }

  function parseLevel(def, index) {
    var grid = def.grid.slice();
    var start = null;
    var exit = null;
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === 'S') start = { r: r, c: c };
        if (grid[r][c] === 'E') exit = { r: r, c: c };
      }
    }
    return {
      index: index,
      id: def.id,
      title: def.title,
      hint: def.hint,
      range: def.range,
      maxBells: def.maxBells == null ? 3 : def.maxBells,
      maxMirrors: def.maxMirrors == null ? 2 : def.maxMirrors,
      grid: grid,
      w: grid[0].length,
      h: grid.length,
      start: start,
      exit: exit,
      solution: def.solution || [],
      mirrorSolution: def.mirrorSolution || []
    };
  }

  function loadLevel(game, index) {
    var level = parseLevel(LEVELS[index], index);
    game.levelIndex = index;
    game.level = level;
    game.bells = [null, null, null];
    game.mirrors = [null, null];
    game.selected = { type: 'bell', index: 0 };
    game.phase = 'build';
    game.result = null;
    game.events.push({ type: 'level', index: index });
    return game;
  }

  function createGame() {
    var game = {
      levelIndex: 0,
      level: null,
      bells: [],
      mirrors: [],
      selected: { type: 'bell', index: 0 },
      phase: 'build',
      paused: false,
      result: null,
      events: []
    };
    loadLevel(game, 0);
    return game;
  }

  function bfs(level, start, passable, maxDist, blocked) {
    var w = level.w;
    var h = level.h;
    var dist = {};
    var prev = {};
    var queue = [{ r: start.r, c: start.c }];
    var head = 0;
    var startK = idx(w, start.r, start.c);
    dist[startK] = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var curK = idx(w, cur.r, cur.c);
      var cd = dist[curK];
      if (cd >= maxDist) continue;
      for (var i = 0; i < DIRS.length; i++) {
        var nr = cur.r + DIRS[i][0];
        var nc = cur.c + DIRS[i][1];
        if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
        if (blocked && blocked[idx(w, nr, nc)]) continue;
        if (!passable(cellAt(level, nr, nc))) continue;
        var nk = idx(w, nr, nc);
        if (dist[nk] != null) continue;
        dist[nk] = cd + 1;
        prev[nk] = curK;
        queue.push({ r: nr, c: nc });
      }
    }
    return { dist: dist, prev: prev };
  }

  function mirrorMap(game) {
    var map = {};
    var w = game.level.w;
    for (var i = 0; i < game.mirrors.length; i++) {
      var m = game.mirrors[i];
      if (!m) continue;
      map[idx(w, m.r, m.c)] = { r: m.r, c: m.c };
    }
    return map;
  }

  function reachable(game, source) {
    var level = game.level;
    var w = level.w;
    var mirrors = mirrorMap(game);
    var heard = {};
    var mirrorUsed = {};
    var sources = [{ r: source.r, c: source.c }];
    for (var si = 0; si < sources.length; si++) {
      var src = sources[si];
      var dist = {};
      var queue = [{ r: src.r, c: src.c }];
      var head = 0;
      var srcK = idx(w, src.r, src.c);
      dist[srcK] = 0;
      if (heard[srcK] == null || heard[srcK] > 0) heard[srcK] = 0;
      while (head < queue.length) {
        var cur = queue[head++];
        var curK = idx(w, cur.r, cur.c);
        var cd = dist[curK];
        if (heard[curK] == null || cd < heard[curK]) heard[curK] = cd;
        if (cd >= level.range) continue;
        for (var i = 0; i < DIRS.length; i++) {
          var nr = cur.r + DIRS[i][0];
          var nc = cur.c + DIRS[i][1];
          if (nr < 0 || nc < 0 || nr >= level.h || nc >= level.w) continue;
          var nk = idx(w, nr, nc);
          var mcell = mirrors[nk];
          if (mcell) {
            if (heard[nk] == null || heard[nk] > cd + 1) heard[nk] = cd + 1;
            if (!mirrorUsed[nk]) {
              mirrorUsed[nk] = true;
              sources.push(mcell);
            }
            continue;
          }
          if (!isSoundPass(cellAt(level, nr, nc))) continue;
          if (dist[nk] != null) continue;
          dist[nk] = cd + 1;
          queue.push({ r: nr, c: nc });
        }
      }
    }
    return heard;
  }

  function pathFrom(level, prev, start, end) {
    var w = level.w;
    var startK = idx(w, start.r, start.c);
    var endK = idx(w, end.r, end.c);
    if (startK === endK) return [start];
    if (prev[endK] == null) return null;
    var out = [];
    var cur = endK;
    while (cur != null) {
      out.push({ r: Math.floor(cur / w), c: cur % w });
      if (cur === startK) break;
      cur = prev[cur];
    }
    if (cur !== startK) return null;
    return out.reverse();
  }

  function soundCells(game, target) {
    var heard = reachable(game, target);
    var w = game.level.w;
    var out = [];
    for (var k in heard) {
      if (!Object.prototype.hasOwnProperty.call(heard, k)) continue;
      var n = Number(k);
      out.push({ r: Math.floor(n / w), c: n % w, d: heard[k] });
    }
    return out;
  }

  function occupied(game, r, c) {
    var i;
    for (i = 0; i < game.bells.length; i++) {
      if (game.bells[i] && game.bells[i].r === r && game.bells[i].c === c) return { type: 'bell', index: i };
    }
    for (i = 0; i < game.mirrors.length; i++) {
      if (game.mirrors[i] && game.mirrors[i].r === r && game.mirrors[i].c === c) return { type: 'mirror', index: i };
    }
    return null;
  }

  function placeItem(game, type, index, r, c) {
    if (!game || game.phase !== 'build' || game.paused) return false;
    if (cellAt(game.level, r, c) !== '.') return false;
    if (type === 'bell') {
      if (index < 0 || index >= game.level.maxBells) return false;
    } else if (type === 'mirror') {
      if (index < 0 || index >= game.level.maxMirrors) return false;
    } else return false;
    var old = occupied(game, r, c);
    if (old) {
      if (old.type === 'bell') game.bells[old.index] = null;
      else game.mirrors[old.index] = null;
    }
    if (type === 'bell') game.bells[index] = { r: r, c: c };
    else game.mirrors[index] = { r: r, c: c };
    game.result = null;
    game.events.push({ type: 'place', item: type, slot: index, r: r, c: c });
    return true;
  }

  function removeItemAt(game, r, c) {
    var found = occupied(game, r, c);
    if (!found) return false;
    if (found.type === 'bell') game.bells[found.index] = null;
    else game.mirrors[found.index] = null;
    game.selected = { type: found.type, index: found.index };
    game.result = null;
    game.events.push({ type: 'remove', item: found.type, slot: found.index, r: r, c: c });
    return true;
  }

  function clearItems(game) {
    for (var i = 0; i < game.bells.length; i++) game.bells[i] = null;
    for (i = 0; i < game.mirrors.length; i++) game.mirrors[i] = null;
    game.selected = { type: 'bell', index: 0 };
    game.result = null;
    game.events.push({ type: 'clear' });
  }

  function selectItem(game, type, index) {
    if (!game || game.phase !== 'build') return;
    if (type === 'bell' && index >= 0 && index < game.level.maxBells) game.selected = { type: 'bell', index: index };
    else if (type === 'mirror' && index >= 0 && index < game.level.maxMirrors) game.selected = { type: 'mirror', index: index };
  }

  function fail(reason, segments, at) {
    return { ok: false, reason: reason, segments: segments || [], failedAt: at || null };
  }

  function simulate(game) {
    var level = game.level;
    var current = level.start;
    var segments = [];

    for (var i = 0; i < game.bells.length; i++) {
      if (i >= level.maxBells) break;
      var bell = game.bells[i];
      if (!bell) continue;
      var sound = reachable(game, bell);
      if (sound[idx(level.w, current.r, current.c)] == null) {
        return fail('unheard', segments, { type: 'bell', slot: i, target: bell });
      }
      var move = bfs(level, current, isMovePass, 9999, mirrorMap(game));
      var path = pathFrom(level, move.prev, current, bell);
      if (!path) return fail('blocked', segments, { type: 'bell', slot: i, target: bell });
      var hitExit = false;
      for (var p = 0; p < path.length; p++) {
        if (path[p].r === level.exit.r && path[p].c === level.exit.c) hitExit = true;
      }
      segments.push({ type: 'bell', slot: i, target: bell, path: path, sound: soundCells(game, bell) });
      current = bell;
      if (hitExit) return { ok: true, reason: null, segments: segments, exitEarly: true };
    }

    var exitSound = reachable(game, level.exit);
    if (exitSound[idx(level.w, current.r, current.c)] == null) {
      return fail('exit-unheard', segments, { type: 'exit', target: level.exit });
    }
    var exitMove = bfs(level, current, isMovePass, 9999, mirrorMap(game));
    var exitPath = pathFrom(level, exitMove.prev, current, level.exit);
    if (!exitPath) return fail('exit-blocked', segments, { type: 'exit', target: level.exit });
    segments.push({ type: 'exit', target: level.exit, path: exitPath, sound: soundCells(game, level.exit) });
    return { ok: true, reason: null, segments: segments, exitEarly: false };
  }

  function run(game) {
    if (!game || game.phase !== 'build' || game.paused) return null;
    var result = simulate(game);
    game.result = result;
    game.phase = 'running';
    game.events.push({ type: 'run', ok: result.ok });
    return result;
  }

  function completeRun(game) {
    if (!game || game.phase !== 'running' || !game.result) return;
    if (game.result.ok) {
      game.phase = game.levelIndex + 1 >= TOTAL ? 'ending' : 'clear';
      game.events.push({ type: 'success', ending: game.phase === 'ending' });
    } else {
      game.phase = 'fail';
      game.events.push({ type: 'fail', reason: game.result.reason });
    }
  }

  function nextLevel(game) {
    if (!game || game.phase !== 'clear') return;
    loadLevel(game, game.levelIndex + 1);
  }
  function retry(game) {
    if (!game || game.phase !== 'fail') return;
    game.phase = 'build';
    game.result = null;
    game.events.push({ type: 'retry' });
  }
  function setPaused(game, paused) {
    if (!game || game.phase !== 'build') return;
    game.paused = !!paused;
  }

  function getState(game) {
    if (!game) return null;
    var bellsUsed = 0;
    var mirrorsUsed = 0;
    for (var i = 0; i < game.bells.length; i++) if (game.bells[i]) bellsUsed++;
    for (i = 0; i < game.mirrors.length; i++) if (game.mirrors[i]) mirrorsUsed++;
    return {
      id: 'oto-no-ie',
      levelIndex: game.levelIndex,
      levelTotal: TOTAL,
      levelTitle: game.level.title,
      levelHint: game.level.hint,
      phase: game.phase,
      paused: game.paused,
      maxBells: game.level.maxBells,
      maxMirrors: game.level.maxMirrors,
      range: game.level.range,
      bells: game.bells,
      mirrors: game.mirrors,
      bellsUsed: bellsUsed,
      mirrorsUsed: mirrorsUsed,
      selected: game.selected,
      result: game.result,
      reason: game.result ? game.result.reason : null,
      cleared: game.phase === 'ending',
      total: TOTAL
    };
  }

  function consumeEvents(game) {
    if (!game) return [];
    return game.events.splice(0, game.events.length);
  }

  function solutionFor(index) {
    var level = LEVELS[index];
    return level ? { bells: (level.solution || []).slice(), mirrors: (level.mirrorSolution || []).slice() } : null;
  }

  return {
    levels: LEVELS,
    total: TOTAL,
    createGame: createGame,
    loadLevel: loadLevel,
    placeItem: placeItem,
    removeItemAt: removeItemAt,
    clearItems: clearItems,
    selectItem: selectItem,
    run: run,
    completeRun: completeRun,
    nextLevel: nextLevel,
    retry: retry,
    setPaused: setPaused,
    getState: getState,
    consumeEvents: consumeEvents,
    simulate: simulate,
    soundCells: soundCells,
    cellAt: cellAt,
    bfs: bfs,
    solutionFor: solutionFor
  };
});
