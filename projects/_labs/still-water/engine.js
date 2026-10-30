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
    { id: 'bluegill', name: 'BLUEGILL', min: 10, max: 24, rarity: 'COMMON', mult: 1, pull: 0.22, stamina: 0.72, fight: 'steady', color: '#78c8bf' },
    { id: 'bass', name: 'BASS', min: 28, max: 52, rarity: 'UNCOMMON', mult: 2, pull: 0.32, stamina: 0.95, fight: 'darter', color: '#88a76a' },
    { id: 'koi', name: 'KOI', min: 36, max: 68, rarity: 'RARE', mult: 3, pull: 0.44, stamina: 1.2, fight: 'diver', color: '#e07a52' },
    { id: 'golden', name: 'GOLDEN CARP', min: 52, max: 86, rarity: 'LEGENDARY', mult: 5, pull: 0.58, stamina: 1.45, fight: 'thrash', color: '#f4c96b' },
    { id: 'boot', name: 'OLD BOOT', min: 24, max: 30, rarity: 'JUNK', mult: 0, pull: 0.2, stamina: 0.6, fight: 'dead', color: '#77685a' }
  ];
  var SPOTS = [
    { id: 'reeds', name: 'REEDS', x: -0.66 },
    { id: 'open', name: 'OPEN WATER', x: 0 },
    { id: 'rocks', name: 'DEEP ROCKS', x: 0.66 }
  ];
  var LURES = [
    { id: 'worm', name: 'WORM', tag: 'SAFE', bite: 1.3, pull: 0.82, window: 1.15 },
    { id: 'spoon', name: 'SPOON', tag: 'BALANCED', bite: 1, pull: 1, window: 1 },
    { id: 'fly', name: 'FLY', tag: 'RISKY', bite: 0.78, pull: 1.15, window: 0.86 }
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
      aimX: 0,
      spot: 'open',
      activeSpot: 'open',
      castQuality: '',
      perfectCasts: 0,
      lure: 'spoon',
      hookQuality: '',
      biteWindow: BITE_WINDOW,
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
      streak: 0,
      bestStreak: 0,
      perfectHooks: 0,
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

    function start(lureId) {
      rng = 20261030;
      state.phase = 'aim';
      state.time = 0;
      state.castsLeft = CASTS;
      state.castIndex = 0;
      state.charge = 0;
      state.power = 0;
      state.aimX = 0;
      state.spot = 'open';
      state.activeSpot = 'open';
      state.castQuality = '';
      state.perfectCasts = 0;
      state.lure = hasLure(lureId) ? lureId : 'spoon';
      state.hookQuality = '';
      state.biteWindow = BITE_WINDOW;
      state.holding = false;
      pickActiveSpot();
      state.waitTimer = 0;
      state.biteTimer = 0;
      state.endTimer = 0;
      state.fish = null;
      state.tension = 0.42;
      state.progress = 0;
      state.slack = 0;
      state.score = 0;
      state.totalCm = 0;
      state.streak = 0;
      state.bestStreak = 0;
      state.perfectHooks = 0;
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

    function hasLure(id) {
      for (var i = 0; i < LURES.length; i++) if (LURES[i].id === id) return true;
      return false;
    }
    function lureDef() {
      for (var i = 0; i < LURES.length; i++) if (LURES[i].id === state.lure) return LURES[i];
      return LURES[1];
    }
    function activeSpotDef() {
      for (var i = 0; i < SPOTS.length; i++) if (SPOTS[i].id === state.activeSpot) return SPOTS[i];
      return SPOTS[1];
    }
    function pickActiveSpot() {
      var index = Math.floor(rand() * SPOTS.length);
      state.activeSpot = SPOTS[index].id;
    }

    function nearestSpot(aimX) {
      var best = SPOTS[1];
      var bestD = 999;
      for (var i = 0; i < SPOTS.length; i++) {
        var d = Math.abs(aimX - SPOTS[i].x);
        if (d < bestD) { bestD = d; best = SPOTS[i]; }
      }
      return best;
    }

    function chooseFish(power, spot, perfectCast) {
      var r = rand();
      var deep = power >= 0.66;
      var fish;
      if (spot === 'reeds') {
        if (deep) fish = r < 0.18 ? FISH[4] : (r < 0.7 ? FISH[1] : FISH[0]);
        else fish = r < 0.16 ? FISH[4] : (r < 0.45 ? FISH[1] : FISH[0]);
      } else if (spot === 'rocks') {
        if (deep) fish = r < 0.14 ? FISH[4] : (r < 0.46 ? FISH[3] : (r < 0.82 ? FISH[2] : FISH[1]));
        else fish = r < 0.18 ? FISH[4] : (r < 0.38 ? FISH[3] : (r < 0.75 ? FISH[2] : FISH[1]));
      } else {
        if (deep) fish = r < 0.14 ? FISH[4] : (r < 0.34 ? FISH[3] : (r < 0.82 ? FISH[2] : FISH[1]));
        else fish = r < 0.16 ? FISH[4] : (r < 0.58 ? FISH[2] : (r < 0.82 ? FISH[1] : FISH[0]));
      }

      var q = rand();
      if (state.lure === 'fly') {
        if (fish.id === 'bluegill' && q < 0.55) fish = FISH[1];
        else if (fish.id === 'bass' && q < 0.45) fish = FISH[2];
        else if (fish.id === 'koi' && q < 0.28) fish = FISH[3];
      } else if (state.lure === 'worm') {
        if (fish.id === 'golden' && q < 0.7) fish = FISH[2];
        else if (fish.id === 'koi' && q < 0.35) fish = FISH[1];
      }
      if (perfectCast) {
        var q2 = rand();
        if (fish.id === 'bass' && q2 < 0.5) fish = FISH[2];
        else if (fish.id === 'koi' && q2 < 0.38) fish = FISH[3];
      }
      if (state.castsLeft === 1) {
        var q3 = rand();
        if (fish.id === 'bass' && q3 < 0.45) fish = FISH[2];
        else if (fish.id === 'koi' && q3 < 0.42) fish = FISH[3];
        if (perfectCast && fish.id === 'koi' && q3 > 0.7) fish = FISH[3];
        if (perfectCast && fish.id === 'bass' && q3 > 0.82) fish = FISH[3];
      }
      return fish;
    }

    function cast() {
      if (state.phase !== 'aim' || !state.holding) return false;
      state.power = clamp(state.charge, 0.08, 1);
      state.holding = false;
      state.charge = 0;
      state.castsLeft -= 1;
      state.castIndex += 1;
      state.spot = nearestSpot(state.aimX).id;
      var active = activeSpotDef();
      state.castQuality = Math.abs(state.aimX - active.x) <= 0.14 ? 'perfect' : 'good';
      if (state.castQuality === 'perfect') state.perfectCasts += 1;
      state.fish = chooseFish(state.power, state.spot, state.castQuality === 'perfect');
      state.fish.seed = rand() * Math.PI * 2;
      state.phase = 'wait';
      var lure = lureDef();
      state.waitTimer = (1.0 + rand() * 1.5) * lure.bite * (state.castQuality === 'perfect' ? 0.78 : 1);
      state.biteWindow = BITE_WINDOW * lure.window;
      emit('cast', { power: state.power, spot: state.spot, aimX: state.aimX, quality: state.castQuality, lure: state.lure });
      return true;
    }

    function hook() {
      if (state.phase !== 'bite') return false;
      state.phase = 'reel';
      state.hookQuality = state.biteTimer > state.biteWindow * 0.64 ? 'perfect' : 'good';
      state.tension = state.hookQuality === 'perfect' ? 0.48 : 0.42;
      state.progress = state.hookQuality === 'perfect' ? 0.08 : 0;
      state.slack = 0;
      state.holding = true;
      if (state.hookQuality === 'perfect') state.perfectHooks += 1;
      emit('hook', { fish: state.fish.id, quality: state.hookQuality });
      return true;
    }

    function catchFish() {
      var f = state.fish;
      var size = Math.round(f.min + rand() * (f.max - f.min));
      var streakMult = 1 + Math.min(state.streak, 5) * 0.1;
      var hookMult = state.hookQuality === 'perfect' ? 1.2 : 1;
      var castMult = state.castQuality === 'perfect' ? 1.15 : 1;
      var junk = f.rarity === 'JUNK';
      var points = junk ? 0 : Math.round(size * f.mult * streakMult * hookMult * castMult);
      if (junk) state.streak = 0;
      else {
        state.streak += 1;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
      }
      var caught = {
        id: f.id, name: f.name, rarity: f.rarity, size: size, junk: junk,
        points: points, color: f.color, quality: state.hookQuality,
        castQuality: state.castQuality, lure: state.lure, streak: state.streak
      };
      state.score += points;
      state.totalCm += size;
      state.catches.push(caught);
      if (!junk && (!state.bestCatch || size > state.bestCatch.size)) state.bestCatch = caught;
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
      state.streak = 0;
      emit('escape', { reason: reason });
    }

    function gradeFor(score, catches) {
      if (score >= 1500) return 'S';
      if (score >= 1050) return 'A';
      if (score >= 700) return 'B';
      if (score >= 380) return 'C';
      if (catches > 0) return 'D';
      return '—';
    }

    function finish() {
      state.phase = 'finished';
      state.result = {
        score: state.score,
        catches: state.catches.slice(),
        totalCm: state.totalCm,
        misses: state.misses,
        bestCatch: state.bestCatch,
        catchesCount: state.catches.length,
        bestStreak: state.bestStreak,
        perfectHooks: state.perfectHooks,
        perfectCasts: state.perfectCasts,
        lure: state.lure,
        grade: gradeFor(state.score, state.catches.length)
      };
      emit('finish');
    }

    function nextCast() {
      if (state.castsLeft <= 0) { finish(); return; }
      state.phase = 'aim';
      state.charge = 0;
      state.power = 0;
      state.aimX = 0;
      state.spot = 'open';
      state.activeSpot = 'open';
      state.castQuality = '';
      state.hookQuality = '';
      state.biteWindow = BITE_WINDOW;
      state.holding = false;
      pickActiveSpot();
      state.fish = null;
      state.progress = 0;
      state.tension = 0.42;
      state.slack = 0;
    }

    function setAimX(value) {
      if (state.phase !== 'aim') return false;
      state.aimX = clamp(value, -1, 1);
      return true;
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
        var pulse = Math.sin(state.time * 4.4 + f.seed);
        var fight = f.fight;
        if (fight === 'darter') {
          var burst = Math.max(0, Math.sin(state.time * 1.9 + f.seed));
          pulse = 0.2 + burst * 1.5;
        } else if (fight === 'diver') {
          pulse = 0.75 + 0.25 * Math.sin(state.time * 2.0 + f.seed);
        } else if (fight === 'thrash') {
          pulse = 0.45 + 0.55 * Math.sin(state.time * 9.2 + f.seed);
        } else if (fight === 'dead') {
          pulse = 0.3;
        }
        var pull = f.pull * pulse * lureDef().pull;
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
        if (!state.holding) { setAimX(activeSpotDef().x); press(); }
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
        aimX: state.aimX,
        spot: state.spot,
        activeSpot: state.activeSpot,
        castQuality: state.castQuality,
        perfectCasts: state.perfectCasts,
        lure: state.lure,
        hookQuality: state.hookQuality,
        biteWindow: state.biteWindow,
        holding: state.holding,
        tension: state.tension,
        progress: state.progress,
        score: state.score,
        totalCm: state.totalCm,
        catches: state.catches.slice(),
        catchesCount: state.catches.length,
        bestCatch: state.bestCatch,
        streak: state.streak,
        bestStreak: state.bestStreak,
        perfectHooks: state.perfectHooks,
        misses: state.misses,
        fish: state.fish ? {
          id: state.fish.id, name: state.fish.name, rarity: state.fish.rarity,
          color: state.fish.color, pull: state.fish.pull, fight: state.fish.fight
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
      setAimX: setAimX,
      press: press,
      release: release,
      autoStep: autoStep,
      getState: getState
    };
  }

  return { createGame: createGame, CASTS: CASTS, FISH: FISH, SPOTS: SPOTS, LURES: LURES };
});
