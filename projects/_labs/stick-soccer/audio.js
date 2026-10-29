(function (root) {
  'use strict';

  var KEY = 'stick-soccer-muted';
  var muted = loadMuted();
  var ctx = null;
  var master = null;
  var crowd = null;
  var crowdGain = null;
  var timer = null;
  var playing = false;
  var step = 0;
  var nextTime = 0;
  var BPM = 108;
  var STEP = 60 / BPM / 2;
  var noiseBuffer = null;

  function loadMuted() {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function saveMuted() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { }
  }
  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, when, dur, type, gain, filterFreq) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    if (filterFreq) {
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      osc.connect(filter);
      filter.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  function noise(when, dur, gain, type, freq) {
    if (!ctx || !noiseBuffer) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var f = ctx.createBiquadFilter();
    f.type = type || 'highpass';
    f.frequency.value = freq || 1200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  function kick(when, gain) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain || 0.16, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + 0.2);
  }

  function startCrowd() {
    if (!ctx || crowd) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.012;
    src.connect(f);
    f.connect(crowdGain);
    crowdGain.connect(master);
    src.start();
    crowd = src;
  }

  function playStep(n, when) {
    var bar = Math.floor(n / 8);
    var beat = n % 8;
    var roots = [130.81, 98.0, 110.0, 87.31];
    var chords = [
      [261.63, 329.63, 392.0],
      [196.0, 246.94, 293.66],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63]
    ];
    var root = roots[bar];
    if (beat === 0 || beat === 3 || beat === 4 || beat === 7) kick(when, beat === 0 ? 0.18 : 0.11);
    if (beat === 4) {
      noise(when, 0.08, 0.055, 'bandpass', 1600);
      tone(196, when, 0.07, 'triangle', 0.025, 2200);
    }
    noise(when, 0.025, beat % 2 === 0 ? 0.018 : 0.009, 'highpass', 6000);
    if (beat % 2 === 0) {
      tone(root, when, 0.18, 'triangle', 0.05, 380);
      tone(root * 2, when, 0.13, 'sine', 0.018, 900);
    }
    if (beat === 0 || beat === 2 || beat === 4 || beat === 6) {
      var chord = chords[bar];
      tone(chord[0], when, 0.2, 'sawtooth', 0.013, 1100);
      tone(chord[1], when, 0.2, 'sawtooth', 0.01, 1100);
      tone(chord[2], when, 0.2, 'sawtooth', 0.008, 1100);
      if (beat === 2 || beat === 6) tone(chord[1] * 2, when, 0.12, 'square', 0.008, 1800);
    }
    if (n === 0) {
      tone(2200, when, 0.16, 'sine', 0.012);
      tone(2600, when + 0.17, 0.12, 'sine', 0.009);
    }
  }

  function scheduler() {
    if (!ctx || !playing) return;
    while (nextTime < ctx.currentTime + 0.16) {
      playStep(step, nextTime);
      step = (step + 1) % 32;
      nextTime += STEP;
    }
  }

  function start() {
    if (muted) return;
    if (!ensure()) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    if (playing) return;
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.06;
    startCrowd();
    scheduler();
    timer = setInterval(scheduler, 25);
  }

  function stop() {
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (crowd) {
      try { crowd.stop(); } catch (e) { }
      crowd = null;
    }
  }

  function setMuted(value) {
    muted = !!value;
    saveMuted();
    if (muted) stop();
    else start();
  }

  function toggle() {
    setMuted(!muted);
    return muted;
  }

  root.SoccerAudio = {
    start: start,
    stop: stop,
    setMuted: setMuted,
    toggle: toggle,
    isMuted: function () { return muted; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
