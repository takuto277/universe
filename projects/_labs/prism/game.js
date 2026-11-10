/* game.js : PRISM（入力・HUD・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.PrismEngine) ? window.PrismEngine : null;
  var R = (typeof window !== 'undefined' && window.PrismRenderer) ? window.PrismRenderer : null;
  if (!E) return;

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
    try { best = parseInt(window.localStorage.getItem('prism-best') || '0', 10) || 0; } catch (e) { best = 0; }
  }

  function saveBest(value) {
    try { window.localStorage.setItem('prism-best', String(value)); } catch (e) { }
  }

  function begin() {
    if (!state) state = E.createGame();
    E.start(state);
    last = 0;
    show(els.start, false);
    show(els.end, false);
    if (renderer && renderer.resize) renderer.resize();
  }

  function updateHud() {
    if (!state) return;
    if (els.level) els.level.textContent = 'LV ' + state.levelIndex + 1 + '/' + state.levelCount;
    if (els.name) els.name.textContent = state.name || '';
    if (els.moves) els.moves.textContent = String(state.moves);
    if (els.signals) els.signals.textContent = state.trace.lit.length + '/' + state.targets.length;
    show(els.clear, state.phase === 'clear');
  }

  function renderEnd() {
    if (!state || !state.result) return;
    show(els.start, false);
    show(els.end, true);
    if (best === 0 || state.result.moves < best) {
      best = state.result.moves;
      saveBest(best);
    }
    if (els.resultMoves) els.resultMoves.textContent = String(state.result.moves);
    if (els.resultTime) els.resultTime.textContent = String(state.result.time);
    if (els.resultBest) els.resultBest.textContent = 'BEST ' + best + ' MOVES';
  }

  function tap(clientX, clientY) {
    if (!state || state.phase !== 'playing' || !canvas) return;
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    var w = renderer && renderer.screenToWorld ? renderer.screenToWorld(clientX, clientY, rect) : { x: clientX, y: clientY };
    var idx = E.pick(state, w.x, w.y);
    if (idx >= 0) E.toggle(state, idx);
  }

  function frame(now) {
    window.requestAnimationFrame(frame);
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (state) {
      E.update(state, dt);
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
      clear: $('level-banner'),
      level: $('level'),
      name: $('level-name'),
      moves: $('moves'),
      signals: $('signals'),
      resultMoves: $('result-moves'),
      resultTime: $('result-time'),
      resultBest: $('result-best'),
      btnStart: $('btn-start'),
      btnRetry: $('btn-retry')
    };

    loadBest();
    state = E.createGame();

    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnRetry) els.btnRetry.addEventListener('click', begin);

    if (canvas) {
      canvas.addEventListener('pointerdown', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.clientX != null) tap(e.clientX, e.clientY);
      });
    }

    window.addEventListener('keydown', function (e) {
      if (e && (e.key === ' ' || e.key === 'Enter')) {
        if (!state || state.phase === 'idle' || state.phase === 'over') begin();
      }
    });

    show(els.start, true);
    show(els.end, false);
    updateHud();

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'prism',
        title: 'PRISM',
        start: function () { begin(); },
        autoPlayStep: function () { if (state) E.autoStep(state); },
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
