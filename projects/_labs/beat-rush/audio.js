/* audio.js : BEAT RUSH の簡易WebAudioビート */
(function (root) {
  'use strict';
  function create() {
    var ctx = null;
    var master = null;
    var timer = null;
    var nextBeat = 0;
    var startAt = 0;
    var running = false;
    var beat = 60 / 128;

    function ensure() {
      if (ctx) return true;
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
        return true;
      } catch (e) {
        ctx = null;
        return false;
      }
    }

    function tone(time, freq, dur, type, gain) {
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(gain || 0.08, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }

    function kick(time, accent) {
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(accent ? 150 : 105, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
      g.gain.setValueAtTime(accent ? 0.25 : 0.16, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
      osc.connect(g);
      g.connect(master);
      osc.start(time);
      osc.stop(time + 0.16);
    }

    function hat(time) {
      tone(time, 7600, 0.035, 'square', 0.018);
      tone(time + 0.012, 10400, 0.025, 'square', 0.01);
    }

    function schedule() {
      if (!running || !ctx) return;
      while (nextBeat < ctx.currentTime + 0.28) {
        var step = Math.round((nextBeat - startAt) / beat);
        kick(nextBeat, step % 4 === 0);
        if (step % 2 === 1) hat(nextBeat + beat / 2);
        nextBeat += beat;
      }
    }

    function start() {
      if (!ensure()) return;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      running = true;
      startAt = ctx.currentTime + 0.05;
      nextBeat = startAt;
      if (timer) clearInterval(timer);
      timer = setInterval(schedule, 30);
      schedule();
    }

    function stop() {
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
    }

    function hit(judgment) {
      if (!ctx) return;
      var freq = judgment === 'PERFECT' ? 1320 : (judgment === 'GOOD' ? 990 : 660);
      tone(ctx.currentTime, freq, 0.08, 'triangle', 0.09);
    }

    function miss() {
      if (!ctx) return;
      tone(ctx.currentTime, 130, 0.12, 'sawtooth', 0.045);
    }

    function finish() {
      if (!ctx) return;
      stop();
      var t = ctx.currentTime;
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(t + i * 0.11, f, 0.22, 'triangle', 0.08);
      });
    }

    return { start: start, stop: stop, hit: hit, miss: miss, finish: finish };
  }

  root.BeatRushAudio = { create: create };
})(typeof window !== 'undefined' ? window : this);
