/* engine.js : TETHER のコアロジック（UI非依存・描画非依存）
 *
 * 縦の塔に浮かぶアンカーへロープでぶら下がり、押して巻き取り、離して飛ぶ。
 * 60秒でどこまで登れるかを競う。アンカーは何度でも掴み直せる。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TetherEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DURATION = 60;
  var START_Y = 110;
  var GRAVITY = 980;
  var REEL_SPEED = 250;
  var MIN_LENGTH = 26;
  var MAX_LENGTH = 220;
  var ATTACH_RADIUS = 120;
  var PLAYER_R = 9;
  var HEIGHT_SCALE = 10;
  var WALL_X = 178;
  var SNAP = 780;

  var ANCHORS = [
    { x: 0, y: 190 }, { x: 70, y: 520 }, { x: -70, y: 850 }, { x: 80, y: 1180 },
    { x: -90, y: 1510 }, { x: 70, y: 1840 }, { x: -80, y: 2170 }, { x: 90, y: 2500 },
    { x: -70, y: 2830 }, { x: 60, y: 3160 }, { x: -60, y: 3490 }, { x: 0, y: 3820 },
    { x: 70, y: 4150 }, { x: -70, y: 4480 }, { x: 0, y: 4810 }
  ];

  var OBSTACLES = [
    { x: 0, y: 1050, len: 110, thickness: 7, angle: 0.2, speed: 2.2 },
    { x: 0, y: 2330, len: 120, thickness: 7, angle: 1.1, speed: -2.6 },
    { x: 0, y: 3650, len: 115, thickness: 7, angle: 2.0, speed: 2.4 }
  ];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }

  function createGame() {
    var state = {
      phase: 'start',
      time: 0,
      player: { x: 0, y: START_Y, vx: 0, vy: 0, r: PLAYER_R, hue: 174 },
      tether: null,
      anchors: [],
      obstacles: [],
      holding: false,
      attachCooldown: 0,
      maxY: START_Y,
      height: 0,
      result: null,
      events: [],
      rescues: 0,
      startedAt: 0
    };

    function makeAnchors() {
      state.anchors = ANCHORS.map(function (a, i) {
        return { id: i, x: a.x, y: a.y, used: false };
      });
      state.obstacles = OBSTACLES.map(function (o) {
        return { x: o.x, y: o.y, len: o.len, thickness: o.thickness, angle: o.angle, speed: o.speed };
      });
    }

    function emit() { }

    function start() {
      makeAnchors();
      state.phase = 'playing';
      state.time = 0;
      state.player = { x: 0, y: START_Y, vx: 0, vy: 0, r: PLAYER_R, hue: 174 };
      state.anchors[0].used = true;
      state.tether = { anchorId: 0, length: dist(state.player.x, state.player.y, state.anchors[0].x, state.anchors[0].y) };
      state.holding = false;
      state.attachCooldown = 0;
      state.maxY = state.player.y;
      state.height = 0;
      state.result = null;
      state.events = [];
      state.rescues = 0;
      state.startedAt = Date.now();
      emit();
      return true;
    }

    function reset() {
      makeAnchors();
      state.phase = 'start';
      state.time = 0;
      state.player = { x: 0, y: START_Y, vx: 0, vy: 0, r: PLAYER_R, hue: 174 };
      state.tether = null;
      state.holding = false;
      state.attachCooldown = 0;
      state.maxY = START_Y;
      state.height = 0;
      state.result = null;
      state.events = [];
      state.rescues = 0;
      emit();
    }

    function finish() {
      state.phase = 'finished';
      state.result = {
        height: Math.floor(state.height),
        maxY: state.maxY,
        time: Math.floor(state.time),
        anchors: state.anchors.filter(function (a) { return a.used; }).length
      };
      state.tether = null;
      state.holding = false;
      state.events.push({ type: 'finish', x: state.player.x, y: state.player.y });
    }

    function attachNearest() {
      if (state.attachCooldown > 0) return false;
      var best = null;
      var bestD = ATTACH_RADIUS;
      for (var i = 0; i < state.anchors.length; i++) {
        var a = state.anchors[i];
        var d = dist(state.player.x, state.player.y, a.x, a.y);
        if (d < bestD) { bestD = d; best = a; }
      }
      if (!best) return false;
      best.used = true;
      state.tether = { anchorId: best.id, length: clamp(bestD, MIN_LENGTH, MAX_LENGTH) };
      state.events.push({ type: 'attach', x: best.x, y: best.y });
      return true;
    }

    function detach() {
      if (!state.tether) return false;
      var current = state.tether.anchorId;
      state.events.push({ type: 'detach', x: state.player.x, y: state.player.y });
      state.tether = null;
      state.holding = false;
      state.attachCooldown = 0.35;
      var target = null;
      for (var i = 0; i < state.anchors.length; i++) {
        var a = state.anchors[i];
        if (a.id === current || a.y <= state.player.y + 40) continue;
        if (!target || a.y < target.y) target = a;
      }
      if (target) {
        var dx = target.x - state.player.x;
        var dy = target.y - state.player.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        state.player.vx += (dx / d) * SNAP * 0.65;
        state.player.vy += (dy / d) * SNAP;
      } else {
        state.player.vy += SNAP;
      }
      return true;
    }

    function rescueFromFloor() {
      var a = state.anchors[0];
      if (!a) return false;
      var d = dist(state.player.x, state.player.y, a.x, a.y) || 1;
      a.used = true;
      state.tether = { anchorId: a.id, length: d };
      state.player.vx = 0;
      state.player.vy = 0;
      state.attachCooldown = 0;
      state.rescues += 1;
      state.events.push({ type: 'rescue', x: a.x, y: a.y });
      return true;
    }

    function setHold(on) {
      if (state.phase !== 'playing') return false;
      if (on) {
        state.holding = true;
        if (!state.tether) attachNearest();
        return true;
      }
      if (state.holding && state.tether) detach();
      state.holding = false;
      return true;
    }

    function update(t, dt) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      state.time += dt;
      state.attachCooldown = Math.max(0, state.attachCooldown - dt);

      var p = state.player;
      if (state.tether) {
        var a = state.anchors[state.tether.anchorId];
        if (state.holding) {
          state.tether.length = Math.max(MIN_LENGTH, state.tether.length - REEL_SPEED * dt);
        }
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        var dx = p.x - a.x;
        var dy = p.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d > state.tether.length) {
          var nx = dx / d;
          var ny = dy / d;
          p.x = a.x + nx * state.tether.length;
          p.y = a.y + ny * state.tether.length;
          var vn = p.vx * nx + p.vy * ny;
          if (vn > 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
        }
      } else {
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (state.holding) attachNearest();
      }

      if (p.x < -WALL_X + p.r) { p.x = -WALL_X + p.r; p.vx = Math.abs(p.vx) * 0.55; }
      if (p.x > WALL_X - p.r) { p.x = WALL_X - p.r; p.vx = -Math.abs(p.vx) * 0.55; }
      if (p.y <= START_Y) {
        p.y = START_Y;
        p.vy = Math.max(0, p.vy);
        if (!state.tether) rescueFromFloor();
      }

      for (var oi = 0; oi < state.obstacles.length; oi++) {
        var o = state.obstacles[oi];
        o.angle += o.speed * dt;
        var ux = Math.cos(o.angle) * o.len;
        var uy = Math.sin(o.angle) * o.len;
        var tproj = clamp(((p.x - o.x) * ux + (p.y - o.y) * uy) / (o.len * o.len), -1, 1);
        var cx = o.x + ux * tproj;
        var cy = o.y + uy * tproj;
        if (dist(p.x, p.y, cx, cy) < p.r + o.thickness) {
          var hx = p.x - cx;
          var hy = p.y - cy;
          var hd = Math.sqrt(hx * hx + hy * hy) || 1;
          p.x = cx + hx / hd * (p.r + o.thickness + 2);
          p.y = cy + hy / hd * (p.r + o.thickness + 2);
          p.vx += (hx / hd) * 150;
          p.vy += (hy / hd) * 150 - 80;
          state.events.push({ type: 'hit', x: p.x, y: p.y });
        }
      }

      state.maxY = Math.max(state.maxY, p.y);
      state.height = Math.max(0, (state.maxY - START_Y) / HEIGHT_SCALE);
      if (state.time >= DURATION) finish();
      return getState();
    }

    function autoStep() {
      if (state.phase !== 'playing') return;
      if (!state.tether) {
        if (!state.holding) setHold(true);
        return;
      }
      if (!state.holding) { setHold(true); return; }
      if (state.tether.length <= MIN_LENGTH + 8) setHold(false);
    }

    function getState() {
      return {
        phase: state.phase,
        time: state.time,
        duration: DURATION,
        timeLeft: Math.max(0, DURATION - state.time),
        player: { x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy, r: state.player.r, hue: state.player.hue },
        tether: state.tether ? { anchorId: state.tether.anchorId, length: state.tether.length } : null,
        anchors: state.anchors.map(function (a) { return { id: a.id, x: a.x, y: a.y, used: a.used }; }),
        obstacles: state.obstacles.map(function (o) { return { x: o.x, y: o.y, len: o.len, thickness: o.thickness, angle: o.angle }; }),
        holding: state.holding,
        anchorCooldown: state.attachCooldown,
        floorY: START_Y,
        maxY: state.maxY,
        height: Math.floor(state.height),
        rescues: state.rescues,
        result: state.result,
        events: state.events.slice()
      };
    }

    makeAnchors();
    return {
      state: state,
      start: start,
      reset: reset,
      update: update,
      setHold: setHold,
      autoStep: autoStep,
      getState: getState
    };
  }

  return {
    createGame: createGame,
    DURATION: DURATION,
    GRAVITY: GRAVITY,
    REEL_SPEED: REEL_SPEED,
    MIN_LENGTH: MIN_LENGTH,
    MAX_LENGTH: MAX_LENGTH,
    SNAP: SNAP,
    ATTACH_RADIUS: ATTACH_RADIUS,
    ANCHORS: ANCHORS,
    OBSTACLES: OBSTACLES,
    HEIGHT_SCALE: HEIGHT_SCALE
  };
});
