/* ui.js : BLOOM のHUD・モード選択・スタート画面・レース結果 */
(function (root) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function setText(node, text) { if (node) node.textContent = text == null ? '' : text; }
  function toggleClass(node, name, on) { if (node) node.classList.toggle(name, !!on); }

  function formatCount(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function create(game, renderer) {
    var els = {
      hud: $('hud'),
      count: $('count'),
      countLabel: $('count-label'),
      cycle: $('cycle'),
      stat: $('stat'),
      bpm: $('bpm'),
      barFill: $('bar-fill'),
      modeName: $('mode-name'),
      hint: $('hint'),
      btnHome: $('btn-home'),
      btnMute: $('btn-mute'),
      startOverlay: $('start-overlay'),
      btnStart: $('btn-start'),
      btnSound: $('btn-sound'),
      modeAuto: $('mode-auto'),
      modeFrame: $('mode-frame'),
      modeRace: $('mode-race'),
      modeRace3D: $('mode-race3d'),
      modeAutoState: $('mode-auto-state'),
      modeFrameState: $('mode-frame-state'),
      modeRaceState: $('mode-race-state'),
      modeRace3DState: $('mode-race3d-state'),
      resultOverlay: $('result-overlay'),
      resultTitle: $('result-title'),
      resultSub: $('result-sub'),
      resultWinner: $('result-winner'),
      resultDot: $('result-dot'),
      resultTime: $('result-time'),
      btnRaceAgain: $('btn-race-again'),
      btnResultHome: $('btn-result-home'),
      canvas: $('canvas')
    };

    var selectedMode = 'auto';
    var lastCount = -1;
    var lastCycle = -1;
    var lastStat = '';
    var lastMode = '';
    var bumpTimer = null;
    var drag = null;

    function soundOn() {
      return root.ExpAudio ? root.ExpAudio.isEnabled() : true;
    }

    function updateSound() {
      var on = soundOn();
      setText(els.btnMute, on ? 'SOUND ON' : 'SOUND OFF');
      setText(els.btnSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
    }

    function updateStart() {
      var autoOn = selectedMode === 'auto';
      var frameOn = selectedMode === 'frame';
      var raceOn = selectedMode === 'race';
      var race3dOn = selectedMode === 'race3d';
      setText(els.btnStart, race3dOn ? 'START 3D' : raceOn ? 'START RACE' : frameOn ? 'START FRAME' : 'START AUTO');
      setText(els.modeAutoState, autoOn ? 'SELECTED' : 'SELECT');
      setText(els.modeFrameState, frameOn ? 'SELECTED' : 'SELECT');
      setText(els.modeRaceState, raceOn ? 'SELECTED' : 'SELECT');
      setText(els.modeRace3DState, race3dOn ? 'SELECTED' : 'SELECT');
      toggleClass(els.modeAuto, 'selected', autoOn);
      toggleClass(els.modeFrame, 'selected', frameOn);
      toggleClass(els.modeRace, 'selected', raceOn);
      toggleClass(els.modeRace3D, 'selected', race3dOn);
      if (els.modeAuto) els.modeAuto.setAttribute('aria-pressed', autoOn ? 'true' : 'false');
      if (els.modeFrame) els.modeFrame.setAttribute('aria-pressed', frameOn ? 'true' : 'false');
      if (els.modeRace) els.modeRace.setAttribute('aria-pressed', raceOn ? 'true' : 'false');
      if (els.modeRace3D) els.modeRace3D.setAttribute('aria-pressed', race3dOn ? 'true' : 'false');
    }

    function render(state) {
      var phase = state.phase;
      toggleClass(els.startOverlay, 'visible', phase === 'start');
      toggleClass(els.hud, 'is-hidden', phase !== 'playing');
      toggleClass(els.resultOverlay, 'visible', phase === 'finished');
      if (phase === 'playing') {
        update(state);
      } else if (phase === 'finished') {
        updateResult(state);
      } else {
        lastCount = -1;
        lastCycle = -1;
        lastStat = '';
        lastMode = '';
      }
    }

    function update(state) {
      if (!state || state.phase !== 'playing') return;
      if (state.mode === 'race') {
        updateRace(state, state.race, 'RACE', 'NO TAP · LAST BALL WINS');
        return;
      }
      if (state.mode === 'race3d') {
        updateRace(state, state.race3d, 'RACE 3D', 'DRAG TO ORBIT · UP/DOWN TO TILT');
        return;
      }
      setText(els.countLabel, 'BALLS');
      if (state.count !== lastCount) {
        setText(els.count, formatCount(state.count));
        if (els.count && els.count.classList) {
          els.count.classList.remove('bump');
          if (bumpTimer) clearTimeout(bumpTimer);
          if (els.count.offsetWidth != null) els.count.classList.add('bump');
          bumpTimer = setTimeout(function () {
            if (els.count) els.count.classList.remove('bump');
          }, 190);
        }
        lastCount = state.count;
      }
      if (state.cycle !== lastCycle) {
        setText(els.cycle, 'CYCLE ' + (state.cycle + 1));
        lastCycle = state.cycle;
      }
      var stat = state.mode === 'frame'
        ? 'DOUBLES ' + (state.captures || 0)
        : 'BAR ' + (state.bar + 1) + ' / ' + state.barsPerCycle;
      if (stat !== lastStat) {
        setText(els.stat, stat);
        lastStat = stat;
      }
      if (state.mode !== lastMode) {
        setText(els.modeName, state.mode === 'frame' ? 'FRAME' : 'AUTO');
        setText(els.hint, state.mode === 'frame' ? 'TOUCH THE LINE · TAP TO PUSH' : 'DOUBLE ON EVERY BAR · TAP TO PUSH');
        lastMode = state.mode;
      }
      setText(els.bpm, state.bpm + ' BPM');
      var progress = ((state.time % state.cycleSeconds) / state.cycleSeconds) * 100;
      if (els.barFill && els.barFill.style) els.barFill.style.width = Math.max(0, Math.min(100, progress)).toFixed(2) + '%';
    }

    function updateRace(state, race, modeName, hint) {
      if (!race) return;
      if (race.alive !== lastCount) {
        setText(els.count, String(race.alive));
        if (els.count && els.count.classList) {
          els.count.classList.remove('bump');
          if (bumpTimer) clearTimeout(bumpTimer);
          if (els.count.offsetWidth != null) els.count.classList.add('bump');
          bumpTimer = setTimeout(function () {
            if (els.count) els.count.classList.remove('bump');
          }, 190);
        }
        lastCount = race.alive;
      }
      setText(els.countLabel, 'ALIVE');
      setText(els.cycle, 'TIME ' + race.elapsed.toFixed(1));
      setText(els.stat, 'OUT ' + race.eliminated);
      setText(els.bpm, state.bpm + ' BPM');
      setText(els.modeName, modeName);
      setText(els.hint, hint);
      if (els.barFill && els.barFill.style) {
        var progress = Math.max(0, Math.min(100, (race.eliminated / race.total) * 100));
        els.barFill.style.width = progress.toFixed(2) + '%';
      }
    }

    function updateResult(state) {
      var result = (state.race && state.race.result) || (state.race3d && state.race3d.result);
      if (!result) return;
      setText(els.resultTitle, 'BALL ' + result.winnerId + ' WINS');
      setText(els.resultSub, result.eliminated + ' balls out. Last ball standing.');
      setText(els.resultWinner, 'BALL ' + result.winnerId);
      setText(els.resultTime, result.time.toFixed(1) + 's');
      if (els.resultDot && els.resultDot.style) {
        els.resultDot.style.background = 'hsl(' + result.winnerHue + ', 92%, 64%)';
        els.resultDot.style.boxShadow = '0 0 12px hsla(' + result.winnerHue + ', 92%, 64%, 0.65)';
      }
    }

    function selectMode(mode) {
      selectedMode = mode === 'frame' ? 'frame' : mode === 'race' ? 'race' : mode === 'race3d' ? 'race3d' : 'auto';
      updateStart();
    }

    function startGame() {
      if (game.state.phase === 'playing') return;
      if (root.ExpAudio) root.ExpAudio.start();
      updateSound();
      if (renderer && renderer.clear) renderer.clear();
      game.start(selectedMode);
    }

    function goHome() {
      if (root.ExpAudio) root.ExpAudio.stop();
      if (renderer && renderer.clear) renderer.clear();
      game.reset();
      updateStart();
      updateSound();
    }

    if (els.modeAuto) els.modeAuto.addEventListener('click', function () { selectMode('auto'); });
    if (els.modeFrame) els.modeFrame.addEventListener('click', function () { selectMode('frame'); });
    if (els.modeRace) els.modeRace.addEventListener('click', function () { selectMode('race'); });
    if (els.modeRace3D) els.modeRace3D.addEventListener('click', function () { selectMode('race3d'); });
    if (els.btnStart) els.btnStart.addEventListener('click', startGame);

    function toggleSound() {
      if (root.ExpAudio) root.ExpAudio.toggleMute();
      updateSound();
    }

    if (els.btnMute) els.btnMute.addEventListener('click', toggleSound);
    if (els.btnSound) els.btnSound.addEventListener('click', toggleSound);
    if (els.btnHome) els.btnHome.addEventListener('click', goHome);
    if (els.btnResultHome) els.btnResultHome.addEventListener('click', goHome);
    if (els.btnRaceAgain) els.btnRaceAgain.addEventListener('click', startGame);

    if (els.canvas) {
      els.canvas.addEventListener('pointerdown', function (event) {
        if (game.state.phase !== 'playing') return;
        if (event && event.preventDefault) event.preventDefault();
        var rect = els.canvas.getBoundingClientRect ? els.canvas.getBoundingClientRect() : { width: 1, height: 1, left: 0, top: 0 };
        var w = rect.width || 1;
        var h = rect.height || 1;
        var x = ((event ? event.clientX : 0) - (rect.left || 0));
        var y = ((event ? event.clientY : 0) - (rect.top || 0));
        var state = game.getState();
        if (state.mode === 'race') return;
        if (state.mode === 'race3d') {
          drag = { id: event ? event.pointerId : null, x: event ? event.clientX : 0, y: event ? event.clientY : 0 };
          if (els.canvas.setPointerCapture && event && event.pointerId != null) {
            try { els.canvas.setPointerCapture(event.pointerId); } catch (e) { }
          }
          return;
        }
        if (state.mode === 'frame' && game.tap) {
          game.tap(x * state.field.w / w, y * state.field.h / h);
        }
        if (renderer && renderer.tap) renderer.tap(x, y);
        if (root.ExpAudio && root.ExpAudio.tap) root.ExpAudio.tap();
      });

      els.canvas.addEventListener('pointermove', function (event) {
        if (!drag || game.state.phase !== 'playing') return;
        var dx = (event ? event.clientX : 0) - drag.x;
        var dy = (event ? event.clientY : 0) - drag.y;
        drag.x = event ? event.clientX : drag.x;
        drag.y = event ? event.clientY : drag.y;
        if (renderer && renderer.orbit) renderer.orbit(dx, dy);
        if (event && event.preventDefault) event.preventDefault();
      });

      function endDrag() { drag = null; }
      els.canvas.addEventListener('pointerup', endDrag);
      els.canvas.addEventListener('pointercancel', endDrag);
    }

    if (root.addEventListener) {
      root.addEventListener('resize', function () {
        if (renderer && renderer.resize) renderer.resize();
      });
    }

    game.onChange(render);
    updateStart();
    updateSound();
    render(game.getState());

    return {
      render: render,
      update: update,
      updateSound: updateSound,
      updateStart: updateStart,
      selectMode: selectMode,
      startGame: startGame
    };
  }

  root.ExponentialUI = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
