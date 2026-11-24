/* engine.js : REBEL BREAKOUT（逃げるブロック）のコアロジック */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RebelBreakoutEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 900;
  var H = 620;
  var MARGIN = 26;
  var PLAYER_SIZE = 38;
  var BALL_R = 9;
  var DURATION = 60;
  var MAX_LIVES = 3;
  var PLAYER_SPEED = 440;
  var BASE_SPEED = 235;
  var MAX_SPEED = 470;
  var SURGE_START = 14;
  var SURGE_PERIOD = 15;
  var SURGE_LEN = 4;
  var SURGE_MULT = 1.32;
  var SWAP_CD = 2.6;
  var SWAP_INVULN = 0.3;
  var INVULN = 1.3;
  var AIM_INTERVAL = 1.0;
  var AIM_TURN = 0.1;
  var AIM_RANGE = 0.75;
  var MAX_BALLS = 3;
  var BALL_SPAWN_TIMES = [22, 42];
  var NEAR_PAD = 26;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 160;

  var SHIELD_ROWS = 5;
  var SHIELD_COLS = 8;
  var SHIELD_W = 78;
  var SHIELD_H = 26;
  var SHIELD_TOP = 86;
  var SHIELD_GAP = 52;
  var ROW_COLORS = ['#ff5d9e', '#ff8a5b', '#ffd166', '#7bffb2', '#5db7ff'];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function len2(x, y) { return Math.sqrt(x * x + y * y); }

  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
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

  function isSurge(state) {
    var t = state.time;
    if (t < SURGE_START) return false;
    return ((t - SURGE_START) % SURGE_PERIOD) < SURGE_LEN;
  }

  function speedNow(state) {
    var p = clamp(state.time / DURATION, 0, 1);
    var s = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * p;
    if (isSurge(state)) s *= SURGE_MULT;
    return s;
  }

  // 壁に当たるたびに少しだけ角度を散らし、完全な周期運動にしない
  function deflect(state, ball, turn) {
    var a = Math.atan2(ball.vy, ball.vx) + (state.rng() * 2 - 1) * turn;
    var sp = len2(ball.vx, ball.vy) || 1;
    ball.vx = Math.cos(a) * sp;
    ball.vy = Math.sin(a) * sp;
  }

  function buildShields(state) {
    var shields = [];
    var cell = (W - 2 * MARGIN) / SHIELD_COLS;
    for (var r = 0; r < SHIELD_ROWS; r++) {
      for (var c = 0; c < SHIELD_COLS; c++) {
        // 少しだけ穴を開け、毎回少し違う通路にする
        if (state.rng() < 0.08) continue;
        shields.push({
          x: MARGIN + cell * (c + 0.5) + (state.rng() * 2 - 1) * 3,
          y: SHIELD_TOP + r * SHIELD_GAP,
          w: SHIELD_W,
          h: SHIELD_H,
          row: r,
          color: ROW_COLORS[r % ROW_COLORS.length]
        });
      }
    }
    return shields;
  }

  function launchPose(state, spread) {
    var x = W / 2 + (state.rng() * 2 - 1) * (W * 0.36);
    var y = MARGIN + BALL_R + 3;
    var base = Math.atan2(state.player.y - y, state.player.x - x);
    return { x: x, y: y, angle: base + (state.rng() * 2 - 1) * spread };
  }

  function resetBall(state, ball, spread) {
    var pose = launchPose(state, spread);
    var speed = speedNow(state);
    ball.x = pose.x;
    ball.y = pose.y;
    ball.vx = Math.cos(pose.angle) * speed;
    ball.vy = Math.sin(pose.angle) * speed;
    ball.aim = AIM_INTERVAL;
    ball.near = false;
  }

  function spawnBall(state, initial) {
    var pose = launchPose(state, initial ? 0.75 : 0.55);
    var speed = speedNow(state);
    state.balls.push({
      id: state.nextBallId++,
      x: pose.x,
      y: pose.y,
      vx: Math.cos(pose.angle) * speed,
      vy: Math.sin(pose.angle) * speed,
      aim: AIM_INTERVAL,
      near: false
    });
  }

  function createGame(opts) {
    opts = opts || {};
    return {
      rng: opts.rng || Math.random,
      phase: 'idle',
      time: 0,
      lives: MAX_LIVES,
      shieldsBroken: 0,
      nearMisses: 0,
      swaps: 0,
      hits: 0,
      surgeOn: false,
      nextBallId: 1,
      nextSpawnIndex: 0,
      input: { x: 0, y: 0 },
      player: { x: W / 2, y: H - 70, invuln: 0, swapCd: 0 },
      shields: [],
      balls: [],
      events: [],
      result: null
    };
  }

  function start(state) {
    if (!state) return false;
    state.phase = 'playing';
    state.time = 0;
    state.lives = MAX_LIVES;
    state.shieldsBroken = 0;
    state.nearMisses = 0;
    state.swaps = 0;
    state.hits = 0;
    state.surgeOn = false;
    state.nextBallId = 1;
    state.nextSpawnIndex = 0;
    state.input = { x: 0, y: 0 };
    state.player = { x: W / 2, y: H - 70, invuln: 0, swapCd: 0 };
    state.shields = buildShields(state);
    state.balls = [];
    state.events = [];
    state.result = null;
    spawnBall(state, true);
    emit(state, 'start');
    return true;
  }

  function setInput(state, x, y) {
    if (!state) return false;
    state.input.x = Number(x) || 0;
    state.input.y = Number(y) || 0;
    return true;
  }

  function finish(state, reason) {
    if (state.phase === 'finished') return;
    state.phase = 'finished';
    var time = Math.round(state.time * 10) / 10;
    var score = Math.floor(state.time * 10) + state.nearMisses * 25;
    if (reason === 'clear') score += state.lives * 150;
    var rank;
    if (reason === 'clear') rank = state.lives === 3 ? 'S' : (state.lives === 2 ? 'A' : 'B');
    else rank = state.time >= 30 ? 'B' : (state.time >= 15 ? 'C' : 'D');
    state.result = {
      reason: reason,
      time: time,
      score: score,
      rank: rank,
      lives: state.lives,
      nearMisses: state.nearMisses,
      shieldsBroken: state.shieldsBroken,
      shieldsLeft: state.shields.length,
      swaps: state.swaps,
      hits: state.hits
    };
    emit(state, 'finish', { reason: reason });
  }

  function scoreOf(state) {
    if (!state) return 0;
    if (state.phase === 'finished' && state.result) return state.result.score;
    return Math.floor(state.time * 10) + state.nearMisses * 25;
  }

  function bounceWalls(state, ball) {
    var minX = MARGIN + BALL_R;
    var maxX = W - MARGIN - BALL_R;
    var minY = MARGIN + BALL_R;
    var maxY = H - MARGIN - BALL_R;
    if (ball.x < minX) { ball.x = minX; ball.vx = Math.abs(ball.vx); deflect(state, ball, 0.08); }
    else if (ball.x > maxX) { ball.x = maxX; ball.vx = -Math.abs(ball.vx); deflect(state, ball, 0.08); }
    if (ball.y < minY) { ball.y = minY; ball.vy = Math.abs(ball.vy); deflect(state, ball, 0.08); }
    else if (ball.y > maxY) { ball.y = maxY; ball.vy = -Math.abs(ball.vy); deflect(state, ball, 0.08); }
  }

  function collideShields(state, ball) {
    for (var i = state.shields.length - 1; i >= 0; i--) {
      var sh = state.shields[i];
      var hx = clamp(ball.x, sh.x - sh.w / 2, sh.x + sh.w / 2);
      var hy = clamp(ball.y, sh.y - sh.h / 2, sh.y + sh.h / 2);
      var dx = ball.x - hx;
      var dy = ball.y - hy;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

      state.shields.splice(i, 1);
      state.shieldsBroken++;
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx = dx >= 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
        ball.x = dx >= 0 ? sh.x + sh.w / 2 + BALL_R + 0.5 : sh.x - sh.w / 2 - BALL_R - 0.5;
      } else {
        ball.vy = dy >= 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
        ball.y = dy >= 0 ? sh.y + sh.h / 2 + BALL_R + 0.5 : sh.y - sh.h / 2 - BALL_R - 0.5;
      }
      deflect(state, ball, 0.1);
      emit(state, 'break', { x: sh.x, y: sh.y, color: sh.color, row: sh.row });
      return;
    }
  }

  function hitPlayer(state) {
    state.lives--;
    state.hits++;
    state.player.invuln = INVULN;
    emit(state, 'hit', { x: state.player.x, y: state.player.y, lives: state.lives });
    if (state.lives <= 0) {
      finish(state, 'down');
      return;
    }
    // 被弾後は全ボールを上に戻し、立て直しの猶予を作る
    for (var i = 0; i < state.balls.length; i++) resetBall(state, state.balls[i], 0.55);
  }

  function nearMiss(state, ball) {
    var p = state.player;
    if (p.invuln > 0) return;
    var half = PLAYER_SIZE / 2;
    var hx = clamp(ball.x, p.x - half, p.x + half);
    var hy = clamp(ball.y, p.y - half, p.y + half);
    var dx = ball.x - hx;
    var dy = ball.y - hy;
    var d = len2(dx, dy);
    if (!ball.near && d <= BALL_R + NEAR_PAD) {
      ball.near = true;
      state.nearMisses++;
      emit(state, 'near', { x: ball.x, y: ball.y });
    } else if (d > BALL_R + NEAR_PAD + 18) {
      ball.near = false;
    }
  }

  function collidePlayer(state, ball) {
    var p = state.player;
    if (p.invuln > 0) return false;
    var half = PLAYER_SIZE / 2;
    var hx = clamp(ball.x, p.x - half, p.x + half);
    var hy = clamp(ball.y, p.y - half, p.y + half);
    var dx = ball.x - hx;
    var dy = ball.y - hy;
    if (dx * dx + dy * dy > BALL_R * BALL_R) return false;
    hitPlayer(state);
    return true;
  }

  function moveBall(state, ball, dt, speed) {
    ball.aim -= dt;
    if (ball.aim <= 0) {
      ball.aim += AIM_INTERVAL;
      var cur = Math.atan2(ball.vy, ball.vx);
      var desired = Math.atan2(state.player.y - ball.y, state.player.x - ball.x);
      var diff = normAngle(desired - cur);
      // すでに自分へ向かっているときだけ、わずかに補正する
      if (Math.abs(diff) < AIM_RANGE) {
        cur += clamp(diff, -AIM_TURN, AIM_TURN);
        ball.vx = Math.cos(cur) * speed;
        ball.vy = Math.sin(cur) * speed;
      }
    }

    var sp = len2(ball.vx, ball.vy) || 1;
    ball.vx = ball.vx / sp * speed;
    ball.vy = ball.vy / sp * speed;

    var steps = Math.max(1, Math.ceil(speed * dt / 6));
    var sub = dt / steps;
    for (var s = 0; s < steps; s++) {
      ball.x += ball.vx * sub;
      ball.y += ball.vy * sub;
      bounceWalls(state, ball);
      collideShields(state, ball);
      if (collidePlayer(state, ball)) {
        if (state.phase !== 'playing') return;
        // 被弾でボール位置が戻ったので、このフレームは終了
        return;
      }
      nearMiss(state, ball);
    }
  }

  function update(state, dt) {
    if (!state) return;
    dt = clamp(dt, 0, MAX_DT);
    if (state.phase !== 'playing') return;

    state.time += dt;
    var p = state.player;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.swapCd > 0) p.swapCd = Math.max(0, p.swapCd - dt);

    var ix = state.input.x;
    var iy = state.input.y;
    var m = len2(ix, iy);
    if (m > 0.0001) {
      ix /= m;
      iy /= m;
      var half = PLAYER_SIZE / 2;
      p.x = clamp(p.x + ix * PLAYER_SPEED * dt, MARGIN + half, W - MARGIN - half);
      p.y = clamp(p.y + iy * PLAYER_SPEED * dt, MARGIN + half, H - MARGIN - half);
    }

    var surge = isSurge(state);
    if (surge && !state.surgeOn) emit(state, 'surge');
    state.surgeOn = surge;

    while (state.nextSpawnIndex < BALL_SPAWN_TIMES.length &&
           state.time >= BALL_SPAWN_TIMES[state.nextSpawnIndex] &&
           state.balls.length < MAX_BALLS) {
      spawnBall(state, false);
      state.nextSpawnIndex++;
    }

    var speed = speedNow(state);
    for (var i = 0; i < state.balls.length; i++) {
      moveBall(state, state.balls[i], dt, speed);
      if (state.phase !== 'playing') break;
    }

    if (state.phase === 'playing' && state.time >= DURATION) finish(state, 'clear');
  }

  function swap(state) {
    if (!state || state.phase !== 'playing') return false;
    var p = state.player;
    if (p.swapCd > 0 || state.shields.length === 0) return false;

    var best = null;
    var bestScore = -Infinity;
    for (var i = 0; i < state.shields.length; i++) {
      var sh = state.shields[i];
      var nearest = Infinity;
      for (var j = 0; j < state.balls.length; j++) {
        var d = len2(sh.x - state.balls[j].x, sh.y - state.balls[j].y);
        if (d < nearest) nearest = d;
      }
      var pd = len2(sh.x - p.x, sh.y - p.y);
      var score = nearest - pd * 0.06;
      if (score > bestScore) { bestScore = score; best = sh; }
    }
    if (!best) return false;

    p.x = best.x;
    p.y = best.y;
    p.swapCd = SWAP_CD;
    p.invuln = Math.max(p.invuln, SWAP_INVULN);
    state.shields.splice(state.shields.indexOf(best), 1);
    state.swaps++;
    for (j = 0; j < state.balls.length; j++) state.balls[j].near = false;
    emit(state, 'swap', { x: best.x, y: best.y });
    return true;
  }

  function nearestBallDistance(state) {
    var p = state.player;
    var nearest = Infinity;
    for (var i = 0; i < state.balls.length; i++) {
      var d = len2(state.balls[i].x - p.x, state.balls[i].y - p.y);
      if (d < nearest) nearest = d;
    }
    return nearest;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase !== 'playing') return;

    var p = state.player;
    var half = PLAYER_SIZE / 2;
    var dirs = [
      [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
      [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]
    ];
    var horizon = 0.24;
    var bestScore = -Infinity;
    var bx = 0;
    var by = 0;

    for (var k = 0; k < dirs.length; k++) {
      var dx = dirs[k][0];
      var dy = dirs[k][1];
      var m = len2(dx, dy);
      if (m > 0) { dx /= m; dy /= m; }
      var nx = clamp(p.x + dx * PLAYER_SPEED * horizon, MARGIN + half, W - MARGIN - half);
      var ny = clamp(p.y + dy * PLAYER_SPEED * horizon, MARGIN + half, H - MARGIN - half);
      var score = 0;
      for (var i = 0; i < state.balls.length; i++) {
        var b = state.balls[i];
        var d = len2(nx - b.x, ny - b.y);
        score += Math.min(d, 320);
        var tx = nx - b.x;
        var ty = ny - b.y;
        var tl = len2(tx, ty) || 1;
        var toward = (b.vx * tx + b.vy * ty) / tl;
        if (toward > 0) score -= toward * 0.9;
      }
      score -= (Math.abs(nx - W / 2) + Math.abs(ny - H / 2)) * 0.005;
      if (score > bestScore) { bestScore = score; bx = dx; by = dy; }
    }

    setInput(state, bx, by);

    if (nearestBallDistance(state) < 58 && p.swapCd <= 0 && state.shields.length > 0) {
      swap(state);
    }
  }

  function snapshot(state) {
    if (!state) return null;
    var p = state.player;
    return {
      phase: state.phase,
      over: state.phase === 'finished',
      time: state.time,
      duration: DURATION,
      timeLeft: Math.max(0, DURATION - state.time),
      lives: state.lives,
      maxLives: MAX_LIVES,
      score: scoreOf(state),
      nearMisses: state.nearMisses,
      shieldsBroken: state.shieldsBroken,
      shields: state.shields.length,
      swaps: state.swaps,
      hits: state.hits,
      swapReady: p.swapCd <= 0 && state.shields.length > 0,
      swapCd: p.swapCd,
      surge: state.surgeOn,
      player: { x: p.x, y: p.y, size: PLAYER_SIZE, invuln: p.invuln },
      balls: state.balls.map(function (b) {
        return { id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy };
      }),
      result: state.result
    };
  }

  return {
    W: W,
    H: H,
    MARGIN: MARGIN,
    PLAYER_SIZE: PLAYER_SIZE,
    BALL_R: BALL_R,
    DURATION: DURATION,
    MAX_LIVES: MAX_LIVES,
    PLAYER_SPEED: PLAYER_SPEED,
    MAX_BALLS: MAX_BALLS,
    BALL_SPAWN_TIMES: BALL_SPAWN_TIMES,
    SWAP_CD: SWAP_CD,
    SHIELD_ROWS: SHIELD_ROWS,
    SHIELD_COLS: SHIELD_COLS,
    ROW_COLORS: ROW_COLORS,
    createGame: createGame,
    start: start,
    update: update,
    setInput: setInput,
    swap: swap,
    autoStep: autoStep,
    snapshot: snapshot,
    scoreOf: scoreOf,
    mulberry32: mulberry32
  };
});
