/* game.js : BIN BANG の起動・入力・描画ループ */
(function (root) {
  'use strict';
  var E = root.BinBangEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var renderer = root.BinBangRenderer ? root.BinBangRenderer.create(canvas) : null;
  var audio = root.BinBangAudio;
  var els = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    time: document.getElementById('time'),
    lives: document.getElementById('lives'),
    combo: document.getElementById('combo'),
    overdriveBar: document.getElementById('overdrive-bar'),
    overdriveLabel: document.getElementById('overdrive-label'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultEyebrow: document.getElementById('result-eyebrow'),
    resultScore: document.getElementById('result-score'),
    resultSub: document.getElementById('result-sub'),
    resultBest: document.getElementById('result-best'),
    resultKills: document.getElementById('result-kills'),
    resultCombo: document.getElementById('result-combo'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    btnSound: document.getElementById('btn-sound'),
    btnResultSound: document.getElementById('btn-result-sound'),
    bang: document.getElementById('btn-bang'),
    bangState: document.getElementById('bang-state')
  };

  var best = 0;
  try { best = Number(root.localStorage && root.localStorage.getItem('binbang-best')) || 0; } catch (e) { }
  var seenEvents = 0;
  var lastPhase = null;
  var dragging = false;
  var keys = { left: false, right: false };
  var lastNow = null;

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
    show(els.start, false);
    show(els.result, false);
    hide(els.hud, false);
    hide(els.bang, false);
    text(els.resultScore, '0');
  }

  function processEvents(state) {
    if (!audio || !state.events) return;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev.type === 'fire' && audio.fire) audio.fire();
      else if (ev.type === 'hit' && audio.hit) audio.hit();
      else if (ev.type === 'explode' && audio.explode) audio.explode();
      else if (ev.type === 'bang' && audio.bang) audio.bang();
      else if (ev.type === 'damage' && audio.damage) audio.damage();
      else if (ev.type === 'overdrive' && audio.overdrive) audio.overdrive();
      else if (ev.type === 'boss' && audio.boss) audio.boss();
      else if (ev.type === 'finish' && audio.finish) audio.finish();
    }
    seenEvents = state.events.length;
  }

  function updateHUD(state) {
    text(els.score, state.score);
    text(els.time, state.timeLeft.toFixed(1));
    var l = '';
    for (var i = 0; i < E.LIVES; i++) l += i < state.lives ? '● ' : '○ ';
    text(els.lives, l.trim());
    text(els.combo, 'COMBO ×' + state.combo);
    setClass(els.combo, 'hot', state.combo >= 3);
    if (els.overdriveBar) {
      var pct = state.overdrive > 0 ? 100 : Math.max(0, Math.min(100, state.overdriveGauge));
      els.overdriveBar.style.width = pct.toFixed(1) + '%';
    }
    text(els.overdriveLabel, state.overdrive > 0 ? 'OVERDRIVE ACTIVE' : 'OVERDRIVE');
    if (els.bang) {
      var ready = state.burstCooldown <= 0;
      els.bang.classList.toggle('ready', ready);
      els.bang.classList.toggle('cooling', !ready);
      text(els.bangState, ready ? 'READY' : state.burstCooldown.toFixed(1) + 's');
    }
  }

  function setClass(el, name, on) { if (el) el.classList.toggle(name, !!on); }

  function finishUI(state) {
    var r = state.result || {};
    var score = r.score || state.score;
    if (score > best) {
      best = score;
      try { if (root.localStorage) root.localStorage.setItem('binbang-best', String(best)); } catch (e) { }
    }
    text(els.resultEyebrow, r.reason === 'lives' ? 'BIN CRUSHED' : 'TIME UP');
    text(els.resultScore, score);
    text(els.resultSub, r.reason === 'lives' ? 'The storm buried the bin.' : 'The storm is over.');
    text(els.resultBest, 'BEST ' + best);
    text(els.resultKills, 'KILLS ' + (r.kills || 0));
    text(els.resultCombo, 'MAX COMBO ×' + (r.comboMax || 0));
    show(els.result, true);
    hide(els.bang, true);
    hide(els.hud, true);
  }

  function syncOverlay(state) {
    if (state.phase === lastPhase) return;
    lastPhase = state.phase;
    if (state.phase === 'finished') {
      finishUI(state);
    } else if (state.phase === 'playing') {
      show(els.result, false);
      hide(els.hud, false);
      hide(els.bang, false);
    }
  }

  function afterInput() {
    var s = game.getState();
    processEvents(s);
    updateHUD(s);
    syncOverlay(s);
  }

  function doBurst() {
    if (game.state.phase !== 'playing') return;
    if (game.burst()) afterInput();
  }

  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', begin);
  if (els.btnMute) els.btnMute.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnSound) els.btnSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnResultSound) els.btnResultSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.bang) els.bang.addEventListener('pointerdown', function (event) { if (event.preventDefault) event.preventDefault(); doBurst(); });

  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', function (event) {
      dragging = true;
      movePointer(event);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (dragging || event.pointerType === 'mouse') movePointer(event);
    });
    function stopDrag() { dragging = false; }
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('pointerleave', stopDrag);
  }

  function movePointer(event) {
    if (game.state.phase !== 'playing') return;
    if (event && event.preventDefault) event.preventDefault();
    var x = renderer && renderer.toWorldX ? renderer.toWorldX(event.clientX) : E.W / 2;
    game.setTargetX(x);
  }

  if (root.addEventListener) {
    root.addEventListener('keydown', function (event) {
      var key = event.key;
      var code = event.code;
      if (['ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].indexOf(key) >= 0 || code === 'Space') {
        if (event.preventDefault) event.preventDefault();
      }
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') keys.left = true;
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') keys.right = true;
      else if ((key === ' ' || key === 'Spacebar' || code === 'Space' || key === 'b' || key === 'B') && !event.repeat) doBurst();
    });
    root.addEventListener('keyup', function (event) {
      var key = event.key;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') keys.left = false;
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') keys.right = false;
    });
    root.addEventListener('resize', function () { if (renderer) renderer.resize(); });
  }

  root.__GAME__ = {
    id: 'bin-bang',
    title: 'BIN BANG',
    start: begin,
    autoPlayStep: function () { game.autoStep(); },
    isDone: function () { return game.state.phase === 'finished'; },
    getState: function () { return game.getState(); }
  };

  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (game.state.phase === 'playing') {
      if (audio && audio.beat) audio.beat(game.state.time);
      if (keys.left) game.setTargetX(game.state.player.targetX - 430 * dt);
      if (keys.right) game.setTargetX(game.state.player.targetX + 430 * dt);
      game.update(now, dt);
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
