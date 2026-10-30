/* game.js : ねむりのまもり（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.SleepGuardEngine) ? window.SleepGuardEngine : null;
  var AU = (typeof window !== 'undefined' && window.SleepGuardAudio) ? window.SleepGuardAudio : null;
  var audio = AU ? AU.create() : null;
  var MUTE_KEY = 'sleep-guard-muted';
  var canvas = null;
  var ctx = null;
  var els = {};
  var state = null;
  var viewW = 480;
  var viewH = 800;
  var dpr = 1;
  var lastTs = 0;
  var endShown = false;
  var particles = [];
  var rings = [];
  var stars = [];
  var shake = 0;
  var flash = 0;
  var muted = loadMuted();
  var images = { bg: null, noise: {} };
  var bgLayout = null;

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function $(id) { return document.getElementById(id); }

  function loadMuted() {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'; }
    catch (e) { return false; }
  }

  function saveMuted(value) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, value ? '1' : '0'); }
    catch (e) { }
  }

  function loadImage(src) {
    if (typeof Image === 'undefined') return null;
    var img = new Image();
    img.src = src;
    return img;
  }

  function preloadAssets() {
    images.bg = loadImage('assets/bg-bedroom.jpg');
    if (!E) return;
    for (var i = 0; i < E.NOISE_TYPES.length; i++) {
      var type = E.NOISE_TYPES[i];
      images.noise[type.id] = loadImage('assets/' + type.id + '-sheet.png');
    }
  }
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

  function makeStars() {
    stars = [];
    for (var i = 0; i < 45; i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, p: Math.random() * 6.28 });
    }
  }

  function burst(x, y, count, colors, speed, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = speed * (0.35 + Math.random() * 0.9);
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        life: life * (0.6 + Math.random() * 0.7), max: life,
        size: 1.5 + Math.random() * 3.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 420
      });
    }
  }

  function ring(x, y, color, maxR, life) {
    rings.push({ x: x, y: y, r: 4, maxR: maxR, life: life, max: life, color: color });
  }

  function updateHud() {
    var snap = state ? E.snapshot(state) : null;
    var sleep = snap ? snap.sleep : E.START_SLEEP;
    var pct = Math.round(sleep);
    if (els.gaugeFill) {
      els.gaugeFill.style.width = pct + '%';
      els.gaugeFill.style.background = sleep < 25
        ? 'linear-gradient(90deg,#b33a5a,#ff6b8a)'
        : (sleep >= 75 ? 'linear-gradient(90deg,#c08b2c,#ffd166,#fff3b0)' : 'linear-gradient(90deg,#4265b8,#6db7ff,#c8f0ff)');
    }
    if (els.gaugePct) els.gaugePct.textContent = pct + '%';
    if (els.score) els.score.textContent = String(snap ? snap.score : 0);
    if (els.stopped) els.stopped.textContent = String(snap ? snap.stopped : 0);
  }

  function showStart() {
    if (els.screenStart) els.screenStart.classList.add('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    endShown = false;
    updateHud();
  }

  function beginRun() {
    state = E.createGame({ width: viewW, height: viewH });
    E.start(state);
    if (audio) {
      audio.unlock();
      audio.setMuted(muted);
      audio.startBgm();
    }
    endShown = false;
    particles = [];
    rings = [];
    shake = 0;
    flash = 0;
    lastTs = 0;
    if (els.screenStart) els.screenStart.classList.remove('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    updateHud();
  }

  function showEnd() {
    if (endShown || !state) return;
    endShown = true;
    if (audio) audio.stopBgm();
    var snap = E.snapshot(state);
    var clear = snap.result === 'clear';
    if (els.endEyebrow) els.endEyebrow.textContent = clear ? 'GOOD MORNING' : 'NO SLEEP';
    if (els.endTitle) els.endTitle.textContent = clear ? 'おやすみなさい' : '眠れ無ーーい！';
    if (els.endDetail) {
      els.endDetail.textContent = clear
        ? '静かな夜を守りきった。よく眠れた。'
        : '騒音に負けた…もう一度、静かな夜を守ろう。';
    }
    if (els.endScore) els.endScore.textContent = String(snap.score);
    if (els.endTime) els.endTime.textContent = snap.time.toFixed(1) + 's';
    if (els.endStopped) els.endStopped.textContent = String(snap.stopped);
    if (els.screenEnd) els.screenEnd.classList.add('visible');
    updateHud();
  }

  function processEvents() {
    if (!state) return;
    var events = E.consumeEvents(state);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'noise') {
        ring(ev.noise.x, ev.noise.y, 'rgba(109,183,255,.4)', 42, 0.4);
      } else if (ev.type === 'noiseActive') {
        if (audio) audio.play('noise');
        shake = Math.max(shake, 0.12);
        ring(ev.noise.x, ev.noise.y, 'rgba(255,130,200,.6)', 58, 0.5);
      } else if (ev.type === 'silence') {
        if (audio) audio.play('tap');
        burst(ev.noise.x, ev.noise.y, 16, ['#6db7ff', '#c8f0ff', '#ffd166', '#ffffff'], 230, 0.65);
        ring(ev.noise.x, ev.noise.y, 'rgba(109,183,255,.7)', 62, 0.45);
      } else if (ev.type === 'clear') {
        if (audio) audio.play('clear');
        flash = 0.35;
        for (var j = 0; j < 5; j++) {
          burst(viewW * (0.2 + j * 0.15), viewH * 0.35, 22, ['#ffd166', '#6db7ff', '#ff82c8', '#ffffff'], 300, 1.1);
        }
      } else if (ev.type === 'over') {
        if (audio) audio.play('over');
        shake = 0.8;
        flash = 0.4;
      }
    }
  }

  function updateEffects(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.4);
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i];
      r.life -= dt;
      r.r += (r.maxR - r.r) * Math.min(1, dt * 8);
      if (r.life <= 0) rings.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.4);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
  }

  function drawBackdrop(time) {
    var grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, '#0a1430');
    grad.addColorStop(0.55, '#0b0c20');
    grad.addColorStop(1, '#050711');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);

    var glow = ctx.createRadialGradient(viewW * 0.78, viewH * 0.16, 10, viewW * 0.78, viewH * 0.16, viewW * 0.6);
    glow.addColorStop(0, 'rgba(90,130,255,.24)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, viewW, viewH);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.8 + s.p));
      ctx.fillStyle = 'rgba(190,225,255,' + (0.12 + tw * 0.5) + ')';
      ctx.fillRect(s.x * viewW, s.y * viewH * 0.55, s.r, s.r);
    }

    // 窓と月
    var wx = viewW * 0.68;
    var wy = viewH * 0.09;
    var ww = Math.min(viewW * 0.24, 120);
    var wh = ww * 0.9;
    ctx.save();
    ctx.fillStyle = 'rgba(17,32,64,.85)';
    roundRect(wx, wy, ww, wh, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(130,180,255,.32)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,180,.9)';
    ctx.beginPath();
    ctx.arc(wx + ww * 0.65, wy + wh * 0.35, Math.min(ww, wh) * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,20,45,.9)';
    ctx.beginPath();
    ctx.arc(wx + ww * 0.74, wy + wh * 0.3, Math.min(ww, wh) * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 床
    var floorY = viewH * 0.82;
    ctx.fillStyle = 'rgba(8,12,24,.9)';
    ctx.fillRect(0, floorY, viewW, viewH - floorY);
    ctx.strokeStyle = 'rgba(100,140,220,.12)';
    ctx.lineWidth = 1;
    for (var x = 0; x < viewW; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x + 24, viewH);
      ctx.stroke();
    }
  }

  function drawBackgroundImage() {
    var img = images.bg;
    if (!img || !img.complete || !img.naturalWidth) return false;
    var scale = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
    var dw = img.naturalWidth * scale;
    var dh = img.naturalHeight * scale;
    var dx = (viewW - dw) / 2;
    var dy = (viewH - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    bgLayout = { scale: scale, dx: dx, dy: dy };
    return true;
  }

  function drawBed(time, awake) {
    var bedW = Math.min(viewW * 0.8, 430);
    var bedH = Math.min(viewH * 0.2, 160);
    var bx = (viewW - bedW) / 2;
    var by = viewH * 0.72;
    var shakeX = awake ? Math.sin(time * 28) * 2.4 : 0;

    ctx.save();
    ctx.translate(shakeX, 0);
    // ベッド
    ctx.fillStyle = '#27375d';
    roundRect(bx, by, bedW, bedH, 18);
    ctx.fill();
    ctx.fillStyle = '#182542';
    roundRect(bx + 8, by + 10, bedW - 16, bedH - 20, 14);
    ctx.fill();
    // 枕
    ctx.fillStyle = '#d8e7ff';
    roundRect(bx + 18, by - 6, bedW * 0.3, bedH * 0.42, 12);
    ctx.fill();
    // 毛布
    ctx.fillStyle = '#4267b8';
    roundRect(bx + bedW * 0.32, by - 12, bedW * 0.56, bedH * 0.56, 16);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,190,255,.35)';
    roundRect(bx + bedW * 0.36, by - 6, bedW * 0.48, 8, 4);
    ctx.fill();

    // キャラクター
    var hx = bx + bedW * 0.22;
    var hy = by + bedH * 0.02;
    var hr = Math.max(18, Math.min(bedW, bedH) * 0.2);
    ctx.fillStyle = '#f2c9a4';
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    // 髪
    ctx.fillStyle = '#253252';
    ctx.beginPath();
    ctx.arc(hx - hr * 0.08, hy - hr * 0.2, hr * 0.9, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#253252';
    ctx.beginPath();
    ctx.ellipse(hx - hr * 0.75, hy, hr * 0.28, hr * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // 顔
    ctx.strokeStyle = '#3b2b30';
    ctx.fillStyle = '#3b2b30';
    ctx.lineWidth = 2;
    if (awake) {
      ctx.beginPath(); ctx.arc(hx - hr * 0.32, hy - hr * 0.08, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + hr * 0.25, hy - hr * 0.08, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx - hr * 0.04, hy + hr * 0.34, hr * 0.16, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(hx - hr * 0.32, hy - hr * 0.04, hr * 0.2, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx + hr * 0.25, hy - hr * 0.04, hr * 0.2, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx - hr * 0.04, hy + hr * 0.3, hr * 0.12, 0, Math.PI);
      ctx.stroke();
    }

    // Zzz
    if (!awake && state && state.phase !== 'over') {
      ctx.fillStyle = 'rgba(200,235,255,.8)';
      ctx.font = '800 ' + Math.round(hr * 0.7) + 'px system-ui, sans-serif';
      var zx = hx + hr * 1.2;
      var zy = hy - hr * 0.8 - (time * 12 % 18);
      ctx.fillText('z', zx, zy);
      ctx.font = '800 ' + Math.round(hr * 0.45) + 'px system-ui, sans-serif';
      ctx.fillText('z', zx + hr * 0.45, zy - hr * 0.5);
    }
    ctx.restore();
  }

  function drawNoise(noise, time) {
    var active = noise.active !== false;
    var sheet = images.noise[noise.type];
    var hasSheet = sheet && sheet.complete && sheet.naturalWidth;
    var w = noise.w;
    var h = noise.h;
    ctx.save();
    if (hasSheet) {
      var frame = active ? Math.floor((((state ? state.time : time) - noise.born) * 4) % 2) : 0;
      var fw = sheet.naturalWidth / 2;
      ctx.drawImage(sheet, frame * fw, 0, fw, sheet.naturalHeight,
                    noise.x - w / 2, noise.y - h / 2, w, h);
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = Math.round(Math.min(w, h) * 0.7) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
      ctx.fillText(noise.icon, noise.x, noise.y);
    }
    ctx.restore();
  }

  function drawEffects() {
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i];
      ctx.globalAlpha = clamp(r.life / r.max, 0, 1);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake);
    var hasBackground = drawBackgroundImage();
    if (!hasBackground) drawBackdrop(time);
    var awake = !!(state && state.phase === 'run' && state.noises.some(function (noise) { return noise.active !== false; }));
    if (state && state.phase === 'over') awake = true;
    if (!hasBackground) drawBed(time, awake);
    if (state) {
      var order = {};
      E.NOISE_TYPES.forEach(function (type, index) { order[type.id] = index; });
      state.noises.slice().sort(function (a, b) {
        return (order[a.type] || 0) - (order[b.type] || 0);
      }).forEach(function (noise) { drawNoise(noise, time); });
    }
    drawEffects();
    if (flash > 0) {
      ctx.fillStyle = 'rgba(210,235,255,' + (flash * 0.35) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    ctx.restore();
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var stageW = els.stage ? els.stage.clientWidth : (window.innerWidth || 480);
    var stageH = els.stage ? els.stage.clientHeight : (window.innerHeight || 800);
    var w = Math.min(stageW, stageH * 9 / 16);
    var h = w * 16 / 9;
    if (w <= 0) w = 480;
    if (h <= 0) h = 800;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    viewW = w;
    viewH = h;
    canvas.width = Math.max(2, Math.round(w * dpr));
    canvas.height = Math.max(2, Math.round(h * dpr));
    if (state) E.resize(state, w, h);
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);
    if (state && state.phase === 'run') {
      E.update(state, dt);
      processEvents();
      if (state.phase !== 'run') showEnd();
    }
    updateEffects(dt);
    updateHud();
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function onPointer(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!state) return;
    if (state.phase === 'idle') { beginRun(); return; }
    if (state.phase === 'over' || state.phase === 'clear') { beginRun(); return; }
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * viewW;
    var y = (e.clientY - rect.top) / rect.height * viewH;
    E.tapAt(state, x, y);
    processEvents();
    updateHud();
  }

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === ' ' || k === 'Enter') {
      if (e.preventDefault) e.preventDefault();
      if (state && (state.phase === 'idle' || state.phase === 'over' || state.phase === 'clear')) beginRun();
    }
  }

  function updateSoundButton() {
    if (els.btnSound) els.btnSound.textContent = muted ? '音 OFF' : '音 ON';
  }

  function init() {
    canvas = $('arena');
    els.stage = $('stage');
    els.gaugeFill = $('gauge-fill');
    els.gaugePct = $('gauge-pct');
    els.score = $('score');
    els.stopped = $('stopped');
    els.screenStart = $('screen-start');
    els.screenEnd = $('screen-end');
    els.endEyebrow = $('end-eyebrow');
    els.endTitle = $('end-title');
    els.endDetail = $('end-detail');
    els.endScore = $('end-score');
    els.endTime = $('end-time');
    els.endStopped = $('end-stopped');
    els.btnStart = $('btn-start');
    els.btnAgain = $('btn-again');
    els.btnSound = $('btn-sound');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }
    state = E.createGame({ width: viewW, height: viewH });
    preloadAssets();
    makeStars();
    resizeCanvas();
    if (els.btnStart) els.btnStart.addEventListener('click', beginRun);
    if (els.btnAgain) els.btnAgain.addEventListener('click', beginRun);
    if (audio) audio.setMuted(muted);
    updateSoundButton();
    if (els.btnSound) {
      els.btnSound.addEventListener('click', function (event) {
        if (event && event.preventDefault) event.preventDefault();
        muted = !muted;
        saveMuted(muted);
        if (audio) {
          audio.unlock();
          audio.setMuted(muted);
          if (!muted && state && state.phase === 'run') audio.startBgm();
        }
        updateSoundButton();
      });
    }
    if (els.screenEnd) {
      els.screenEnd.addEventListener('click', function (event) {
        if (event.target === els.screenEnd) beginRun();
      });
    }
    if (canvas) canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resizeCanvas);
    if (typeof ResizeObserver !== 'undefined' && els.stage) {
      new ResizeObserver(function () { resizeCanvas(); }).observe(els.stage);
    }
    showStart();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'sleep-guard',
        title: 'ねむりのまもり',
        start: function () { beginRun(); },
        autoPlayStep: function () { if (state) E.autoStep(state); },
        isDone: function () { return !!(state && (state.phase === 'clear' || state.phase === 'over')); },
        getState: function () {
          var snap = state ? E.snapshot(state) : { phase: 'idle', sleep: E.START_SLEEP, maxSleep: E.MAX_SLEEP, score: 0, stopped: 0, noises: [] };
          snap.phase = state ? state.phase : 'idle';
          return snap;
        }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
