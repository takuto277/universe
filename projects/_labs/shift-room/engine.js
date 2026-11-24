/* engine.js : SHIFT ROOM のコアロジック（UI非依存・描画非依存）
 *
 * 見ていない鍵と扉は 0.8 秒で別の場所へ跳ぶ。
 * 視線の円錐に入れている間だけ、位置が固定される。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShiftRoomEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ROOM_COUNT = 3;
  var KEYS_PER_ROOM = 3;
  var TOTAL_TIME = 180;
  var SHIFT_TIME = 0.8;
  var GAZE_ANGLE = 55 * Math.PI / 180;
  var GAZE_HALF = GAZE_ANGLE / 2;
  var GAZE_RANGE = 1600;
  var PLAYER_RADIUS = 16;
  var PLAYER_SPEED = 250;
  var KEY_RADIUS = 12;
  var DOOR_RADIUS = 26;
  var KEY_POINTS = 100;
  var ROOM_BONUS = 300;
  var VICTORY_BONUS = 500;
  var TIME_BONUS = 15;
  var DEFAULT_SEED = 20261111;
  var CELL = 25;

  var ROOMS = [
    {
      id: 'storage',
      name: 'COLD STORAGE',
      subtitle: '冷たい保管室',
      width: 900,
      height: 900,
      palette: {
        bg: '#03080e',
        floor: '#07141c',
        line: '#123442',
        wall: '#16303c',
        wallEdge: '#2f6d7f',
        accent: '#6ff2ff',
        key: '#8dfaff',
        door: '#ffd166',
        player: '#e8feff'
      },
      walls: [
        { x: 120, y: 120, w: 220, h: 40 },
        { x: 560, y: 120, w: 220, h: 40 },
        { x: 430, y: 220, w: 40, h: 230 },
        { x: 120, y: 520, w: 260, h: 40 },
        { x: 640, y: 520, w: 180, h: 160 }
      ],
      keySlots: [
        { x: 180, y: 270 }, { x: 720, y: 280 }, { x: 250, y: 720 },
        { x: 700, y: 720 }, { x: 300, y: 430 }, { x: 620, y: 400 },
        { x: 90, y: 460 }, { x: 810, y: 460 }, { x: 450, y: 500 },
        { x: 450, y: 650 }
      ],
      doorSlots: [
        { x: 450, y: 85 }, { x: 90, y: 450 }, { x: 810, y: 450 }
      ],
      start: { x: 450, y: 800 }
    },
    {
      id: 'signal',
      name: 'SIGNAL HALL',
      subtitle: '信号の広間',
      width: 900,
      height: 900,
      palette: {
        bg: '#0d0509',
        floor: '#1a0a11',
        line: '#3a1220',
        wall: '#2a1018',
        wallEdge: '#7a2740',
        accent: '#ff5d7e',
        key: '#ffb3c1',
        door: '#ffe066',
        player: '#ffe9ee'
      },
      walls: [
        { x: 220, y: 250, w: 460, h: 36 },
        { x: 220, y: 614, w: 460, h: 36 },
        { x: 220, y: 250, w: 36, h: 150 },
        { x: 644, y: 250, w: 36, h: 150 },
        { x: 220, y: 500, w: 36, h: 150 },
        { x: 644, y: 500, w: 36, h: 150 },
        { x: 420, y: 420, w: 60, h: 60 }
      ],
      keySlots: [
        { x: 140, y: 150 }, { x: 760, y: 150 }, { x: 140, y: 760 },
        { x: 760, y: 760 }, { x: 500, y: 170 }, { x: 500, y: 730 },
        { x: 130, y: 450 }, { x: 770, y: 450 }, { x: 450, y: 340 },
        { x: 450, y: 570 }
      ],
      doorSlots: [
        { x: 450, y: 85 }, { x: 90, y: 450 }, { x: 810, y: 450 }
      ],
      start: { x: 450, y: 820 }
    },
    {
      id: 'engine',
      name: 'VOID ENGINE',
      subtitle: '虚無の機関室',
      width: 900,
      height: 900,
      palette: {
        bg: '#070510',
        floor: '#110b1f',
        line: '#261a42',
        wall: '#1d1533',
        wallEdge: '#6b4fa6',
        accent: '#b98bff',
        key: '#d9b8ff',
        door: '#9dffb0',
        player: '#efe6ff'
      },
      walls: [
        { x: 100, y: 200, w: 300, h: 30 },
        { x: 500, y: 200, w: 300, h: 30 },
        { x: 100, y: 670, w: 300, h: 30 },
        { x: 500, y: 670, w: 300, h: 30 },
        { x: 200, y: 320, w: 30, h: 260 },
        { x: 670, y: 320, w: 30, h: 260 },
        { x: 430, y: 430, w: 40, h: 40 }
      ],
      keySlots: [
        { x: 150, y: 150 }, { x: 450, y: 150 }, { x: 750, y: 150 },
        { x: 150, y: 760 }, { x: 450, y: 760 }, { x: 750, y: 760 },
        { x: 320, y: 450 }, { x: 580, y: 450 }, { x: 450, y: 350 },
        { x: 450, y: 560 }
      ],
      doorSlots: [
        { x: 450, y: 85 }, { x: 90, y: 450 }, { x: 810, y: 450 }
      ],
      start: { x: 450, y: 820 }
    }
  ];

  var GRID_CACHE = {};

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function distanceSq(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return dx * dx + dy * dy;
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function circleHitsRect(px, py, radius, rect) {
    var cx = clamp(px, rect.x, rect.x + rect.w);
    var cy = clamp(py, rect.y, rect.y + rect.h);
    var dx = px - cx;
    var dy = py - cy;
    return dx * dx + dy * dy < radius * radius;
  }

  function walkableAt(def, x, y, radius) {
    if (x < radius || y < radius || x > def.width - radius || y > def.height - radius) return false;
    for (var i = 0; i < def.walls.length; i++) {
      if (circleHitsRect(x, y, radius, def.walls[i])) return false;
    }
    return true;
  }

  function getGrid(index) {
    if (GRID_CACHE[index]) return GRID_CACHE[index];
    var def = ROOMS[index];
    var cols = Math.floor(def.width / CELL);
    var rows = Math.floor(def.height / CELL);
    var walk = new Array(cols * rows);
    for (var gy = 0; gy < rows; gy++) {
      for (var gx = 0; gx < cols; gx++) {
        walk[gy * cols + gx] = walkableAt(def, gx * CELL + CELL / 2, gy * CELL + CELL / 2, PLAYER_RADIUS);
      }
    }
    GRID_CACHE[index] = { cols: cols, rows: rows, walk: walk, cell: CELL };
    return GRID_CACHE[index];
  }

  function nearestWalkableCell(grid, x, y) {
    var cx = clamp(Math.floor(x / grid.cell), 0, grid.cols - 1);
    var cy = clamp(Math.floor(y / grid.cell), 0, grid.rows - 1);
    for (var ring = 0; ring <= 14; ring++) {
      for (var dy = -ring; dy <= ring; dy++) {
        for (var dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          var gx = cx + dx;
          var gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) continue;
          if (!grid.walk[gy * grid.cols + gx]) continue;
          return { gx: gx, gy: gy, x: gx * grid.cell + grid.cell / 2, y: gy * grid.cell + grid.cell / 2 };
        }
      }
    }
    return null;
  }

  function bfsPath(grid, start, goal) {
    var cols = grid.cols;
    var rows = grid.rows;
    var walk = grid.walk;
    var startIndex = start.gy * cols + start.gx;
    var goalIndex = goal.gy * cols + goal.gx;
    if (!walk[startIndex] || !walk[goalIndex]) return [];
    if (startIndex === goalIndex) return [];

    var prev = new Array(cols * rows);
    for (var i = 0; i < prev.length; i++) prev[i] = -1;
    var queue = [startIndex];
    var head = 0;
    prev[startIndex] = startIndex;
    var dxs = [1, -1, 0, 0];
    var dys = [0, 0, 1, -1];

    while (head < queue.length) {
      var cur = queue[head++];
      if (cur === goalIndex) break;
      var cx = cur % cols;
      var cy = (cur - cx) / cols;
      for (var k = 0; k < 4; k++) {
        var nx = cx + dxs[k];
        var ny = cy + dys[k];
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        var ni = ny * cols + nx;
        if (!walk[ni] || prev[ni] !== -1) continue;
        prev[ni] = cur;
        queue.push(ni);
      }
    }

    if (prev[goalIndex] === -1) return [];
    var cells = [];
    var node = goalIndex;
    while (node !== startIndex) {
      cells.push(node);
      node = prev[node];
    }
    cells.reverse();
    var points = [];
    for (var p = 0; p < cells.length; p++) {
      var index = cells[p];
      var gx = index % cols;
      var gy = (index - gx) / cols;
      points.push({ x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2 });
    }
    return points;
  }

  function createGame(options) {
    options = options || {};
    var initialSeed = (typeof options === 'number')
      ? (options >>> 0)
      : (options.seed != null ? (options.seed >>> 0) : DEFAULT_SEED);

    var rng = mulberry32(initialSeed);
    var def = ROOMS[0];

    var state = {
      seed: initialSeed,
      phase: 'start',
      over: false,
      roomIndex: 0,
      roomCount: ROOM_COUNT,
      time: 0,
      timeLeft: TOTAL_TIME,
      totalTime: TOTAL_TIME,
      moveX: 0,
      moveY: 0,
      aimAngle: -Math.PI / 2,
      player: { x: ROOMS[0].start.x, y: ROOMS[0].start.y, r: PLAYER_RADIUS },
      keys: [],
      keysCollected: 0,
      totalKeys: 0,
      door: null,
      doorOpen: false,
      score: 0,
      roomsCleared: 0,
      shifts: 0,
      transitionTimer: 0,
      pendingRoom: -1,
      events: [],
      result: null
    };

    var ai = {
      path: [],
      planTime: -1,
      targetKind: '',
      targetIndex: -1,
      targetX: -9999,
      targetY: -9999,
      roomIndex: -1
    };

    function rand() {
      return rng();
    }

    function emit(type, extra) {
      var ev = { type: type };
      if (extra) {
        for (var key in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, key)) ev[key] = extra[key];
        }
      }
      state.events.push(ev);
    }

    function resetAi() {
      ai.path = [];
      ai.planTime = -1;
      ai.targetKind = '';
      ai.targetIndex = -1;
      ai.targetX = -9999;
      ai.targetY = -9999;
      ai.roomIndex = state.roomIndex;
    }

    function loadRoom(index) {
      state.roomIndex = index;
      def = ROOMS[index];
      state.player.x = def.start.x;
      state.player.y = def.start.y;
      state.moveX = 0;
      state.moveY = 0;
      state.aimAngle = -Math.PI / 2;
      state.keysCollected = 0;
      state.doorOpen = false;
      state.keys = [];

      var pool = [];
      for (var i = 0; i < def.keySlots.length; i++) pool.push(i);
      for (var k = 0; k < KEYS_PER_ROOM; k++) {
        var pickIndex = Math.floor(rand() * pool.length);
        var slotIndex = pool[pickIndex];
        pool.splice(pickIndex, 1);
        var slot = def.keySlots[slotIndex];
        state.keys.push({
          id: 'key-' + index + '-' + k,
          x: slot.x,
          y: slot.y,
          r: KEY_RADIUS,
          slotIndex: slotIndex,
          collected: false,
          unseen: 0,
          shifts: 0
        });
      }

      var doorSlotIndex = Math.floor(rand() * def.doorSlots.length);
      var doorSlot = def.doorSlots[doorSlotIndex];
      state.door = {
        x: doorSlot.x,
        y: doorSlot.y,
        r: DOOR_RADIUS,
        slotIndex: doorSlotIndex,
        open: false,
        unseen: 0,
        shifts: 0
      };

      resetAi();
      emit('room', { room: index, name: def.name });
    }

    function resetRun(phase) {
      rng = mulberry32(initialSeed);
      state.seed = initialSeed;
      state.phase = phase || 'playing';
      state.over = false;
      state.time = 0;
      state.timeLeft = TOTAL_TIME;
      state.moveX = 0;
      state.moveY = 0;
      state.aimAngle = -Math.PI / 2;
      state.totalKeys = 0;
      state.score = 0;
      state.roomsCleared = 0;
      state.shifts = 0;
      state.transitionTimer = 0;
      state.pendingRoom = -1;
      state.result = null;
      state.events = [];
      state.roomIndex = 0;
      loadRoom(0);
    }

    function start() {
      resetRun('playing');
      return true;
    }

    function restart(seed) {
      if (seed != null) initialSeed = seed >>> 0;
      resetRun('playing');
      return true;
    }

    function reset() {
      resetRun('start');
      return true;
    }

    function setMove(x, y) {
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return false;
      var len = Math.sqrt(x * x + y * y);
      if (len > 1) {
        x = x / len;
        y = y / len;
      }
      state.moveX = x;
      state.moveY = y;
      return true;
    }

    function setAim(x, y) {
      if (typeof y === 'undefined') {
        if (typeof x !== 'number' || !isFinite(x)) return false;
        state.aimAngle = normalizeAngle(x);
        return true;
      }
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) return false;
      if (x * x + y * y < 0.000001) return false;
      state.aimAngle = Math.atan2(y, x);
      return true;
    }

    function setAimAngle(angle) {
      if (typeof angle !== 'number' || !isFinite(angle)) return false;
      state.aimAngle = normalizeAngle(angle);
      return true;
    }

    function setAimAt(x, y) {
      var dx = x - state.player.x;
      var dy = y - state.player.y;
      if (dx * dx + dy * dy < 0.000001) return false;
      state.aimAngle = Math.atan2(dy, dx);
      return true;
    }

    function isInGaze(x, y, radius) {
      var r = typeof radius === 'number' ? Math.abs(radius) : 0;
      var dx = x - state.player.x;
      var dy = y - state.player.y;
      var distSq = dx * dx + dy * dy;
      if (distSq > (GAZE_RANGE + r) * (GAZE_RANGE + r)) return false;
      var dist = Math.sqrt(distSq);
      if (dist <= r + 0.001) return true;
      var diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - state.aimAngle));
      var allowance = GAZE_HALF;
      if (r > 0) {
        var ratio = Math.min(1, r / Math.max(dist, 0.001));
        allowance += Math.asin(ratio);
      }
      return diff <= allowance;
    }

    function collides(x, y) {
      for (var i = 0; i < def.walls.length; i++) {
        if (circleHitsRect(x, y, state.player.r, def.walls[i])) return true;
      }
      return false;
    }

    function tryMove(dx, dy) {
      var nx = clamp(state.player.x + dx, state.player.r, def.width - state.player.r);
      var ny = clamp(state.player.y + dy, state.player.r, def.height - state.player.r);
      if (!collides(nx, ny)) {
        state.player.x = nx;
        state.player.y = ny;
      }
    }

    function updatePlayer(dt) {
      var mx = state.moveX;
      var my = state.moveY;
      if (mx === 0 && my === 0) return;
      var len = Math.sqrt(mx * mx + my * my);
      if (len > 1) {
        mx = mx / len;
        my = my / len;
      }
      var step = PLAYER_SPEED * dt;
      tryMove(mx * step, 0);
      tryMove(0, my * step);
    }

    function keyOccupiesSlot(slotIndex, ignoreKey) {
      for (var i = 0; i < state.keys.length; i++) {
        var key = state.keys[i];
        if (key === ignoreKey || key.collected) continue;
        if (key.slotIndex === slotIndex) return true;
      }
      return false;
    }

    function shiftKey(key) {
      var slots = def.keySlots;
      var candidates = [];
      for (var i = 0; i < slots.length; i++) {
        if (i === key.slotIndex) continue;
        if (keyOccupiesSlot(i, key)) continue;
        if (isInGaze(slots[i].x, slots[i].y, KEY_RADIUS)) continue;
        candidates.push(i);
      }
      if (candidates.length === 0) {
        key.unseen = 0;
        return false;
      }
      var pick = candidates[Math.floor(rand() * candidates.length)];
      var slot = slots[pick];
      var fromX = key.x;
      var fromY = key.y;
      key.slotIndex = pick;
      key.x = slot.x;
      key.y = slot.y;
      key.unseen = 0;
      key.shifts += 1;
      state.shifts += 1;
      emit('shift', { kind: 'key', id: key.id, fromX: fromX, fromY: fromY, x: key.x, y: key.y });
      return true;
    }

    function shiftDoor() {
      var slots = def.doorSlots;
      var candidates = [];
      for (var i = 0; i < slots.length; i++) {
        if (i === state.door.slotIndex) continue;
        if (isInGaze(slots[i].x, slots[i].y, DOOR_RADIUS)) continue;
        candidates.push(i);
      }
      if (candidates.length === 0) {
        state.door.unseen = 0;
        return false;
      }
      var pick = candidates[Math.floor(rand() * candidates.length)];
      var slot = slots[pick];
      var fromX = state.door.x;
      var fromY = state.door.y;
      state.door.slotIndex = pick;
      state.door.x = slot.x;
      state.door.y = slot.y;
      state.door.unseen = 0;
      state.door.shifts += 1;
      state.shifts += 1;
      emit('shift', { kind: 'door', fromX: fromX, fromY: fromY, x: state.door.x, y: state.door.y });
      return true;
    }

    function updateObjects(dt) {
      for (var i = 0; i < state.keys.length; i++) {
        var key = state.keys[i];
        if (key.collected) continue;
        if (isInGaze(key.x, key.y, key.r)) {
          key.unseen = 0;
        } else {
          key.unseen += dt;
          if (key.unseen >= SHIFT_TIME) shiftKey(key);
        }
      }

      if (isInGaze(state.door.x, state.door.y, state.door.r)) {
        state.door.unseen = 0;
      } else {
        state.door.unseen += dt;
        if (state.door.unseen >= SHIFT_TIME) shiftDoor();
      }
    }

    function collectKey(key) {
      if (key.collected || state.phase !== 'playing') return false;
      key.collected = true;
      state.keysCollected += 1;
      state.totalKeys += 1;
      state.score += KEY_POINTS;
      emit('key', { id: key.id, x: key.x, y: key.y, count: state.keysCollected });
      return true;
    }

    function clearRoom() {
      if (state.phase !== 'playing' || !state.doorOpen) return false;
      state.roomsCleared += 1;
      state.score += ROOM_BONUS;
      emit('roomclear', { room: state.roomIndex, rooms: state.roomsCleared });
      if (state.roomsCleared >= ROOM_COUNT) {
        finishVictory();
      } else {
        state.phase = 'transition';
        state.transitionTimer = 0.9;
        state.pendingRoom = state.roomIndex + 1;
        state.moveX = 0;
        state.moveY = 0;
        loadRoom(state.pendingRoom);
        state.phase = 'transition';
        emit('transition', { next: state.roomIndex });
      }
      return true;
    }

    function updatePickups() {
      for (var i = 0; i < state.keys.length; i++) {
        var key = state.keys[i];
        if (key.collected) continue;
        var radius = state.player.r + key.r + 6;
        if (distanceSq(state.player.x, state.player.y, key.x, key.y) <= radius * radius) {
          collectKey(key);
        }
      }

      if (!state.doorOpen && state.keysCollected >= KEYS_PER_ROOM) {
        state.doorOpen = true;
        state.door.open = true;
        emit('dooropen', { room: state.roomIndex });
      }

      if (state.doorOpen) {
        var doorRadius = state.player.r + state.door.r + 8;
        if (distanceSq(state.player.x, state.player.y, state.door.x, state.door.y) <= doorRadius * doorRadius) {
          clearRoom();
        }
      }
    }

    function grade(won) {
      if (!won) return 'D';
      if (state.score >= 3800) return 'S';
      if (state.score >= 3000) return 'A';
      if (state.score >= 2200) return 'B';
      return 'C';
    }

    function finishVictory() {
      state.phase = 'victory';
      state.over = true;
      var timeBonus = Math.round(state.timeLeft * TIME_BONUS);
      state.score += VICTORY_BONUS + timeBonus;
      state.result = {
        won: true,
        reason: 'escaped',
        rank: grade(true),
        score: state.score,
        timeLeft: state.timeLeft,
        timeUsed: TOTAL_TIME - state.timeLeft,
        totalKeys: state.totalKeys,
        rooms: state.roomsCleared,
        shifts: state.shifts,
        bonus: VICTORY_BONUS + timeBonus
      };
      emit('victory', { score: state.result.score, rank: state.result.rank });
    }

    function endGame(reason) {
      if (state.phase !== 'playing') return false;
      state.phase = 'over';
      state.over = true;
      state.result = {
        won: false,
        reason: reason || 'time',
        rank: 'D',
        score: state.score,
        timeLeft: 0,
        timeUsed: TOTAL_TIME,
        totalKeys: state.totalKeys,
        rooms: state.roomsCleared,
        shifts: state.shifts,
        bonus: 0
      };
      emit('over', { reason: state.result.reason });
      return true;
    }

    function update(dt) {
      if (state.phase !== 'playing' && state.phase !== 'transition') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);

      if (state.phase === 'transition') {
        state.transitionTimer -= dt;
        if (state.transitionTimer <= 0) {
          state.pendingRoom = -1;
          state.transitionTimer = 0;
          state.phase = 'playing';
        }
        return getState();
      }

      state.time += dt;
      state.timeLeft = Math.max(0, state.timeLeft - dt);
      updatePlayer(dt);
      updateObjects(dt);
      updatePickups();

      if (state.phase === 'playing' && state.timeLeft <= 0) endGame('time');
      return getState();
    }

    function autoTarget() {
      var best = null;
      var bestIndex = -1;
      var bestDist = Infinity;
      for (var i = 0; i < state.keys.length; i++) {
        var key = state.keys[i];
        if (key.collected) continue;
        var d = distanceSq(state.player.x, state.player.y, key.x, key.y);
        if (d < bestDist) {
          bestDist = d;
          best = key;
          bestIndex = i;
        }
      }
      if (best) return { kind: 'key', index: bestIndex, x: best.x, y: best.y };
      if (state.door) return { kind: 'door', index: -1, x: state.door.x, y: state.door.y };
      return null;
    }

    function planPath(tx, ty) {
      var grid = getGrid(state.roomIndex);
      var start = nearestWalkableCell(grid, state.player.x, state.player.y);
      var goal = nearestWalkableCell(grid, tx, ty);
      if (!start || !goal) {
        ai.path = [];
        return;
      }
      ai.path = bfsPath(grid, start, goal);
    }

    function autoStep() {
      if (state.phase === 'start') {
        start();
        return;
      }
      if (state.phase !== 'playing') return;

      var target = autoTarget();
      if (!target) {
        setMove(0, 0);
        return;
      }

      var p = state.player;
      var adx = target.x - p.x;
      var ady = target.y - p.y;
      if (adx * adx + ady * ady > 1) setAim(adx, ady);

      var now = state.time;
      var changed = target.kind !== ai.targetKind || target.index !== ai.targetIndex;
      var moved = Math.abs(target.x - ai.targetX) + Math.abs(target.y - ai.targetY) > 16;
      var stale = now - ai.planTime > 0.55;

      if (changed || moved || stale || ai.path.length === 0 || ai.roomIndex !== state.roomIndex) {
        planPath(target.x, target.y);
        ai.targetKind = target.kind;
        ai.targetIndex = target.index;
        ai.targetX = target.x;
        ai.targetY = target.y;
        ai.planTime = now;
        ai.roomIndex = state.roomIndex;
      }

      var waypoint = ai.path.length ? ai.path[0] : null;
      if (waypoint) {
        var wdx = waypoint.x - p.x;
        var wdy = waypoint.y - p.y;
        var wd = Math.sqrt(wdx * wdx + wdy * wdy);
        if (wd < 14) {
          ai.path.shift();
          waypoint = ai.path.length ? ai.path[0] : null;
          if (waypoint) {
            wdx = waypoint.x - p.x;
            wdy = waypoint.y - p.y;
            wd = Math.sqrt(wdx * wdx + wdy * wdy);
          }
        }
        if (waypoint && wd > 0.001) {
          setMove(wdx / wd, wdy / wd);
          return;
        }
      }

      var len = Math.sqrt(adx * adx + ady * ady);
      if (len > 0.001) setMove(adx / len, ady / len);
      else setMove(0, 0);
    }

    function getState() {
      var keysView = [];
      for (var i = 0; i < state.keys.length; i++) {
        var key = state.keys[i];
        keysView.push({
          id: key.id,
          x: key.x,
          y: key.y,
          r: key.r,
          slotIndex: key.slotIndex,
          collected: key.collected,
          unseen: key.unseen,
          shifts: key.shifts
        });
      }

      var wallsView = [];
      for (var w = 0; w < def.walls.length; w++) {
        var wall = def.walls[w];
        wallsView.push({ x: wall.x, y: wall.y, w: wall.w, h: wall.h });
      }

      var paletteView = {};
      for (var c in def.palette) {
        if (Object.prototype.hasOwnProperty.call(def.palette, c)) paletteView[c] = def.palette[c];
      }

      var doorView = state.door ? {
        x: state.door.x,
        y: state.door.y,
        r: state.door.r,
        slotIndex: state.door.slotIndex,
        open: state.door.open,
        unseen: state.door.unseen,
        shifts: state.door.shifts
      } : null;

      return {
        phase: state.phase,
        over: state.over,
        won: state.phase === 'victory',
        seed: state.seed,
        roomIndex: state.roomIndex,
        roomCount: state.roomCount,
        roomName: def.name,
        roomSubtitle: def.subtitle,
        roomWidth: def.width,
        roomHeight: def.height,
        palette: paletteView,
        walls: wallsView,
        player: { x: state.player.x, y: state.player.y, r: state.player.r },
        aimAngle: state.aimAngle,
        gazeAngle: GAZE_ANGLE,
        gazeAngleDegrees: 55,
        gazeHalfAngle: GAZE_HALF,
        gazeRange: GAZE_RANGE,
        shiftTime: SHIFT_TIME,
        moveX: state.moveX,
        moveY: state.moveY,
        keys: keysView,
        keysCollected: state.keysCollected,
        keysTotal: KEYS_PER_ROOM,
        totalKeys: state.totalKeys,
        keyCount: state.totalKeys,
        rooms: state.roomsCleared,
        door: doorView,
        doorOpen: state.doorOpen,
        time: state.time,
        timeLeft: state.timeLeft,
        totalTime: state.totalTime,
        score: state.score,
        roomsCleared: state.roomsCleared,
        shifts: state.shifts,
        transitionTimer: state.transitionTimer,
        pendingRoom: state.pendingRoom,
        events: state.events.slice(),
        result: state.result
      };
    }

    function getAiState() {
      return {
        path: ai.path.slice(),
        planTime: ai.planTime,
        targetKind: ai.targetKind,
        targetIndex: ai.targetIndex,
        targetX: ai.targetX,
        targetY: ai.targetY
      };
    }

    resetRun('start');

    return {
      state: state,
      start: start,
      restart: restart,
      reset: reset,
      update: update,
      setMove: setMove,
      setAim: setAim,
      setAimAngle: setAimAngle,
      setAimAt: setAimAt,
      isInGaze: isInGaze,
      inGaze: isInGaze,
      autoStep: autoStep,
      getState: getState,
      getAiState: getAiState,
      ROOMS: ROOMS
    };
  }

  return {
    createGame: createGame,
    ROOMS: ROOMS,
    ROOM_COUNT: ROOM_COUNT,
    KEYS_PER_ROOM: KEYS_PER_ROOM,
    TOTAL_TIME: TOTAL_TIME,
    SHIFT_TIME: SHIFT_TIME,
    GAZE_ANGLE: GAZE_ANGLE,
    GAZE_ANGLE_DEG: 55,
    GAZE_HALF: GAZE_HALF,
    GAZE_RANGE: GAZE_RANGE
  };
});
