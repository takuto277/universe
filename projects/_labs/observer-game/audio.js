/* audio.js : 小さなWebAudio効果音。AudioContextが無い環境では何もしない */
(function (root) {
  'use strict';

  var ctx = null;
  var enabled = true;
  var master = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, start, dur, type, volume) {
    var c = ensure();
    if (!c || !enabled || !master) return;
    if (c.state === 'suspended' && c.resume) {
      try { c.resume(); } catch (e) { /* ユーザー操作まで待つ */ }
    }
    var osc = c.createOscillator();
    var gain = c.createGain();
    var t0 = c.currentTime + start;
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume == null ? 0.5 : volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function play(name) {
    if (!enabled) return;
    switch (name) {
      case 'click':
        tone(520, 0, 0.06, 'triangle', 0.22);
        break;
      case 'open':
        tone(360, 0, 0.08, 'sine', 0.24);
        tone(540, 0.04, 0.08, 'sine', 0.18);
        break;
      case 'point':
        tone(500, 0, 0.09, 'sine', 0.3);
        tone(760, 0.07, 0.14, 'sine', 0.24);
        break;
      case 'note':
        tone(660, 0, 0.05, 'square', 0.1);
        break;
      case 'success':
        tone(523.25, 0, 0.12, 'triangle', 0.32);
        tone(659.25, 0.09, 0.14, 'triangle', 0.3);
        tone(783.99, 0.19, 0.24, 'triangle', 0.28);
        break;
      case 'fail':
        tone(196, 0, 0.2, 'sawtooth', 0.16);
        tone(146.83, 0.08, 0.24, 'sawtooth', 0.14);
        break;
      case 'seal':
        tone(783.99, 0, 0.1, 'sine', 0.3);
        tone(987.77, 0.08, 0.12, 'sine', 0.28);
        tone(1174.66, 0.17, 0.28, 'sine', 0.22);
        break;
      case 'sign':
        tone(392, 0, 0.3, 'sine', 0.26);
        tone(523.25, 0.06, 0.34, 'sine', 0.24);
        tone(659.25, 0.12, 0.42, 'sine', 0.22);
        tone(783.99, 0.2, 0.5, 'sine', 0.18);
        break;
      default:
        tone(440, 0, 0.05, 'sine', 0.16);
    }
  }

  function toggle() {
    enabled = !enabled;
    if (enabled) { ensure(); play('click'); }
    return enabled;
  }

  root.ObserverAudio = {
    play: play,
    toggle: toggle,
    ensure: ensure,
    isEnabled: function () { return enabled; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
