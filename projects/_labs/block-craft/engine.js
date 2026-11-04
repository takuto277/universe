(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlockCraftEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SX = 30, SY = 18, SZ = 30;
  var BLOCKS = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LEAVES: 5, SAND: 6 };
  var BLOCK_INFO = {
    1: { name: '草', color: 0x74b84c, side: 0x6a9e40, top: 0x8fce57, bottom: 0x835b3c },
    2: { name: '土', color: 0x835b3c, side: 0x7b5236, top: 0x966541, bottom: 0x704a31 },
    3: { name: '石', color: 0x8f9694, side: 0x858d8b, top: 0xa3aba7, bottom: 0x777f7d },
    4: { name: '木', color: 0x95653c, side: 0x8a5b35, top: 0xb37f4b, bottom: 0x75502e },
    5: { name: '葉', color: 0x4b963f, side: 0x408637, top: 0x5cae4b, bottom: 0x3b7a32 },
    6: { name: '砂', color: 0xd8bf79, side: 0xceb36d, top: 0xe7d18b, bottom: 0xbaa05d }
  };
  var HOTBAR = [BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.WOOD, BLOCKS.LEAVES];
  var PLAYER_HALF = 0.3;
  var PLAYER_HEIGHT = 1.75;
  var EYE_HEIGHT = 1.62;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function idx(x, y, z) { return (y * SZ + z) * SX + x; }
  function inBounds(x, y, z) { return x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ; }
  function getBlock(world, x, y, z) {
    if (!inBounds(x, y, z)) return 0;
    return world.blocks[idx(x, y, z)];
  }
  function setBlock(world, x, y, z, type) {
    if (!inBounds(x, y, z)) return false;
    world.blocks[idx(x, y, z)] = type;
    return true;
  }

  function hash(n) {
    var x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function generateWorld(seed) {
    seed = Number(seed) || 1;
    var blocks = new Uint8Array(SX * SY * SZ);
    var heights = new Uint8Array(SX * SZ);
    var x, y, z;
    for (x = 0; x < SX; x++) {
      for (z = 0; z < SZ; z++) {
        var h = 5 + Math.floor(2.1 * Math.sin(x * 0.34 + seed * 0.07) + 1.7 * Math.cos(z * 0.29) + 1.0 * Math.sin((x + z) * 0.13));
        h = clamp(h, 3, SY - 5);
        heights[x + z * SX] = h;
        for (y = 0; y <= h; y++) {
          var type;
          if (y === h) type = h <= 2 ? BLOCKS.SAND : BLOCKS.GRASS;
          else if (y >= h - 2) type = BLOCKS.DIRT;
          else type = BLOCKS.STONE;
          blocks[idx(x, y, z)] = type;
        }
      }
    }
    var trees = [[5, 5], [24, 7], [8, 23], [22, 21], [11, 6], [19, 6], [4, 18], [25, 18]];
    for (var i = 0; i < trees.length; i++) {
      var tx = trees[i][0], tz = trees[i][1];
      var ground = heights[tx + tz * SX];
      if (tx < 2 || tx >= SX - 2 || tz < 2 || tz >= SZ - 2) continue;
      var trunk = 3 + Math.floor(hash(seed + i * 7.3) * 2);
      for (y = ground + 1; y <= ground + trunk; y++) setBlock({ blocks: blocks }, tx, y, tz, BLOCKS.WOOD);
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          for (var dz = -2; dz <= 2; dz++) {
            if (dx * dx + dy * dy + dz * dz > 5.4) continue;
            var lx = tx + dx, ly = ground + trunk + dy, lz = tz + dz;
            if (inBounds(lx, ly, lz) && getBlock({ blocks: blocks }, lx, ly, lz) === 0) setBlock({ blocks: blocks }, lx, ly, lz, BLOCKS.LEAVES);
          }
        }
      }
    }
    for (z = 14; z >= 6; z--) {
      var pathTop = surfaceY({ blocks: blocks }, 15, z);
      if (pathTop >= 0 && pathTop < SY - 1) setBlock({ blocks: blocks }, 15, pathTop, z, BLOCKS.STONE);
    }
    var decor = [];
    var spots = [[12, 12], [16, 12], [11, 14], [19, 13], [14, 10], [18, 10], [10, 10], [20, 16], [13, 16], [17, 15], [9, 15], [21, 14]];
    for (var d = 0; d < spots.length; d++) {
      var dx = spots[d][0], dz = spots[d][1];
      var dy = surfaceY({ blocks: blocks }, dx, dz);
      if (dy >= 0 && getBlock({ blocks: blocks }, dx, dy, dz) === BLOCKS.GRASS && getBlock({ blocks: blocks }, dx, dy + 1, dz) === 0) {
        decor.push({ x: dx, y: dy + 1, z: dz, color: d % 3 === 0 ? 0xff7293 : (d % 3 === 1 ? 0xffd75e : 0xe6f5ff) });
      }
    }
    return { blocks: blocks, heights: heights, seed: seed, decor: decor };
  }

  function surfaceY(world, x, z) {
    for (var y = SY - 1; y >= 0; y--) if (getBlock(world, x, y, z) !== 0) return y;
    return 0;
  }

  function collidesAt(s, x, y, z) {
    var minX = Math.floor(x - PLAYER_HALF + 0.001);
    var maxX = Math.floor(x + PLAYER_HALF - 0.001);
    var minY = Math.floor(y + 0.02);
    var maxY = Math.floor(y + PLAYER_HEIGHT - 0.02);
    var minZ = Math.floor(z - PLAYER_HALF + 0.001);
    var maxZ = Math.floor(z + PLAYER_HALF - 0.001);
    for (var yy = minY; yy <= maxY; yy++) {
      for (var zz = minZ; zz <= maxZ; zz++) {
        for (var xx = minX; xx <= maxX; xx++) {
          if (getBlock(s.world, xx, yy, zz) !== 0) return true;
        }
      }
    }
    return false;
  }

  function lookDir(s) {
    var cp = Math.cos(s.pitch);
    return { x: -Math.sin(s.yaw) * cp, y: Math.sin(s.pitch), z: -Math.cos(s.yaw) * cp };
  }

  function eyePosition(s) {
    return { x: s.position.x, y: s.position.y + EYE_HEIGHT, z: s.position.z };
  }

  function raycastWorld(world, ox, oy, oz, dx, dy, dz, maxDist) {
    var x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    var stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    var stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    var stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
    var tMaxX = stepX === 0 ? Infinity : ((stepX > 0 ? x + 1 - ox : ox - x) / Math.abs(dx));
    var tMaxY = stepY === 0 ? Infinity : ((stepY > 0 ? y + 1 - oy : oy - y) / Math.abs(dy));
    var tMaxZ = stepZ === 0 ? Infinity : ((stepZ > 0 ? z + 1 - oz : oz - z) / Math.abs(dz));
    var tDeltaX = stepX === 0 ? Infinity : 1 / Math.abs(dx);
    var tDeltaY = stepY === 0 ? Infinity : 1 / Math.abs(dy);
    var tDeltaZ = stepZ === 0 ? Infinity : 1 / Math.abs(dz);
    var normal = { x: 0, y: 0, z: 0 };
    var limit = maxDist || 7;
    for (var i = 0; i < 80; i++) {
      var type = getBlock(world, x, y, z);
      if (type !== 0) return { x: x, y: y, z: z, type: type, normal: normal };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > limit) break;
        x += stepX; tMaxX += tDeltaX; normal = { x: -stepX, y: 0, z: 0 };
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > limit) break;
        y += stepY; tMaxY += tDeltaY; normal = { x: 0, y: -stepY, z: 0 };
      } else {
        if (tMaxZ > limit) break;
        z += stepZ; tMaxZ += tDeltaZ; normal = { x: 0, y: 0, z: -stepZ };
      }
    }
    return null;
  }

  function getTarget(s) {
    var p = eyePosition(s), d = lookDir(s);
    return raycastWorld(s.world, p.x, p.y, p.z, d.x, d.y, d.z, 7);
  }

  function intersectsPlayer(s, x, y, z) {
    var p = s.position;
    return x + 1 > p.x - PLAYER_HALF && x < p.x + PLAYER_HALF &&
      y + 1 > p.y && y < p.y + PLAYER_HEIGHT &&
      z + 1 > p.z - PLAYER_HALF && z < p.z + PLAYER_HALF;
  }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 40) s.events.shift();
  }

  function mine(s) {
    if (!s || s.phase !== 'play') return false;
    var t = getTarget(s);
    if (!t) return false;
    if (!setBlock(s.world, t.x, t.y, t.z, 0)) return false;
    s.edits++;
    s.lastAction = 'mine';
    event(s, 'edit', { x: t.x, y: t.y, z: t.z, type: 0, action: 'mine' });
    return true;
  }

  function place(s) {
    if (!s || s.phase !== 'play') return false;
    var t = getTarget(s);
    if (!t) return false;
    var x = t.x + t.normal.x, y = t.y + t.normal.y, z = t.z + t.normal.z;
    if (!inBounds(x, y, z) || getBlock(s.world, x, y, z) !== 0) return false;
    if (intersectsPlayer(s, x, y, z)) return false;
    var type = HOTBAR[clamp(s.selected, 0, HOTBAR.length - 1)];
    if (!setBlock(s.world, x, y, z, type)) return false;
    s.edits++;
    s.lastAction = 'place';
    event(s, 'edit', { x: x, y: y, z: z, type: type, action: 'place' });
    return true;
  }

  function setSelected(s, index) {
    if (!s) return false;
    s.selected = clamp(Number(index) || 0, 0, HOTBAR.length - 1);
    return true;
  }

  function setInput(s, input) {
    if (!s || !input) return;
    if (input.forward !== undefined) s.input.forward = clamp(Number(input.forward) || 0, -1, 1);
    if (input.right !== undefined) s.input.right = clamp(Number(input.right) || 0, -1, 1);
    if (input.jump) s.input.jump = true;
  }

  function look(s, dx, dy) {
    if (!s) return;
    s.yaw -= Number(dx) || 0;
    s.pitch = clamp(s.pitch - (Number(dy) || 0), -1.35, 1.35);
  }

  function moveAxis(s, axis, amount) {
    if (!amount) return;
    var p = s.position;
    if (!collidesAt(s, axis === 'x' ? p.x + amount : p.x, axis === 'y' ? p.y + amount : p.y, axis === 'z' ? p.z + amount : p.z)) {
      p[axis] += amount;
      return;
    }
    if (axis !== 'y' && s.onGround && !collidesAt(s, axis === 'x' ? p.x + amount : p.x, p.y + 1.01, axis === 'z' ? p.z + amount : p.z)) {
      p.y += 1.01;
      p[axis] += amount;
      return;
    }
    s.velocity[axis] = 0;
  }

  function update(s, dt) {
    if (!s || s.phase !== 'play') return s;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    s.elapsed += dt;
    var f = s.input.forward, r = s.input.right;
    var len = Math.sqrt(f * f + r * r);
    if (len > 1) { f /= len; r /= len; }
    var speed = 4.35;
    var sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    s.velocity.x = (f * -sin + r * cos) * speed;
    s.velocity.z = (f * -cos + r * -sin) * speed;
    s.onGround = collidesAt(s, s.position.x, s.position.y - 0.05, s.position.z);
    if (s.input.jump && s.onGround) {
      s.velocity.y = 8.4;
      s.onGround = false;
    }
    s.input.jump = false;
    s.velocity.y -= 22 * dt;
    moveAxis(s, 'x', s.velocity.x * dt);
    moveAxis(s, 'z', s.velocity.z * dt);
    var ny = s.position.y + s.velocity.y * dt;
    if (!collidesAt(s, s.position.x, ny, s.position.z)) {
      s.position.y = ny;
      s.onGround = false;
    } else {
      if (s.velocity.y < 0) {
        s.position.y = Math.floor(ny) + 1.001;
        s.onGround = true;
      }
      s.velocity.y = 0;
    }
    if (s.velocity.y <= 0 && collidesAt(s, s.position.x, s.position.y - 0.05, s.position.z)) {
      s.position.y = Math.round(s.position.y);
      s.velocity.y = 0;
      s.onGround = true;
    }
    s.position.x = clamp(s.position.x, 0.35, SX - 0.35);
    s.position.z = clamp(s.position.z, 0.35, SZ - 0.35);
    if (s.position.y < -8) {
      s.position.y = s.spawn.y;
      s.position.x = s.spawn.x;
      s.position.z = s.spawn.z;
      s.velocity.y = 0;
    }
    return s;
  }

  function createGame(options) {
    options = options || {};
    var seed = options.seed == null ? 1 : options.seed;
    var world = generateWorld(seed);
    var sx = Math.floor(SX / 2), sz = Math.floor(SZ / 2);
    var top = surfaceY(world, sx, sz);
    var spawn = { x: sx + 0.5, y: top + 1.01, z: sz + 0.5 };
    return {
      phase: 'play', seed: seed, world: world, spawn: spawn,
      position: { x: spawn.x, y: spawn.y, z: spawn.z },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0, pitch: -0.08, input: { forward: 0, right: 0, jump: false },
      selected: 0, edits: 0, elapsed: 0, onGround: false, lastAction: '', events: []
    };
  }

  function getState(s) {
    if (!s) return null;
    var t = getTarget(s);
    return {
      id: 'block-craft', phase: s.phase, seed: s.seed,
      position: { x: s.position.x, y: s.position.y, z: s.position.z },
      velocity: { x: s.velocity.x, y: s.velocity.y, z: s.velocity.z },
      yaw: s.yaw, pitch: s.pitch, onGround: s.onGround,
      selected: s.selected, selectedType: HOTBAR[s.selected],
      selectedName: BLOCK_INFO[HOTBAR[s.selected]].name,
      hotbar: HOTBAR, edits: s.edits, lastAction: s.lastAction,
      target: t ? { x: t.x, y: t.y, z: t.z, type: t.type, normal: t.normal } : null,
      size: { x: SX, y: SY, z: SZ }
    };
  }

  function consumeEvents(s) { return s ? s.events.splice(0, s.events.length) : []; }

  return {
    WORLD: { x: SX, y: SY, z: SZ }, BLOCKS: BLOCKS, BLOCK_INFO: BLOCK_INFO,
    HOTBAR: HOTBAR, PLAYER_HALF: PLAYER_HALF, PLAYER_HEIGHT: PLAYER_HEIGHT, EYE_HEIGHT: EYE_HEIGHT,
    createGame: createGame, update: update, setInput: setInput, look: look,
    mine: mine, place: place, setSelected: setSelected, getTarget: getTarget,
    getBlock: getBlock, setBlock: setBlock, getState: getState,
    consumeEvents: consumeEvents, generateWorld: generateWorld
  };
});
