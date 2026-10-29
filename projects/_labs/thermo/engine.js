/* engine.js : THERMO のコアロジック（UI非依存・描画非依存）
 *
 * 冷えた施設で、体の熱を物体と交換しながら出口を目指すグリッドパズル。
 * 水は熱を吸って凍り、氷は熱を放って溶け、扉は熱を放って開く。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ThermoEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SAFE_MIN = 20;
  var SAFE_MAX = 80;
  var START_TEMP = 50;
  var EXCHANGE = 15;

  var LEVELS = [
    {
      name: 'THAW',
      rows: [
        '###########',
        '#P........#',
        '#.........#',
        '#~~~~~~~~~#',
        '#.........#',
        '####D######',
        '#........X#',
        '###########'
      ]
    },
    {
      name: 'CROSSING',
      rows: [
        '###########',
        '#P........#',
        '#~~~~~~~~~#',
        '#.........#',
        '#~~~~~~~~~#',
        '#.........#',
        '####D######',
        '#........X#',
        '###########'
      ]
    },
    {
      name: 'LOCKS',
      rows: [
        '###########',
        '#P........#',
        '#~~~~~~~~~#',
        '#.........#',
        '#####D#####',
        '#.........#',
        '#####D#####',
        '#........X#',
        '###########'
      ]
    },
    {
      name: 'DUAL',
      rows: [
        '###########',
        '#P........#',
        '#~~~~~~~~~#',
        '#.........#',
        '#####D#####',
        '#.........#',
        '#~~~~~~~~~#',
        '#....D...X#',
        '###########'
      ]
    },
    {
      name: 'CORE',
      rows: [
        '###########',
        '#P...E....#',
        '#~~~~~~~~~#',
        '#.........#',
        '#####D#####',
        '#.........#',
        '#####D#####',
        '#.........#',
        '#####D#####',
        '#....D...X#',
        '###########'
      ]
    }
  ];

  var SOLUTIONS = [
    'RRRDADDDEDDDRRRRR',
    'RRRADDDADDDEDDDRRRRR',
    'RRRRADDDEDDDEDDDRRRR',
    'RRRRADDDEDDDRRRRADDD',
    'RRRARRADDDEDDDEDDDEDDEDDRRRR'
  ];

  var DIRS = {
    U: [0, -1],
    R: [1, 0],
    D: [0, 1],
    L: [-1, 0]
  };
  var PASSABLE = { '.': true, X: true, '*': true, O: true };
  var SPECIAL = { '~': true, '*': true, E: true, D: true };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function createGame() {
    var state = {
      phase: 'start',
      levelIndex: 0,
      level: 1,
      levelCount: LEVELS.length,
      levelName: LEVELS[0].name,
      grid: [],
      player: { x: 1, y: 1, facing: 'D' },
      temp: START_TEMP,
      safeMin: SAFE_MIN,
      safeMax: SAFE_MAX,
      levelMoves: 0,
      levelTime: 0,
      totalMoves: 0,
      totalTime: 0,
      autoIndex: 0,
      result: null,
      reason: '',
      events: []
    };

    function parseLevel(index) {
      var level = LEVELS[index];
      var rows = level.rows;
      var grid = [];
      var start = { x: 1, y: 1 };
      for (var y = 0; y < rows.length; y++) {
        var line = [];
        for (var x = 0; x < rows[y].length; x++) {
          var ch = rows[y][x];
          if (ch === 'P') { start = { x: x, y: y }; ch = '.'; }
          line.push(ch);
        }
        grid.push(line);
      }
      state.grid = grid;
      state.player = { x: start.x, y: start.y, facing: 'D' };
      state.levelIndex = index;
      state.level = index + 1;
      state.levelName = level.name;
      state.levelCount = LEVELS.length;
      state.temp = START_TEMP;
      state.levelMoves = 0;
      state.levelTime = 0;
      state.autoIndex = 0;
      state.result = null;
      state.reason = '';
      state.events = [];
    }

    function start() {
      state.totalMoves = 0;
      state.totalTime = 0;
      parseLevel(0);
      state.phase = 'playing';
      return true;
    }

    function reset() {
      state.phase = 'start';
      state.totalMoves = 0;
      state.totalTime = 0;
      parseLevel(0);
      return true;
    }

    function tileAt(x, y) {
      if (!state.grid[y] || state.grid[y][x] == null) return '#';
      return state.grid[y][x];
    }

    function targetAt(dx, dy) {
      var x = state.player.x + dx;
      var y = state.player.y + dy;
      var tile = tileAt(x, y);
      var kind = '';
      if (tile === '~' || tile === 'E') kind = 'absorb';
      else if (tile === '*' || tile === 'D') kind = 'emit';
      return { x: x, y: y, tile: tile, kind: kind };
    }

    function targetInfo() {
      var order = ['U', 'R', 'D', 'L'];
      var f = DIRS[state.player.facing] || DIRS.D;
      var front = targetAt(f[0], f[1]);
      if (front.kind) return front;
      for (var i = 0; i < order.length; i++) {
        var d = DIRS[order[i]];
        var t = targetAt(d[0], d[1]);
        if (t.kind) return t;
      }
      return front;
    }

    function fail(reason) {
      state.phase = 'failed';
      state.reason = reason;
      state.result = {
        level: state.level,
        levelCount: state.levelCount,
        levelName: state.levelName,
        temp: state.temp,
        moves: state.levelMoves,
        time: state.levelTime,
        totalMoves: state.totalMoves,
        totalTime: state.totalTime,
        allClear: false
      };
      state.events.push({ type: 'fail', reason: reason });
    }

    function finishLevel() {
      state.totalMoves += state.levelMoves;
      state.totalTime += state.levelTime;
      state.events.push({ type: 'clear', level: state.level });
      if (state.levelIndex + 1 >= LEVELS.length) {
        state.phase = 'finished';
        state.result = {
          level: state.level,
          levelCount: state.levelCount,
          levelName: state.levelName,
          temp: state.temp,
          moves: state.levelMoves,
          time: state.levelTime,
          totalMoves: state.totalMoves,
          totalTime: state.totalTime,
          allClear: true
        };
      } else {
        state.phase = 'levelclear';
        state.result = {
          level: state.level,
          levelCount: state.levelCount,
          levelName: state.levelName,
          temp: state.temp,
          moves: state.levelMoves,
          time: state.levelTime,
          totalMoves: state.totalMoves,
          totalTime: state.totalTime,
          allClear: false
        };
      }
      state.events.push({ type: state.phase === 'finished' ? 'finish' : 'next', x: state.player.x, y: state.player.y });
    }

    function move(dx, dy) {
      if (state.phase !== 'playing') return false;
      if (dx === 0 && dy === -1) state.player.facing = 'U';
      else if (dx === 1 && dy === 0) state.player.facing = 'R';
      else if (dx === 0 && dy === 1) state.player.facing = 'D';
      else if (dx === -1 && dy === 0) state.player.facing = 'L';
      var nx = state.player.x + dx;
      var ny = state.player.y + dy;
      if (!PASSABLE[tileAt(nx, ny)]) {
        return false;
      }
      state.player.x = nx;
      state.player.y = ny;
      state.levelMoves += 1;
      if (tileAt(nx, ny) === 'X') finishLevel();
      return true;
    }

    function action(dx, dy) {
      if (state.phase !== 'playing') return false;
      var target;
      if (dx == null || dy == null) {
        target = targetInfo();
        dx = target.x - state.player.x;
        dy = target.y - state.player.y;
      } else {
        if (dx === 0 && dy === -1) state.player.facing = 'U';
        else if (dx === 1 && dy === 0) state.player.facing = 'R';
        else if (dx === 0 && dy === 1) state.player.facing = 'D';
        else if (dx === -1 && dy === 0) state.player.facing = 'L';
        target = targetAt(dx, dy);
      }
      var x = target.x;
      var y = target.y;
      var tile = target.tile;
      if (!SPECIAL[tile]) return false;
      if (tile === '~' || tile === 'E') {
        state.temp += EXCHANGE;
        state.grid[y][x] = tile === '~' ? '*' : '.';
        state.events.push({ type: 'absorb', x: x, y: y });
      } else {
        state.temp -= EXCHANGE;
        state.grid[y][x] = tile === '*' ? '~' : 'O';
        state.events.push({ type: 'emit', x: x, y: y });
      }
      state.levelMoves += 1;
      if (state.temp < SAFE_MIN) fail('FREEZE');
      else if (state.temp > SAFE_MAX) fail('OVERHEAT');
      return true;
    }

    function nextLevel() {
      if (state.phase !== 'levelclear') return false;
      parseLevel(state.levelIndex + 1);
      state.phase = 'playing';
      return true;
    }

    function retryLevel() {
      if (state.phase !== 'failed') return false;
      parseLevel(state.levelIndex);
      state.phase = 'playing';
      return true;
    }

    function update(t, dt) {
      if (state.phase !== 'playing') return getState();
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      state.levelTime += Math.min(0.1, dt);
      return getState();
    }

    function autoPlayStep() {
      if (state.phase === 'levelclear') { nextLevel(); return; }
      if (state.phase === 'failed') { retryLevel(); return; }
      if (state.phase !== 'playing') return;
      var script = SOLUTIONS[state.levelIndex] || '';
      if (state.autoIndex >= script.length) return;
      var ch = script[state.autoIndex];
      if (DIRS[ch]) {
        move(DIRS[ch][0], DIRS[ch][1]);
        state.autoIndex += 1;
      } else if (ch === 'A' || ch === 'E') {
        var d = DIRS[script[state.autoIndex + 1]];
        if (d) action(d[0], d[1]);
        state.autoIndex += 2;
      } else {
        state.autoIndex += 1;
      }
    }

    function getState() {
      return {
        phase: state.phase,
        level: state.level,
        levelIndex: state.levelIndex,
        levelCount: state.levelCount,
        levelName: state.levelName,
        grid: state.grid.map(function (row) { return row.slice(); }),
        player: { x: state.player.x, y: state.player.y, facing: state.player.facing },
        temp: state.temp,
        safeMin: state.safeMin,
        safeMax: state.safeMax,
        levelMoves: state.levelMoves,
        levelTime: state.levelTime,
        totalMoves: state.totalMoves,
        totalTime: state.totalTime,
        target: targetInfo(),
        result: state.result,
        reason: state.reason,
        events: state.events.slice()
      };
    }

    parseLevel(0);
    return {
      state: state,
      start: start,
      reset: reset,
      update: update,
      move: move,
      action: action,
      nextLevel: nextLevel,
      retryLevel: retryLevel,
      autoPlayStep: autoPlayStep,
      getState: getState
    };
  }

  return {
    createGame: createGame,
    SAFE_MIN: SAFE_MIN,
    SAFE_MAX: SAFE_MAX,
    START_TEMP: START_TEMP,
    EXCHANGE: EXCHANGE,
    LEVELS: LEVELS,
    SOLUTIONS: SOLUTIONS
  };
});
