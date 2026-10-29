/* audio.js : ねむりのまもりのBGMと効果音（Web Audio・外部音源なし） */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SleepGuardAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var BPM = 72;
  var STEP = 60 / BPM / 4;
  var LOOKAHEAD = 0.2;
  var LEAD = [
    69, 0, 72, 76, 0, 79, 76, 72,
    69, 0, 67, 72, 0, 74, 72, 67,
    69, 0, 72, 76, 0, 81, 79, 76,
    74, 0, 72, 67, 0, 69, 67, 64
  ];
  var BASS = [45, 41, 48, 43];

  var ctx = null;
  var master = null;
  var bgmGain = null;
  var sfxGain = null;
  var muted = false;
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
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(dest || sfxGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function scheduleStep(index, when) {
    var lead = LEAD[index % LEAD.length];
    if (lead) {
      tone(midiToFreq(lead), when, STEP * 2.2, 'triangle', 0.035, bgmGain);
      if (index % 8 === 0) tone(midiToFreq(lead + 12), when + STEP * 0.5, STEP * 1.2, 'sine', 0.012, bgmGain);
    }
    if (index % 8 === 0) {
      var bass = BASS[Math.floor(index / 8) % BASS.length];
      tone(midiToFreq(bass), when, STEP * 6, 'sine', 0.05, bgmGain);
    }
  }

  function scheduler() {
    if (!ctx) return;
    if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.02;
    var horizon = ctx.currentTime + LOOKAHEAD;
    while (nextStep < horizon) {
      scheduleStep(stepIndex, nextStep);
      nextStep += STEP;
      stepIndex = (stepIndex + 1) % LEAD.length;
    }
  }

  function startBgm() {
    if (!ctx || timer) return;
    unlock();
    nextStep = ctx.currentTime + 0.08;
    stepIndex = 0;
    scheduler();
    if (typeof setInterval === 'function') timer = setInterval(scheduler, 40);
  }

  function stopBgm() {
    if (timer && typeof clearInterval === 'function') clearInterval(timer);
    timer = null;
  }

  function setMuted(value) {
    muted = !!value;
    if (master && ctx) {
      if (typeof master.gain.setTargetAtTime === 'function') {
        master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.03);
      } else {
        master.gain.value = muted ? 0 : 0.8;
      }
    }
  }

  function play(name) {
    if (!ctx || muted) return;
    unlock();
    var now = ctx.currentTime + 0.01;
    if (name === 'tap') {
      tone(880, now, 0.08, 'sine', 0.05, sfxGain);
      tone(1320, now + 0.05, 0.12, 'triangle', 0.03, sfxGain);
    } else if (name === 'noise') {
      tone(160, now, 0.12, 'triangle', 0.05, sfxGain);
      tone(120, now + 0.08, 0.16, 'sine', 0.04, sfxGain);
    } else if (name === 'clear') {
      [523, 659, 784, 1046].forEach(function (freq, i) {
        tone(freq, now + i * 0.12, 0.5, 'sine', 0.06, sfxGain);
      });
    } else if (name === 'over') {
      tone(220, now, 0.25, 'triangle', 0.06, sfxGain);
      tone(165, now + 0.2, 0.4, 'sine', 0.05, sfxGain);
    }
  }

  function create() {
    if (ctx) return api;
    var AudioCtor = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = 0.8;
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
    setMuted: setMuted,
    play: play,
    isMuted: function () { return muted; }
  };
  return api;
});
