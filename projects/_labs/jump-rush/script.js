(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;

  var C = {
    VIEW_W: 480,
    VIEW_H: 800,
    GROUND_Y: 700,
    PLAYER_W: 30,
    PLAYER_H: 44,
    RUN_SPEED: 168,
    GRAVITY: 2100,
    HOLD_GRAVITY: 0.68,
    JUMP_V: -660,
    MAX_FALL: 950,
    CUT_JUMP: 0.45,
    COYOTE: 0.1,
    BUFFER: 0.14,
    START_X: 90,
    FLAG_X: 5160,
    CASTLE_X: 5310,
    LEVEL_END: 5520,
    LIVES: 3,
    BEST_KEY: 'jump-rush-best'
  };

  var GROUND = [
    [0, 850],
    [930, 1580],
    [1660, 2380],
    [2460, 3260],
    [3340, 4020],
    [4100, 4850],
    [4930, 5520]
  ];

  var BLOCKS = [
    { x: 380, y: 548, w: 54, h: 34, type: 'break' },
    { x: 438, y: 548, w: 54, h: 34, type: 'break' },
    { x: 496, y: 548, w: 54, h: 34, type: 'break' },
    { x: 250, y: 610, w: 90, h: 26, type: 'solid' },
    { x: 1030, y: 548, w: 54, h: 34, type: 'break' },
    { x: 1088, y: 548, w: 54, h: 34, type: 'break' },
    { x: 1360, y: 548, w: 54, h: 34, type: 'break' },
    { x: 1418, y: 548, w: 54, h: 34, type: 'break' },
    { x: 1840, y: 548, w: 54, h: 34, type: 'break' },
    { x: 1898, y: 548, w: 54, h: 34, type: 'break' },
    { x: 2500, y: 548, w: 54, h: 34, type: 'break' },
    { x: 2558, y: 548, w: 54, h: 34, type: 'break' },
    { x: 2800, y: 548, w: 54, h: 34, type: 'break' },
    { x: 2858, y: 548, w: 54, h: 34, type: 'break' },
    { x: 3080, y: 610, w: 90, h: 26, type: 'solid' },
    { x: 3580, y: 548, w: 54, h: 34, type: 'break' },
    { x: 3638, y: 548, w: 54, h: 34, type: 'break' },
    { x: 4400, y: 548, w: 54, h: 34, type: 'break' },
    { x: 4458, y: 548, w: 54, h: 34, type: 'break' }
  ];

  var ENEMIES = [
    { type: 'walk', x: 700, y: 700, w: 38, h: 30, min: 680, max: 760, speed: 38, dir: 1 },
    { type: 'hop', x: 1260, y: 700, w: 34, h: 36, timer: 0.4 },
    { type: 'hover', x: 1750, y: 520, w: 38, h: 32, baseY: 520, amp: 34, drift: 28, phase: 0.5 },
    { type: 'walk', x: 2030, y: 700, w: 38, h: 30, min: 1900, max: 2160, speed: 48, dir: 1 },
    { type: 'hop', x: 2240, y: 700, w: 34, h: 36, timer: 0.5 },
    { type: 'walk', x: 2710, y: 700, w: 38, h: 30, min: 2550, max: 2840, speed: 52, dir: 1 },
    { type: 'hop', x: 3020, y: 700, w: 34, h: 36, timer: 0.8 },
    { type: 'hover', x: 3300, y: 500, w: 38, h: 32, baseY: 500, amp: 42, drift: 34, phase: 2.1 },
    { type: 'walk', x: 3470, y: 700, w: 38, h: 30, min: 3380, max: 3600, speed: 58, dir: 1 },
    { type: 'walk', x: 3760, y: 700, w: 38, h: 30, min: 3660, max: 3860, speed: 52, dir: 1 },
    { type: 'hop', x: 3930, y: 700, w: 34, h: 36, timer: 1.2 },
    { type: 'walk', x: 4310, y: 700, w: 38, h: 30, min: 4200, max: 4460, speed: 60, dir: 1 },
    { type: 'hover', x: 4530, y: 510, w: 38, h: 32, baseY: 510, amp: 38, drift: 32, phase: 3.4 },
    { type: 'shoot', x: 4750, y: 700, w: 42, h: 44, timer: 1.5 },
    { type: 'walk', x: 4990, y: 700, w: 38, h: 30, min: 4900, max: 5080, speed: 46, dir: 1 }
  ];

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function cloneBlocks() {
    var out = [];
    for (var i = 0; i < BLOCKS.length; i++) {
      out.push({
        x: BLOCKS[i].x,
        y: BLOCKS[i].y,
        w: BLOCKS[i].w,
        h: BLOCKS[i].h,
        type: BLOCKS[i].type,
        alive: true
      });
    }
    return out;
  }

  function cloneEnemies() {
    var out = [];
    for (var i = 0; i < ENEMIES.length; i++) {
      var e = ENEMIES[i];
      out.push({
        type: e.type,
        x: e.x,
        y: e.y,
        homeX: e.x,
        homeY: e.y,
        w: e.w,
        h: e.h,
        min: e.min,
        max: e.max,
        speed: e.speed,
        dir: e.dir || 1,
        timer: e.timer || 0,
        baseY: e.baseY || e.y,
        amp: e.amp || 0,
        drift: e.drift || 0,
        phase: e.phase || 0,
        t: 0,
        vy: 0,
        grounded: true,
        alive: true
      });
    }
    return out;
  }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 80) s.events.shift();
  }

  function getSegmentAt(x) {
    for (var i = 0; i < GROUND.length; i++) {
      if (x >= GROUND[i][0] && x <= GROUND[i][1]) return GROUND[i];
    }
    return null;
  }

  function isOverGround(x) {
    return getSegmentAt(x) !== null;
  }

  function finalize(s) {
    if (s.phase !== 'over' && s.phase !== 'clear') return;
    if (s.score > s.best) {
      s.best = s.score;
      s.newBest = true;
    }
  }

  function refreshScore(s) {
    s.distance = Math.max(s.distance, Math.floor(Math.max(0, s.x - C.START_X) / 10));
    s.score = s.distance * 10 + s.stomps * 100 + s.blockBonus + s.clearBonus;
  }

  function createRun(options) {
    options = options || {};
    var s = {
      phase: 'run',
      paused: false,
      time: 0,
      finishTime: 0,
      x: C.START_X,
      y: C.GROUND_Y,
      vy: 0,
      onGround: true,
      coyote: 0,
      jumpBuffer: 0,
      jumpHeld: false,
      invuln: 0,
      lives: C.LIVES,
      distance: 0,
      score: 0,
      best: Math.max(0, Number(options.best) || 0),
      newBest: false,
      stomps: 0,
      blockBonus: 0,
      clearBonus: 0,
      checkpoint: { x: C.START_X, y: C.GROUND_Y },
      cameraX: 0,
      flagT: 0,
      flagY: 420,
      walkT: 0,
      deathTimer: 0,
      deathKind: null,
      blocks: cloneBlocks(),
      enemies: cloneEnemies(),
      projectiles: [],
      events: []
    };
    refreshScore(s);
    return s;
  }

  function resetRun(s, options) {
    options = options || {};
    var fresh = createRun(options);
    for (var key in fresh) {
      if (Object.prototype.hasOwnProperty.call(fresh, key)) s[key] = fresh[key];
    }
    return s;
  }

  function doJump(s) {
    if (s.phase !== 'run') return;
    s.vy = C.JUMP_V;
    s.onGround = false;
    s.coyote = 0;
    s.jumpBuffer = 0;
    event(s, 'jump', { x: s.x, y: s.y });
  }

  function pressJump(s) {
    if (!s) return;
    s.jumpHeld = true;
    if (s.phase !== 'run' || s.paused) return;
    s.jumpBuffer = C.BUFFER;
    if (s.onGround || s.coyote > 0) doJump(s);
  }

  function releaseJump(s) {
    if (!s) return;
    s.jumpHeld = false;
    if (s.phase === 'run' && s.vy < -190) s.vy *= C.CUT_JUMP;
  }

  function damage(s, kind) {
    if (!s || s.phase !== 'run' || s.paused || s.invuln > 0) return false;
    s.lives = Math.max(0, s.lives - 1);
    s.phase = 'dying';
    s.deathTimer = 0;
    s.deathKind = kind || 'enemy';
    s.jumpHeld = false;
    s.jumpBuffer = 0;
    if (s.deathKind === 'pit') {
      s.vy = Math.max(s.vy, 120);
    } else {
      s.vy = -330;
    }
    event(s, 'damage', { x: s.x, y: s.y, kind: s.deathKind, lives: s.lives });
    return true;
  }

  function landPlayer(s, y, block) {
    s.y = y;
    s.vy = 0;
    s.onGround = true;
    s.coyote = C.COYOTE;
    if (block) {
      event(s, 'land', { x: s.x, y: y, block: block.type });
    }
    if (s.jumpBuffer > 0) doJump(s);
  }

  function updatePlayer(s, dt) {
    var prevY = s.y;
    var prevVy = s.vy;

    s.x += C.RUN_SPEED * dt;

    if (s.x + C.PLAYER_W / 2 >= C.FLAG_X) {
      s.phase = 'flag';
      s.flagT = 0;
      s.finishTime = s.time;
      s.x = C.FLAG_X - 17;
      s.vy = 0;
      s.jumpHeld = false;
      s.flagY = clamp(s.y - 60, 420, 668);
      event(s, 'flag', { x: s.x, y: s.y });
      return;
    }

    s.invuln = Math.max(0, s.invuln - dt);
    s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
    if (s.onGround) s.coyote = C.COYOTE;
    else s.coyote = Math.max(0, s.coyote - dt);

    var gravity = C.GRAVITY;
    if (s.vy < 0 && s.jumpHeld) gravity *= C.HOLD_GRAVITY;
    s.vy = Math.min(C.MAX_FALL, s.vy + gravity * dt);
    s.y += s.vy * dt;

    var wasOnGround = s.onGround;
    s.onGround = false;

    if (s.vy < 0) {
      var topBefore = prevY - C.PLAYER_H;
      var topAfter = s.y - C.PLAYER_H;
      var left = s.x - C.PLAYER_W / 2;
      var right = s.x + C.PLAYER_W / 2;
      for (var i = 0; i < s.blocks.length; i++) {
        var b = s.blocks[i];
        if (!b.alive) continue;
        if (right <= b.x || left >= b.x + b.w) continue;
        var bottom = b.y + b.h;
        if (topBefore >= bottom - 0.5 && topAfter <= bottom) {
          if (b.type === 'break') {
            b.alive = false;
            s.blockBonus += 40;
            s.vy = 120;
            event(s, 'break', { x: b.x + b.w / 2, y: b.y + b.h / 2, kind: b.type });
          } else {
            s.y = bottom + C.PLAYER_H;
            s.vy = 0;
            event(s, 'bump', { x: b.x + b.w / 2, y: bottom, kind: b.type });
            break;
          }
        }
      }
    } else {
      var landingY = null;
      var landingBlock = null;
      var pLeft = s.x - C.PLAYER_W / 2;
      var pRight = s.x + C.PLAYER_W / 2;
      for (var j = 0; j < s.blocks.length; j++) {
        var block = s.blocks[j];
        if (!block.alive) continue;
        if (pRight <= block.x || pLeft >= block.x + block.w) continue;
        if (prevY <= block.y + 0.5 && s.y >= block.y) {
          if (landingY === null || block.y < landingY) {
            landingY = block.y;
            landingBlock = block;
          }
        }
      }
      var overLand = false;
      for (var gi = 0; gi < GROUND.length; gi++) {
        if (pRight > GROUND[gi][0] && pLeft < GROUND[gi][1]) {
          overLand = true;
          break;
        }
      }
      if (overLand && prevY <= C.GROUND_Y + 0.5 && s.y >= C.GROUND_Y) {
        if (landingY === null || C.GROUND_Y < landingY) {
          landingY = C.GROUND_Y;
          landingBlock = null;
        }
      }
      if (landingY !== null) landPlayer(s, landingY, landingBlock);
    }

    if (wasOnGround && !s.onGround) s.coyote = C.COYOTE;

    if (s.onGround && s.jumpBuffer > 0) doJump(s);

    checkEnemyCollisions(s, prevY, prevVy);
    if (s.phase !== 'run') return;

    for (var k = s.projectiles.length - 1; k >= 0; k--) {
      var p = s.projectiles[k];
      var boxLeft = s.x - C.PLAYER_W / 2;
      var boxRight = s.x + C.PLAYER_W / 2;
      var boxTop = s.y - C.PLAYER_H;
      if (p.x + p.r > boxLeft && p.x - p.r < boxRight && p.y + p.r > boxTop && p.y - p.r < s.y) {
        s.projectiles.splice(k, 1);
        damage(s, 'fireball');
        if (s.phase !== 'run') return;
      }
    }

    if (s.lives > 0 && s.y > 760 && !isOverGround(s.x)) {
      damage(s, 'pit');
      return;
    }

    if (s.onGround && isOverGround(s.x)) {
      var seg = getSegmentAt(s.x);
      var enemyNear = false;
      for (var m = 0; m < s.enemies.length; m++) {
        if (s.enemies[m].alive && Math.abs(s.enemies[m].x - s.x) < 70) {
          enemyNear = true;
          break;
        }
      }
      if (seg && !enemyNear && seg[1] - s.x > 130 && s.x - seg[0] > 40 && s.x > s.checkpoint.x + 20) {
        s.checkpoint.x = s.x;
        s.checkpoint.y = C.GROUND_Y;
      }
    }

    refreshScore(s);
  }

  function enemyTop(e) {
    return e.y - e.h;
  }

  function checkEnemyCollisions(s, prevY, prevVy) {
    if (s.invuln > 0) return;
    var pLeft = s.x - C.PLAYER_W / 2;
    var pRight = s.x + C.PLAYER_W / 2;
    var pTop = s.y - C.PLAYER_H;
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (!e.alive) continue;
      var left = e.x - e.w / 2;
      var right = e.x + e.w / 2;
      var top = enemyTop(e);
      if (pRight <= left || pLeft >= right || s.y <= top || pTop >= e.y) continue;
      if (prevVy > 0 && prevY <= top + 16 && s.y >= top) {
        e.alive = false;
        s.stomps++;
        s.vy = -430;
        s.onGround = false;
        event(s, 'stomp', { x: e.x, y: top + e.h / 2, kind: e.type });
        refreshScore(s);
      } else {
        damage(s, 'enemy');
        return;
      }
    }
  }

  function updateEnemies(s, dt) {
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (!e.alive) continue;
      e.t += dt;
      if (e.type === 'walk') {
        e.x += e.dir * e.speed * dt;
        if (e.x < e.min) {
          e.x = e.min;
          e.dir = 1;
        } else if (e.x > e.max) {
          e.x = e.max;
          e.dir = -1;
        }
      } else if (e.type === 'hop') {
        e.timer -= dt;
        if (e.grounded && e.timer <= 0) {
          e.vy = -430;
          e.grounded = false;
          e.timer = 1.25 + (i % 3) * 0.18;
        }
        if (!e.grounded) {
          e.vy += C.GRAVITY * 0.72 * dt;
          e.y += e.vy * dt;
          if (e.y >= 700) {
            e.y = 700;
            e.vy = 0;
            e.grounded = true;
          }
        }
      } else if (e.type === 'hover') {
        e.x = e.homeX + Math.sin(e.t * 0.82 + e.phase) * e.drift;
        e.y = e.baseY + Math.sin(e.t * 1.7 + e.phase) * e.amp;
      } else if (e.type === 'shoot') {
        e.timer -= dt;
        if (e.timer <= 0 && s.x < e.x + 40 && e.x - s.x < 470) {
          var dx = s.x - e.x;
          var dy = (s.y - C.PLAYER_H * 0.5) - (e.y - 24);
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var speed = 210;
          s.projectiles.push({
            x: e.x,
            y: e.y - 24,
            vx: dx / dist * speed,
            vy: dy / dist * speed,
            r: 7,
            life: 4.5
          });
          e.timer = 1.75;
          event(s, 'shoot', { x: e.x, y: e.y - 24 });
        }
      }
    }
  }

  function updateProjectiles(s, dt) {
    for (var i = s.projectiles.length - 1; i >= 0; i--) {
      var p = s.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > 820 || p.x < s.cameraX - 80 || p.x > C.LEVEL_END + 80) {
        s.projectiles.splice(i, 1);
      }
    }
  }

  function updateDying(s, dt) {
    s.deathTimer += dt;
    s.vy = Math.min(C.MAX_FALL, s.vy + 1800 * dt);
    s.y += s.vy * dt;
    if (s.deathTimer < 0.86) return;
    if (s.lives > 0) {
      s.phase = 'run';
      s.x = s.checkpoint.x;
      s.y = s.checkpoint.y;
      s.vy = 0;
      s.onGround = true;
      s.coyote = C.COYOTE;
      s.jumpBuffer = 0;
      s.jumpHeld = false;
      s.invuln = 2.4;
      s.deathTimer = 0;
      s.projectiles = [];
      s.cameraX = clamp(s.x - 160, 0, C.LEVEL_END - C.VIEW_W);
      event(s, 'respawn', { x: s.x, y: s.y });
    } else {
      s.phase = 'over';
      finalize(s);
      event(s, 'gameover', { x: s.x, y: s.y });
    }
  }

  function updateFlag(s, dt) {
    s.time += dt;
    s.flagT += dt;
    s.y = Math.min(C.GROUND_Y, s.y + 350 * dt);
    s.flagY = clamp(s.y - 52, 420, 668);
    if (s.flagT > 0.72 && s.y >= C.GROUND_Y - 0.1) {
      s.phase = 'walk';
      s.walkT = 0;
      s.y = C.GROUND_Y;
      s.onGround = true;
      s.flagY = 668;
    }
  }

  function updateWalk(s, dt) {
    s.time += dt;
    s.walkT += dt;
    s.x += 108 * dt;
    s.y = C.GROUND_Y;
    if (s.x >= C.CASTLE_X - 26) {
      s.x = C.CASTLE_X - 26;
      s.phase = 'clear';
      s.finishTime = s.time;
      s.clearBonus = 1000 + Math.max(0, Math.round(1200 - s.time * 12));
      refreshScore(s);
      finalize(s);
      event(s, 'clear', { x: s.x, y: s.y });
    }
  }

  function updateCamera(s, dt) {
    var target = clamp(s.x - 160, 0, C.LEVEL_END - C.VIEW_W);
    s.cameraX += (target - s.cameraX) * Math.min(1, dt * 8);
    if (s.phase === 'clear' || s.phase === 'over') s.cameraX = target;
  }

  function update(s, dt) {
    if (!s || s.paused) return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    if (s.phase === 'run') {
      s.time += dt;
      updatePlayer(s, dt);
      if (s.phase === 'run') {
        updateEnemies(s, dt);
        updateProjectiles(s, dt);
        refreshScore(s);
      }
    } else if (s.phase === 'dying') {
      updateDying(s, dt);
    } else if (s.phase === 'flag') {
      updateFlag(s, dt);
    } else if (s.phase === 'walk') {
      updateWalk(s, dt);
    }
    updateCamera(s, dt);
    return s;
  }

  function getState(s) {
    if (!s) return null;
    var aliveEnemies = 0;
    for (var i = 0; i < s.enemies.length; i++) if (s.enemies[i].alive) aliveEnemies++;
    return {
      id: 'jump-rush',
      phase: s.phase,
      paused: s.paused,
      over: s.phase === 'over',
      cleared: s.phase === 'clear',
      lives: s.lives,
      score: s.score,
      best: s.best,
      distance: s.distance,
      stomps: s.stomps,
      time: s.time,
      finishTime: s.finishTime,
      x: s.x,
      y: s.y,
      vy: s.vy,
      onGround: s.onGround,
      invuln: s.invuln,
      jumpHeld: s.jumpHeld,
      cameraX: s.cameraX,
      flagY: s.flagY,
      enemiesAlive: aliveEnemies,
      enemiesTotal: s.enemies.length,
      blocksAlive: s.blocks.filter ? s.blocks.filter(function (b) { return b.alive; }).length : 0,
      projectiles: s.projectiles.length,
      deathKind: s.deathKind,
      newBest: s.newBest
    };
  }

  root.JumpRush = {
    constants: C,
    ground: GROUND,
    blockDefs: BLOCKS,
    enemyDefs: ENEMIES,
    createRun: createRun,
    resetRun: resetRun,
    update: update,
    pressJump: pressJump,
    releaseJump: releaseJump,
    damage: damage,
    isOverGround: isOverGround,
    getSegmentAt: getSegmentAt,
    getState: getState
  };

  if (typeof document === 'undefined') return;

  var canvas = null;
  var ctx = null;
  var els = {};
  var game = null;
  var best = loadBest();
  var shownScreen = 'screen-title';
  var lastTs = 0;
  var scaleX = 1;
  var scaleY = 1;
  var pointers = {};
  var jumpPointerId = null;
  var autoState = { hold: 0 };
  var effects = { particles: [], popups: [], shake: 0, flash: 0, confettiT: 0 };
  var stars = [];
  var buildings = [];
  var motes = [];

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  function loadBest() {
    try {
      if (typeof localStorage === 'undefined') return 0;
      return Math.max(0, parseInt(localStorage.getItem(C.BEST_KEY) || '0', 10) || 0);
    } catch (e) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(C.BEST_KEY, String(value));
    } catch (e) { }
  }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var screens = [
      ['screen-title', els.screenTitle],
      ['screen-over', els.screenOver],
      ['screen-clear', els.screenClear],
      ['screen-pause', els.screenPause]
    ];
    for (var i = 0; i < screens.length; i++) {
      if (!screens[i][1]) continue;
      screens[i][1].classList.toggle('visible', screens[i][0] === name);
    }
  }

  function hearts(n) {
    var out = '';
    for (var i = 0; i < C.LIVES; i++) out += i < n ? '\u2665' : '\u2661';
    return out;
  }

  function syncUI() {
    if (!game) return;
    var st = game;
    if (st.best > best) {
      best = st.best;
      saveBest(best);
    }
    if (els.score) els.score.textContent = String(st.score);
    if (els.lives) els.lives.textContent = hearts(st.lives);
    if (els.best) els.best.textContent = String(Math.max(best, st.score));
    if (els.titleBest) els.titleBest.textContent = String(best);

    var target = null;
    if (st.phase === 'over') target = 'screen-over';
    else if (st.phase === 'clear') target = 'screen-clear';
    else if (st.paused) target = 'screen-pause';
    setScreen(target);

    if (st.phase === 'over') {
      if (els.overScore) els.overScore.textContent = String(st.score);
      if (els.overBest) els.overBest.textContent = String(best);
      if (els.overDistance) els.overDistance.textContent = st.distance + 'm';
      if (els.overStomps) els.overStomps.textContent = String(st.stomps);
    } else if (st.phase === 'clear') {
      if (els.clearScore) els.clearScore.textContent = String(st.score);
      if (els.clearBest) els.clearBest.textContent = String(best);
      if (els.clearTime) els.clearTime.textContent = st.finishTime.toFixed(1) + 's';
      if (els.clearStomps) els.clearStomps.textContent = String(st.stomps);
    }

    if (els.pause) {
      var canPause = !st.paused && (st.phase === 'run' || st.phase === 'flag' || st.phase === 'walk');
      els.pause.classList.toggle('hidden', !canPause);
    }
    if (els.hint) els.hint.style.opacity = (st.phase === 'run' && !st.paused) ? '0.72' : '0';
  }

  function beginRun() {
    game = JumpRush.createRun({ best: best });
    autoState.hold = 0;
    effects.particles = [];
    effects.popups = [];
    effects.shake = 0;
    effects.flash = 0;
    effects.confettiT = 0;
    pointers = {};
    jumpPointerId = null;
    lastTs = 0;
    setScreen(null);
    if (els.pause) els.pause.classList.remove('hidden');
    syncUI();
  }

  function pauseGame() {
    if (!game || game.paused || (game.phase !== 'run' && game.phase !== 'flag' && game.phase !== 'walk')) return;
    game.paused = true;
    if (game.jumpHeld) releaseJump(game);
    pointers = {};
    jumpPointerId = null;
    setScreen('screen-pause');
    syncUI();
  }

  function resumeGame() {
    if (!game || !game.paused) return;
    game.paused = false;
    lastTs = 0;
    setScreen(null);
    syncUI();
  }

  function togglePause() {
    if (!game) return;
    if (game.paused) resumeGame();
    else pauseGame();
  }

  function burst(x, y, count, colors, speed, life, gravity) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = speed * (0.35 + Math.random() * 0.9);
      effects.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 50,
        g: gravity == null ? 600 : gravity,
        life: life * (0.55 + Math.random() * 0.6),
        max: life,
        size: 1.5 + Math.random() * 4.5,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function popup(text, x, y, color, size) {
    effects.popups.push({
      text: text,
      x: x,
      y: y,
      life: 0.85,
      max: 0.85,
      color: color,
      size: size || 18
    });
  }

  function consumeEvents() {
    if (!game) return;
    var events = game.events.splice(0, game.events.length);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var x = ev.x - game.cameraX;
      var y = ev.y;
      if (ev.type === 'stomp') {
        burst(x, y, 15, ['#ffd166', '#ff7ac8', '#ffffff'], 220, 0.55);
        popup('+100', x, y - 16, '#ffe08a', 18);
        effects.shake = Math.max(effects.shake, 0.24);
      } else if (ev.type === 'break') {
        burst(x, y, 14, ['#5ff0ff', '#ffd166', '#ffffff'], 230, 0.6);
        popup('+40', x, y - 12, '#b9fbff', 15);
        effects.shake = Math.max(effects.shake, 0.18);
      } else if (ev.type === 'bump') {
        burst(x, y, 6, ['#8fa9d8', '#ffffff'], 120, 0.3);
      } else if (ev.type === 'damage') {
        burst(x, y - 20, 26, ['#ff5db1', '#ff8a5b', '#ffd166', '#ffffff'], 330, 0.8);
        effects.shake = 1;
        effects.flash = 0.55;
      } else if (ev.type === 'shoot') {
        burst(x, y, 5, ['#ff7a5c', '#ffd166'], 90, 0.25);
      } else if (ev.type === 'flag') {
        burst(x + 20, y - 160, 24, ['#ffd166', '#5ff0ff', '#ffffff'], 260, 0.9);
      } else if (ev.type === 'clear') {
        effects.confettiT = 2.2;
        effects.flash = 0.45;
      } else if (ev.type === 'respawn') {
        burst(x, y - 22, 18, ['#5ff0ff', '#8d79ff', '#ffffff'], 180, 0.55);
      }
    }
  }

  function updateEffects(dt) {
    for (var i = effects.particles.length - 1; i >= 0; i--) {
      var p = effects.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        effects.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.2);
    }
    for (i = effects.popups.length - 1; i >= 0; i--) {
      var pop = effects.popups[i];
      pop.life -= dt;
      pop.y -= 38 * dt;
      if (pop.life <= 0) effects.popups.splice(i, 1);
    }
    if (effects.shake > 0) effects.shake = Math.max(0, effects.shake - dt * 2.6);
    if (effects.flash > 0) effects.flash = Math.max(0, effects.flash - dt * 2.4);
    if (effects.confettiT > 0) {
      effects.confettiT -= dt;
      if (Math.random() < 0.8) {
        burst(30 + Math.random() * 420, 70 + Math.random() * 80, 2,
          ['#ffd166', '#5ff0ff', '#ff5db1', '#ffffff'], 150, 1.8, 260);
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function buildScenery() {
    stars = [];
    for (var i = 0; i < 90; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.68,
        r: 0.7 + Math.random() * 2.2,
        tw: 0.5 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2
      });
    }
    buildings = [];
    for (i = 0; i < 34; i++) {
      buildings.push({
        x: i * 58 + Math.random() * 18,
        w: 28 + Math.random() * 30,
        h: 44 + Math.random() * 105,
        hue: Math.random() < 0.55 ? 198 : 292,
        lights: Math.random() < 0.7
      });
    }
    motes = [];
    for (i = 0; i < 22; i++) {
      motes.push({
        x: Math.random() * C.VIEW_W,
        y: 200 + Math.random() * 460,
        r: 1 + Math.random() * 2.4,
        speed: 7 + Math.random() * 16,
        phase: Math.random() * 6.28
      });
    }
  }

  function drawBackdrop(time) {
    var cam = game ? game.cameraX : 0;
    var sky = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
    sky.addColorStop(0, '#080b24');
    sky.addColorStop(0.4, '#101b42');
    sky.addColorStop(0.7, '#182551');
    sky.addColorStop(1, '#060813');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    var glow = ctx.createRadialGradient(350, 115, 4, 350, 115, 230);
    glow.addColorStop(0, 'rgba(255, 232, 179, 0.24)');
    glow.addColorStop(0.3, 'rgba(255, 160, 225, 0.12)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, C.VIEW_W, 450);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(time * s.tw + s.phase));
      var x = mod(s.x * C.VIEW_W - cam * 0.035, C.VIEW_W);
      ctx.fillStyle = 'rgba(190, 230, 255, ' + (0.12 + tw * 0.5) + ')';
      ctx.fillRect(x, s.y * C.VIEW_H, s.r, s.r);
    }

    ctx.save();
    ctx.shadowColor = 'rgba(255, 233, 190, 0.8)';
    ctx.shadowBlur = 36;
    ctx.fillStyle = '#fff0c2';
    ctx.beginPath();
    ctx.arc(350, 115, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(235, 243, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(340, 108, 5, 0, Math.PI * 2);
    ctx.arc(358, 123, 3.5, 0, Math.PI * 2);
    ctx.fill();

    drawMountains(cam, 0.08, 570, 64, 'rgba(25, 35, 88, 0.88)');
    drawMountains(cam, 0.16, 616, 42, 'rgba(17, 24, 62, 0.94)');
    drawCity(cam);
    drawMotes(time, cam);
  }

  function drawMountains(cam, parallax, base, amp, color) {
    ctx.beginPath();
    ctx.moveTo(-20, C.GROUND_Y);
    for (var x = -20; x <= C.VIEW_W + 30; x += 28) {
      var wx = x + cam * parallax;
      var y = base - Math.abs(Math.sin(wx * 0.008 + 0.4)) * amp - Math.sin(wx * 0.019) * 9;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(C.VIEW_W + 30, C.GROUND_Y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawCity(cam) {
    var offset = -mod(cam * 0.26, 986);
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      var x = offset + b.x;
      if (x > C.VIEW_W + 40 || x + b.w < -40) continue;
      var top = C.GROUND_Y - b.h - 110;
      ctx.fillStyle = b.hue === 198 ? 'rgba(13, 21, 50, 0.9)' : 'rgba(22, 17, 52, 0.9)';
      ctx.fillRect(x, top, b.w, b.h + 110);
      ctx.fillStyle = b.hue === 198 ? 'rgba(95, 240, 255, 0.22)' : 'rgba(255, 93, 177, 0.18)';
      ctx.fillRect(x, top, b.w, 2);
      if (b.lights) {
        for (var wy = top + 11; wy < C.GROUND_Y - 116; wy += 13) {
          for (var wx = x + 6; wx < x + b.w - 5; wx += 11) {
            if ((Math.floor(wx + wy) % 3) === 0) {
              ctx.fillStyle = b.hue === 198 ? 'rgba(95, 240, 255, 0.24)' : 'rgba(255, 93, 177, 0.22)';
              ctx.fillRect(wx, wy, 3, 4);
            }
          }
        }
      }
    }
  }

  function drawMotes(time, cam) {
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var x = mod(m.x - cam * 0.42, C.VIEW_W);
      var y = m.y - mod(time * m.speed, 540);
      ctx.fillStyle = 'rgba(120, 230, 255, ' + (0.08 + 0.15 * Math.abs(Math.sin(time * 1.4 + m.phase))) + ')';
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCastle() {
    var cx = C.CASTLE_X - (game ? game.cameraX : 0);
    if (cx < -180 || cx > C.VIEW_W + 180) return;
    var base = C.GROUND_Y;
    ctx.save();
    ctx.shadowColor = 'rgba(255, 93, 177, 0.28)';
    ctx.shadowBlur = 28;

    ctx.fillStyle = '#1b183a';
    ctx.fillRect(cx - 92, base - 152, 184, 152);
    ctx.fillStyle = '#242053';
    ctx.fillRect(cx - 72, base - 204, 144, 204);

    for (var i = 0; i < 5; i++) {
      ctx.fillStyle = '#2c2864';
      ctx.fillRect(cx - 92 + i * 39, base - 174, 22, 24);
      ctx.fillRect(cx - 72 + i * 31, base - 226, 18, 24);
    }

    ctx.fillStyle = '#15122f';
    ctx.fillRect(cx - 106, base - 122, 28, 122);
    ctx.fillRect(cx + 78, base - 122, 28, 122);
    ctx.fillStyle = '#ff5db1';
    ctx.beginPath();
    ctx.moveTo(cx - 116, base - 122);
    ctx.lineTo(cx - 92, base - 165);
    ctx.lineTo(cx - 68, base - 122);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 68, base - 122);
    ctx.lineTo(cx + 92, base - 165);
    ctx.lineTo(cx + 116, base - 122);
    ctx.closePath();
    ctx.fill();

    var gate = ctx.createLinearGradient(cx - 24, base - 90, cx + 24, base);
    gate.addColorStop(0, '#060712');
    gate.addColorStop(0.6, '#1b1440');
    gate.addColorStop(1, '#000000');
    ctx.fillStyle = gate;
    ctx.beginPath();
    ctx.moveTo(cx - 27, base);
    ctx.lineTo(cx - 27, base - 62);
    ctx.quadraticCurveTo(cx, base - 104, cx + 27, base - 62);
    ctx.lineTo(cx + 27, base);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(95, 240, 255, 0.62)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 92, base - 152);
    ctx.lineTo(cx + 92, base - 152);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.48)';
    ctx.beginPath();
    ctx.moveTo(cx - 72, base - 204);
    ctx.lineTo(cx + 72, base - 204);
    ctx.stroke();
    ctx.restore();
  }

  function drawFlagPole(time) {
    var px = C.FLAG_X - (game ? game.cameraX : 0);
    if (px < -80 || px > C.VIEW_W + 80) return;
    var flagY = game ? game.flagY : 420;
    ctx.save();
    ctx.shadowColor = 'rgba(255, 209, 102, 0.6)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#c7d9ff';
    ctx.fillRect(px - 3, 378, 6, C.GROUND_Y - 378);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(px, 376, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var wave = Math.sin(time * 4) * 3;
    ctx.save();
    ctx.translate(px + 5, flagY);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(61, 8 + wave);
    ctx.lineTo(51, 26 + wave);
    ctx.lineTo(0, 38);
    ctx.closePath();
    ctx.fillStyle = '#ff5db1';
    ctx.shadowColor = 'rgba(255, 93, 177, 0.6)';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 2; j++) {
        if ((i + j) % 2 === 0) {
          ctx.fillRect(10 + i * 14, 8 + j * 12 + wave * 0.3, 12, 10);
        }
      }
    }
    ctx.restore();
  }

  function drawGround() {
    var cam = game ? game.cameraX : 0;
    var groundGrad = ctx.createLinearGradient(0, C.GROUND_Y, 0, C.VIEW_H);
    groundGrad.addColorStop(0, '#182c53');
    groundGrad.addColorStop(0.14, '#0b142b');
    groundGrad.addColorStop(1, '#03050d');

    for (var i = 0; i < GROUND.length; i++) {
      var x1 = GROUND[i][0] - cam;
      var x2 = GROUND[i][1] - cam;
      if (x2 < -20 || x1 > C.VIEW_W + 20) continue;
      ctx.fillStyle = groundGrad;
      ctx.fillRect(x1, C.GROUND_Y, x2 - x1, C.VIEW_H - C.GROUND_Y);

      ctx.save();
      ctx.shadowColor = 'rgba(95, 240, 255, 0.8)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#5ff0ff';
      ctx.fillRect(x1, C.GROUND_Y - 3, x2 - x1, 4);
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 93, 177, 0.18)';
      ctx.fillRect(x1, C.GROUND_Y + 16, x2 - x1, 2);

      var start = Math.ceil((x1 + 20) / 28) * 28;
      for (var tx = start; tx < x2 - 5; tx += 28) {
        ctx.fillStyle = 'rgba(95, 240, 255, 0.045)';
        ctx.fillRect(tx, C.GROUND_Y + 20, 2, C.VIEW_H - C.GROUND_Y - 20);
      }

      ctx.strokeStyle = 'rgba(255, 93, 177, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1 + 1, C.GROUND_Y + 2);
      ctx.lineTo(x1 + 1, C.VIEW_H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2 - 1, C.GROUND_Y + 2);
      ctx.lineTo(x2 - 1, C.VIEW_H);
      ctx.stroke();
    }

    for (i = 0; i < GROUND.length - 1; i++) {
      var gapL = GROUND[i][1] - cam;
      var gapR = GROUND[i + 1][0] - cam;
      if (gapR < -20 || gapL > C.VIEW_W + 20) continue;
      var pit = ctx.createLinearGradient(0, C.GROUND_Y - 4, 0, C.VIEW_H);
      pit.addColorStop(0, 'rgba(255, 93, 177, 0.32)');
      pit.addColorStop(0.35, 'rgba(91, 20, 106, 0.18)');
      pit.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
      ctx.fillStyle = pit;
      ctx.fillRect(gapL, C.GROUND_Y - 4, gapR - gapL, C.VIEW_H - C.GROUND_Y + 4);
    }
  }

  function drawBlocks() {
    if (!game) return;
    var cam = game.cameraX;
    for (var i = 0; i < game.blocks.length; i++) {
      var b = game.blocks[i];
      if (!b.alive) continue;
      var x = b.x - cam;
      if (x + b.w < -30 || x > C.VIEW_W + 30) continue;
      if (b.type === 'break') {
        var grad = ctx.createLinearGradient(x, b.y, x, b.y + b.h);
        grad.addColorStop(0, '#ffe39a');
        grad.addColorStop(0.45, '#ffb84d');
        grad.addColorStop(1, '#b66317');
        ctx.save();
        ctx.shadowColor = 'rgba(255, 209, 102, 0.55)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = grad;
        roundRect(x, b.y, b.w, b.h, 6);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255, 247, 206, 0.88)';
        ctx.lineWidth = 1.5;
        roundRect(x, b.y, b.w, b.h, 6);
        ctx.stroke();
        ctx.fillStyle = 'rgba(90, 42, 6, 0.8)';
        ctx.font = '900 19px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + b.w / 2, b.y + b.h / 2 + 1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.fillRect(x + 6, b.y + 4, b.w - 12, 2);
      } else {
        var steel = ctx.createLinearGradient(x, b.y, x + b.w, b.y + b.h);
        steel.addColorStop(0, '#3c4b72');
        steel.addColorStop(0.45, '#1b2440');
        steel.addColorStop(1, '#0d1226');
        ctx.fillStyle = steel;
        roundRect(x, b.y, b.w, b.h, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(95, 240, 255, 0.52)';
        ctx.lineWidth = 1.4;
        roundRect(x, b.y, b.w, b.h, 5);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 93, 177, 0.5)';
        ctx.fillRect(x + 8, b.y + b.h / 2 - 1, b.w - 16, 2);
        ctx.fillStyle = 'rgba(200, 225, 255, 0.72)';
        ctx.beginPath();
        ctx.arc(x + 7, b.y + 7, 2, 0, Math.PI * 2);
        ctx.arc(x + b.w - 7, b.y + 7, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawEnemy(e, time) {
    if (!e.alive) return;
    var x = e.x - game.cameraX;
    var y = e.y;
    if (x < -70 || x > C.VIEW_W + 70) return;
    var bob = Math.sin(e.t * 7) * 2;
    ctx.save();
    ctx.translate(x, y + bob);

    if (e.type === 'walk') {
      ctx.shadowColor = 'rgba(255, 93, 177, 0.65)';
      ctx.shadowBlur = 14;
      var body = ctx.createLinearGradient(0, -e.h, 0, 0);
      body.addColorStop(0, '#ff8fd1');
      body.addColorStop(1, '#c42274');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, -e.h * 0.52, e.w * 0.48, e.h * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#4b0b30';
      ctx.beginPath();
      ctx.ellipse(-8, -e.h * 0.2, 8, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(8, -e.h * 0.2, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(7, -e.h * 0.64, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#25112b';
      ctx.beginPath();
      ctx.arc(9, -e.h * 0.64, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, -e.h - 2);
      ctx.lineTo(-6, -e.h - 10);
      ctx.lineTo(-1, -e.h - 2);
      ctx.stroke();
    } else if (e.type === 'hop') {
      ctx.shadowColor = 'rgba(255, 167, 92, 0.7)';
      ctx.shadowBlur = 14;
      var hop = ctx.createLinearGradient(0, -e.h, 0, 0);
      hop.addColorStop(0, '#ffd36e');
      hop.addColorStop(1, '#e26227');
      ctx.fillStyle = hop;
      roundRect(-e.w * 0.42, -e.h, e.w * 0.84, e.h, 10);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd36e';
      ctx.beginPath();
      ctx.ellipse(-7, -e.h - 6, 4, 12, -0.2, 0, Math.PI * 2);
      ctx.ellipse(7, -e.h - 6, 4, 12, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(6, -e.h * 0.65, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b1626';
      ctx.beginPath();
      ctx.arc(7.5, -e.h * 0.65, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'hover') {
      ctx.shadowColor = 'rgba(149, 124, 255, 0.85)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(149, 124, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(-e.w * 0.35, -e.h * 0.5);
      ctx.lineTo(-e.w * 0.95, -e.h * 0.85);
      ctx.lineTo(-e.w * 0.8, -e.h * 0.15);
      ctx.closePath();
      ctx.moveTo(e.w * 0.35, -e.h * 0.5);
      ctx.lineTo(e.w * 0.95, -e.h * 0.85);
      ctx.lineTo(e.w * 0.8, -e.h * 0.15);
      ctx.closePath();
      ctx.fill();
      var orb = ctx.createRadialGradient(-5, -e.h * 0.62, 2, 0, -e.h * 0.5, e.w * 0.48);
      orb.addColorStop(0, '#e7deff');
      orb.addColorStop(0.45, '#9d7bff');
      orb.addColorStop(1, '#49227c');
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(0, -e.h * 0.5, e.w * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(7, -e.h * 0.55, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b1147';
      ctx.beginPath();
      ctx.arc(8.5, -e.h * 0.55, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'shoot') {
      var aim = Math.atan2((game.y - 22) - (e.y - 24), game.x - e.x);
      ctx.shadowColor = 'rgba(255, 93, 93, 0.65)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#30152e';
      roundRect(-e.w * 0.48, -e.h * 0.58, e.w * 0.96, e.h * 0.58, 8);
      ctx.fill();
      ctx.fillStyle = '#ff5d70';
      ctx.beginPath();
      ctx.arc(0, -e.h * 0.58, e.w * 0.35, Math.PI, 0);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.translate(0, -e.h * 0.58);
      ctx.rotate(aim);
      ctx.fillStyle = '#ffb45d';
      roundRect(0, -5, 28, 10, 4);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = e.timer < 0.4 ? '#fff3b0' : '#ff9b5b';
      ctx.beginPath();
      ctx.arc(e.w * 0.12, -e.h * 0.75, 4 + Math.abs(Math.sin(time * 6)) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#24122a';
      ctx.fillRect(-e.w * 0.34, -3, e.w * 0.68, 3);
    }
    ctx.restore();
  }

  function drawEnemies(time) {
    if (!game) return;
    for (var i = 0; i < game.enemies.length; i++) drawEnemy(game.enemies[i], time);
  }

  function drawProjectiles(time) {
    if (!game) return;
    for (var i = 0; i < game.projectiles.length; i++) {
      var p = game.projectiles[i];
      var x = p.x - game.cameraX;
      var y = p.y;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 114, 92, 0.9)';
      ctx.shadowBlur = 18;
      var g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, p.r + 4);
      g.addColorStop(0, '#fff6cf');
      g.addColorStop(0.4, '#ffb35e');
      g.addColorStop(1, '#ff4268');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, p.r + Math.sin(time * 12 + i) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayerSprite(sx, sy, time, state) {
    var invulnBlink = state && state.invuln > 0 && (Math.floor(state.invuln * 11) % 2 === 0);
    var onGround = !state || state.onGround;
    var vy = state ? state.vy : 0;
    var run = Math.sin(time * 18);
    var leg = onGround ? run * 5 : 4;
    var bodyY = sy - 40;

    ctx.save();
    ctx.globalAlpha = invulnBlink ? 0.35 : 1;
    if (state && state.phase === 'dying') {
      ctx.translate(sx, sy - 20);
      ctx.rotate(state.deathTimer * 8);
      ctx.translate(-sx, -(sy - 20));
    }

    if (onGround) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 2, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#ff5db1';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - 7, bodyY + 10);
    ctx.quadraticCurveTo(sx - 24 - Math.abs(run) * 5, bodyY + 7 + Math.sin(time * 8) * 5,
      sx - 35 - Math.abs(run) * 8, bodyY + 16 + Math.sin(time * 9) * 7);
    ctx.stroke();

    ctx.strokeStyle = '#b8fbff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx - 7, sy - 12);
    ctx.lineTo(sx - 9 - leg, sy - 1);
    ctx.moveTo(sx + 7, sy - 12);
    ctx.lineTo(sx + 9 + leg, sy - 1);
    ctx.stroke();

    var body = ctx.createLinearGradient(sx, bodyY, sx, sy - 8);
    body.addColorStop(0, '#b8ffff');
    body.addColorStop(0.45, '#5ff0ff');
    body.addColorStop(1, '#247fcb');
    ctx.fillStyle = body;
    ctx.shadowColor = 'rgba(95, 240, 255, 0.8)';
    ctx.shadowBlur = 18;
    roundRect(sx - 13, bodyY + 2, 26, 30, 10);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#071221';
    roundRect(sx - 8, bodyY + 7, 18, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ctx.arc(sx + 5, bodyY + 13, 2.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(sx - 11, bodyY + 13, 3.2, 0, Math.PI * 2);
    ctx.fill();

    if (!onGround && vy < 0) {
      ctx.strokeStyle = 'rgba(95, 240, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy - 2);
      ctx.lineTo(sx - 9, sy + 8);
      ctx.moveTo(sx + 6, sy - 2);
      ctx.lineTo(sx + 9, sy + 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(time) {
    if (!game) return;
    var x = game.x - game.cameraX;
    var y = game.y;
    if (x < -60 || x > C.VIEW_W + 60) return;
    drawPlayerSprite(x, y, time, game);
  }

  function drawEffects() {
    for (var i = 0; i < effects.particles.length; i++) {
      var p = effects.particles[i];
      var a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 9;
      if (p.size > 3 && Math.random() > 0.55) {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 1.7);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    for (i = 0; i < effects.popups.length; i++) {
      var pop = effects.popups[i];
      ctx.globalAlpha = clamp(pop.life / pop.max, 0, 1);
      ctx.fillStyle = pop.color;
      ctx.shadowColor = pop.color;
      ctx.shadowBlur = 12;
      ctx.font = '900 ' + pop.size + 'px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function drawTouchStick() {
    if (!game || game.paused || game.phase !== 'run') return;
    var ids = Object.keys(pointers);
    for (var i = 0; i < ids.length; i++) {
      var p = pointers[ids[i]];
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = p.id === jumpPointerId ? '#5ff0ff' : '#ff5db1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.baseX, p.baseY, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(95, 240, 255, 0.08)';
      ctx.beginPath();
      ctx.arc(p.baseX, p.baseY, 33, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.id === jumpPointerId ? 'rgba(95, 240, 255, 0.7)' : 'rgba(255, 93, 177, 0.6)';
      ctx.beginPath();
      ctx.arc(p.knobX, p.knobY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTitleScene(time) {
    drawBackdrop(time);
    drawCastle();
    drawGround();
    var bx = 280 - Math.sin(time * 0.4) * 4;
    ctx.save();
    ctx.shadowColor = 'rgba(255, 209, 102, 0.55)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffb84d';
    roundRect(bx, 548, 54, 34, 6);
    ctx.fill();
    ctx.restore();
    var mockEnemy = {
      type: 'walk', x: 355, y: 700, w: 38, h: 30, alive: true, t: time
    };
    var previousGame = game;
    game = { cameraX: 0 };
    drawEnemy(mockEnemy, time);
    drawPlayerSprite(170, 700, time, { onGround: true, vy: 0 });
    game = previousGame;
  }

  function draw(time) {
    if (!ctx) return;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, C.VIEW_W, C.VIEW_H);
    ctx.save();
    if (effects.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 16 * effects.shake, (Math.random() - 0.5) * 16 * effects.shake);
    }
    if (game) {
      drawBackdrop(time);
      drawCastle();
      drawGround();
      drawBlocks();
      drawFlagPole(time);
      drawEnemies(time);
      drawProjectiles(time);
      drawPlayer(time);
    } else {
      drawTitleScene(time);
    }
    drawEffects();
    drawTouchStick();
    if (effects.flash > 0) {
      ctx.fillStyle = 'rgba(235, 250, 255, ' + (effects.flash * 0.45) + ')';
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
    ctx.restore();
  }

  function pointerPosition(e) {
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
    var cw = rect.width || 480;
    var ch = rect.height || 800;
    return {
      x: (e.clientX - rect.left) / cw * C.VIEW_W,
      y: (e.clientY - rect.top) / ch * C.VIEW_H
    };
  }

  function handlePointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!game || game.paused || game.phase !== 'run') return;
    var pos = pointerPosition(e);
    var id = e.pointerId == null ? 1 : e.pointerId;
    pointers[id] = {
      id: id,
      baseX: pos.x,
      baseY: pos.y,
      knobX: pos.x,
      knobY: pos.y
    };
    try {
      if (canvas.setPointerCapture) canvas.setPointerCapture(id);
    } catch (err) { }
    if (jumpPointerId === null) {
      jumpPointerId = id;
      pressJump(game);
    }
  }

  function handlePointerMove(e) {
    if (e && e.preventDefault) e.preventDefault();
    var id = e.pointerId == null ? 1 : e.pointerId;
    var p = pointers[id];
    if (!p) return;
    var pos = pointerPosition(e);
    var dx = pos.x - p.baseX;
    var dy = pos.y - p.baseY;
    var len = Math.sqrt(dx * dx + dy * dy);
    var max = 34;
    if (len > max) {
      dx = dx / len * max;
      dy = dy / len * max;
    }
    p.knobX = p.baseX + dx;
    p.knobY = p.baseY + dy;
  }

  function handlePointerEnd(e, cancelled) {
    if (e && e.preventDefault) e.preventDefault();
    var id = e.pointerId == null ? 1 : e.pointerId;
    if (pointers[id]) delete pointers[id];
    if (jumpPointerId === id) {
      jumpPointerId = null;
      if (game && !game.paused) releaseJump(game);
    }
    try {
      if (canvas.releasePointerCapture) canvas.releasePointerCapture(id);
    } catch (err) { }
  }

  function clearPointers() {
    pointers = {};
    jumpPointerId = null;
    if (game && game.jumpHeld) releaseJump(game);
  }

  function onKeyDown(e) {
    if (!e) return;
    var k = e.key || '';
    var code = e.code || '';
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game && (game.phase === 'run' || game.paused)) {
        if (e.preventDefault) e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || code === 'Space' || code === 'ArrowUp') {
      if (e.preventDefault) e.preventDefault();
      if (!game || game.phase === 'over' || game.phase === 'clear') {
        beginRun();
        return;
      }
      if (game.paused) {
        resumeGame();
        return;
      }
      if (game.phase === 'run' && !e.repeat) pressJump(game);
    }
  }

  function onKeyUp(e) {
    if (!e) return;
    var k = e.key || '';
    var code = e.code || '';
    if (k === ' ' || k === 'Spacebar' || code === 'Space' || k === 'ArrowUp') {
      if (game) releaseJump(game);
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(2, Math.max(1, window.devicePixelRatio)) : 1;
    var w = Math.round(C.VIEW_W * dpr);
    var h = Math.round(C.VIEW_H * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    scaleX = canvas.width / C.VIEW_W;
    scaleY = canvas.height / C.VIEW_H;
  }

  function ensureTitle() {
    if (!shownScreen) {
      shownScreen = null;
      setScreen('screen-title');
    }
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);

    if (game && !game.paused) {
      if (game.phase !== 'over' && game.phase !== 'clear') {
        JumpRush.update(game, dt);
        consumeEvents();
      }
      syncUI();
    }
    if (!game || !game.paused) updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function autoJumpNeeded(s) {
    var seg = getSegmentAt(s.x);
    if (seg && seg[1] - s.x < 62) return true;

    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (!e.alive) continue;
      var d = e.x - s.x;
      if (e.type === 'hover') continue;
      if (d > -8 && d < 96) return true;
    }

    for (i = 0; i < s.projectiles.length; i++) {
      var p = s.projectiles[i];
      var pd = p.x - s.x;
      if (pd > -20 && pd < 85 && Math.abs(p.y - (s.y - 22)) < 48) return true;
    }
    return false;
  }

  function autoPlayStep() {
    if (!game) {
      beginRun();
      return;
    }
    if (game.paused) return;
    if (game.phase !== 'run') {
      autoState.hold = 0;
      return;
    }
    if (autoState.hold > 0) {
      autoState.hold--;
      if (autoState.hold === 0) releaseJump(game);
      return;
    }
    if (game.onGround || game.coyote > 0) {
      if (autoJumpNeeded(game)) {
        pressJump(game);
        autoState.hold = 55;
      }
    }
  }

  function init() {
    canvas = $('game');
    els.score = $('score');
    els.lives = $('lives');
    els.best = $('best');
    els.titleBest = $('title-best');
    els.pause = $('btn-pause');
    els.hint = $('touch-hint');
    els.screenTitle = $('screen-title');
    els.screenOver = $('screen-over');
    els.screenClear = $('screen-clear');
    els.screenPause = $('screen-pause');
    els.overScore = $('over-score');
    els.overBest = $('over-best');
    els.overDistance = $('over-distance');
    els.overStomps = $('over-stomps');
    els.clearScore = $('clear-score');
    els.clearBest = $('clear-best');
    els.clearTime = $('clear-time');
    els.clearStomps = $('clear-stomps');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }

    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');
    if (els.titleBest) els.titleBest.textContent = String(best);
    if (els.best) els.best.textContent = String(best);
    if (els.lives) els.lives.textContent = hearts(C.LIVES);
    if (els.hint) els.hint.style.opacity = '0';

    var startBtn = $('btn-start');
    var overBtn = $('btn-over-retry');
    var clearBtn = $('btn-clear-retry');
    var resumeBtn = $('btn-resume');
    if (startBtn) startBtn.addEventListener('click', beginRun);
    if (overBtn) overBtn.addEventListener('click', beginRun);
    if (clearBtn) clearBtn.addEventListener('click', beginRun);
    if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
    if (els.pause) els.pause.addEventListener('click', togglePause);

    if (canvas) {
      canvas.addEventListener('pointerdown', handlePointerDown, false);
      canvas.addEventListener('pointermove', handlePointerMove, false);
      canvas.addEventListener('pointerup', function (e) { handlePointerEnd(e, false); }, false);
      canvas.addEventListener('pointercancel', function (e) { handlePointerEnd(e, true); }, false);
      canvas.addEventListener('lostpointercapture', function (e) { handlePointerEnd(e, true); }, false);
      canvas.addEventListener('contextmenu', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
      canvas.addEventListener('dblclick', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    }

    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    window.addEventListener('blur', pauseGame, false);
    window.addEventListener('resize', resizeCanvas, false);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseGame();
    }, false);
    document.addEventListener('gesturestart', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('gesturechange', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('gestureend', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('contextmenu', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('selectstart', function (e) { if (e.preventDefault) e.preventDefault(); }, false);

    resizeCanvas();
    buildScenery();
    ensureTitle();
    syncUI();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    root.__GAME__ = {
      id: 'jump-rush',
      title: 'ジャンプラッシュ',
      start: function () { beginRun(); },
      autoPlayStep: autoPlayStep,
      isDone: function () {
        return !!(game && (game.phase === 'over' || game.phase === 'clear'));
      },
      getState: function () {
        if (!game) {
          return {
            id: 'jump-rush',
            phase: 'title',
            lives: C.LIVES,
            score: 0,
            best: best,
            distance: 0,
            stomps: 0
          };
        }
        var state = getState(game);
        state.pointers = Object.keys(pointers).length;
        return state;
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
