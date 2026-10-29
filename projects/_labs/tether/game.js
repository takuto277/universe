/* game.js : TETHER の起動・入力・描画ループ */
(function (root) {
  'use strict';
  var E = root.TetherEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var renderer = root.TetherRenderer ? root.TetherRenderer.create(canvas) : null;
  var audio = root.TetherAudio;
  var els = {
    hud: document.getElementById('hud'),
    height: document.getElementById('height'),
    time: document.getElementById('time'),
    anchors: document.getElementById('anchors'),
    best: document.getElementById('best'),
    hint: document.getElementById('hint'),
    stage: document.getElementById('stage'),
    stageTarget: document.getElementById('stage-target'),
    stageBar: document.getElementById('stage-bar'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultEyebrow: document.getElementById('result-eyebrow'),
    resultHeight: document.getElementById('result-height'),
    resultSub: document.getElementById('result-sub'),
    resultStage: document.getElementById('result-stage'),
    resultAnchors: document.getElementById('result-anchors'),
    resultBest: document.getElementById('result-best'),
    banner: document.getElementById('stage-banner'),
    bannerTitle: document.getElementById('stage-banner-title'),
    bannerSub: document.getElementById('stage-banner-sub'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    btnSound: document.getElementById('btn-sound'),
    btnResultSound: document.getElementById('btn-result-sound')
  };
  var best = 0;
  try { best = Number(root.localStorage && root.localStorage.getItem('tether-best')) || 0; } catch (e) { }
  var perfStart = null;
  var lastNow = null;
  var seenEvents = 0;
  var lastHeight = -1;
  var bannerTimer = null;

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
    if (game.state.phase === 'playing') return;
    game.start();
    if (audio) { audio.start(); soundLabel(); }
    seenEvents = 0;
    lastHeight = -1;
    perfStart = null;
    lastNow = null;
    show(els.start, false);
    show(els.result, false);
    hide(els.hud, false);
    show(els.banner, false);
    if (bannerTimer && root.clearTimeout) root.clearTimeout(bannerTimer);
    bannerTimer = null;
    text(els.btnRetry, 'CLIMB AGAIN');
  }

  function showStageBanner(event) {
    if (!els.banner) return;
    text(els.bannerTitle, 'STAGE ' + (event.cleared || 1) + ' CLEAR');
    text(els.bannerSub, 'STAGE ' + (event.stage || 2) + ' · GOAL ' + (event.target || 0) + 'M');
    show(els.banner, true);
    if (bannerTimer && root.clearTimeout) root.clearTimeout(bannerTimer);
    if (root.setTimeout) {
      bannerTimer = root.setTimeout(function () { show(els.banner, false); }, 1500);
    }
  }

  function finishUI(state) {
    var r = state.result || { height: 0, anchors: 1 };
    var h = Math.max(0, r.height || 0);
    var previousBest = best;
    if (h > best) {
      best = h;
      try { if (root.localStorage) root.localStorage.setItem('tether-best', String(best)); } catch (e) { }
    }
    var cleared = !!r.cleared;
    text(els.resultEyebrow, cleared ? 'ALL CLEAR' : 'TIME UP');
    text(els.resultHeight, h + 'm');
    text(els.resultSub, cleared ? 'ALL STAGES CLEAR' : (h > previousBest ? 'NEW BEST' : 'KEEP CLIMBING'));
    text(els.resultStage, 'STAGE ' + (r.stage || 1) + '/' + (r.stageCount || 5));
    text(els.resultAnchors, 'ANCHORS ' + (r.anchors || 1));
    text(els.resultBest, 'BEST ' + best + 'm');
    text(els.btnRetry, cleared ? 'PLAY AGAIN' : 'CLIMB AGAIN');
    hide(els.hud, true);
    show(els.result, true);
    if (audio) audio.finish();
  }

  function processEvents(state) {
    if (!audio || !state.events) return;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if ((ev.type === 'attach' || ev.type === 'rescue') && audio.attach) audio.attach();
      else if (ev.type === 'detach' && audio.snap) audio.snap();
      else if (ev.type === 'hit' && audio.hit) audio.hit();
      else if (ev.type === 'bump' && audio.bump) audio.bump();
      else if (ev.type === 'stage') {
        showStageBanner(ev);
        if (audio.stage) audio.stage();
      }
    }
    seenEvents = state.events.length;
  }

  function updateHUD(state) {
    if (!state) return;
    text(els.height, state.height);
    text(els.time, 'TIME ' + state.timeLeft.toFixed(1));
    var used = 0;
    for (var i = 0; i < state.anchors.length; i++) if (state.anchors[i].used) used++;
    text(els.anchors, 'ANCHORS ' + used);
    text(els.best, 'BEST ' + best + 'm');
    text(els.stage, 'STAGE ' + state.stage + ' / ' + state.stageCount);
    text(els.stageTarget, state.allClear ? 'CLEAR' : 'GOAL ' + state.stageTarget + 'M');
    if (els.stageBar) {
      var span = state.stageTarget - state.stageStart;
      var pct = span > 0 ? (state.height - state.stageStart) / span : 1;
      els.stageBar.style.width = (Math.max(0, Math.min(1, pct)) * 100).toFixed(1) + '%';
    }
    if (state.height !== lastHeight) {
      lastHeight = state.height;
      if (els.height && els.height.classList) {
        els.height.classList.remove('bump');
        if (els.height.offsetWidth != null) els.height.classList.add('bump');
      }
    }
  }

  function loop(now) {
    var state = game.state;
    if (state.phase === 'playing') {
      if (perfStart == null) perfStart = now;
      var t = (now - perfStart) / 1000;
      var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      var next = game.update(t, dt);
      processEvents(next);
      updateHUD(next);
      if (renderer) renderer.draw(next, t);
      if (next.phase === 'finished') finishUI(next);
    } else {
      perfStart = null;
      lastNow = null;
    }
    lastNow = now;
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  function setHold(on) {
    if (game.state.phase !== 'playing') return;
    game.setHold(!!on);
  }

  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', function () { game.reset(); begin(); });
  if (els.btnMute) els.btnMute.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnSound) els.btnSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnResultSound) els.btnResultSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });

  if (root.addEventListener) {
    root.addEventListener('pointerdown', function (event) {
      if (game.state.phase !== 'playing') return;
      if (event && event.target && event.target.closest && event.target.closest('button')) return;
      if (event && event.preventDefault) event.preventDefault();
      setHold(true);
    });
    root.addEventListener('pointerup', function () { setHold(false); });
    root.addEventListener('pointercancel', function () { setHold(false); });
    root.addEventListener('keydown', function (event) {
      if (event.code === 'Space' || event.key === ' ') {
        if (event.preventDefault) event.preventDefault();
        setHold(true);
      }
    });
    root.addEventListener('keyup', function (event) {
      if (event.code === 'Space' || event.key === ' ') {
        if (event.preventDefault) event.preventDefault();
        setHold(false);
      }
    });
    root.addEventListener('resize', function () { if (renderer) renderer.resize(); });
  }

  root.__GAME__ = {
    id: 'tether',
    title: 'TETHER',
    start: begin,
    autoPlayStep: function () { if (game.state.phase === 'playing') game.autoStep(); },
    isDone: function () { return game.state.phase === 'finished'; },
    getState: function () { return game.getState(); }
  };

  soundLabel();
  text(els.best, 'BEST ' + best + 'm');
  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
