/* game.js : 画面・入力・Canvas 2D 描画。ルールは engine.js に任せる */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.NeonStackEngine) ? window.NeonStackEngine : null;
  var AU = (typeof window !== 'undefined' && window.NeonStackAudio) ? window.NeonStackAudio : null;
  var audio = AU ? AU.create() : null;

  var GROUND = 66;
  var BEST_KEY = 'neon-stack-best';
  var MUTE_KEY = 'neon-stack-muted';

  var canvas = null;
  var ctx = null;
  var els = {};
  var state = null;
  var view = { phase: 'idle', overAt: 0, autoDrops: 0 };
  var viewW = 480;
  var viewH = 640;
  var dpr = 1;
  var lastTs = 0;
  var particles = [];
  var popups = [];
  var rings = [];
  var stars = [];
  var shake = 0;
  var flash = 0;
  var best = loadBest();
  var muted = loadMuted();

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function $(id) { return document.getElementById(id); }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function hsl(h, s, l, a) {
    if (a == null) return 'hsl(' + h + ', ' + s + '%, ' + l + '%)';
    return 'hsla(' + h + ', ' + s + '%, ' + l + '%, ' + a + ')';
  }

  function loadMuted() {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function saveMuted(value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch (e) { }
  }

  function loadBest() {
    try {
      if (typeof localStorage === 'undefined') return 0;
      return Math.max(0, parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);
    } catch (e) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(BEST_KEY, String(value));
    } catch (e) { }
  }

  /* ===== HUD・画面切替 ===== */
  function updateHud() {
    var snap = state ? E.snapshot(state) : null;
    if (els.score) els.score.textContent = snap ? String(snap.score) : '0';
    if (els.height) els.height.textContent = snap ? String(snap.height) : '0';
    if (els.combo) els.combo.textContent = snap ? String(snap.maxCombo) : '0';
    if (els.perfect) els.perfect.textContent = snap ? String(snap.perfects) : '0';
    if (els.best) els.best.textContent = String(best);
  }

  function showStart() {
    view.phase = 'idle';
    if (els.screenStart) els.screenStart.classList.add('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
  }

  function beginRun() {
    state = E.createGame({ width: viewW, height: viewH });
    rings = [];
    if (audio) {
      audio.unlock();
      audio.setMuted(muted);
      audio.setIntensity(0);
      audio.startBgm();
    }
    view.phase = 'run';
    view.overAt = 0;
    view.autoDrops = 0;
    particles = [];
    popups = [];
    shake = 0;
    flash = 0;
    lastTs = 0;
    if (els.screenStart) els.screenStart.classList.remove('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    updateHud();
  }

  function showEnd() {
    view.phase = 'over';
    if (audio) audio.stopBgm();
    var snap = E.snapshot(state);
    if (snap.score > best) {
      best = snap.score;
      saveBest(best);
    }
    if (els.endScore) els.endScore.textContent = String(snap.score);
    if (els.endBest) els.endBest.textContent = String(best);
    if (els.endHeight) els.endHeight.textContent = String(snap.height);
    if (els.endCombo) els.endCombo.textContent = String(snap.maxCombo);
    if (els.endPerfect) els.endPerfect.textContent = String(snap.perfects);
    if (els.screenEnd) els.screenEnd.classList.add('visible');
    updateHud();
  }

  /* ===== 座標変換 ===== */
  function screenPos(x, y) {
    var cam = state ? state.cameraY : 0;
    return {
      x: viewW / 2 + x,
      y: viewH - GROUND - (y - cam)
    };
  }

  /* ===== 入力 ===== */
  function tryDrop() {
    if (!state || view.phase !== 'run' || state.over) return;
    var result = E.drop(state);
    if (!result) return;
    processEvents();
    updateHud();
    if (state.over) {
      view.phase = 'dying';
      view.overAt = nowMs();
    }
  }

  function onPointer(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (view.phase === 'idle') {
      beginRun();
    } else if (view.phase === 'run') {
      tryDrop();
    } else if (view.phase === 'over') {
      beginRun();
    }
  }

  function onKey(e) {
    if (!e) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var k = e.key || '';
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || k === 'ArrowDown' || k === 's' || k === 'S') {
      if (e.preventDefault) e.preventDefault();
      if (view.phase === 'idle' || view.phase === 'over') beginRun();
      else tryDrop();
    }
  }

  /* ===== エフェクト ===== */
  function burst(x, y, count, colors, speed, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = speed * (0.3 + Math.random() * 0.9);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: life * (0.55 + Math.random() * 0.7),
        max: life,
        size: 1.6 + Math.random() * 4.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 540
      });
    }
  }

  function popup(text, x, y, color, size) {
    popups.push({ text: text, x: x, y: y, life: 0.9, max: 0.9, color: color, size: size || 22 });
  }

  function processEvents() {
    if (!state) return;
    var events = E.consumeEvents(state);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var p = screenPos(ev.x, ev.y + (state ? E.BLOCK_HEIGHT : 0));
      if (ev.type === 'place') {
        if (ev.perfect) {
          burst(p.x, p.y, 26, ['#ffe98a', '#ffd166', '#57f6ff', '#ffffff'], 340, 0.8);
          rings.push({ x: p.x, y: p.y, r: 10, maxR: Math.max(viewW, viewH) * 0.46, life: 0.62, max: 0.62, color: '#ffe98a' });
          rings.push({ x: p.x, y: p.y, r: 4, maxR: Math.max(viewW, viewH) * 0.3, life: 0.42, max: 0.42, color: '#57f6ff' });
          flash = Math.max(flash, 0.34);
          shake = Math.max(shake, 0.38);
          popup('PERFECT!', p.x, p.y - 18, '#ffe98a', 26);
          if (ev.combo > 1) popup('COMBO x' + ev.combo, p.x, p.y - 48, '#57f6ff', 17);
        } else {
          burst(p.x, p.y, 11, ['#57f6ff', '#8f7bff', '#ffffff'], 190, 0.5);
          if (ev.combo === 0 && ev.gain > 0) {
            popup('+' + ev.gain, p.x, p.y - 16, '#9fe9ff', 16);
          }
        }
      } else if (ev.type === 'miss') {
        burst(p.x, p.y, 34, ['#ff3df0', '#ff6b9d', '#ffd166', '#ffffff'], 380, 0.9);
        shake = 1;
        flash = 0.7;
      }
      if (audio) {
        if (ev.type === 'place') audio.play(ev.perfect ? 'perfect' : 'place', ev.combo || 0, ev.perfect);
        else if (ev.type === 'miss') audio.play('miss');
      }
    }
  }

  function updateEffects(dt) {
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
      p.vx *= Math.exp(-dt * 1.5);
    }
    for (i = popups.length - 1; i >= 0; i--) {
      var pop = popups[i];
      pop.life -= dt;
      pop.y -= 42 * dt;
      if (pop.life <= 0) popups.splice(i, 1);
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var ring = rings[i];
      ring.life -= dt;
      ring.r += (ring.maxR - ring.r) * Math.min(1, dt * 9);
      if (ring.life <= 0) rings.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.4);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
  }

  /* ===== 描画 ===== */
  function buildStars() {
    stars = [];
    for (var i = 0; i < 70; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.5 + Math.random() * 1.7,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.6
      });
    }
  }

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

  function drawBlockPx(left, top, w, h, hue, glow, alpha) {
    if (w <= 0.5 || h <= 0.5) return;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;

    var grad = ctx.createLinearGradient(left, top, left + w, top + h);
    grad.addColorStop(0, hsl((hue + 14) % 360, 100, 72));
    grad.addColorStop(0.45, hsl(hue, 96, 58));
    grad.addColorStop(1, hsl((hue + 42) % 360, 88, 42));

    if (glow) {
      ctx.shadowColor = hsl(hue, 100, 60, 0.9);
      ctx.shadowBlur = 22;
    }
    ctx.fillStyle = grad;
    roundRect(left, top, w, h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(235, 252, 255, 0.7)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(left + 5, top + 3.2);
    ctx.lineTo(left + w - 5, top + 3.2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
  }

  function drawBlockWorld(b, glow, alpha) {
    var bottom = screenPos(0, b.y).y;
    var top = screenPos(0, b.y + E.BLOCK_HEIGHT).y;
    if (bottom < -80 || top > viewH + 80) return;
    var left = screenPos(b.x - b.w / 2, 0).x;
    drawBlockPx(left, top, b.w, bottom - top, b.hue, glow, alpha);
  }

  function drawBackdrop(time) {
    var grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, '#0a0620');
    grad.addColorStop(0.5, '#070a19');
    grad.addColorStop(1, '#02030a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);

    var glow = ctx.createRadialGradient(viewW * 0.5, viewH * 0.42, 20, viewW * 0.5, viewH * 0.42, viewW * 0.72);
    glow.addColorStop(0, 'rgba(70, 60, 190, 0.24)');
    glow.addColorStop(0.55, 'rgba(140, 30, 170, 0.10)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, viewW, viewH);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(time * s.speed + s.phase));
      ctx.fillStyle = 'rgba(150, 220, 255, ' + (0.10 + tw * 0.36) + ')';
      ctx.fillRect(s.x * viewW, ((s.y * viewH - time * 12) % viewH + viewH) % viewH, s.r, s.r);
    }

    var cam = state ? state.cameraY : 0;
    var spacing = 58;
    var offset = ((viewH - GROUND + cam) % spacing + spacing) % spacing;
    ctx.strokeStyle = 'rgba(90, 170, 255, 0.075)';
    ctx.lineWidth = 1;
    for (var y = offset; y < viewH; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewW, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(120, 120, 255, 0.16)';
    ctx.beginPath();
    ctx.moveTo(viewW / 2, 0);
    ctx.lineTo(viewW / 2, viewH);
    ctx.stroke();
  }

  function drawGround() {
    var y = viewH - GROUND;
    var grad = ctx.createLinearGradient(0, y, 0, viewH);
    grad.addColorStop(0, 'rgba(60, 230, 255, 0.22)');
    grad.addColorStop(0.25, 'rgba(20, 40, 90, 0.5)');
    grad.addColorStop(1, 'rgba(2, 3, 10, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, viewW, GROUND);

    ctx.save();
    ctx.shadowColor = 'rgba(70, 235, 255, 0.85)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(100, 245, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(viewW, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawTower(time) {
    if (!state) return;
    var blocks = state.blocks;
    for (var i = 0; i < blocks.length; i++) {
      drawBlockWorld(blocks[i], false, 1);
    }

    var top = blocks[blocks.length - 1];
    if (state.moving) {
      var guideTop = screenPos(0, top.y + E.BLOCK_HEIGHT).y;
      var guideBottom = screenPos(0, state.moving.y).y;
      var guideX = screenPos(top.x, 0).x;
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 245, 255, 0.30)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(guideX, guideTop);
      ctx.lineTo(guideX, guideBottom);
      ctx.stroke();
      ctx.restore();

      var pulse = 0.72 + 0.28 * Math.sin(time * 6);
      drawBlockWorld(state.moving, true, pulse);
    }

    for (i = 0; i < state.debris.length; i++) {
      var d = state.debris[i];
      var p = screenPos(d.x, d.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(d.spin);
      ctx.globalAlpha = clamp(d.life, 0, 1);
      drawBlockPx(-d.w / 2, -d.h / 2, d.w, d.h, d.hue, false, null);
      ctx.restore();
    }

    var pulse2 = 0.5 + 0.5 * Math.sin(time * 2.4);
    ctx.save();
    ctx.globalAlpha = 0.25 + pulse2 * 0.25;
    ctx.fillStyle = 'rgba(90, 240, 255, 0.5)';
    ctx.fillRect(screenPos(top.x, 0).x - 1, screenPos(0, top.y).y - 2, 2, 18);
    ctx.restore();
  }

  function drawDemo(time) {
    for (var i = 0; i < 6; i++) {
      var b = {
        x: 0,
        y: i * E.BLOCK_HEIGHT,
        w: E.BLOCK_WIDTH - i * 7,
        hue: (196 + i * 7) % 360
      };
      drawBlockWorld(b, i === 5, 1);
    }
    var moving = {
      x: Math.sin(time * 1.35) * 92,
      y: 6 * E.BLOCK_HEIGHT,
      w: E.BLOCK_WIDTH - 5 * 7,
      hue: 226
    };
    drawBlockWorld(moving, true, 0.7 + 0.3 * Math.abs(Math.sin(time * 4)));
  }

  function drawEffects() {
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

    for (i = 0; i < rings.length; i++) {
      var ring = rings[i];
      var ra = clamp(ring.life / ring.max, 0, 1);
      ctx.globalAlpha = ra;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    for (i = 0; i < popups.length; i++) {
      var pop = popups[i];
      var alpha = clamp(pop.life / pop.max, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pop.color;
      ctx.font = '900 ' + pop.size + 'px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = pop.color;
      ctx.shadowBlur = 14;
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * 18 * shake, (Math.random() - 0.5) * 18 * shake);
    }
    drawBackdrop(time);
    drawGround();
    if (state) drawTower(time);
    else drawDemo(time);
    drawEffects();
    if (flash > 0) {
      ctx.fillStyle = 'rgba(230, 250, 255, ' + (flash * 0.42) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    ctx.restore();
  }

  /* ===== ループ・サイズ ===== */
  function resizeCanvas() {
    if (!canvas) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var w = canvas.clientWidth || (els.stage && els.stage.clientWidth) || 480;
    var h = canvas.clientHeight || (els.stage && els.stage.clientHeight) || 640;
    if (w <= 0) w = 480;
    if (h <= 0) h = 640;
    viewW = w;
    viewH = h;
    var pw = Math.max(2, Math.round(w * dpr));
    var ph = Math.max(2, Math.round(h * dpr));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    if (state) E.resize(state, w, h);
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

    if (state && view.phase !== 'idle') {
      E.update(state, dt);
      if (view.phase === 'run') {
        processEvents();
        if (state.over) {
          view.phase = 'dying';
          view.overAt = ts;
        } else {
          updateHud();
        }
      }
    }
    if (view.phase === 'dying' && state && ts - view.overAt > 520) showEnd();

    updateEffects(dt);
    if (audio && state) audio.setIntensity(Math.min(3, Math.floor(state.height / 8)));
    draw(ts / 1000);

    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  /* ===== 初期化 ===== */
  function updateSoundButton() {
    if (els.btnSound) {
      els.btnSound.textContent = muted ? '音 OFF' : '音 ON';
      els.btnSound.setAttribute('aria-pressed', muted ? 'false' : 'true');
    }
  }

  function init() {
    canvas = $('arena');
    els.stage = $('stage');
    els.score = $('score');
    els.height = $('height');
    els.combo = $('combo');
    els.perfect = $('perfect');
    els.best = $('best');
    els.screenStart = $('screen-start');
    els.screenEnd = $('screen-end');
    els.btnStart = $('btn-start');
    els.btnAgain = $('btn-again');
    els.endScore = $('end-score');
    els.endBest = $('end-best');
    els.endHeight = $('end-height');
    els.endCombo = $('end-combo');
    els.endPerfect = $('end-perfect');
    els.btnSound = $('btn-sound');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }

    if (els.btnStart) els.btnStart.addEventListener('click', beginRun);
    if (els.btnAgain) els.btnAgain.addEventListener('click', beginRun);
    if (audio) audio.setMuted(muted);
    updateSoundButton();
    if (els.btnSound) {
      els.btnSound.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        muted = !muted;
        saveMuted(muted);
        if (audio) {
          audio.unlock();
          audio.setMuted(muted);
          if (!muted && view.phase === 'run') audio.startBgm();
        }
        updateSoundButton();
      });
    }
    if (canvas) {
      canvas.addEventListener('pointerdown', onPointer);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resizeCanvas);

    resizeCanvas();
    buildStars();
    watchStageSize();
    showStart();
    updateHud();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'neon-stack',
        title: 'ネオンスタック',
        start: function () { beginRun(); },
        autoPlayStep: function () {
          if (!state || view.phase !== 'run' || state.over || !state.moving) return;
          var snap = E.snapshot(state);
          var offset = Math.abs(snap.moving.x - snap.top.x);
          if (view.autoDrops < 14) {
            /* 前半は中心付近で止めて PERFECT を重ね、コンボとカメラを動かす */
            if (offset <= 6) {
              view.autoDrops++;
              tryDrop();
            }
          } else if (offset > Math.max(24, snap.moving.w * 0.55)) {
            /* 後半はわざと外して、ゲームオーバーまで到達させる */
            tryDrop();
          }
        },
        isDone: function () {
          return !!(state && state.over && view.phase === 'over');
        },
        getState: function () {
          if (!state) return { phase: view.phase, over: false, score: 0, best: best, height: 0 };
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
