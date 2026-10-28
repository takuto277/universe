/* audio.js : Web Audio で鳴らすチップチューンBGMと効果音（外部音源なし）
 *
 * AudioContext が使えない環境では create() が null を返す。
 * BGM は先読みスケジューラで 16分音符を積んでいる。
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GraphCrossAudio = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var BPM = 116;
  var STEP = 60 / BPM / 4;
  var LOOKAHEAD = 0.15;

  /* Aマイナー・ペンタトニックを中心にした32ステップ。0 は休符 */
  var LEAD = [
    69, 0, 72, 76, 0, 79, 76, 72,
    69, 0, 67, 72, 0, 74, 72, 67,
    69, 0, 72, 76, 0, 81, 79, 76,
    74, 0, 72, 67, 0, 69, 67, 64
  ];
  var BASS = [45, 45, 41, 41, 48, 48, 43, 43];

  var ctx = null;
  var master = null;
  var bgmGain = null;
  var sfxGain = null;
  var muted = false;
  var intensity = 0;
  var timer = null;
  var stepIndex = 0;
  var nextStep = 0;

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
    osc.frequency.setValueAtTime(130, when);
    if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') {
      osc.frequency.exponentialRampToValueAtTime(46, when + 0.12);
    }
    gain.gain.setValueAtTime(0.22, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(gain);
    gain.connect(bgmGain);
    osc.start(when);
    osc.stop(when + 0.2);
  }

  function scheduleStep(index, when) {
    var lead = LEAD[index % LEAD.length];
    var leadVol = 0.065 + intensity * 0.012;
    if (lead) tone(midiToFreq(lead), when, STEP * 1.55, 'square', leadVol, bgmGain);
    if (lead && intensity >= 1) {
      tone(midiToFreq(lead + 12), when, STEP * 1.2, 'sine', 0.035, bgmGain);
    }
    if (intensity >= 2 && index % 4 === 2) {
      var high = [84, 86, 88][Math.floor(index / 4) % 3];
      tone(midiToFreq(high), when, STEP * 0.8, 'triangle', 0.03, bgmGain);
    }
    if (intensity >= 3 && index % 8 === 4) {
      tone(midiToFreq(57), when, STEP * 0.5, 'square', 0.035, bgmGain);
    }
    if (index % 4 === 0) {
      var bass = BASS[Math.floor(index / 4) % BASS.length];
      tone(midiToFreq(bass), when, STEP * 3.4, 'triangle', 0.12, bgmGain);
    }
    if (index % 8 === 0 || index % 8 === 5) kick(when);
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
    if (name === 'hit') {
      var combo = Math.max(1, Math.min(12, a || 1));
      var base = 500 + combo * 34;
      tone(base, now, 0.075, 'square', 0.14, sfxGain);
      tone(base * 1.5, now + 0.045, 0.12, 'triangle', 0.12, sfxGain);
      if (b) tone(base * 2, now + 0.09, 0.16, 'sine', 0.10, sfxGain);
    } else if (name === 'boss') {
      tone(110, now, 0.22, 'sawtooth', 0.13, sfxGain);
      tone(146, now + 0.14, 0.24, 'sawtooth', 0.12, sfxGain);
      tone(98, now + 0.3, 0.4, 'sawtooth', 0.11, sfxGain);
    } else if (name === 'clear') {
      tone(523, now, 0.12, 'square', 0.10, sfxGain);
      tone(659, now + 0.1, 0.13, 'square', 0.10, sfxGain);
      tone(784, now + 0.2, 0.16, 'triangle', 0.11, sfxGain);
      tone(1046, now + 0.34, 0.4, 'sine', 0.10, sfxGain);
    } else if (name === 'item') {
      tone(880, now, 0.08, 'triangle', 0.10, sfxGain);
      tone(1174, now + 0.06, 0.12, 'sine', 0.09, sfxGain);
    } else if (name === 'ally') {
      tone(523, now, 0.08, 'triangle', 0.08, sfxGain);
      tone(659, now + 0.05, 0.10, 'triangle', 0.08, sfxGain);
      tone(784, now + 0.10, 0.16, 'sine', 0.08, sfxGain);
    } else if (name === 'multi') {
      var n = Math.max(2, Math.min(5, a || 2));
      tone(700 + n * 80, now, 0.07, 'square', 0.09, sfxGain);
      tone(900 + n * 90, now + 0.05, 0.12, 'sine', 0.09, sfxGain);
    } else if (name === 'weak') {
      tone(1046, now, 0.09, 'sine', 0.11, sfxGain);
      tone(1318, now + 0.055, 0.12, 'sine', 0.10, sfxGain);
      tone(1568, now + 0.11, 0.18, 'triangle', 0.09, sfxGain);
    } else if (name === 'beam') {
      tone(1320, now, 0.05, 'sawtooth', 0.09, sfxGain);
      tone(1760, now + 0.025, 0.12, 'sine', 0.09, sfxGain);
      tone(2640, now + 0.055, 0.16, 'triangle', 0.07, sfxGain);
    } else if (name === 'armor') {
      tone(300, now, 0.06, 'square', 0.09, sfxGain);
      tone(440, now + 0.04, 0.09, 'triangle', 0.08, sfxGain);
    } else if (name === 'split') {
      tone(620, now, 0.06, 'triangle', 0.09, sfxGain);
      tone(420, now + 0.07, 0.10, 'triangle', 0.09, sfxGain);
      tone(880, now + 0.14, 0.12, 'sine', 0.07, sfxGain);
    } else if (name === 'jam') {
      tone(220, now, 0.08, 'sawtooth', 0.10, sfxGain);
      tone(160, now + 0.06, 0.16, 'square', 0.09, sfxGain);
    } else if (name === 'warn') {
      tone(1046, now, 0.06, 'square', 0.08, sfxGain);
      tone(784, now + 0.09, 0.10, 'square', 0.08, sfxGain);
    } else if (name === 'laser') {
      tone(1600, now, 0.05, 'sawtooth', 0.12, sfxGain);
      tone(820, now + 0.04, 0.18, 'sawtooth', 0.11, sfxGain);
      tone(420, now + 0.12, 0.24, 'triangle', 0.10, sfxGain);
    } else if (name === 'shot') {
      tone(740, now, 0.05, 'square', 0.09, sfxGain);
      tone(980, now + 0.04, 0.10, 'triangle', 0.08, sfxGain);
    } else if (name === 'phase') {
      tone(196, now, 0.2, 'sawtooth', 0.12, sfxGain);
      tone(294, now + 0.12, 0.28, 'sawtooth', 0.11, sfxGain);
      tone(392, now + 0.24, 0.45, 'triangle', 0.10, sfxGain);
    } else if (name === 'revive') {
      tone(392, now, 0.12, 'triangle', 0.11, sfxGain);
      tone(523, now + 0.08, 0.14, 'triangle', 0.11, sfxGain);
      tone(659, now + 0.16, 0.2, 'sine', 0.10, sfxGain);
      tone(1046, now + 0.28, 0.34, 'sine', 0.09, sfxGain);
    } else if (name === 'guard') {
      tone(740, now, 0.07, 'square', 0.09, sfxGain);
      tone(988, now + 0.04, 0.12, 'triangle', 0.09, sfxGain);
      tone(1480, now + 0.09, 0.16, 'sine', 0.08, sfxGain);
    } else if (name === 'heal') {
      tone(660, now, 0.10, 'triangle', 0.12, sfxGain);
      tone(880, now + 0.06, 0.14, 'triangle', 0.12, sfxGain);
      tone(1100, now + 0.12, 0.18, 'sine', 0.10, sfxGain);
    } else if (name === 'miss') {
      tone(220, now, 0.14, 'sawtooth', 0.13, sfxGain);
      tone(150, now + 0.09, 0.24, 'sawtooth', 0.11, sfxGain);
    } else if (name === 'start') {
      tone(523, now, 0.09, 'square', 0.10, sfxGain);
      tone(659, now + 0.07, 0.10, 'square', 0.10, sfxGain);
      tone(784, now + 0.14, 0.16, 'triangle', 0.11, sfxGain);
    } else if (name === 'over') {
      tone(392, now, 0.18, 'triangle', 0.12, sfxGain);
      tone(330, now + 0.12, 0.20, 'triangle', 0.11, sfxGain);
      tone(262, now + 0.24, 0.34, 'sine', 0.10, sfxGain);
    } else if (name === 'ui') {
      tone(880, now, 0.05, 'square', 0.06, sfxGain);
    }
  }

  function create() {
    if (ctx) return api;
    var Ctor = root && (root.AudioContext || root.webkitAudioContext);
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch (e) {
      ctx = null;
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.16;
    bgmGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.55;
    sfxGain.connect(master);
    return api;
  }

  var api = {
    create: create,
    unlock: unlock,
    startBgm: startBgm,
    stopBgm: stopBgm,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    setIntensity: setIntensity,
    getIntensity: function () { return intensity; },
    play: play
  };

  return api;
});
