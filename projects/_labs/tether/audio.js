/* audio.js : TETHER のシンプルなWebAudio */
(function (root) {
  'use strict';
  var ctx = null, master = null, enabled = true, started = false;
  var drone = null, wind = null;

  function ensure() {
    if (ctx) return true;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return false;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    return true;
  }

  function start() {
    if (!ensure()) return false;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { }
    started = true;
    if (!drone) {
      drone = ctx.createOscillator();
      var dg = ctx.createGain();
      drone.type = 'sine';
      drone.frequency.value = 55;
      dg.gain.value = 0.10;
      drone.connect(dg);
      dg.connect(master);
      drone.start();
    }
    if (!wind) {
      var buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      var wg = ctx.createGain();
      wg.gain.value = 0.035;
      wind.connect(filter);
      filter.connect(wg);
      wg.connect(master);
      wind.start();
    }
    return true;
  }

  function stop() {
    started = false;
    try { if (ctx && ctx.suspend) ctx.suspend(); } catch (e) { }
  }

  function tone(freq, duration, volume, type) {
    if (!ctx || !started || !enabled) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume || 0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (duration || 0.2));
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + (duration || 0.2) + 0.02);
  }

  function attach() { tone(660, 0.16, 0.10, 'triangle'); }
  function snap() { tone(220, 0.3, 0.12, 'sawtooth'); }
  function hit() { tone(110, 0.22, 0.14, 'square'); }
  function bump() { tone(520, 0.12, 0.09, 'triangle'); tone(780, 0.1, 0.05, 'sine'); }
  function finish() { tone(330, 0.8, 0.10, 'sine'); tone(495, 0.8, 0.06, 'sine'); }

  function toggleMute() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.18 : 0;
    return !enabled;
  }
  function isEnabled() { return enabled; }

  root.TetherAudio = {
    start: start, stop: stop, attach: attach, snap: snap, hit: hit, bump: bump, finish: finish,
    toggleMute: toggleMute, isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
