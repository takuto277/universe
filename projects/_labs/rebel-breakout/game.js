/* game.js : REBEL BREAKOUT（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.RebelBreakoutEngine) ? window.RebelBreakoutEngine : null;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var game = E.createGame();

  var els = {
    time: document.getElementById('time'),
    score: document.getElementById('score'),
    lives: document.getElementById('lives'),
    shields: document.getElementById('shields'),
    state: document.getElementById('state'),
    hint: document.getElementById('hint'),
    timebar: document.getElementById('timebar'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultTitle: document.getElementById('result-title'),
    resultSub: document.getElementById('result-sub'),
    resultScore: document.getElementById('result-score'),
    resultTime: document.getElementById('result-time'),
    resultNear: document.getElementById('result-near'),
    resultShields: document.getElementById('result-shields'),
    resultRank: document.getElementById('result-rank'),
    resultBest: document.getElementById('result-best'),
    bestStart: document.getElementById('best-start'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnSwap: document.getElementById('btn-swap'),
    swapCd: document.getElementById('swap-cd'),
    btnUp: document.getElementById('btn-up'),
    btnDown: document.getElementById('btn-down'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right')
  };

  var best = 0;
  try {
    best = Number(window.localStorage && window.localStorage.getItem('rebel-breakout-best')) || 0;
  } catch (e) { best = 0; }

  var dpr = 1;
  var viewW = E.W;
  var viewH = E.H;
  var scale = 1;
  var offsetX = 0;
  var offsetY = 0;
  var lastTs = 0;
  var seenEvents = 0;
  var overShown = false;

  var shake = 0;
  var flash = 0;
  var surgeFlash = 0;
  var particles = [];
  var floats = [];
  var trails = {};

  var keyLeft = false;
  var keyRight = false;
  var keyUp = false;
  var keyDown = false;
  var dpadLeft = false;
  var dpadRight = false;
  var dpadUp = false;
  var dpadDown = false;
  var pointerActive = false;
  var pointer = { x: E.W / 2, y: E.H - 70 };

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el && el.classList) el.classList.toggle('visible', !!on); }
  function setText(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }

  function saveBest(value) {
    try { if (window.localStorage) window.localStorage.setItem('rebel-breakout-best', String(value)); } catch (e) { }
  }

  function resize() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var cssW = (rect && rect.width) || canvas.clientWidth || E.W;
    var cssH = (rect && rect.height) || canvas.clientHeight || E.H;
    dpr = window.devicePixelRatio || 1;
    viewW = cssW;
    viewH = cssH;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    scale = Math.min(cssW / E.W, cssH / E.H);
    offsetX = (cssW - E.W * scale) / 2;
    offsetY = (cssH - E.H * scale) / 2;
  }

  function toWorld(clientX, clientY) {
    if (!canvas || !canvas.getBoundingClientRect) return { x: E.W / 2, y: E.H / 2 };
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offsetX) / (scale || 1),
      y: (clientY - rect.top - offsetY) / (scale || 1)
    };
  }

  function hasSources() {
    return pointerActive || keyLeft || keyRight || keyUp || keyDown ||
      dpadLeft || dpadRight || dpadUp || dpadDown;
  }

  function refreshInput() {
    if (game.phase !== 'playing') return;
    if (!hasSources()) { E.setInput(game, 0, 0); return; }
    var dx = (keyRight || dpadRight ? 1 : 0) - (keyLeft || dpadLeft ? 1 : 0);
    var dy = (keyDown || dpadDown ? 1 : 0) - (keyUp || dpadUp ? 1 : 0);
    if (dx === 0 && dy === 0 && pointerActive) {
      var tx = pointer.x - game.player.x;
      var ty = pointer.y - game.player.y;
      var d = len(tx, ty);
      if (d > 8) { dx = tx / d; dy = ty / d; }
    }
    E.setInput(game, dx, dy);
  }

  function burst(x, y, color, count, spread) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (60 + Math.random() * 210) * (spread || 1);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.32 + Math.random() * 0.5,
        max: 0.82,
        size: 2 + Math.random() * 4.5,
        color: color
      });
    }
  }

  function floatText(x, y, text, color) {
    floats.push({ x: x, y: y, text: text, color: color, life: 0.85, max: 0.85 });
  }

  function updateEffects(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 4.5);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.7);
    if (surgeFlash > 0) surgeFlash = Math.max(0, surgeFlash - dt * 1.2);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    for (var j = floats.length - 1; j >= 0; j--) {
      var f = floats[j];
      f.life -= dt;
      if (f.life <= 0) { floats.splice(j, 1); continue; }
      f.y -= dt * 34;
    }
  }

  function updateTrails() {
    var seen = {};
    for (var i = 0; i < game.balls.length; i++) {
      var b = game.balls[i];
      seen[b.id] = true;
      var arr = trails[b.id] || (trails[b.id] = []);
      var last = arr[arr.length - 1];
      if (!last || len(b.x - last.x, b.y - last.y) < 220) arr.push({ x: b.x, y: b.y });
      else { arr.length = 0; arr.push({ x: b.x, y: b.y }); }
      while (arr.length > 9) arr.shift();
    }
    for (var id in trails) {
      if (Object.prototype.hasOwnProperty.call(trails, id) && !seen[id]) delete trails[id];
    }
  }

  function processEvents() {
    if (game.events.length < seenEvents) seenEvents = 0;
    for (var i = seenEvents; i < game.events.length; i++) {
      var ev = game.events[i];
      if (ev.type === 'break') {
        burst(ev.x, ev.y, ev.color || '#ffd166', 7, 0.7);
      } else if (ev.type === 'hit') {
        shake = 1;
        flash = 1;
        burst(game.player.x, game.player.y, '#ff5d73', 26, 1.2);
        floatText(game.player.x, game.player.y - 24, 'HIT', '#ff8095');
      } else if (ev.type === 'near') {
        burst(ev.x, ev.y, '#ffe08a', 4, 0.4);
        floatText(ev.x, ev.y - 12, 'GRAZE +25', '#ffe08a');
      } else if (ev.type === 'swap') {
        burst(ev.x, ev.y, '#ffd166', 16, 0.9);
        floatText(ev.x, ev.y - 20, 'SWAP', '#ffd166');
      } else if (ev.type === 'surge') {
        surgeFlash = 1;
        floatText(E.W / 2, E.H * 0.36, 'SURGE', '#ff7a5b');
      } else if (ev.type === 'finish') {
        showEnd();
      }
    }
    seenEvents = game.events.length;
  }

  function hearts(lives) {
    var out = '';
    for (var i = 0; i < E.MAX_LIVES; i++) out += i < lives ? '\u2665' : '\u00b7';
    return out;
  }

  function updateHud() {
    var s = E.snapshot(game);
    if (!s) return;
    setText(els.time, Math.ceil(s.timeLeft * 10) / 10);
    setText(els.score, s.score);
    setText(els.lives, hearts(s.lives));
    setText(els.shields, s.shields);
    if (els.timebar) els.timebar.style.width = ((s.timeLeft / s.duration) * 100).toFixed(1) + '%';
    setText(els.swapCd, s.swapReady ? 'READY' : s.swapCd.toFixed(1) + 's');
    if (els.btnSwap) els.btnSwap.classList.toggle('ready', !!s.swapReady);
    if (els.state) {
      els.state.textContent = s.phase === 'playing'
        ? (s.surge ? 'SURGE' : 'DODGE')
        : (s.phase === 'finished' ? (s.result && s.result.reason === 'clear' ? 'CLEAR' : 'DOWN') : 'READY');
      els.state.classList.toggle('danger', !!(s.phase === 'playing' && s.surge));
    }
    if (els.hint) {
      els.hint.textContent = s.phase === 'playing'
        ? 'WASD / 矢印 / ドラッグで回避・SPACEでSWAP'
        : '生き残ってシールドを守れ';
    }
  }

  function syncScreens() {
    show(els.start, game.phase === 'idle');
    if (game.phase === 'finished') showEnd();
    else if (game.phase === 'playing') show(els.result, false);
  }

  function showEnd() {
    if (overShown || !game.result) return;
    overShown = true;
    var r = game.result;
    if (r.score > best) { best = r.score; saveBest(best); }
    var clear = r.reason === 'clear';
    setText(els.resultTitle, clear ? 'CLEAR' : 'DOWN');
    if (els.resultTitle) {
      els.resultTitle.classList.toggle('clear', clear);
      els.resultTitle.classList.toggle('down', !clear);
    }
    setText(els.resultSub, clear
      ? '60秒を生き延びた。ブロックの反乱、成功。'
      : 'ボールに捕まった。壁ではなく、隙間を走れ。');
    setText(els.resultScore, r.score);
    setText(els.resultTime, r.time.toFixed(1) + 's');
    setText(els.resultNear, r.nearMisses);
    setText(els.resultShields, r.shieldsBroken);
    setText(els.resultRank, r.rank);
    setText(els.resultBest, best);
    setText(els.bestStart, 'BEST ' + best);
    show(els.start, false);
    show(els.result, true);
  }

  function resetHeld() {
    keyLeft = keyRight = keyUp = keyDown = false;
    dpadLeft = dpadRight = dpadUp = dpadDown = false;
    pointerActive = false;
  }

  function begin() {
    E.start(game);
    seenEvents = 0;
    overShown = false;
    lastTs = 0;
    particles = [];
    floats = [];
    trails = {};
    shake = 0;
    flash = 0;
    surgeFlash = 0;
    resetHeld();
    show(els.start, false);
    show(els.result, false);
    updateHud();
  }

  function toggleSwap() {
    if (game.phase !== 'playing') return;
    E.swap(game);
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawBackdrop() {
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawArena(time) {
    var bg = ctx.createLinearGradient(0, 0, 0, E.H);
    bg.addColorStop(0, '#0c1530');
    bg.addColorStop(0.55, '#080e22');
    bg.addColorStop(1, '#04060f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, E.W, E.H);

    ctx.strokeStyle = 'rgba(90,140,220,.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= E.W; x += 45) { ctx.moveTo(x, 0); ctx.lineTo(x, E.H); }
    for (var y = 0; y <= E.H; y += 45) { ctx.moveTo(0, y); ctx.lineTo(E.W, y); }
    ctx.stroke();

    var glow = ctx.createRadialGradient(E.W / 2, E.H * 0.62, 40, E.W / 2, E.H * 0.62, E.W * 0.72);
    glow.addColorStop(0, 'rgba(93,183,255,.10)');
    glow.addColorStop(1, 'rgba(93,183,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, E.W, E.H);

    ctx.save();
    ctx.strokeStyle = 'rgba(93,183,255,.55)';
    ctx.shadowColor = 'rgba(93,183,255,.8)';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    roundRect(E.MARGIN, E.MARGIN, E.W - E.MARGIN * 2, E.H - E.MARGIN * 2, 16);
    ctx.stroke();
    ctx.restore();
  }

  function drawShields() {
    for (var i = 0; i < game.shields.length; i++) {
      var sh = game.shields[i];
      var x = sh.x - sh.w / 2;
      var y = sh.y - sh.h / 2;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = sh.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = sh.color;
      roundRect(x, y, sh.w, sh.h, 6);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(255,255,255,.28)';
      roundRect(x + 4, y + 4, sh.w - 8, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      roundRect(x + 4, y + sh.h - 9, sh.w - 8, 5, 2.5);
      ctx.fill();
    }
  }

  function drawBalls() {
    for (var i = 0; i < game.balls.length; i++) {
      var b = game.balls[i];
      var arr = trails[b.id] || [];
      for (var t = 0; t < arr.length; t++) {
        var p = arr[t];
        var a = (t + 1) / arr.length;
        ctx.globalAlpha = a * 0.3;
        ctx.fillStyle = '#ff8a5b';
        ctx.beginPath();
        ctx.arc(p.x, p.y, E.BALL_R * (0.35 + a * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.shadowColor = '#ff7a4d';
      ctx.shadowBlur = 20;
      var g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, E.BALL_R * 1.9);
      g.addColorStop(0, '#fff3e0');
      g.addColorStop(0.45, '#ffb35c');
      g.addColorStop(1, '#ff5a2b');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, E.BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#fff8ec';
      ctx.beginPath();
      ctx.arc(b.x - 2, b.y - 2, E.BALL_R * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(time) {
    var p = E.snapshot(game).player;
    var half = p.size / 2;
    var alpha = 1;
    if (p.invuln > 0) alpha = Math.sin(time * 42) > 0 ? 0.34 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#5df4ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#5df4ff';
    roundRect(p.x - half, p.y - half, p.size, p.size, 9);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    var inner = ctx.createLinearGradient(p.x - half, p.y - half, p.x + half, p.y + half);
    inner.addColorStop(0, '#0a2b46');
    inner.addColorStop(1, '#061324');
    ctx.fillStyle = inner;
    roundRect(p.x - half + 7, p.y - half + 7, p.size - 14, p.size - 14, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(93,244,255,.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(93,244,255,.9)';
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', p.x, p.y - half - 7);
    ctx.restore();

    var cd = game.player.swapCd;
    if (cd <= 0) {
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(255,209,102,.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, half + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      var progress = 1 - cd / E.SWAP_CD;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,209,102,.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, half + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      var s = p.size;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    for (var i = 0; i < floats.length; i++) {
      var f = floats[i];
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.color;
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawSurge(time) {
    var active = game.phase === 'playing' && game.surgeOn;
    if (!active && surgeFlash <= 0) return;
    var a = active ? 0.08 + Math.sin(time * 8) * 0.03 : surgeFlash * 0.14;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(0, 0, E.W, E.H);
    ctx.restore();
  }

  function draw(time) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop();
    var ox = shake > 0 ? (Math.random() * 2 - 1) * shake * 7 : 0;
    var oy = shake > 0 ? (Math.random() * 2 - 1) * shake * 7 : 0;
    ctx.save();
    ctx.translate(offsetX + ox, offsetY + oy);
    ctx.scale(scale, scale);
    drawArena(time);
    drawShields();
    drawBalls();
    drawPlayer(time);
    drawParticles();
    drawFloats();
    drawSurge(time);
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.22;
      ctx.fillStyle = '#ff2d55';
      ctx.fillRect(0, 0, E.W, E.H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function loop(now) {
    if (now == null) now = (window.performance ? window.performance.now() : Date.now());
    var dt = lastTs ? (now - lastTs) / 1000 : 0;
    lastTs = now;
    dt = Math.min(0.05, Math.max(0, dt));
    if (game.phase === 'playing') E.update(game, dt);
    if (hasSources()) refreshInput();
    processEvents();
    updateTrails();
    updateEffects(dt);
    updateHud();
    syncScreens();
    draw(now / 1000);
    if (window.requestAnimationFrame) window.requestAnimationFrame(loop);
  }

  function onKeyDown(event) {
    if (!event) return;
    var code = event.code;
    if (game.phase === 'idle' || game.phase === 'finished') {
      if (code === 'Space' || code === 'Enter' || code === 'KeyR') {
        if (event.preventDefault) event.preventDefault();
        begin();
      }
      return;
    }
    if (game.phase !== 'playing') return;
    if (code === 'ArrowLeft' || code === 'KeyA') {
      if (event.preventDefault) event.preventDefault();
      keyLeft = true;
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      if (event.preventDefault) event.preventDefault();
      keyRight = true;
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      if (event.preventDefault) event.preventDefault();
      keyUp = true;
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      if (event.preventDefault) event.preventDefault();
      keyDown = true;
    } else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
      if (event.preventDefault) event.preventDefault();
      toggleSwap();
      return;
    }
    refreshInput();
  }

  function onKeyUp(event) {
    if (!event) return;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keyLeft = false;
    else if (event.code === 'ArrowRight' || event.code === 'KeyD') keyRight = false;
    else if (event.code === 'ArrowUp' || event.code === 'KeyW') keyUp = false;
    else if (event.code === 'ArrowDown' || event.code === 'KeyS') keyDown = false;
    else return;
    refreshInput();
  }

  function bindHold(el, key) {
    if (!el || !el.addEventListener) return;
    function down(event) {
      if (event && event.preventDefault) event.preventDefault();
      if (key === 'left') dpadLeft = true;
      else if (key === 'right') dpadRight = true;
      else if (key === 'up') dpadUp = true;
      else if (key === 'down') dpadDown = true;
      refreshInput();
    }
    function up(event) {
      if (event && event.preventDefault) event.preventDefault();
      if (key === 'left') dpadLeft = false;
      else if (key === 'right') dpadRight = false;
      else if (key === 'up') dpadUp = false;
      else if (key === 'down') dpadDown = false;
      refreshInput();
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  function onPointerDown(event) {
    if (!event) return;
    if (game.phase !== 'playing') return;
    if (event.preventDefault) event.preventDefault();
    pointerActive = true;
    var pos = toWorld(event.clientX, event.clientY);
    pointer.x = pos.x;
    pointer.y = pos.y;
    refreshInput();
  }

  function onPointerMove(event) {
    if (!event || !pointerActive) return;
    if (event.preventDefault) event.preventDefault();
    var pos = toWorld(event.clientX, event.clientY);
    pointer.x = pos.x;
    pointer.y = pos.y;
    refreshInput();
  }

  function onPointerUp() {
    pointerActive = false;
    refreshInput();
  }

  resize();
  if (window.addEventListener) {
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }
  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
  }
  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', begin);
  if (els.btnSwap) els.btnSwap.addEventListener('click', function (event) {
    if (event && event.preventDefault) event.preventDefault();
    toggleSwap();
  });
  bindHold(els.btnLeft, 'left');
  bindHold(els.btnRight, 'right');
  bindHold(els.btnUp, 'up');
  bindHold(els.btnDown, 'down');

  setText(els.bestStart, 'BEST ' + best);
  updateHud();

  window.__GAME__ = {
    id: 'rebel-breakout',
    title: 'REBEL BREAKOUT',
    start: begin,
    autoPlayStep: function () { E.autoStep(game); },
    isDone: function () { return game.phase === 'finished'; },
    getState: function () { return E.snapshot(game); }
  };

  if (window.requestAnimationFrame) window.requestAnimationFrame(loop);
})();
