/* game.js : BEAT RUSH（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.BeatRushEngine) ? window.BeatRushEngine : null;
  var AU = (typeof window !== 'undefined' && window.BeatRushAudio) ? window.BeatRushAudio : null;
  if (!E) return;

  var canvas = null;
  var ctx = null;
  var state = null;
  var audio = AU ? AU.create() : null;
  var viewW = 480;
  var viewH = 800;
  var dpr = 1;
  var lastTs = 0;
  var endShown = false;
  var shake = 0;
  var judgment = null;
  var laneFlash = [0, 0, 0, 0];
  var particles = [];
  var els = {};
  var COLORS = ['#5df4ff', '#ff68d4', '#ffd166', '#6dffb0'];
  var KEYS = ['d', 'f', 'j', 'k'];

  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function roundRect(x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function laneW() { return viewW / 4; }
  function hitY() { return viewH * 0.78; }

  function showScreen(el, visible) {
    if (el) el.classList.toggle('visible', !!visible);
  }

  function updateHud() {
    if (!state) return;
    if (els.time) els.time.textContent = state.remaining.toFixed(1);
    if (els.score) els.score.textContent = String(state.score);
    if (els.combo) els.combo.textContent = String(state.combo);
    if (els.accuracy) els.accuracy.textContent = E.accuracy(state).toFixed(1) + '%';
  }

  function showStart() {
    showScreen(els.start, true);
    showScreen(els.end, false);
    endShown = false;
  }

  function begin() {
    if (!state) return;
    E.start(state);
    if (audio) audio.start();
    showScreen(els.start, false);
    showScreen(els.end, false);
    endShown = false;
    shake = 0;
    judgment = null;
    particles = [];
    laneFlash = [0, 0, 0, 0];
    updateHud();
  }

  function showEnd() {
    if (endShown || !state || !state.result) return;
    endShown = true;
    var r = state.result;
    if (audio) audio.finish();
    if (els.endRank) els.endRank.textContent = r.rank;
    if (els.endDetail) els.endDetail.textContent = r.total + 'ノート / 精度 ' + r.accuracy.toFixed(1) + '%';
    if (els.endScore) els.endScore.textContent = String(r.score);
    if (els.endAcc) els.endAcc.textContent = r.accuracy.toFixed(1) + '%';
    if (els.endCombo) els.endCombo.textContent = String(r.maxCombo);
    if (els.endPerfect) els.endPerfect.textContent = String(r.perfect);
    if (els.endGood) els.endGood.textContent = String(r.good);
    if (els.endMiss) els.endMiss.textContent = String(r.missed);
    showScreen(els.end, true);
  }

  function burst(lane, color) {
    var x = laneW() * lane + laneW() / 2;
    var y = hitY();
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 30 + Math.random() * 130;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 50,
        life: 0.25 + Math.random() * 0.3,
        max: 0.55,
        size: 2 + Math.random() * 3,
        color: color
      });
    }
  }

  function processEvents() {
    if (!state) return;
    var events = E.consumeEvents(state);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'hit') {
        laneFlash[ev.lane] = 1;
        judgment = { text: ev.judgment, life: 0.32, max: 0.32, color: ev.judgment === 'PERFECT' ? COLORS[ev.lane] : (ev.judgment === 'GOOD' ? '#ffd166' : '#a9b1d0') };
        burst(ev.lane, COLORS[ev.lane]);
        if (audio) audio.hit(ev.judgment);
      } else if (ev.type === 'miss') {
        judgment = { text: 'MISS', life: 0.32, max: 0.32, color: '#ff5b7a' };
        shake = 0.8;
        if (audio) audio.miss();
      } else if (ev.type === 'empty') {
        laneFlash[ev.lane] = 0.35;
      } else if (ev.type === 'finish') {
        showEnd();
      }
    }
  }

  function updateEffects(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 5);
    if (judgment) {
      judgment.life -= dt;
      if (judgment.life <= 0) judgment = null;
    }
    for (var i = 0; i < 4; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt * 4.5);
    for (var p = particles.length - 1; p >= 0; p--) {
      var particle = particles[p];
      particle.life -= dt;
      if (particle.life <= 0) { particles.splice(p, 1); continue; }
      particle.vy += 260 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  function drawBackground(time) {
    var bg = ctx.createLinearGradient(0, 0, 0, viewH);
    bg.addColorStop(0, '#0c0820');
    bg.addColorStop(0.45, '#14102d');
    bg.addColorStop(1, '#05040c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    if (state) {
      var beatPhase = (state.time / E.BEAT) % 1;
      var pulse = Math.pow(1 - beatPhase, 3);
      var glow = ctx.createRadialGradient(viewW / 2, hitY(), 10, viewW / 2, hitY(), viewW * 0.8);
      glow.addColorStop(0, 'rgba(93,244,255,' + (0.06 + pulse * 0.12) + ')');
      glow.addColorStop(1, 'rgba(93,244,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, viewW, viewH);

      if (els.beatDot) els.beatDot.classList.toggle('on', beatPhase < 0.12);
    } else if (els.beatDot) {
      els.beatDot.classList.remove('on');
    }

    // lane columns
    for (var i = 0; i < 4; i++) {
      var x = i * laneW();
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,.018)' : 'rgba(255,255,255,.035)';
      ctx.fillRect(x, 0, laneW(), viewH);
      ctx.strokeStyle = 'rgba(150,160,230,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, viewH); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150,160,230,.12)';
    ctx.beginPath(); ctx.moveTo(viewW, 0); ctx.lineTo(viewW, viewH); ctx.stroke();

    // perspective-ish guide lines
    ctx.strokeStyle = 'rgba(93,244,255,.07)';
    for (var g = 0; g < 5; g++) {
      var gy = viewH * (0.12 + g * 0.15);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(viewW, gy); ctx.stroke();
    }
  }

  function drawNotes(time) {
    if (!state) return;
    var hY = hitY();
    var topY = viewH * 0.06;
    for (var i = 0; i < state.notes.length; i++) {
      var note = state.notes[i];
      if (note.hit) continue;
      var dt = note.time - state.time;
      if (dt < -E.WINDOWS.ok || dt > E.APPROACH) continue;
      var lw = laneW();
      var x = note.lane * lw + lw / 2;
      var y = hY - (dt / E.APPROACH) * (hY - topY);
      var color = COLORS[note.lane];
      var nw = lw * 0.60;
      var nh = viewH * 0.028;

      ctx.save();
      ctx.globalAlpha = dt < 0 ? 0.62 : 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      var noteGrad = ctx.createLinearGradient(0, y - nh / 2, 0, y + nh / 2);
      noteGrad.addColorStop(0, '#ffffff');
      noteGrad.addColorStop(0.28, color);
      noteGrad.addColorStop(1, color);
      ctx.fillStyle = noteGrad;
      roundRect(x - nw / 2, y - nh / 2, nw, nh, nh / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      roundRect(x - nw * 0.28, y - nh * 0.12, nw * 0.56, nh * 0.24, nh * 0.12);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPads() {
    var hY = hitY();
    var padTop = viewH * 0.82;
    for (var i = 0; i < 4; i++) {
      var x = i * laneW();
      var color = COLORS[i];
      var flash = laneFlash[i];
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      roundRect(x + 4, padTop, laneW() - 8, viewH - padTop - 4, 10);
      ctx.fill();
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.38;
        ctx.fillStyle = color;
        roundRect(x + 4, padTop, laneW() - 8, viewH - padTop - 4, 10);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.32 + flash * 0.6;
      ctx.lineWidth = 2;
      roundRect(x + 4, padTop, laneW() - 8, viewH - padTop - 4, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = '900 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(['D', 'F', 'J', 'K'][i], x + laneW() / 2, padTop + (viewH - padTop) / 2);
    }

    ctx.strokeStyle = 'rgba(255,255,255,.38)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, hY); ctx.lineTo(viewW, hY); ctx.stroke();
    for (var j = 0; j < 4; j++) {
      ctx.fillStyle = COLORS[j];
      ctx.fillRect(j * laneW(), hY - 2, laneW(), 4);
    }
  }

  function drawEffects() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawJudgment() {
    if (!judgment) return;
    var t = 1 - judgment.life / judgment.max;
    ctx.save();
    ctx.globalAlpha = clamp(1 - t * 1.2, 0, 1);
    ctx.fillStyle = judgment.color;
    ctx.font = '900 ' + Math.round(viewW * 0.045) + 'px "Hiragino Kaku Gothic ProN", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = judgment.color;
    ctx.shadowBlur = 16;
    ctx.fillText(judgment.text, viewW / 2, viewH * 0.68);
    ctx.restore();
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 8 * shake);
    drawBackground(time);
    drawNotes(time);
    drawPads();
    drawEffects();
    drawJudgment();
    ctx.restore();
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var w = canvas.clientWidth || 480;
    var h = canvas.clientHeight || 800;
    if (w <= 0) w = 480;
    if (h <= 0) h = 800;
    viewW = w;
    viewH = h;
    canvas.width = Math.max(2, Math.round(w * dpr));
    canvas.height = Math.max(2, Math.round(h * dpr));
  }

  function pressLane(lane) {
    if (!state || state.phase !== 'run') return;
    E.press(state, lane);
    processEvents();
    updateHud();
  }

  function onPointer(e) {
    if (!state || state.phase !== 'run') return;
    if (e && e.preventDefault) e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * viewW;
    var lane = Math.floor(x / laneW());
    pressLane(clamp(lane, 0, 3));
  }

  function onKey(e) {
    if (!e) return;
    var k = (e.key || '').toLowerCase();
    if (k === ' ' || k === 'enter') {
      if (e.preventDefault) e.preventDefault();
      if (state && (state.phase === 'idle' || state.phase === 'over')) begin();
      return;
    }
    if (!state || state.phase !== 'run') return;
    var lane = KEYS.indexOf(k);
    if (lane >= 0) {
      if (e.preventDefault) e.preventDefault();
      pressLane(lane);
    }
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);
    if (state && state.phase === 'run') {
      E.update(state, dt);
      processEvents();
      updateHud();
    }
    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function init() {
    canvas = $('arena');
    ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) return;
    els = {
      start: $('screen-start'),
      end: $('screen-end'),
      time: $('time'),
      score: $('score'),
      combo: $('combo'),
      accuracy: $('accuracy'),
      beatDot: $('beat-dot'),
      btnStart: $('btn-start'),
      btnAgain: $('btn-again'),
      endRank: $('end-rank'),
      endDetail: $('end-detail'),
      endScore: $('end-score'),
      endAcc: $('end-acc'),
      endCombo: $('end-combo'),
      endPerfect: $('end-perfect'),
      endGood: $('end-good'),
      endMiss: $('end-miss')
    };
    state = E.createGame({ width: viewW, height: viewH });
    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnAgain) els.btnAgain.addEventListener('click', begin);
    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resizeCanvas);
    if (typeof ResizeObserver !== 'undefined' && $('stage')) {
      new ResizeObserver(function () { resizeCanvas(); }).observe($('stage'));
    }
    resizeCanvas();
    showStart();
    updateHud();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'beat-rush',
        title: 'BEAT RUSH',
        start: function () { begin(); },
        autoPlayStep: function () { if (state) E.autoStep(state); },
        isDone: function () { return !!(state && state.phase === 'over'); },
        getState: function () { return state ? E.snapshot(state) : null; }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
