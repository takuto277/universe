/* engine.js : 重力フリップのコアロジック（UI非依存）
 *
 * ルール:
 *   - プレイヤーは画面左寄りに固定。床か天井に張り付いて前へ進む
 *   - 反転すると重力が上下入れ替わり、逆側の面へ移動する
 *   - トゲに当たると即終了。距離とコインでスコアが伸びる
 *   - 進むほど速度とトゲの頻度が上がる。トゲの間隔は速度に比例させ、
 *     反転にかかる時間(約0.45秒)を確保して理不尽にならないようにする
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GravityFlipEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BASE_SPEED = 280;
  var MAX_SPEED = 600;
  var SPEED_RAMP = 0.010;
  var RAMP_DISTANCE = 20000;
  var GRAVITY = 2600;
  var FLIP_IMPULSE = 340;
  var MAX_FALL = 1500;
  var PLAYER_SIZE = 30;
  var PLAYER_HALF = PLAYER_SIZE / 2;
  var HIT_HALF = 11;
  var MAX_DT = 0.05;
  var SPIKE_BASE = 24;
  var COIN_OFFSET = 26;
  var COIN_RADIUS = 9;
  var MAX_EVENTS = 80;

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function difficulty(state) {
    return clamp(state.distance / RAMP_DISTANCE, 0, 1);
  }

  function opposite(side) {
    return side === 'floor' ? 'ceiling' : 'floor';
  }

  function currentSide(state) {
    return state.gravity > 0 ? 'floor' : 'ceiling';
  }

  function coinY(state, side) {
    return side === 'floor' ? state.floorY - COIN_OFFSET : state.ceilY + COIN_OFFSET;
  }

  function pushEvent(state, event) {
    if (state.events.length >= MAX_EVENTS) state.events.shift();
    state.events.push(event);
  }

  function setBounds(state, width, height) {
    state.width = Math.max(260, Number(width) || 960);
    state.height = Math.max(260, Number(height) || 540);
    var margin = clamp(state.height * 0.12, 42, 80);
    state.ceilY = margin;
    state.floorY = state.height - margin;
    state.playerX = clamp(state.width * 0.2, 84, 150);

    if (state.onSurface === 'floor') {
      state.y = state.floorY - PLAYER_HALF;
    } else if (state.onSurface === 'ceiling') {
      state.y = state.ceilY + PLAYER_HALF;
    } else if (typeof state.y === 'number') {
      state.y = clamp(state.y, state.ceilY + PLAYER_HALF, state.floorY - PLAYER_HALF);
    }
  }

  function resetRun(state) {
    state.time = 0;
    state.distance = 0;
    state.speed = BASE_SPEED;
    state.score = 0;
    state.coinCount = 0;
    state.flips = 0;
    state.gravity = 1;
    state.vy = 0;
    state.onSurface = 'floor';
    state.y = state.floorY - PLAYER_HALF;
    state.obstacles = [];
    state.coinList = [];
    state.events = [];
    state.over = false;
    state.deathCause = null;

    /* 最初の数秒を無音にしないための導入パターン。床→天井の順に置き、
       天井側にはコインを並べて「反転すると得」を体験できるようにする */
    var openingFloor = state.playerX + 640;
    var openingCeiling = state.playerX + 1080;
    state.obstacles.push({ side: 'floor', x: openingFloor, w: SPIKE_BASE, h: 46, count: 1 });
    state.obstacles.push({ side: 'ceiling', x: openingCeiling, w: SPIKE_BASE, h: 46, count: 1 });
    for (var ci = 0; ci < 3; ci++) {
      state.coinList.push({
        x: state.playerX + 760 + ci * 34,
        side: 'ceiling',
        r: COIN_RADIUS,
        collected: false
      });
    }

    /* 自然生成は導入パターンの右側が十分離れてから始める */
    var openingRight = openingCeiling + SPIKE_BASE;
    var needed = openingRight - (state.width + 60) + state.speed * 1.0;
    state.nextSpawnAt = Math.max(340, needed);
    state.nextCoinAt = Math.max(620, state.nextSpawnAt);
  }

  function createGame(options) {
    options = options || {};
    var state = {
      rng: options.rng || Math.random,
      width: 0,
      height: 0,
      ceilY: 0,
      floorY: 0,
      playerX: 0,
      y: 0,
      vy: 0,
      gravity: 1,
      onSurface: 'floor',
      time: 0,
      distance: 0,
      speed: BASE_SPEED,
      score: 0,
      coinCount: 0,
      flips: 0,
      obstacles: [],
      coinList: [],
      events: [],
      over: false,
      deathCause: null,
      nextSpawnAt: 0,
      nextCoinAt: 0
    };
    setBounds(state, options.width || 960, options.height || 540);
    resetRun(state);
    return state;
  }

  function resize(state, width, height) {
    if (!state) return state;
    setBounds(state, width, height);
    return state;
  }

  function flip(state) {
    if (!state || state.over) return false;
    state.gravity = -state.gravity;
    state.vy = state.gravity * FLIP_IMPULSE;
    state.onSurface = null;
    state.flips++;
    pushEvent(state, {
      type: 'flip',
      x: state.playerX,
      y: state.y,
      gravity: state.gravity
    });
    return true;
  }

  function addSpike(state, side, x, w, h, count) {
    state.obstacles.push({
      side: side,
      x: x,
      w: w,
      h: h,
      count: count
    });
  }

  function spawnPattern(state) {
    var d = difficulty(state);
    var baseX = state.width + 60;
    var playerSide = currentSide(state);
    var side = state.rng() < 0.62 ? playerSide : opposite(playerSide);

    var count = 1;
    if (state.rng() < 0.22) count++;
    if (state.rng() < 0.08 + 0.12 * d) count++;
    var w = SPIKE_BASE * count + (count - 1) * 3;
    var h = 36 + d * 18 + state.rng() * 10;
    addSpike(state, side, baseX, w, h, count);

    var right = w;
    var pairChance = 0.28 + 0.4 * d;
    if (state.rng() < pairChance) {
      var pairSeconds = 0.82 - 0.10 * d;
      var offset = w + state.speed * pairSeconds;
      var count2 = 1 + (state.rng() < 0.18 ? 1 : 0);
      var w2 = SPIKE_BASE * count2 + (count2 - 1) * 3;
      addSpike(state, opposite(side), baseX + offset, w2, h, count2);
      right = offset + w2;
    }
    return right;
  }

  function spawnInterval(state) {
    var d = difficulty(state);
    var seconds = 1.02 - 0.26 * d + state.rng() * 0.16;
    return Math.max(0.62, seconds);
  }

  function sideBlocked(state, side, x0, x1) {
    for (var i = 0; i < state.obstacles.length; i++) {
      var o = state.obstacles[i];
      if (o.side === side && o.x < x1 && o.x + o.w > x0) return true;
    }
    return false;
  }

  function spawnCoins(state) {
    var count = 4;
    var spacing = 34;
    var startX = state.width + 140;
    var endX = startX + (count - 1) * spacing;
    var side = state.rng() < 0.5 ? 'floor' : 'ceiling';
    if (sideBlocked(state, side, startX - 24, endX + 24)) {
      side = opposite(side);
      if (sideBlocked(state, side, startX - 24, endX + 24)) return 0;
    }
    for (var i = 0; i < count; i++) {
      state.coinList.push({
        x: startX + i * spacing,
        side: side,
        r: COIN_RADIUS,
        collected: false
      });
    }
    return (count - 1) * spacing;
  }

  function hitsSpike(state, o) {
    var top = state.y - HIT_HALF;
    var bottom = state.y + HIT_HALF;
    var cx = o.x + o.w / 2;

    if (o.side === 'floor') {
      var aboveFloor = state.floorY - bottom;
      if (aboveFloor > o.h) return false;
      var f = 1 - Math.max(0, aboveFloor) / o.h;
      var halfW = (o.w / 2) * f;
      return Math.abs(state.playerX - cx) < halfW + HIT_HALF * 0.7;
    }

    var belowCeiling = top - state.ceilY;
    if (belowCeiling > o.h) return false;
    var g = 1 - Math.max(0, belowCeiling) / o.h;
    var halfW2 = (o.w / 2) * g;
    return Math.abs(state.playerX - cx) < halfW2 + HIT_HALF * 0.7;
  }

  function killPlayer(state) {
    state.over = true;
    state.deathCause = 'spike';
    state.vy = 0;
    pushEvent(state, {
      type: 'death',
      x: state.playerX,
      y: state.y
    });
  }

  function update(state, dt) {
    if (!state || state.over) return state;
    dt = clamp(Number(dt) || 0, 0, MAX_DT);
    state.time += dt;

    state.speed = BASE_SPEED + Math.min(MAX_SPEED - BASE_SPEED, state.distance * SPEED_RAMP);
    state.distance += state.speed * dt;

    state.vy = clamp(state.vy + GRAVITY * state.gravity * dt, -MAX_FALL, MAX_FALL);
    state.y += state.vy * dt;

    var top = state.ceilY + PLAYER_HALF;
    var bottom = state.floorY - PLAYER_HALF;
    if (state.y >= bottom) {
      state.y = bottom;
      if (state.vy > 0) state.vy = 0;
      if (state.gravity > 0) state.onSurface = 'floor';
      else state.onSurface = null;
    } else if (state.y <= top) {
      state.y = top;
      if (state.vy < 0) state.vy = 0;
      if (state.gravity < 0) state.onSurface = 'ceiling';
      else state.onSurface = null;
    } else {
      state.onSurface = null;
    }

    var move = state.speed * dt;
    var i;
    for (i = state.obstacles.length - 1; i >= 0; i--) {
      state.obstacles[i].x -= move;
      if (state.obstacles[i].x + state.obstacles[i].w < -40) state.obstacles.splice(i, 1);
    }
    for (i = state.coinList.length - 1; i >= 0; i--) {
      state.coinList[i].x -= move;
      if (state.coinList[i].x < -40) state.coinList.splice(i, 1);
    }

    if (state.distance >= state.nextSpawnAt) {
      var right = spawnPattern(state);
      state.nextSpawnAt = state.distance + right + state.speed * spawnInterval(state);
    }
    if (state.distance >= state.nextCoinAt) {
      var coinRight = spawnCoins(state);
      state.nextCoinAt = state.distance + coinRight + state.speed * (1.3 + state.rng() * 1.1);
    }

    for (i = 0; i < state.coinList.length; i++) {
      var c = state.coinList[i];
      if (c.collected) continue;
      var cy = coinY(state, c.side);
      if (Math.abs(c.x - state.playerX) < c.r + PLAYER_HALF * 0.9 &&
        Math.abs(cy - state.y) < c.r + PLAYER_HALF * 0.9) {
        c.collected = true;
        state.coinCount++;
        pushEvent(state, { type: 'coin', x: c.x, y: cy });
      }
    }
    for (i = state.coinList.length - 1; i >= 0; i--) {
      if (state.coinList[i].collected) state.coinList.splice(i, 1);
    }

    for (i = 0; i < state.obstacles.length; i++) {
      if (hitsSpike(state, state.obstacles[i])) {
        killPlayer(state);
        break;
      }
    }

    state.score = Math.floor(state.distance / 10) + state.coinCount * 10;
    return state;
  }

  function consumeEvents(state) {
    if (!state) return [];
    var events = state.events;
    state.events = [];
    return events;
  }

  function snapshot(state) {
    return {
      score: state.score,
      distance: Math.floor(state.distance / 10),
      speed: Math.round(state.speed),
      coins: state.coinCount,
      flips: state.flips,
      gravity: state.gravity,
      onSurface: state.onSurface,
      playerX: state.playerX,
      playerY: state.y,
      over: state.over,
      deathCause: state.deathCause,
      time: state.time,
      width: state.width,
      height: state.height,
      ceilY: state.ceilY,
      floorY: state.floorY,
      obstacles: state.obstacles.length
    };
  }

  return {
    BASE_SPEED: BASE_SPEED,
    MAX_SPEED: MAX_SPEED,
    PLAYER_SIZE: PLAYER_SIZE,
    FLIP_IMPULSE: FLIP_IMPULSE,
    COIN_RADIUS: COIN_RADIUS,
    createGame: createGame,
    resetRun: resetRun,
    resize: resize,
    flip: flip,
    update: update,
    consumeEvents: consumeEvents,
    snapshot: snapshot,
    difficulty: difficulty,
    coinY: coinY
  };
});
