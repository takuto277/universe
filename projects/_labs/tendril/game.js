/* game.js : TENDRIL（入力・画面遷移・HUD） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.TendrilEngine) ? window.TendrilEngine : null;
  var R = (typeof window !== 'undefined' && window.TendrilRenderer) ? window.TendrilRenderer : null;
  if (!E) return;

  var STORE = 'tendril-best';
  var state = null;
  var renderer = null;
  var canvas = null;
  var els = {};
  var last = 0;
  var best = 0;

  function $(id) { return document.getElementById(id); }

  function show(el, visible) {
    if (el && el.classList) el.classList.toggle('visible', !!visible);
  }

  function loadBest() {
    try {
      best = parseInt(window.localStorage.getItem(STORE) || '0', 10) || 0;
    } catch (e) {
      best = 0;
    }
  }

  function saveBest(value) {
    try { window.localStorage.setItem(STORE, String(value)); } catch (e) { }
  }

  function begin() {
    if (!state) state = E.createGame();
    state.best = best;
    E.start(state);
    last = 0;
    show(els.start, false);
    show(els.end, false);
    if (renderer && renderer.resize) renderer.resize();
  }

  function updateHud() {
    if (!state) return;
    if (els.score) els.score.textContent = String(state.score);
    if (els.time) els.time.textContent = String(Math.max(0, Math.ceil(state.duration - state.time)));
    if (els.combo) {
      var c = state.combo;
      els.combo.textContent = c >= 2 ? ('x' + c + ' COMBO') : '';
      if (els.combo.classList) els.combo.classList.toggle('on', c >= 2);
    }
  }

  function renderEnd() {
    if (!state || !state.result) return;
    show(els.start, false);
    show(els.end, true);
    if (state.result.score > best) {
      best = state.result.score;
      saveBest(best);
    }
    if (els.resultScore) els.resultScore.textContent = String(state.result.score);
    if (els.resultEaten) els.resultEaten.textContent = String(state.result.eaten);
    if (els.resultBest) els.resultBest.textContent = 'BEST ' + best;
  }

  function toWorld(clientX, clientY) {
    if (!canvas) return { x: E.W / 2, y: E.H / 2 };
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    if (renderer && renderer.screenToWorld) return renderer.screenToWorld(clientX, clientY, rect);
    return { x: clientX, y: clientY };
  }

  function pointer(e, down) {
    if (!state) return;
    var x = e && e.clientX != null ? e.clientX : 0;
    var y = e && e.clientY != null ? e.clientY : 0;
    var w = toWorld(x, y);
    E.setPointer(state, w.x, w.y, down);
  }

  function frame(now) {
    window.requestAnimationFrame(frame);
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (state) {
      if (state.phase === 'playing') E.update(state, dt);
      updateHud();
      if (state.phase === 'over') renderEnd();
      if (renderer) renderer.draw(state, now / 1000);
    }
  }

  function init() {
    canvas = $('canvas');
    if (canvas && R) renderer = R.create(canvas);

    els = {
      start: $('start-overlay'),
      end: $('result-overlay'),
      score: $('score'),
      time: $('time'),
      combo: $('combo'),
      resultScore: $('result-score'),
      resultEaten: $('result-eaten'),
      resultBest: $('result-best'),
      btnStart: $('btn-start'),
      btnRetry: $('btn-retry')
    };

    loadBest();
    state = E.createGame();
    state.best = best;

    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnRetry) els.btnRetry.addEventListener('click', begin);

    if (canvas) {
      canvas.addEventListener('pointerdown', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        pointer(e, true);
      });
      canvas.addEventListener('pointermove', function (e) {
        if (state && state.down) {
          if (e && e.preventDefault) e.preventDefault();
          pointer(e, true);
        }
      });
      canvas.addEventListener('pointerup', function (e) { pointer(e, false); });
      canvas.addEventListener('pointercancel', function (e) { pointer(e, false); });
      canvas.addEventListener('pointerleave', function (e) { pointer(e, false); });
    }

    window.addEventListener('keydown', function (e) {
      if (e && (e.key === ' ' || e.key === 'Enter')) begin();
    });

    show(els.start, true);
    show(els.end, false);
    updateHud();

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'tendril',
        title: 'TENDRIL',
        start: function () { begin(); },
        autoPlayStep: function () {
          if (!state) return;
          E.autoStep(state);
        },
        isDone: function () { return !!(state && state.phase === 'over'); },
        getState: function () { return state ? E.snapshot(state) : null; }
      };
    }

    last = 0;
    window.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
