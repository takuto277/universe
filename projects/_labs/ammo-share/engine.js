/* engine.js : AMMO SHARE（撃った弾が敵の弾になって返るシューター） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AmmoShareEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 480;
  var H = 800;
  var PLAYER_Y = 712;
  var PLAYER_R = 13;
  var PLAYER_SPEED = 320;
  var FIRE_INTERVAL = 0.15;
  var BULLET_SPEED = 900;
  var BULLET_R = 3.5;
  var DURATION = 60;
  var RETURN_DELAY = 1.5;
  var RETURN_SPEED = 300;
  var THREAT_R = 6;
  var PURGE_START = 2;
  var PURGE_MAX = 3;
  var MAX_DEBT = 80;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 200;

  var TYPES = {
    drone: { hp: 1, r: 13, vy: 84, score: 10, color: '#ff7bc8', shape: 'tri' },
    weaver: { hp: 1, r: 12, vy: 72, score: 15, color: '#b48cff', shape: 'diamond', weave: 58, freq: 2.1 },
    tank: { hp: 3, r: 18, vy: 52, score: 30, color: '#ff9f43', shape: 'square' },
    gold: { hp: 1, r: 10, vy: 150, score: 60, color: '#ffd166', shape: 'star' }
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
  function dist2(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return dx * dx + dy * dy;
  }

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
    var ev = { type: type, t: state.time };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      }
    }
    state.events.push(ev);
    if (state.events.length > MAX_EVENTS) state.events.shift();
  }

  function createGame(opts) {
    opts = opts || {};
    return {
      rng: opts.rng || Math.random,
      phase: 'idle',
      time: 0,
      duration: DURATION,
      score: 0,
      kills: 0,
      shots: 0,
      hits: 0,
      cleans: 0,
      breaches: 0,
      move: 0,
      firing: false,
      cooldown: 0,
      spawnTimer: 0.9,
      purgeCharges: PURGE_START,
      player: { x: W / 2, y: PLAYER_Y, r: PLAYER_R },
      bullets: [],
      enemies: [],
      threats: [],
      pending: [],
      events: [],
      result: null
    };
  }

  function start(state) {
    if (!state) return false;
    state.phase = 'playing';
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.shots = 0;
    state.hits = 0;
    state.cleans = 0;
    state.breaches = 0;
    state.move = 0;
    state.firing = false;
    state.cooldown = 0;
    state.spawnTimer = 0.9;
    state.purgeCharges = PURGE_START;
    state.player = { x: W / 2, y: PLAYER_Y, r: PLAYER_R };
    state.bullets = [];
    state.enemies = [];
    state.threats = [];
    state.pending = [];
    state.events = [];
    state.result = null;
    emit(state, 'start');
    return true;
  }

  function setMove(state, dir) {
    if (!state || state.phase !== 'playing') return false;
    state.move = sign(dir);
    return true;
  }

  function setFiring(state, on) {
    if (!state || state.phase !== 'playing') return false;
    state.firing = !!on;
    return true;
  }

  function fire(state) {
    if (state.cooldown > 0) return false;
    state.cooldown = FIRE_INTERVAL;
    state.shots++;
    state.bullets.push({
      x: state.player.x,
      y: state.player.y - 18,
      vy: -BULLET_SPEED,
      r: BULLET_R
    });
    return true;
  }

  function scheduleReturn(state, x, delay) {
    if (state.pending.length + state.threats.length >= MAX_DEBT) {
      if (state.pending.length) state.pending.shift();
      else state.threats.shift();
    }
    state.pending.push({ x: clamp(x, 22, W - 22), at: state.time + delay });
  }

  function spawnEnemy(state) {
    var roll = state.rng();
    var type = 'drone';
    if (state.time >= 10 && roll < 0.24) type = 'weaver';
    else if (state.time >= 20 && roll > 0.80) type = 'tank';
    else if (state.time >= 32 && roll > 0.93) type = 'gold';
    var stats = TYPES[type];
    var x = 36 + state.rng() * (W - 72);
    state.enemies.push({
      type: type,
      x: x,
      baseX: x,
      y: -30 - state.rng() * 60,
      vy: stats.vy + Math.min(40, state.time * 0.55),
      r: stats.r,
      hp: stats.hp,
      maxHp: stats.hp,
      score: stats.score,
      color: stats.color,
      shape: stats.shape,
      weave: stats.weave || 0,
      freq: stats.freq || 0,
      phase: state.rng() * Math.PI * 2,
      flash: 0
    });
  }

  function spawnInterval(time) {
    return Math.max(0.4, 1.12 - time * 0.011);
  }

  function finish(state, reason) {
    if (state.phase === 'finished') return;
    state.phase = 'finished';
    var accuracy = state.shots > 0 ? Math.round(state.hits / state.shots * 100) : 0;
    state.result = {
      reason: reason,
      time: state.time,
      score: state.score,
      kills: state.kills,
      shots: state.shots,
      hits: state.hits,
      accuracy: accuracy,
      cleans: state.cleans,
      breaches: state.breaches,
      debt: state.pending.length + state.threats.length,
      rank: rankOf(state.score, reason === 'clear')
    };
    emit(state, 'finish', { reason: reason });
  }

  function rankOf(score, clear) {
    if (clear) {
      if (score >= 1500) return 'S';
      if (score >= 1000) return 'A';
      if (score >= 600) return 'B';
      return 'C';
    }
    if (score >= 500) return 'B';
    if (score >= 220) return 'C';
    return 'D';
  }

  function hurtPlayer(state) {
    finish(state, 'hit');
  }

  // 弾は1フレームで16px以上進むことがあるため、移動前後の線分で当たりを取る。
  function segmentHits(prevY, bullet, target) {
    var top = Math.min(prevY, bullet.y);
    var bottom = Math.max(prevY, bullet.y);
    var closestY = clamp(target.y, top, bottom);
    var rr = target.r + bullet.r;
    return dist2(bullet.x, closestY, target.x, target.y) <= rr * rr;
  }

  function updateBullets(state, dt) {
    for (var i = state.bullets.length - 1; i >= 0; i--) {
      var bullet = state.bullets[i];
      var prevY = bullet.y;
      bullet.y += bullet.vy * dt;

      var consumed = false;
      for (var e = state.enemies.length - 1; e >= 0; e--) {
        var enemy = state.enemies[e];
        if (!segmentHits(prevY, bullet, enemy)) continue;
        state.hits++;
        enemy.hp--;
        enemy.flash = 0.12;
        consumed = true;
        if (enemy.hp <= 0) {
          state.enemies.splice(e, 1);
          state.kills++;
          state.score += enemy.score;
          if (enemy.type === 'gold') {
            state.purgeCharges = Math.min(PURGE_MAX, state.purgeCharges + 1);
          }
          emit(state, 'kill', {
            x: enemy.x,
            y: enemy.y,
            color: enemy.color,
            score: enemy.score
          });
        }
        break;
      }
      if (consumed) {
        state.bullets.splice(i, 1);
        continue;
      }

      for (var t = state.threats.length - 1; t >= 0; t--) {
        var threat = state.threats[t];
        if (!segmentHits(prevY, bullet, threat)) continue;
        state.hits++;
        state.cleans++;
        state.score += 3;
        state.threats.splice(t, 1);
        state.bullets.splice(i, 1);
        emit(state, 'clean', { x: threat.x, y: threat.y });
        consumed = true;
        break;
      }
      if (consumed) continue;

      if (bullet.y < -20) {
        scheduleReturn(state, bullet.x, RETURN_DELAY);
        state.bullets.splice(i, 1);
      }
    }
  }

  function updateEnemies(state, dt) {
    for (var i = state.enemies.length - 1; i >= 0; i--) {
      var enemy = state.enemies[i];
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.y += enemy.vy * dt;
      if (enemy.weave) {
        enemy.x = clamp(enemy.baseX + Math.sin(state.time * enemy.freq + enemy.phase) * enemy.weave, 20, W - 20);
      }
      if (enemy.y > H + 24) {
        state.enemies.splice(i, 1);
        state.breaches++;
        scheduleReturn(state, enemy.x, 0.8);
        emit(state, 'breach', { x: enemy.x });
        continue;
      }
      var pr = enemy.r + state.player.r;
      if (dist2(enemy.x, enemy.y, state.player.x, state.player.y) <= pr * pr) {
        hurtPlayer(state);
        return;
      }
    }
  }

  function updateThreats(state, dt) {
    for (var i = state.threats.length - 1; i >= 0; i--) {
      var threat = state.threats[i];
      threat.y += threat.vy * dt;
      if (threat.y > H + 20) {
        state.threats.splice(i, 1);
        continue;
      }
      var rr = threat.r + state.player.r;
      if (dist2(threat.x, threat.y, state.player.x, state.player.y) <= rr * rr) {
        hurtPlayer(state);
        return;
      }
    }
  }

  function updatePending(state) {
    for (var i = state.pending.length - 1; i >= 0; i--) {
      if (state.pending[i].at > state.time) continue;
      var item = state.pending.splice(i, 1)[0];
      state.threats.push({ x: item.x, y: -16, vy: RETURN_SPEED, r: THREAT_R });
    }
  }

  function update(state, dt) {
    if (!state) return;
    if (state.phase !== 'playing') return;
    dt = clamp(dt, 0, MAX_DT);
    state.time += dt;

    state.cooldown = Math.max(0, state.cooldown - dt);
    state.player.x = clamp(
      state.player.x + state.move * PLAYER_SPEED * dt,
      state.player.r + 8,
      W - state.player.r - 8
    );
    if (state.firing) fire(state);

    state.spawnTimer -= dt;
    while (state.spawnTimer <= 0) {
      spawnEnemy(state);
      state.spawnTimer += spawnInterval(state.time);
    }

    updateBullets(state, dt);
    if (state.phase !== 'playing') return;

    updateEnemies(state, dt);
    if (state.phase !== 'playing') return;

    updatePending(state);
    updateThreats(state, dt);
    if (state.phase !== 'playing') return;

    if (state.time >= DURATION) {
      state.score += 200;
      finish(state, 'clear');
    }
  }

  function purge(state) {
    if (!state || state.phase !== 'playing' || state.purgeCharges <= 0) return false;
    state.purgeCharges--;
    var cleared = state.pending.length + state.threats.length;
    state.pending = [];
    state.threats = [];
    state.score += cleared;
    emit(state, 'purge', { cleared: cleared });
    return true;
  }

  function debtCount(state) {
    return state.pending.length + state.threats.length;
  }

  function nearestDanger(state, maxDy) {
    var best = null;
    var bestDy = maxDy;
    var i;
    for (i = 0; i < state.threats.length; i++) {
      var threat = state.threats[i];
      if (threat.y > state.player.y) continue;
      var dy = state.player.y - threat.y;
      if (dy < bestDy) { bestDy = dy; best = threat; }
    }
    for (i = 0; i < state.enemies.length; i++) {
      var enemy = state.enemies[i];
      if (enemy.y > state.player.y) continue;
      var edy = state.player.y - enemy.y;
      if (edy < bestDy) { bestDy = edy; best = enemy; }
    }
    return best;
  }

  function nearestTarget(state) {
    var best = null;
    var bestY = -Infinity;
    var i;
    for (i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].y > state.player.y - 20) continue;
      if (state.enemies[i].y > bestY) { bestY = state.enemies[i].y; best = state.enemies[i]; }
    }
    for (i = 0; i < state.threats.length; i++) {
      if (state.threats[i].y > state.player.y - 20) continue;
      if (state.threats[i].y > bestY) { bestY = state.threats[i].y; best = state.threats[i]; }
    }
    return best;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') {
      start(state);
      return;
    }
    if (state.phase !== 'playing') return;

    var danger = nearestDanger(state, 130);
    if (danger && Math.abs(danger.x - state.player.x) < danger.r + state.player.r + 12) {
      setMove(state, state.player.x < danger.x ? -1 : 1);
      setFiring(state, false);
    } else {
      var target = nearestTarget(state);
      if (target) {
        var dx = target.x - state.player.x;
        setMove(state, Math.abs(dx) < 6 ? 0 : (dx > 0 ? 1 : -1));
        setFiring(state, Math.abs(dx) < target.r + 6);
      } else {
        setMove(state, state.player.x < W / 2 - 8 ? 1 : (state.player.x > W / 2 + 8 ? -1 : 0));
        setFiring(state, false);
      }
    }
    if (debtCount(state) >= 12 && state.purgeCharges > 0) purge(state);
  }

  function snapshot(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      time: state.time,
      duration: state.duration,
      score: state.score,
      kills: state.kills,
      shots: state.shots,
      hits: state.hits,
      cleans: state.cleans,
      breaches: state.breaches,
      debt: debtCount(state),
      purgeCharges: state.purgeCharges,
      accuracy: state.shots > 0 ? Math.round(state.hits / state.shots * 100) : 0,
      player: { x: state.player.x, y: state.player.y, r: state.player.r },
      enemies: state.enemies.map(function (enemy) {
        return {
          type: enemy.type,
          x: enemy.x,
          y: enemy.y,
          r: enemy.r,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          color: enemy.color,
          shape: enemy.shape,
          flash: enemy.flash
        };
      }),
      bullets: state.bullets.map(function (bullet) {
        return { x: bullet.x, y: bullet.y, r: bullet.r };
      }),
      threats: state.threats.map(function (threat) {
        return { x: threat.x, y: threat.y, r: threat.r };
      }),
      pending: state.pending.map(function (item) {
        return { x: item.x, at: item.at };
      }),
      result: state.result
    };
  }

  return {
    W: W,
    H: H,
    PLAYER_Y: PLAYER_Y,
    PLAYER_R: PLAYER_R,
    PLAYER_SPEED: PLAYER_SPEED,
    FIRE_INTERVAL: FIRE_INTERVAL,
    BULLET_R: BULLET_R,
    DURATION: DURATION,
    RETURN_DELAY: RETURN_DELAY,
    RETURN_SPEED: RETURN_SPEED,
    THREAT_R: THREAT_R,
    PURGE_START: PURGE_START,
    PURGE_MAX: PURGE_MAX,
    createGame: createGame,
    start: start,
    update: update,
    setMove: setMove,
    setFiring: setFiring,
    purge: purge,
    autoStep: autoStep,
    snapshot: snapshot,
    debtCount: debtCount,
    mulberry32: mulberry32
  };
});
