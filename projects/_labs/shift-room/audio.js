/* audio.js : SHIFT ROOM の WebAudio シンセSFX（外部音源なし） */
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
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      master = null;
      return false;
    }
    return true;
  }

  function start() {
    if (!ensure()) return false;
    try {
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { }
    started = true;
    return true;
  }

  function tone(freq, duration, volume, type, endFreq) {
    if (!ctx || !started || !enabled) return;
    try {
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      gain.gain.setValueAtTime(Math.max(0.0001, volume || 0.05), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    } catch (e) { }
  }

  function key() {
    tone(660, 0.12, 0.06, 'sine');
    tone(990, 0.2, 0.05, 'triangle');
    tone(1320, 0.28, 0.04, 'sine');
  }

  function shift() {
    tone(520, 0.16, 0.05, 'square', 120);
    tone(280, 0.22, 0.04, 'sawtooth', 70);
  }

  function doorOpen() {
    tone(196, 0.35, 0.05, 'triangle');
    tone(294, 0.45, 0.05, 'sine');
    tone(392, 0.6, 0.04, 'sine');
  }

  function roomClear() {
    tone(523, 0.16, 0.05, 'sine');
    tone(659, 0.18, 0.05, 'sine');
    tone(784, 0.22, 0.05, 'sine');
    tone(1046, 0.4, 0.04, 'sine');
  }

  function victory() {
    tone(392, 0.2, 0.06, 'sine');
    tone(523, 0.22, 0.06, 'sine');
    tone(659, 0.24, 0.06, 'sine');
    tone(784, 0.3, 0.06, 'sine');
    tone(1046, 0.7, 0.05, 'sine');
  }

  function gameOver() {
    tone(220, 0.4, 0.06, 'sawtooth', 110);
    tone(110, 0.8, 0.06, 'square', 55);
  }

  function tick() {
    tone(880, 0.04, 0.02, 'square');
  }

  function toggleMute() {
    enabled = !enabled;
    if (master) {
      try { master.gain.value = enabled ? 0.16 : 0; } catch (e) { }
    }
    return !enabled;
  }

  function isEnabled() {
    return enabled;
  }

  root.ShiftRoomAudio = {
    start: start,
    key: key,
    shift: shift,
    doorOpen: doorOpen,
    roomClear: roomClear,
    victory: victory,
    gameOver: gameOver,
    tick: tick,
    toggleMute: toggleMute,
    isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
