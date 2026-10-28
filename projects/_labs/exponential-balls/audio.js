/* audio.js : BLOOM のプロシージャル音楽（WebAudio）
 *
 * 120 BPM / 4/4。16分ステップを先読みして、
 * キック・ハット・ベース・アルペジオ・パッド・ライザーを鳴らす。
 * 小節が進むほど層が増え、12小節でサイクルが変わる。
 */
(function (root) {
  'use strict';

  var BPM = 120;
  var STEP = 60 / BPM / 4;
  var BEAT = STEP * 4;
  var BAR = BEAT * 4;
  var STEPS_PER_BAR = 16;
  var BARS_PER_CYCLE = 12;
  var SCALE = [0, 3, 5, 7, 10];
  var ROOTS = [130.81, 155.56, 174.61, 196.00];

  var ctx = null;
  var master = null;
  var compressor = null;
  var delay = null;
  var delayFeedback = null;
  var delaySend = null;
  var noiseBuffer = null;
  var started = false;
  var scheduledStep = -1;
  var enabled = true;
  var currentRoot = ROOTS[0];
  var failed = false;

  function ensure() {
    if (ctx || failed) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.22 : 0;
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      master.connect(compressor);
      compressor.connect(ctx.destination);

      delay = ctx.createDelay(1.0);
      delay.delayTime.value = STEP * 3;
      delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.26;
      delay.connect(delayFeedback);
      delayFeedback.connect(delay);
      delaySend = ctx.createGain();
      delaySend.gain.value = 0.25;
      delaySend.connect(delay);
      delay.connect(master);

      noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2.4), ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
      failed = true;
    }
    return ctx;
  }

  function start() {
    if (!ensure()) return false;
    try {
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    } catch (e) { /* ユーザー操作で再開する */ }
    started = true;
    scheduledStep = -1;
    lastCapture = -10;
    if (master) master.gain.setTargetAtTime(enabled ? 0.22 : 0, ctx.currentTime, 0.02);
    return true;
  }

  function ready() {
    return !!(ctx && started);
  }

  function setMuted(muted) {
    enabled = !muted;
    if (master && ctx) master.gain.setTargetAtTime(enabled ? 0.22 : 0, ctx.currentTime, 0.02);
    return !enabled;
  }

  function toggleMute() {
    enabled = !enabled;
    if (master && ctx) master.gain.setTargetAtTime(enabled ? 0.22 : 0, ctx.currentTime, 0.02);
    return !enabled;
  }

  function isEnabled() { return enabled; }

  function whenFor(step, t) {
    var delta = step * STEP - t;
    return ctx.currentTime + (delta > 0 ? delta : 0.004);
  }

  function oscillator(type, freq, when, stopAt, volume, target, sendDelay) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    osc.connect(gain);
    gain.connect(target || master);
    if (sendDelay && delaySend) {
      var send = ctx.createGain();
      send.gain.value = 0.18;
      gain.connect(send);
      send.connect(delaySend);
    }
    osc.start(when);
    osc.stop(stopAt + 0.02);
  }

  function kick(when, volume) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, when);
    osc.frequency.exponentialRampToValueAtTime(44, when + 0.16);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.32);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + 0.34);
  }

  function noise(when, duration, volume, highpass, bandpass) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var gain = ctx.createGain();
    var filter = null;
    var head = volume;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(head, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    src.connect(gain);
    if (highpass) {
      filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;
      gain.connect(filter);
      filter.connect(master);
    } else if (bandpass) {
      filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = bandpass;
      filter.Q.value = 0.8;
      gain.connect(filter);
      filter.connect(master);
    } else {
      gain.connect(master);
    }
    src.start(when);
    src.stop(when + duration + 0.02);
  }

  function hat(when, volume, duration) {
    noise(when, duration || 0.035, volume, 7000, 0);
  }

  function snare(when) {
    noise(when, 0.12, 0.11, 1200, 0);
    oscillator('triangle', 185, when, when + 0.07, 0.06, master, false);
  }

  function bass(when, freq, volume) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.24);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + 0.27);
  }

  function pluck(when, freq, volume, duration, type) {
    oscillator(type || 'triangle', freq, when, when + (duration || 0.12), volume, master, true);
  }

  function pad(when, rootFreq) {
    var freqs = [rootFreq, rootFreq * 1.1892, rootFreq * 1.4983];
    for (var i = 0; i < freqs.length; i++) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.028, when + 0.35);
      gain.gain.linearRampToValueAtTime(0.0001, when + BAR * 1.8);
      osc.connect(gain);
      gain.connect(master);
      osc.start(when);
      osc.stop(when + BAR * 1.9);
    }
  }

  function riser(when, duration, rootFreq) {
    noise(when, duration, 0.045, 0, 900);
    oscillator('sawtooth', rootFreq * 2, when, when + duration, 0.03, master, false);
  }

  function impact(when) {
    kick(when, 1.2);
    noise(when, 0.6, 0.18, 0, 180);
    oscillator('sine', 65, when, when + 0.8, 0.18, master, false);
  }

  function scheduleStep(step, t) {
    var stepInBar = step % STEPS_PER_BAR;
    var bar = Math.floor(step / STEPS_PER_BAR) % BARS_PER_CYCLE;
    var cycle = Math.floor(step / (STEPS_PER_BAR * BARS_PER_CYCLE));
    var rootIndex = cycle % ROOTS.length;
    var rootFreq = ROOTS[rootIndex];
    currentRoot = rootFreq;
    var when = whenFor(step, t);

    if (bar === 0 && stepInBar === 0 && cycle > 0) impact(when);
    if (stepInBar % 4 === 0) kick(when, 0.9);
    if (bar >= 1 && stepInBar % 2 === 0) hat(when, 0.15, 0.03);
    if (bar >= 4 && (stepInBar === 7 || stepInBar === 15)) hat(when, 0.1, 0.08);
    if (stepInBar === 0 || stepInBar === 8) bass(when, rootFreq, 0.15);
    if (stepInBar === 4 || stepInBar === 12) bass(when, rootFreq * 1.4983, 0.12);

    if (bar >= 2) {
      var degree = SCALE[stepInBar % SCALE.length];
      var octave = stepInBar % 8 < 4 ? 1 : 2;
      pluck(when, rootFreq * Math.pow(2, octave) * Math.pow(2, degree / 12), 0.075, 0.1, 'triangle');
    }
    if (bar >= 3 && stepInBar === 0 && bar % 2 === 1) pad(when, rootFreq);
    if (bar >= 6 && (stepInBar === 0 || stepInBar === 3 || stepInBar === 6 ||
      stepInBar === 8 || stepInBar === 11 || stepInBar === 14)) {
      pluck(when, rootFreq * 4 * Math.pow(2, SCALE[(stepInBar + 2) % SCALE.length] / 12), 0.05, 0.18, 'sine');
    }
    if (bar === 11 && stepInBar === 0) riser(when, BAR, rootFreq);
    if (bar === 11 && (stepInBar === 4 || stepInBar === 12)) snare(when);
  }

  function tick(t) {
    if (!ctx || !started || ctx.state !== 'running') return;
    var step = Math.floor(t / STEP);
    if (!enabled) {
      if (scheduledStep < step) scheduledStep = step;
      return;
    }
    if (scheduledStep < 0) scheduledStep = step;
    if (step - scheduledStep > 4) scheduledStep = step;
    while (scheduledStep <= step + 2) {
      scheduleStep(scheduledStep, t);
      scheduledStep += 1;
    }
  }

  var lastCapture = -10;

  function capture(t, rootFreq) {
    if (!ctx || !started || ctx.state !== 'running' || !enabled) return;
    if (t - lastCapture < 0.06) return;
    lastCapture = t;
    var next = Math.ceil(t / STEP) * STEP;
    var when = ctx.currentTime + Math.max(0.005, next - t);
    var freq = rootFreq || currentRoot;
    oscillator('sine', freq * 2, when, when + 0.16, 0.075, master, true);
    oscillator('triangle', freq * 3, when + 0.018, when + 0.22, 0.038, master, true);
  }

  function impactNow() {
    if (!ctx || !started || ctx.state !== 'running' || !enabled) return;
    impact(ctx.currentTime + 0.01);
  }

  function tap() {
    if (!ctx || !started || ctx.state !== 'running' || !enabled) return;
    var when = ctx.currentTime + 0.01;
    oscillator('sine', currentRoot * 2, when, when + 0.2, 0.12, master, true);
    oscillator('sine', currentRoot * 3, when + 0.03, when + 0.28, 0.07, master, true);
  }

  function stop() {
    started = false;
    scheduledStep = -1;
    if (ctx && ctx.suspend) {
      try { ctx.suspend(); } catch (e) { /* 停止できない環境では無視 */ }
    }
  }

  root.ExpAudio = {
    start: start,
    stop: stop,
    ready: ready,
    tick: tick,
    capture: capture,
    impact: impactNow,
    tap: tap,
    toggleMute: toggleMute,
    setMuted: setMuted,
    isEnabled: isEnabled
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
