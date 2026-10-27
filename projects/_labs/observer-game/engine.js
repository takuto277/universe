/* engine.js : 観測者（Observer）のコアロジック（UI非依存）
 *
 * 5x5の盤面で、敵は隠れた規則に従って1マスずつ動く。
 * プレイヤーは動きを観測し、次の一手を予測する。
 * 外すとライフが減り、敵の規則が1つ書き換わる。
 * 灯を動かすと「灯へ/灯から」の規則を試せる。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ObserverEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SIZE = 5;
  var MAX_TURNS = 12;
  var MAX_LIVES = 3;
  var MAX_PROBES = 2;

  var DIRS = [
    { name: '上', arrow: '↑', dx: 0, dy: -1 },
    { name: '右', arrow: '→', dx: 1, dy: 0 },
    { name: '下', arrow: '↓', dx: 0, dy: 1 },
    { name: '左', arrow: '←', dx: -1, dy: 0 }
  ];

  var RULE_ORDER = ['straight', 'right', 'left', 'zigzag', 'toward', 'away'];

  var RULES = {
    straight: { label: 'まっすぐ', desc: '同じ方向へ進む。壁なら右へ曲がる。' },
    right: { label: '右回り', desc: '毎回右に曲がって進む。' },
    left: { label: '左回り', desc: '毎回左に曲がって進む。' },
    zigzag: { label: 'ジグザグ', desc: '右と左を交互に曲がる。' },
    toward: { label: '灯へ', desc: '灯に近づく方向へ進む。' },
    away: { label: '灯から', desc: '灯から遠ざかる方向へ進む。' }
  };

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function inBounds(x, y) {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  function createGame(options) {
    options = options || {};
    var initialSeed = (typeof options === 'number') ? options :
      (options.seed != null ? (options.seed >>> 0) : 12345);
    var listeners = [];
    var hasStarted = false;
    var rng = null;
    var ruleRng = null;
    var state = {
      seed: initialSeed >>> 0,
      phase: 'start',
      turn: 1,
      lives: MAX_LIVES,
      correct: 0,
      observations: 0,
      misses: 0,
      probesUsed: 0,
      enemy: { x: 2, y: 2, dir: 0 },
      beacon: { x: 0, y: 0 },
      trail: [],
      lastMove: null,
      rule: 'straight',
      zigzag: 0,
      ruleLog: [],
      ruleVersion: 1,
      feedback: '',
      feedbackType: 'info',
      rank: null,
      score: 0,
      endedReason: '',
      startedAt: 0,
      endedAt: 0
    };

    function emit() {
      var snap = getState();
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](snap); } catch (e) { /* UIの描画失敗で進行を止めない */ }
      }
    }

    function onChange(fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    function setup(seed, phase) {
      state.seed = seed >>> 0;
      state.phase = phase;
      state.turn = 1;
      state.lives = MAX_LIVES;
      state.correct = 0;
      state.observations = 0;
      state.misses = 0;
      state.probesUsed = 0;
      state.lastMove = null;
      state.zigzag = 0;
      state.ruleVersion = 1;
      state.rank = null;
      state.score = 0;
      state.endedReason = '';
      state.startedAt = Date.now();
      state.endedAt = 0;

      rng = mulberry32(state.seed);
      ruleRng = mulberry32((state.seed ^ 0x9e3779b9) >>> 0);

      var ex = 1 + Math.floor(rng() * 3);
      var ey = 1 + Math.floor(rng() * 3);
      var dir = Math.floor(rng() * 4);
      var bx = 0;
      var by = 0;
      var guard = 0;
      do {
        bx = Math.floor(rng() * SIZE);
        by = Math.floor(rng() * SIZE);
        guard += 1;
      } while (guard < 200 && ((bx === ex && by === ey) ||
        Math.abs(bx - ex) + Math.abs(by - ey) < 3));
      if (bx === ex && by === ey) {
        bx = ex < 2 ? SIZE - 1 : 0;
        by = ey < 2 ? SIZE - 1 : 0;
      }

      state.enemy = { x: ex, y: ey, dir: dir };
      state.beacon = { x: bx, y: by };
      state.rule = RULE_ORDER[Math.floor(ruleRng() * RULE_ORDER.length)];
      state.ruleLog = [state.rule];
      state.trail = [{ x: ex, y: ey }];
      state.feedback = phase === 'playing'
        ? 'まずは観測して、動きの規則を読もう。'
        : '';
      state.feedbackType = 'info';
    }

    function currentEnemy() { return state.enemy; }
    function currentBeacon() { return state.beacon; }

    function isWalkable(x, y) {
      return inBounds(x, y) && !(x === state.beacon.x && y === state.beacon.y);
    }

    function firstWalkable(startDir) {
      for (var k = 0; k < 4; k++) {
        var d = (startDir + k) % 4;
        var nx = state.enemy.x + DIRS[d].dx;
        var ny = state.enemy.y + DIRS[d].dy;
        if (isWalkable(nx, ny)) return { x: nx, y: ny, dir: d };
      }
      return { x: state.enemy.x, y: state.enemy.y, dir: state.enemy.dir };
    }

    function computeMove() {
      var e = state.enemy;
      var b = state.beacon;
      var rule = state.rule;
      var dirs;
      var best = null;
      var bestDistance = 0;
      var i;
      var d;
      var nx;
      var ny;
      var distance;

      if (rule === 'straight') return firstWalkable(e.dir);
      if (rule === 'right') return firstWalkable((e.dir + 1) % 4);
      if (rule === 'left') return firstWalkable((e.dir + 3) % 4);
      if (rule === 'zigzag') {
        return firstWalkable((e.dir + (state.zigzag ? 3 : 1)) % 4);
      }
      if (rule === 'toward' || rule === 'away') {
        dirs = [e.dir, (e.dir + 1) % 4, (e.dir + 2) % 4, (e.dir + 3) % 4];
        for (i = 0; i < dirs.length; i++) {
          d = dirs[i];
          nx = e.x + DIRS[d].dx;
          ny = e.y + DIRS[d].dy;
          if (!isWalkable(nx, ny)) continue;
          distance = Math.abs(nx - b.x) + Math.abs(ny - b.y);
          if (best === null ||
            (rule === 'toward' ? distance < bestDistance : distance > bestDistance)) {
            best = { x: nx, y: ny, dir: d };
            bestDistance = distance;
          }
        }
        if (best) return best;
        return { x: e.x, y: e.y, dir: e.dir };
      }
      return firstWalkable(e.dir);
    }

    function applyMove(move) {
      var from = { x: state.enemy.x, y: state.enemy.y };
      state.lastMove = {
        from: from,
        to: { x: move.x, y: move.y },
        dir: move.dir,
        arrow: DIRS[move.dir].arrow,
        name: DIRS[move.dir].name
      };
      state.enemy = { x: move.x, y: move.y, dir: move.dir };
      state.trail.push({ x: move.x, y: move.y });
      if (state.rule === 'zigzag') state.zigzag = state.zigzag ? 0 : 1;
    }

    function optionsView() {
      var list = [];
      for (var d = 0; d < 4; d++) {
        var nx = state.enemy.x + DIRS[d].dx;
        var ny = state.enemy.y + DIRS[d].dy;
        if (isWalkable(nx, ny)) {
          list.push({ x: nx, y: ny, dir: d, arrow: DIRS[d].arrow });
        }
      }
      return list;
    }

    function isOption(x, y) {
      var list = optionsView();
      for (var i = 0; i < list.length; i++) {
        if (list[i].x === x && list[i].y === y) return true;
      }
      return false;
    }

    function changeRule() {
      var current = RULE_ORDER.indexOf(state.rule);
      var index = Math.floor(ruleRng() * (RULE_ORDER.length - 1));
      if (index >= current) index += 1;
      state.rule = RULE_ORDER[index];
      state.ruleLog.push(state.rule);
      state.ruleVersion += 1;
      state.zigzag = 0;
    }

    function endGame(reason) {
      state.phase = 'ending';
      state.endedReason = reason;
      state.endedAt = Date.now();
      state.rank = state.correct >= 7 ? 'S' : (state.correct >= 5 ? 'A' : (state.correct >= 3 ? 'B' : 'C'));
      state.score = state.correct * 10 + state.lives * 3;
      emit();
    }

    function maybeEnd() {
      if (state.phase !== 'playing') return;
      if (state.lives <= 0) {
        endGame('ライフが尽きた');
      } else if (state.turn > MAX_TURNS) {
        endGame('12ターン終了');
      }
    }

    function start() {
      if (state.phase !== 'start') return false;
      var seed = hasStarted ? nextSeed() : state.seed;
      hasStarted = true;
      setup(seed, 'playing');
      emit();
      return true;
    }

    function restart(seed) {
      hasStarted = true;
      setup(seed == null ? nextSeed() : (seed >>> 0), 'playing');
      emit();
      return true;
    }

    function backToStart() {
      state.phase = 'start';
      state.feedback = '';
      emit();
      return true;
    }

    function nextSeed() {
      return Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
    }

    function observe() {
      if (state.phase !== 'playing') return false;
      var move = computeMove();
      applyMove(move);
      state.observations += 1;
      state.turn += 1;
      state.feedback = '観測: ' + DIRS[move.dir].name + 'へ移動した。';
      state.feedbackType = 'observe';
      maybeEnd();
      emit();
      return true;
    }

    function predict(x, y) {
      if (state.phase !== 'playing') return false;
      if (!isOption(x, y)) return false;
      var move = computeMove();
      var correct = move.x === x && move.y === y;
      applyMove(move);
      state.turn += 1;
      if (correct) {
        state.correct += 1;
        state.feedback = '正解! ' + DIRS[move.dir].name + 'へ。 +10';
        state.feedbackType = 'correct';
      } else {
        state.misses += 1;
        state.lives -= 1;
        state.feedback = '外れ。正解は「' + DIRS[move.dir].name + '」。ルールが変わった。';
        state.feedbackType = 'wrong';
        changeRule();
      }
      maybeEnd();
      emit();
      return correct;
    }

    function moveBeacon(x, y) {
      if (state.phase !== 'playing') return false;
      if (state.probesUsed >= MAX_PROBES) return false;
      if (!inBounds(x, y)) return false;
      if (x === state.enemy.x && y === state.enemy.y) return false;
      if (x === state.beacon.x && y === state.beacon.y) return false;
      state.beacon = { x: x, y: y };
      state.probesUsed += 1;
      state.turn += 1;
      state.feedback = '灯を動かした。次の動きを見よう。';
      state.feedbackType = 'probe';
      maybeEnd();
      emit();
      return true;
    }

    function autoStep() {
      if (state.phase === 'start') { start(); return; }
      if (state.phase !== 'playing') return;
      if (state.observations < 2) { observe(); return; }
      var move = computeMove();
      predict(move.x, move.y);
    }

    function ruleCatalogView() {
      return RULE_ORDER.map(function (id) {
        return { id: id, label: RULES[id].label, desc: RULES[id].desc };
      });
    }

    function rulesEncounteredView() {
      if (state.phase !== 'ending') return [];
      var seen = {};
      var list = [];
      for (var i = 0; i < state.ruleLog.length; i++) {
        var id = state.ruleLog[i];
        if (seen[id]) continue;
        seen[id] = true;
        list.push({ id: id, label: RULES[id].label, desc: RULES[id].desc });
      }
      return list;
    }

    function trailView() {
      return state.trail.map(function (t, i) {
        return { x: t.x, y: t.y, index: i };
      });
    }

    function getState() {
      var probesLeft = Math.max(0, MAX_PROBES - state.probesUsed);
      return {
        phase: state.phase,
        over: state.phase === 'ending',
        seed: state.seed,
        size: SIZE,
        turn: state.turn,
        maxTurns: MAX_TURNS,
        lives: state.lives,
        maxLives: MAX_LIVES,
        correct: state.correct,
        observations: state.observations,
        misses: state.misses,
        probesLeft: probesLeft,
        maxProbes: MAX_PROBES,
        enemy: { x: state.enemy.x, y: state.enemy.y, dir: state.enemy.dir },
        beacon: { x: state.beacon.x, y: state.beacon.y },
        trail: trailView(),
        lastMove: state.lastMove,
        options: state.phase === 'playing' ? optionsView() : [],
        canObserve: state.phase === 'playing',
        canPredict: state.phase === 'playing',
        canProbe: state.phase === 'playing' && probesLeft > 0,
        feedback: state.feedback,
        feedbackType: state.feedbackType,
        ruleVersion: state.ruleVersion,
        ruleCatalog: ruleCatalogView(),
        rulesEncountered: rulesEncounteredView(),
        rank: state.rank,
        score: state.score,
        endedReason: state.endedReason,
        endedAt: state.endedAt,
        elapsedMs: state.startedAt ? ((state.endedAt || Date.now()) - state.startedAt) : 0
      };
    }

    function previewNext() { return computeMove(); }

    var gameApi = {
      state: state,
      onChange: onChange,
      start: start,
      restart: restart,
      backToStart: backToStart,
      observe: observe,
      predict: predict,
      moveBeacon: moveBeacon,
      autoStep: autoStep,
      getState: getState,
      previewNext: previewNext
    };

    setup(initialSeed, 'start');
    return gameApi;
  }

  return {
    createGame: createGame,
    SIZE: SIZE,
    MAX_TURNS: MAX_TURNS,
    MAX_LIVES: MAX_LIVES,
    MAX_PROBES: MAX_PROBES,
    DIRS: DIRS,
    RULES: RULES,
    RULE_ORDER: RULE_ORDER
  };
});
