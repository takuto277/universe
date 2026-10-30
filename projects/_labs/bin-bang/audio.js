/* audio.js : BIN BANG のWebAudio（プロシージャル効果音） */
(function (root) {
  'use strict';
  var ctx = null, master = null, enabled = true, started = false, drone = null, lastStep = -1;

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
    lastStep = -1;
    if (!drone) {
      drone = ctx.createOscillator();
      var gain = ctx.createGain();
      drone.type = 'sawtooth';
      drone.frequency.value = 44;
      gain.gain.value = 0.018;
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

  function fire() { tone(720, 0.035, 0.025, 'square'); }
  function hit() { tone(340, 0.055, 0.04, 'square'); }
  function explode() { tone(120, 0.24, 0.1, 'sawtooth'); tone(70, 0.32, 0.08, 'square'); }
  function bang() { tone(160, 0.3, 0.14, 'sawtooth'); tone(420, 0.2, 0.08, 'square'); }
  function damage() { tone(90, 0.5, 0.13, 'square'); tone(55, 0.6, 0.1, 'sawtooth'); }
  function overdrive() { tone(523, 0.18, 0.08, 'triangle'); tone(784, 0.22, 0.08, 'triangle'); tone(1046, 0.4, 0.06, 'sine'); }
  function boss() { tone(70, 0.7, 0.12, 'sawtooth'); tone(110, 0.8, 0.08, 'square'); }
  function finish() { tone(392, 0.24, 0.08, 'sine'); tone(523, 0.26, 0.08, 'sine'); tone(784, 0.5, 0.07, 'sine'); }
  function beat(time) {
    if (!ctx || !started || !enabled) return;
    var step = Math.floor(time * 8);
    if (step === lastStep) return;
    lastStep = step;
    if (step % 4 === 0) tone(52, 0.12, 0.045, 'sine');
    if (step % 2 === 1) tone(1100, 0.025, 0.012, 'square');
  }

  function toggleMute() {
    enabled = !enabled;
    if (master) master.gain.value = enabled ? 0.16 : 0;
    return !enabled;
  }
  function isEnabled() { return enabled; }

  root.BinBangAudio = {
    start: start, fire: fire, hit: hit, explode: explode, bang: bang, damage: damage,
    overdrive: overdrive, boss: boss, finish: finish, beat: beat,
    toggleMute: toggleMute, isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
