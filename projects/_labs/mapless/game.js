/* game.js : MAPLESS の描画・入力・画面遷移 */
(function (root) {
  'use strict';

  var E = root.MaplessEngine;
  if (!E) return;
  var A = root.MaplessAudio;

  var W = 1000;
  var H = 680;
  var state = E.createGame();
  var canvas = document.getElementById('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var dpr = Math.max(1, Math.min(3, root.devicePixelRatio || 1));

  var els = {};
  var board = { x: 0, y: 0, w: 0, h: 0, tile: 40, cols: 13, rows: 9 };
  var visual = { x: 1, y: 1, ix: 1, iy: 1 };
  var lastDir = { x: 0, y: 1 };
  var held = null;
  var moveCooldown = 0;
  var drawing = null;
  var penMode = true;
  var coarse = false;
  var particles = [];
  var motes = [];
  var seenEvents = 0;
  var endShown = false;
  var floorShownFor = -1;
  var best = 0;
  var lastNow = null;
  var running = false;
  var animTime = 0;
  var shake = 0;
  var blink = 0;
  var blinkTimer = 2.4;
  var toastText = '';
  var toastUntil = 0;
  var toastDanger = false;
  var lastDrawSound = 0;
  var loopHandle = null;

  function $(id) { return document.getElementById(id); }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function setClass(el, name, on) { if (el) el.classList.toggle(name, !!on); }

  function nowMs() {
    if (root.performance && root.performance.now) return root.performance.now();
    return Date.now();
  }

  function fmtTime(sec) {
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : r);
  }

  function fmtNum(n) {
    var s = String(Math.round(n));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var pos = s.length - i;
      out += s.charAt(i);
      if (pos > 1 && (pos - 1) % 3 === 0) out += ',';
    }
    return out;
  }

  function loadBest() {
    try {
      best = Number(root.localStorage && root.localStorage.getItem('mapless-best')) || 0;
    } catch (e) { best = 0; }
  }

  function saveBest(score) {
    if (!(score > best)) return false;
    best = score;
    try {
      if (root.localStorage) root.localStorage.setItem('mapless-best', String(best));
    } catch (e) { }
    return true;
  }

  function updateBestLabel() {
    var label = best > 0 ? 'BEST ' + fmtNum(best) : 'BEST ---';
    text(els.bestStart, label);
    text(els.endBest, label);
  }

  function updateSoundLabel() {
    if (!A || !els.btnSound) return;
    text(els.btnSound, A.isEnabled() ? 'SOUND ON' : 'SOUND OFF');
  }

  function showToast(message, danger, ms) {
    toastText = message;
    toastDanger = !!danger;
    toastUntil = animTime + (ms || 1400) / 1000;
  }

  function cellCenter(x, y) {
    return {
      x: board.x + (x + 0.5) * board.tile,
      y: board.y + (y + 0.5) * board.tile
    };
  }

  function computeBoard() {
    var cols = state.cols || 13;
    var rows = state.rows || 9;
    var pad = 52;
    var tile = Math.min((W - pad * 2) / cols, (H - pad * 2) / rows);
    var w = cols * tile;
    var h = rows * tile;
    board = {
      x: (W - w) / 2,
      y: (H - h) / 2,
      w: w,
      h: h,
      tile: tile,
      cols: cols,
      rows: rows
    };
  }

  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }

  function spawnBurst(x, y, count, palette, speed) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = (0.3 + Math.random()) * (speed || 90);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 30,
        life: 0.5 + Math.random() * 0.6,
        max: 1.1,
        size: 1.5 + Math.random() * 2.6,
        color: palette[(Math.random() * palette.length) | 0]
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function initMotes() {
    motes = [];
    for (var i = 0; i < 22; i++) {
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 5,
        size: 0.7 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function doMove(dirName) {
    if (state.phase !== 'playing') return;
    var d = E.MOVE[dirName];
    if (!d) return;
    if (E.move(state, d.x, d.y)) {
      lastDir = d;
    }
  }

  function beginMove(dirName) {
    if (state.phase !== 'playing') return;
    held = dirName;
    moveCooldown = 0.12;
    doMove(dirName);
  }

  function endMove(dirName) {
    if (held === dirName) held = null;
  }

  function updateHeld(dt) {
    if (!held || state.phase !== 'playing') {
      moveCooldown = 0;
      return;
    }
    moveCooldown -= dt;
    if (moveCooldown <= 0) {
      doMove(held);
      moveCooldown = 0.115;
    }
  }

  function updateVisual(dt) {
    var tx = state.player.x;
    var ty = state.player.y;
    if (Math.abs(tx - visual.ix) > 2 || Math.abs(ty - visual.iy) > 2) {
      visual.x = tx;
      visual.y = ty;
      visual.ix = tx;
      visual.iy = ty;
    } else {
      visual.ix = tx;
      visual.iy = ty;
      var k = Math.min(1, dt * 18);
      visual.x += (tx - visual.x) * k;
      visual.y += (ty - visual.y) * k;
      if (Math.abs(tx - visual.x) < 0.004) visual.x = tx;
      if (Math.abs(ty - visual.y) < 0.004) visual.y = ty;
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.vx *= 0.99;
    }
    for (var m = 0; m < motes.length; m++) {
      var mote = motes[m];
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      if (mote.x < 0) mote.x = W;
      if (mote.x > W) mote.x = 0;
      if (mote.y < 0) mote.y = H;
      if (mote.y > H) mote.y = 0;
    }
    shake = Math.max(0, shake - dt * 22);
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      blink = 0.14;
      blinkTimer = 2.2 + Math.random() * 3.4;
    }
    if (blink > 0) blink = Math.max(0, blink - dt);
  }

  function consumeEvents() {
    if (!state.events) return;
    while (seenEvents < state.events.length) {
      var ev = state.events[seenEvents++];
      if (ev.type === 'move') {
        if (A) A.step();
      } else if (ev.type === 'bump') {
        if (A) A.bump();
        shake = Math.max(shake, 2.4);
      } else if (ev.type === 'bottle') {
        if (A) A.bottle();
        var bc = cellCenter(ev.x, ev.y);
        spawnBurst(bc.x, bc.y, 18, ['#5fe0cf', '#bafff6', '#eaa24d'], 120);
        showToast('INK +' + E.BOTTLE_INK, false, 1200);
      } else if (ev.type === 'inkEmpty') {
        if (A) A.inkEmpty();
        showToast('INK EMPTY', true, 2200);
      } else if (ev.type === 'floorClear') {
        if (A) A.floorClear();
        held = null;
        drawing = null;
        var ec = cellCenter(state.exit.x, state.exit.y);
        spawnBurst(ec.x, ec.y, 30, ['#ffd28a', '#eaa24d', '#fff1d4'], 150);
        shake = 3;
      } else if (ev.type === 'nextFloor') {
        if (A) A.click();
        visual.x = state.player.x;
        visual.y = state.player.y;
        visual.ix = state.player.x;
        visual.iy = state.player.y;
        particles = [];
        initMotes();
        showToast(state.floorName, false, 1800);
      } else if (ev.type === 'gameClear') {
        if (A) A.gameClear();
        held = null;
        drawing = null;
      }
    }
  }

  // ---------- render ----------

  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0d12');
    g.addColorStop(0.55, '#0c0f14');
    g.addColorStop(1, '#120e0a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var r = ctx.createRadialGradient(W * 0.5, H * 0.62, 40, W * 0.5, H * 0.62, W * 0.7);
    r.addColorStop(0, 'rgba(234,162,77,0.05)');
    r.addColorStop(1, 'rgba(234,162,77,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }

  function paperSpeckles() {
    var seed = (state.floorIndex + 1) * 9187 + (state.seed || 0);
    var n = 0;
    function rnd() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    for (var i = 0; i < 190; i++) {
      var x = board.x + rnd() * board.w;
      var y = board.y + rnd() * board.h;
      var a = 0.018 + rnd() * 0.05;
      var s = 0.6 + rnd() * 1.6;
      ctx.fillStyle = 'rgba(70,48,28,' + a + ')';
      ctx.fillRect(x, y, s, s);
      n++;
    }
    ctx.strokeStyle = 'rgba(70,48,28,0.035)';
    ctx.lineWidth = 1;
    for (var j = 0; j < 9; j++) {
      var yy = board.y + rnd() * board.h;
      ctx.beginPath();
      ctx.moveTo(board.x + rnd() * board.w * 0.3, yy);
      ctx.lineTo(board.x + board.w * (0.4 + rnd() * 0.6), yy + (rnd() - 0.5) * 6);
      ctx.stroke();
    }
    return n;
  }

  function drawPaper() {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 16;
    roundRect(ctx, board.x - 10, board.y - 10, board.w + 20, board.h + 20, 6);
    ctx.fillStyle = '#d9c7a2';
    ctx.fill();
    ctx.restore();

    var g = ctx.createLinearGradient(board.x, board.y, board.x + board.w, board.y + board.h);
    g.addColorStop(0, '#efe2c6');
    g.addColorStop(0.5, '#e7d7b6');
    g.addColorStop(1, '#d8c39c');
    roundRect(ctx, board.x, board.y, board.w, board.h, 3);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,36,22,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,44,28,0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, board.x + 6, board.y + 6, board.w - 12, board.h - 12, 2);
    ctx.stroke();

    paperSpeckles();
  }

  function drawMaze() {
    var tile = board.tile;
    var cols = state.cols;
    var rows = state.rows;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var cx = board.x + x * tile;
        var cy = board.y + y * tile;
        if (state.grid[y] && state.grid[y][x] === 1) {
          var g = ctx.createLinearGradient(cx, cy, cx, cy + tile);
          g.addColorStop(0, '#312a23');
          g.addColorStop(1, '#211c17');
          roundRect(ctx, cx + 1.2, cy + 1.2, tile - 2.4, tile - 2.4, Math.max(2, tile * 0.14));
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,232,190,0.045)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(90,64,36,0.05)';
          ctx.fillRect(cx + tile / 2 - 0.8, cy + tile / 2 - 0.8, 1.6, 1.6);
        }
      }
    }
  }

  function drawExitAndBottles() {
    var tile = board.tile;
    var ex = board.x + (state.exit.x + 0.5) * tile;
    var ey = board.y + (state.exit.y + 0.5) * tile;

    ctx.save();
    var glow = ctx.createRadialGradient(ex, ey, 2, ex, ey, tile * 1.5);
    glow.addColorStop(0, 'rgba(255,210,138,0.55)');
    glow.addColorStop(0.5, 'rgba(234,162,77,0.18)');
    glow.addColorStop(1, 'rgba(234,162,77,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(ex - tile * 1.6, ey - tile * 1.6, tile * 3.2, tile * 3.2);

    ctx.strokeStyle = 'rgba(60,40,20,0.65)';
    ctx.lineWidth = 2;
    roundRect(ctx, ex - tile * 0.32, ey - tile * 0.36, tile * 0.64, tile * 0.72, tile * 0.16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,214,138,0.75)';
    ctx.fill();
    ctx.fillStyle = 'rgba(120,70,24,0.6)';
    for (var s = 0; s < 3; s++) {
      ctx.fillRect(ex - tile * 0.2, ey - tile * 0.16 + s * tile * 0.16, tile * 0.4, 1.5);
    }
    ctx.restore();

    for (var i = 0; i < state.bottles.length; i++) {
      var b = state.bottles[i];
      if (b.collected) continue;
      var bx = board.x + (b.x + 0.5) * tile;
      var by = board.y + (b.y + 0.5) * tile;
      ctx.save();
      var bg = ctx.createRadialGradient(bx, by, 1, bx, by, tile * 0.85);
      bg.addColorStop(0, 'rgba(95,224,207,0.5)');
      bg.addColorStop(1, 'rgba(95,224,207,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(bx - tile, by - tile, tile * 2, tile * 2);
      ctx.fillStyle = '#2b8f85';
      roundRect(ctx, bx - tile * 0.15, by - tile * 0.08, tile * 0.3, tile * 0.34, tile * 0.08);
      ctx.fill();
      ctx.fillStyle = '#bafff6';
      ctx.fillRect(bx - tile * 0.12, by - tile * 0.04, tile * 0.24, tile * 0.06);
      ctx.fillStyle = '#8a6a3f';
      ctx.fillRect(bx - tile * 0.08, by - tile * 0.2, tile * 0.16, tile * 0.1);
      ctx.restore();
    }
  }

  function drawDarkness() {
    var p = cellCenter(visual.x, visual.y);
    var r = (state.floorDef ? state.floorDef.vision : 3) * board.tile;
    var g = ctx.createRadialGradient(p.x, p.y, r * 0.16, p.x, p.y, r);
    g.addColorStop(0, 'rgba(8,10,14,0)');
    g.addColorStop(0.5, 'rgba(8,10,14,0.06)');
    g.addColorStop(0.72, 'rgba(8,10,14,0.55)');
    g.addColorStop(0.88, 'rgba(8,10,14,0.9)');
    g.addColorStop(1, 'rgba(8,10,14,0.985)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var warm = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, r * 1.2);
    warm.addColorStop(0, 'rgba(255,186,98,0.10)');
    warm.addColorStop(0.55, 'rgba(255,170,80,0.04)');
    warm.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, H);
  }

  function drawMud() {
    var cw = board.w / 44;
    var ch = board.h / 34;
    var keys = state.mudCells ? Object.keys(state.mudCells) : [];
    for (var i = 0; i < keys.length; i++) {
      var parts = keys[i].split(',');
      var gx = Number(parts[0]);
      var gy = Number(parts[1]);
      var v = state.mudCells[keys[i]];
      if (!(v > 0)) continue;
      var cx = board.x + (gx + 0.5) * cw;
      var cy = board.y + (gy + 0.5) * ch;
      var rad = Math.max(cw, ch) * 1.5;
      var g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rad);
      var a = Math.min(0.42, v * 0.2);
      g.addColorStop(0, 'rgba(74,48,28,' + a + ')');
      g.addColorStop(1, 'rgba(74,48,28,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  }

  function drawPath(points, current) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = current ? 'rgba(255,244,214,0.98)' : 'rgba(255,224,166,0.88)';
    ctx.lineWidth = current ? 3 : 2.2;
    ctx.shadowColor = 'rgba(255,190,100,0.45)';
    ctx.shadowBlur = current ? 9 : 6;
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
      var x = board.x + points[i].x * board.w;
      var y = board.y + points[i].y * board.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawStrokes() {
    for (var i = 0; i < state.strokes.length; i++) {
      drawPath(state.strokes[i].points, false);
    }
    if (state.currentStroke) drawPath(state.currentStroke.points, true);
  }

  function drawPlayer() {
    var p = cellCenter(visual.x, visual.y);
    var bob = Math.sin(animTime * 3.4) * 1.4;
    var y = p.y + bob;
    var face = lastDir;

    var glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, board.tile * 1.15);
    glow.addColorStop(0, 'rgba(255,206,128,0.28)');
    glow.addColorStop(0.5, 'rgba(255,186,98,0.10)');
    glow.addColorStop(1, 'rgba(255,186,98,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - board.tile * 1.2, p.y - board.tile * 1.2, board.tile * 2.4, board.tile * 2.4);

    ctx.save();
    ctx.translate(p.x, y);
    var s = board.tile / 44;
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 17, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2e5e5a';
    ctx.beginPath();
    ctx.moveTo(-9, 16);
    ctx.quadraticCurveTo(-12, -2, 0, -10);
    ctx.quadraticCurveTo(12, -2, 9, 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3c7a72';
    ctx.beginPath();
    ctx.moveTo(-7, 6);
    ctx.quadraticCurveTo(-10, -4, 0, -9);
    ctx.quadraticCurveTo(10, -4, 7, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f0cf9c';
    ctx.beginPath();
    ctx.arc(0, -5, 6.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#241f1a';
    if (blink > 0.02) {
      ctx.fillRect(-3.6, -6, 2.4, 0.9);
      ctx.fillRect(1.2, -6, 2.4, 0.9);
    } else {
      ctx.beginPath();
      ctx.arc(-2.4, -6, 1.15, 0, Math.PI * 2);
      ctx.arc(2.4, -6, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    var lx = face.x * 9 + 7;
    var ly = face.y * 5 + 2;
    ctx.fillStyle = 'rgba(255,205,120,0.95)';
    ctx.beginPath();
    ctx.arc(lx, ly, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,44,28,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lx, ly, 4.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#8a6a3f';
    ctx.fillRect(lx - 0.7, ly - 7.5, 1.4, 3.6);

    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawMotes() {
    var p = cellCenter(visual.x, visual.y);
    var r = (state.floorDef ? state.floorDef.vision : 3) * board.tile;
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var dx = m.x - p.x;
      var dy = m.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var a = Math.max(0, 1 - d / (r * 1.1)) * (0.16 + Math.sin(animTime * 1.3 + m.phase) * 0.06);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffe2b0';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSignalRing() {
    if (state.exitDistance == null || state.exitDistance > 12) return;
    var p = cellCenter(visual.x, visual.y);
    var t = animTime * (1.2 + (12 - state.exitDistance) * 0.12);
    var r = 18 + (t % 1) * 26;
    var a = (1 - (t % 1)) * Math.min(0.35, (12 - state.exitDistance) * 0.04);
    if (a <= 0) return;
    ctx.strokeStyle = 'rgba(234,162,77,' + a + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function render() {
    if (!ctx) return;
    computeBoard();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var sx = 0;
    var sy = 0;
    if (shake > 0.01) {
      sx = (Math.random() - 0.5) * shake * 2.2;
      sy = (Math.random() - 0.5) * shake * 2.2;
    }
    ctx.save();
    ctx.translate(sx, sy);

    drawBackground();
    drawPaper();
    drawMaze();
    drawExitAndBottles();
    drawSignalRing();
    drawDarkness();
    drawMud();
    drawStrokes();
    drawPlayer();
    drawParticles();
    drawMotes();

    ctx.restore();

    updateHud();
    updateOverlays();
  }

  // ---------- HUD / overlays ----------

  function updateHud() {
    var s = E.snapshot(state);
    text(els.floor, (s.floorIndex + 1) + '/' + s.floorCount);
    text(els.time, fmtTime(s.time));
    text(els.score, fmtNum(s.totalScore));
    text(els.bottles, s.bottlesCollected + '/' + s.bottles.length);
    text(els.floorName, s.floorName);
    text(els.floorSub, s.floorSub);

    var inkPct = s.maxInk > 0 ? (s.ink / s.maxInk) * 100 : 0;
    if (els.inkBar) els.inkBar.style.width = Math.max(0, Math.min(100, inkPct)) + '%';
    setClass(els.inkBar, 'is-low', s.ink < 20);
    text(els.inkVal, Math.round(s.ink));
    var clarity = Math.max(0, Math.min(100, 100 - s.mud));
    if (els.clarityBar) els.clarityBar.style.width = clarity + '%';
    setClass(els.clarityBar, 'is-low', clarity < 45);
    text(els.clarityVal, Math.round(clarity));

    var strength = Math.max(0, Math.min(1, 1 - (s.exitDistance - 2) / 14));
    var pips = Math.ceil(strength * 5);
    if (els.pips) {
      for (var i = 0; i < els.pips.length; i++) {
        setClass(els.pips[i], 'on', i < pips);
      }
    }
    setClass(els.signal, 'near', pips >= 4);

    var toast = '';
    var danger = false;
    if (animTime < toastUntil) {
      toast = toastText;
      danger = toastDanger;
    } else if (s.ink <= 0) {
      toast = 'INK EMPTY';
      danger = true;
    } else if (s.ink < 18) {
      toast = 'INK LOW';
      danger = true;
    } else if (clarity < 40) {
      toast = 'MAP MUDDY';
      danger = true;
    } else if (pips >= 5) {
      toast = 'EXIT NEAR';
    }
    text(els.toast, toast);
    show(els.toast, !!toast);
    setClass(els.toast, 'is-danger', danger);

    if (els.btnPen) {
      text(els.btnPen, penMode ? 'PEN ON' : 'PEN OFF');
      setClass(els.btnPen, 'is-on', penMode);
    }
  }

  function populateFloorOverlay(entry) {
    if (!entry) return;
    text(els.floorClearTitle, entry.name);
    text(els.floorClearSub, state.floorSub);
    text(els.fcTime, fmtTime(entry.time));
    text(els.fcInk, Math.round(entry.ink));
    text(els.fcBottles, entry.bottles + '/' + entry.bottlesTotal);
    text(els.fcClarity, Math.round(Math.max(0, 100 - entry.mud)));
    text(els.fcTimeBonus, '+' + fmtNum(entry.timeBonus));
    text(els.fcInkBonus, '+' + fmtNum(entry.inkBonus));
    text(els.fcBottleBonus, '+' + fmtNum(entry.bottleBonus));
    text(els.fcMudPenalty, '-' + fmtNum(entry.mudPenalty));
    text(els.fcScore, fmtNum(entry.score));
    var last = state.floorIndex + 1 >= state.floorCount;
    text(els.btnNext, last ? 'FINISH' : 'NEXT FLOOR');
  }

  function populateEndOverlay(result) {
    text(els.endRank, result.rank);
    setClass(els.endRank, 'rank-s', result.rank === 'S');
    setClass(els.endRank, 'rank-a', result.rank === 'A');
    setClass(els.endRank, 'rank-b', result.rank === 'B');
    setClass(els.endRank, 'rank-c', result.rank === 'C');
    setClass(els.endRank, 'rank-d', result.rank === 'D');
    text(els.endTitle, 'THE MAP IS YOURS');
    text(els.endSub, '3つの階を抜けた。あなたの描いた地図が、ここに残る。');
    text(els.endScore, fmtNum(result.score));
    if (els.endFloors) {
      els.endFloors.textContent = '';
      for (var i = 0; i < result.floors.length; i++) {
        var f = result.floors[i];
        var row = document.createElement('div');
        row.className = 'end-floor-row';
        var a = document.createElement('span');
        a.textContent = (i + 1) + '. ' + f.name;
        var b = document.createElement('span');
        b.textContent = fmtTime(f.time);
        var c = document.createElement('span');
        c.textContent = fmtNum(f.score);
        row.appendChild(a);
        row.appendChild(b);
        row.appendChild(c);
        els.endFloors.appendChild(row);
      }
    }
    if (saveBest(result.score)) updateBestLabel();
    text(els.endBest, best > 0 ? 'BEST ' + fmtNum(best) : 'BEST ---');
  }

  function updateOverlays() {
    if (state.phase === 'floorClear') {
      var entry = state.floorScores[state.floorScores.length - 1];
      if (floorShownFor !== state.floorScores.length) {
        populateFloorOverlay(entry);
        floorShownFor = state.floorScores.length;
        show(els.floorOverlay, true);
      }
    } else {
      show(els.floorOverlay, false);
    }

    if (state.phase === 'over') {
      if (!endShown && state.result) {
        endShown = true;
        populateEndOverlay(state.result);
        show(els.endOverlay, true);
      }
    } else {
      show(els.endOverlay, false);
    }
  }

  // ---------- loop / lifecycle ----------

  function loop(now) {
    if (!running) return;
    var t = (now == null) ? nowMs() : now;
    if (lastNow == null) lastNow = t;
    var dt = Math.max(0, Math.min(0.05, (t - lastNow) / 1000));
    lastNow = t;
    animTime += dt;

    E.update(state, dt);
    updateHeld(dt);
    updateVisual(dt);
    updateParticles(dt);
    consumeEvents();
    render();

    if (state.phase === 'over') {
      running = false;
      return;
    }
    loopHandle = root.requestAnimationFrame(loop);
  }

  function begin() {
    E.start(state);
    seenEvents = 0;
    endShown = false;
    floorShownFor = -1;
    particles = [];
    initMotes();
    shake = 0;
    animTime = 0;
    held = null;
    drawing = null;
    lastDir = { x: 0, y: 1 };
    visual.x = state.player.x;
    visual.y = state.player.y;
    visual.ix = state.player.x;
    visual.iy = state.player.y;
    show(els.startOverlay, false);
    show(els.floorOverlay, false);
    show(els.endOverlay, false);
    computeBoard();
    if (A) A.start();
    render();
    if (!running) {
      running = true;
      lastNow = null;
      loopHandle = root.requestAnimationFrame(loop);
    }
  }

  function backToTitle() {
    show(els.endOverlay, false);
    show(els.floorOverlay, false);
    show(els.startOverlay, true);
    updateBestLabel();
    if (A) A.click();
  }

  function nextFloorClick() {
    if (state.phase !== 'floorClear') return;
    E.nextFloor(state);
    show(els.floorOverlay, false);
    render();
  }

  function autoPlayStep() {
    if (!state) return;
    if (state.phase === 'playing' || state.phase === 'floorClear') {
      E.autoStep(state);
      render();
    }
  }

  // ---------- input ----------

  function toMap(clientX, clientY) {
    if (!canvas || !canvas.getBoundingClientRect) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    var x = (clientX - rect.left) * (W / rect.width);
    var y = (clientY - rect.top) * (H / rect.height);
    var nx = (x - board.x) / board.w;
    var ny = (y - board.y) / board.h;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    return { x: nx, y: ny };
  }

  function onPointerDown(e) {
    if (state.phase !== 'playing' || drawing !== null) return;
    if (e.pointerType && e.pointerType !== 'mouse' && !penMode) return;
    var p = toMap(e.clientX, e.clientY);
    if (!p) return;
    if (E.beginStroke(state, p.x, p.y)) {
      drawing = e.pointerId == null ? 1 : e.pointerId;
      if (canvas.setPointerCapture && e.pointerId != null) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
      }
      if (e.preventDefault) e.preventDefault();
      lastDrawSound = 0;
    }
  }

  function onPointerMove(e) {
    if (drawing === null || e.pointerId !== drawing) return;
    var p = toMap(e.clientX, e.clientY);
    if (p) {
      E.addStrokePoint(state, p.x, p.y);
      if (A) {
        var t = nowMs();
        if (t - lastDrawSound > 60) {
          A.draw();
          lastDrawSound = t;
        }
      }
    }
    if (e.preventDefault) e.preventDefault();
  }

  function onPointerUp(e) {
    if (drawing === null || (e.pointerId != null && e.pointerId !== drawing)) return;
    E.endStroke(state);
    if (canvas.releasePointerCapture && e.pointerId != null) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
    }
    drawing = null;
  }

  function keyToDir(key) {
    if (key === 'ArrowUp' || key === 'w' || key === 'W') return 'up';
    if (key === 'ArrowDown' || key === 's' || key === 'S') return 'down';
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') return 'left';
    if (key === 'ArrowRight' || key === 'd' || key === 'D') return 'right';
    return null;
  }

  function togglePen() {
    penMode = !penMode;
    updateHud();
    if (A) A.click();
  }

  function init() {
    els = {
      startOverlay: $('start-overlay'),
      floorOverlay: $('floor-overlay'),
      endOverlay: $('end-overlay'),
      btnStart: $('btn-start'),
      btnAgain: $('btn-again'),
      btnTitle: $('btn-title'),
      btnNext: $('btn-next'),
      btnSound: $('btn-sound'),
      btnPen: $('btn-pen'),
      floor: $('floor'),
      time: $('time'),
      score: $('score'),
      bottles: $('bottles'),
      floorName: $('floor-name'),
      floorSub: $('floor-sub'),
      signal: $('signal'),
      pips: document.querySelectorAll ? document.querySelectorAll('#signal .pips i') : [],
      toast: $('toast'),
      inkBar: $('ink-bar'),
      inkVal: $('ink-val'),
      clarityBar: $('clarity-bar'),
      clarityVal: $('clarity-val'),
      hint: $('hint'),
      bestStart: $('best-start'),
      endBest: $('end-best'),
      floorClearTitle: $('floor-clear-title'),
      floorClearSub: $('floor-clear-sub'),
      fcTime: $('fc-time'),
      fcInk: $('fc-ink'),
      fcBottles: $('fc-bottles'),
      fcClarity: $('fc-clarity'),
      fcTimeBonus: $('fc-time-bonus'),
      fcInkBonus: $('fc-ink-bonus'),
      fcBottleBonus: $('fc-bottle-bonus'),
      fcMudPenalty: $('fc-mud-penalty'),
      fcScore: $('fc-score'),
      endRank: $('end-rank'),
      endTitle: $('end-title'),
      endSub: $('end-sub'),
      endScore: $('end-score'),
      endFloors: $('end-floors'),
      dpad: $('dpad')
    };
    if (els.pips && els.pips.length) {
      els.pips = Array.prototype.slice.call(els.pips);
    }

    if (canvas) {
      if (canvas.width !== W * dpr) canvas.width = Math.round(W * dpr);
      if (canvas.height !== H * dpr) canvas.height = Math.round(H * dpr);
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      canvas.addEventListener('pointerleave', function (e) {
        if (drawing !== null && e.pointerType !== 'mouse') onPointerUp(e);
      });
      canvas.addEventListener('contextmenu', function (e) { if (e.preventDefault) e.preventDefault(); });
    }

    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnAgain) els.btnAgain.addEventListener('click', begin);
    if (els.btnTitle) els.btnTitle.addEventListener('click', backToTitle);
    if (els.btnNext) els.btnNext.addEventListener('click', nextFloorClick);
    if (els.btnPen) els.btnPen.addEventListener('click', togglePen);
    if (els.btnSound) {
      els.btnSound.addEventListener('click', function () {
        if (!A) return;
        A.toggleMute();
        updateSoundLabel();
      });
    }

    if (els.dpad) {
      var buttons = els.dpad.querySelectorAll ? els.dpad.querySelectorAll('button[data-dir]') : [];
      for (var i = 0; i < buttons.length; i++) {
        (function (btn) {
          var dir = btn.getAttribute('data-dir');
          btn.addEventListener('pointerdown', function (e) {
            if (e.preventDefault) e.preventDefault();
            btn.classList.add('is-held');
            if (btn.setPointerCapture && e.pointerId != null) {
              try { btn.setPointerCapture(e.pointerId); } catch (err) { }
            }
            beginMove(dir);
          });
          function release(e) {
            btn.classList.remove('is-held');
            endMove(dir);
            if (e && e.preventDefault) e.preventDefault();
          }
          btn.addEventListener('pointerup', release);
          btn.addEventListener('pointercancel', release);
          btn.addEventListener('pointerleave', function (e) {
            if (e.pointerType !== 'mouse') release(e);
          });
        })(buttons[i]);
      }
    }

    root.addEventListener('keydown', function (e) {
      if (!e) return;
      var dir = keyToDir(e.key);
      if (dir) {
        if (e.preventDefault) e.preventDefault();
        if (state.phase === 'playing') {
          if (held !== dir) {
            held = dir;
            moveCooldown = 0.12;
            doMove(dir);
          }
        }
        return;
      }
      if (state.phase === 'idle') {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.preventDefault) e.preventDefault();
          begin();
        }
      } else if (state.phase === 'floorClear') {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.preventDefault) e.preventDefault();
          nextFloorClick();
        }
      } else if (state.phase === 'over') {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.preventDefault) e.preventDefault();
          begin();
        }
      }
    });
    root.addEventListener('keyup', function (e) {
      if (!e) return;
      var dir = keyToDir(e.key);
      if (dir) endMove(dir);
    });

    coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches) || !!(root.innerWidth && root.innerWidth <= 760);
    penMode = !coarse;
    loadBest();
    updateBestLabel();
    updateSoundLabel();
    if (els.hint) {
      els.hint.textContent = coarse
        ? 'D-pad / キーで移動　PEN ONでドラッグ描画'
        : 'WASD / 矢印で移動　ドラッグで地図を描く';
    }
    if (els.btnPen) {
      els.btnPen.style.display = coarse ? '' : 'none';
    }
    updateHud();
    render();

    root.__GAME__ = {
      id: 'mapless',
      title: 'MAPLESS',
      start: function () { begin(); },
      autoPlayStep: autoPlayStep,
      isDone: function () { return !!(state && state.phase === 'over'); },
      getState: function () { return E.snapshot(state); }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
