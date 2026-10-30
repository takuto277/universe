(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchoolChairDriftEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LAPS = 3;
  var CHAIR_R = 0.38;
  var ITEMS = ['milk', 'eraser', 'tray'];
  var LATERAL_ACCEL = 18;
  var LATERAL_FRICTION = 5.4;
  var DRIFT_FRICTION = 2.1;
  var DRIFT_CHARGE_RATE = 0.36;
  var TIME_LIMIT = 150;
  var MILK_TIME = 2.2;
  var TRAP_LIFE = 14;

  function obstacle(s, off, w, h, kind) { return { s: s, off: off, w: w, h: h, kind: kind || 'desk' }; }
  function itemBox(s, off) { return { s: s, off: off }; }

  // All floors share the same footprint, but rooms and colouring differ.
  var A = 16;
  var B = 24;
  var PATH_LENGTH = Math.PI * (A + B) * 1.06;

  var STAGES = [
    {
      id: 'floor1', name: '1F 昇降口〜廊下', floor: 1, a: A, b: B, length: PATH_LENGTH,
      halfWidth: 2.6, baseSpeed: 18, maxSpeed: 24,
      obstacles: [
        obstacle(12, -1.75, 1.2, 0.55, 'locker'), obstacle(24, 1.75, 0.7, 0.7, 'bucket'),
        obstacle(37, -1.75, 1.3, 0.65, 'desk'), obstacle(49, 1.75, 0.9, 0.6, 'cart'),
        obstacle(62, -1.7, 0.6, 0.6, 'plant'), obstacle(75, 1.7, 1.2, 0.55, 'locker'),
        obstacle(90, -1.75, 0.7, 0.7, 'bucket'), obstacle(104, 1.7, 1.3, 0.65, 'desk'),
        obstacle(116, -1.7, 0.9, 0.6, 'cart')
      ],
      itemBoxes: [itemBox(8, 0), itemBox(31, -0.7), itemBox(57, 0.8), itemBox(83, 0), itemBox(108, -0.7)]
    },
    {
      id: 'floor2', name: '2F 特別教室', floor: 2, a: A, b: B, length: PATH_LENGTH,
      halfWidth: 2.6, baseSpeed: 20, maxSpeed: 26,
      obstacles: [
        obstacle(10, -1.8, 1.1, 0.65, 'desk'), obstacle(23, 1.8, 1.1, 0.65, 'desk'),
        obstacle(36, -1.75, 0.7, 0.7, 'bucket'), obstacle(50, 1.75, 0.9, 0.6, 'cart'),
        obstacle(63, -1.7, 0.6, 0.6, 'plant'), obstacle(77, 1.7, 1.2, 0.55, 'locker'),
        obstacle(91, -1.75, 1.3, 0.65, 'desk'), obstacle(105, 1.7, 0.7, 0.7, 'bucket'),
        obstacle(117, -1.7, 0.9, 0.6, 'cart')
      ],
      itemBoxes: [itemBox(6, 0), itemBox(29, 0.8), itemBox(55, -0.8), itemBox(82, 0), itemBox(111, 0.8)]
    },
    {
      id: 'floor3', name: '3F 渡り廊下', floor: 3, a: A, b: B, length: PATH_LENGTH,
      halfWidth: 2.6, baseSpeed: 22, maxSpeed: 28,
      obstacles: [
        obstacle(9, -1.8, 1.2, 0.55, 'locker'), obstacle(22, 1.8, 1.2, 0.55, 'locker'),
        obstacle(35, -1.75, 0.7, 0.7, 'bucket'), obstacle(48, 1.75, 0.9, 0.6, 'cart'),
        obstacle(62, -1.7, 0.6, 0.6, 'plant'), obstacle(76, 1.7, 1.2, 0.6, 'desk'),
        obstacle(90, -1.75, 1.3, 0.65, 'desk'), obstacle(103, 1.7, 0.7, 0.7, 'bucket'),
        obstacle(116, -1.7, 0.9, 0.6, 'cart'), obstacle(124, 0, 1.1, 0.65, 'desk')
      ],
      itemBoxes: [itemBox(5, 0), itemBox(28, -0.8), itemBox(54, 0.8), itemBox(80, 0), itemBox(109, -0.8)]
    }
  ];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function wrapS(s, length) { while (s < 0) s += length; while (s >= length) s -= length; return s; }

  function coursePoint(stage, s) {
    var t = (s / stage.length) * Math.PI * 2 + Math.PI / 2;
    return { x: Math.cos(t) * stage.a, z: Math.sin(t) * stage.b, t: t };
  }
  function courseTangent(stage, s) {
    var t = (s / stage.length) * Math.PI * 2 + Math.PI / 2;
    var dx = -Math.sin(t) * stage.a;
    var dz = Math.cos(t) * stage.b;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    return { x: dx / len, z: dz / len };
  }
  function courseNormal(stage, s) {
    var t = courseTangent(stage, s);
    return { x: -t.z, z: t.x };
  }

  function makeRacer(stage, id, team, lane, isPlayer) {
    return {
      id: id, team: team, isPlayer: !!isPlayer,
      s: 0, lap: 0, x: lane,
      vx: 0, speed: stage.baseSpeed, steer: 0,
      drift: 0, drifting: false, boost: 0, shield: 0, spin: 0,
      item: null, itemTimer: 0, finished: false, finishOrder: 0, crash: 0,
      aiLane: lane * 0.75, aiPhase: Math.random() * Math.PI * 2
    };
  }

  function createGame(options) {
    options = options || {};
    var stageIndex = clamp(Number(options.stage) || 0, 0, STAGES.length - 1);
    var stage = STAGES[stageIndex];
    var racers = [
      makeRacer(stage, 'player', 'player', -1.35, true),
      makeRacer(stage, 'cpu1', 'cpu', -0.45, false),
      makeRacer(stage, 'cpu2', 'cpu', 0.55, false),
      makeRacer(stage, 'cpu3', 'cpu', 1.45, false)
    ];
    racers[1].s = 0.9;
    racers[2].s = 1.5;
    racers[3].s = 2.1;
    var boxes = [];
    for (var i = 0; i < stage.itemBoxes.length; i++) {
      var b = stage.itemBoxes[i];
      boxes.push({ s: b.s, x: b.off, cooldown: 0 });
    }
    return {
      phase: 'countdown', paused: false, countdown: 3.2,
      stage: stageIndex, stageTotal: STAGES.length, stageName: stage.name,
      laps: LAPS, stageLength: stage.length, raceTime: 0, finishCount: 0,
      place: 0, winner: null, reason: null,
      racers: racers, itemBoxes: boxes, traps: [], obstacles: stage.obstacles.slice(),
      events: []
    };
  }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 100) s.events.shift();
  }
  function stage(s) { return STAGES[s.stage]; }
  function playerOf(s) { return s.racers[0]; }
  function progressOf(r) {
    return r.finished ? LAPS * 1000000 + (100000 - r.finishOrder) : r.lap * 1000000 + r.s;
  }
  function standings(s) {
    return s.racers.slice().sort(function (a, b) {
      if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return progressOf(b) - progressOf(a);
    });
  }
  function playerPlace(s) {
    var list = standings(s);
    for (var i = 0; i < list.length; i++) if (list[i].isPlayer) return i + 1;
    return 0;
  }

  function setSteer(s, value) {
    if (!s || s.phase !== 'playing') return;
    playerOf(s).steer = clamp(Number(value) || 0, -1, 1);
  }

  function useItemFor(s, r) {
    if (!r || !r.item || r.finished) return false;
    var item = r.item;
    r.item = null; r.itemTimer = 0;
    if (item === 'milk') {
      r.boost = MILK_TIME;
      event(s, 'itemUse', { id: r.id, item: item });
    } else if (item === 'tray') {
      r.shield = 6;
      event(s, 'itemUse', { id: r.id, item: item });
    } else {
      s.traps.push({ s: wrapS(r.s - 2.5, stage(s).length), x: r.x, life: TRAP_LIFE, owner: r.id });
      event(s, 'itemUse', { id: r.id, item: item });
    }
    return true;
  }
  function useItem(s, id) {
    if (!s || s.phase !== 'playing') return false;
    for (var i = 0; i < s.racers.length; i++) {
      if (s.racers[i].id === id) {
        if (!s.racers[i].isPlayer) return false;
        return useItemFor(s, s.racers[i]);
      }
    }
    return false;
  }

  function pickupItem(s, r, box) {
    r.item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    r.itemTimer = r.isPlayer ? 0 : 1.4 + Math.random() * 2.8;
    box.cooldown = 3.8;
    event(s, 'itemBox', { id: r.id, item: r.item });
  }

  function hitTrap(s, r, trap, index) {
    var st = stage(s);
    var ds = Math.abs(wrapS(r.s - trap.s, st.length));
    if (ds > 1.3 || Math.abs(r.x - trap.x) > 0.85) return false;
    s.traps.splice(index, 1);
    if (r.shield > 0) {
      r.shield = 0;
      event(s, 'shieldBlock', { id: r.id });
    } else {
      r.spin = 0.95;
      r.speed = Math.max(6, r.speed * 0.42);
      event(s, 'trapHit', { id: r.id });
    }
    return true;
  }

  function checkCourse(s, r) {
    var st = stage(s);
    var limit = st.halfWidth - CHAIR_R;
    if (r.x < -limit) {
      r.x = -limit;
      if (r.vx < 0) r.vx = -r.vx * 0.45;
      r.speed = Math.max(8, r.speed * 0.75);
      event(s, 'wall', { id: r.id, side: 'left' });
    } else if (r.x > limit) {
      r.x = limit;
      if (r.vx > 0) r.vx = -r.vx * 0.45;
      r.speed = Math.max(8, r.speed * 0.75);
      event(s, 'wall', { id: r.id, side: 'right' });
    }
    if (r.crash > 0) r.crash -= 1 / 60;
    for (var i = 0; i < s.obstacles.length; i++) {
      var o = s.obstacles[i];
      var ds = Math.abs(wrapS(r.s - o.s, st.length));
      if (ds > (o.h || 0.6) / 2 + CHAIR_R) continue;
      if (Math.abs(r.x - o.off) > (o.w || 1) / 2 + CHAIR_R) continue;
      if (r.crash > 0) continue;
      r.crash = 0.6;
      r.speed = Math.max(7, r.speed * 0.5);
      r.x += r.x < o.off ? -0.55 : 0.55;
      event(s, 'crash', { id: r.id, kind: o.kind });
      break;
    }
    for (i = 0; i < s.itemBoxes.length; i++) {
      var b = s.itemBoxes[i];
      if (b.cooldown > 0) continue;
      var bds = Math.abs(wrapS(r.s - b.s, st.length));
      if (bds < 1.4 && Math.abs(r.x - b.x) < 1.2) pickupItem(s, r, b);
    }
    for (i = s.traps.length - 1; i >= 0; i--) if (hitTrap(s, r, s.traps[i], i)) break;
  }

  function advanceRacer(s, r, dt) {
    var st = stage(s);
    r.s += r.speed * dt;
    while (r.s >= st.length) {
      r.s -= st.length;
      r.lap++;
      if (r.lap >= LAPS) {
        r.finished = true; r.lap = LAPS; r.s = 0;
        r.finishOrder = ++s.finishCount;
        event(s, 'finish', { id: r.id, order: r.finishOrder });
        break;
      }
      event(s, 'lap', { id: r.id, lap: r.lap + 1 });
    }
  }

  function updatePlayer(s, r, dt) {
    var st = stage(s);
    var max = st.maxSpeed + (r.boost > 0 ? 7 : 0);
    if (r.boost > 0) r.boost = Math.max(0, r.boost - dt);
    if (r.shield > 0) r.shield = Math.max(0, r.shield - dt);
    if (r.spin > 0) {
      r.spin = Math.max(0, r.spin - dt);
      r.speed = Math.max(6, r.speed * Math.exp(-3.2 * dt));
      r.vx *= Math.exp(-4.5 * dt);
    } else {
      r.speed += (max - r.speed) * 1.25 * dt;
      r.vx += r.steer * LATERAL_ACCEL * dt;
    }
    r.drifting = r.spin <= 0 && Math.abs(r.vx) > 2.2 && Math.abs(r.steer) > 0.35 && r.speed > 10;
    var friction = r.drifting ? DRIFT_FRICTION : LATERAL_FRICTION;
    r.vx *= Math.exp(-friction * dt);
    r.x += r.vx * dt;
    if (r.drifting) {
      r.drift = Math.min(1, r.drift + DRIFT_CHARGE_RATE * dt);
      if (r.drift >= 1) { r.drift = 0; r.boost = 1.25; event(s, 'boost', { id: r.id }); }
    } else r.drift = Math.max(0, r.drift - 0.08 * dt);
    checkCourse(s, r);
  }

  function updateCpu(s, r, dt) {
    var st = stage(s);
    var p = playerOf(s);
    var target = r.aiLane + Math.sin(s.raceTime * 0.7 + r.aiPhase) * 0.5;
    r.steer = clamp((target - r.x) / 1.3, -1, 1);
    var playerProgress = p.lap * st.length + p.s;
    var selfProgress = r.lap * st.length + r.s;
    var rubber = selfProgress < playerProgress - 12 ? 0.08 : (selfProgress > playerProgress + 16 ? -0.06 : 0);
    var max = st.maxSpeed * (0.94 + rubber) + (r.boost > 0 ? 5 : 0);
    if (r.boost > 0) r.boost = Math.max(0, r.boost - dt);
    if (r.shield > 0) r.shield = Math.max(0, r.shield - dt);
    if (r.spin > 0) {
      r.spin = Math.max(0, r.spin - dt);
      r.speed = Math.max(6, r.speed * Math.exp(-3.2 * dt));
    } else {
      r.speed += (max - r.speed) * 0.72 * dt;
      r.vx += r.steer * LATERAL_ACCEL * 0.82 * dt;
    }
    r.vx *= Math.exp(-LATERAL_FRICTION * dt);
    r.x += r.vx * dt;
    checkCourse(s, r);
    if (r.item) {
      r.itemTimer -= dt;
      if (r.itemTimer <= 0) useItemFor(s, r);
    }
  }

  function collideRacers(s) {
    for (var i = 0; i < s.racers.length; i++) {
      var a = s.racers[i];
      if (a.finished) continue;
      for (var j = i + 1; j < s.racers.length; j++) {
        var b = s.racers[j];
        if (b.finished) continue;
        var ds = Math.abs(wrapS(a.s - b.s, stage(s).length));
        if (ds > 1.0) continue;
        var dx = b.x - a.x;
        if (Math.abs(dx) > 0.8) continue;
        var push = (0.8 - Math.abs(dx)) * 0.35 * (dx >= 0 ? 1 : -1);
        a.x -= push * 0.5; b.x += push * 0.5;
        a.vx -= push * 2; b.vx += push * 2;
        a.speed *= 0.96; b.speed *= 0.96;
        event(s, 'bump', {});
        break;
      }
    }
  }

  function update(s, dt) {
    if (!s || s.paused || s.phase === 'clear' || s.phase === 'over') return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    if (s.phase === 'countdown') {
      s.countdown -= dt;
      if (s.countdown <= 0) { s.countdown = 0; s.phase = 'playing'; event(s, 'go', {}); }
      return s;
    }
    s.raceTime += dt;
    if (s.raceTime > TIME_LIMIT) {
      s.phase = 'over'; s.reason = 'timeup'; event(s, 'timeup', {}); return s;
    }
    for (var i = 0; i < s.racers.length; i++) {
      var r = s.racers[i];
      if (r.finished) continue;
      if (r.isPlayer) updatePlayer(s, r, dt); else updateCpu(s, r, dt);
      if (!r.finished) advanceRacer(s, r, dt);
    }
    for (i = 0; i < s.itemBoxes.length; i++) if (s.itemBoxes[i].cooldown > 0) s.itemBoxes[i].cooldown = Math.max(0, s.itemBoxes[i].cooldown - dt);
    for (i = s.traps.length - 1; i >= 0; i--) {
      s.traps[i].life -= dt;
      if (s.traps[i].life <= 0) s.traps.splice(i, 1);
    }
    collideRacers(s);
    var player = playerOf(s);
    if (player.finished) {
      s.place = player.finishOrder;
      if (s.place === 1) { s.phase = 'clear'; s.winner = 'player'; s.reason = 'first'; }
      else { s.phase = 'over'; s.winner = 'cpu'; s.reason = 'place'; }
      event(s, 'raceover', { place: s.place, winner: s.winner });
    }
    return s;
  }

  function setPaused(s, paused) {
    if (!s || s.phase === 'over' || s.phase === 'clear') return;
    s.paused = !!paused;
  }

  function getState(s) {
    if (!s) return null;
    var st = stage(s);
    var p = playerOf(s);
    return {
      id: 'school-chair-drift', phase: s.phase, paused: s.paused,
      countdown: s.countdown, stage: s.stage, stageTotal: s.stageTotal,
      stageName: s.stageName, laps: s.laps, stageLength: s.stageLength,
      raceTime: s.raceTime, place: playerPlace(s),
      lap: Math.min(LAPS, p.lap + 1),
      progress: clamp((p.lap * st.length + p.s) / (LAPS * st.length), 0, 1),
      player: { s: p.s, lap: p.lap, x: p.x, speed: p.speed, vx: p.vx, drift: p.drift, drifting: p.drifting, boost: p.boost, shield: p.shield, spin: p.spin, item: p.item, finished: p.finished },
      racers: s.racers, itemBoxes: s.itemBoxes, traps: s.traps, obstacles: s.obstacles,
      winner: s.winner, reason: s.reason, over: s.phase === 'over', clear: s.phase === 'clear'
    };
  }

  function consumeEvents(s) { return s ? s.events.splice(0, s.events.length) : []; }

  return {
    LAPS: LAPS, STAGES: STAGES, CHAIR_R: CHAIR_R,
    coursePoint: coursePoint, courseTangent: courseTangent, courseNormal: courseNormal,
    createGame: createGame, update: update, setSteer: setSteer, useItem: useItem,
    setPaused: setPaused, getState: getState, consumeEvents: consumeEvents
  };
});
