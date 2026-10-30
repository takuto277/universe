/* audio.js : BEAT RUSH のWebAudioループ */
(function (root) {
  'use strict';
  function create() {
    var ctx = null;
    var master = null;
    var timer = null;
    var nextTime = 0;
    var stepIndex = 0;
    var running = false;
    var muted = false;
    var beat = 60 / 128;
    var stepDur = beat / 2;

    var BASS = [45, 45, 48, 45, 45, 45, 48, 50, 43, 43, 46, 43, 43, 43, 46, 48];
    var ARP = [69, 72, 76, 72, 69, 72, 76, 79, 67, 70, 74, 70, 67, 70, 74, 76];

    function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

    function ensure() {
      if (ctx) return true;
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.55;
        master.connect(ctx.destination);
        return true;
      } catch (e) {
        ctx = null;
        return false;
      }
    }

    function tone(time, freq, dur, type, gain, dest) {
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(gain || 0.07, time + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g);
      g.connect(dest || master);
      osc.start(time);
      osc.stop(time + dur + 0.03);
    }

    function kick(time, accent) {
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(accent ? 155 : 115, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.10);
      g.gain.setValueAtTime(accent ? 0.28 : 0.18, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
      osc.connect(g);
      g.connect(master);
      osc.start(time);
      osc.stop(time + 0.16);
    }

    function snare(time) {
      tone(time, 190, 0.06, 'triangle', 0.055);
      tone(time + 0.005, 7900, 0.055, 'square', 0.018);
      tone(time + 0.018, 6200, 0.04, 'square', 0.012);
    }

    function hat(time, open) {
      tone(time, open ? 6800 : 8800, open ? 0.08 : 0.028, 'square', open ? 0.021 : 0.012);
    }

    function bass(time, note) {
      tone(time, midi(note - 12), stepDur * 1.55, 'sawtooth', 0.045);
      tone(time, midi(note - 24), stepDur * 1.65, 'sine', 0.075);
    }

    function arp(time, note) {
      tone(time, midi(note), stepDur * 0.8, 'triangle', 0.025);
    }

    function scheduleStep(time, step) {
      var s = step % 16;
      var barStep = step % 32;
      if (s === 0) kick(time, true);
      if (s === 8) kick(time, false);
      if (s === 4 || s === 12) snare(time);
      hat(time, s === 14);
      if (s % 2 === 0) bass(time, BASS[s / 2]);
      if (s % 4 === 2) arp(time, ARP[s / 2]);
      if (barStep === 15) tone(time, midi(84), 0.10, 'sine', 0.018);
    }

    function schedule() {
      if (!running || !ctx) return;
      while (nextTime < ctx.currentTime + 0.30) {
        scheduleStep(nextTime, stepIndex);
        nextTime += stepDur;
        stepIndex++;
      }
    }

    function start() {
      if (!ensure()) return;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      running = true;
      nextTime = ctx.currentTime + 0.05;
      stepIndex = 0;
      if (timer) clearInterval(timer);
      timer = setInterval(schedule, 30);
      schedule();
    }

    function stop() {
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
    }

    function setMuted(value) {
      muted = !!value;
      if (master) master.gain.value = muted ? 0 : 0.55;
    }

    function isMuted() { return muted; }

    function hit(judgment) {
      if (!ctx) return;
      var freq = judgment === 'PERFECT' ? 1320 : (judgment === 'GOOD' ? 990 : 660);
      tone(ctx.currentTime, freq, 0.08, 'triangle', 0.085);
      if (judgment === 'PERFECT') tone(ctx.currentTime + 0.025, freq * 1.5, 0.07, 'sine', 0.035);
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
        tone(t + i * 0.11, f, 0.24, 'triangle', 0.075);
      });
    }

    return {
      start: start,
      stop: stop,
      hit: hit,
      miss: miss,
      finish: finish,
      setMuted: setMuted,
      isMuted: isMuted
    };
  }

  root.BeatRushAudio = { create: create };
})(typeof window !== 'undefined' ? window : this);
