(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchoolChairDriftEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var C = { VIEW_W: 480, VIEW_H: 800 };
  var CHAIR_R = 17;
  var LAPS = 3;
  var RACERS = 4;
  var LATERAL_ACCEL = 760;
  var LATERAL_FRICTION = 5.4;
  var DRIFT_FRICTION = 2.1;
  var DRIFT_CHARGE_RATE = 0.36;
  var TIME_LIMIT = 150;
  var ITEMS = ['milk', 'eraser', 'tray'];

  function obstacle(s, off, w, h, kind) { return { s: s, off: off, w: w, h: h, kind: kind || 'desk' }; }
  function itemBox(s, off) { return { s: s, off: off, cooldown: 0 }; }

  var STAGES = [
    {
      id: 'corridor', name: '1F 渡り廊下', length: 3000, halfWidth: 150, baseSpeed: 300, maxSpeed: 360, turns: 2,
      curveAmp: 76,
      obstacles: [
        obstacle(480, -86, 128, 50, 'locker'), obstacle(760, 92, 52, 52, 'bucket'),
        obstacle(1100, -92, 116, 50, 'desk'), obstacle(1450, 96, 76, 56, 'cart'),
        obstacle(1800, -86, 44, 44, 'plant'), obstacle(2150, 82, 124, 50, 'locker'),
        obstacle(2500, -96, 52, 52, 'bucket'), obstacle(2800, 88, 126, 50, 'desk')
      ],
      itemBoxes: [itemBox(300, 0), itemBox(850, -58), itemBox(1350, 62), itemBox(1900, 0), itemBox(2450, -58), itemBox(2850, 62)]
    },
    {
      id: 'special', name: '特別棟', length: 3800, halfWidth: 140, baseSpeed: 320, maxSpeed: 385, turns: 3,
      curveAmp: 92,
      obstacles: [
        obstacle(420, -74, 120, 50, 'locker'), obstacle(720, 84, 104, 46, 'desk'),
        obstacle(1060, -88, 52, 52, 'bucket'), obstacle(1400, 74, 76, 56, 'cart'),
        obstacle(1760, -82, 122, 50, 'locker'), obstacle(2120, 88, 44, 44, 'plant'),
        obstacle(2480, -90, 126, 50, 'desk'), obstacle(2840, 78, 52, 52, 'bucket'),
        obstacle(3200, -82, 120, 50, 'locker'), obstacle(3540, 86, 76, 56, 'cart')
      ],
      itemBoxes: [itemBox(280, 0), itemBox(800, 58), itemBox(1300, -62), itemBox(1850, 0), itemBox(2400, 58), itemBox(3000, -62), itemBox(3550, 0)]
    },
    {
      id: 'entrance', name: '3F エントランス', length: 4500, halfWidth: 130, baseSpeed: 340, maxSpeed: 410, turns: 4,
      curveAmp: 108,
      obstacles: [
        obstacle(380, -68, 118, 50, 'locker'), obstacle(680, 78, 118, 50, 'desk'),
        obstacle(1000, -82, 52, 52, 'bucket'), obstacle(1340, 68, 76, 56, 'cart'),
        obstacle(1680, -76, 120, 50, 'locker'), obstacle(2020, 82, 44, 44, 'plant'),
        obstacle(2360, -84, 76, 56, 'cart'), obstacle(2700, 72, 52, 52, 'bucket'),
        obstacle(3040, -78, 122, 50, 'desk'), obstacle(3380, 82, 76, 56, 'cart'),
        obstacle(3720, -76, 44, 44, 'plant'), obstacle(4060, 76, 120, 50, 'locker'),
        obstacle(4320, 0, 76, 56, 'cart')
      ],
      itemBoxes: [itemBox(250, 0), itemBox(700, -55), itemBox(1200, 55), itemBox(1700, 0), itemBox(2200, -55), itemBox(2750, 55), itemBox(3300, 0), itemBox(3850, -55), itemBox(4250, 55)]
    }
  ];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function wrapS(s, length) { while (s < 0) s += length; while (s >= length) s -= length; return s; }
  function trackCenter(stage, s) {
    var a = s / stage.length * Math.PI * 2;
    return C.VIEW_W / 2 + Math.sin(a * stage.turns) * stage.curveAmp + Math.sin(a * 2.0) * 10;
  }
  function stageFor(index) { return STAGES[clamp(Number(index) || 0, 0, STAGES.length - 1)]; }

  function makeRacer(stage, id, team, xOffset, isPlayer) {
    return {
      id: id,
      team: team,
      isPlayer: !!isPlayer,
      s: 0,
      lap: 0,
      x: trackCenter(stage, 0) + xOffset,
      vx: 0,
      speed: stage.baseSpeed,
      steer: 0,
      drift: 0,
      drifting: false,
      boost: 0,
      shield: 0,
      spin: 0,
      item: null,
      itemTimer: 0,
      finished: false,
      finishOrder: 0,
      crash: 0,
      aiLane: xOffset * 0.48,
      aiPhase: Math.random() * Math.PI * 2
    };
  }

  function createGame(options) {
    options = options || {};
    var stageIndex = clamp(Number(options.stage) || 0, 0, STAGES.length - 1);
    var stage = STAGES[stageIndex];
    var speeds = [0, -70, 60, 100];
    var racers = [
      makeRacer(stage, 'player', 'player', 0, true),
      makeRacer(stage, 'cpu1', 'cpu', speeds[1], false),
      makeRacer(stage, 'cpu2', 'cpu', speeds[2], false),
      makeRacer(stage, 'cpu3', 'cpu', speeds[3], false)
    ];
    var itemBoxes = [];
    for (var i = 0; i < stage.itemBoxes.length; i++) {
      var b = stage.itemBoxes[i];
      itemBoxes.push({ s: b.s, x: trackCenter(stage, b.s) + b.off, cooldown: 0 });
    }
    var obstacles = [];
    for (i = 0; i < stage.obstacles.length; i++) {
      var o = stage.obstacles[i];
      obstacles.push({ s: o.s, x: trackCenter(stage, o.s) + o.off, w: o.w, h: o.h, kind: o.kind });
    }
    return {
      phase: 'countdown',
      paused: false,
      countdown: 3.2,
      stage: stageIndex,
      stageTotal: STAGES.length,
      stageName: stage.name,
      laps: LAPS,
      stageLength: stage.length,
      raceTime: 0,
      finishCount: 0,
      place: 0,
      winner: null,
      reason: null,
      racers: racers,
      itemBoxes: itemBoxes,
      traps: [],
      obstacles: obstacles,
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
    r.item = null;
    r.itemTimer = 0;
    if (item === 'milk') {
      r.boost = 2.2;
      event(s, 'itemUse', { id: r.id, item: item });
    } else if (item === 'tray') {
      r.shield = 6;
      event(s, 'itemUse', { id: r.id, item: item });
    } else {
      var st = stage(s);
      s.traps.push({ s: wrapS(r.s - 80, st.length), x: r.x, life: 14, owner: r.id });
      event(s, 'itemUse', { id: r.id, item: item });
    }
    return true;
  }

  function useItem(s, id) {
    if (!s || s.phase !== 'playing') return false;
    var racer = null;
    for (var i = 0; i < s.racers.length; i++) if (s.racers[i].id === id) racer = s.racers[i];
    if (!racer || !racer.isPlayer) return false;
    return useItemFor(s, racer);
  }

  function pickupItem(s, r, box) {
    var item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    r.item = item;
    r.itemTimer = r.isPlayer ? 0 : 1.4 + Math.random() * 2.8;
    box.cooldown = 3.8;
    event(s, 'itemBox', { id: r.id, item: item });
  }

  function hitTrap(s, r, trap, index) {
    var st = stage(s);
    var ds = Math.abs(wrapS(r.s - trap.s, st.length));
    if (ds > 34) return false;
    if (Math.abs(r.x - trap.x) > 34) return false;
    s.traps.splice(index, 1);
    if (r.shield > 0) {
      r.shield = 0;
      event(s, 'shieldBlock', { id: r.id });
    } else {
      r.spin = 0.95;
      r.speed = Math.max(100, r.speed * 0.42);
      event(s, 'trapHit', { id: r.id });
    }
    return true;
  }

  function checkCourse(s, r) {
    var st = stage(s);
    var center = trackCenter(st, r.s);
    var left = center - st.halfWidth + CHAIR_R;
    var right = center + st.halfWidth - CHAIR_R;
    if (r.x < left) {
      r.x = left;
      if (r.vx < 0) r.vx = -r.vx * 0.45;
      r.speed = Math.max(120, r.speed * 0.75);
      event(s, 'wall', { id: r.id, side: 'left' });
    } else if (r.x > right) {
      r.x = right;
      if (r.vx > 0) r.vx = -r.vx * 0.45;
      r.speed = Math.max(120, r.speed * 0.75);
      event(s, 'wall', { id: r.id, side: 'right' });
    }

    if (r.crash > 0) r.crash -= 1 / 60;
    for (var i = 0; i < s.obstacles.length; i++) {
      var o = s.obstacles[i];
      var ds = Math.abs(wrapS(r.s - o.s, st.length));
      if (ds > o.h / 2 + CHAIR_R) continue;
      if (Math.abs(r.x - o.x) > o.w / 2 + CHAIR_R) continue;
      if (r.crash > 0) continue;
      r.crash = 0.6;
      r.speed = Math.max(120, r.speed * 0.5);
      r.x += r.x < o.x ? -18 : 18;
      event(s, 'crash', { id: r.id, kind: o.kind });
      break;
    }

    for (i = 0; i < s.itemBoxes.length; i++) {
      var b = s.itemBoxes[i];
      if (b.cooldown > 0) continue;
      var bds = Math.abs(wrapS(r.s - b.s, st.length));
      if (bds < 32 && Math.abs(r.x - b.x) < 34) pickupItem(s, r, b);
    }

    for (i = s.traps.length - 1; i >= 0; i--) {
      if (hitTrap(s, r, s.traps[i], i)) break;
    }
  }

  function advanceRacer(s, r, dt) {
    var st = stage(s);
    r.s += r.speed * dt;
    while (r.s >= st.length) {
      r.s -= st.length;
      r.lap++;
      if (r.lap >= LAPS) {
        r.finished = true;
        r.lap = LAPS;
        r.s = 0;
        r.finishOrder = ++s.finishCount;
        event(s, 'finish', { id: r.id, order: r.finishOrder });
        break;
      } else {
        event(s, 'lap', { id: r.id, lap: r.lap + 1 });
      }
    }
  }

  function updatePlayer(s, r, dt) {
    var st = stage(s);
    var max = st.maxSpeed + (r.boost > 0 ? 92 : 0);
    if (r.boost > 0) r.boost = Math.max(0, r.boost - dt);
    if (r.shield > 0) r.shield = Math.max(0, r.shield - dt);
    if (r.spin > 0) {
      r.spin = Math.max(0, r.spin - dt);
      r.speed = Math.max(100, r.speed * Math.exp(-3.2 * dt));
      r.vx *= Math.exp(-4.5 * dt);
    } else {
      r.speed += (max - r.speed) * 1.25 * dt;
      r.vx += r.steer * LATERAL_ACCEL * dt;
    }
    r.drifting = r.spin <= 0 && Math.abs(r.vx) > 72 && Math.abs(r.steer) > 0.35 && r.speed > 170;
    var friction = r.drifting ? DRIFT_FRICTION : LATERAL_FRICTION;
    r.vx *= Math.exp(-friction * dt);
    r.x += r.vx * dt;
    if (r.drifting) {
      r.drift = Math.min(1, r.drift + DRIFT_CHARGE_RATE * dt);
      if (r.drift >= 1) {
        r.drift = 0;
        r.boost = 1.25;
        event(s, 'boost', { id: r.id });
      }
    } else {
      r.drift = Math.max(0, r.drift - 0.08 * dt);
    }
    checkCourse(s, r);
  }

  function updateCpu(s, r, dt) {
    var st = stage(s);
    var p = playerOf(s);
    var target = trackCenter(st, r.s + 130) + r.aiLane + Math.sin(s.raceTime * 0.7 + r.aiPhase) * 22;
    r.steer = clamp((target - r.x) / 86, -1, 1);
    var rubber = 0;
    var playerProgress = p.lap * st.length + p.s;
    var selfProgress = r.lap * st.length + r.s;
    if (selfProgress < playerProgress - 260) rubber = 0.08;
    else if (selfProgress > playerProgress + 350) rubber = -0.06;
    var max = st.maxSpeed * (0.94 + rubber) + (r.boost > 0 ? 60 : 0);
    if (r.boost > 0) r.boost = Math.max(0, r.boost - dt);
    if (r.shield > 0) r.shield = Math.max(0, r.shield - dt);
    if (r.spin > 0) {
      r.spin = Math.max(0, r.spin - dt);
      r.speed = Math.max(90, r.speed * Math.exp(-3.2 * dt));
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
        if (ds > 24) continue;
        var dx = b.x - a.x;
        if (Math.abs(dx) > 30) continue;
        var push = (30 - Math.abs(dx)) * 0.5 * (dx >= 0 ? 1 : -1);
        a.x -= push * 0.5;
        b.x += push * 0.5;
        a.vx -= push * 2;
        b.vx += push * 2;
        a.speed *= 0.96;
        b.speed *= 0.96;
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
      if (s.countdown <= 0) {
        s.countdown = 0;
        s.phase = 'playing';
        event(s, 'go', {});
      }
      return s;
    }
    s.raceTime += dt;
    if (s.raceTime > TIME_LIMIT) {
      s.phase = 'over';
      s.reason = 'timeup';
      event(s, 'timeup', {});
      return s;
    }
    for (var i = 0; i < s.racers.length; i++) {
      var r = s.racers[i];
      if (r.finished) continue;
      if (r.isPlayer) updatePlayer(s, r, dt);
      else updateCpu(s, r, dt);
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
      if (s.place === 1) {
        s.phase = 'clear';
        s.winner = 'player';
        s.reason = 'first';
      } else {
        s.phase = 'over';
        s.winner = 'cpu';
        s.reason = 'place';
      }
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
      id: 'school-chair-drift',
      phase: s.phase,
      paused: s.paused,
      countdown: s.countdown,
      stage: s.stage,
      stageTotal: s.stageTotal,
      stageName: s.stageName,
      laps: s.laps,
      stageLength: s.stageLength,
      raceTime: s.raceTime,
      place: playerPlace(s),
      lap: Math.min(LAPS, p.lap + 1),
      progress: clamp((p.lap * st.length + p.s) / (LAPS * st.length), 0, 1),
      player: {
        s: p.s, lap: p.lap, x: p.x, speed: p.speed, vx: p.vx,
        drift: p.drift, drifting: p.drifting, boost: p.boost, shield: p.shield, spin: p.spin,
        item: p.item, finished: p.finished
      },
      racers: s.racers,
      itemBoxes: s.itemBoxes,
      traps: s.traps,
      obstacles: s.obstacles,
      winner: s.winner,
      reason: s.reason,
      over: s.phase === 'over',
      clear: s.phase === 'clear'
    };
  }

  function consumeEvents(s) {
    if (!s) return [];
    return s.events.splice(0, s.events.length);
  }

  return {
    C: C,
    CHAIR_R: CHAIR_R,
    STAGES: STAGES,
    LAPS: LAPS,
    trackCenter: trackCenter,
    createGame: createGame,
    update: update,
    setSteer: setSteer,
    useItem: useItem,
    setPaused: setPaused,
    getState: getState,
    consumeEvents: consumeEvents
  };
});
