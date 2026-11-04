/* audio.js : tiny line-lab sounds */
(function (root) {
  'use strict';
  var ctx = null, master = null, enabled = true, started = false;

  function ensure() {
    if (ctx) return true;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return false;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);
    return true;
  }
  function start() {
    if (!ensure()) return false;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { }
    started = true;
    return true;
  }
  function tone(freq, duration, volume, type, delay) {
    if (!ctx || !started || !enabled) return;
    var at = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume || 0.04, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (duration || 0.12));
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + (duration || 0.12) + 0.02);
  }
  function grab() { tone(240, 0.08, 0.03, 'triangle'); }
  function snap() { tone(420, 0.09, 0.055, 'square'); tone(700, 0.13, 0.035, 'sine', 0.025); }
  function deliver() { tone(660, 0.08, 0.035, 'sine'); }
  function invalid() { tone(130, 0.16, 0.055, 'sawtooth'); }
  function toggleMute() { enabled = !enabled; if (master) master.gain.value = enabled ? 0.12 : 0; return !enabled; }
  function isEnabled() { return enabled; }
  root.LoopWorksAudio = { start: start, grab: grab, snap: snap, deliver: deliver, invalid: invalid, toggleMute: toggleMute, isEnabled: isEnabled };
})(typeof globalThis !== 'undefined' ? globalThis : this);
