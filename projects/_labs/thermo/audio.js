/* audio.js : THERMO のシンプルなWebAudio */
(function (root) {
  'use strict';
  var ctx = null, master = null, enabled = true, started = false, drone = null;

  function ensure() {
    if (ctx) return true;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return false;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
    return true;
  }

  function start() {
    if (!ensure()) return false;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { }
    started = true;
    if (!drone) {
      drone = ctx.createOscillator();
      var gain = ctx.createGain();
      drone.type = 'sine';
      drone.frequency.value = 48;
      gain.gain.value = 0.05;
      drone.connect(gain);
      gain.connect(master);
      drone.start();
    }
    return true;
  }

  function tone(freq, duration, volume, type) {
    if (!ctx || !started || !enabled) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume || 0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (duration || 0.2));
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + (duration || 0.2) + 0.02);
  }

  function move() { tone(180, 0.05, 0.03, 'triangle'); }
  function absorb() { tone(330, 0.18, 0.08, 'triangle'); tone(495, 0.22, 0.05, 'sine'); }
  function emit() { tone(520, 0.18, 0.07, 'sine'); tone(260, 0.3, 0.06, 'triangle'); }
  function open() { tone(392, 0.16, 0.07, 'sine'); tone(587, 0.2, 0.05, 'sine'); }
  function clear() { tone(523, 0.16, 0.07, 'sine'); tone(659, 0.18, 0.07, 'sine'); tone(784, 0.32, 0.06, 'sine'); }
  function fail() { tone(140, 0.36, 0.1, 'sawtooth'); tone(90, 0.5, 0.08, 'square'); }
  function finish() { tone(523, 0.24, 0.07, 'sine'); tone(659, 0.24, 0.07, 'sine'); tone(784, 0.28, 0.07, 'sine'); tone(1046, 0.6, 0.06, 'sine'); }

  function toggleMute() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.16 : 0;
    return !enabled;
  }
  function isEnabled() { return enabled; }

  root.ThermoAudio = {
    start: start,
    move: move,
    absorb: absorb,
    emit: emit,
    open: open,
    clear: clear,
    fail: fail,
    finish: finish,
    toggleMute: toggleMute,
    isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
