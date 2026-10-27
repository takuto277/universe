/* ui.js : 倍々のHUD・スタート画面・タップ入力 */
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
      bar: $('bar'),
      bpm: $('bpm'),
      barFill: $('bar-fill'),
      btnMute: $('btn-mute'),
      startOverlay: $('start-overlay'),
      btnStart: $('btn-start'),
      btnSound: $('btn-sound'),
      canvas: $('canvas')
    };

    var lastCount = -1;
    var lastCycle = -1;
    var lastBar = -1;
    var bumpTimer = null;

    function soundLabel() {
      var enabled = root.ExpAudio ? root.ExpAudio.isEnabled() : true;
      return enabled ? '音 ON' : '音 OFF';
    }

    function updateSound() {
      setText(els.btnMute, soundLabel());
      setText(els.btnSound, '音: ' + (root.ExpAudio && root.ExpAudio.isEnabled() ? 'ON' : 'OFF'));
    }

    function render(state) {
      var playing = state.phase === 'playing';
      toggleClass(els.startOverlay, 'visible', !playing);
      toggleClass(els.hud, 'is-hidden', !playing);
      if (playing) update(state);
    }

    function update(state) {
      if (!state || state.phase !== 'playing') return;
      if (state.count !== lastCount) {
        setText(els.count, formatCount(state.count));
        if (els.count) {
          els.count.classList.remove('bump');
          if (bumpTimer) clearTimeout(bumpTimer);
          if (els.count.offsetWidth != null) {
            // クラスを付け直してアニメーションを再生する
            els.count.classList.add('bump');
          }
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
      if (state.bar !== lastBar) {
        setText(els.bar, 'BAR ' + (state.bar + 1) + ' / ' + state.barsPerCycle);
        lastBar = state.bar;
      }
      setText(els.bpm, state.bpm + ' BPM');
      var progress = ((state.time % state.cycleSeconds) / state.cycleSeconds) * 100;
      if (els.barFill && els.barFill.style) els.barFill.style.width = Math.max(0, Math.min(100, progress)).toFixed(2) + '%';
    }

    if (els.btnStart) els.btnStart.addEventListener('click', function () {
      if (game.state.phase === 'playing') return;
      if (root.ExpAudio) root.ExpAudio.start();
      updateSound();
      game.start();
    });

    function toggleSound() {
      if (root.ExpAudio) root.ExpAudio.toggleMute();
      updateSound();
    }

    if (els.btnMute) els.btnMute.addEventListener('click', toggleSound);
    if (els.btnSound) els.btnSound.addEventListener('click', toggleSound);

    if (els.canvas) {
      els.canvas.addEventListener('pointerdown', function (event) {
        if (game.state.phase !== 'playing') return;
        if (event && event.preventDefault) event.preventDefault();
        var rect = els.canvas.getBoundingClientRect ? els.canvas.getBoundingClientRect() : { left: 0, top: 0 };
        var x = (event ? event.clientX : 0) - rect.left;
        var y = (event ? event.clientY : 0) - rect.top;
        renderer.tap(x, y);
        game.tap(x, y);
        if (root.ExpAudio) root.ExpAudio.tap();
      });
    }

    if (root.addEventListener) {
      root.addEventListener('resize', function () {
        if (renderer && renderer.resize) renderer.resize();
      });
    }

    game.onChange(render);
    updateSound();
    render(game.getState());

    return {
      render: render,
      update: update,
      updateSound: updateSound
    };
  }

  root.ExponentialUI = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
