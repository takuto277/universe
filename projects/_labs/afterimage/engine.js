/* engine.js : AFTERIMAGE のコアロジック（UI非依存・描画非依存）
 *
 * 上へ登るほど、自分のジャンプの頂点が「残像の足場」として固まる。
 * 過去の自分の軌跡を踏み台にして、60秒で500mを目指す。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AfterimageEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 960;
  var H = 640;
  var GOAL_Y = 5000;
  var GOAL_M = 500;
  var TOTAL_TIME = 60;
  var MOVE_SPEED = 292;
  var JUMP_V = 735;
  var GRAVITY = 1900;
  var MAX_FALL = -1250;
  var PLAYER_R = 13;
  var TRAIL_W = 44;
  var TRAIL_LIFE = 3.4;
  var APEX_DELAY = 0.2;
  var MAX_LIVES = 3;
  var COYOTE = 0.09;
  var JUMP_BUFFER = 0.13;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generateTower(seed) {
    var rng = mulberry32((seed ^ 0xA5A5A5A5) >>> 0);
    var platforms = [];
    var id = 1;
    platforms.push({ id: 0, x: 0, y: 0, w: W, kind: 'static', beacon: false, beaconId: -1, checked: false });
    var y = 132 + Math.floor(rng() * 26);
    var lastCenter = W * 0.5;
    var count = 0;
    while (y < GOAL_Y + 900) {
      var challenge = (count % 5) === 4;
      var width = Math.round((challenge ? 78 : 104) + rng() * 68);
      if (width > W - 40) width = W - 40;
      var shift = (rng() * 2 - 1) * (challenge ? 200 : 170);
      var center = clamp(lastCenter + shift, 72, W - 72);
      var x = clamp(center - width / 2, 22, W - 22 - width);
      platforms.push({ id: id++, x: x, y: y, w: width, kind: 'static', beacon: false, beaconId: -1, checked: false });
      lastCenter = x + width / 2;
      y += Math.round(challenge ? 208 + rng() * 30 : 128 + rng() * 44);
      count++;
    }

    var beaconYs = [1000, 2000, 3000, 4000];
    for (var b = 0; b < beaconYs.length; b++) {
      var best = null;
      var bestD = 1e9;
      for (var i = 1; i < platforms.length; i++) {
        var d = Math.abs(platforms[i].y - beaconYs[b]);
        if (d < bestD) { bestD = d; best = platforms[i]; }
      }
      if (best) {
        best.y = beaconYs[b];
        best.w = Math.max(best.w, 168);
        best.x = clamp(best.x - (best.w - 120) / 2, 22, W - 22 - best.w);
        best.beacon = true;
        best.beaconId = b;
      }
    }

    platforms.push({
      id: id++, x: W / 2 - 130, y: GOAL_Y, w: 260,
      kind: 'goal', beacon: true, beaconId: 99, checked: false
    });
    platforms.sort(function (a, b) { return a.y - b.y; });
    return platforms;
  }

  function createGame(options) {
    options = options || {};
    var initialSeed = (options.seed != null ? options.seed : 20261111) >>> 0;
    var rng = mulberry32(initialSeed);
    var nextId = 0;
    var state = {
      seed: initialSeed,
      phase: 'start',
      timeLeft: TOTAL_TIME,
      worldTime: 0,
      cameraY: 0,
      maxY: 0,
      heightM: 0,
      lives: MAX_LIVES,
      checkpoints: 0,
      score: 0,
      moveX: 0,
      jumpHeld: false,
      jumpBuffer: 0,
      coyote: 0,
      respawn: { x: W * 0.5, y: 0 },
      player: { x: W * 0.5, y: 0, vx: 0, vy: 0, onGround: true, groundId: 0, invuln: 0, fromTrail: false },
      platforms: [],
      pendingTrails: [],
      jump: null,
      jumpArc: [],
      flash: 0,
      shake: 0,
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
      if (state.events.length > 240) state.events.splice(0, state.events.length - 240);
    }

    function makeTrail(x, y, life) {
      var tp = {
        id: 10000 + (nextId++),
        x: x - TRAIL_W / 2,
        y: y,
        w: TRAIL_W,
        kind: 'trail',
        beacon: false,
        beaconId: -1,
        checked: false,
        life: life == null ? TRAIL_LIFE : life,
        maxLife: life == null ? TRAIL_LIFE : life
      };
      state.platforms.push(tp);
      var trails = 0;
      for (var i = 0; i < state.platforms.length; i++) if (state.platforms[i].kind === 'trail') trails++;
      if (trails > 34) {
        for (var j = 0; j < state.platforms.length; j++) {
          if (state.platforms[j].kind === 'trail') {
            state.platforms.splice(j, 1);
            break;
          }
        }
      }
      emit('solidify', { x: x, y: y });
      return tp;
    }

    function start() {
      var tower = generateTower(initialSeed);
      nextId = 0;
      state.platforms = tower;
      state.phase = 'playing';
      state.timeLeft = TOTAL_TIME;
      state.worldTime = 0;
      state.cameraY = 0;
      state.maxY = 0;
      state.heightM = 0;
      state.lives = MAX_LIVES;
      state.checkpoints = 0;
      state.score = 0;
      state.moveX = 0;
      state.jumpHeld = false;
      state.jumpBuffer = 0;
      state.coyote = 0;
      state.respawn = { x: W * 0.5, y: 0 };
      state.player = { x: W * 0.5, y: 0, vx: 0, vy: 0, onGround: true, groundId: 0, invuln: 0.7, fromTrail: false };
      state.pendingTrails = [];
      state.jump = null;
      state.jumpArc = [];
      state.flash = 0;
      state.shake = 0;
      state.result = null;
      state.events = [];
      emit('start');
      return true;
    }

    function restart(seed) {
      if (seed != null) {
        initialSeed = seed >>> 0;
        state.seed = initialSeed;
        rng = mulberry32(initialSeed);
      }
      return start();
    }

    function backToStart() {
      state.phase = 'start';
      state.result = null;
      state.events = [];
      state.pendingTrails = [];
      state.jump = null;
      state.jumpArc = [];
      return true;
    }

    function setMove(x) {
      if (!isFinite(x)) x = 0;
      state.moveX = clamp(x, -1, 1);
    }

    function pressJump() {
      state.jumpHeld = true;
      state.jumpBuffer = JUMP_BUFFER;
    }

    function releaseJump() {
      state.jumpHeld = false;
      var p = state.player;
      if (p.vy > 260) p.vy *= 0.52;
    }

    function currentGround() {
      var p = state.player;
      for (var i = 0; i < state.platforms.length; i++) {
        var pl = state.platforms[i];
        if (pl.id !== p.groundId) continue;
        if (pl.kind === 'trail' && pl.life <= 0) return null;
        if (p.x + PLAYER_R > pl.x && p.x - PLAYER_R < pl.x + pl.w) return pl;
      }
      return null;
    }

    function doJump() {
      var p = state.player;
      var fromTrail = p.fromTrail;
      p.vy = JUMP_V * (fromTrail ? 1.07 : 1);
      p.onGround = false;
      p.groundId = -1;
      p.fromTrail = false;
      state.coyote = 0;
      state.jumpBuffer = 0;
      state.jump = { points: [], apexSpawned: false, fromTrail: fromTrail };
      state.jumpArc = [];
      state.shake = Math.max(state.shake, 2.2);
      emit('jump', { fromTrail: fromTrail });
    }

    function landOn(pl) {
      var p = state.player;
      p.y = pl.y;
      p.vy = 0;
      p.onGround = true;
      p.groundId = pl.id;
      p.fromTrail = pl.kind === 'trail';
      state.coyote = COYOTE;
      state.jump = null;
      state.shake = Math.max(state.shake, 2.8);
      emit('land', { kind: pl.kind });
      if (pl.beacon && !pl.checked) {
        pl.checked = true;
        state.checkpoints += 1;
        state.score += 100;
        state.respawn = { x: p.x, y: pl.y };
        state.flash = 0.8;
        emit('checkpoint', { beacon: pl.beaconId, y: pl.y });
        if (pl.kind === 'goal') finish('victory');
      } else if (pl.kind === 'goal') {
        finish('victory');
      }
    }

    function loseLife(reason) {
      state.lives -= 1;
      state.shake = 18;
      emit('fall', { reason: reason, lives: state.lives });
      if (state.lives <= 0) {
        finish('fall');
        return;
      }
      var r = state.respawn;
      state.player = {
        x: r.x, y: r.y + 2, vx: 0, vy: 0,
        onGround: false, groundId: -1, invuln: 1.1, fromTrail: false
      };
      state.pendingTrails = [];
      state.jump = null;
      state.jumpArc = [];
      state.platforms = state.platforms.filter(function (pl) {
        if (pl.kind === 'trail') return false;
        if (pl.kind === 'static' || pl.kind === 'goal') return true;
        return !pl.checked;
      });
      state.cameraY = Math.max(0, r.y - 230);
      state.flash = 0.7;
      emit('respawn');
    }

    function finish(reason) {
      if (state.phase === 'over' || state.phase === 'victory') return;
      state.heightM = Math.max(0, Math.floor(state.maxY / 10));
      state.score += state.heightM * 10;
      if (reason === 'victory') {
        state.score += Math.floor(state.timeLeft * 20);
        state.phase = 'victory';
      } else {
        state.phase = 'over';
      }
      var rank;
      if (state.phase === 'victory') {
        rank = state.timeLeft >= 12 ? 'S' : (state.timeLeft >= 4 ? 'A' : 'B');
      } else {
        rank = state.heightM >= 400 ? 'A' : (state.heightM >= 250 ? 'B' : (state.heightM >= 120 ? 'C' : 'D'));
      }
      state.result = {
        score: state.score,
        heightM: state.heightM,
        maxY: state.maxY,
        checkpoints: state.checkpoints,
        timeLeft: Math.max(0, state.timeLeft),
        lives: state.lives,
        reason: reason,
        rank: rank
      };
      emit('finish', { reason: reason });
    }

    function updatePlayer(dt) {
      var p = state.player;
      p.invuln = Math.max(0, p.invuln - dt);
      state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
      state.coyote = Math.max(0, state.coyote - dt);

      if (p.onGround) {
        var ground = currentGround();
        if (!ground) {
          p.onGround = false;
          p.groundId = -1;
          state.coyote = COYOTE;
        }
      }

      if (p.onGround && state.jumpBuffer > 0) {
        doJump();
      }

      if (!p.onGround) {
        p.vx = state.moveX * MOVE_SPEED;
      } else {
        p.vx = state.moveX * MOVE_SPEED;
      }
      p.x += p.vx * dt;
      if (p.x < PLAYER_R) { p.x = PLAYER_R; }
      if (p.x > W - PLAYER_R) { p.x = W - PLAYER_R; }

      var prevY = p.y;
      var prevVy = p.vy;
      p.vy -= GRAVITY * dt;
      if (p.vy < MAX_FALL) p.vy = MAX_FALL;
      p.y += p.vy * dt;

      if (!p.onGround && p.vy <= 0) {
        var best = null;
        for (var i = 0; i < state.platforms.length; i++) {
          var pl = state.platforms[i];
          if (pl.kind === 'trail' && pl.life <= 0) continue;
          if (p.x + PLAYER_R <= pl.x || p.x - PLAYER_R >= pl.x + pl.w) continue;
          if (prevY >= pl.y - 0.5 && p.y <= pl.y && (!best || pl.y > best.y)) best = pl;
        }
        if (best) landOn(best);
      }

      if (!p.onGround && state.jump) {
        if (state.jump.points.length === 0 || state.worldTime - state.jump.points[state.jump.points.length - 1].t > 0.035) {
          state.jump.points.push({ x: p.x, y: p.y, t: state.worldTime });
          if (state.jump.points.length > 90) state.jump.points.shift();
        }
        state.jumpArc = state.jump.points.slice(-42);
        if (!state.jump.apexSpawned && prevVy > 0 && p.vy <= 0) {
          state.jump.apexSpawned = true;
          state.pendingTrails.push({
            x: p.x,
            y: p.y,
            at: state.worldTime + APEX_DELAY,
            life: TRAIL_LIFE
          });
          emit('apex', { x: p.x, y: p.y });
        }
      }

      if (p.y > state.maxY) {
        state.maxY = p.y;
        state.heightM = Math.floor(state.maxY / 10);
      }

      if (p.y >= GOAL_Y) finish('victory');
    }

    function updateTrails(dt) {
      var i;
      for (i = 0; i < state.platforms.length; i++) {
        var pl = state.platforms[i];
        if (pl.kind === 'trail' && pl.life > 0) {
          pl.life -= dt;
          if (pl.life <= 0) {
            emit('shatter', { x: pl.x + pl.w / 2, y: pl.y });
          }
        }
      }
      for (i = state.pendingTrails.length - 1; i >= 0; i--) {
        var pt = state.pendingTrails[i];
        if (state.worldTime >= pt.at) {
          makeTrail(pt.x, pt.y, pt.life);
          state.pendingTrails.splice(i, 1);
        }
      }
      if (state.platforms.length > 120) {
        var kept = [];
        for (i = 0; i < state.platforms.length; i++) {
          if (state.platforms[i].kind !== 'trail' || state.platforms[i].life > 0) kept.push(state.platforms[i]);
        }
        state.platforms = kept;
      }
    }

    function updateCamera(dt) {
      var p = state.player;
      var target = Math.max(0, p.y - 230);
      if (target > state.cameraY) {
        state.cameraY += (target - state.cameraY) * Math.min(1, dt * 8.5);
        if (state.cameraY > target) state.cameraY = target;
      }
      if (p.y < state.cameraY - 70) loseLife('fall');
    }

    function update(dt) {
      if (state.phase !== 'playing') {
        state.flash = Math.max(0, state.flash - (dt || 0) * 2);
        state.shake = Math.max(0, state.shake - (dt || 0) * 40);
        return getState();
      }
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      state.worldTime += dt;
      state.timeLeft -= dt;
      state.flash = Math.max(0, state.flash - dt * 2.2);
      state.shake = Math.max(0, state.shake - dt * 40);
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        finish('time');
        return getState();
      }
      updatePlayer(dt);
      updateTrails(dt);
      updateCamera(dt);
      return getState();
    }

    function findTarget() {
      var p = state.player;
      var best = null;
      var bestScore = 1e9;
      for (var i = 0; i < state.platforms.length; i++) {
        var pl = state.platforms[i];
        if (pl.y <= p.y + 18) continue;
        if (pl.kind === 'trail' && pl.life <= 0) continue;
        var dy = pl.y - p.y;
        var dx = Math.abs(pl.x + pl.w / 2 - p.x);
        if (dy > 320 || dx > 340) continue;
        var score = dy + dx * 0.55;
        if (pl.beacon) score -= 40;
        if (score < bestScore) { bestScore = score; best = pl; }
      }
      return best;
    }

    function autoStep() {
      if (state.phase !== 'playing') return;
      var p = state.player;

      var nearTrail = null;
      var nearD = 1e9;
      var i;
      for (i = 0; i < state.pendingTrails.length; i++) {
        var pt = state.pendingTrails[i];
        var d = Math.abs(pt.x - p.x) + Math.abs(pt.y - p.y) * 0.55;
        if (d < nearD) { nearD = d; nearTrail = pt; }
      }
      for (i = 0; i < state.platforms.length; i++) {
        var tr = state.platforms[i];
        if (tr.kind !== 'trail' || tr.life <= 0) continue;
        var d2 = Math.abs(tr.x + tr.w / 2 - p.x) + Math.abs(tr.y - p.y) * 0.55;
        if (tr.y <= p.y + 10 && tr.y >= p.y - 120 && d2 < nearD) { nearD = d2; nearTrail = tr; }
      }

      var target = findTarget();
      if (!p.onGround && nearTrail) {
        var tx = nearTrail.x - p.x;
        setMove(clamp(tx / 26, -1, 1));
        if (state.jumpBuffer <= 0 && p.vy < -40 && Math.abs(tx) < 26) setMove(0);
        return;
      }

      if (!target) {
        setMove(0);
        return;
      }
      var cx = target.x + target.w / 2;
      var dx = cx - p.x;
      setMove(clamp(dx / 50, -1, 1));

      if (p.onGround && target.y > p.y + 24) {
        if (Math.abs(dx) < 220 || target.y - p.y < 170) pressJump();
      }
    }

    function getState() {
      var platforms = [];
      for (var i = 0; i < state.platforms.length; i++) {
        var pl = state.platforms[i];
        if (pl.kind === 'trail' && pl.life <= 0) continue;
        platforms.push({
          id: pl.id, x: pl.x, y: pl.y, w: pl.w, kind: pl.kind,
          beacon: pl.beacon, beaconId: pl.beaconId, checked: pl.checked,
          life: pl.life == null ? 1 : pl.life,
          maxLife: pl.maxLife == null ? 1 : pl.maxLife
        });
      }
      var pending = [];
      for (var j = 0; j < state.pendingTrails.length; j++) {
        var pt = state.pendingTrails[j];
        pending.push({ x: pt.x, y: pt.y, at: pt.at, life: pt.life });
      }
      var arc = [];
      for (var k = 0; k < state.jumpArc.length; k++) {
        arc.push({ x: state.jumpArc[k].x, y: state.jumpArc[k].y });
      }
      return {
        phase: state.phase,
        seed: state.seed,
        timeLeft: state.timeLeft,
        worldTime: state.worldTime,
        cameraY: state.cameraY,
        maxY: state.maxY,
        heightM: state.heightM,
        goalM: GOAL_M,
        goalY: GOAL_Y,
        lives: state.lives,
        maxLives: MAX_LIVES,
        checkpoints: state.checkpoints,
        score: state.score,
        player: {
          x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy,
          onGround: state.player.onGround, invuln: state.player.invuln,
          fromTrail: state.player.fromTrail, r: PLAYER_R
        },
        respawn: { x: state.respawn.x, y: state.respawn.y },
        platforms: platforms,
        pendingTrails: pending,
        jumpArc: arc,
        flash: state.flash,
        shake: state.shake,
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
      pressJump: pressJump,
      releaseJump: releaseJump,
      autoStep: autoStep,
      getState: getState
    };
  }

  return {
    createGame: createGame,
    W: W,
    H: H,
    GOAL_Y: GOAL_Y,
    GOAL_M: GOAL_M,
    TOTAL_TIME: TOTAL_TIME,
    MAX_LIVES: MAX_LIVES,
    TRAIL_LIFE: TRAIL_LIFE,
    JUMP_V: JUMP_V,
    MOVE_SPEED: MOVE_SPEED,
    GRAVITY: GRAVITY,
    generateTower: generateTower
  };
});
