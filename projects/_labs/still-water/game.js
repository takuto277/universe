/* game.js : STILL WATER の起動・入力・描画ループ */
(function (root) {
  'use strict';
  var E = root.StillWaterEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var renderer = root.StillWaterRenderer ? root.StillWaterRenderer.create(canvas) : null;
  var audio = root.StillWaterAudio;
  var els = {
    hud: document.getElementById('hud'),
    casts: document.getElementById('casts'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    total: document.getElementById('total'),
    hint: document.getElementById('hint'),
    powerWrap: document.getElementById('power-wrap'),
    powerBar: document.getElementById('power-bar'),
    powerText: document.getElementById('power-text'),
    reelWrap: document.getElementById('reel-wrap'),
    tensionBar: document.getElementById('tension-bar'),
    tensionText: document.getElementById('tension-text'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    banner: document.getElementById('catch-banner'),
    bannerEyebrow: document.getElementById('catch-eyebrow'),
    bannerTitle: document.getElementById('catch-title'),
    bannerSub: document.getElementById('catch-sub'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultScore: document.getElementById('result-score'),
    resultSub: document.getElementById('result-sub'),
    resultMeta: document.getElementById('result-meta'),
    resultBest: document.getElementById('result-best'),
    catchList: document.getElementById('catch-list'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    btnSound: document.getElementById('btn-sound'),
    btnResultSound: document.getElementById('btn-result-sound')
  };

  var best = 0;
  try { best = Number(root.localStorage && root.localStorage.getItem('stillwater-best')) || 0; } catch (e) { }
  var seenEvents = 0;
  var lastPhase = null;
  var lastNow = null;
  var lastReelTick = 0;

  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function hide(el, on) { if (el) el.classList.toggle('is-hidden', !!on); }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function setClass(el, name, on) { if (el) el.classList.toggle(name, !!on); }

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
    lastReelTick = 0;
    show(els.start, false);
    show(els.result, false);
    show(els.banner, false);
    hide(els.hud, false);
    text(els.resultScore, '0');
  }

  function phaseHint(state) {
    if (state.phase === 'aim') return 'HOLD TO CHARGE · RELEASE TO CAST';
    if (state.phase === 'wait') return 'WAIT FOR THE FLOAT TO DIP';
    if (state.phase === 'bite') return 'TAP TO HOOK IT';
    if (state.phase === 'reel') return 'HOLD TO REEL · RELEASE TO EASE THE LINE';
    if (state.phase === 'caught') return 'CAUGHT';
    if (state.phase === 'escaped') return 'GONE';
    return 'THE LAKE IS QUIET';
  }

  function processEvents(state) {
    if (!audio) return;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev.type === 'cast' && audio.cast) audio.cast();
      else if (ev.type === 'bite' && audio.bite) audio.bite();
      else if (ev.type === 'hook' && audio.hook) audio.hook();
      else if (ev.type === 'catch' && audio.catch) { audio.catch(); audio.splash(); }
      else if (ev.type === 'escape' && audio.escape) { audio.escape(); audio.splash(); }
      else if (ev.type === 'finish' && audio.finish) audio.finish();
    }
    seenEvents = state.events.length;
  }

  function updateHUD(state) {
    text(els.casts, state.castsLeft);
    text(els.score, state.score);
    text(els.best, best);
    text(els.total, state.totalCm + ' cm');
    text(els.hint, phaseHint(state));

    var aiming = state.phase === 'aim';
    var reeling = state.phase === 'reel';
    hide(els.powerWrap, !aiming);
    hide(els.reelWrap, !reeling);
    if (aiming) {
      var power = Math.round(state.charge * 100);
      els.powerBar.style.width = power + '%';
      text(els.powerText, power + '%');
    }
    if (reeling) {
      var tension = Math.round(state.tension * 100);
      var progress = Math.round(state.progress * 100);
      els.tensionBar.style.width = tension + '%';
      els.progressBar.style.width = progress + '%';
      text(els.tensionText, tension + '%');
      text(els.progressText, progress + '%');
      setClass(els.tensionBar, 'danger', state.tension > 0.84);
    }
  }

  function finishUI(state) {
    var r = state.result || {};
    var score = r.score || 0;
    if (score > best) {
      best = score;
      try { if (root.localStorage) root.localStorage.setItem('stillwater-best', String(best)); } catch (e) { }
    }
    text(els.resultScore, score);
    text(els.resultSub, r.catchesCount ? 'A quiet kind of victory.' : 'The lake keeps its secrets.');
    text(els.resultMeta, (E.CASTS - (state.castsLeft || 0)) + ' CASTS · ' + (r.catchesCount || 0) + ' CATCHES · ' + (r.totalCm || 0) + ' cm');
    text(els.resultBest, 'BEST ' + best);
    if (els.catchList) {
      els.catchList.innerHTML = '';
      var catches = r.catches || [];
      for (var i = 0; i < catches.length; i++) {
        var c = catches[i];
        var li = document.createElement('li');
        var name = document.createElement('strong');
        name.textContent = c.name;
        var detail = document.createElement('span');
        detail.textContent = c.size + ' cm · +' + c.points;
        li.appendChild(name);
        li.appendChild(detail);
        els.catchList.appendChild(li);
      }
    }
    show(els.result, true);
    hide(els.hud, true);
    show(els.banner, false);
  }

  function showCatchBanner(state) {
    if (state.phase === 'caught' && state.catches.length) {
      var c = state.catches[state.catches.length - 1];
      text(els.bannerEyebrow, c.rarity === 'LEGENDARY' ? 'LEGENDARY CATCH' : 'CAUGHT');
      text(els.bannerTitle, c.name);
      text(els.bannerSub, c.size + ' cm · +' + c.points);
      show(els.banner, true);
    } else if (state.phase === 'escaped') {
      var last = state.events.length ? state.events[state.events.length - 1] : null;
      var reason = last && last.type === 'escape' ? last.reason : 'missed';
      text(els.bannerEyebrow, reason === 'snap' ? 'TOO MUCH TENSION' : (reason === 'slack' ? 'TOO MUCH SLACK' : 'MISSED THE BITE'));
      text(els.bannerTitle, reason === 'snap' ? 'LINE SNAPPED' : (reason === 'slack' ? 'GOT AWAY' : 'TOO LATE'));
      text(els.bannerSub, 'The lake goes quiet.');
      show(els.banner, true);
    } else {
      show(els.banner, false);
    }
  }

  function syncOverlay(state) {
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      if (state.phase === 'finished') {
        finishUI(state);
      } else {
        show(els.result, false);
        hide(els.hud, false);
        showCatchBanner(state);
      }
    }
  }

  function afterInput() {
    var state = game.getState();
    processEvents(state);
    updateHUD(state);
    syncOverlay(state);
  }

  function press() {
    if (game.state.phase === 'start' || game.state.phase === 'finished') return;
    game.press();
    afterInput();
  }
  function release() {
    if (game.state.phase === 'start' || game.state.phase === 'finished') return;
    game.release();
    afterInput();
  }

  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      press();
    });
    canvas.addEventListener('pointerup', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      release();
    });
    canvas.addEventListener('pointercancel', release);
  }
  if (root.addEventListener) {
    root.addEventListener('keydown', function (event) {
      if (event.code === 'Space' || event.key === ' ') {
        if (event.preventDefault) event.preventDefault();
        if (!event.repeat) press();
      }
    });
    root.addEventListener('keyup', function (event) {
      if (event.code === 'Space' || event.key === ' ') {
        if (event.preventDefault) event.preventDefault();
        release();
      }
    });
    root.addEventListener('pointerup', release);
    root.addEventListener('resize', function () { if (renderer) renderer.resize(); });
  }

  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', begin);
  if (els.btnMute) els.btnMute.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnSound) els.btnSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnResultSound) els.btnResultSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });

  root.__GAME__ = {
    id: 'still-water',
    title: 'STILL WATER',
    start: begin,
    autoPlayStep: function () { game.autoStep(); },
    isDone: function () { return game.state.phase === 'finished'; },
    getState: function () { return game.getState(); }
  };

  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (game.state.phase !== 'start' && game.state.phase !== 'finished') {
      game.update(now, dt);
      if (game.state.phase === 'reel' && game.state.holding && now - lastReelTick > 180) {
        lastReelTick = now;
        if (audio && audio.reel) audio.reel();
      }
    }
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
