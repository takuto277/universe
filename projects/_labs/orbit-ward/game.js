/* game.js : ORBIT WARD の起動・入力・HUD */
(function (root) {
  'use strict';
  var E = root.OrbitWardEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var renderer = root.OrbitWardRenderer ? root.OrbitWardRenderer.create(canvas) : null;
  var audio = root.OrbitWardAudio;

  var els = {
    hud: document.getElementById('hud'),
    time: document.getElementById('time'),
    score: document.getElementById('score'),
    hp: document.getElementById('hp'),
    combo: document.getElementById('combo'),
    perfect: document.getElementById('perfect'),
    status: document.getElementById('status'),
    hint: document.getElementById('hint'),
    pulseBar: document.getElementById('pulse-bar'),
    pulseText: document.getElementById('pulse-text'),
    btnPulse: document.getElementById('btn-pulse'),
    start: document.getElementById('start-overlay'),
    upgrade: document.getElementById('upgrade-overlay'),
    result: document.getElementById('result-overlay'),
    resultEyebrow: document.getElementById('result-eyebrow'),
    resultScore: document.getElementById('result-score'),
    resultRank: document.getElementById('result-rank'),
    resultSub: document.getElementById('result-sub'),
    resultMeta: document.getElementById('result-meta'),
    resultBest: document.getElementById('result-best'),
    upgradeCards: [
      document.getElementById('upgrade-0'),
      document.getElementById('upgrade-1'),
      document.getElementById('upgrade-2')
    ],
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    btnSound: document.getElementById('btn-sound'),
    btnResultSound: document.getElementById('btn-result-sound')
  };

  var best = 0;
  try { best = Number(root.localStorage && root.localStorage.getItem('orbitward-best')) || 0; } catch (e) { }
  var seenEvents = 0;
  var lastPhase = null;
  var dragging = false;

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
    show(els.start, false);
    show(els.upgrade, false);
    show(els.result, false);
    hide(els.hud, false);
    text(els.resultScore, '0');
  }

  function processEvents(state) {
    if (!audio) return;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev.type === 'start' && audio.startTone) audio.startTone();
      else if (ev.type === 'upgradeOffer' && audio.upgradeOffer) audio.upgradeOffer();
      else if (ev.type === 'upgrade' && audio.upgrade) audio.upgrade();
      else if (ev.type === 'reflect' && audio.reflect) audio.reflect();
      else if (ev.type === 'block' && audio.block) audio.block(ev.perfect);
      else if (ev.type === 'miss' && audio.miss) audio.miss();
      else if (ev.type === 'pulse' && audio.pulse) audio.pulse();
      else if (ev.type === 'surge' && audio.surge) audio.surge();
      else if (ev.type === 'finish' && audio.finish) audio.finish(state.result && state.result.win);
    }
    seenEvents = state.events.length;
  }

  function hearts(hp, maxHp) {
    var out = '';
    for (var i = 0; i < maxHp; i++) out += i < hp ? '♥' : '·';
    return out;
  }

  function updateHUD(state) {
    var left = Math.max(0, Math.ceil(state.duration - state.time));
    text(els.time, left);
    text(els.score, state.score);
    text(els.hp, hearts(state.hp, state.maxHp));
    text(els.combo, state.combo > 1 ? 'x' + state.combo : '—');
    text(els.perfect, 'PERFECT ' + state.perfectBlocks);
    text(els.status, 'SHARDS ' + state.shards.length);
    var charge = Math.round(state.pulseCharge * 100);
    if (els.pulseBar) els.pulseBar.style.width = charge + '%';
    text(els.pulseText, charge + '%');
    setClass(els.btnPulse, 'ready', state.pulseCharge >= 1);
    if (els.btnPulse) els.btnPulse.setAttribute('aria-disabled', state.pulseCharge >= 1 ? 'false' : 'true');

    if (state.phase === 'playing') {
      text(els.hint, state.pulseCharge >= 1
        ? 'PULSE READY · CLEAR THE ORBIT'
        : 'DRAG TO ORBIT THE SHIELD · PERFECT BLOCKS CHARGE PULSE');
    }
  }

  function finishUI(state) {
    var r = state.result || {};
    if (r.score > best) {
      best = r.score;
      try { if (root.localStorage) root.localStorage.setItem('orbitward-best', String(best)); } catch (e) { }
    }
    text(els.resultEyebrow, r.win ? 'DAWN BREAKS' : 'THE CORE BREAKS');
    text(els.resultScore, r.score || 0);
    text(els.resultRank, 'RANK ' + (r.rank || '—'));
    text(els.resultSub, r.win ? 'You held the orbit until morning.' : 'The dark found a gap.');
    text(els.resultMeta,
      'BLOCKS ' + (r.blocks || 0) + ' · PERFECT ' + (r.perfectBlocks || 0) +
      ' · BEST CHAIN ' + (r.bestCombo || 0) + ' · PULSE ' + (r.pulseUses || 0) +
      ' · REFLECT ' + (r.reflects || 0) + ' · MODULES ' + (r.upgrades ? r.upgrades.length : 0) + ' · ' + Math.round(r.time || 0) + 's');
    text(els.resultBest, 'BEST ' + best);
    show(els.upgrade, false);
    show(els.result, true);
    hide(els.hud, true);
  }

  function renderUpgrade(state) {
    var choices = state.upgradeChoices || [];
    for (var i = 0; i < els.upgradeCards.length; i++) {
      var card = els.upgradeCards[i];
      if (!card) continue;
      var u = choices[i];
      hide(card, !u);
      if (!u) continue;
      var tag = card.querySelector ? card.querySelector('.upgrade-tag') : null;
      var name = card.querySelector ? card.querySelector('.upgrade-name') : null;
      var desc = card.querySelector ? card.querySelector('.upgrade-desc') : null;
      if (tag) tag.textContent = u.tag;
      if (name) name.textContent = u.name;
      if (desc) desc.textContent = u.desc;
    }
  }

  function chooseUpgrade(index) {
    if (game.state.phase !== 'upgrade') return;
    game.applyUpgrade(index);
    afterInput();
  }

  function sync(state) {
    if (state.phase === 'upgrade') {
      if (lastPhase !== 'upgrade') {
        lastPhase = 'upgrade';
        show(els.result, false);
        hide(els.hud, false);
        renderUpgrade(state);
        show(els.upgrade, true);
      }
      return;
    }
    if (lastPhase === 'upgrade') show(els.upgrade, false);
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      if (state.phase === 'finished') finishUI(state);
      else {
        show(els.result, false);
        hide(els.hud, false);
      }
    }
  }

  function afterInput() {
    var state = game.getState();
    processEvents(state);
    updateHUD(state);
    sync(state);
    if (renderer) renderer.draw(state, (root.performance ? root.performance.now() : Date.now()) / 1000);
  }

  function shieldFromPointer(event) {
    if (!canvas || !canvas.getBoundingClientRect) return;
    var rect = canvas.getBoundingClientRect();
    var cx = rect.left + rect.width * 0.5;
    var cy = rect.top + rect.height * 0.52;
    game.setShieldAngle(Math.atan2(event.clientY - cy, event.clientX - cx));
  }

  function firePulse() {
    if (game.state.phase !== 'playing') return;
    game.pulse();
    afterInput();
  }

  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      dragging = true;
      shieldFromPointer(event);
      afterInput();
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!dragging && event.pointerType !== 'mouse') return;
      if (event && event.preventDefault) event.preventDefault();
      shieldFromPointer(event);
      afterInput();
    });
    canvas.addEventListener('pointerup', function () { dragging = false; });
    canvas.addEventListener('pointercancel', function () { dragging = false; });
  }

  if (root.addEventListener) {
    root.addEventListener('keydown', function (event) {
      if (game.state.phase === 'upgrade') {
        if (event.code === 'Digit1') chooseUpgrade(0);
        else if (event.code === 'Digit2') chooseUpgrade(1);
        else if (event.code === 'Digit3') chooseUpgrade(2);
        return;
      }
      if (game.state.phase !== 'playing') return;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        if (event.preventDefault) event.preventDefault();
        game.turnShield(-0.12);
        afterInput();
      } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        if (event.preventDefault) event.preventDefault();
        game.turnShield(0.12);
        afterInput();
      } else if (event.code === 'Space') {
        if (event.preventDefault) event.preventDefault();
        firePulse();
      }
    });
    root.addEventListener('resize', function () { if (renderer) renderer.resize(); });
  }

  for (var ui = 0; ui < els.upgradeCards.length; ui++) {
    (function (index) {
      if (els.upgradeCards[index]) els.upgradeCards[index].addEventListener('click', function () { chooseUpgrade(index); });
    })(ui);
  }
  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', begin);
  if (els.btnPulse) els.btnPulse.addEventListener('click', function (event) { if (event && event.preventDefault) event.preventDefault(); firePulse(); });
  if (els.btnMute) els.btnMute.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnSound) els.btnSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnResultSound) els.btnResultSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });

  root.__GAME__ = {
    id: 'orbit-ward',
    title: 'ORBIT WARD',
    start: begin,
    autoPlayStep: function () { game.autoStep(); },
    isDone: function () { return game.state.phase === 'finished'; },
    getState: function () { return game.getState(); }
  };

  function loop(now) {
    if (game.state.phase === 'playing') {
      game.update(now, Math.min(0.05, Math.max(0, (now - (loop.last || now)) / 1000)));
    }
    loop.last = now;
    var state = game.getState();
    processEvents(state);
    updateHUD(state);
    sync(state);
    if (renderer) renderer.draw(state, now / 1000);
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  soundLabel();
  if (renderer) renderer.draw(game.getState(), 0);
  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
