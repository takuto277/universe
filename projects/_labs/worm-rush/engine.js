/* engine.js : WORM RUSH（オフラインio風ミミズゲーム） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WormRushEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WORLD_RADIUS = 2600;
  var AI_COUNT = 10;
  var FOOD_COUNT = 400;
  var START_LENGTH = 10;
  var MIN_LENGTH = 5;
  var MAX_LENGTH = 170;
  var SEG_SPACING = 7;
  var HEAD_RADIUS = 10;
  var BODY_RADIUS = 7;
  var BASE_SPEED = 102;
  var BOOST_SPEED = 176;
  var TURN_RATE = 5.4;
  var BOOST_DRAIN = 6.5;
  var AI_RESPAWN_MIN = 1.8;
  var AI_RESPAWN_MAX = 3.0;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 80;
  var AI_NAMES = ['NOODLE', 'MIMI', 'RINGO', 'SOBA', 'UDON', 'PIPI', 'MOSS', 'TOFU', 'BEAM', 'CURLY'];
  var AI_COLORS = ['#ff7bc8', '#ffd166', '#6dffb0', '#b48cff', '#ff9f43', '#7cc7ff', '#ff637d', '#9be36d'];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function rand(state, min, max) { return min + state.rng() * (max - min); }
  function angleNorm(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function approachAngle(current, target, step) {
    var diff = angleNorm(target - current);
    if (Math.abs(diff) <= step) return target;
    return current + (diff > 0 ? step : -step);
  }
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

  function pushEvent(state, event) {
    state.events.push(event);
    if (state.events.length > MAX_EVENTS) state.events.shift();
  }

  function makeSegments(length, x, y, angle) {
    var segments = [];
    for (var i = 1; i < length; i++) {
      segments.push({ x: x - Math.cos(angle) * SEG_SPACING * i, y: y - Math.sin(angle) * SEG_SPACING * i });
    }
    return segments;
  }

  function makeWorm(state, options) {
    var worm = {
      id: state.nextId++,
      name: options.name,
      isPlayer: !!options.isPlayer,
      color: options.color,
      x: options.x,
      y: options.y,
      angle: options.angle,
      targetAngle: options.angle,
      length: options.length,
      maxLength: options.length,
      segments: makeSegments(options.length, options.x, options.y, options.angle),
      alive: true,
      score: 0,
      kills: 0,
      invuln: options.invuln || 0,
      boosting: false,
      boostAccum: 0,
      thinkTimer: 0,
      respawnTimer: 0,
      aiFood: null
    };
    return worm;
  }

  function randomPoint(state, radiusFactor) {
    var angle = state.rng() * Math.PI * 2;
    var r = Math.sqrt(state.rng()) * WORLD_RADIUS * radiusFactor;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  }

  function randomNear(state, cx, cy, minR, maxR) {
    var angle = state.rng() * Math.PI * 2;
    var radius = minR + state.rng() * (maxR - minR);
    var x = cx + Math.cos(angle) * radius;
    var y = cy + Math.sin(angle) * radius;
    var d = Math.sqrt(x * x + y * y);
    if (d > WORLD_RADIUS * 0.92) {
      x *= WORLD_RADIUS * 0.92 / d;
      y *= WORLD_RADIUS * 0.92 / d;
    }
    return { x: x, y: y };
  }

  function spawnFood(state) {
    var pos = randomPoint(state, 0.94);
    var colors = ['#5df4ff', '#ffd166', '#ff7bc8', '#6dffb0', '#b48cff'];
    state.foods.push({
      id: state.nextId++,
      x: pos.x,
      y: pos.y,
      r: rand(state, 3.5, 6),
      color: colors[Math.floor(state.rng() * colors.length)],
      value: state.rng() < 0.14 ? 2 : 1,
      phase: state.rng() * Math.PI * 2
    });
  }

  function respawnAI(state, worm) {
    var center = state.player && state.player.alive ? state.player : { x: 0, y: 0 };
    var pos = null;
    for (var i = 0; i < 20; i++) {
      var candidate = randomNear(state, center.x, center.y, 300, 720);
      var safe = true;
      for (var j = 0; j < state.worms.length; j++) {
        var other = state.worms[j];
        if (!other.alive) continue;
        if (dist2(candidate.x, candidate.y, other.x, other.y) < 380 * 380) {
          safe = false;
          break;
        }
      }
      if (safe) { pos = candidate; break; }
    }
    if (!pos) pos = randomNear(state, center.x, center.y, 300, 720);
    var angle = state.rng() * Math.PI * 2;
    var length = 8 + Math.floor(state.rng() * 9);
    worm.x = pos.x;
    worm.y = pos.y;
    worm.angle = angle;
    worm.targetAngle = angle;
    worm.length = length;
    worm.maxLength = Math.max(worm.maxLength, length);
    worm.segments = makeSegments(length, pos.x, pos.y, angle);
    worm.alive = true;
    worm.invuln = 2.2;
    worm.score = 0;
    worm.kills = 0;
    worm.boosting = false;
    worm.boostAccum = 0;
    worm.thinkTimer = 0;
    worm.respawnTimer = 0;
    pushEvent(state, { type: 'respawn', worm: worm });
  }

  function reset(state) {
    state.phase = 'idle';
    state.time = 0;
    state.worms = [];
    state.foods = [];
    state.nextId = 1;
    state.player = null;
    state.events = [];
    state.over = false;
    state.result = null;
    state.leaderboard = [];
    return state;
  }

  function createGame(options) {
    options = options || {};
    var state = {
      rng: options.rng || Math.random,
      worldRadius: WORLD_RADIUS,
      aiCount: options.aiCount || AI_COUNT
    };
    reset(state);
    return state;
  }

  function start(state) {
    if (!state) return false;
    reset(state);
    state.phase = 'run';
    var angle = state.rng() * Math.PI * 2;
    state.player = makeWorm(state, {
      name: 'YOU',
      isPlayer: true,
      color: '#5df4ff',
      x: 0,
      y: 0,
      angle: angle,
      length: START_LENGTH,
      invuln: 5.5
    });
    state.worms.push(state.player);
    for (var i = 0; i < state.aiCount; i++) {
      var pos = randomNear(state, 0, 0, 260, 520);
      var a = state.rng() * Math.PI * 2;
      var ai = makeWorm(state, {
        name: AI_NAMES[i % AI_NAMES.length],
        color: AI_COLORS[i % AI_COLORS.length],
        x: pos.x,
        y: pos.y,
        angle: a,
        length: 8 + Math.floor(state.rng() * 12),
        invuln: 2
      });
      state.worms.push(ai);
    }
    for (var f = 0; f < FOOD_COUNT; f++) spawnFood(state);
    pushEvent(state, { type: 'start' });
    return true;
  }

  function setInput(state, input) {
    if (!state || !state.player || !state.player.alive) return;
    if (input && typeof input.angle === 'number' && isFinite(input.angle)) {
      state.player.targetAngle = input.angle;
    }
    if (input && 'boost' in input) state.player.boosting = !!input.boost;
  }

  function grow(state, worm, amount) {
    for (var i = 0; i < amount && worm.length < MAX_LENGTH; i++) {
      var tail = worm.segments.length ? worm.segments[worm.segments.length - 1] : { x: worm.x, y: worm.y };
      worm.segments.push({ x: tail.x, y: tail.y });
      worm.length++;
    }
  }

  function shrink(worm, amount) {
    for (var i = 0; i < amount && worm.length > MIN_LENGTH; i++) {
      worm.segments.pop();
      worm.length--;
    }
  }

  function dropFood(state, worm) {
    var drop = Math.min(18, Math.floor(worm.length / 3));
    for (var i = 0; i < drop; i++) {
      var seg = worm.segments[Math.floor(state.rng() * worm.segments.length)];
      if (!seg) seg = { x: worm.x, y: worm.y };
      state.foods.push({
        id: state.nextId++,
        x: seg.x + rand(state, -8, 8),
        y: seg.y + rand(state, -8, 8),
        r: rand(state, 3.5, 6),
        color: worm.color,
        value: 1,
        phase: state.rng() * Math.PI * 2
      });
    }
  }

  function killWorm(state, worm, killer) {
    if (!worm || !worm.alive) return;
    worm.alive = false;
    worm.boosting = false;
    dropFood(state, worm);
    if (killer && killer.alive && killer !== worm) {
      killer.kills++;
      killer.score += 50;
    }
    if (worm.isPlayer) {
      state.phase = 'over';
      state.over = true;
      state.result = {
        score: worm.score,
        length: worm.length,
        kills: worm.kills,
        time: state.time,
        rank: worm.score >= 900 ? 'LEGEND' : (worm.score >= 500 ? 'ACE' : (worm.score >= 250 ? 'HUNTER' : 'ROOKIE'))
      };
      pushEvent(state, { type: 'over', result: state.result });
    } else {
      worm.respawnTimer = rand(state, AI_RESPAWN_MIN, AI_RESPAWN_MAX);
      pushEvent(state, { type: 'death', worm: worm, killer: killer });
    }
  }

  function nearestFood(state, worm, maxDist) {
    var best = null;
    var bestD = maxDist * maxDist;
    for (var i = 0; i < state.foods.length; i++) {
      var food = state.foods[i];
      var d = dist2(worm.x, worm.y, food.x, food.y);
      if (d < bestD) {
        bestD = d;
        best = food;
      }
    }
    return best;
  }

  function thinkAI(state, worm, dt) {
    worm.thinkTimer -= dt;
    if (worm.thinkTimer > 0) return;
    worm.thinkTimer = 0.10 + state.rng() * 0.08;

    var centerDist = Math.sqrt(worm.x * worm.x + worm.y * worm.y);
    if (centerDist > WORLD_RADIUS * 0.82) {
      worm.targetAngle = Math.atan2(-worm.y, -worm.x) + (state.rng() - 0.5) * 0.5;
      worm.boosting = false;
      return;
    }

    // avoid bodies just ahead
    var avoid = null;
    var avoidD = 0;
    for (var i = 0; i < state.worms.length; i++) {
      var other = state.worms[i];
      if (!other.alive || other === worm) continue;
      for (var s = 0; s < other.segments.length; s += 2) {
        var seg = other.segments[s];
        var d = dist2(worm.x, worm.y, seg.x, seg.y);
        if (d < 135 * 135) {
          var rel = angleNorm(Math.atan2(seg.y - worm.y, seg.x - worm.x) - worm.angle);
          if (Math.abs(rel) < 0.75 && (!avoid || d < avoidD)) {
            avoid = seg;
            avoidD = d;
          }
        }
      }
    }
    if (avoid) {
      worm.targetAngle = Math.atan2(worm.y - avoid.y, worm.x - avoid.x);
      worm.boosting = false;
      return;
    }

    if (state.player && state.player.alive) {
      var pd = dist2(worm.x, worm.y, state.player.x, state.player.y);
      if (pd > 1250 * 1250) {
        worm.targetAngle = Math.atan2(state.player.y - worm.y, state.player.x - worm.x);
        worm.boosting = worm.length > 20 && pd > 1700 * 1700;
        return;
      }
    }

    var target = null;
    var targetDist = Infinity;
    for (var j = 0; j < state.worms.length; j++) {
      var rival = state.worms[j];
      if (!rival.alive || rival === worm) continue;
      var rd = dist2(worm.x, worm.y, rival.x, rival.y);
      if (rd < 310 * 310 && worm.length > rival.length + 12) {
        target = { x: rival.x, y: rival.y };
        targetDist = rd;
        break;
      }
    }
    if (!target) {
      var food = nearestFood(state, worm, 760);
      if (food) {
        target = food;
        targetDist = dist2(worm.x, worm.y, food.x, food.y);
      }
    }
    if (target) {
      worm.targetAngle = Math.atan2(target.y - worm.y, target.x - worm.x);
      worm.boosting = worm.length > 18 && targetDist < 180 * 180 && state.rng() < 0.5;
    } else {
      worm.targetAngle = worm.angle + (state.rng() - 0.5) * 1.2;
      worm.boosting = false;
    }
  }

  function updateWorm(state, worm, dt) {
    if (!worm.alive) return;
    worm.invuln = Math.max(0, worm.invuln - dt);
    worm.angle = approachAngle(worm.angle, worm.targetAngle, TURN_RATE * dt);
    var boost = worm.boosting && worm.length > MIN_LENGTH;
    var speed = boost ? BOOST_SPEED : BASE_SPEED;
    worm.x += Math.cos(worm.angle) * speed * dt;
    worm.y += Math.sin(worm.angle) * speed * dt;

    if (boost) {
      worm.boostAccum += BOOST_DRAIN * dt;
      while (worm.boostAccum >= 1 && worm.length > MIN_LENGTH) {
        worm.boostAccum -= 1;
        shrink(worm, 1);
      }
    } else {
      worm.boostAccum = 0;
    }

    // follow-the-leader body
    var px = worm.x;
    var py = worm.y;
    for (var i = 0; i < worm.segments.length; i++) {
      var seg = worm.segments[i];
      var dx = seg.x - px;
      var dy = seg.y - py;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > SEG_SPACING) {
        seg.x = px + dx / d * SEG_SPACING;
        seg.y = py + dy / d * SEG_SPACING;
      } else if (d < 0.001) {
        seg.x = px - Math.cos(worm.angle) * SEG_SPACING;
        seg.y = py - Math.sin(worm.angle) * SEG_SPACING;
      }
      px = seg.x;
      py = seg.y;
    }

    var centerDist = Math.sqrt(worm.x * worm.x + worm.y * worm.y);
    if (centerDist > WORLD_RADIUS - HEAD_RADIUS) {
      killWorm(state, worm, null);
    }
  }

  function eatFood(state, worm) {
    var hr = HEAD_RADIUS;
    for (var i = state.foods.length - 1; i >= 0; i--) {
      var food = state.foods[i];
      if (dist2(worm.x, worm.y, food.x, food.y) < (hr + food.r + 3) * (hr + food.r + 3)) {
        state.foods.splice(i, 1);
        grow(state, worm, food.value);
        worm.score += food.value * 10;
        pushEvent(state, { type: 'eat', worm: worm, value: food.value });
      }
    }
  }

  function checkCollisions(state) {
    for (var i = 0; i < state.worms.length; i++) {
      var worm = state.worms[i];
      if (!worm.alive || worm.invuln > 0) continue;
      for (var j = 0; j < state.worms.length; j++) {
        if (i === j) continue;
        var other = state.worms[j];
        if (!other.alive) continue;
        for (var s = 0; s < other.segments.length; s++) {
          var seg = other.segments[s];
          if (dist2(worm.x, worm.y, seg.x, seg.y) < (HEAD_RADIUS + BODY_RADIUS) * (HEAD_RADIUS + BODY_RADIUS)) {
            killWorm(state, worm, other);
            break;
          }
        }
        if (!worm.alive) break;
      }
    }
    // head-on collisions
    for (var a = 0; a < state.worms.length; a++) {
      var wa = state.worms[a];
      if (!wa.alive || wa.invuln > 0) continue;
      for (var b = a + 1; b < state.worms.length; b++) {
        var wb = state.worms[b];
        if (!wb.alive || wb.invuln > 0) continue;
        if (dist2(wa.x, wa.y, wb.x, wb.y) < (HEAD_RADIUS * 2) * (HEAD_RADIUS * 2)) {
          killWorm(state, wa, wb);
          killWorm(state, wb, wa);
        }
      }
    }
  }

  function buildLeaderboard(state) {
    var alive = state.worms.filter(function (w) { return w.alive; });
    alive.sort(function (a, b) {
      if (b.length !== a.length) return b.length - a.length;
      return b.score - a.score;
    });
    state.leaderboard = alive.slice(0, 5).map(function (w) {
      return { id: w.id, name: w.name, length: w.length, score: w.score, isPlayer: w.isPlayer };
    });
  }

  function update(state, dt) {
    if (!state || state.phase !== 'run') return state;
    dt = clamp(Number(dt) || 0, 0, MAX_DT);
    state.time += dt;

    for (var i = 0; i < state.worms.length; i++) {
      var worm = state.worms[i];
      if (!worm.alive) {
        if (!worm.isPlayer) {
          worm.respawnTimer -= dt;
          if (worm.respawnTimer <= 0) respawnAI(state, worm);
        }
        continue;
      }
      if (!worm.isPlayer) thinkAI(state, worm, dt);
      updateWorm(state, worm, dt);
      if (worm.alive) eatFood(state, worm);
    }

    checkCollisions(state);

    while (state.foods.length < FOOD_COUNT) spawnFood(state);
    buildLeaderboard(state);

    if (state.player && !state.player.alive && state.phase === 'run') {
      killWorm(state, state.player, null);
    }
    return state;
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase !== 'run' || !state.player || !state.player.alive) return;
    var food = nearestFood(state, state.player, 900);
    if (food) {
      state.player.targetAngle = Math.atan2(food.y - state.player.y, food.x - state.player.x);
      state.player.boosting = state.player.length > 18 && dist2(state.player.x, state.player.y, food.x, food.y) < 180 * 180;
    }
  }

  function snapshot(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      time: state.time,
      over: state.over,
      result: state.result,
      worldRadius: state.worldRadius,
      player: state.player ? {
        x: state.player.x,
        y: state.player.y,
        angle: state.player.angle,
        length: state.player.length,
        score: state.player.score,
        kills: state.player.kills,
        alive: state.player.alive
      } : null,
      aiAlive: state.worms.filter(function (w) { return w.alive && !w.isPlayer; }).length,
      leaderboard: state.leaderboard.slice(),
      worms: state.worms.map(function (w) {
        return {
          id: w.id, name: w.name, isPlayer: w.isPlayer, color: w.color,
          x: w.x, y: w.y, angle: w.angle, length: w.length, alive: w.alive,
          score: w.score, kills: w.kills
        };
      })
    };
  }

  function consumeEvents(state) {
    if (!state) return [];
    var events = state.events;
    state.events = [];
    return events;
  }

  return {
    WORLD_RADIUS: WORLD_RADIUS,
    AI_COUNT: AI_COUNT,
    FOOD_COUNT: FOOD_COUNT,
    START_LENGTH: START_LENGTH,
    MIN_LENGTH: MIN_LENGTH,
    SEG_SPACING: SEG_SPACING,
    HEAD_RADIUS: HEAD_RADIUS,
    BODY_RADIUS: BODY_RADIUS,
    createGame: createGame,
    start: start,
    setInput: setInput,
    update: update,
    autoStep: autoStep,
    snapshot: snapshot,
    consumeEvents: consumeEvents,
    mulberry32: mulberry32
  };
});
