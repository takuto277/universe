/* tools/harness.js : 汎用スモークテストハーネス（jsc 用）
 *
 * ゲーム側が公開する共通インターフェース window.__GAME__:
 *   {
 *     id: string,
 *     title?: string,
 *     start(): Promise|void,          // ゲーム開始（タイトル画面スキップで開始してよい）
 *     autoPlayStep(): void,           // 入力待ちならランダムに1手進める（待ちでなければ no-op）
 *     isDone(): boolean,              // ゲームが終了状態になったら true
 *     getState(): any                 // 検証用の状態スナップショット
 *   }
 *
 * 使い方（各ゲームの test-smoke.js から）:
 *   tryLoad(['../../tools/harness.js', 'tools/harness.js']);
 *   tryLoad(['engine.js', 'baseball-game/engine.js']);
 *   tryLoad(['game.js', 'baseball-game/game.js']);
 *   Harness.run({ name: 'baseball-game', check: function (state, h) { h.assert(...); } });
 *
 * ハーネスが行うこと:
 *   - DOM / Canvas / タイマー / requestAnimationFrame をスタブ化
 *   - ミニイベントループで仮想時間を進めながら自動プレイ
 *   - 終了検知 -> check() 実行 -> OK/NG を print
 */
(function () {
  'use strict';

  var g = (typeof globalThis !== 'undefined') ? globalThis : this;

  /* ---- 仮想時間・タイマー・rAF ---- */
  var NOW = 0;
  var rafQ = [];
  var rafId = 1;
  var timers = [];
  var timerId = 1;

  g.window = g;
  if (g.devicePixelRatio == null) g.devicePixelRatio = 1;
  g.performance = { now: function () { return NOW; } };
  g.requestAnimationFrame = function (fn) { rafQ.push(fn); return rafId++; };
  g.setTimeout = function (fn, ms) {
    var id = timerId++;
    timers.push({ id: id, t: NOW + (ms || 0), fn: fn });
    return id;
  };
  g.clearTimeout = function (id) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { timers.splice(i, 1); return; }
    }
  };
  g.addEventListener = function () { };

  /* ---- Canvas 2D コンテキストスタブ ---- */
  var ctxStub = new Proxy({}, {
    get: function (t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        return function () { return { addColorStop: function () { } }; };
      }
      if (k === 'measureText') return function () { return { width: 20 }; };
      return function () { };
    },
    set: function () { return true; }
  });

  /* ---- DOM 要素スタブ ---- */
  function makeEl(id) {
    var classes = {};
    var el = {
      id: id || '',
      style: {},
      children: [],
      textContent: '',
      innerHTML: '',
      width: 900,
      height: 780,
      clientWidth: 900,
      clientHeight: 620,
      offsetWidth: 100,
      listeners: {},
      classList: {
        add: function (c) { classes[c] = true; },
        remove: function (c) { delete classes[c]; },
        toggle: function (c, force) {
          if (force === undefined) {
            if (classes[c]) { delete classes[c]; } else { classes[c] = true; }
          } else if (force) {
            classes[c] = true;
          } else {
            delete classes[c];
          }
          return !!classes[c];
        },
        contains: function (c) { return !!classes[c]; }
      },
      addEventListener: function (type, fn) {
        el.listeners[type] = el.listeners[type] || [];
        el.listeners[type].push(fn);
      },
      appendChild: function (c) { el.children.push(c); return c; },
      getContext: function () { return ctxStub; },
      querySelector: function () { return null; },
      getBoundingClientRect: function () { return { width: 900, height: 620, left: 0, top: 0 }; },
      setAttribute: function () { },
      getAttribute: function () { return null; }
    };
    return el;
  }

  var elements = {};
  g.document = {
    readyState: 'complete',
    getElementById: function (id) {
      if (!elements[id]) elements[id] = makeEl(id);
      return elements[id];
    },
    createElement: function () { return makeEl(''); },
    addEventListener: function () { },
    body: makeEl('body')
  };

  /* ---- console ---- */
  var CONSOLE_ERROR = null;
  g.console = {
    log: function (m) { print('  [console] ' + m); },
    error: function (m) {
      CONSOLE_ERROR = m;
      print('  [console.error] ' + (m && m.stack ? m.stack : m));
    }
  };

  /* ---- 汎用ヘルパ ---- */
  function tryLoad(paths) {
    for (var i = 0; i < paths.length; i++) {
      try { load(paths[i]); return true; } catch (e) { }
    }
    throw new Error('load failed: ' + paths.join(' / '));
  }

  var FAILED = false;
  function fail(m) { FAILED = true; print('SMOKE FAIL: ' + m); }

  /* ---- ランナー ---- */
  function run(opts) {
    opts = opts || {};
    var name = opts.name || 'game';
    var maxSteps = opts.maxSteps || 100000;
    var afterDone = (opts.afterDone == null) ? 400 : opts.afterDone;
    var GAME = g.__GAME__;

    var steps = 0;
    var doneAt = -1;

    function checkAll(state) {
      if (CONSOLE_ERROR) fail('console.error が呼ばれた: ' + CONSOLE_ERROR);
      if (opts.check) {
        var h = {
          state: state,
          elements: elements,
          steps: steps,
          assert: function (cond, m) { if (!cond) fail(m); }
        };
        try { opts.check(state, h); }
        catch (e) { fail('check 内例外: ' + (e && e.stack ? e.stack : e)); }
      }
    }

    return new Promise(function (resolve) {
      async function pump() {
        if (!GAME) { fail('__GAME__ が未定義'); checkAll(null); resolve(); return; }

        try {
          var p = GAME.start && GAME.start();
          if (p && p.catch) p.catch(function (e) { fail('start で例外: ' + (e && e.stack ? e.stack : e)); });
        } catch (e) {
          fail('start で例外: ' + (e && e.stack ? e.stack : e));
        }

        while (steps < maxSteps) {
          steps++;
          NOW += 16;

          for (var i = 0; i < timers.length; i++) {
            if (timers[i].t <= NOW) {
              var tm = timers[i];
              timers.splice(i, 1);
              i--;
              try { tm.fn(); } catch (e) { fail('timer: ' + (e && e.stack ? e.stack : e)); }
            }
          }

          var q = rafQ;
          rafQ = [];
          for (var j = 0; j < q.length; j++) {
            try { q[j](NOW); } catch (e) { fail('raf: ' + (e && e.stack ? e.stack : e)); }
          }

          try { GAME.autoPlayStep(); } catch (e) { fail('autoPlayStep: ' + (e && e.stack ? e.stack : e)); }

          var done = false;
          try { done = !!(GAME.isDone && GAME.isDone()); } catch (e) { fail('isDone: ' + e); }
          if (done) {
            if (doneAt < 0) doneAt = steps;
            if (steps - doneAt > afterDone) break;
          }
          if (FAILED) break;
          await null;
        }

        if (doneAt < 0) fail(name + ': 制限ステップ内に終了しなかった (maxSteps=' + maxSteps + ')');

        var state = null;
        try { state = GAME.getState ? GAME.getState() : null; } catch (e) { fail('getState: ' + e); }
        checkAll(state);

        if (FAILED) {
          print('smoke test NG [' + name + '] (steps=' + steps + ')');
        } else {
          print('smoke test OK [' + name + '] (steps=' + steps + ')');
          if (opts.summary) {
            try { opts.summary(state, { steps: steps }); }
            catch (e) { print('  [summary error] ' + e); }
          }
        }
        resolve();
      }

      pump().catch(function (e) {
        print('smoke test EXCEPTION [' + name + ']: ' + (e && e.stack ? e.stack : e));
        resolve();
      });
    });
  }

  g.Harness = {
    run: run,
    tryLoad: tryLoad,
    elements: elements
  };
})();
