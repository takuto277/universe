/* game.js : line-lab prototype */
(function (root) {
  'use strict';
  var E = root.LoopWorksEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var renderer = root.LoopWorksRenderer ? root.LoopWorksRenderer.create(canvas) : null;
  var audio = root.LoopWorksAudio;
  var els = {
    slow: document.getElementById('slow'),
    hint: document.getElementById('hint'),
    count: document.getElementById('count'),
    start: document.getElementById('start-overlay'),
    btnStart: document.getElementById('btn-start'),
    btnReset: document.getElementById('btn-reset')
  };
  var dragging = false;
  var seenEvents = 0;
  var lastNow = null;

  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function setClass(el, name, on) { if (el) el.classList.toggle(name, !!on); }

  function begin() {
    game.start();
    seenEvents = 0;
    dragging = false;
    if (audio) audio.start();
    show(els.start, false);
    draw();
    hud();
  }

  function processEvents(state) {
    if (!audio) return;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev.type === 'grab' && audio.grab) audio.grab();
      else if (ev.type === 'snap' && audio.snap) audio.snap();
      else if (ev.type === 'invalid' && audio.invalid) audio.invalid();
      else if (ev.type === 'deliver' && audio.deliver) audio.deliver();
    }
    seenEvents = state.events.length;
  }

  function hud() {
    var state = game.getState();
    text(els.count, state.delivered);
    setClass(els.slow, 'on', state.timeScale < 1);
    if (state.dragging >= 0) {
      setClass(els.hint, 'bad', !state.dragValid);
      text(els.hint, state.dragValid ? 'RELEASE TO SNAP THE NEW LINE' : 'CAN\'T ROUTE THERE · RELEASE TO CANCEL');
    } else {
      setClass(els.hint, 'bad', false);
      text(els.hint, 'GRAB A GLOWING JOINT · DRAG TO REROUTE · RELEASE TO SNAP');
    }
  }

  function draw() {
    var state = game.getState();
    if (renderer) renderer.draw(state, (root.performance ? root.performance.now() : Date.now()) / 1000);
    processEvents(state);
    hud();
  }

  function cornerAt(x, y) {
    if (!renderer) return -1;
    var state = game.getState();
    var g = renderer.layout();
    var best = -1, bestD = Math.max(28, g.cellW * 0.62);
    for (var i = 0; i < state.corners.length; i++) {
      var p = renderer.center(g, state.corners[i].x, state.corners[i].y);
      var d = Math.sqrt((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function cellAt(x, y) {
    if (!renderer) return null;
    var g = renderer.layout();
    return {
      x: Math.floor((x - g.left) / g.cellW),
      y: Math.floor((y - g.top) / g.cellH)
    };
  }

  function point(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', function (event) {
      if (game.state.phase !== 'playing') return;
      var p = point(event);
      var index = cornerAt(p.x, p.y);
      if (index < 0) return;
      if (event.preventDefault) event.preventDefault();
      dragging = true;
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(event.pointerId); } catch (e) { } }
      game.beginDrag(index);
      draw();
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      if (event.preventDefault) event.preventDefault();
      var p = point(event);
      var c = cellAt(p.x, p.y);
      if (c) game.moveCorner(c.x, c.y);
      draw();
    });
    canvas.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      game.endDrag();
      draw();
    });
    canvas.addEventListener('pointercancel', function () {
      if (!dragging) return;
      dragging = false;
      game.endDrag();
      draw();
    });
  }

  if (root.addEventListener) {
    root.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      game.endDrag();
      draw();
    });
    root.addEventListener('resize', function () { if (renderer) renderer.resize(); draw(); });
  }

  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnReset) els.btnReset.addEventListener('click', begin);

  root.__LINE_LAB__ = {
    start: begin,
    getState: function () { return game.getState(); },
    beginDrag: function (i) { return game.beginDrag(i); },
    moveCorner: function (x, y) { return game.moveCorner(x, y); },
    endDrag: function () { return game.endDrag(); }
  };

  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (game.state.phase === 'playing') game.update(now, dt);
    draw();
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  draw();
  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
