/* engine.js : STILL WATER のコアロジック（UI非依存・描画非依存）
 *
 * 湖にキャストし、アタリを合わせ、テンションを保ちながら魚を巻き取る釣りゲーム。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StillWaterEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CASTS = 8;
  var CHARGE_TIME = 1.15;
  var BITE_WINDOW = 1.05;
  var FISH = [
    { id: 'bluegill', name: 'BLUEGILL', min: 10, max: 24, rarity: 'COMMON', mult: 1, pull: 0.22, stamina: 0.72, color: '#78c8bf' },
    { id: 'bass', name: 'BASS', min: 28, max: 52, rarity: 'UNCOMMON', mult: 2, pull: 0.32, stamina: 0.95, color: '#88a76a' },
    { id: 'koi', name: 'KOI', min: 36, max: 68, rarity: 'RARE', mult: 3, pull: 0.44, stamina: 1.2, color: '#e07a52' },
    { id: 'golden', name: 'GOLDEN CARP', min: 52, max: 86, rarity: 'LEGENDARY', mult: 5, pull: 0.58, stamina: 1.45, color: '#f4c96b' },
    { id: 'boot', name: 'OLD BOOT', min: 24, max: 30, rarity: 'JUNK', mult: 0, pull: 0.2, stamina: 0.6, color: '#77685a' }
  ];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function createGame() {
    var rng = 20261030;
    function rand() {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      return rng / 4294967296;
    }

    var state = {
      phase: 'start',
      time: 0,
      castsLeft: CASTS,
      castIndex: 0,
      charge: 0,
      power: 0,
      holding: false,
      waitTimer: 0,
      biteTimer: 0,
      endTimer: 0,
      fish: null,
      tension: 0.42,
      progress: 0,
      slack: 0,
      score: 0,
      totalCm: 0,
      bestCatch: null,
      catches: [],
      misses: 0,
      result: null,
      events: []
    };

    function emit(type, extra) {
      var ev = { type: type };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      state.events.push(ev);
    }

    function start() {
      rng = 20261030;
      state.phase = 'aim';
      state.time = 0;
      state.castsLeft = CASTS;
      state.castIndex = 0;
      state.charge = 0;
      state.power = 0;
      state.holding = false;
      state.waitTimer = 0;
      state.biteTimer = 0;
      state.endTimer = 0;
      state.fish = null;
      state.tension = 0.42;
      state.progress = 0;
      state.slack = 0;
      state.score = 0;
      state.totalCm = 0;
      state.bestCatch = null;
      state.catches = [];
      state.misses = 0;
      state.result = null;
      state.events = [];
      return true;
    }

    function reset() {
      state.phase = 'start';
      state.result = null;
      return true;
    }

    function chooseFish(power) {
      var r = rand();
      if (power < 0.34) {
        if (r < 0.12) return FISH[4];
        if (r < 0.38) return FISH[1];
        return FISH[0];
      }
      if (power < 0.7) {
        if (r < 0.1) return FISH[4];
        if (r < 0.42) return FISH[2];
        if (r < 0.78) return FISH[1];
        return FISH[0];
      }
      if (r < 0.1) return FISH[4];
      if (r < 0.34) return FISH[3];
      if (r < 0.76) return FISH[2];
      return FISH[1];
    }

    function cast() {
      if (state.phase !== 'aim' || !state.holding) return false;
      state.power = clamp(state.charge, 0.08, 1);
      state.holding = false;
      state.charge = 0;
      state.castsLeft -= 1;
      state.castIndex += 1;
      state.fish = chooseFish(state.power);
      state.fish.seed = rand() * Math.PI * 2;
      state.phase = 'wait';
      state.waitTimer = 1.0 + rand() * 1.5;
      emit('cast', { power: state.power });
      return true;
    }

    function hook() {
      if (state.phase !== 'bite') return false;
      state.phase = 'reel';
      state.tension = 0.42;
      state.progress = 0;
      state.slack = 0;
      state.holding = true;
      emit('hook', { fish: state.fish.id });
      return true;
    }

    function catchFish() {
      var f = state.fish;
      var size = Math.round(f.min + rand() * (f.max - f.min));
      var points = Math.round(size * f.mult);
      var caught = {
        id: f.id, name: f.name, rarity: f.rarity, size: size,
        points: points, color: f.color
      };
      state.score += points;
      state.totalCm += size;
      state.catches.push(caught);
      if (!state.bestCatch || size > state.bestCatch.size) state.bestCatch = caught;
      state.phase = 'caught';
      state.endTimer = 1.25;
      state.holding = false;
      emit('catch', { catch: caught });
    }

    function escape(reason) {
      if (state.phase === 'finished') return;
      state.phase = 'escaped';
      state.endTimer = 0.95;
      state.holding = false;
      state.misses += 1;
      emit('escape', { reason: reason });
    }

    function finish() {
      state.phase = 'finished';
      state.result = {
        score: state.score,
        catches: state.catches.slice(),
        totalCm: state.totalCm,
        misses: state.misses,
        bestCatch: state.bestCatch,
        catchesCount: state.catches.length
      };
      emit('finish');
    }

    function nextCast() {
      if (state.castsLeft <= 0) { finish(); return; }
      state.phase = 'aim';
      state.charge = 0;
      state.power = 0;
      state.holding = false;
      state.fish = null;
      state.progress = 0;
      state.tension = 0.42;
      state.slack = 0;
    }

    function press() {
      if (state.phase === 'aim') { state.holding = true; return true; }
      if (state.phase === 'bite') return hook();
      if (state.phase === 'reel') { state.holding = true; return true; }
      return false;
    }

    function release() {
      if (state.phase === 'aim') {
        if (state.holding) cast();
        state.holding = false;
        return true;
      }
      if (state.phase === 'reel') {
        state.holding = false;
        return true;
      }
      return false;
    }

    function update(t, dt) {
      if (state.phase === 'start' || state.phase === 'finished') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      state.time += dt;

      if (state.phase === 'aim') {
        if (state.holding) state.charge = clamp(state.charge + dt / CHARGE_TIME, 0, 1);
      } else if (state.phase === 'wait') {
        state.waitTimer -= dt;
        if (state.waitTimer <= 0) {
          state.phase = 'bite';
          state.biteTimer = BITE_WINDOW;
          emit('bite', { fish: state.fish.id, rarity: state.fish.rarity });
        }
      } else if (state.phase === 'bite') {
        state.biteTimer -= dt;
        if (state.biteTimer <= 0) escape('missed');
      } else if (state.phase === 'reel') {
        var f = state.fish;
        var pull = f.pull * (0.55 + 0.45 * Math.sin(state.time * 4.4 + f.seed));
        state.tension += (state.holding ? 0.5 : -0.68) * dt;
        state.tension += (pull - 0.32) * dt * 0.9;
        if (state.holding) {
          state.progress += (0.24 / f.stamina) * dt;
          state.slack = 0;
        } else {
          state.progress = Math.max(0, state.progress - 0.018 * dt);
          if (state.tension < 0.13) state.slack += dt;
          else state.slack = 0;
        }
        state.tension = clamp(state.tension, 0, 1.1);
        if (state.tension > 1) { escape('snap'); return getState(); }
        if (state.slack > 0.95) { escape('slack'); return getState(); }
        if (state.progress >= 1) catchFish();
      } else if (state.phase === 'caught' || state.phase === 'escaped') {
        state.endTimer -= dt;
        if (state.endTimer <= 0) nextCast();
      }
      return getState();
    }

    function autoStep() {
      if (state.phase === 'aim') {
        if (!state.holding) press();
        else if (state.charge >= 0.74) release();
      } else if (state.phase === 'bite') {
        press();
      } else if (state.phase === 'reel') {
        if (state.tension > 0.72 && state.holding) release();
        else if (state.tension < 0.5 && !state.holding) press();
      }
    }

    function getState() {
      return {
        phase: state.phase,
        time: state.time,
        castsLeft: state.castsLeft,
        castsUsed: CASTS - state.castsLeft,
        charge: state.charge,
        power: state.power,
        holding: state.holding,
        tension: state.tension,
        progress: state.progress,
        score: state.score,
        totalCm: state.totalCm,
        catches: state.catches.slice(),
        catchesCount: state.catches.length,
        bestCatch: state.bestCatch,
        misses: state.misses,
        fish: state.fish ? {
          id: state.fish.id, name: state.fish.name, rarity: state.fish.rarity,
          color: state.fish.color, pull: state.fish.pull
        } : null,
        biteLeft: Math.max(0, state.biteTimer),
        result: state.result,
        events: state.events.slice()
      };
    }

    return {
      state: state,
      start: start,
      reset: reset,
      update: update,
      press: press,
      release: release,
      autoStep: autoStep,
      getState: getState
    };
  }

  return { createGame: createGame, CASTS: CASTS, FISH: FISH };
});
