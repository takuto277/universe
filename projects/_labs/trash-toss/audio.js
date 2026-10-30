/* audio.js : TRASH TOSS のWebAudio */
(function (root) {
  'use strict';
  var ctx = null, master = null, enabled = true, started = false;

  function ensure() {
    if (ctx) return true;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return false;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);
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

  function whoosh() {
    if (!ctx || !started || !enabled) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.22);
    gain.gain.setValueAtTime(0.055, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  function made() { tone(523, 0.18, 0.08, 'sine'); tone(784, 0.24, 0.06, 'sine'); }
  function perfect() { tone(659, 0.14, 0.07, 'sine'); tone(988, 0.2, 0.06, 'sine'); tone(1318, 0.36, 0.05, 'sine'); }
  function miss() { tone(150, 0.16, 0.06, 'triangle'); }
  function depth() { tone(330, 0.18, 0.07, 'triangle'); tone(440, 0.22, 0.05, 'sine'); }
  function finish() { tone(392, 0.22, 0.07, 'sine'); tone(523, 0.24, 0.07, 'sine'); tone(784, 0.5, 0.06, 'sine'); }

  function toggleMute() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.15 : 0;
    return !enabled;
  }
  function isEnabled() { return enabled; }

  root.TrashTossAudio = {
    start: start, whoosh: whoosh, made: made, perfect: perfect, miss: miss, depth: depth, finish: finish,
    toggleMute: toggleMute, isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
