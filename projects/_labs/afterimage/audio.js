/* audio.js : AFTERIMAGE の効果音（WebAudio・外部音源なし） */
(function (root) {
  'use strict';

  var ctx = null;
  var enabled = true;
  var master = null;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      try {
        master = ctx.createGain();
        master.gain.value = 0.2;
        master.connect(ctx.destination);
      } catch (e2) { master = null; }
    }
    if (ctx && ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume(); } catch (e3) { }
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol == null ? 0.1 : vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master || c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, delay) {
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    src.buffer = buf;
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1800;
    var g = c.createGain();
    g.gain.value = vol == null ? 0.1 : vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master || c.destination);
    src.start(t0);
  }

  root.AfterimageAudio = {
    start: function () { ensure(); tone(520, 0.08, 'triangle', 0.07, 720); },
    toggleMute: function () {
      enabled = !enabled;
      if (master) master.gain.value = enabled ? 0.2 : 0;
      if (enabled) ensure();
      return enabled;
    },
    isEnabled: function () { return enabled; },
    jump: function (fromTrail) {
      tone(fromTrail ? 740 : 560, 0.1, 'triangle', 0.07, fromTrail ? 1060 : 820);
    },
    land: function () { tone(220, 0.07, 'sine', 0.05, 150); },
    solidify: function () { tone(880, 0.09, 'sine', 0.05, 1240); },
    shatter: function () { noise(0.09, 0.05, 2600); },
    checkpoint: function () {
      tone(659, 0.1, 'triangle', 0.08, 784);
      tone(880, 0.16, 'sine', 0.06, 1174, 0.08);
    },
    fall: function () {
      noise(0.3, 0.14, 800);
      tone(220, 0.38, 'sawtooth', 0.1, 55);
    },
    finish: function (reason) {
      if (reason === 'victory') {
        tone(523, 0.12, 'triangle', 0.08, 659);
        tone(659, 0.12, 'triangle', 0.08, 784, 0.1);
        tone(784, 0.12, 'triangle', 0.08, 1046, 0.2);
        tone(1318, 0.4, 'sine', 0.06, 1568, 0.32);
      } else {
        tone(220, 0.5, 'sine', 0.09, 70);
        noise(0.4, 0.07, 700);
      }
    },
    click: function () { tone(600, 0.045, 'square', 0.035, 760); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
