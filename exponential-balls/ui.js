/* ui.js : BLOOM のHUD・モード選択・予想・レース結果 */
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
      hud: $('hud'), count: $('count'), countLabel: $('count-label'), cycle: $('cycle'),
      stat: $('stat'), bpm: $('bpm'), barFill: $('bar-fill'), modeName: $('mode-name'),
      hint: $('hint'), btnHome: $('btn-home'), btnMute: $('btn-mute'),
      startOverlay: $('start-overlay'), btnStart: $('btn-start'), btnSound: $('btn-sound'),
      modeAuto: $('mode-auto'), modeFrame: $('mode-frame'), modeRace: $('mode-race'),
      modeRace3D: $('mode-race3d'), modeAutoState: $('mode-auto-state'),
      modeFrameState: $('mode-frame-state'), modeRaceState: $('mode-race-state'),
      modeRace3DState: $('mode-race3d-state'),
      predictOverlay: $('predict-overlay'), predictGrid: $('predict-grid'),
      predictDot: $('predict-dot'), predictName: $('predict-name'),
      statSpeed: $('stat-speed'), statBounce: $('stat-bounce'),
      statGrip: $('stat-grip'), statSize: $('stat-size'),
      predictStreak: $('predict-streak'), btnPredictStart: $('btn-predict-start'),
      btnPredictHome: $('btn-predict-home'),
      resultOverlay: $('result-overlay'), resultTitle: $('result-title'),
      resultSub: $('result-sub'), resultWinner: $('result-winner'),
      resultDot: $('result-dot'), resultTime: $('result-time'),
      camSlider: $('cam-slider'), camTrack: $('cam-track'), camThumb: $('cam-thumb'),
      btnRaceAgain: $('btn-race-again'), btnResultHome: $('btn-result-home'),
      canvas: $('canvas')
    };

    var selectedMode = 'auto';
    var lastCount = -1;
    var lastCycle = -1;
    var lastStat = '';
    var lastMode = '';
    var bumpTimer = null;
    var drag = null;
    var camNorm = 0;
    var camDrag = false;
    var predicting = false;
    var pickedBall = 1;
    var predictBuilt = false;
    var predictButtons = {};
    var preview = (root.ExponentialEngine && root.ExponentialEngine.RACE3D)
      ? root.ExponentialEngine.RACE3D.preview : [];
    var streak = 0;
    var best = 0;
    var resultRecorded = false;

    try {
      streak = Number(root.localStorage && root.localStorage.getItem('bloom-race3d-streak')) || 0;
      best = Number(root.localStorage && root.localStorage.getItem('bloom-race3d-best')) || 0;
    } catch (e) { }

    function saveStreak() {
      try {
        if (root.localStorage) {
          root.localStorage.setItem('bloom-race3d-streak', String(streak));
          root.localStorage.setItem('bloom-race3d-best', String(best));
        }
      } catch (e) { }
    }

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

    function updateCamSlider() {
      if (els.camThumb && els.camThumb.style) els.camThumb.style.top = (camNorm * 100).toFixed(2) + '%';
      if (els.camSlider) els.camSlider.setAttribute('aria-valuenow', camNorm.toFixed(2));
    }

    function setCamFromEvent(event) {
      if (!els.camTrack) return;
      var rect = els.camTrack.getBoundingClientRect ? els.camTrack.getBoundingClientRect() : { top: 0, height: 1 };
      var h = rect.height || 1;
      var y = (event ? event.clientY : 0) - (rect.top || 0);
      camNorm = Math.max(0, Math.min(1, y / h));
      if (renderer && renderer.setFocusNorm) renderer.setFocusNorm(camNorm);
      updateCamSlider();
    }

    function getSpec(id) {
      for (var i = 0; i < preview.length; i++) if (preview[i].id === id) return preview[i];
      return preview[0] || null;
    }

    function buildPredictGrid() {
      if (predictBuilt || !els.predictGrid) return;
      predictBuilt = true;
      for (var i = 0; i < preview.length; i++) {
        var spec = preview[i];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.classList.add('predict-ball');
        btn.setAttribute('aria-pressed', 'false');
        var dot = document.createElement('i');
        if (dot.style) dot.style.background = 'hsl(' + spec.hue + ', 92%, 64%)';
        var label = document.createElement('span');
        label.textContent = String(spec.id);
        var type = document.createElement('small');
        type.textContent = spec.type;
        btn.appendChild(dot);
        btn.appendChild(label);
        btn.appendChild(type);
        (function (id) {
          btn.addEventListener('click', function () { selectBall(id); });
        })(spec.id);
        predictButtons[spec.id] = btn;
        els.predictGrid.appendChild(btn);
      }
    }

    function selectBall(id) {
      pickedBall = Number(id);
      for (var key in predictButtons) {
        var btn = predictButtons[key];
        var on = Number(key) === pickedBall;
        toggleClass(btn, 'selected', on);
        if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      var spec = getSpec(pickedBall);
      if (!spec) return;
      setText(els.predictName, 'BALL ' + spec.id + ' · ' + spec.type);
      if (els.predictDot && els.predictDot.style) {
        els.predictDot.style.background = 'hsl(' + spec.hue + ', 92%, 64%)';
        els.predictDot.style.boxShadow = '0 0 10px hsla(' + spec.hue + ', 92%, 64%, 0.7)';
      }
      setText(els.statSpeed, spec.speed.toFixed(2));
      setText(els.statBounce, spec.bounce.toFixed(2));
      setText(els.statGrip, spec.grip.toFixed(2));
      setText(els.statSize, spec.size.toFixed(1));
      if (els.predictStreak) setText(els.predictStreak, 'STREAK ' + streak + ' · BEST ' + best);
    }

    function openPrediction() {
      predicting = true;
      resultRecorded = false;
      buildPredictGrid();
      selectBall(pickedBall || 1);
      render(game.getState());
    }

    function render(state) {
      if (predicting) {
        toggleClass(els.startOverlay, 'visible', false);
        toggleClass(els.hud, 'is-hidden', true);
        toggleClass(els.resultOverlay, 'visible', false);
        toggleClass(els.predictOverlay, 'visible', true);
        toggleClass(els.camSlider, 'is-hidden', true);
        return;
      }
      toggleClass(els.predictOverlay, 'visible', false);
      var phase = state.phase;
      toggleClass(els.startOverlay, 'visible', phase === 'start');
      toggleClass(els.hud, 'is-hidden', phase !== 'playing');
      toggleClass(els.resultOverlay, 'visible', phase === 'finished');
      var showSlider = phase === 'playing' && state.mode === 'race3d';
      toggleClass(els.camSlider, 'is-hidden', !showSlider);
      if (showSlider) {
        if (renderer && renderer.setFocusNorm) renderer.setFocusNorm(camNorm);
        updateCamSlider();
      }
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
      if (state.mode === 'race3d') { updateRace3D(state); return; }
      if (state.mode === 'race') { updateRace(state); return; }
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
      var stat = state.mode === 'frame' ? 'DOUBLES ' + (state.captures || 0) : 'BAR ' + (state.bar + 1) + ' / ' + state.barsPerCycle;
      if (stat !== lastStat) { setText(els.stat, stat); lastStat = stat; }
      if (state.mode !== lastMode) {
        setText(els.modeName, state.mode === 'frame' ? 'FRAME' : 'AUTO');
        setText(els.hint, state.mode === 'frame' ? 'TOUCH THE LINE · TAP TO PUSH' : 'DOUBLE ON EVERY BAR · TAP TO PUSH');
        lastMode = state.mode;
      }
      setText(els.bpm, state.bpm + ' BPM');
      var progress = ((state.time % state.cycleSeconds) / state.cycleSeconds) * 100;
      if (els.barFill && els.barFill.style) els.barFill.style.width = Math.max(0, Math.min(100, progress)).toFixed(2) + '%';
    }

    function updateRace(state) {
      var race = state.race;
      if (!race) return;
      setText(els.countLabel, 'ALIVE');
      if (race.alive !== lastCount) {
        setText(els.count, String(race.alive));
        lastCount = race.alive;
      }
      setText(els.cycle, 'TIME ' + race.elapsed.toFixed(1));
      setText(els.stat, 'OUT ' + race.eliminated);
      setText(els.bpm, state.bpm + ' BPM');
      setText(els.modeName, 'RACE');
      setText(els.hint, 'NO TAP · LAST BALL WINS');
      if (els.barFill && els.barFill.style) {
        els.barFill.style.width = Math.max(0, Math.min(100, (race.eliminated / race.total) * 100)).toFixed(2) + '%';
      }
    }

    function updateRace3D(state) {
      var race = state.race3d;
      if (!race) return;
      var pick = race.prediction;
      var pos = pick && race.positions ? race.positions[pick] : 0;
      var picked = null;
      for (var i = 0; i < race.balls.length; i++) if (race.balls[i].id === Number(pick)) picked = race.balls[i];
      if (pos !== lastCount) {
        setText(els.count, pos ? '#' + pos : '--');
        if (els.count && els.count.classList) {
          els.count.classList.remove('bump');
          if (bumpTimer) clearTimeout(bumpTimer);
          if (els.count.offsetWidth != null) els.count.classList.add('bump');
          bumpTimer = setTimeout(function () {
            if (els.count) els.count.classList.remove('bump');
          }, 190);
        }
        lastCount = pos;
      }
      setText(els.countLabel, 'POS');
      setText(els.cycle, 'TIME ' + race.elapsed.toFixed(1));
      setText(els.stat, 'PICK ' + (pick ? '#' + pick : '--'));
      setText(els.bpm, state.bpm + ' BPM');
      setText(els.modeName, 'RACE 3D');
      setText(els.hint, 'DRAG TO ORBIT · SLIDER TO TRAVEL');
      if (els.barFill && els.barFill.style) {
        var progress = picked ? Math.max(0, Math.min(100, (picked.y / race.goalY) * 100)) : 0;
        els.barFill.style.width = progress.toFixed(2) + '%';
      }
    }

    function updateResult(state) {
      if (state.race3d && state.race3d.result) {
        var r3 = state.race3d.result;
        if (!resultRecorded) {
          resultRecorded = true;
          if (r3.predictedWon) streak += 1; else streak = 0;
          best = Math.max(best, streak);
          saveStreak();
          if (els.predictStreak) setText(els.predictStreak, 'STREAK ' + streak + ' · BEST ' + best);
        }
        setText(els.resultTitle, r3.predictedWon ? 'YOUR BALL WINS' : 'BALL ' + r3.winnerId + ' WINS');
        setText(els.resultSub, r3.predicted != null
          ? 'You picked BALL ' + r3.predicted + ' · Streak ' + streak + ' · Best ' + best
          : 'First to the goal.');
        setText(els.resultWinner, 'BALL ' + r3.winnerId);
        setText(els.resultTime, r3.time.toFixed(1) + 's');
        if (els.resultDot && els.resultDot.style) {
          els.resultDot.style.background = 'hsl(' + r3.winnerHue + ', 92%, 64%)';
          els.resultDot.style.boxShadow = '0 0 12px hsla(' + r3.winnerHue + ', 92%, 64%, 0.65)';
        }
        return;
      }
      var r2 = state.race && state.race.result;
      if (!r2) return;
      setText(els.resultTitle, 'BALL ' + r2.winnerId + ' WINS');
      setText(els.resultSub, r2.eliminated + ' balls out. Last ball standing.');
      setText(els.resultWinner, 'BALL ' + r2.winnerId);
      setText(els.resultTime, r2.time.toFixed(1) + 's');
      if (els.resultDot && els.resultDot.style) {
        els.resultDot.style.background = 'hsl(' + r2.winnerHue + ', 92%, 64%)';
        els.resultDot.style.boxShadow = '0 0 12px hsla(' + r2.winnerHue + ', 92%, 64%, 0.65)';
      }
    }

    function selectMode(mode) {
      selectedMode = mode === 'frame' ? 'frame' : mode === 'race' ? 'race' : mode === 'race3d' ? 'race3d' : 'auto';
      updateStart();
    }

    function startGame() {
      if (game.state.phase === 'playing') return;
      if (selectedMode === 'race3d') { openPrediction(); return; }
      if (root.ExpAudio) root.ExpAudio.start();
      updateSound();
      if (renderer && renderer.clear) renderer.clear();
      game.start(selectedMode);
    }

    function startPredicted() {
      if (!predicting) return;
      predicting = false;
      if (root.ExpAudio) root.ExpAudio.start();
      updateSound();
      if (renderer && renderer.clear) renderer.clear();
      if (renderer && renderer.setFocusNorm) renderer.setFocusNorm(camNorm);
      game.start('race3d');
      if (game.setPrediction) game.setPrediction(pickedBall);
      resultRecorded = false;
    }

    function goHome() {
      predicting = false;
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
    if (els.btnPredictStart) els.btnPredictStart.addEventListener('click', startPredicted);
    if (els.btnPredictHome) els.btnPredictHome.addEventListener('click', goHome);

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
        if (state.mode === 'frame' && game.tap) game.tap(x * state.field.w / w, y * state.field.h / h);
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

    if (els.camSlider) {
      els.camSlider.addEventListener('pointerdown', function (event) {
        if (game.state.phase !== 'playing' || game.state.mode !== 'race3d') return;
        camDrag = true;
        if (els.camSlider.setPointerCapture && event && event.pointerId != null) {
          try { els.camSlider.setPointerCapture(event.pointerId); } catch (e) { }
        }
        setCamFromEvent(event);
        if (event && event.preventDefault) event.preventDefault();
      });
      els.camSlider.addEventListener('pointermove', function (event) {
        if (!camDrag) return;
        setCamFromEvent(event);
        if (event && event.preventDefault) event.preventDefault();
      });
      function endCamDrag() { camDrag = false; }
      els.camSlider.addEventListener('pointerup', endCamDrag);
      els.camSlider.addEventListener('pointercancel', endCamDrag);
    }

    if (root.addEventListener) {
      root.addEventListener('resize', function () {
        if (renderer && renderer.resize) renderer.resize();
      });
    }

    game.onChange(render);
    updateStart();
    updateSound();
    buildPredictGrid();
    render(game.getState());

    return {
      render: render, update: update, updateSound: updateSound, updateStart: updateStart,
      selectMode: selectMode, startGame: startGame, selectBall: selectBall,
      openPrediction: openPrediction, startPredicted: startPredicted
    };
  }

  root.ExponentialUI = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
