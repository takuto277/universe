/* engine.js : STILL のコアロジック（UI非依存・描画非依存）
 *
 * 見下ろしの小部屋で、時間はプレイヤーの移動量に比例して進む。
 * 止まれば弾も敵も止まる。1発被弾で終了、60秒で3部屋を抜ける。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StillEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 960;
  var H = 640;
  var TOTAL_TIME = 60;
  var PLAYER_R = 13;
  var CORE_R = 6.5;
  var MOVE_SPEED = 215;
  var PLAYER_BULLET_SPEED = 640;
  var PLAYER_COOLDOWN = 0.13;
  var FLOW_RISE = 7.0;
  var FLOW_FALL = 3.2;

  var ROOMS = [
    {
      name: 'ROOM A',
      start: { x: 120, y: 520 },
      exit: { x: 850, y: 110 },
      walls: [
        { x: 0, y: 0, w: 960, h: 18 },
        { x: 0, y: 622, w: 960, h: 18 },
        { x: 0, y: 0, w: 18, h: 640 },
        { x: 942, y: 0, w: 18, h: 640 },
        { x: 210, y: 150, w: 180, h: 26 },
        { x: 570, y: 470, w: 180, h: 26 },
        { x: 430, y: 280, w: 100, h: 80 }
      ],
      enemies: [
        { type: 'turret', x: 800, y: 170 },
        { type: 'turret', x: 760, y: 525 },
        { type: 'spinner', x: 480, y: 210 }
      ]
    },
    {
      name: 'ROOM B',
      start: { x: 100, y: 100 },
      exit: { x: 860, y: 540 },
      walls: [
        { x: 0, y: 0, w: 960, h: 18 },
        { x: 0, y: 622, w: 960, h: 18 },
        { x: 0, y: 0, w: 18, h: 640 },
        { x: 942, y: 0, w: 18, h: 640 },
        { x: 280, y: 180, w: 160, h: 26 },
        { x: 520, y: 390, w: 160, h: 26 },
        { x: 300, y: 470, w: 26, h: 130 },
        { x: 640, y: 160, w: 26, h: 140 },
        { x: 440, y: 280, w: 80, h: 80 }
      ],
      enemies: [
        { type: 'turret', x: 815, y: 110 },
        { type: 'turret', x: 815, y: 510 },
        { type: 'turret', x: 430, y: 130 },
        { type: 'spinner', x: 190, y: 380 }
      ]
    },
    {
      name: 'ROOM C',
      start: { x: 100, y: 550 },
      exit: { x: 870, y: 90 },
      walls: [
        { x: 0, y: 0, w: 960, h: 18 },
        { x: 0, y: 622, w: 960, h: 18 },
        { x: 0, y: 0, w: 18, h: 640 },
        { x: 942, y: 0, w: 18, h: 640 },
        { x: 420, y: 110, w: 120, h: 26 },
        { x: 420, y: 330, w: 120, h: 26 },
        { x: 180, y: 300, w: 220, h: 26 },
        { x: 560, y: 260, w: 220, h: 26 },
        { x: 480, y: 180, w: 26, h: 100 }
      ],
      enemies: [
        { type: 'spinner', x: 300, y: 160 },
        { type: 'spinner', x: 680, y: 470 },
        { type: 'turret', x: 780, y: 330 },
        { type: 'turret', x: 220, y: 470 }
      ]
    }
  ];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function length(x, y) { return Math.sqrt(x * x + y * y); }
  function normalize(x, y) {
    var l = length(x, y);
    if (l < 0.0001) return { x: 0, y: 0, len: 0 };
    return { x: x / l, y: y / l, len: l };
  }
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }
  function circleRectHit(cx, cy, r, rect) {
    var px = clamp(cx, rect.x, rect.x + rect.w);
    var py = clamp(cy, rect.y, rect.y + rect.h);
    var dx = cx - px;
    var dy = cy - py;
    return dx * dx + dy * dy < r * r;
  }
  function resolveCircleRect(p, r, rect) {
    var cx = clamp(p.x, rect.x, rect.x + rect.w);
    var cy = clamp(p.y, rect.y, rect.y + rect.h);
    var dx = p.x - cx;
    var dy = p.y - cy;
    var d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    if (d2 > 0.0001) {
      var d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r;
      p.y = cy + (dy / d) * r;
      return;
    }
    var left = p.x - rect.x;
    var right = rect.x + rect.w - p.x;
    var top = p.y - rect.y;
    var bottom = rect.y + rect.h - p.y;
    var m = Math.min(left, right, top, bottom);
    if (m === left) p.x = rect.x - r;
    else if (m === right) p.x = rect.x + rect.w + r;
    else if (m === top) p.y = rect.y - r;
    else p.y = rect.y + rect.h + r;
  }
  function segmentCircleHit(x1, y1, x2, y2, cx, cy, r) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var fx = x1 - cx;
    var fy = y1 - cy;
    var a = dx * dx + dy * dy;
    if (a < 0.0001) return fx * fx + fy * fy <= r * r;
    var t = -(fx * dx + fy * dy) / a;
    t = clamp(t, 0, 1);
    var px = x1 + dx * t;
    var py = y1 + dy * t;
    var ex = px - cx;
    var ey = py - cy;
    return ex * ex + ey * ey <= r * r;
  }

  function createGame(options) {
    options = options || {};
    var initialSeed = (options.seed != null ? options.seed : 20261111) >>> 0;
    var rng = mulberry32(initialSeed);
    var state = {
      seed: initialSeed,
      phase: 'start',
      room: 0,
      roomName: '',
      roomBanner: 0,
      timeLeft: TOTAL_TIME,
      worldTime: 0,
      flow: 0,
      score: 0,
      kills: 0,
      roomsCleared: 0,
      move: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
      firing: false,
      player: { x: 120, y: 520, aimX: 1, aimY: 0, invuln: 0, fireCooldown: 0 },
      enemies: [],
      bullets: [],
      particles: [],
      walls: [],
      exit: { x: 850, y: 110 },
      exitOpen: false,
      shake: 0,
      flash: 0,
      result: null,
      events: []
    };

    function emit(type, extra) {
      var ev = { type: type };
      if (extra) {
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
        }
      }
      state.events.push(ev);
      if (state.events.length > 260) state.events.splice(0, state.events.length - 260);
    }

    function spawnParticles(x, y, color, count, speed, size) {
      for (var i = 0; i < count; i++) {
        var a = rng() * Math.PI * 2;
        var s = speed * (0.35 + rng() * 0.75);
        state.particles.push({
          x: x,
          y: y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.28 + rng() * 0.5,
          maxLife: 0.78,
          size: size * (0.5 + rng()),
          color: color,
          glow: rng() > 0.45
        });
      }
      if (state.particles.length > 180) state.particles.splice(0, state.particles.length - 180);
    }

    function loadRoom(index) {
      var room = ROOMS[index];
      state.room = index;
      state.roomName = room.name;
      state.walls = room.walls.slice();
      state.exit = { x: room.exit.x, y: room.exit.y };
      state.exitOpen = false;
      state.player = {
        x: room.start.x,
        y: room.start.y,
        aimX: state.aim.x,
        aimY: state.aim.y,
        invuln: 1.1,
        fireCooldown: 0
      };
      state.bullets = [];
      state.particles = [];
      state.flow = 0;
      state.roomBanner = 1.7;
      state.move = { x: 0, y: 0 };
      state.firing = false;
      state.enemies = [];
      for (var i = 0; i < room.enemies.length; i++) {
        var e = room.enemies[i];
        var isSpinner = e.type === 'spinner';
        state.enemies.push({
          id: i,
          type: e.type,
          x: e.x,
          y: e.y,
          r: isSpinner ? 30 : 25,
          hp: 1,
          alive: true,
          angle: rng() * Math.PI * 2,
          spin: (rng() > 0.5 ? 1 : -1) * (0.6 + rng() * 0.35),
          fireTimer: isSpinner ? 1.3 + rng() * 0.8 : 0.9 + rng() * 0.7,
          fireInterval: isSpinner ? 2.75 : 2.15,
          color: isSpinner ? '#ff9f6b' : '#ff5f8f'
        });
      }
      emit('roomStart', { room: index });
    }

    function start() {
      rng = mulberry32(initialSeed);
      state.phase = 'playing';
      state.timeLeft = TOTAL_TIME;
      state.worldTime = 0;
      state.flow = 0;
      state.score = 0;
      state.kills = 0;
      state.roomsCleared = 0;
      state.shake = 0;
      state.flash = 0;
      state.result = null;
      state.events = [];
      state.aim = { x: 1, y: 0 };
      state.move = { x: 0, y: 0 };
      state.firing = false;
      loadRoom(0);
      emit('start');
      return true;
    }

    function restart(seed) {
      if (seed != null) {
        initialSeed = seed >>> 0;
        state.seed = initialSeed;
      }
      return start();
    }

    function backToStart() {
      state.phase = 'start';
      state.result = null;
      state.events = [];
      return true;
    }

    function setMove(x, y) {
      var n = normalize(x, y);
      state.move.x = n.len > 1 ? n.x : (n.len === 0 ? 0 : x);
      state.move.y = n.len > 1 ? n.y : (n.len === 0 ? 0 : y);
      if (n.len > 0 && n.len < 1) {
        state.move.x = n.x * n.len;
        state.move.y = n.y * n.len;
      }
    }

    function setAim(x, y) {
      var n = normalize(x, y);
      if (n.len < 0.0001) return false;
      state.aim.x = n.x;
      state.aim.y = n.y;
      state.player.aimX = n.x;
      state.player.aimY = n.y;
      return true;
    }

    function setFiring(on) {
      state.firing = !!on;
    }

    function spawnBullet(x, y, vx, vy, r, friendly, color) {
      state.bullets.push({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        r: r,
        friendly: !!friendly,
        life: friendly ? 1.65 : 4.2,
        color: color || (friendly ? '#7ef0ff' : '#ff7a9c')
      });
    }

    function enemyFire(enemy) {
      var p = state.player;
      var dx = p.x - enemy.x;
      var dy = p.y - enemy.y;
      var n = normalize(dx, dy);
      if (enemy.type === 'turret') {
        spawnBullet(enemy.x + n.x * 30, enemy.y + n.y * 30, n.x * 212, n.y * 212, 5.5, false, '#ff7a9c');
        emit('enemyShoot');
      } else {
        for (var k = -1; k <= 1; k++) {
          var a = enemy.angle + k * 0.34;
          spawnBullet(enemy.x + Math.cos(a) * 34, enemy.y + Math.sin(a) * 34, Math.cos(a) * 185, Math.sin(a) * 185, 5, false, '#ffb06b');
        }
        emit('enemyShoot');
      }
    }

    function finish(reason) {
      if (state.phase === 'over' || state.phase === 'victory') return;
      state.firing = false;
      state.move.x = 0;
      state.move.y = 0;
      if (reason === 'victory') {
        state.score += Math.floor(state.timeLeft * 20);
        state.phase = 'victory';
      } else {
        state.phase = 'over';
      }
      var rank;
      if (state.phase === 'victory') {
        rank = state.score >= 3600 ? 'S' : (state.score >= 3000 ? 'A' : (state.score >= 2200 ? 'B' : 'C'));
      } else {
        rank = state.score >= 2200 ? 'B' : (state.score >= 1000 ? 'C' : 'D');
      }
      state.result = {
        score: state.score,
        kills: state.kills,
        roomsCleared: state.roomsCleared,
        timeLeft: Math.max(0, state.timeLeft),
        reason: reason,
        rank: rank
      };
      emit('finish', { reason: reason });
    }

    function updatePlayer(dt) {
      var p = state.player;
      var mv = state.move;
      var mx = mv.x;
      var my = mv.y;
      var m = length(mx, my);
      if (m > 1) { mx /= m; my /= m; m = 1; }
      if (m > 0.001) {
        p.x += mx * MOVE_SPEED * dt;
        p.y += my * MOVE_SPEED * dt;
        for (var i = 0; i < state.walls.length; i++) {
          resolveCircleRect(p, PLAYER_R, state.walls[i]);
        }
        p.x = clamp(p.x, PLAYER_R, W - PLAYER_R);
        p.y = clamp(p.y, PLAYER_R, H - PLAYER_R);
      }
      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);

      p.fireCooldown -= dt;
      if (state.firing && p.fireCooldown <= 0) {
        p.fireCooldown = PLAYER_COOLDOWN;
        var ax = state.aim.x;
        var ay = state.aim.y;
        spawnBullet(p.x + ax * 18, p.y + ay * 18, ax * PLAYER_BULLET_SPEED, ay * PLAYER_BULLET_SPEED, 4.2, true, '#7ef0ff');
        state.shake = Math.max(state.shake, 1.2);
        emit('shoot');
      }
    }

    function updateEnemies(worldDt) {
      var p = state.player;
      for (var i = 0; i < state.enemies.length; i++) {
        var e = state.enemies[i];
        if (!e.alive) continue;
        if (e.type === 'spinner') e.angle += e.spin * worldDt;
        e.fireTimer -= worldDt;
        if (e.fireTimer <= 0) {
          e.fireTimer = e.fireInterval;
          enemyFire(e);
        }
      }
    }

    function updateBullets(worldDt) {
      var p = state.player;
      var next = [];
      for (var i = 0; i < state.bullets.length; i++) {
        var b = state.bullets[i];
        var ox = b.x;
        var oy = b.y;
        b.x += b.vx * worldDt;
        b.y += b.vy * worldDt;
        b.life -= worldDt;
        var dead = b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20;
        if (!dead) {
          for (var w = 0; w < state.walls.length; w++) {
            if (pointInRect(b.x, b.y, state.walls[w])) { dead = true; break; }
          }
        }
        if (!dead && b.friendly) {
          for (var e = 0; e < state.enemies.length; e++) {
            var en = state.enemies[e];
            if (!en.alive) continue;
            if (segmentCircleHit(ox, oy, b.x, b.y, en.x, en.y, en.r + b.r)) {
              en.alive = false;
              dead = true;
              state.kills += 1;
              state.score += 120;
              state.shake = 8;
              spawnParticles(en.x, en.y, en.color, 18, 260, 3.2);
              emit('kill');
              break;
            }
          }
        } else if (!dead && !b.friendly && p.invuln <= 0) {
          if (segmentCircleHit(ox, oy, b.x, b.y, p.x, p.y, CORE_R + b.r)) {
            dead = true;
            spawnParticles(p.x, p.y, '#7ef0ff', 26, 320, 3.6);
            state.shake = 16;
            emit('playerHit');
            finish('hit');
            break;
          }
        }
        if (!dead) next.push(b);
      }
      state.bullets = next;
    }

    function updateRoomClear() {
      var alive = 0;
      for (var i = 0; i < state.enemies.length; i++) if (state.enemies[i].alive) alive++;
      if (alive > 0) {
        state.exitOpen = false;
        return;
      }
      if (!state.exitOpen) {
        state.exitOpen = true;
        state.score += 250;
        spawnParticles(state.exit.x, state.exit.y, '#7ef0ff', 22, 180, 3);
        emit('exitOpen');
      }
      var p = state.player;
      var d = length(p.x - state.exit.x, p.y - state.exit.y);
      if (d < 34) {
        state.roomsCleared += 1;
        state.score += 500;
        if (state.room >= ROOMS.length - 1) {
          spawnParticles(p.x, p.y, '#b9ffdd', 40, 340, 4);
          finish('victory');
        } else {
          state.phase = 'roomclear';
          state.roomBanner = 0;
          state.flash = 0.9;
          state.roomsClearedTimer = 1.0;
          emit('roomClear');
        }
      }
    }

    function updateParticles(dt) {
      var next = [];
      for (var i = 0; i < state.particles.length; i++) {
        var p = state.particles[i];
        p.life -= dt;
        if (p.life <= 0) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        next.push(p);
      }
      state.particles = next;
    }

    function update(dt) {
      if (state.phase === 'start' || state.phase === 'over' || state.phase === 'victory') {
        updateParticles(dt || 0);
        return getState();
      }
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      state.worldTime += dt;
      state.roomBanner = Math.max(0, state.roomBanner - dt);
      state.flash = Math.max(0, state.flash - dt * 2.2);
      state.shake = Math.max(0, state.shake - dt * 34);

      if (state.phase === 'roomclear') {
        state.roomsClearedTimer -= dt;
        updateParticles(dt);
        if (state.roomsClearedTimer <= 0) {
          state.phase = 'playing';
          loadRoom(state.room + 1);
        }
        return getState();
      }

      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        finish('time');
        return getState();
      }

      var mv = state.move;
      var moveMag = Math.min(1, length(mv.x, mv.y));
      var targetFlow = moveMag > 0.12 ? 1 : 0;
      var rate = targetFlow > state.flow ? FLOW_RISE : FLOW_FALL;
      state.flow += (targetFlow - state.flow) * Math.min(1, rate * dt);
      if (state.flow < 0.0005) state.flow = 0;

      var worldDt = dt * state.flow;
      updatePlayer(dt);
      updateEnemies(worldDt);
      updateBullets(worldDt);
      updateRoomClear();
      updateParticles(dt);
      return getState();
    }

    function blockedAt(x, y) {
      for (var i = 0; i < state.walls.length; i++) {
        if (circleRectHit(x, y, PLAYER_R, state.walls[i])) return true;
      }
      return x < PLAYER_R || x > W - PLAYER_R || y < PLAYER_R || y > H - PLAYER_R;
    }

    function autoStep() {
      if (state.phase !== 'playing') return;
      var p = state.player;
      var alive = [];
      for (var i = 0; i < state.enemies.length; i++) if (state.enemies[i].alive) alive.push(state.enemies[i]);

      var target;
      if (alive.length) {
        target = alive[0];
        var best = 1e9;
        for (var j = 0; j < alive.length; j++) {
          var d = length(alive[j].x - p.x, alive[j].y - p.y);
          if (d < best) { best = d; target = alive[j]; }
        }
      } else {
        target = state.exit;
      }

      var tx = target.x - p.x;
      var ty = target.y - p.y;
      var tl = Math.max(1, length(tx, ty));
      var mx = 0;
      var my = 0;

      if (alive.length) {
        if (tl > 285) {
          mx = tx / tl;
          my = ty / tl;
        } else if (tl < 155) {
          mx = -tx / tl;
          my = -ty / tl;
        } else {
          var sign = Math.sin(state.worldTime * 0.9) >= 0 ? 1 : -1;
          mx = (-ty / tl) * sign;
          my = (tx / tl) * sign;
        }
      } else {
        mx = tx / tl;
        my = ty / tl;
      }

      for (var b = 0; b < state.bullets.length; b++) {
        var bullet = state.bullets[b];
        if (bullet.friendly) continue;
        var dx = p.x - bullet.x;
        var dy = p.y - bullet.y;
        var dist = Math.max(1, length(dx, dy));
        if (dist < 145) {
          var weight = (1 - dist / 145) * 2.6;
          mx += (dx / dist) * weight;
          my += (dy / dist) * weight;
          var vn = normalize(bullet.vx, bullet.vy);
          var side = (dx * -vn.y + dy * vn.x) >= 0 ? 1 : -1;
          mx += (-vn.y) * side * weight * 0.55;
          my += (vn.x) * side * weight * 0.55;
        }
      }

      var n = normalize(mx, my);
      if (n.len > 0.001) {
        var nx = n.x;
        var ny = n.y;
        if (blockedAt(p.x + nx * 18, p.y + ny * 18)) {
          var alt = normalize(nx + ny, ny - nx);
          var alt2 = normalize(nx - ny, ny + nx);
          if (!blockedAt(p.x + alt.x * 18, p.y + alt.y * 18)) {
            nx = alt.x; ny = alt.y;
          } else if (!blockedAt(p.x + alt2.x * 18, p.y + alt2.y * 18)) {
            nx = alt2.x; ny = alt2.y;
          } else {
            nx = -nx; ny = -ny;
          }
        }
        setMove(nx, ny);
      } else {
        setMove(0, 0);
      }

      if (alive.length) {
        setAim(target.x - p.x, target.y - p.y);
        setFiring(true);
      } else {
        setAim(tx, ty);
        setFiring(false);
      }
    }

    function getState() {
      var enemies = [];
      for (var i = 0; i < state.enemies.length; i++) {
        var e = state.enemies[i];
        enemies.push({
          id: e.id, type: e.type, x: e.x, y: e.y, r: e.r,
          alive: e.alive, angle: e.angle, color: e.color
        });
      }
      var bullets = [];
      for (var b = 0; b < state.bullets.length; b++) {
        var bb = state.bullets[b];
        bullets.push({ x: bb.x, y: bb.y, r: bb.r, vx: bb.vx, vy: bb.vy, friendly: bb.friendly, color: bb.color });
      }
      var particles = [];
      for (var pp = 0; pp < state.particles.length; pp++) {
        var pt = state.particles[pp];
        particles.push({
          x: pt.x, y: pt.y, life: pt.life, maxLife: pt.maxLife,
          size: pt.size, color: pt.color, glow: pt.glow
        });
      }
      return {
        phase: state.phase,
        seed: state.seed,
        room: state.room,
        roomNumber: state.room + 1,
        roomCount: ROOMS.length,
        roomName: state.roomName,
        roomBanner: state.roomBanner,
        timeLeft: state.timeLeft,
        worldTime: state.worldTime,
        flow: state.flow,
        score: state.score,
        kills: state.kills,
        roomsCleared: state.roomsCleared,
        player: {
          x: state.player.x, y: state.player.y, r: PLAYER_R,
          aimX: state.aim.x, aimY: state.aim.y,
          invuln: state.player.invuln,
          core: CORE_R
        },
        enemies: enemies,
        bullets: bullets,
        particles: particles,
        walls: state.walls.slice(),
        exit: { x: state.exit.x, y: state.exit.y, open: state.exitOpen },
        shake: state.shake,
        flash: state.flash,
        result: state.result,
        events: state.events.slice()
      };
    }

    return {
      state: state,
      start: start,
      restart: restart,
      backToStart: backToStart,
      update: update,
      setMove: setMove,
      setAim: setAim,
      setFiring: setFiring,
      autoStep: autoStep,
      getState: getState
    };
  }

  return {
    createGame: createGame,
    W: W,
    H: H,
    TOTAL_TIME: TOTAL_TIME,
    ROOMS: ROOMS
  };
});
