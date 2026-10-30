(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchoolChairDriftEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var C = { VIEW_W: 480, VIEW_H: 800 };
  var CHAIR_R = 17;
  var LATERAL_ACCEL = 760;
  var LATERAL_FRICTION = 5.4;
  var DRIFT_FRICTION = 2.1;
  var DRIFT_CHARGE_RATE = 0.36;
  var MILK_TIME = 1.4;

  function obstacle(wy, off, w, h, kind) { return { wy: wy, off: off, w: w, h: h, kind: kind || 'desk' }; }
  function milk(wy, off) { return { wy: wy, off: off, taken: false }; }

  var STAGES = [
    {
      id: 'corridor', name: '1F 渡り廊下', length: 5200, halfWidth: 150, baseSpeed: 300, maxSpeed: 360, time: 36,
      curveAmp: 46, curveFreq: 0.0015,
      obstacles: [
        obstacle(-480, -86, 128, 50, 'locker'), obstacle(-820, 92, 52, 52, 'bucket'),
        obstacle(-1160, -92, 116, 50, 'desk'), obstacle(-1500, 96, 76, 56, 'cart'),
        obstacle(-1840, -86, 44, 44, 'plant'), obstacle(-2200, 82, 124, 50, 'locker'),
        obstacle(-2540, -96, 52, 52, 'bucket'), obstacle(-2920, 88, 126, 50, 'desk'),
        obstacle(-3280, -78, 76, 56, 'cart'), obstacle(-3650, 92, 44, 44, 'plant'),
        obstacle(-4020, -90, 124, 50, 'locker'), obstacle(-4380, 84, 52, 52, 'bucket')
      ],
      milk: [milk(-690, 0), milk(-1360, -20), milk(-2080, 22), milk(-2800, -16), milk(-3480, 18), milk(-4140, 0)]
    },
    {
      id: 'special', name: '特別棟', length: 6500, halfWidth: 140, baseSpeed: 320, maxSpeed: 385, time: 42,
      curveAmp: 72, curveFreq: 0.0017,
      obstacles: [
        obstacle(-420, -74, 120, 50, 'locker'), obstacle(-760, 84, 104, 46, 'desk'),
        obstacle(-1100, -88, 52, 52, 'bucket'), obstacle(-1450, 74, 76, 56, 'cart'),
        obstacle(-1820, -82, 122, 50, 'locker'), obstacle(-2180, 88, 44, 44, 'plant'),
        obstacle(-2540, -90, 126, 50, 'desk'), obstacle(-2900, 78, 52, 52, 'bucket'),
        obstacle(-3260, -82, 120, 50, 'locker'), obstacle(-3620, 86, 76, 56, 'cart'),
        obstacle(-3980, -88, 44, 44, 'plant'), obstacle(-4350, 78, 124, 50, 'desk'),
        obstacle(-4720, -86, 52, 52, 'bucket'), obstacle(-5080, 84, 76, 56, 'cart'),
        obstacle(-5440, -78, 122, 50, 'locker'), obstacle(-5800, 88, 52, 52, 'bucket')
      ],
      milk: [milk(-650, 0), milk(-1280, -18), milk(-1980, 20), milk(-2680, -18), milk(-3380, 18), milk(-4080, -18), milk(-4780, 18), milk(-5480, 0)]
    },
    {
      id: 'entrance', name: '3F エントランス', length: 7800, halfWidth: 130, baseSpeed: 340, maxSpeed: 410, time: 50,
      curveAmp: 92, curveFreq: 0.0019,
      obstacles: [
        obstacle(-400, -68, 118, 50, 'locker'), obstacle(-740, 78, 118, 50, 'desk'),
        obstacle(-1080, -82, 52, 52, 'bucket'), obstacle(-1420, 68, 76, 56, 'cart'),
        obstacle(-1760, -76, 120, 50, 'locker'), obstacle(-2100, 82, 44, 44, 'plant'),
        obstacle(-2440, -84, 76, 56, 'cart'), obstacle(-2780, 72, 52, 52, 'bucket'),
        obstacle(-3120, -78, 122, 50, 'desk'), obstacle(-3460, 82, 76, 56, 'cart'),
        obstacle(-3800, -76, 44, 44, 'plant'), obstacle(-4140, 76, 120, 50, 'locker'),
        obstacle(-4480, -82, 52, 52, 'bucket'), obstacle(-4820, 80, 76, 56, 'cart'),
        obstacle(-5160, -78, 122, 50, 'desk'), obstacle(-5500, 82, 44, 44, 'plant'),
        obstacle(-5840, -84, 52, 52, 'bucket'), obstacle(-6180, 76, 122, 50, 'locker'),
        obstacle(-6520, 82, 76, 56, 'cart'), obstacle(-6860, -78, 44, 44, 'plant'),
        obstacle(-7200, 82, 52, 52, 'bucket'), obstacle(-7520, 0, 76, 56, 'cart')
      ],
      milk: [milk(-600, 0), milk(-1200, 18), milk(-1840, -18), milk(-2500, 22), milk(-3160, -20), milk(-3820, 18), milk(-4480, -18), milk(-5140, 20), milk(-5800, -16), milk(-6460, 16), milk(-7120, 0)]
    }
  ];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function trackCenter(stage, y) {
    return C.VIEW_W / 2 + Math.sin(y * stage.curveFreq) * stage.curveAmp + Math.sin(y * stage.curveFreq * 2.7) * 10;
  }
  function stageFor(index) { return STAGES[clamp(Number(index) || 0, 0, STAGES.length - 1)]; }

  function createGame(options) {
    options = options || {};
    var stageIndex = clamp(Number(options.stage) || 0, 0, STAGES.length - 1);
    var stage = STAGES[stageIndex];
    var obstacles = [];
    for (var i = 0; i < stage.obstacles.length; i++) {
      var o = stage.obstacles[i];
      obstacles.push({ wy: o.wy, x: trackCenter(stage, o.wy) + o.off, w: o.w, h: o.h, kind: o.kind, hit: false });
    }
    var milks = [];
    for (i = 0; i < stage.milk.length; i++) {
      var m = stage.milk[i];
      milks.push({ wy: m.wy, x: trackCenter(stage, m.wy) + m.off, taken: false });
    }
    return {
      phase: 'playing',
      paused: false,
      stage: stageIndex,
      stageTotal: STAGES.length,
      stageName: stage.name,
      time: stage.time,
      finishTime: 0,
      chair: { x: C.VIEW_W / 2, y: 0, vx: 0, speed: stage.baseSpeed, steer: 0, angle: 0 },
      maxSpeed: stage.maxSpeed,
      drift: 0,
      boost: 0,
      drifting: false,
      milk: 0,
      obstacles: obstacles,
      milks: milks,
      reason: null,
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

  function circleRect(cx, cy, r, ox, oy, ow, oh) {
    var nx = clamp(cx, ox, ox + ow);
    var ny = clamp(cy, oy, oy + oh);
    var dx = cx - nx;
    var dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function hitObstacle(s, o) {
    var cx = s.chair.x;
    var cy = s.chair.y;
    var left = o.x - o.w / 2;
    var top = o.wy - o.h / 2;
    if (!circleRect(cx, cy, CHAIR_R, left, top, o.w, o.h)) return false;
    var nx = cx - o.x;
    var ny = cy - o.wy;
    var len = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= len;
    ny /= len;
    s.chair.x += nx * (CHAIR_R + 5);
    s.chair.y += ny * (CHAIR_R + 5);
    s.chair.vx = -nx * Math.max(120, Math.abs(s.chair.vx) * 0.55);
    s.chair.speed = Math.max(120, s.chair.speed * 0.62);
    s.drift = Math.max(0, s.drift - 0.3);
    event(s, 'crash', { x: cx, y: cy, kind: o.kind });
    return true;
  }

  function hitMilk(s, m) {
    var dx = s.chair.x - m.x;
    var dy = s.chair.y - m.wy;
    if (dx * dx + dy * dy > (CHAIR_R + 16) * (CHAIR_R + 16)) return false;
    m.taken = true;
    s.milk++;
    s.time += MILK_TIME;
    s.chair.speed = Math.min(s.maxSpeed + 50, s.chair.speed + 26);
    event(s, 'milk', { x: m.x, y: m.wy });
    return true;
  }

  function setSteer(s, value) {
    if (!s || s.phase !== 'playing') return;
    s.chair.steer = clamp(Number(value) || 0, -1, 1);
  }

  function update(s, dt) {
    if (!s || s.paused || s.phase !== 'playing') return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    s.time -= dt;
    if (s.time <= 0) {
      s.time = 0;
      s.phase = 'over';
      s.reason = 'timeup';
      event(s, 'timeup', {});
      return s;
    }
    var st = stage(s);
    var c = s.chair;
    var max = s.maxSpeed + (s.boost > 0 ? 70 : 0);
    if (s.boost > 0) s.boost = Math.max(0, s.boost - dt);
    c.speed += (max - c.speed) * 1.25 * dt;
    c.vx += c.steer * LATERAL_ACCEL * dt;
    var friction = s.drifting ? DRIFT_FRICTION : LATERAL_FRICTION;
    c.vx *= Math.exp(-friction * dt);
    c.x += c.vx * dt;
    c.y -= c.speed * dt;
    c.angle = Math.atan2(c.vx, Math.max(80, c.speed)) * 0.72;
    s.drifting = Math.abs(c.vx) > 72 && Math.abs(c.steer) > 0.35 && c.speed > 170;
    if (s.drifting) {
      s.drift = Math.min(1, s.drift + DRIFT_CHARGE_RATE * dt);
      if (s.drift >= 1) {
        s.drift = 0;
        s.boost = 1.25;
        event(s, 'boost', { x: c.x, y: c.y });
      }
    } else {
      s.drift = Math.max(0, s.drift - 0.08 * dt);
    }

    var center = trackCenter(st, c.y);
    var left = center - st.halfWidth + CHAIR_R;
    var right = center + st.halfWidth - CHAIR_R;
    if (c.x < left) {
      c.x = left;
      if (c.vx < 0) c.vx = -c.vx * 0.45;
      c.speed = Math.max(130, c.speed * 0.78);
      event(s, 'wall', { side: 'left' });
    } else if (c.x > right) {
      c.x = right;
      if (c.vx > 0) c.vx = -c.vx * 0.45;
      c.speed = Math.max(130, c.speed * 0.78);
      event(s, 'wall', { side: 'right' });
    }

    for (var i = 0; i < s.obstacles.length; i++) {
      if (s.obstacles[i].hit) continue;
      if (hitObstacle(s, s.obstacles[i])) s.obstacles[i].hit = true;
    }
    for (i = 0; i < s.milks.length; i++) {
      if (s.milks[i].taken) continue;
      if (hitMilk(s, s.milks[i])) s.milks[i].taken = true;
    }

    if (c.y <= -st.length) {
      s.phase = 'clear';
      s.finishTime = Math.max(0, s.time);
      event(s, 'finish', { time: s.finishTime });
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
    return {
      id: 'school-chair-drift',
      phase: s.phase,
      paused: s.paused,
      stage: s.stage,
      stageTotal: s.stageTotal,
      stageName: s.stageName,
      time: s.time,
      finishTime: s.finishTime,
      chair: { x: s.chair.x, y: s.chair.y, vx: s.chair.vx, speed: s.chair.speed, angle: s.chair.angle },
      progress: clamp(-s.chair.y / st.length, 0, 1),
      centerX: trackCenter(st, s.chair.y),
      halfWidth: st.halfWidth,
      drift: s.drift,
      boost: s.boost,
      drifting: s.drifting,
      milk: s.milk,
      obstacles: s.obstacles,
      milks: s.milks,
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
    trackCenter: trackCenter,
    createGame: createGame,
    update: update,
    setSteer: setSteer,
    setPaused: setPaused,
    getState: getState,
    consumeEvents: consumeEvents
  };
});
