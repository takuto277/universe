/* audio.js : STILL の効果音（WebAudio・外部音源なし） */
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

  function api() {
    return {
      start: function () { ensure(); tone(440, 0.08, 'triangle', 0.08, 660); },
      toggleMute: function () {
        enabled = !enabled;
        if (master) master.gain.value = enabled ? 0.22 : 0;
        if (enabled) ensure();
        return enabled;
      },
      isEnabled: function () { return enabled; },
      shoot: function () { tone(980, 0.055, 'square', 0.045, 380); },
      enemyShoot: function () { tone(210, 0.12, 'sawtooth', 0.04, 120); },
      kill: function () { noise(0.16, 0.11, 2400); tone(180, 0.12, 'triangle', 0.08, 60); },
      exitOpen: function () { tone(520, 0.1, 'sine', 0.07, 780); tone(780, 0.16, 'sine', 0.05, 1040, 0.08); },
      roomClear: function () {
        tone(523, 0.1, 'triangle', 0.08, 659);
        tone(659, 0.1, 'triangle', 0.08, 784, 0.08);
        tone(1046, 0.18, 'sine', 0.06, 1318, 0.16);
      },
      playerHit: function () {
        noise(0.35, 0.18, 900);
        tone(160, 0.4, 'sawtooth', 0.12, 40);
      },
      finish: function (reason) {
        if (reason === 'victory') {
          tone(523, 0.12, 'triangle', 0.09, 659);
          tone(659, 0.12, 'triangle', 0.09, 784, 0.1);
          tone(784, 0.12, 'triangle', 0.09, 1046, 0.2);
          tone(1318, 0.4, 'sine', 0.07, 1568, 0.32);
        } else if (reason === 'time') {
          tone(220, 0.6, 'sine', 0.1, 70);
          noise(0.5, 0.08, 700);
        } else {
          tone(140, 0.5, 'sawtooth', 0.1, 45);
        }
      },
      click: function () { tone(600, 0.045, 'square', 0.035, 760); }
    };
  }

  root.StillAudio = api();
})(typeof globalThis !== 'undefined' ? globalThis : this);
