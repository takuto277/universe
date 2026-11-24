/* game.js : TWIN（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.TwinEngine) ? window.TwinEngine : null;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var game = E.createGame();

  var els = {
    stage: document.getElementById('stage-label'),
    height: document.getElementById('height'),
    score: document.getElementById('score'),
    lives: document.getElementById('lives'),
    echo: document.getElementById('echo'),
    hint: document.getElementById('hint'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultTitle: document.getElementById('result-title'),
    resultSub: document.getElementById('result-sub'),
    resultScore: document.getElementById('result-score'),
    resultHeight: document.getElementById('result-height'),
    resultGates: document.getElementById('result-gates'),
    resultBest: document.getElementById('result-best'),
    bestStart: document.getElementById('best-start'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnLeft: document.getElementById('btn-left'),
    btnSwap: document.getElementById('btn-swap'),
    btnRight: document.getElementById('btn-right')
  };

  var best = 0;
  try {
    best = Number(window.localStorage && window.localStorage.getItem('twin-best')) || 0;
  } catch (e) { best = 0; }

  var dpr = 1;
  var viewW = 480;
  var viewH = 800;
  var lastTs = 0;
  var seenEvents = 0;
  var overShown = false;
  var leftHeld = false;
  var rightHeld = false;
  var shake = 0;
  var flash = 0;
  var particles = [];

  function show(el, on) { if (el && el.classList) el.classList.toggle('visible', !!on); }
  function setText(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function saveBest(value) {
    try { if (window.localStorage) window.localStorage.setItem('twin-best', String(value)); } catch (e) { }
  }

  function resize() {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var cssW = (rect && rect.width) || canvas.clientWidth || 480;
    var cssH = (rect && rect.height) || canvas.clientHeight || 800;
    dpr = window.devicePixelRatio || 1;
    viewW = cssW;
    viewH = cssH;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  function scale() { return viewW / E.W; }
  function sx(x) { return x * scale(); }
  function sy(worldY) { return viewH * 0.78 - (worldY - game.distance) * scale(); }

  function burst(worldX, worldY, color, count, spread) {
    var x = sx(worldX);
    var y = sy(worldY);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (40 + Math.random() * 150) * (spread || 1);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.4,
        max: 0.7,
        size: 2 + Math.random() * 4,
        color: color
      });
    }
  }

  function updateEffects(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 5);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;
    }
  }

  function processEvents() {
    if (game.events.length < seenEvents) seenEvents = 0;
    for (var i = seenEvents; i < game.events.length; i++) {
      var ev = game.events[i];
      var twin = ev.twin ? game.twins[ev.twin] : null;
      if (ev.type === 'pass' && twin) {
        burst(twin.x, twin.y, twin.color, 4, 0.5);
      } else if (ev.type === 'hit' && twin) {
        shake = 1;
        burst(twin.x, twin.y, '#ff5d73', 22, 1.1);
      } else if (ev.type === 'swap') {
        var f = game.twins.front;
        var r = game.twins.rear;
        burst((f.x + r.x) / 2, (f.y + r.y) / 2, '#ffd166', 14, 0.8);
      } else if (ev.type === 'stageClear') {
        flash = 1;
        shake = 0.6;
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
    setText(els.stage, 'STAGE ' + s.stage + '/' + s.stages);
    setText(els.height, s.height + 'm');
    setText(els.score, s.score);
    setText(els.lives, hearts(s.lives));
    setText(els.echo, (s.lagOwner === 'front' ? 'FRONT' : 'REAR') + ' ECHO');
    if (els.echo) {
      els.echo.classList.toggle('front', s.lagOwner === 'front');
      els.echo.classList.toggle('rear', s.lagOwner === 'rear');
    }
    if (els.hint) {
      els.hint.textContent = s.phase === 'clear'
        ? 'STAGE CLEAR'
        : '← → で操作 / SPACE で遅延を入れ替え';
    }
  }

  function syncScreens() {
    var phase = game.phase;
    show(els.start, phase === 'idle');
    if (phase === 'finished') showEnd();
    else if (phase === 'playing' || phase === 'clear') show(els.result, false);
  }

  function showEnd() {
    if (overShown || !game.result) return;
    overShown = true;
    var r = game.result;
    if (r.score > best) { best = r.score; saveBest(best); }
    setText(els.resultTitle, r.reason === 'clear' ? 'CLEAR' : 'DOWN');
    if (els.resultTitle) {
      els.resultTitle.classList.toggle('clear', r.reason === 'clear');
      els.resultTitle.classList.toggle('down', r.reason !== 'clear');
    }
    setText(els.resultSub, r.reason === 'clear'
      ? '\u5168\u30b9\u30c6\u30fc\u30b8\u5236\u8987\u3002\u9045\u5ef6\u3092\u4f7f\u3044\u5207\u3063\u305f\u3002'
      : '\u30e9\u30a4\u30d5\u304c\u5c3d\u304d\u305f\u3002ECHO\u306e\u4e00\u6b69\u5148\u3092\u8aad\u3081\u3002');
    setText(els.resultScore, r.score);
    setText(els.resultHeight, r.height);
    setText(els.resultGates, r.gates);
    setText(els.resultBest, best);
    setText(els.bestStart, 'BEST ' + best);
    show(els.start, false);
    show(els.result, true);
  }

  function clearInput() {
    leftHeld = false;
    rightHeld = false;
    if (game.phase === 'playing') E.setInput(game, 0);
  }

  function recomputeDir() {
    if (game.phase !== 'playing') return;
    E.setInput(game, (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0));
  }

  function begin() {
    E.start(game);
    seenEvents = 0;
    overShown = false;
    lastTs = 0;
    particles = [];
    shake = 0;
    flash = 0;
    leftHeld = false;
    rightHeld = false;
    show(els.start, false);
    show(els.result, false);
    updateHud();
  }

  function toggleSwap() {
    if (game.phase !== 'playing') return;
    E.swap(game);
  }

  function drawBackground(time) {
    var bg = ctx.createLinearGradient(0, 0, 0, viewH);
    bg.addColorStop(0, '#0a1430');
    bg.addColorStop(0.6, '#060b1c');
    bg.addColorStop(1, '#03060f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.fillStyle = 'rgba(160,200,255,.22)';
    for (var i = 0; i < 40; i++) {
      var x = (i * 137.5) % viewW;
      var y = (i * 97.3 - game.distance * 0.45) % (viewH + 60);
      if (y < 0) y += viewH + 60;
      var size = i % 7 === 0 ? 2 : 1.2;
      ctx.fillRect(x, y, size, size);
    }

    var rail = 'rgba(93,244,255,.14)';
    ctx.fillStyle = rail;
    ctx.fillRect(sx(E.MARGIN) - 1, 0, 1.5, viewH);
    ctx.fillRect(sx(E.W - E.MARGIN), 0, 1.5, viewH);
  }

  function drawGates(time) {
    var s = scale();
    for (var i = 0; i < game.gates.length; i++) {
      var gate = game.gates[i];
      var y = sy(gate.y);
      if (y < -40 || y > viewH + 40) continue;
      var gl = sx(gate.center - gate.half);
      var gr = sx(gate.center + gate.half);
      var thick = Math.max(8, 15 * s);
      var passed = gate.frontPassed && gate.rearPassed;
      var near = Math.abs(gate.y - game.distance) < 520;

      ctx.save();
      ctx.shadowColor = passed ? 'rgba(93,244,255,.25)' : 'rgba(255,123,200,.55)';
      ctx.shadowBlur = near && !passed ? 16 : 6;
      ctx.fillStyle = passed ? 'rgba(58,84,140,.42)' : 'rgba(58,84,140,.85)';
      ctx.fillRect(0, y - thick / 2, gl, thick);
      ctx.fillRect(gr, y - thick / 2, viewW - gr, thick);
      ctx.restore();

      if (!passed && near) {
        var pulse = 0.55 + Math.sin(time * 4 + i) * 0.2;
        ctx.strokeStyle = 'rgba(255,123,200,' + pulse.toFixed(2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gl, y - thick / 2);
        ctx.lineTo(gl, y + thick / 2);
        ctx.moveTo(gr, y - thick / 2);
        ctx.lineTo(gr, y + thick / 2);
        ctx.stroke();
      }
    }
  }

  function drawTwin(twin, label, time) {
    var x = sx(twin.x);
    var y = sy(twin.y);
    var r = Math.max(7, E.TWIN_R * scale());
    var echo = twin.lag > 0;

    ctx.save();
    ctx.shadowColor = twin.color;
    ctx.shadowBlur = echo ? 24 : 14;
    ctx.fillStyle = twin.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#06101f';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    if (echo) ctx.setLineDash([4, 4]);
    ctx.strokeStyle = twin.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + (echo ? 7 : 4), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    var bob = Math.sin(time * 3 + (label === 'FRONT' ? 0 : 1.6)) * 2;
    ctx.fillStyle = 'rgba(232,242,255,.82)';
    ctx.font = '800 ' + Math.max(9, 10 * scale()) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - r - 12 + bob);
  }

  function drawTwins(time) {
    var f = game.twins.front;
    var r = game.twins.rear;
    var fx = sx(f.x);
    var fy = sy(f.y);
    var rx = sx(r.x);
    var ry = sy(r.y);

    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(255,209,102,.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.restore();

    drawTwin(r, 'REAR', time);
    drawTwin(f, 'FRONT', time);
  }

  function drawEffects() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawClear(time) {
    if (game.phase !== 'clear' && flash <= 0) return;
    var alpha = game.phase === 'clear' ? Math.min(1, game.clearTimer) : flash;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = 'rgba(5,10,22,.55)';
    ctx.fillRect(0, viewH * 0.32, viewW, viewH * 0.22);
    ctx.fillStyle = '#5df4ff';
    ctx.textAlign = 'center';
    ctx.font = '900 ' + Math.max(28, 46 * scale()) + 'px system-ui, sans-serif';
    ctx.fillText('STAGE CLEAR', viewW / 2, viewH * 0.44);
    ctx.fillStyle = 'rgba(232,242,255,.75)';
    ctx.font = '700 ' + Math.max(10, 12 * scale()) + 'px system-ui, sans-serif';
    ctx.fillText('NEXT: FASTER / TIGHTER', viewW / 2, viewH * 0.48);
    ctx.restore();
  }

  function draw(time) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var ox = shake > 0 ? (Math.random() * 2 - 1) * shake * 6 : 0;
    var oy = shake > 0 ? (Math.random() * 2 - 1) * shake * 6 : 0;
    ctx.save();
    ctx.translate(ox, oy);
    drawBackground(time);
    drawGates(time);
    drawTwins(time);
    drawEffects();
    drawClear(time);
    ctx.restore();
  }

  function loop(now) {
    if (now == null) now = (window.performance ? window.performance.now() : Date.now());
    var dt = lastTs ? (now - lastTs) / 1000 : 0;
    lastTs = now;
    if (game.phase === 'playing' || game.phase === 'clear') E.update(game, Math.min(0.05, dt));
    processEvents();
    updateHud();
    syncScreens();
    updateEffects(Math.min(0.05, dt));
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
      leftHeld = true;
      recomputeDir();
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      if (event.preventDefault) event.preventDefault();
      rightHeld = true;
      recomputeDir();
    } else if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
      if (event.preventDefault) event.preventDefault();
      toggleSwap();
    }
  }

  function onKeyUp(event) {
    if (!event) return;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      leftHeld = false;
      recomputeDir();
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      rightHeld = false;
      recomputeDir();
    }
  }

  function bindHold(el, onDown, onUp) {
    if (!el || !el.addEventListener) return;
    el.addEventListener('pointerdown', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      onDown();
    });
    var up = function (event) {
      if (event && event.preventDefault) event.preventDefault();
      onUp();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  resize();
  if (window.addEventListener) {
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }
  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', begin);
  if (els.btnSwap) els.btnSwap.addEventListener('click', function (event) {
    if (event && event.preventDefault) event.preventDefault();
    toggleSwap();
  });
  bindHold(els.btnLeft, function () { leftHeld = true; recomputeDir(); }, function () { leftHeld = false; recomputeDir(); });
  bindHold(els.btnRight, function () { rightHeld = true; recomputeDir(); }, function () { rightHeld = false; recomputeDir(); });

  setText(els.bestStart, 'BEST ' + best);
  updateHud();

  window.__GAME__ = {
    id: 'twin',
    title: 'TWIN',
    start: begin,
    autoPlayStep: function () { E.autoStep(game); },
    isDone: function () { return game.phase === 'finished'; },
    getState: function () { return E.snapshot(game); }
  };

  if (window.requestAnimationFrame) window.requestAnimationFrame(loop);
})();
