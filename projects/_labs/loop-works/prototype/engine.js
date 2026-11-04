/* engine.js : LOOP WORKS line-lab prototype */
(function (root) {
  'use strict';

  var SIZE = 7;
  var SOURCE = { x: 0, y: 0 };
  var DOCK = { x: 6, y: 3 };
  var START_CORNERS = [{ x: 3, y: 0 }, { x: 3, y: 3 }];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function createGame() {
    var state = {
      phase: 'ready',
      time: 0,
      timeScale: 1,
      source: SOURCE,
      dock: DOCK,
      corners: [],
      path: [],
      crates: [],
      delivered: 0,
      spawnTimer: 1,
      dragging: -1,
      dragValid: true,
      dragTarget: null,
      dragOriginal: null,
      events: []
    };
    var nextCrateId = 1;

    function emit(type, extra) {
      var ev = { type: type };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      state.events.push(ev);
    }

    function sign(n) { return n < 0 ? -1 : (n > 0 ? 1 : 0); }

    function routeSegment(a, b, horizontalFirst) {
      var out = [];
      var x = a.x, y = a.y;
      if (horizontalFirst) {
        while (x !== b.x) { x += sign(b.x - x); out.push({ x: x, y: y }); }
        while (y !== b.y) { y += sign(b.y - y); out.push({ x: x, y: y }); }
      } else {
        while (y !== b.y) { y += sign(b.y - y); out.push({ x: x, y: y }); }
        while (x !== b.x) { x += sign(b.x - x); out.push({ x: x, y: y }); }
      }
      return out;
    }

    function buildPath(corners) {
      var pts = [{ x: SOURCE.x, y: SOURCE.y }];
      var prev = SOURCE;
      for (var i = 0; i < corners.length; i++) {
        var c = corners[i];
        if (c.x === prev.x && c.y === prev.y) continue;
        var horizontalFirst = Math.abs(c.x - prev.x) >= Math.abs(c.y - prev.y);
        pts = pts.concat(routeSegment(prev, c, horizontalFirst));
        prev = c;
      }
      if (prev.x !== DOCK.x || prev.y !== DOCK.y) {
        var hf = Math.abs(DOCK.x - prev.x) >= Math.abs(DOCK.y - prev.y);
        pts = pts.concat(routeSegment(prev, DOCK, hf));
      }

      var seen = {};
      for (var j = 0; j < pts.length; j++) {
        var p = pts[j];
        if (p.x < 0 || p.y < 0 || p.x >= SIZE || p.y >= SIZE) return null;
        var key = p.x + ',' + p.y;
        if (seen[key]) return null;
        seen[key] = true;
      }
      if (pts.length < 2) return null;
      return pts;
    }

    function applyPath(corners) {
      var path = buildPath(corners);
      if (!path) return false;
      state.path = path;
      return true;
    }

    function start() {
      state.phase = 'playing';
      state.time = 0;
      state.timeScale = 1;
      state.corners = START_CORNERS.map(function (p) { return { x: p.x, y: p.y }; });
      state.crates = [];
      state.delivered = 0;
      state.spawnTimer = 0.8;
      state.dragging = -1;
      state.dragValid = true;
      state.dragTarget = null;
      state.dragOriginal = null;
      state.events = [];
      nextCrateId = 1;
      applyPath(state.corners);
      emit('start');
      return true;
    }

    function beginDrag(index) {
      if (state.phase !== 'playing') return false;
      if (index < 0 || index >= state.corners.length) return false;
      state.dragging = index;
      state.dragValid = true;
      state.dragTarget = { x: state.corners[index].x, y: state.corners[index].y };
      state.dragOriginal = { x: state.corners[index].x, y: state.corners[index].y };
      state.timeScale = 0.25;
      emit('grab', { index: index });
      return true;
    }

    function moveCorner(x, y) {
      if (state.dragging < 0) return false;
      var cell = { x: clamp(Math.round(x), 0, SIZE - 1), y: clamp(Math.round(y), 0, SIZE - 1) };
      if (cell.x === SOURCE.x && cell.y === SOURCE.y) { state.dragTarget = cell; state.dragValid = false; return false; }
      if (cell.x === DOCK.x && cell.y === DOCK.y) { state.dragTarget = cell; state.dragValid = false; return false; }
      state.dragTarget = cell;
      var test = state.corners.map(function (p) { return { x: p.x, y: p.y }; });
      test[state.dragging] = cell;
      var path = buildPath(test);
      if (!path) {
        state.dragValid = false;
        return false;
      }
      state.dragValid = true;
      state.corners = test;
      state.path = path;
      return true;
    }

    function endDrag() {
      if (state.dragging < 0) return false;
      if (!state.dragValid && state.dragOriginal) {
        state.corners[state.dragging] = { x: state.dragOriginal.x, y: state.dragOriginal.y };
        applyPath(state.corners);
        emit('invalid');
      } else {
        emit('snap', { index: state.dragging });
      }
      state.dragging = -1;
      state.dragTarget = null;
      state.dragOriginal = null;
      state.timeScale = 1;
      return true;
    }

    function update(t, dt) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt) * state.timeScale;
      state.time += dt;
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && state.crates.length < 5) {
        state.crates.push({ id: nextCrateId++, d: 0.1 });
        state.spawnTimer = 1.2;
        emit('spawn');
      }
      var pathLen = state.path.length - 1;
      for (var i = state.crates.length - 1; i >= 0; i--) {
        var c = state.crates[i];
        c.d += 2.2 * dt;
        if (c.d >= pathLen) {
          state.crates.splice(i, 1);
          state.delivered += 1;
          emit('deliver');
        }
      }
      return getState();
    }

    function pointAt(d) {
      var path = state.path;
      if (!path.length) return { x: 0, y: 0 };
      if (d <= 0) return { x: path[0].x, y: path[0].y };
      if (d >= path.length - 1) return { x: path[path.length - 1].x, y: path[path.length - 1].y };
      var i = Math.floor(d);
      var f = d - i;
      var a = path[i], b = path[i + 1];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }

    function getState() {
      return {
        phase: state.phase,
        time: state.time,
        timeScale: state.timeScale,
        source: state.source,
        dock: state.dock,
        corners: state.corners,
        path: state.path,
        crates: state.crates,
        delivered: state.delivered,
        dragging: state.dragging,
        dragValid: state.dragValid,
        dragTarget: state.dragTarget,
        events: state.events
      };
    }

    return {
      state: state,
      start: start,
      update: update,
      beginDrag: beginDrag,
      moveCorner: moveCorner,
      endDrag: endDrag,
      pointAt: pointAt,
      getState: getState,
      SIZE: SIZE
    };
  }

  root.LoopWorksEngine = { createGame: createGame, SIZE: SIZE, SOURCE: SOURCE, DOCK: DOCK };
})(typeof globalThis !== 'undefined' ? globalThis : this);
