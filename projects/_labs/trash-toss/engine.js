/* engine.js : TRASH TOSS のコアロジック（UI非依存・描画非依存）
 *
 * 固定カメラのリビングで、動くゴミ箱へゴミを放物線で投げ入れる30秒ゲーム。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrashTossEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DURATION = 30;
  var DEPTH_START = 15;
  var BIN_Z = 3.4;
  var THROW_COOLDOWN = 0.22;
  var ORIGIN = { x: 0, y: 0.95, z: -1.4 };
  var AIM_Y = 0.92;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function createGame() {
    var rng = 20261030;
    function rand() {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      return rng / 4294967296;
    }

    var state = {
      phase: 'start',
      time: 0,
      score: 0,
      throws: 0,
      perfects: 0,
      streak: 0,
      bestStreak: 0,
      aim: { x: 0, z: BIN_Z },
      aimActive: false,
      bin: { x: 0, z: BIN_Z, r: 0.42, targetX: 0, targetZ: BIN_Z, timer: 0.8 },
      binSpeed: 0.95,
      depthPhase: false,
      cooldown: 0,
      projectiles: [],
      events: [],
      result: null,
      reason: ''
    };

    function start() {
      rng = 20261030;
      state.phase = 'playing';
      state.time = 0;
      state.score = 0;
      state.throws = 0;
      state.perfects = 0;
      state.streak = 0;
      state.bestStreak = 0;
      state.aim = { x: 0, z: BIN_Z };
      state.aimActive = false;
      state.bin = { x: 0, z: BIN_Z, r: 0.42, targetX: 0, targetZ: BIN_Z, timer: 0.8 };
      state.binSpeed = 0.95;
      state.depthPhase = false;
      state.cooldown = 0;
      state.projectiles = [];
      state.events = [];
      state.result = null;
      state.reason = '';
      return true;
    }

    function reset() {
      state.phase = 'start';
      state.score = 0;
      state.throws = 0;
      state.result = null;
      return true;
    }

    function finish() {
      if (state.phase === 'finished') return;
      state.phase = 'finished';
      state.reason = 'time';
      state.result = {
        score: state.score,
        throws: state.throws,
        perfects: state.perfects,
        bestStreak: state.bestStreak,
        accuracy: state.throws ? state.score / state.throws : 0,
        time: state.time
      };
      state.events.push({ type: 'finish' });
    }

    function setAim(dx, length) {
      if (state.phase !== 'playing') return;
      state.aim.x = clamp(dx * 0.012, -2.8, 2.8);
      state.aim.z = clamp(2.2 + (length - 35) * 0.012, 2.2, 5.2);
      state.aimActive = true;
    }

    function aimAt(x, z) {
      state.aim.x = clamp(x, -2.8, 2.8);
      state.aim.z = clamp(z, 2.2, 5.2);
      state.aimActive = true;
    }

    function clearAim() {
      state.aimActive = false;
    }

    function trajectory(from, to) {
      var dist = Math.hypot(to.x - from.x, to.z - from.z);
      var arc = 0.75 + dist * 0.28;
      var duration = 0.66 + dist * 0.055;
      return { arc: arc, duration: duration };
    }

    function throwAt(x, z) {
      if (state.phase !== 'playing' || state.cooldown > 0) return false;
      aimAt(x, z);
      var to = { x: state.aim.x, y: AIM_Y, z: state.aim.z };
      var path = trajectory(ORIGIN, to);
      var types = ['bag', 'bottle', 'can'];
      state.projectiles.push({
        from: { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z },
        to: to,
        arc: path.arc,
        duration: path.duration,
        t: 0,
        type: types[state.throws % types.length]
      });
      state.throws += 1;
      state.cooldown = THROW_COOLDOWN;
      state.aimActive = false;
      state.events.push({ type: 'throw', x: to.x, z: to.z });
      return true;
    }

    function throwCurrent() {
      return throwAt(state.aim.x, state.aim.z);
    }

    function moveBin(dt) {
      var b = state.bin;
      b.timer -= dt;
      if (b.timer <= 0) {
        b.targetX = -2.25 + rand() * 4.5;
        if (state.time >= DEPTH_START) b.targetZ = 2.35 + rand() * 2.75;
        else b.targetZ = BIN_Z;
        b.timer = 0.85 + rand() * 0.85;
      }
      var maxX = state.binSpeed * (1 + state.time / DURATION * 0.35);
      var maxZ = state.binSpeed * 0.58 * (1 + state.time / DURATION * 0.25);
      if (b.x < b.targetX) b.x = Math.min(b.targetX, b.x + maxX * dt);
      else if (b.x > b.targetX) b.x = Math.max(b.targetX, b.x - maxX * dt);
      if (b.z < b.targetZ) b.z = Math.min(b.targetZ, b.z + maxZ * dt);
      else if (b.z > b.targetZ) b.z = Math.max(b.targetZ, b.z - maxZ * dt);
      b.x = clamp(b.x, -2.3, 2.3);
      b.z = clamp(b.z, 2.2, 5.2);
    }

    function resolveProjectile(p) {
      var dx = p.to.x - state.bin.x;
      var dz = p.to.z - state.bin.z;
      var d = Math.hypot(dx, dz);
      if (d <= state.bin.r * 0.82) {
        state.score += 1;
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
        var perfect = d <= state.bin.r * 0.24;
        if (perfect) state.perfects += 1;
        state.events.push({ type: perfect ? 'perfect' : 'in', x: state.bin.x, z: state.bin.z, streak: state.streak });
      } else {
        state.streak = 0;
        state.events.push({ type: 'miss', x: p.to.x, z: p.to.z, distance: d });
      }
    }

    function update(t, dt) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      state.time += dt;
      state.cooldown = Math.max(0, state.cooldown - dt);
      if (!state.depthPhase && state.time >= DEPTH_START) {
        state.depthPhase = true;
        state.events.push({ type: 'depth' });
      }
      moveBin(dt);

      for (var i = state.projectiles.length - 1; i >= 0; i--) {
        var p = state.projectiles[i];
        p.t += dt;
        if (p.t >= p.duration) {
          resolveProjectile(p);
          state.projectiles.splice(i, 1);
        }
      }
      if (state.time >= DURATION) finish();
      return getState();
    }

    function autoStep() {
      if (state.phase !== 'playing') return;
      aimAt(state.bin.x, state.bin.z);
      throwCurrent();
    }

    function getPreview() {
      if (!state.aimActive) return [];
      var to = { x: state.aim.x, y: AIM_Y, z: state.aim.z };
      var path = trajectory(ORIGIN, to);
      var out = [];
      for (var i = 0; i <= 24; i++) {
        var t = i / 24;
        out.push({
          x: lerp(ORIGIN.x, to.x, t),
          y: lerp(ORIGIN.y, to.y, t) + Math.sin(Math.PI * t) * path.arc,
          z: lerp(ORIGIN.z, to.z, t)
        });
      }
      return out;
    }

    function projectilePoint(p) {
      var t = clamp(p.t / p.duration, 0, 1);
      return {
        x: lerp(p.from.x, p.to.x, t),
        y: lerp(p.from.y, p.to.y, t) + Math.sin(Math.PI * t) * p.arc,
        z: lerp(p.from.z, p.to.z, t)
      };
    }

    function getState() {
      return {
        phase: state.phase,
        time: state.time,
        timeLeft: Math.max(0, DURATION - state.time),
        duration: DURATION,
        score: state.score,
        throws: state.throws,
        perfects: state.perfects,
        streak: state.streak,
        bestStreak: state.bestStreak,
        aim: { x: state.aim.x, z: state.aim.z },
        aimActive: state.aimActive,
        preview: getPreview(),
        bin: { x: state.bin.x, z: state.bin.z, r: state.bin.r },
        depthPhase: state.depthPhase,
        cooldown: state.cooldown,
        projectiles: state.projectiles.map(function (p) {
          return {
            from: { x: p.from.x, y: p.from.y, z: p.from.z },
            to: { x: p.to.x, y: p.to.y, z: p.to.z },
            arc: p.arc, duration: p.duration, t: p.t, type: p.type
          };
        }),
        result: state.result,
        reason: state.reason,
        events: state.events.slice()
      };
    }

    return {
      state: state,
      start: start,
      reset: reset,
      update: update,
      setAim: setAim,
      clearAim: clearAim,
      throwAt: throwAt,
      throwCurrent: throwCurrent,
      autoStep: autoStep,
      getState: getState
    };
  }

  return {
    createGame: createGame,
    DURATION: DURATION,
    DEPTH_START: DEPTH_START,
    THROW_COOLDOWN: THROW_COOLDOWN,
    ORIGIN: ORIGIN,
    AIM_Y: AIM_Y
  };
});
