/* engine.js : ORBIT WARD のゲームロジック */
(function (root) {
  'use strict';

  var DURATION = 60;
  var START_HP = 10;
  var SHIELD_R = 0.56;
  var CORE_R = 0.13;
  var SPAWN_R = 1.08;
  var SHIELD_HALF = 1.1;
  var PERFECT_ARC = 0.18;
  var SEED = 20261031;
  var UPGRADES = [
    { id: 'wide', name: 'WIDE ARC', tag: 'SHIELD', desc: 'Extend the shield arc by 13 degrees.' },
    { id: 'prism', name: 'PRISM', tag: 'PERFECT', desc: 'Perfect blocks reflect a lance into another shard.' },
    { id: 'coolant', name: 'COOLANT', tag: 'PULSE', desc: 'PULSE charges 35% faster.' },
    { id: 'repair', name: 'REPAIR', tag: 'CORE', desc: 'Gain 2 core pips and repair 3.' },
    { id: 'slow', name: 'SLOW FIELD', tag: 'CONTROL', desc: 'All shards move 10% slower.' },
    { id: 'focus', name: 'FOCUS', tag: 'PERFECT', desc: 'Wider PERFECT window and +10% score.' },
    { id: 'overdrive', name: 'OVERDRIVE', tag: 'SCORE', desc: 'All score gains increase by 15%.' }
  ];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function angleDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function wrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function createGame() {
    var rng = SEED;
    var nextId = 1;
    function rand() {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      return rng / 4294967296;
    }

    var state = {
      phase: 'start',
      seed: SEED,
      time: 0,
      duration: DURATION,
      hp: START_HP,
      maxHp: START_HP,
      score: 0,
      combo: 0,
      bestCombo: 0,
      blocks: 0,
      perfectBlocks: 0,
      misses: 0,
      pulseUses: 0,
      shieldAngle: -Math.PI / 2,
      shieldHalf: SHIELD_HALF,
      pulseCharge: 0,
      pulseTimer: 0,
      spawnTimer: 0,
      nextSurge: 15,
      nextUpgrade: 20,
      upgradeChoices: null,
      upgrades: [],
      prism: 0,
      reflectHits: 0,
      slowMult: 1,
      pulseGainMult: 1,
      scoreMult: 1,
      perfectArcMult: 1,
      shards: [],
      events: [],
      result: null
    };

    function emit(type, extra) {
      var ev = { type: type };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      state.events.push(ev);
    }

    function start(seedArg) {
      rng = isFinite(seedArg) ? (seedArg >>> 0) : (Date.now() >>> 0);
      nextId = 1;
      state.phase = 'playing';
      state.seed = rng;
      state.time = 0;
      state.hp = START_HP;
      state.maxHp = START_HP;
      state.score = 0;
      state.combo = 0;
      state.bestCombo = 0;
      state.blocks = 0;
      state.perfectBlocks = 0;
      state.misses = 0;
      state.pulseUses = 0;
      state.shieldAngle = -Math.PI / 2;
      state.shieldHalf = SHIELD_HALF;
      state.pulseCharge = 0;
      state.pulseTimer = 0;
      state.spawnTimer = 0.85;
      state.nextSurge = 15;
      state.nextUpgrade = 20;
      state.upgradeChoices = null;
      state.upgrades = [];
      state.prism = 0;
      state.reflectHits = 0;
      state.slowMult = 1;
      state.pulseGainMult = 1;
      state.scoreMult = 1;
      state.perfectArcMult = 1;
      state.shards = [];
      state.events = [];
      state.result = null;
      emit('start');
      return true;
    }

    function reset() {
      state.phase = 'start';
      state.result = null;
      state.shards = [];
      state.events = [];
      return true;
    }

    function setShieldAngle(a) {
      if (state.phase !== 'playing' || !isFinite(a)) return false;
      state.shieldAngle = wrap(a);
      return true;
    }

    function turnShield(delta) {
      if (!isFinite(delta)) return false;
      return setShieldAngle(state.shieldAngle + delta);
    }

    function makeShard(angle, kind, r, speed, base) {
      var size = 0.034;
      var color = '#6fe7de';
      if (kind === 'heavy') { size = 0.058; color = '#f39a68'; }
      else if (kind === 'gold') { size = 0.03; color = '#f5d47a'; }
      else if (kind === 'splitter') { size = 0.043; color = '#c795ff'; }
      else if (kind === 'weaver') { size = 0.04; color = '#ff9ad5'; }
      else if (kind === 'fragment') { size = 0.026; color = '#a9b9ff'; }
      return {
        id: nextId++, kind: kind, angle: wrap(angle), r: r,
        speed: speed, size: size, base: base, color: color,
        spin: rand() * Math.PI * 2, didSplit: false, dead: false,
        born: state.time, baseAngle: wrap(angle)
      };
    }

    function spawnAt(angle, kind, r, speed, base) {
      state.shards.push(makeShard(angle, kind, r, speed, base));
    }

    function spawnOne(angleOverride) {
      var t = state.time;
      var r = rand();
      var kind = 'basic';
      if (t >= 12 && r < 0.075) kind = 'gold';
      else if (t >= 14 && r < 0.3) kind = 'splitter';
      else if (t >= 38 && r < 0.4) kind = 'heavy';
      else if (t >= 26 && r < 0.52) kind = 'weaver';

      var angle = angleOverride == null ? rand() * Math.PI * 2 : angleOverride;
      if (kind === 'gold') spawnAt(angle, kind, SPAWN_R, 0.19 + rand() * 0.035, 250);
      else if (kind === 'splitter') spawnAt(angle, kind, SPAWN_R, 0.105 + rand() * 0.025, 130);
      else if (kind === 'heavy') spawnAt(angle, kind, SPAWN_R, 0.083 + rand() * 0.02, 190);
      else if (kind === 'weaver') spawnAt(angle, kind, SPAWN_R, 0.11 + rand() * 0.025, 180);
      else spawnAt(angle, kind, SPAWN_R, 0.12 + rand() * 0.04, 100);
    }

    function intervalFor(t) {
      if (t < 15) return 1.7;
      if (t < 30) return 1.5;
      if (t < 45) return 1.3;
      return 1.1;
    }

    function chooseUpgrades() {
      var pool = [];
      for (var i = 0; i < UPGRADES.length; i++) {
        if (UPGRADES[i].id === 'prism' && state.prism > 0) continue;
        pool.push(UPGRADES[i]);
      }
      var picks = [];
      while (picks.length < 3 && pool.length) {
        var index = Math.floor(rand() * pool.length);
        picks.push(pool.splice(index, 1)[0]);
      }
      return picks;
    }

    function applyUpgrade(index) {
      if (state.phase !== 'upgrade' || !state.upgradeChoices) return false;
      var u = state.upgradeChoices[index];
      if (!u) return false;
      state.upgrades.push(u.id);
      if (u.id === 'wide') state.shieldHalf = Math.min(1.42, state.shieldHalf + 0.13);
      else if (u.id === 'prism') state.prism += 1;
      else if (u.id === 'coolant') state.pulseGainMult += 0.35;
      else if (u.id === 'repair') {
        state.maxHp += 2;
        state.hp = Math.min(state.maxHp, state.hp + 3);
      } else if (u.id === 'slow') state.slowMult = Math.max(0.7, state.slowMult * 0.9);
      else if (u.id === 'focus') {
        state.perfectArcMult += 0.2;
        state.scoreMult += 0.1;
      } else if (u.id === 'overdrive') state.scoreMult += 0.15;

      state.phase = 'playing';
      state.upgradeChoices = null;
      state.nextUpgrade += 20;
      emit('upgrade', { id: u.id, name: u.name });
      return true;
    }

    function pulse() {
      if (state.phase !== 'playing' || state.pulseCharge < 1 || state.pulseTimer > 0 || !state.shards.length) return false;
      var count = state.shards.length;
      var gained = Math.round(count * 55 + state.combo * 12);
      state.score += gained;
      state.pulseCharge = 0;
      state.pulseTimer = 0.7;
      state.pulseUses += 1;
      state.shards = [];
      emit('pulse', { count: count, gained: gained });
      return true;
    }

    function blockShard(s, perfect) {
      state.combo += 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      var mult = 1 + Math.min(state.combo - 1, 10) * 0.08;
      var points = Math.round(s.base * mult * (perfect ? 1.6 : 1) * state.scoreMult);
      state.score += points;
      state.blocks += 1;
      if (perfect) {
        state.perfectBlocks += 1;
        state.pulseCharge = Math.min(1, state.pulseCharge + 0.15 * state.pulseGainMult);
      } else {
        state.pulseCharge = Math.min(1, state.pulseCharge + 0.075 * state.pulseGainMult);
      }
      emit('block', {
        angle: s.angle, radius: SHIELD_R, perfect: perfect,
        points: points, combo: state.combo, kind: s.kind
      });
      if (perfect && state.prism > 0) {
        var target = null;
        var bestDiff = 999;
        for (var i = 0; i < state.shards.length; i++) {
          var other = state.shards[i];
          if (other.dead || other.id === s.id || other.r <= SHIELD_R) continue;
          var d = Math.abs(angleDiff(other.angle, s.angle));
          if (d < 0.13 && d < bestDiff) { bestDiff = d; target = other; }
        }
        if (target) {
          target.dead = true;
          state.reflectHits += 1;
          var bonus = Math.round(target.base * 0.7 * state.scoreMult);
          state.score += bonus;
          emit('reflect', { angle: target.angle, from: s.angle, targetR: target.r, points: bonus });
        }
      }
    }

    function missShard(s) {
      state.hp -= 1;
      state.combo = 0;
      state.misses += 1;
      emit('miss', { angle: s.angle, hp: state.hp });
      if (state.hp <= 0) finish(false);
    }

    function rankFor(score, win) {
      if (win && score >= 9000) return 'S';
      if (score >= 7000) return 'A';
      if (score >= 4800) return 'B';
      if (score >= 2800) return 'C';
      return 'D';
    }

    function finish(win) {
      if (state.phase !== 'playing') return;
      if (win) {
        state.time = DURATION;
        state.score += 300 + state.hp * 250;
      }
      state.phase = 'finished';
      state.result = {
        win: !!win,
        score: state.score,
        blocks: state.blocks,
        perfectBlocks: state.perfectBlocks,
        misses: state.misses,
        bestCombo: state.bestCombo,
        pulseUses: state.pulseUses,
        reflects: state.reflectHits,
        upgrades: state.upgrades.slice(),
        hp: state.hp,
        time: state.time,
        rank: rankFor(state.score, win)
      };
      emit('finish', { win: !!win });
    }

    function update(t, dt) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      state.time += dt;
      if (state.time >= DURATION) {
        state.time = DURATION;
        finish(true);
        return getState();
      }
      if (state.time >= state.nextUpgrade) {
        state.phase = 'upgrade';
        state.upgradeChoices = chooseUpgrades();
        emit('upgradeOffer', { at: state.nextUpgrade });
        return getState();
      }
      if (state.pulseTimer > 0) state.pulseTimer = Math.max(0, state.pulseTimer - dt);

      state.spawnTimer -= dt;
      while (state.spawnTimer <= 0) {
        spawnOne();
        state.spawnTimer += intervalFor(state.time);
      }
      if (state.time >= state.nextSurge) {
        var burst = state.nextSurge >= 45 ? 4 : 3;
        var baseAngle = rand() * Math.PI * 2;
        for (var b = 0; b < burst; b++) spawnOne(baseAngle + (rand() - 0.5) * 0.16);
        emit('surge', { at: state.nextSurge });
        state.nextSurge += 15;
      }

      for (var i = state.shards.length - 1; i >= 0; i--) {
        var s = state.shards[i];
        if (s.dead) { state.shards.splice(i, 1); continue; }
        var prevR = s.r;
        s.r -= s.speed * state.slowMult * dt;
        s.spin += dt * (s.kind === 'gold' ? 7 : 3);
        if (s.kind === 'weaver') {
          s.angle = wrap(s.baseAngle + Math.sin((state.time - s.born) * 2.4 + s.spin * 0.15) * 0.38);
        }

        if (s.kind === 'splitter' && !s.didSplit && s.r <= 0.74) {
          s.didSplit = true;
          state.shards.splice(i, 1);
          spawnAt(s.angle - 0.17, 'fragment', s.r, s.speed * 1.12, 55);
          spawnAt(s.angle + 0.17, 'fragment', s.r, s.speed * 1.12, 55);
          emit('split', { angle: s.angle });
          continue;
        }

        if (prevR > SHIELD_R && s.r <= SHIELD_R) {
          var diff = Math.abs(angleDiff(s.angle, state.shieldAngle));
          if (diff <= state.shieldHalf + s.size * 0.6) {
            blockShard(s, diff <= PERFECT_ARC * state.perfectArcMult);
            state.shards.splice(i, 1);
            continue;
          }
        }

        if (s.r <= CORE_R) {
          state.shards.splice(i, 1);
          missShard(s);
          if (state.phase !== 'playing') return getState();
        }
      }
      return getState();
    }

    function autoStep() {
      if (state.phase === 'upgrade') {
        applyUpgrade(0);
        return true;
      }
      if (state.phase !== 'playing') return false;
      var target = null;
      var soonest = 999;
      for (var i = 0; i < state.shards.length; i++) {
        var s = state.shards[i];
        if (s.r <= SHIELD_R + 0.001) continue;
        var eta = (s.r - SHIELD_R) / s.speed;
        if (eta < soonest) { soonest = eta; target = s; }
      }
      if (target) setShieldAngle(target.angle);
      if (state.pulseCharge >= 1 && state.shards.length >= 2) pulse();
      return true;
    }

    function getState() {
      return {
        phase: state.phase,
        time: state.time,
        duration: state.duration,
        hp: state.hp,
        maxHp: state.maxHp,
        score: state.score,
        combo: state.combo,
        bestCombo: state.bestCombo,
        blocks: state.blocks,
        perfectBlocks: state.perfectBlocks,
        misses: state.misses,
        pulseUses: state.pulseUses,
        reflects: state.reflectHits,
        upgrades: state.upgrades,
        upgradeChoices: state.upgradeChoices,
        shieldAngle: state.shieldAngle,
        shieldHalf: state.shieldHalf,
        pulseCharge: state.pulseCharge,
        pulseTimer: state.pulseTimer,
        prism: state.prism,
        slowMult: state.slowMult,
        shards: state.shards,
        result: state.result,
        events: state.events
      };
    }

    return {
      state: state,
      start: start,
      reset: reset,
      update: update,
      setShieldAngle: setShieldAngle,
      turnShield: turnShield,
      pulse: pulse,
      applyUpgrade: applyUpgrade,
      autoStep: autoStep,
      getState: getState
    };
  }

  root.OrbitWardEngine = {
    createGame: createGame,
    DURATION: DURATION,
    START_HP: START_HP,
    SHIELD_HALF: SHIELD_HALF,
    UPGRADES: UPGRADES
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
