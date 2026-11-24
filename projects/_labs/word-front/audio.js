/* audio.js : WORD FRONT のWebAudio効果音（外部音源なし・AudioContextなしでも安全） */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.15;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      master = null;
    }
    return ctx;
  }

  function wake() {
    var c = ensure();
    if (!c) return null;
    if (c.state === 'suspended' && c.resume) {
      try { c.resume(); } catch (e) { }
    }
    return c;
  }

  function tone(freq, start, dur, type, volume, slideTo) {
    if (!enabled) return;
    var c = wake();
    if (!c || !master) return;
    try {
      var osc = c.createOscillator();
      var gain = c.createGain();
      var t0 = c.currentTime + (start || 0);
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      var vol = volume == null ? 0.24 : volume;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    } catch (e) { }
  }

  function sweep(startFreq, endFreq, start, dur, type, volume) {
    if (!enabled) return;
    var c = wake();
    if (!c || !master) return;
    try {
      var osc = c.createOscillator();
      var gain = c.createGain();
      var t0 = c.currentTime + (start || 0);
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(startFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
      var vol = volume == null ? 0.2 : volume;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    } catch (e) { }
  }

  function click(freq, dur, volume) {
    tone(freq || 620, 0, dur || 0.06, 'triangle', volume || 0.16);
  }

  function tap() {
    click(740, 0.055, 0.16);
    tone(980, 0.018, 0.045, 'sine', 0.1);
  }

  function confirm() {
    tone(523.25, 0, 0.1, 'triangle', 0.2);
    tone(659.25, 0.07, 0.12, 'triangle', 0.18);
    tone(783.99, 0.15, 0.18, 'sine', 0.16);
  }

  function steal() {
    sweep(360, 140, 0, 0.28, 'sawtooth', 0.14);
    tone(220, 0.02, 0.2, 'square', 0.08);
    tone(880, 0.13, 0.09, 'triangle', 0.12);
  }

  function cpuMove() {
    tone(392, 0, 0.08, 'sine', 0.14);
    tone(329.63, 0.07, 0.11, 'sine', 0.13);
    tone(261.63, 0.16, 0.16, 'triangle', 0.12);
  }

  function hint() {
    tone(880, 0, 0.07, 'sine', 0.15);
    tone(1174.66, 0.06, 0.1, 'sine', 0.13);
    tone(1567.98, 0.13, 0.12, 'sine', 0.1);
  }

  function win() {
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i++) tone(notes[i], i * 0.11, 0.28, 'triangle', 0.2);
    tone(1318.51, 0.48, 0.42, 'sine', 0.14);
  }

  function lose() {
    sweep(392, 130, 0, 0.65, 'sawtooth', 0.13);
    tone(196, 0.18, 0.35, 'triangle', 0.12);
    tone(146.83, 0.38, 0.45, 'sine', 0.1);
  }

  function draw() {
    tone(392, 0, 0.15, 'triangle', 0.14);
    tone(369.99, 0.13, 0.28, 'sine', 0.12);
  }

  function toggleMute() {
    enabled = !enabled;
    if (enabled) {
      wake();
      click(660, 0.06, 0.12);
    }
    return enabled;
  }

  function start() {
    wake();
    tone(523.25, 0, 0.08, 'sine', 0.13);
    tone(783.99, 0.07, 0.12, 'sine', 0.11);
  }

  root.WordFrontAudio = {
    ensure: ensure,
    start: start,
    tap: tap,
    confirm: confirm,
    steal: steal,
    cpu: cpuMove,
    hint: hint,
    win: win,
    lose: lose,
    draw: draw,
    toggleMute: toggleMute,
    isEnabled: function () { return enabled; },
    play: function (name) {
      if (name === 'tap') tap();
      else if (name === 'confirm') confirm();
      else if (name === 'steal') steal();
      else if (name === 'cpu') cpuMove();
      else if (name === 'hint') hint();
      else if (name === 'win') win();
      else if (name === 'lose') lose();
      else click();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
