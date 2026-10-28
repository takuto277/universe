(function (root, factory) {
  'use strict';
  var api = factory(root.KEN_DATA);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.KenTsunagiEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DATA) {
  'use strict';

  if (!DATA || !DATA.prefectures) throw new Error('KEN_DATA is required');

  var PREFECTURES = DATA.prefectures.slice().sort(function (a, b) { return a.code - b.code; });
  var BY_CODE = {};
  var BY_REGION = {};
  var NEIGHBORS = {};
  var REGION_ORDER = DATA.regions.map(function (r) { return r.id; });
  var REGION_LABEL = {};
  var REGION_COLOR = {};
  var TOTAL = PREFECTURES.length;
  var BRIDGES = { '1-2': true, '28-36': true, '33-37': true, '34-38': true, '35-40': true, '46-47': true };

  for (var i = 0; i < PREFECTURES.length; i++) {
    var p = PREFECTURES[i];
    BY_CODE[p.code] = p;
    NEIGHBORS[p.code] = {};
    if (!BY_REGION[p.region]) BY_REGION[p.region] = [];
    BY_REGION[p.region].push(p.code);
  }
  for (i = 0; i < PREFECTURES.length; i++) {
    p = PREFECTURES[i];
    for (var n = 0; n < p.neighbors.length; n++) NEIGHBORS[p.code][p.neighbors[n]] = true;
  }
  for (i = 0; i < DATA.regions.length; i++) {
    REGION_LABEL[DATA.regions[i].id] = DATA.regions[i].label;
    REGION_COLOR[DATA.regions[i].id] = DATA.regions[i].color;
  }

  var WORLD = {
    w: 0.928,
    h: 1.12,
    gravity: 3.2,
    maxFall: 2.6,
    activeTop: 0.015,
    dropSpeed: 0.55,
    mergeGap: 0.021,
    overflowGrace: 0.5,
    finishLimit: 60,
    maxHints: 3,
    maxShakes: 3
  };

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 120) s.events.shift();
  }

  function codeOrder() {
    var codes = [];
    for (var i = 0; i < PREFECTURES.length; i++) codes.push(PREFECTURES[i].code);
    return codes;
  }

  function spawnYFor(code) {
    var p = BY_CODE[code];
    var minY = Infinity;
    for (var i = 0; i < p.circles.length; i++) {
      if (p.circles[i][1] < minY) minY = p.circles[i][1];
    }
    return WORLD.activeTop - (minY - p.center[1]);
  }

  function activeRange(code) {
    var p = BY_CODE[code];
    var minX = Infinity;
    var maxX = -Infinity;
    for (var i = 0; i < p.circles.length; i++) {
      minX = Math.min(minX, p.circles[i][0] - p.circles[i][2]);
      maxX = Math.max(maxX, p.circles[i][0] + p.circles[i][2]);
    }
    return {
      min: p.center[0] - minX,
      max: WORLD.w - (maxX - p.center[0])
    };
  }

  function clampActive(s) {
    if (!s.queue.length) return;
    var r = activeRange(s.queue[0]);
    s.activeX = clamp(s.activeX, r.min, r.max);
  }

  function createRun() {
    var s = {
      phase: 'run',
      paused: false,
      queue: codeOrder(),
      activeCode: null,
      activeX: WORLD.w / 2,
      bodies: [],
      nextId: 1,
      dropped: 0,
      allDropped: false,
      finishTimer: 0,
      elapsed: 0,
      finishTime: 0,
      score: 0,
      merges: 0,
      hints: WORLD.maxHints,
      shakes: WORLD.maxShakes,
      awarded: {},
      overflowTimer: 0,
      reason: null,
      events: []
    };
    s.activeCode = s.queue.length ? s.queue[0] : null;
    clampActive(s);
    return s;
  }

  function bodyMass(codes) {
    var m = 0;
    for (var i = 0; i < codes.length; i++) m += 0.35 + BY_CODE[codes[i]].area * 90;
    return Math.max(0.5, m);
  }

  function updateBody(body) {
    var ref = BY_CODE[body.ref];
    var circles = [];
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < body.members.length; i++) {
      var p = BY_CODE[body.members[i]];
      for (var j = 0; j < p.circles.length; j++) {
        var c = p.circles[j];
        var x = body.x + (c[0] - ref.center[0]);
        var y = body.y + (c[1] - ref.center[1]);
        circles.push({ x: x, y: y, r: c[2] });
        if (x - c[2] < minX) minX = x - c[2];
        if (x + c[2] > maxX) maxX = x + c[2];
        if (y - c[2] < minY) minY = y - c[2];
        if (y + c[2] > maxY) maxY = y + c[2];
      }
    }
    body.circles = circles;
    body.bounds = { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    body.mass = bodyMass(body.members);
  }

  function addBody(s, code, x, y, vy) {
    code = Number(code);
    if (!BY_CODE[code]) return null;
    var body = {
      id: s.nextId++,
      ref: code,
      members: [code],
      x: x,
      y: y,
      vx: 0,
      vy: vy == null ? 0 : vy,
      age: 0,
      mass: 1,
      circles: [],
      bounds: null
    };
    updateBody(body);
    s.bodies.push(body);
    return body;
  }

  function clampBody(body) {
    updateBody(body);
    var b = body.bounds;
    if (b.minX < 0) body.x -= b.minX;
    if (b.maxX > WORLD.w) body.x -= b.maxX - WORLD.w;
    if (b.maxY > WORLD.h) body.y -= b.maxY - WORLD.h;
    updateBody(body);
  }

  function activeWorld(code, x) {
    return { x: x, y: spawnYFor(code) };
  }

  function setActiveX(s, x) {
    if (!s || !s.queue.length || s.phase !== 'run' || s.paused) return;
    s.activeX = Number(x) || 0;
    clampActive(s);
  }

  function moveActive(s, dx) {
    if (!s || !s.queue.length || s.phase !== 'run' || s.paused) return;
    s.activeX += Number(dx) || 0;
    clampActive(s);
  }

  function dropActive(s) {
    if (!s || s.phase !== 'run' || s.paused || !s.queue.length) return null;
    var code = s.queue.shift();
    var pos = activeWorld(code, s.activeX);
    var body = addBody(s, code, pos.x, pos.y, WORLD.dropSpeed);
    s.dropped++;
    event(s, 'drop', { code: code, label: BY_CODE[code].label, x: pos.x, y: pos.y });
    s.activeCode = s.queue.length ? s.queue[0] : null;
    if (!s.queue.length) {
      s.allDropped = true;
      s.finishTimer = WORLD.finishLimit;
      event(s, 'allDropped', {});
    } else {
      clampActive(s);
    }
    return body;
  }

  function adjacent(a, b) {
    for (var i = 0; i < a.members.length; i++) {
      for (var j = 0; j < b.members.length; j++) {
        if (NEIGHBORS[a.members[i]][b.members[j]]) return true;
      }
    }
    return false;
  }

  function bridgeBetween(a, b) {
    for (var i = 0; i < a.members.length; i++) {
      for (var j = 0; j < b.members.length; j++) {
        var x = Math.min(a.members[i], b.members[j]);
        var y = Math.max(a.members[i], b.members[j]);
        if (BRIDGES[x + '-' + y]) return true;
      }
    }
    return false;
  }

  function circleGap(a, b) {
    var ab = a.bounds;
    var bb = b.bounds;
    if (ab.maxX + WORLD.mergeGap < bb.minX || bb.maxX + WORLD.mergeGap < ab.minX ||
        ab.maxY + WORLD.mergeGap < bb.minY || bb.maxY + WORLD.mergeGap < ab.minY) {
      return Infinity;
    }
    var best = Infinity;
    for (var i = 0; i < a.circles.length; i++) {
      var ca = a.circles[i];
      for (var j = 0; j < b.circles.length; j++) {
        var cb = b.circles[j];
        var dx = cb.x - ca.x;
        var dy = cb.y - ca.y;
        var d = Math.sqrt(dx * dx + dy * dy) - ca.r - cb.r;
        if (d < best) best = d;
        if (best < -0.05) return best;
      }
    }
    return best;
  }

  function memberSet(codes) {
    var set = {};
    for (var i = 0; i < codes.length; i++) set[codes[i]] = true;
    return set;
  }

  function awardRegions(s, body) {
    var set = memberSet(body.members);
    var gained = 0;
    for (var i = 0; i < REGION_ORDER.length; i++) {
      var region = REGION_ORDER[i];
      if (s.awarded[region]) continue;
      var codes = BY_REGION[region];
      var complete = true;
      for (var j = 0; j < codes.length; j++) {
        if (!set[codes[j]]) { complete = false; break; }
      }
      if (complete) {
        s.awarded[region] = true;
        s.score += 500;
        gained += 500;
        event(s, 'region', { region: region, label: REGION_LABEL[region], gain: 500 });
      }
    }
    return gained;
  }

  function mergeBodies(s, a, b) {
    var base = a;
    var other = b;
    if (b.members.length > a.members.length || (b.members.length === a.members.length && b.y > a.y)) {
      base = b;
      other = a;
    }
    var massA = a.mass;
    var massB = b.mass;
    var vx = (a.vx * massA + b.vx * massB) / (massA + massB);
    var vy = (a.vy * massA + b.vy * massB) / (massA + massB);
    base.members = base.members.concat(other.members);
    base.vx = vx;
    base.vy = vy;
    updateBody(base);
    clampBody(base);
    s.bodies.splice(s.bodies.indexOf(other), 1);
    s.merges++;
    var gain = 120 + (base.members.length - 1) * 25;
    s.score += gain;
    var regionGain = awardRegions(s, base);
    event(s, 'merge', {
      id: base.id,
      x: base.x,
      y: base.y,
      members: base.members.slice(),
      count: base.members.length,
      gain: gain + regionGain,
      regionGain: regionGain
    });
    if (base.members.length >= TOTAL && s.phase === 'run') {
      s.phase = 'clear';
      s.finishTime = s.elapsed;
      s.clearBonus = Math.ceil(Math.max(0, s.finishTimer)) * 20;
      s.score += s.clearBonus;
      event(s, 'clear', { score: s.score, time: s.elapsed, bonus: s.clearBonus });
    }
    return base;
  }

  function findMergePair(s) {
    for (var i = 0; i < s.bodies.length; i++) {
      for (var j = i + 1; j < s.bodies.length; j++) {
        var a = s.bodies[i];
        var b = s.bodies[j];
        if (!adjacent(a, b)) continue;
        if (bridgeBetween(a, b) || circleGap(a, b) <= WORLD.mergeGap) return [a, b];
      }
    }
    return null;
  }

  function resolveWalls(body) {
    var b = body.bounds;
    if (b.minX < 0) {
      body.x -= b.minX;
      if (body.vx < 0) body.vx = -body.vx * 0.15;
      updateBody(body);
    }
    if (body.bounds.maxX > WORLD.w) {
      body.x -= body.bounds.maxX - WORLD.w;
      if (body.vx > 0) body.vx = -body.vx * 0.15;
      updateBody(body);
    }
    if (body.bounds.maxY > WORLD.h) {
      body.y -= body.bounds.maxY - WORLD.h;
      if (body.vy > 0) body.vy = body.vy > 0.12 ? -body.vy * 0.08 : 0;
      updateBody(body);
    }
  }

  function resolveContact(a, b) {
    var invA = 1 / a.mass;
    var invB = 1 / b.mass;
    var totalInv = invA + invB;
    for (var i = 0; i < a.circles.length; i++) {
      var ca = a.circles[i];
      for (var j = 0; j < b.circles.length; j++) {
        var cb = b.circles[j];
        var dx = cb.x - ca.x;
        var dy = cb.y - ca.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var radius = ca.r + cb.r;
        if (dist >= radius || dist < 1e-9) continue;
        var nx = dx / dist;
        var ny = dy / dist;
        var penetration = radius - dist;
        var push = penetration * 0.72 / totalInv;
        a.x -= nx * push * invA;
        a.y -= ny * push * invA;
        b.x += nx * push * invB;
        b.y += ny * push * invB;
        var rvx = b.vx - a.vx;
        var rvy = b.vy - a.vy;
        var vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          var impulse = -(1.06) * vn / totalInv;
          a.vx -= nx * impulse * invA;
          a.vy -= ny * impulse * invA;
          b.vx += nx * impulse * invB;
          b.vy += ny * impulse * invB;
          var tx = -ny;
          var ty = nx;
          var vt = rvx * tx + rvy * ty;
          var jt = -vt * 0.24 / totalInv;
          a.vx -= tx * jt * invA;
          a.vy -= ty * jt * invA;
          b.vx += tx * jt * invB;
          b.vy += ty * jt * invB;
        }
      }
    }
    updateBody(a);
    updateBody(b);
  }

  function physics(s, dt) {
    var steps = 2;
    var h = dt / steps;
    for (var step = 0; step < steps; step++) {
      for (var i = 0; i < s.bodies.length; i++) {
        var body = s.bodies[i];
        body.age += h;
        body.vy = Math.min(WORLD.maxFall, body.vy + WORLD.gravity * h);
        body.vx *= 0.998;
        body.x += body.vx * h;
        body.y += body.vy * h;
        updateBody(body);
        resolveWalls(body);
      }

      var guard = 0;
      var pair;
      while ((pair = findMergePair(s)) && guard++ < 12) {
        mergeBodies(s, pair[0], pair[1]);
        if (s.phase !== 'run') return;
      }

      for (var iter = 0; iter < 2; iter++) {
        for (i = 0; i < s.bodies.length; i++) resolveWalls(s.bodies[i]);
        for (i = 0; i < s.bodies.length; i++) {
          for (var j = i + 1; j < s.bodies.length; j++) {
            var a = s.bodies[i];
            var b = s.bodies[j];
            var ab = a.bounds;
            var bb = b.bounds;
            if (ab.maxX + 0.02 < bb.minX || bb.maxX + 0.02 < ab.minX ||
                ab.maxY + 0.02 < bb.minY || bb.maxY + 0.02 < ab.minY) continue;
            resolveContact(a, b);
          }
        }
      }
      for (i = 0; i < s.bodies.length; i++) resolveWalls(s.bodies[i]);
    }
  }

  function largestMembers(s) {
    var largest = 0;
    for (var i = 0; i < s.bodies.length; i++) {
      if (s.bodies[i].members.length > largest) largest = s.bodies[i].members.length;
    }
    return largest;
  }

  function topOf(body) {
    var top = Infinity;
    for (var i = 0; i < body.circles.length; i++) {
      var topY = body.circles[i].y - body.circles[i].r;
      if (topY < top) top = topY;
    }
    return top;
  }

  function checkOverflow(s, dt) {
    var top = Infinity;
    for (var i = 0; i < s.bodies.length; i++) {
      var t = topOf(s.bodies[i]);
      if (t < top) top = t;
    }
    if (top < -0.015) {
      s.overflowTimer += dt;
      if (s.overflowTimer >= WORLD.overflowGrace) {
        s.phase = 'over';
        s.reason = 'overflow';
        s.finishTime = s.elapsed;
        event(s, 'overflow', {});
      }
    } else {
      s.overflowTimer = Math.max(0, s.overflowTimer - dt * 2);
    }
  }

  function tick(s, dt) {
    if (!s || s.phase !== 'run' || s.paused) return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    s.elapsed += dt;
    if (s.allDropped) {
      s.finishTimer -= dt;
      if (s.finishTimer <= 0) {
        s.finishTimer = 0;
        s.phase = 'over';
        s.reason = 'timeout';
        s.finishTime = s.elapsed;
        event(s, 'timeout', {});
        return s;
      }
    }
    physics(s, dt);
    if (s.phase === 'run') checkOverflow(s, dt);
    return s;
  }

  function targetForActive(s) {
    if (!s || s.phase !== 'run' || !s.queue.length) return null;
    var code = s.queue[0];
    var p = BY_CODE[code];
    var best = null;
    for (var i = 0; i < s.bodies.length; i++) {
      var body = s.bodies[i];
      var ref = BY_CODE[body.ref];
      var hasNeighbor = false;
      for (var m = 0; m < body.members.length; m++) {
        if (NEIGHBORS[code][body.members[m]]) { hasNeighbor = true; break; }
      }
      if (!hasNeighbor) continue;
      if (!best || body.members.length > best.body.members.length) {
        best = {
          body: body,
          x: body.x + (p.center[0] - ref.center[0]),
          y: body.y + (p.center[1] - ref.center[1])
        };
      }
    }
    if (!best) return { code: code, x: WORLD.w / 2, y: spawnYFor(code), empty: true };
    best.code = code;
    best.empty = false;
    return best;
  }

  function useHint(s) {
    if (!s || s.phase !== 'run' || s.paused || s.hints <= 0) return null;
    var target = targetForActive(s);
    if (!target) return null;
    s.hints--;
    event(s, 'hint', { code: target.code, x: target.x, y: target.y });
    return target;
  }

  function shake(s) {
    if (!s || s.phase !== 'run' || s.paused || s.shakes <= 0) return false;
    s.shakes--;
    for (var i = 0; i < s.bodies.length; i++) {
      var b = s.bodies[i];
      b.vx += (Math.random() - 0.5) * 0.9;
      b.vy -= 0.25 + Math.random() * 0.35;
      b.x += (Math.random() - 0.5) * 0.02;
      updateBody(b);
    }
    event(s, 'shake', {});
    return true;
  }

  function setPaused(s, paused) {
    if (!s || s.phase !== 'run') return;
    s.paused = !!paused;
  }

  function getState(s) {
    if (!s) return null;
    return {
      id: 'ken-tsunagi',
      phase: s.phase,
      paused: s.paused,
      cleared: s.phase === 'clear',
      over: s.phase === 'over',
      reason: s.reason,
      score: s.score,
      activeCode: s.queue.length ? s.queue[0] : null,
      activeX: s.activeX,
      queue: s.queue.slice(0, 4),
      queueLength: s.queue.length,
      dropped: s.dropped,
      allDropped: s.allDropped,
      finishTimer: s.finishTimer,
      elapsed: s.elapsed,
      finishTime: s.finishTime,
      clearBonus: s.clearBonus || 0,
      hints: s.hints,
      shakes: s.shakes,
      merges: s.merges,
      largest: largestMembers(s),
      bodyCount: s.bodies.length,
      awarded: Object.keys(s.awarded),
      overflow: s.overflowTimer > 0,
      total: TOTAL
    };
  }

  function consumeEvents(s) {
    if (!s) return [];
    return s.events.splice(0, s.events.length);
  }

  return {
    data: DATA,
    prefectures: PREFECTURES,
    regions: DATA.regions,
    regionOrder: REGION_ORDER,
    regionLabel: REGION_LABEL,
    regionColor: REGION_COLOR,
    byCode: BY_CODE,
    byRegion: BY_REGION,
    total: TOTAL,
    world: WORLD,
    createRun: createRun,
    tick: tick,
    setActiveX: setActiveX,
    moveActive: moveActive,
    dropActive: dropActive,
    activeWorld: activeWorld,
    spawnYFor: spawnYFor,
    activeRange: activeRange,
    targetForActive: targetForActive,
    useHint: useHint,
    shake: shake,
    setPaused: setPaused,
    getState: getState,
    consumeEvents: consumeEvents,
    addPiece: addBody,
    topOf: topOf,
    largestMembers: largestMembers
  };
});
