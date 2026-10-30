/* audio.js : ORBIT WARD のWebAudio */
(function (root) {
  'use strict';
  var ctx = null, master = null, enabled = true, started = false, drone = null, droneGain = null;

  function ensure() {
    if (ctx) return true;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return false;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);
    return true;
  }

  function start() {
    if (!ensure()) return false;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { }
    started = true;
    if (!drone) {
      drone = ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 55;
      droneGain = ctx.createGain();
      droneGain.gain.value = 0.035;
      var lfo = ctx.createOscillator();
      var lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain);
      lfoGain.connect(droneGain.gain);
      drone.connect(droneGain);
      droneGain.connect(master);
      drone.start();
      lfo.start();
    }
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
    gain.gain.exponentialRampToValueAtTime(volume || 0.05, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + (duration || 0.2));
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + (duration || 0.2) + 0.03);
  }

  function startTone() { tone(220, 0.3, 0.04, 'triangle'); tone(330, 0.4, 0.035, 'sine', 0.08); }
  function block(perfect) {
    if (perfect) { tone(880, 0.1, 0.05, 'sine'); tone(1320, 0.18, 0.04, 'sine', 0.03); }
    else tone(620, 0.07, 0.032, 'sine');
  }
  function miss() { tone(105, 0.3, 0.075, 'sawtooth'); tone(70, 0.4, 0.05, 'square'); }
  function pulse() { tone(180, 0.45, 0.055, 'sawtooth'); tone(720, 0.4, 0.04, 'triangle', 0.06); tone(1080, 0.5, 0.025, 'sine', 0.12); }
  function surge() { tone(90, 0.35, 0.045, 'square'); tone(150, 0.3, 0.03, 'sawtooth', 0.08); }
  function upgradeOffer() { tone(392, 0.25, 0.045, 'sine'); tone(587, 0.3, 0.035, 'sine', 0.08); }
  function upgrade() { tone(523, 0.25, 0.05, 'triangle'); tone(784, 0.35, 0.04, 'sine', 0.06); }
  function reflect() { tone(1040, 0.12, 0.045, 'triangle'); tone(1560, 0.18, 0.025, 'sine', 0.03); }
  function finish(win) {
    if (win) { tone(392, 0.4, 0.05, 'sine'); tone(523, 0.45, 0.05, 'sine', 0.08); tone(784, 0.7, 0.04, 'triangle', 0.18); }
    else { tone(180, 0.5, 0.05, 'sawtooth'); tone(110, 0.7, 0.04, 'square', 0.12); }
  }
  function toggleMute() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.14 : 0;
    return !enabled;
  }
  function isEnabled() { return enabled; }

  root.OrbitWardAudio = {
    start: start, startTone: startTone, block: block, miss: miss,
    pulse: pulse, surge: surge, upgradeOffer: upgradeOffer, upgrade: upgrade, reflect: reflect, finish: finish,
    toggleMute: toggleMute, isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
