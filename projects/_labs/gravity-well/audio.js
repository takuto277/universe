/* audio.js : GRAVITY WELL のWebAudio（AudioContextが無い環境では無音） */
(function (root) {
  'use strict';
  var ctx = null;
  var master = null;
  var enabled = true;
  var started = false;

  function ensure() {
    if (ctx) return true;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return false;
    try {
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.14;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      return false;
    }
    return true;
  }

  function start() {
    if (!ensure()) return false;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { }
    started = true;
    return true;
  }

  function tone(freq, duration, volume, type) {
    if (!ctx || !started || !enabled) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume || 0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (duration || 0.2));
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + (duration || 0.2) + 0.02);
    } catch (e) { }
  }

  function move() { tone(300, 0.04, 0.02, 'square'); }
  function rotate() { tone(240, 0.14, 0.05, 'triangle'); tone(520, 0.18, 0.035, 'sine'); }
  function lock() { tone(150, 0.09, 0.06, 'square'); }
  function drop() { tone(110, 0.14, 0.08, 'sawtooth'); }
  function clear(count) {
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < Math.max(1, Math.min(4, count)); i++) {
      tone(notes[i], 0.22 + i * 0.04, 0.06 - i * 0.008, 'sine');
    }
  }
  function over() { tone(220, 0.3, 0.07, 'sawtooth'); tone(110, 0.5, 0.06, 'square'); }
  function win() { tone(523, 0.2, 0.06, 'sine'); tone(784, 0.28, 0.055, 'sine'); tone(1047, 0.55, 0.05, 'sine'); }

  function toggleMute() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.14 : 0;
    return !enabled;
  }
  function isEnabled() { return enabled; }

  root.GravityWellAudio = {
    start: start,
    move: move,
    rotate: rotate,
    lock: lock,
    drop: drop,
    clear: clear,
    over: over,
    win: win,
    toggleMute: toggleMute,
    isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
