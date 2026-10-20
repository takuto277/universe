/* game.js : 画面・入力・2D描画。ルールは engine.js に任せる */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.GravityFlipEngine) ? window.GravityFlipEngine : null;

  var canvas = null;
  var ctx = null;
  var els = {};
  var state = null;
  var view = { phase: 'idle', autoFlipped: false, deathAt: 0 };
  var viewW = 960;
  var viewH = 540;
  var dpr = 1;
  var lastTs = 0;
  var particles = [];
  var stars = [];
  var shake = 0;
  var flash = 0;
  var best = loadBest();

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function $(id) { return document.getElementById(id); }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function loadBest() {
    try {
      if (typeof localStorage === 'undefined') return 0;
      return Math.max(0, parseInt(localStorage.getItem('gravity-flip-best') || '0', 10) || 0);
    } catch (e) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('gravity-flip-best', String(value));
    } catch (e) { }
  }

  /* ===== HUD ===== */
  function updateHud() {
    var snap = state ? E.snapshot(state) : null;
    if (els.score) els.score.textContent = snap ? String(snap.score) : '0';
    if (els.coins) els.coins.textContent = snap ? String(snap.coins) : '0';
    if (els.speed) els.speed.textContent = snap ? (snap.speed / E.BASE_SPEED).toFixed(1) + 'x' : '1.0x';
    if (els.best) els.best.textContent = String(best);
  }

  function showStart() {
    if (els.screenStart) els.screenStart.classList.add('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    view.phase = 'idle';
  }

  function beginRun() {
    state = E.createGame({ width: viewW, height: viewH });
    view.phase = 'run';
    view.autoFlipped = false;
    view.deathAt = 0;
    particles = [];
    shake = 0;
    flash = 0;
    lastTs = 0;
    if (els.screenStart) els.screenStart.classList.remove('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    updateHud();
  }

  function showEnd() {
    view.phase = 'over';
    var snap = E.snapshot(state);
    if (snap.score > best) {
      best = snap.score;
      saveBest(best);
    }
    if (els.endScore) els.endScore.textContent = String(snap.score);
    if (els.endBest) els.endBest.textContent = String(best);
    if (els.endDistance) els.endDistance.textContent = String(snap.distance) + 'm';
    if (els.endCoins) els.endCoins.textContent = String(snap.coins);
    if (els.screenEnd) els.screenEnd.classList.add('visible');
    updateHud();
  }

  /* ===== 入力 ===== */
  function tap() {
    if (view.phase === 'idle') {
      beginRun();
      return;
    }
    if (view.phase === 'run' && state && !state.over) {
      E.flip(state);
      processEvents();
    }
  }

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === ' ' || k === 'Enter' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'w' || k === 'W') {
      if (e.preventDefault) e.preventDefault();
      if (view.phase === 'idle' || view.phase === 'over') beginRun();
      else tap();
    }
  }

  function processEvents() {
    if (!state) return;
    var events = E.consumeEvents(state);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'flip') {
        burst(ev.x, ev.y, 9, ['#5ff0ff', '#7ea9ff'], 160, -ev.gravity * 90, 0.45);
      } else if (ev.type === 'coin') {
        burst(ev.x, ev.y, 8, ['#ffd166', '#fff3b0'], 170, 60, 0.5);
        flash = Math.max(flash, 0.08);
      } else if (ev.type === 'death') {
        burst(ev.x, ev.y, 34, ['#ff4d8d', '#ffd166', '#5ff0ff'], 420, 260, 0.9);
        shake = 1;
        flash = 0.75;
      }
    }
  }

  function burst(x, y, count, colors, speed, up, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = speed * (0.35 + Math.random() * 0.8);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s + up * (0.4 + Math.random() * 0.6),
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 620
      });
    }
  }

  /* ===== 描画 ===== */
  function buildStars() {
    stars = [];
    for (var i = 0; i < 90; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.8,
        depth: 0.06 + Math.random() * 0.34,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function bounds() {
    if (state) return { ceilY: state.ceilY, floorY: state.floorY };
    var margin = clamp(viewH * 0.12, 42, 80);
    return { ceilY: margin, floorY: viewH - margin };
  }

  function drawBackdrop(time) {
    var w = viewW, h = viewH;
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0b1426');
    grad.addColorStop(0.55, '#080d19');
    grad.addColorStop(1, '#05070e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    var distance = state ? state.distance : time * 80;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var x = s.x * w - distance * s.depth;
      x = ((x % w) + w) % w;
      var twinkle = 0.3 + 0.7 * Math.abs(Math.sin(time * 1.4 + s.phase));
      ctx.fillStyle = 'rgba(130, 200, 255, ' + (0.15 + 0.45 * twinkle) + ')';
      ctx.fillRect(x, s.y * h, s.r, s.r);
    }

    if (state && state.speed > 300) {
      var strength = clamp((state.speed - 300) / (E.MAX_SPEED - 300), 0, 1);
      ctx.strokeStyle = 'rgba(120, 220, 255, ' + (0.05 + strength * 0.18) + ')';
      ctx.lineWidth = 1;
      for (i = 0; i < 14; i++) {
        var sx = ((i * 137 - distance * (0.5 + (i % 3) * 0.15)) % w + w) % w;
        var sy = bounds().ceilY + ((i * 73) % Math.max(1, (bounds().floorY - bounds().ceilY)));
        var len = 18 + strength * 46 * ((i % 4) + 1) / 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + len, sy);
        ctx.stroke();
      }
    }
  }

  function drawEdges(time) {
    var w = viewW, h = viewH;
    var b = bounds();

    var floorGrad = ctx.createLinearGradient(0, b.floorY, 0, h);
    floorGrad.addColorStop(0, 'rgba(26, 116, 170, 0.5)');
    floorGrad.addColorStop(0.35, 'rgba(12, 42, 70, 0.6)');
    floorGrad.addColorStop(1, 'rgba(5, 8, 16, 0.95)');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, b.floorY, w, h - b.floorY);

    var ceilGrad = ctx.createLinearGradient(0, b.ceilY, 0, 0);
    ceilGrad.addColorStop(0, 'rgba(130, 44, 150, 0.5)');
    ceilGrad.addColorStop(0.35, 'rgba(54, 22, 74, 0.55)');
    ceilGrad.addColorStop(1, 'rgba(5, 8, 16, 0.95)');
    ctx.fillStyle = ceilGrad;
    ctx.fillRect(0, 0, w, b.ceilY);

    var pulse = 0.75 + 0.25 * Math.sin(time * 3.1);
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = 'rgba(70, 225, 255, 0.85)';
    ctx.strokeStyle = 'rgba(100, 235, 255, ' + pulse + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, b.floorY);
    ctx.lineTo(w, b.floorY);
    ctx.stroke();
    ctx.shadowColor = 'rgba(255, 90, 170, 0.8)';
    ctx.strokeStyle = 'rgba(255, 120, 190, ' + pulse + ')';
    ctx.beginPath();
    ctx.moveTo(0, b.ceilY);
    ctx.lineTo(w, b.ceilY);
    ctx.stroke();
    ctx.restore();

    var distance = state ? state.distance : time * 80;
    var offset = (distance * 0.6) % 42;
    ctx.strokeStyle = 'rgba(160, 240, 255, 0.28)';
    ctx.lineWidth = 2;
    for (var x = -offset; x < w; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, b.floorY + 5);
      ctx.lineTo(x + 16, b.floorY + 5);
      ctx.moveTo(x + 21, b.ceilY - 5);
      ctx.lineTo(x + 37, b.ceilY - 5);
      ctx.stroke();
    }
  }

  function drawObstacles() {
    if (!state) return;
    for (var i = 0; i < state.obstacles.length; i++) {
      var o = state.obstacles[i];
      var baseY = o.side === 'floor' ? state.floorY : state.ceilY;
      var dir = o.side === 'floor' ? -1 : 1;
      var seg = o.w / o.count;
      for (var j = 0; j < o.count; j++) {
        var x0 = o.x + j * seg;
        var apexX = x0 + seg / 2;
        var apexY = baseY + dir * o.h;
        var grad = ctx.createLinearGradient(0, baseY, 0, apexY);
        grad.addColorStop(0, '#ff3d7f');
        grad.addColorStop(1, '#8d5cff');
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x0, baseY);
        ctx.lineTo(x0 + seg, baseY);
        ctx.lineTo(apexX, apexY);
        ctx.closePath();
        ctx.shadowColor = 'rgba(255, 61, 127, 0.75)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 220, 240, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawCoins(time) {
    if (!state) return;
    for (var i = 0; i < state.coinList.length; i++) {
      var c = state.coinList[i];
      var y = E.coinY(state, c.side);
      var squash = 0.35 + 0.65 * Math.abs(Math.cos(time * 4 + c.x * 0.01));
      ctx.save();
      ctx.translate(c.x, y);
      ctx.scale(squash, 1);
      ctx.shadowColor = 'rgba(255, 209, 102, 0.9)';
      ctx.shadowBlur = 16;
      var grad = ctx.createLinearGradient(0, -c.r, 0, c.r);
      grad.addColorStop(0, '#fff3b0');
      grad.addColorStop(0.5, '#ffd166');
      grad.addColorStop(1, '#e09b1e');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, c.r - 2.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function roundRect(x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
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

  function drawBody(x, y, vy, over) {
    var size = E.PLAYER_SIZE;
    var tilt = clamp(vy / 2400, -0.35, 0.35);
    var trail = over ? 0 : 4;

    for (var t = trail; t >= 1; t--) {
      var alpha = 0.05 + (trail - t) * 0.035;
      var tx = x - t * 8;
      var ty = y - vy * 0.004 * t;
      ctx.fillStyle = 'rgba(95, 240, 255, ' + alpha + ')';
      roundRect(tx - size / 2, ty - size / 2, size, size, 9);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    var grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    if (over) {
      grad.addColorStop(0, '#ff8fa8');
      grad.addColorStop(1, '#a02040');
    } else {
      grad.addColorStop(0, '#9ffaff');
      grad.addColorStop(0.55, '#47c8ff');
      grad.addColorStop(1, '#2f6ef0');
    }
    ctx.shadowColor = over ? 'rgba(255, 77, 141, 0.9)' : 'rgba(80, 220, 255, 0.9)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = grad;
    roundRect(-size / 2, -size / 2, size, size, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(235, 255, 255, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    var eyeY = clamp(vy * 0.006, -4, 4);
    ctx.fillStyle = '#0a1526';
    ctx.beginPath();
    ctx.arc(-5.5, eyeY - 1, 2.1, 0, Math.PI * 2);
    ctx.arc(5.5, eyeY - 1, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(-6.1, eyeY - 1.8, 0.7, 0, Math.PI * 2);
    ctx.arc(4.9, eyeY - 1.8, 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawPlayer() {
    if (!state || state.over) return;
    drawBody(state.playerX, state.y, state.vy, false);
  }

  function drawPreviewPlayer(time) {
    var y = viewH * 0.5 + Math.sin(time * 2.2) * 16;
    drawBody(viewW * 0.28, y, Math.cos(time * 2.2) * 35, false);
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.8);
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * 16 * shake, (Math.random() - 0.5) * 16 * shake);
    }
    drawBackdrop(time);
    drawEdges(time);
    if (state) {
      drawCoins(time);
      drawObstacles();
      drawPlayer();
    } else {
      drawPreviewPlayer(time);
    }
    drawParticles();
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (flash * 0.45) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    ctx.restore();
  }

  /* ===== ループ・サイズ ===== */
  function resizeCanvas() {
    if (!canvas) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var w = canvas.clientWidth || (els.stage && els.stage.clientWidth) || 960;
    var h = canvas.clientHeight || (els.stage && els.stage.clientHeight) || 540;
    if (w <= 0) w = 960;
    if (h <= 0) h = 540;
    viewW = w;
    viewH = h;
    var pw = Math.max(2, Math.round(w * dpr));
    var ph = Math.max(2, Math.round(h * dpr));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    if (state) E.resize(state, w, h);
    buildStars();
  }

  function watchStageSize() {
    if (typeof ResizeObserver === 'undefined' || !els.stage) return;
    var observer = new ResizeObserver(function () { resizeCanvas(); });
    observer.observe(els.stage);
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);

    if (view.phase === 'run' && state && !state.over) {
      E.update(state, dt);
      processEvents();
      if (state.over) {
        view.phase = 'dying';
        view.deathAt = ts;
      } else {
        updateHud();
      }
    } else if (view.phase === 'dying' && state && state.over) {
      if (ts - view.deathAt > 620) showEnd();
    }

    updateParticles(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 2.2);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.4);
    draw(ts / 1000);

    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  /* ===== 初期化 ===== */
  function init() {
    canvas = $('arena');
    els.stage = $('stage');
    els.score = $('score');
    els.best = $('best');
    els.coins = $('coins');
    els.speed = $('speed');
    els.screenStart = $('screen-start');
    els.screenEnd = $('screen-end');
    els.btnStart = $('btn-start');
    els.btnAgain = $('btn-again');
    els.endScore = $('end-score');
    els.endBest = $('end-best');
    els.endDistance = $('end-distance');
    els.endCoins = $('end-coins');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }

    if (els.btnStart) els.btnStart.addEventListener('click', beginRun);
    if (els.btnAgain) els.btnAgain.addEventListener('click', beginRun);
    if (canvas) {
      canvas.addEventListener('pointerdown', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        tap();
      });
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resizeCanvas);

    resizeCanvas();
    watchStageSize();
    updateHud();
    showStart();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'gravity-flip',
        title: '重力フリップ',
        start: function () { beginRun(); },
        autoPlayStep: function () {
          if (!state || state.over || view.phase !== 'run') return;
          if (!view.autoFlipped && state.time > 0.9) {
            view.autoFlipped = true;
            E.flip(state);
            processEvents();
          }
        },
        isDone: function () { return !!(state && state.over && view.phase === 'over'); },
        getState: function () {
          if (!state) return { phase: view.phase, over: false, score: 0, best: best };
          var snap = E.snapshot(state);
          snap.phase = view.phase;
          snap.best = best;
          return snap;
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
