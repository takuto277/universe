/* audio.js : MAPLESS の環境音と効果音（WebAudio・外部音源なし） */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  var ambient = null;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      try {
        master = ctx.createGain();
        master.gain.value = 0.22;
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

  function noise(dur, vol, filterType, filterFreq, delay) {
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
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    var g = c.createGain();
    g.gain.value = vol == null ? 0.08 : vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master || c.destination);
    src.start(t0);
  }

  function startAmbient() {
    var c = ensure();
    if (!c || ambient) return;
    try {
      var g = c.createGain();
      g.gain.value = 0.0001;
      var filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      var o1 = c.createOscillator();
      var o2 = c.createOscillator();
      o1.type = 'sine';
      o2.type = 'sine';
      o1.frequency.value = 55;
      o2.frequency.value = 82.5;
      var lfo = c.createOscillator();
      var lfoGain = c.createGain();
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      o1.connect(filter);
      o2.connect(filter);
      filter.connect(g);
      g.connect(master || c.destination);
      o1.start();
      o2.start();
      lfo.start();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.03, c.currentTime + 2.4);
      ambient = { gain: g, nodes: [o1, o2, lfo] };
    } catch (e) { ambient = null; }
  }

  root.MaplessAudio = {
    start: function () {
      ensure();
      startAmbient();
      tone(392, 0.14, 'sine', 0.06, 523);
      tone(523, 0.2, 'sine', 0.04, 659, 0.12);
    },
    step: function () {
      tone(170 + Math.random() * 20, 0.045, 'sine', 0.035, 120);
    },
    bump: function () {
      tone(92, 0.09, 'sine', 0.05, 64);
    },
    draw: function () {
      noise(0.045, 0.028, 'highpass', 1500);
    },
    bottle: function () {
      tone(880, 0.08, 'triangle', 0.06, 1175);
      tone(1320, 0.16, 'sine', 0.04, 1760, 0.06);
    },
    floorClear: function () {
      tone(392, 0.12, 'triangle', 0.06, 494);
      tone(494, 0.12, 'triangle', 0.06, 587, 0.1);
      tone(659, 0.24, 'sine', 0.05, 784, 0.2);
    },
    gameClear: function () {
      tone(392, 0.12, 'triangle', 0.06, 494);
      tone(494, 0.12, 'triangle', 0.06, 587, 0.1);
      tone(587, 0.12, 'triangle', 0.06, 784, 0.2);
      tone(784, 0.4, 'sine', 0.05, 988, 0.3);
      tone(1175, 0.5, 'sine', 0.03, 1568, 0.44);
    },
    inkEmpty: function () {
      noise(0.12, 0.03, 'lowpass', 700);
    },
    click: function () {
      tone(600, 0.04, 'sine', 0.03, 720);
    },
    toggleMute: function () {
      enabled = !enabled;
      if (master) master.gain.value = enabled ? 0.22 : 0;
      if (enabled) ensure();
      return enabled;
    },
    isEnabled: function () { return enabled; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
