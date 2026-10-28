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
  function isMovePass(ch) { return ch === 'S' || ch === 'E' || ch === '.' || ch === 'D'; }
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
      maxCharms: def.maxCharms,
      grid: grid,
      w: grid[0].length,
      h: grid.length,
      start: start,
      exit: exit,
      solution: def.solution
    };
  }

  function loadLevel(game, index) {
    var level = parseLevel(LEVELS[index], index);
    game.levelIndex = index;
    game.level = level;
    game.charms = [];
    for (var i = 0; i < level.maxCharms; i++) game.charms.push(null);
    game.selectedSlot = 0;
    game.phase = 'build';
    game.result = null;
    game.events.push({ type: 'level', index: index });
    return game;
  }

  function createGame() {
    var game = {
      levelIndex: 0,
      level: null,
      charms: [],
      selectedSlot: 0,
      phase: 'build',
      paused: false,
      result: null,
      events: []
    };
    loadLevel(game, 0);
    return game;
  }

  function bfs(level, start, passable, maxDist) {
    var w = level.w;
    var h = level.h;
    var dist = {};
    var prev = {};
    var queue = [start];
    var head = 0;
    var key = idx(w, start.r, start.c);
    dist[key] = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var cd = dist[idx(w, cur.r, cur.c)];
      if (cd >= maxDist) continue;
      for (var i = 0; i < DIRS.length; i++) {
        var nr = cur.r + DIRS[i][0];
        var nc = cur.c + DIRS[i][1];
        if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
        if (!passable(cellAt(level, nr, nc))) continue;
        var nk = idx(w, nr, nc);
        if (dist[nk] != null) continue;
        dist[nk] = cd + 1;
        prev[nk] = idx(w, cur.r, cur.c);
        queue.push({ r: nr, c: nc });
      }
    }
    return { dist: dist, prev: prev };
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

  function soundCells(level, target) {
    var res = bfs(level, target, isSoundPass, level.range);
    var out = [];
    for (var k in res.dist) {
      if (Object.prototype.hasOwnProperty.call(res.dist, k)) {
        var n = Number(k);
        out.push({ r: Math.floor(n / level.w), c: n % level.w, d: res.dist[k] });
      }
    }
    return out;
  }

  function occupied(game, r, c) {
    for (var i = 0; i < game.charms.length; i++) {
      var ch = game.charms[i];
      if (ch && ch.r === r && ch.c === c) return i;
    }
    return -1;
  }

  function placeCharm(game, slot, r, c) {
    if (!game || game.phase !== 'build' || game.paused) return false;
    if (slot < 0 || slot >= game.charms.length) return false;
    if (cellAt(game.level, r, c) !== '.') return false;
    var old = occupied(game, r, c);
    if (old >= 0) game.charms[old] = null;
    game.charms[slot] = { r: r, c: c };
    var next = -1;
    for (var i = 0; i < game.charms.length; i++) {
      if (!game.charms[i]) { next = i; break; }
    }
    game.selectedSlot = next >= 0 ? next : slot;
    game.result = null;
    game.events.push({ type: 'place', slot: slot, r: r, c: c });
    return true;
  }

  function removeCharmAt(game, r, c) {
    var slot = occupied(game, r, c);
    if (slot < 0) return false;
    game.charms[slot] = null;
    game.selectedSlot = slot;
    game.result = null;
    game.events.push({ type: 'remove', slot: slot, r: r, c: c });
    return true;
  }

  function clearCharms(game) {
    for (var i = 0; i < game.charms.length; i++) game.charms[i] = null;
    game.selectedSlot = 0;
    game.result = null;
    game.events.push({ type: 'clear' });
  }

  function selectSlot(game, slot) {
    if (!game || slot < 0 || slot >= game.charms.length) return;
    game.selectedSlot = slot;
  }

  function fail(reason, segments, at) {
    return {
      ok: false,
      reason: reason,
      segments: segments || [],
      failedAt: at || null
    };
  }

  function simulate(game) {
    var level = game.level;
    var current = level.start;
    var segments = [];
    var slots = game.charms;

    for (var i = 0; i < slots.length; i++) {
      var charm = slots[i];
      if (!charm) continue;
      var sound = bfs(level, charm, isSoundPass, level.range);
      if (sound.dist[idx(level.w, current.r, current.c)] == null) {
        return fail('unheard', segments, { type: 'charm', slot: i, target: charm });
      }
      var move = bfs(level, current, isMovePass, 9999);
      var path = pathFrom(level, move.prev, current, charm);
      if (!path) {
        return fail('blocked', segments, { type: 'charm', slot: i, target: charm });
      }
      var hitExit = false;
      for (var p = 0; p < path.length; p++) {
        if (path[p].r === level.exit.r && path[p].c === level.exit.c) hitExit = true;
      }
      segments.push({
        type: 'charm',
        slot: i,
        target: charm,
        path: path,
        sound: soundCells(level, charm)
      });
      current = charm;
      if (hitExit) {
        return { ok: true, reason: null, segments: segments, exitEarly: true };
      }
    }

    var exitSound = bfs(level, level.exit, isSoundPass, level.range);
    if (exitSound.dist[idx(level.w, current.r, current.c)] == null) {
      return fail('exit-unheard', segments, { type: 'exit', target: level.exit });
    }
    var exitMove = bfs(level, current, isMovePass, 9999);
    var exitPath = pathFrom(level, exitMove.prev, current, level.exit);
    if (!exitPath) {
      return fail('exit-blocked', segments, { type: 'exit', target: level.exit });
    }
    segments.push({
      type: 'exit',
      target: level.exit,
      path: exitPath,
      sound: soundCells(level, level.exit)
    });
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
    var used = 0;
    for (var i = 0; i < game.charms.length; i++) if (game.charms[i]) used++;
    return {
      id: 'oto-no-ie',
      levelIndex: game.levelIndex,
      levelTotal: TOTAL,
      levelTitle: game.level.title,
      levelHint: game.level.hint,
      phase: game.phase,
      paused: game.paused,
      maxCharms: game.level.maxCharms,
      range: game.level.range,
      charms: game.charms,
      charmsUsed: used,
      selectedSlot: game.selectedSlot,
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
    return level ? level.solution.slice() : null;
  }

  return {
    levels: LEVELS,
    total: TOTAL,
    createGame: createGame,
    loadLevel: loadLevel,
    placeCharm: placeCharm,
    removeCharmAt: removeCharmAt,
    clearCharms: clearCharms,
    selectSlot: selectSlot,
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
