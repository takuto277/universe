/* engine.js : TENDRIL のコアロジック（触手の体・捕食・トゲ） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TendrilEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 390;
  var H = 844;
  var MARGIN = 26;
  var HEAD_R = 13;
  var SEG = 13;
  var MAX_NODES = 26;
  var START_NODES = 12;
  var DURATION = 45;
  var ORB_COUNT = 4;
  var RESPAWN_DELAY = 0.7;
  var SPIKE_COUNT = 3;
  var TENT_MAX = 185;
  var TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function dist(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function segDist(x1, y1, x2, y2, px, py) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    if (len2 < 0.0001) return dist(x1, y1, px, py);
    var t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return dist(x1 + dx * t, y1 + dy * t, px, py);
  }

  function createGame(opts) {
    opts = opts || {};
    return {
      width: W,
      height: H,
      rng: opts.rng || Math.random,
      phase: 'idle',
      time: 0,
      duration: DURATION,
      head: { x: W / 2, y: H * 0.62, vx: 0, vy: 0 },
      aim: { x: W / 2, y: H * 0.42 },
      down: false,
      body: [],
      bodyLen: START_NODES,
      tentacle: { len: 0, max: TENT_MAX, dirX: 0, dirY: -1, tipX: 0, tipY: 0, grabbedId: -1 },
      orbs: [],
      spikes: [],
      spawnQueue: [],
      nextId: 1,
      score: 0,
      eaten: 0,
      combo: 0,
      best: 0,
      invuln: 0,
      stun: 0,
      hitFlash: 0,
      shake: 0,
      events: [],
      result: null
    };
  }

  function spawnOrb(s, avoidHead) {
    var x = 0;
    var y = 0;
    var tries = 0;
    do {
      x = MARGIN + 34 + s.rng() * (W - 2 * (MARGIN + 34));
      y = MARGIN + 58 + s.rng() * (H - 2 * (MARGIN + 58));
      tries++;
    } while (avoidHead && dist(x, y, s.head.x, s.head.y) < 110 && tries < 12);

    var orb = {
      id: s.nextId++,
      x: x,
      y: y,
      vx: (s.rng() - 0.5) * 26,
      vy: (s.rng() - 0.5) * 26,
      r: 8 + s.rng() * 3,
      hue: s.rng() < 0.28 ? 300 : 186,
      phase: s.rng() * TAU
    };
    s.orbs.push(orb);
    return orb;
  }

  function spawnSpike(s) {
    var x = MARGIN + 40 + s.rng() * (W - 2 * (MARGIN + 40));
    var y = MARGIN + 40 + s.rng() * (H - 2 * (MARGIN + 40));
    var speed = 26 + s.rng() * 34;
    var ang = s.rng() * TAU;
    s.spikes.push({
      id: s.nextId++,
      x: x,
      y: y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r: 12 + s.rng() * 6,
      angle: s.rng() * TAU,
      spin: (s.rng() - 0.5) * 1.8
    });
  }

  function start(s) {
    if (!s) return false;
    s.phase = 'playing';
    s.time = 0;
    s.head = { x: W / 2, y: H * 0.62, vx: 0, vy: 0 };
    s.aim = { x: W / 2, y: H * 0.42 };
    s.down = false;
    s.bodyLen = START_NODES;
    s.body = [];
    for (var i = 0; i < START_NODES; i++) {
      s.body.push({ x: s.head.x, y: s.head.y + i * SEG });
    }
    s.tentacle = { len: 0, max: TENT_MAX, dirX: 0, dirY: -1, tipX: s.head.x, tipY: s.head.y, grabbedId: -1 };
    s.orbs = [];
    s.spikes = [];
    s.spawnQueue = [];
    s.nextId = 1;
    s.score = 0;
    s.eaten = 0;
    s.combo = 0;
    s.invuln = 1.1;
    s.stun = 0;
    s.hitFlash = 0;
    s.shake = 0;
    s.events = [];
    s.result = null;
    for (var o = 0; o < ORB_COUNT; o++) spawnOrb(s, true);
    for (var k = 0; k < SPIKE_COUNT; k++) spawnSpike(s);
    return true;
  }

  function findOrb(s, id) {
    for (var i = 0; i < s.orbs.length; i++) {
      if (s.orbs[i].id === id) return s.orbs[i];
    }
    return null;
  }

  function grow(s) {
    if (s.bodyLen >= MAX_NODES) return;
    var tail = s.body[s.bodyLen - 1];
    s.body[s.bodyLen] = { x: tail.x, y: tail.y };
    s.bodyLen++;
  }

  function pushEvent(s, e) {
    s.events.push(e);
    if (s.events.length > 32) s.events.shift();
  }

  function eat(s, orb) {
    s.eaten++;
    s.score++;
    s.combo++;
    s.hitFlash = Math.min(1, s.hitFlash + 0.5);
    s.shake = Math.max(s.shake, 5);
    pushEvent(s, { type: 'eat', x: orb.x, y: orb.y, hue: orb.hue });
    for (var i = 0; i < s.orbs.length; i++) {
      if (s.orbs[i].id === orb.id) { s.orbs.splice(i, 1); break; }
    }
    grow(s);
    s.spawnQueue.push({ t: RESPAWN_DELAY });
  }

  function hit(s, spike) {
    s.invuln = 1.2;
    s.stun = 0.35;
    s.combo = 0;
    s.shake = Math.max(s.shake, 12);
    s.hitFlash = Math.min(1, s.hitFlash + 0.8);
    var d = dist(s.head.x, s.head.y, spike.x, spike.y) || 1;
    s.head.vx += (s.head.x - spike.x) / d * 320;
    s.head.vy += (s.head.y - spike.y) / d * 320;
    pushEvent(s, { type: 'hit', x: s.head.x, y: s.head.y });
  }

  function finish(s) {
    s.phase = 'over';
    s.result = {
      score: s.score,
      eaten: s.eaten,
      time: Math.round(s.time * 10) / 10,
      nodes: s.bodyLen
    };
    if (s.score > s.best) s.best = s.score;
    pushEvent(s, { type: 'end', x: s.head.x, y: s.head.y });
  }

  function setPointer(s, x, y, down) {
    if (!s) return;
    s.aim.x = clamp(x, 0, W);
    s.aim.y = clamp(y, 0, H);
    s.down = !!down;
  }

  function updateBody(s) {
    var nodes = s.body;
    var n = s.bodyLen;
    var head = s.head;
    nodes[0].x = head.x;
    nodes[0].y = head.y;

    for (var it = 0; it < 2; it++) {
      for (var i = 1; i < n; i++) {
        var dx = nodes[i].x - nodes[i - 1].x;
        var dy = nodes[i].y - nodes[i - 1].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.0001) { dx = 0; dy = SEG; d = SEG; }
        var diff = (d - SEG) / d * 0.86;
        nodes[i].x -= dx * diff;
        nodes[i].y -= dy * diff;
      }
    }

    for (var j = 1; j < n; j++) {
      var px = nodes[j].x - nodes[j - 1].x;
      var py = nodes[j].y - nodes[j - 1].y;
      var a = Math.atan2(py, px);
      var amp = Math.sin(s.time * 7 - j * 0.7) * 1.7 * (j / n);
      nodes[j].x += Math.cos(a + Math.PI / 2) * amp;
      nodes[j].y += Math.sin(a + Math.PI / 2) * amp;
    }

    for (var q = 1; q < n; q++) {
      var ax = nodes[q].x - nodes[q - 1].x;
      var ay = nodes[q].y - nodes[q - 1].y;
      var ad = Math.sqrt(ax * ax + ay * ay);
      if (ad < 0.0001) continue;
      var f = (ad - SEG) / ad * 0.6;
      nodes[q].x -= ax * f;
      nodes[q].y -= ay * f;
    }
  }

  function updateTentacle(s, dt) {
    var tc = s.tentacle;
    var h = s.head;
    var dx = s.aim.x - h.x;
    var dy = s.aim.y - h.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) { tc.dirX = dx / d; tc.dirY = dy / d; }

    var target = s.down ? tc.max : 0;
    var rate = s.down ? 900 : 1500;
    if (tc.len < target) tc.len = Math.min(target, tc.len + rate * dt);
    else tc.len = Math.max(target, tc.len - rate * dt);

    tc.tipX = h.x + tc.dirX * tc.len;
    tc.tipY = h.y + tc.dirY * tc.len;

    if (!s.down && tc.grabbedId >= 0) tc.grabbedId = -1;

    if (tc.grabbedId >= 0) {
      var orb = findOrb(s, tc.grabbedId);
      if (!orb) {
        tc.grabbedId = -1;
      } else {
        var ax = h.x - orb.x;
        var ay = h.y - orb.y;
        var ad = Math.sqrt(ax * ax + ay * ay);
        var pull = Math.min(1, dt * 13);
        orb.x += ax * pull;
        orb.y += ay * pull;
        tc.tipX = orb.x;
        tc.tipY = orb.y;
        if (ad < HEAD_R + orb.r + 3) {
          eat(s, orb);
          tc.grabbedId = -1;
        }
      }
    } else if (s.down && tc.len > 14) {
      var best = -1;
      var bestD = 1e9;
      for (var i = 0; i < s.orbs.length; i++) {
        var o = s.orbs[i];
        var dd = segDist(h.x, h.y, tc.tipX, tc.tipY, o.x, o.y);
        if (dd < o.r + 10 && dd < bestD) { bestD = dd; best = o.id; }
      }
      if (best >= 0) tc.grabbedId = best;
    }
  }

  function updateOrbs(s, dt) {
    for (var q = s.spawnQueue.length - 1; q >= 0; q--) {
      s.spawnQueue[q].t -= dt;
      if (s.spawnQueue[q].t <= 0) {
        s.spawnQueue.splice(q, 1);
        spawnOrb(s, true);
      }
    }
    for (var i = 0; i < s.orbs.length; i++) {
      var o = s.orbs[i];
      o.phase += dt;
      if (o.id === s.tentacle.grabbedId) continue;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.x < MARGIN + o.r) { o.x = MARGIN + o.r; o.vx = Math.abs(o.vx); }
      if (o.x > W - MARGIN - o.r) { o.x = W - MARGIN - o.r; o.vx = -Math.abs(o.vx); }
      if (o.y < MARGIN + o.r) { o.y = MARGIN + o.r; o.vy = Math.abs(o.vy); }
      if (o.y > H - MARGIN - o.r) { o.y = H - MARGIN - o.r; o.vy = -Math.abs(o.vy); }
    }
  }

  function updateSpikes(s, dt) {
    for (var i = 0; i < s.spikes.length; i++) {
      var sp = s.spikes[i];
      sp.angle += sp.spin * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      if (sp.x < MARGIN + sp.r) { sp.x = MARGIN + sp.r; sp.vx = Math.abs(sp.vx); }
      if (sp.x > W - MARGIN - sp.r) { sp.x = W - MARGIN - sp.r; sp.vx = -Math.abs(sp.vx); }
      if (sp.y < MARGIN + sp.r) { sp.y = MARGIN + sp.r; sp.vy = Math.abs(sp.vy); }
      if (sp.y > H - MARGIN - sp.r) { sp.y = H - MARGIN - sp.r; sp.vy = -Math.abs(sp.vy); }
      if (s.invuln <= 0 && s.stun <= 0 && dist(s.head.x, s.head.y, sp.x, sp.y) < sp.r + HEAD_R - 2) {
        hit(s, sp);
      }
    }
  }

  function update(s, dt) {
    if (!s || s.phase !== 'playing') return s;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;

    s.time += dt;
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dt);
    if (s.stun > 0) s.stun = Math.max(0, s.stun - dt);
    if (s.hitFlash > 0) s.hitFlash = Math.max(0, s.hitFlash - dt * 2.2);
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 34);

    if (s.time >= s.duration) { finish(s); return s; }

    var h = s.head;
    if (s.stun <= 0) {
      var dx = s.aim.x - h.x;
      var dy = s.aim.y - h.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 2) {
        var nx = dx / d;
        var ny = dy / d;
        var sp = Math.min(265, d * 5);
        var k = Math.min(1, dt * 8);
        h.vx += (nx * sp - h.vx) * k;
        h.vy += (ny * sp - h.vy) * k;
      }
    }

    var damp = 1 - Math.min(0.4, dt * 3);
    h.vx *= damp;
    h.vy *= damp;
    h.x += h.vx * dt;
    h.y += h.vy * dt;

    var lo = MARGIN + HEAD_R;
    var hx = W - MARGIN - HEAD_R;
    var hy = H - MARGIN - HEAD_R;
    if (h.x < lo) { h.x = lo; h.vx = Math.abs(h.vx) * 0.45; }
    if (h.x > hx) { h.x = hx; h.vx = -Math.abs(h.vx) * 0.45; }
    if (h.y < lo) { h.y = lo; h.vy = Math.abs(h.vy) * 0.45; }
    if (h.y > hy) { h.y = hy; h.vy = -Math.abs(h.vy) * 0.45; }

    updateOrbs(s, dt);
    updateTentacle(s, dt);
    updateSpikes(s, dt);
    updateBody(s);
    return s;
  }

  function autoStep(s) {
    if (!s) return;
    if (s.phase === 'idle') { start(s); return; }
    if (s.phase !== 'playing') return;
    var best = null;
    var bestD = 1e9;
    for (var i = 0; i < s.orbs.length; i++) {
      var o = s.orbs[i];
      var d = dist(s.head.x, s.head.y, o.x, o.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) setPointer(s, best.x, best.y, true);
    else setPointer(s, s.width / 2, s.height / 2, false);
  }

  function snapshot(s) {
    if (!s) return null;
    return {
      phase: s.phase,
      over: s.phase === 'over',
      time: Math.round(s.time * 100) / 100,
      duration: s.duration,
      score: s.score,
      eaten: s.eaten,
      combo: s.combo,
      bodyLen: s.bodyLen,
      best: s.best,
      invuln: s.invuln,
      stun: s.stun,
      head: { x: s.head.x, y: s.head.y },
      tentacle: {
        len: s.tentacle.len,
        tipX: s.tentacle.tipX,
        tipY: s.tentacle.tipY,
        grabbedId: s.tentacle.grabbedId
      },
      orbCount: s.orbs.length,
      spikeCount: s.spikes.length,
      result: s.result
    };
  }

  return {
    W: W,
    H: H,
    DURATION: DURATION,
    createGame: createGame,
    start: start,
    setPointer: setPointer,
    update: update,
    autoStep: autoStep,
    snapshot: snapshot
  };
});
