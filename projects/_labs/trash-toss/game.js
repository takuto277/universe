/* game.js : TRASH TOSS の起動・スワイプ入力・描画ループ */
(function (root) {
  'use strict';
  var E = root.TrashTossEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var force2d = !!(root.location && /[?&]renderer=2d(?:&|$)/.test(root.location.search));
  var renderer = null;
  if (!force2d && root.TrashTossWebGLRenderer) {
    try { renderer = root.TrashTossWebGLRenderer.create(canvas); } catch (e) { renderer = null; }
  }
  if (!renderer && root.TrashTossRenderer) renderer = root.TrashTossRenderer.create(canvas);
  if (canvas && canvas.setAttribute) canvas.setAttribute('data-renderer', renderer ? (renderer.kind || '2d') : 'none');
  var audio = root.TrashTossAudio;
  var els = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    throws: document.getElementById('throws'),
    time: document.getElementById('time'),
    streak: document.getElementById('streak'),
    depth: document.getElementById('depth'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultScore: document.getElementById('result-score'),
    resultSub: document.getElementById('result-sub'),
    resultBest: document.getElementById('result-best'),
    resultThrows: document.getElementById('result-throws'),
    resultAccuracy: document.getElementById('result-accuracy'),
    resultPerfect: document.getElementById('result-perfect'),
    resultStreak: document.getElementById('result-streak'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    btnSound: document.getElementById('btn-sound'),
    btnResultSound: document.getElementById('btn-result-sound'),
    hand: document.getElementById('hand')
  };

  var best = 0;
  try { best = Number(root.localStorage && root.localStorage.getItem('trashtoss-best')) || 0; } catch (e) { }
  var seenEvents = 0;
  var lastPhase = null;
  var lastNow = null;
  var handTimer = null;
  var swiping = false;
  var startX = 0, startY = 0, swipeLen = 0;

  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function hide(el, on) { if (el) el.classList.toggle('is-hidden', !!on); }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }

  function soundLabel() {
    var on = audio ? audio.isEnabled() : true;
    text(els.btnMute, on ? 'SOUND ON' : 'SOUND OFF');
    text(els.btnSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
    text(els.btnResultSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
  }

  function begin() {
    game.start();
    if (audio) { audio.start(); soundLabel(); }
    seenEvents = 0;
    lastPhase = null;
    lastNow = null;
    swiping = false;
    show(els.start, false);
    show(els.result, false);
    hide(els.hud, false);
    hide(els.hand, false);
    if (handTimer && root.clearTimeout) root.clearTimeout(handTimer);
    handTimer = null;
  }

  function processEvents(state) {
    if (!audio || !state.events) return;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev.type === 'throw' && audio.whoosh) audio.whoosh();
      else if (ev.type === 'in' && audio.made) audio.made();
      else if (ev.type === 'perfect' && audio.perfect) audio.perfect();
      else if (ev.type === 'miss' && audio.miss) audio.miss();
      else if (ev.type === 'depth' && audio.depth) audio.depth();
      else if (ev.type === 'throw') {
        hide(els.hand, true);
        if (handTimer && root.clearTimeout) root.clearTimeout(handTimer);
        if (root.setTimeout) handTimer = root.setTimeout(function () {
          if (game.state.phase === 'playing') hide(els.hand, false);
        }, 260);
      }
      else if (ev.type === 'finish' && audio.finish) audio.finish();
    }
    seenEvents = state.events.length;
  }

  function updateHUD(state) {
    text(els.score, state.score);
    text(els.throws, state.throws);
    text(els.time, state.timeLeft.toFixed(1));
    text(els.streak, state.streak);
    text(els.depth, state.depthPhase ? 'DEPTH MOVES ON' : '2D MOVES');
  }

  function finishUI(state) {
    var r = state.result || {};
    var score = r.score || 0;
    if (score > best) {
      best = score;
      try { if (root.localStorage) root.localStorage.setItem('trashtoss-best', String(best)); } catch (e) { }
    }
    text(els.resultScore, score);
    text(els.resultSub, score + ' of ' + (r.throws || 0) + ' tosses found the bin.');
    text(els.resultBest, 'BEST ' + best);
    text(els.resultThrows, 'THROWS ' + (r.throws || 0));
    text(els.resultAccuracy, 'ACC ' + Math.round((r.accuracy || 0) * 100) + '%');
    text(els.resultPerfect, 'PERFECT ' + (r.perfects || 0));
    text(els.resultStreak, 'STREAK ' + (r.bestStreak || 0));
    show(els.result, true);
    hide(els.hud, true);
    hide(els.hand, true);
  }

  function syncOverlay(state) {
    if (state.phase === lastPhase) return;
    lastPhase = state.phase;
    if (state.phase === 'finished') {
      finishUI(state);
    } else if (state.phase === 'playing') {
      show(els.result, false);
      hide(els.hud, false);
      hide(els.hand, false);
    }
  }

  function afterInput() {
    var state = game.getState();
    processEvents(state);
    updateHUD(state);
    syncOverlay(state);
  }

  function finishSwipe(commit) {
    if (!swiping) return;
    swiping = false;
    if (game.state.phase !== 'playing') return;
    if (commit && swipeLen >= 35) game.throwCurrent();
    else game.clearAim();
    afterInput();
  }

  function onPointerDown(event) {
    if (game.state.phase !== 'playing') return;
    if (event && event.preventDefault) event.preventDefault();
    swiping = true;
    startX = event.clientX;
    startY = event.clientY;
    swipeLen = 0;
    if (canvas && canvas.setPointerCapture && event.pointerId != null) {
      try { canvas.setPointerCapture(event.pointerId); } catch (e) { }
    }
  }

  function onPointerMove(event) {
    if (!swiping || game.state.phase !== 'playing') return;
    if (event && event.preventDefault) event.preventDefault();
    var dx = event.clientX - startX;
    var dy = startY - event.clientY;
    swipeLen = Math.sqrt(dx * dx + dy * dy);
    if (swipeLen >= 5) game.setAim(dx, swipeLen);
    else game.clearAim();
    afterInput();
  }

  function stopSwipe(event) {
    if (event && event.preventDefault) event.preventDefault();
    finishSwipe(true);
  }

  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', stopSwipe);
    canvas.addEventListener('pointercancel', function () { finishSwipe(false); });
    canvas.addEventListener('pointerleave', function () { if (swiping) finishSwipe(false); });
  }
  if (root.addEventListener) root.addEventListener('pointerup', function (event) { if (swiping) stopSwipe(event); });

  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', begin);
  if (els.btnMute) els.btnMute.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnSound) els.btnSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnResultSound) els.btnResultSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (root.addEventListener) root.addEventListener('resize', function () { if (renderer) renderer.resize(); });

  root.__GAME__ = {
    id: 'trash-toss',
    title: 'TRASH TOSS',
    start: begin,
    autoPlayStep: function () { game.autoStep(); },
    isDone: function () { return game.state.phase === 'finished'; },
    getState: function () { return game.getState(); }
  };

  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (game.state.phase === 'playing') game.update(now, dt);
    var state = game.getState();
    processEvents(state);
    updateHUD(state);
    syncOverlay(state);
    if (renderer) renderer.draw(state, now / 1000);
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  soundLabel();
  if (renderer) renderer.draw(game.getState(), 0);
  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
