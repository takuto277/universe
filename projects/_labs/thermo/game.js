/* game.js : THERMO の起動・入力・描画ループ */
(function (root) {
  'use strict';
  var E = root.ThermoEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var renderer = root.ThermoRenderer ? root.ThermoRenderer.create(canvas) : null;
  var audio = root.ThermoAudio;
  var DIRS = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
  var els = {
    hud: document.getElementById('hud'),
    room: document.getElementById('room'),
    roomName: document.getElementById('room-name'),
    tempValue: document.getElementById('temp-value'),
    tempMark: document.getElementById('temp-mark'),
    tempTrack: document.querySelector ? document.querySelector('.temp-track') : null,
    moves: document.getElementById('moves'),
    time: document.getElementById('time'),
    prompt: document.getElementById('prompt'),
    start: document.getElementById('start-overlay'),
    state: document.getElementById('state-overlay'),
    stateContent: document.querySelector ? document.querySelector('.state-content') : null,
    stateEyebrow: document.getElementById('state-eyebrow'),
    stateTitle: document.getElementById('state-title'),
    stateSub: document.getElementById('state-sub'),
    stateStats: document.getElementById('state-stats'),
    btnState: document.getElementById('btn-state'),
    btnStart: document.getElementById('btn-start'),
    btnMute: document.getElementById('btn-mute'),
    btnSound: document.getElementById('btn-sound'),
    btnStateSound: document.getElementById('btn-state-sound'),
    controls: document.getElementById('controls'),
    btnAct: document.getElementById('btn-act')
  };
  var perfStart = null;
  var lastNow = null;
  var lastPhase = null;
  var seenEvents = 0;
  var keyMoveAt = 0;
  var padTimer = null;
  var padRepeat = null;

  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function hide(el, on) { if (el) el.classList.toggle('is-hidden', !!on); }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function setClass(el, name, on) { if (el) el.classList.toggle(name, !!on); }

  function soundLabel() {
    var on = audio ? audio.isEnabled() : true;
    text(els.btnMute, on ? 'SOUND ON' : 'SOUND OFF');
    text(els.btnSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
    text(els.btnStateSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
  }

  function begin() {
    game.start();
    if (audio) { audio.start(); soundLabel(); }
    seenEvents = 0;
    lastPhase = null;
    perfStart = null;
    lastNow = null;
    show(els.start, false);
    show(els.state, false);
    hide(els.hud, false);
    hide(els.controls, false);
  }

  function processEvents(state) {
    if (!audio || !state.events) return;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev.type === 'absorb' && audio.absorb) audio.absorb();
      else if (ev.type === 'emit' && audio.emit) audio.emit();
      else if (ev.type === 'clear' && audio.clear) audio.clear();
      else if (ev.type === 'fail' && audio.fail) audio.fail();
      else if (ev.type === 'finish' && audio.finish) audio.finish();
      else if (ev.type === 'next' && audio.open) audio.open();
    }
    seenEvents = state.events.length;
  }

  function updateHUD(state) {
    text(els.room, 'ROOM ' + state.level + ' / ' + state.levelCount);
    text(els.roomName, state.levelName);
    text(els.tempValue, state.temp);
    text(els.moves, 'MOVES ' + state.levelMoves);
    text(els.time, 'TIME ' + state.levelTime.toFixed(1));
    if (els.tempMark) {
      els.tempMark.style.left = Math.max(0, Math.min(100, state.temp)) + '%';
      var hot = Math.max(0, Math.min(1, (state.temp - state.safeMin) / (state.safeMax - state.safeMin)));
      els.tempMark.style.background = hot > 0.55 ? '#ff9a5a' : '#6fd6c3';
    }
    var target = state.target;
    var prompt = 'MOVE NEXT TO A WATER, ICE, EMBER OR DOOR';
    var kind = '';
    if (target && target.kind === 'absorb') {
      prompt = target.tile === '~' ? 'ABSORB WATER · FREEZE +15°C' : 'ABSORB EMBER · WARM +15°C';
      kind = 'absorb';
    } else if (target && target.kind === 'emit') {
      prompt = target.tile === 'D' ? 'EMIT HEAT · OPEN DOOR -15°C' : 'EMIT HEAT · MELT ICE -15°C';
      kind = 'emit';
    }
    text(els.prompt, prompt);
    setClass(els.prompt, 'absorb', kind === 'absorb');
    setClass(els.prompt, 'emit', kind === 'emit');
  }

  function syncOverlay(state) {
    if (state.phase === lastPhase) return;
    lastPhase = state.phase;
    if (state.phase === 'playing') {
      show(els.state, false);
      hide(els.hud, false);
      hide(els.controls, false);
      return;
    }
    if (state.phase === 'start') return;
    show(els.state, true);
    hide(els.controls, true);
    hide(els.hud, false);
    setClass(els.stateContent, 'failed', state.phase === 'failed');
    setClass(els.stateContent, 'finished', state.phase === 'finished');
    var r = state.result || {};
    if (state.phase === 'levelclear') {
      text(els.stateEyebrow, 'ROOM ' + r.level + ' CLEAR');
      text(els.stateTitle, r.levelName || 'CLEAR');
      text(els.stateSub, 'The next room is colder.');
      text(els.stateStats, 'MOVES ' + (r.moves || 0) + ' · TIME ' + (r.time || 0).toFixed(1) + 's');
      text(els.btnState, 'NEXT ROOM');
    } else if (state.phase === 'failed') {
      text(els.stateEyebrow, state.reason === 'FREEZE' ? 'TOO COLD' : 'OVERHEATED');
      text(els.stateTitle, state.reason === 'FREEZE' ? 'FROZEN' : 'BURNED OUT');
      text(els.stateSub, 'The safe band is 20°C to 80°C.');
      text(els.stateStats, 'BODY ' + state.temp + '°C · MOVES ' + state.levelMoves);
      text(els.btnState, 'RETRY ROOM');
    } else if (state.phase === 'finished') {
      text(els.stateEyebrow, 'ALL CLEAR');
      text(els.stateTitle, 'ESCAPED');
      text(els.stateSub, 'All five rooms cleared.');
      text(els.stateStats, 'MOVES ' + (r.totalMoves || 0) + ' · TIME ' + (r.totalTime || 0).toFixed(1) + 's');
      text(els.btnState, 'PLAY AGAIN');
    }
  }

  function afterInput() {
    var s = game.getState();
    processEvents(s);
    updateHUD(s);
    syncOverlay(s);
  }

  function doMove(dir) {
    if (game.state.phase !== 'playing') return;
    var now = root.performance && root.performance.now ? root.performance.now() : Date.now();
    if (now - keyMoveAt < 70) return;
    keyMoveAt = now;
    var d = DIRS[dir];
    if (!d) return;
    var moved = game.move(d[0], d[1]);
    if (moved && audio) audio.move();
    afterInput();
  }

  function doAction() {
    if (game.state.phase !== 'playing') return;
    var changed = game.action();
    if (changed) afterInput();
  }

  function bindPad(btn, dir) {
    if (!btn) return;
    function stop() {
      if (padTimer && root.clearTimeout) root.clearTimeout(padTimer);
      if (padRepeat && root.clearInterval) root.clearInterval(padRepeat);
      padTimer = null;
      padRepeat = null;
    }
    btn.addEventListener('pointerdown', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      doMove(dir);
      stop();
      if (root.setTimeout) {
        padTimer = root.setTimeout(function () {
          if (root.setInterval) padRepeat = root.setInterval(function () { doMove(dir); }, 170);
        }, 320);
      }
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
  }

  var pads = document.querySelectorAll ? document.querySelectorAll('[data-move]') : [];
  for (var pi = 0; pi < pads.length; pi++) bindPad(pads[pi], pads[pi].getAttribute('data-move'));

  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnAct) els.btnAct.addEventListener('pointerdown', function (event) { if (event.preventDefault) event.preventDefault(); doAction(); });
  if (els.btnState) els.btnState.addEventListener('click', function () {
    var phase = game.state.phase;
    if (phase === 'levelclear') game.nextLevel();
    else if (phase === 'failed') game.retryLevel();
    else if (phase === 'finished') game.start();
    else return;
    lastPhase = null;
    show(els.state, false);
    hide(els.controls, false);
    afterInput();
  });
  if (els.btnMute) els.btnMute.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnSound) els.btnSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });
  if (els.btnStateSound) els.btnStateSound.addEventListener('click', function () { if (audio) audio.toggleMute(); soundLabel(); });

  if (root.addEventListener) {
    root.addEventListener('keydown', function (event) {
      var key = event.key;
      var code = event.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].indexOf(key) >= 0 || code === 'Space') {
        if (event.preventDefault) event.preventDefault();
      }
      if (key === 'ArrowUp' || key === 'w' || key === 'W') doMove('U');
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') doMove('R');
      else if (key === 'ArrowDown' || key === 's' || key === 'S') doMove('D');
      else if (key === 'ArrowLeft' || key === 'a' || key === 'A') doMove('L');
      else if (key === ' ' || key === 'Spacebar' || code === 'Space' || key === 'e' || key === 'E') { if (!event.repeat) doAction(); }
    });
    root.addEventListener('resize', function () { if (renderer) renderer.resize(); });
  }

  root.__GAME__ = {
    id: 'thermo',
    title: 'THERMO',
    start: begin,
    autoPlayStep: function () { game.autoPlayStep(); },
    isDone: function () { return game.state.phase === 'finished'; },
    getState: function () { return game.getState(); }
  };

  function loop(now) {
    if (perfStart == null) perfStart = now;
    var dt = lastNow == null ? 1 / 60 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
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
