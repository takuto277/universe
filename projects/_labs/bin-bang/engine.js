/* engine.js : BIN BANG のコアロジック（UI非依存・描画非依存）
 *
 * ネオンの路地で、ゴミ箱キャノンからゴミを撃ち出す60秒シューター。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BinBangEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 360;
  var H = 640;
  var DURATION = 60;
  var PLAYER_Y = 580;
  var PLAYER_R = 19;
  var PLAYER_SPEED = 430;
  var FIRE_INTERVAL = 0.18;
  var BULLET_SPEED = 680;
  var BURST_COOLDOWN = 2.2;
  var LIVES = 3;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function createGame() {
    var rng = 1234567;
    function rand() {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      return rng / 4294967296;
    }

    var state = {
      phase: 'start',
      time: 0,
      score: 0,
      kills: 0,
      combo: 0,
      comboMax: 0,
      comboTimer: 0,
      lives: LIVES,
      invuln: 0,
      player: { x: W / 2, targetX: W / 2, y: PLAYER_Y, r: PLAYER_R },
      bullets: [],
      enemies: [],
      particles: [],
      rings: [],
      popups: [],
      events: [],
      fireTimer: 0,
      burstCooldown: 0,
      spawnTimer: 0.4,
      overdrive: 0,
      overdriveGauge: 0,
      bossSpawned: false,
      shake: 0,
      flash: 0,
      result: null,
      reason: ''
    };

    function emit(type, x, y, extra) {
      var ev = { type: type, x: x, y: y };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      state.events.push(ev);
    }

    function start() {
      rng = 1234567;
      state.phase = 'playing';
      state.time = 0;
      state.score = 0;
      state.kills = 0;
      state.combo = 0;
      state.comboMax = 0;
      state.comboTimer = 0;
      state.lives = LIVES;
      state.invuln = 0;
      state.player = { x: W / 2, targetX: W / 2, y: PLAYER_Y, r: PLAYER_R };
      state.bullets = [];
      state.enemies = [];
      state.particles = [];
      state.rings = [];
      state.popups = [];
      state.events = [];
      state.fireTimer = 0;
      state.burstCooldown = 0;
      state.spawnTimer = 0.5;
      state.overdrive = 0;
      state.overdriveGauge = 0;
      state.bossSpawned = false;
      state.shake = 0;
      state.flash = 0;
      state.result = null;
      state.reason = '';
      return true;
    }

    function reset() {
      state.phase = 'start';
      state.score = 0;
      state.lives = LIVES;
      state.result = null;
      return true;
    }

    function finish(reason) {
      if (state.phase === 'finished') return;
      state.phase = 'finished';
      state.reason = reason;
      state.result = {
        score: state.score,
        kills: state.kills,
        comboMax: state.comboMax,
        lives: Math.max(0, state.lives),
        time: Math.min(DURATION, state.time),
        reason: reason
      };
      emit('finish', W / 2, H / 2, { reason: reason });
    }

    function addParticles(x, y, hue, count, power) {
      for (var i = 0; i < count; i++) {
        var a = rand() * Math.PI * 2;
        var s = (0.2 + rand() * 0.8) * (power || 180);
        state.particles.push({
          x: x, y: y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.35 + rand() * 0.55,
          max: 0.9,
          size: 1.5 + rand() * 3.5,
          hue: hue + (rand() * 30 - 15)
        });
      }
      if (state.particles.length > 320) state.particles.splice(0, state.particles.length - 320);
    }

    function addRing(x, y, hue, size) {
      state.rings.push({ x: x, y: y, r: 4, max: size || 60, life: 1, hue: hue });
    }

    function addPopup(x, y, textValue, hue) {
      state.popups.push({ x: x, y: y, text: textValue, hue: hue, life: 0.85, max: 0.85 });
    }

    function damage() {
      if (state.invuln > 0 || state.phase !== 'playing') return;
      state.lives -= 1;
      state.invuln = 1.35;
      state.combo = 0;
      state.comboTimer = 0;
      state.shake = Math.max(state.shake, 12);
      state.flash = Math.max(state.flash, 0.25);
      addRing(state.player.x, state.player.y, 350, 80);
      emit('damage', state.player.x, state.player.y);
      if (state.lives <= 0) finish('lives');
    }

    function burst() {
      if (state.phase !== 'playing' || state.burstCooldown > 0) return false;
      state.burstCooldown = BURST_COOLDOWN;
      var angles = [-0.55, -0.35, -0.18, 0, 0.18, 0.35, 0.55, -0.75, 0.75];
      for (var i = 0; i < angles.length; i++) {
        state.bullets.push({
          x: state.player.x, y: state.player.y - 26,
          vx: Math.sin(angles[i]) * BULLET_SPEED * 0.72,
          vy: -Math.cos(angles[i]) * BULLET_SPEED * 0.72,
          r: 4, damage: 2, hue: 166, life: 1.6
        });
      }
      state.shake = Math.max(state.shake, 8);
      state.flash = Math.max(state.flash, 0.18);
      addParticles(state.player.x, state.player.y - 24, 168, 16, 220);
      addRing(state.player.x, state.player.y - 20, 168, 110);
      emit('bang', state.player.x, state.player.y);
      return true;
    }

    function spawnEnemy() {
      var ramp = clamp(state.time / DURATION, 0, 1);
      var r = rand();
      var type = 'bag';
      if (r > 0.9) type = 'gold';
      else if (r > 0.72) type = 'bottle';
      else if (r > 0.52) type = 'can';
      else if (r > 0.42) type = 'bomb';
      var x = 32 + rand() * (W - 64);
      var e = {
        type: type,
        x: x,
        y: -28,
        vx: 0,
        vy: 0,
        r: 16,
        hp: 1,
        maxHp: 1,
        score: 100,
        hue: 42,
        drift: 0,
        phase: rand() * Math.PI * 2
      };
      if (type === 'bag') { e.vy = 58 + ramp * 24; e.r = 17; e.score = 100; e.hue = 42; }
      else if (type === 'bottle') { e.vy = 96 + ramp * 38; e.r = 10; e.score = 150; e.hue = 186; e.drift = 24 + rand() * 30; }
      else if (type === 'can') { e.vy = 46 + ramp * 18; e.r = 18; e.hp = 3; e.maxHp = 3; e.score = 300; e.hue = 140; }
      else if (type === 'bomb') { e.vy = 70 + ramp * 24; e.r = 14; e.hp = 2; e.maxHp = 2; e.score = 250; e.hue = 354; }
      else if (type === 'gold') { e.vy = 145 + ramp * 45; e.r = 9; e.score = 500; e.hue = 52; e.drift = 10; }
      state.enemies.push(e);
    }

    function spawnBoss() {
      state.bossSpawned = true;
      state.enemies.push({
        type: 'boss', x: W / 2, y: -72, vx: 0, vy: 17, r: 46,
        hp: 38, maxHp: 38, score: 5000, hue: 316, drift: 0, phase: 0, boss: true
      });
      state.shake = Math.max(state.shake, 9);
      state.flash = Math.max(state.flash, 0.2);
      emit('boss', W / 2, 40);
    }

    function killEnemy(e, index) {
      state.enemies.splice(index, 1);
      state.kills += 1;
      state.combo += 1;
      state.comboMax = Math.max(state.comboMax, state.combo);
      state.comboTimer = 2.6;
      var mult = 1 + Math.floor(state.combo / 5) * 0.5;
      if (state.overdrive > 0) mult *= 2;
      var points = Math.floor(e.score * mult);
      state.score += points;
      addPopup(e.x, e.y, '+' + points, e.hue);
      addRing(e.x, e.y, e.hue, e.boss ? 130 : 48);
      state.overdriveGauge = Math.min(100, state.overdriveGauge + (e.boss ? 40 : 7));
      if (state.overdriveGauge >= 100 && state.overdrive <= 0) {
        state.overdrive = 4.2;
        state.overdriveGauge = 0;
        state.shake = Math.max(state.shake, 10);
        emit('overdrive', state.player.x, state.player.y);
      }
      state.shake = Math.max(state.shake, e.boss ? 15 : (e.type === 'bomb' ? 8 : 4));
      state.flash = Math.max(state.flash, e.boss ? 0.28 : 0.08);
      addParticles(e.x, e.y, e.hue, e.boss ? 40 : (e.type === 'gold' ? 18 : 10), e.boss ? 300 : 180);
      if (e.type === 'bomb') {
        state.shake = Math.max(state.shake, 9);
        addParticles(e.x, e.y, 20, 22, 260);
      }
      emit('explode', e.x, e.y, { boss: !!e.boss, hue: e.hue });
    }

    function updateBullets(dt) {
      for (var i = state.bullets.length - 1; i >= 0; i--) {
        var b = state.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.y < -24 || b.life <= 0 || b.x < -20 || b.x > W + 20) {
          state.bullets.splice(i, 1);
        }
      }
    }

    function updateEnemies(dt) {
      for (var i = state.enemies.length - 1; i >= 0; i--) {
        var e = state.enemies[i];
        e.y += e.vy * dt;
        e.phase += dt * 2.2;
        if (e.drift) e.x += Math.sin(e.phase) * e.drift * dt;
        e.x = clamp(e.x, e.r, W - e.r);
        if (e.y - e.r > H + 10) {
          state.enemies.splice(i, 1);
          damage();
          continue;
        }
        if (e.y + e.r > state.player.y - 12 && Math.abs(e.x - state.player.x) < e.r + 22) {
          state.enemies.splice(i, 1);
          if (e.type === 'boss') {
            state.lives = 0;
            finish('lives');
          } else {
            damage();
          }
          continue;
        }
      }
    }

    function collide() {
      for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
        var b = state.bullets[bi];
        var hit = -1;
        for (var ei = 0; ei < state.enemies.length; ei++) {
          var e = state.enemies[ei];
          var rr = e.r + b.r;
          if (dist2(b.x, b.y, e.x, e.y) <= rr * rr) {
            hit = ei;
            break;
          }
        }
        if (hit < 0) continue;
        var target = state.enemies[hit];
        target.hp -= b.damage;
        state.bullets.splice(bi, 1);
        addParticles(b.x, b.y, b.hue, 4, 100);
        state.shake = Math.max(state.shake, 1.4);
        emit('hit', b.x, b.y);
        if (target.hp <= 0) {
          var scoreTarget = target;
          var idx = hit;
          killEnemy(scoreTarget, idx);
        }
      }
    }

    function updateParticles(dt) {
      for (var i = state.particles.length - 1; i >= 0; i--) {
        var p = state.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 240 * dt;
        p.vx *= 0.99;
        p.life -= dt;
        if (p.life <= 0) state.particles.splice(i, 1);
      }
    }

    function update(t, dt) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      state.time += dt;
      state.invuln = Math.max(0, state.invuln - dt);
      state.comboTimer = Math.max(0, state.comboTimer - dt);
      if (state.comboTimer <= 0) state.combo = 0;
      state.overdrive = Math.max(0, state.overdrive - dt);
      state.shake = Math.max(0, state.shake - dt * 34);
      state.flash = Math.max(0, state.flash - dt * 2.2);
      state.burstCooldown = Math.max(0, state.burstCooldown - dt);

      var p = state.player;
      var speed = PLAYER_SPEED * (state.overdrive > 0 ? 1.15 : 1);
      if (p.x < p.targetX) p.x = Math.min(p.targetX, p.x + speed * dt);
      else if (p.x > p.targetX) p.x = Math.max(p.targetX, p.x - speed * dt);
      p.x = clamp(p.x, 26, W - 26);

      state.fireTimer -= dt;
      if (state.fireTimer <= 0) {
        state.fireTimer = state.overdrive > 0 ? 0.085 : FIRE_INTERVAL;
        state.bullets.push({
          x: p.x, y: p.y - 28, vx: 0, vy: -BULLET_SPEED,
          r: state.overdrive > 0 ? 4.5 : 3, damage: state.overdrive > 0 ? 2 : 1,
          hue: state.overdrive > 0 ? 168 : 48, life: 1.4
        });
        emit('fire', p.x, p.y - 28);
      }

      updateBullets(dt);
      updateEnemies(dt);
      collide();
      updateParticles(dt);
      for (var ri = state.rings.length - 1; ri >= 0; ri--) {
        var ring = state.rings[ri];
        ring.life -= dt * 1.8;
        ring.r += ring.max * dt * 2.4;
        if (ring.life <= 0) state.rings.splice(ri, 1);
      }
      for (var po = state.popups.length - 1; po >= 0; po--) {
        var pop = state.popups[po];
        pop.life -= dt;
        pop.y -= 34 * dt;
        if (pop.life <= 0) state.popups.splice(po, 1);
      }

      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        var ramp = clamp(state.time / DURATION, 0, 1);
        state.spawnTimer = 0.62 - ramp * 0.34;
        spawnEnemy();
      }
      if (!state.bossSpawned && state.time >= 36) spawnBoss();
      if (state.time >= DURATION) finish('time');
      return getState();
    }

    function setTargetX(x) {
      if (state.phase !== 'playing') return;
      state.player.targetX = clamp(x, 26, W - 26);
    }

    function autoStep() {
      if (state.phase !== 'playing') return;
      var target = null;
      var bestY = -999;
      for (var i = 0; i < state.enemies.length; i++) {
        var e = state.enemies[i];
        if (e.y > bestY) { bestY = e.y; target = e; }
      }
      if (target) setTargetX(target.x);
      if (state.burstCooldown <= 0 && (state.enemies.length >= 5 || (target && target.boss))) burst();
    }

    function getState() {
      return {
        phase: state.phase,
        time: state.time,
        timeLeft: Math.max(0, DURATION - state.time),
        duration: DURATION,
        score: state.score,
        kills: state.kills,
        combo: state.combo,
        comboMax: state.comboMax,
        lives: state.lives,
        invuln: state.invuln,
        player: { x: state.player.x, y: state.player.y, r: state.player.r },
        bullets: state.bullets.map(function (b) { return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, hue: b.hue, damage: b.damage }; }),
        enemies: state.enemies.map(function (e) { return { type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, r: e.r, hp: e.hp, maxHp: e.maxHp, hue: e.hue, boss: !!e.boss }; }),
        particles: state.particles.map(function (p) { return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, life: p.life, max: p.max, size: p.size, hue: p.hue }; }),
        rings: state.rings.map(function (r) { return { x: r.x, y: r.y, r: r.r, max: r.max, life: r.life, hue: r.hue }; }),
        popups: state.popups.map(function (p) { return { x: p.x, y: p.y, text: p.text, hue: p.hue, life: p.life, max: p.max }; }),
        burstCooldown: state.burstCooldown,
        overdrive: state.overdrive,
        overdriveGauge: state.overdriveGauge,
        shake: state.shake,
        flash: state.flash,
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
      setTargetX: setTargetX,
      burst: burst,
      autoStep: autoStep,
      getState: getState
    };
  }

  return {
    createGame: createGame,
    W: W,
    H: H,
    DURATION: DURATION,
    PLAYER_Y: PLAYER_Y,
    LIVES: LIVES,
    FIRE_INTERVAL: FIRE_INTERVAL,
    BURST_COOLDOWN: BURST_COOLDOWN
  };
});
