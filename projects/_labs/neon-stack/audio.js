/* audio.js : Web Audio で鳴らすネオンBGMと効果音（外部音源なし）
 *
 * AudioContext が使えない環境では create() が null を返す。
 * BGM は16分音符を先読みスケジューラで積み、高さに応じて音数とテンポを上げる。
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NeonStackAudio = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var BPM = 132;
  var STEP = 60 / BPM / 4;
  var LOOKAHEAD = 0.15;

  /* Aマイナー・ペンタトニック。32ステップで1ループ */
  var LEAD = [
    69, 0, 72, 76, 0, 79, 76, 72,
    69, 0, 67, 72, 0, 74, 72, 67,
    69, 0, 72, 76, 0, 81, 79, 76,
    74, 0, 72, 67, 0, 69, 67, 64
  ];
  /* Am - F - C - G */
  var BASS = [45, 41, 48, 43];

  var ctx = null;
  var master = null;
  var bgmGain = null;
  var sfxGain = null;
  var muted = false;
  var intensity = 0;
  var timer = null;
  var stepIndex = 0;
  var nextStep = 0;
  var api;

  function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function unlock() {
    if (!ctx) return false;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch (e) { }
    }
    return ctx.state !== 'suspended';
  }

  function tone(freq, when, dur, type, volume, dest) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(dest || sfxGain);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  function kick(when) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, when);
    if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') {
      osc.frequency.exponentialRampToValueAtTime(44, when + 0.13);
    }
    gain.gain.setValueAtTime(0.24, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    osc.connect(gain);
    gain.connect(bgmGain);
    osc.start(when);
    osc.stop(when + 0.22);
  }

  function hat(when) {
    if (!ctx) return;
    tone(7800, when, 0.035, 'square', 0.018, bgmGain);
  }

  function scheduleStep(index, when) {
    var lead = LEAD[index % LEAD.length];
    var leadVol = 0.055 + intensity * 0.012;
    if (lead) {
      tone(midiToFreq(lead), when, STEP * 1.4, 'square', leadVol, bgmGain);
      if (intensity >= 2) {
        tone(midiToFreq(lead + 12), when + STEP * 0.5, STEP * 0.8, 'triangle', 0.025, bgmGain);
      }
    }
    if (index % 4 === 0) {
      var bass = BASS[Math.floor(index / 8) % BASS.length];
      tone(midiToFreq(bass), when, STEP * 3.2, 'triangle', 0.13, bgmGain);
    }
    if (index % 4 === 0 || (intensity >= 1 && index % 4 === 2)) kick(when);
    if (intensity >= 1 && index % 2 === 1) hat(when);
    if (intensity >= 2 && index % 8 === 6) {
      tone(midiToFreq(84), when, STEP * 0.7, 'triangle', 0.026, bgmGain);
    }
  }

  function scheduler() {
    if (!ctx) return;
    if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.02;
    var horizon = ctx.currentTime + LOOKAHEAD;
    var stepDur = STEP * (1 - intensity * 0.035);
    while (nextStep < horizon) {
      scheduleStep(stepIndex, nextStep);
      nextStep += stepDur;
      stepIndex = (stepIndex + 1) % LEAD.length;
    }
  }

  function startBgm() {
    if (!ctx || timer) return;
    unlock();
    nextStep = ctx.currentTime + 0.08;
    stepIndex = 0;
    scheduler();
    if (typeof setInterval === 'function') timer = setInterval(scheduler, 30);
  }

  function stopBgm() {
    if (timer && typeof clearInterval === 'function') clearInterval(timer);
    timer = null;
  }

  function setIntensity(value) {
    intensity = Math.max(0, Math.min(3, Number(value) || 0));
  }

  function setMuted(value) {
    muted = !!value;
    if (master && ctx) {
      if (typeof master.gain.setTargetAtTime === 'function') {
        master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.02);
      } else {
        master.gain.value = muted ? 0 : 0.85;
      }
    }
  }

  function play(name, a, b) {
    if (!ctx || muted) return;
    unlock();
    var now = ctx.currentTime + 0.01;
    if (name === 'place') {
      var step = Math.max(0, Math.min(24, a || 0));
      var base = 170 + step * 8;
      tone(base, now, 0.08, 'triangle', 0.11, sfxGain);
      tone(base * 2.02, now + 0.025, 0.06, 'square', 0.045, sfxGain);
      if (b) tone(base * 3, now + 0.05, 0.1, 'sine', 0.04, sfxGain);
    } else if (name === 'perfect') {
      var notes = [880, 1108.73, 1318.51, 1760];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], now + i * 0.045, 0.18, i === 3 ? 'sine' : 'triangle', 0.08, sfxGain);
      }
      tone(2637, now + 0.18, 0.3, 'sine', 0.05, sfxGain);
    } else if (name === 'miss') {
      tone(180, now, 0.18, 'sawtooth', 0.10, sfxGain);
      tone(120, now + 0.12, 0.3, 'sawtooth', 0.09, sfxGain);
    }
  }

  function create() {
    if (ctx) return api;
    var AudioCtor = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.5;
      bgmGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.9;
      sfxGain.connect(master);
    } catch (e) {
      ctx = null;
      return null;
    }
    return api;
  }

  api = {
    create: create,
    unlock: unlock,
    startBgm: startBgm,
    stopBgm: stopBgm,
    setIntensity: setIntensity,
    setMuted: setMuted,
    play: play,
    isMuted: function () { return muted; }
  };
  return api;
});
