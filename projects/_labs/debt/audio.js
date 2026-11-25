/* audio.js : DEBT の効果音（WebAudio・外部音源なし） */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      try {
        master = ctx.createGain();
        master.gain.value = 0.18;
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
    g.gain.exponentialRampToValueAtTime(vol == null ? 0.12 : vol, t0 + 0.012);
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
    filter.frequency.value = filterFreq || 1600;
    var g = c.createGain();
    g.gain.value = vol == null ? 0.12 : vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master || c.destination);
    src.start(t0);
  }

  root.DebtAudio = {
    start: function () {
      ensure();
      tone(392, 0.1, 'triangle', 0.07, 523);
      tone(523, 0.14, 'triangle', 0.06, 659, 0.1);
    },
    buy: function () {
      tone(880, 0.06, 'square', 0.05);
      tone(1320, 0.09, 'triangle', 0.05, 1568, 0.06);
    },
    repay: function () {
      tone(660, 0.06, 'triangle', 0.06, 520);
      tone(440, 0.12, 'sine', 0.05, 330, 0.05);
    },
    dayEnd: function (interest) {
      tone(240, 0.18, 'sine', 0.08, 180);
      if (interest > 0) noise(0.14, 0.06, 900, 0.02);
    },
    clear: function () {
      tone(523, 0.12, 'triangle', 0.09, 659);
      tone(659, 0.12, 'triangle', 0.09, 784, 0.1);
      tone(784, 0.12, 'triangle', 0.09, 1046, 0.2);
      tone(1318, 0.42, 'sine', 0.07, 1568, 0.32);
    },
    fail: function () {
      noise(0.4, 0.14, 650);
      tone(200, 0.5, 'sawtooth', 0.1, 55);
    },
    click: function () { tone(600, 0.04, 'square', 0.03, 760); },
    toggleMute: function () {
      enabled = !enabled;
      if (master) master.gain.value = enabled ? 0.18 : 0;
      if (enabled) ensure();
      return enabled;
    },
    isEnabled: function () { return enabled; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
