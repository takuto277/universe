/* ui.js : BLOOM のHUD・モード選択・スタート画面 */
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
      cycle: $('cycle'),
      stat: $('stat'),
      bpm: $('bpm'),
      barFill: $('bar-fill'),
      modeName: $('mode-name'),
      hint: $('hint'),
      btnModes: $('btn-modes'),
      btnMute: $('btn-mute'),
      startOverlay: $('start-overlay'),
      btnStart: $('btn-start'),
      btnSound: $('btn-sound'),
      modeAuto: $('mode-auto'),
      modeFrame: $('mode-frame'),
      canvas: $('canvas')
    };

    var selectedMode = 'auto';
    var lastCount = -1;
    var lastCycle = -1;
    var lastStat = '';
    var lastMode = '';
    var bumpTimer = null;

    function soundOn() {
      return root.ExpAudio ? root.ExpAudio.isEnabled() : true;
    }

    function updateSound() {
      var on = soundOn();
      setText(els.btnMute, on ? 'SOUND ON' : 'SOUND OFF');
      setText(els.btnSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
    }

    function updateStart() {
      setText(els.btnStart, selectedMode === 'frame' ? 'BEGIN FRAME' : 'BEGIN AUTO');
      var autoOn = selectedMode === 'auto';
      toggleClass(els.modeAuto, 'selected', autoOn);
      toggleClass(els.modeFrame, 'selected', !autoOn);
      if (els.modeAuto) els.modeAuto.setAttribute('aria-pressed', autoOn ? 'true' : 'false');
      if (els.modeFrame) els.modeFrame.setAttribute('aria-pressed', autoOn ? 'false' : 'true');
    }

    function render(state) {
      var playing = state.phase === 'playing';
      toggleClass(els.startOverlay, 'visible', !playing);
      toggleClass(els.hud, 'is-hidden', !playing);
      if (playing) {
        update(state);
      } else {
        lastCount = -1;
        lastCycle = -1;
        lastStat = '';
        lastMode = '';
      }
    }

    function update(state) {
      if (!state || state.phase !== 'playing') return;
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
        ? 'CAPTURES ' + (state.captures || 0)
        : 'BAR ' + (state.bar + 1) + ' / ' + state.barsPerCycle;
      if (stat !== lastStat) {
        setText(els.stat, stat);
        lastStat = stat;
      }
      if (state.mode !== lastMode) {
        setText(els.modeName, state.mode === 'frame' ? 'FRAME' : 'AUTO');
        setText(els.hint, state.mode === 'frame' ? 'CATCH IN THE FRAME' : 'DOUBLE ON EVERY BAR');
        lastMode = state.mode;
      }
      setText(els.bpm, state.bpm + ' BPM');
      var progress = ((state.time % state.cycleSeconds) / state.cycleSeconds) * 100;
      if (els.barFill && els.barFill.style) els.barFill.style.width = Math.max(0, Math.min(100, progress)).toFixed(2) + '%';
    }

    function selectMode(mode) {
      selectedMode = mode === 'frame' ? 'frame' : 'auto';
      updateStart();
    }

    if (els.modeAuto) els.modeAuto.addEventListener('click', function () { selectMode('auto'); });
    if (els.modeFrame) els.modeFrame.addEventListener('click', function () { selectMode('frame'); });

    if (els.btnStart) els.btnStart.addEventListener('click', function () {
      if (game.state.phase === 'playing') return;
      if (root.ExpAudio) root.ExpAudio.start();
      updateSound();
      game.start(selectedMode);
    });

    function toggleSound() {
      if (root.ExpAudio) root.ExpAudio.toggleMute();
      updateSound();
    }

    if (els.btnMute) els.btnMute.addEventListener('click', toggleSound);
    if (els.btnSound) els.btnSound.addEventListener('click', toggleSound);

    if (els.btnModes) els.btnModes.addEventListener('click', function () {
      if (root.ExpAudio) root.ExpAudio.stop();
      if (renderer && renderer.clear) renderer.clear();
      game.reset();
      updateStart();
      updateSound();
    });

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
      selectMode: selectMode
    };
  }

  root.ExponentialUI = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
