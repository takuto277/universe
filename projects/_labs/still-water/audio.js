/* audio.js : STILL WATER のWebAudio */
(function (root) {
  'use strict';
  var ctx = null, master = null, enabled = true, started = false, stream = null, filter = null;

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
    if (!stream) {
      var buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      stream = ctx.createBufferSource();
      stream.buffer = buffer;
      stream.loop = true;
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 430;
      var gain = ctx.createGain();
      gain.gain.value = 0.035;
      stream.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      stream.start();
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
  function cast() { tone(220, 0.18, 0.05, 'sine'); tone(560, 0.25, 0.03, 'triangle'); }
  function splash() { tone(120, 0.2, 0.08, 'sine'); tone(380, 0.3, 0.04, 'triangle'); }
  function bite() { tone(740, 0.1, 0.06, 'triangle'); tone(980, 0.16, 0.04, 'sine'); }
  function hook() { tone(330, 0.18, 0.07, 'square'); }
  function reel() { tone(180, 0.045, 0.018, 'square'); }
  function catchFish() { tone(523, 0.16, 0.07, 'sine'); tone(659, 0.18, 0.06, 'sine'); tone(880, 0.4, 0.05, 'sine'); }
  function escape() { tone(140, 0.35, 0.08, 'sawtooth'); tone(80, 0.5, 0.06, 'square'); }
  function finish() { tone(392, 0.25, 0.06, 'sine'); tone(523, 0.28, 0.06, 'sine'); tone(784, 0.6, 0.05, 'sine'); }
  function toggleMute() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.15 : 0;
    return !enabled;
  }
  function isEnabled() { return enabled; }

  root.StillWaterAudio = {
    start: start, cast: cast, splash: splash, bite: bite, hook: hook, reel: reel,
    catch: catchFish, escape: escape, finish: finish,
    toggleMute: toggleMute, isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
