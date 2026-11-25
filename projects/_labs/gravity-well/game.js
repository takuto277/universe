/* game.js : GRAVITY WELL の描画・入力・画面遷移・自動プレイAI */
(function (root) {
  'use strict';

  var E = root.GravityWellEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var audio = root.GravityWellAudio;

  function seedFromUrl() {
    try {
      var query = (typeof location !== 'undefined' && location.search) ? location.search : '';
      var match = /[?&]seed=(\d+)/.exec(query);
      if (match) return parseInt(match[1], 10) >>> 0;
    } catch (e) { }
    return ((typeof Date !== 'undefined' && Date.now ? Date.now() : 1) ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
  }

  var game = E.createGame({ seed: seedFromUrl() });

  var els = {
    hud: document.getElementById('hud'),
    touch: document.getElementById('touch'),
    start: document.getElementById('start-overlay'),
    end: document.getElementById('end-overlay'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    time: document.getElementById('time'),
    lines: document.getElementById('lines'),
    combo: document.getElementById('combo-label'),
    queue: document.getElementById('queue-label'),
    endScore: document.getElementById('end-score'),
    endReason: document.getElementById('end-reason'),
    endMeta: document.getElementById('end-meta'),
    endBest: document.getElementById('end-best'),
    endEyebrow: document.getElementById('end-eyebrow'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    btnSound: document.getElementById('btn-sound'),
    btnEndMute: document.getElementById('btn-end-mute'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
    btnDown: document.getElementById('btn-down'),
    btnDrop: document.getElementById('btn-drop'),
    btnCcw: document.getElementById('btn-ccw'),
    btnCw: document.getElementById('btn-cw')
  };

  var best = 0;
  try {
    if (root.localStorage) best = Number(root.localStorage.getItem('gravitywell-best')) || 0;
  } catch (e) { }

  var view = { w: 900, h: 620, dpr: 1 };
  var layout = null;
  var particles = [];
  var shake = 0;
  var lastNow = null;
  var lastDraw = 0;
  var prev = { phase: 'start', lockId: 0, rotActive: false };
  var ai = { pieceId: -1, rotations: 0, plan: null };

  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function hide(el, on) { if (el) el.classList.toggle('is-hidden', !!on); }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }

  function colorFor(value) {
    var type = E.TYPE_BY_VALUE[value];
    return (type && E.COLORS[type]) || '#dbe4ff';
  }

  function resize() {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = canvas.clientWidth || root.innerWidth || 900;
    var h = canvas.clientHeight || root.innerHeight || 620;
    view.w = w;
    view.h = h;
    view.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    layout = computeLayout();
  }

  function computeLayout() {
    var size = Math.min(view.w * 0.7, view.h * 0.78);
    size = Math.max(180, size);
    return {
      size: size,
      cell: size / E.COLS,
      bx: (view.w - size) / 2,
      by: (view.h - size) / 2 + Math.min(26, view.h * 0.03)
    };
  }

  function soundLabels() {
    var on = audio ? audio.isEnabled() : true;
    var label = on ? 'SOUND ON' : 'SOUND OFF';
    text(els.btnMute, label);
    text(els.btnSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
    text(els.btnEndMute, 'SOUND: ' + (on ? 'ON' : 'OFF'));
  }

  function roundRectPath(c, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  }

  function spawnParticles(rows) {
    if (!layout) return;
    var colors = [E.COLORS.I, E.COLORS.O, E.COLORS.T, E.COLORS.S, E.COLORS.Z, E.COLORS.J, E.COLORS.L];
    for (var r = 0; r < rows.length; r++) {
      var cy = layout.by + rows[r] * layout.cell + layout.cell / 2;
      for (var i = 0; i < 18; i++) {
        particles.push({
          x: layout.bx + Math.random() * layout.size,
          y: cy + (Math.random() - 0.5) * layout.cell,
          vx: (Math.random() - 0.5) * 260,
          vy: (Math.random() - 0.5) * 220 - 60,
          life: 0.5 + Math.random() * 0.55,
          max: 1.05,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 2 + Math.random() * 4
        });
      }
    }
  }

  function spawnRotationSparks() {
    if (!layout) return;
    var cx = layout.bx + layout.size / 2;
    var cy = layout.by + layout.size / 2;
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * Math.PI * 2;
      var speed = 60 + Math.random() * 160;
      particles.push({
        x: cx + Math.cos(a) * layout.size * 0.42,
        y: cy + Math.sin(a) * layout.size * 0.42,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.3 + Math.random() * 0.3,
        max: 0.6,
        color: Math.random() < 0.5 ? E.COLORS.I : E.COLORS.T,
        size: 1.5 + Math.random() * 3
      });
    }
  }

  function updateEffects(dt) {
    var i;
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.vx *= 0.985;
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 46);
  }

  function updateHud(state) {
    if (state.score > best) best = state.score;
    text(els.score, state.score);
    text(els.best, best);
    text(els.time, Math.ceil(state.timeLeft));
    text(els.lines, state.lines);
    text(els.combo, 'COMBO ' + state.combo);
    if (els.combo) els.combo.classList.toggle('hot', state.combo > 1);
    var q = state.queue.slice(0, 4);
    text(els.queue, 'NEXT · ' + (q.length ? q.join(' · ') : '—'));
    els.time.classList.toggle('danger', state.timeLeft <= 15);
  }

  function saveBest() {
    try {
      if (root.localStorage && best > 0) root.localStorage.setItem('gravitywell-best', String(best));
    } catch (e) { }
  }

  function showEnd(state) {
    if (state.score > best) best = state.score;
    saveBest();
    var win = state.phase === 'victory';
    text(els.endEyebrow, win ? 'TIME UP · WELL HELD' : 'WELL COLLAPSED');
    text(els.endScore, state.score);
    text(els.endReason, win ? 'You kept the gravity well spinning for 120 seconds.' : 'The stack reached the top of the well.');
    text(els.endMeta, state.lines + ' LINES · ' + state.rotations + ' ROTATIONS · BEST ' + best);
    text(els.endBest, 'BEST ' + best);
    show(els.end, true);
    show(els.start, false);
    hide(els.hud, true);
    hide(els.touch, true);
  }

  function refresh(state) {
    updateHud(state);

    if (state.rotation.active && !prev.rotActive) {
      if (audio) audio.rotate();
      spawnRotationSparks();
      shake = Math.max(shake, 5);
    }
    prev.rotActive = state.rotation.active;

    if (state.lastLock.id !== prev.lockId) {
      prev.lockId = state.lastLock.id;
      if (state.lastLock.count > 0) {
        if (audio) audio.clear(state.lastLock.count);
        spawnParticles(state.lastLock.rows);
        shake = Math.max(shake, 6 + state.lastLock.count * 3);
      } else {
        if (audio) audio.lock();
        shake = Math.max(shake, 2.5);
      }
    }

    if (state.phase !== prev.phase) {
      prev.phase = state.phase;
      if (state.phase === 'over' || state.phase === 'victory') {
        if (audio) { if (state.phase === 'victory') audio.win(); else audio.over(); }
        showEnd(state);
      }
    }
  }

  function begin() {
    game.start();
    ai.pieceId = -1;
    ai.rotations = 0;
    ai.plan = null;
    particles = [];
    shake = 0;
    prev = { phase: 'playing', lockId: 0, rotActive: false };
    if (audio) { audio.start(); soundLabels(); }
    show(els.start, false);
    show(els.end, false);
    hide(els.hud, false);
    hide(els.touch, false);
    refresh(game.getState());
  }

  /* ---------- AI: 入力だけを行う（updateは呼ばない） ---------- */
  function bestPlacement(grid, cells, value) {
    var minDx = Infinity, maxDx = -Infinity;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] < minDx) minDx = cells[i][0];
      if (cells[i][0] > maxDx) maxDx = cells[i][0];
    }
    var bestRes = null;
    for (var x = -minDx; x <= E.COLS - 1 - maxDx; x++) {
      var res = E.simulatePlacement(grid, cells, x, 0, value);
      if (!res) continue;
      var score = res.cleared * 140 + E.evaluateGrid(res.grid);
      if (!bestRes || score > bestRes.score) {
        bestRes = { x: x, score: score, cleared: res.cleared };
      }
    }
    return bestRes;
  }

  function planFor(state) {
    var a = state.active;
    var current = bestPlacement(state.grid, a.cells, a.value);
    var choice = current ? { x: current.x, score: current.score } : { x: a.x, score: -1e9 };

    if (ai.rotations < 2) {
      for (var dir = -1; dir <= 1; dir += 2) {
        var rot = E.previewRotation(state.grid, a.cells, a.x, a.y, dir);
        if (!rot) continue;
        var rotated = bestPlacement(rot.grid, rot.cells, a.value);
        if (rotated && rotated.score > choice.score + 6) {
          choice = { rotate: dir, score: rotated.score };
        }
      }
    }
    return choice;
  }

  function aiStep() {
    var state = game.getState();
    if (state.phase !== 'playing' || state.rotation.active || !state.active) return;

    if (state.active.id !== ai.pieceId) {
      ai.pieceId = state.active.id;
      ai.rotations = 0;
      ai.plan = null;
    }
    if (!ai.plan) ai.plan = planFor(state);

    var plan = ai.plan;
    if (plan.rotate) {
      if (game.rotateBoard(plan.rotate)) ai.rotations += 1;
      ai.plan = null;
      refresh(game.getState());
      return;
    }

    var a = state.active;
    var moved;
    if (a.x < plan.x) {
      moved = game.moveRight();
    } else if (a.x > plan.x) {
      moved = game.moveLeft();
    } else {
      if (audio && audio.drop) audio.drop();
      game.hardDrop();
      ai.plan = null;
      refresh(game.getState());
      return;
    }
    if (!moved) {
      if (audio && audio.drop) audio.drop();
      game.hardDrop();
      ai.plan = null;
    }
    refresh(game.getState());
  }

  /* ---------- 描画 ---------- */
  function drawBackground(t) {
    if (!ctx) return;
    var g = ctx.createRadialGradient(view.w / 2, view.h * 0.32, 40, view.w / 2, view.h * 0.45, Math.max(view.w, view.h) * 0.8);
    g.addColorStop(0, '#101a38');
    g.addColorStop(0.55, '#080c1c');
    g.addColorStop(1, '#04060e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#4d6cff';
    for (var i = 0; i < 26; i++) {
      var x = ((i * 137.5) % view.w + t * (6 + (i % 5))) % view.w;
      var y = ((i * 83.3) % view.h + Math.sin(t * 0.4 + i) * 6 + view.h) % view.h;
      ctx.fillRect(x, y, 1.3, 1.3);
    }
    ctx.restore();
  }

  function drawPanel() {
    var L = layout;
    ctx.save();
    ctx.shadowColor = 'rgba(70, 130, 255, 0.5)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = 'rgba(7, 11, 24, 0.86)';
    roundRectPath(ctx, L.bx, L.by, L.size, L.size, 16);
    ctx.fill();
    ctx.restore();

    var grad = ctx.createLinearGradient(L.bx, L.by, L.bx + L.size, L.by + L.size);
    grad.addColorStop(0, 'rgba(89, 230, 255, 0.22)');
    grad.addColorStop(0.5, 'rgba(120, 130, 255, 0.10)');
    grad.addColorStop(1, 'rgba(192, 123, 255, 0.22)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    roundRectPath(ctx, L.bx, L.by, L.size, L.size, 16);
    ctx.stroke();
  }

  function drawGridLines() {
    var L = layout;
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 150, 230, 0.11)';
    ctx.lineWidth = 1;
    for (var i = 1; i < E.COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(L.bx + i * L.cell, L.by);
      ctx.lineTo(L.bx + i * L.cell, L.by + L.size);
      ctx.stroke();
    }
    for (var j = 1; j < E.ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(L.bx, L.by + j * L.cell);
      ctx.lineTo(L.bx + L.size, L.by + j * L.cell);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBlock(px, py, color, alpha, glow) {
    var L = layout;
    var pad = Math.max(1, L.cell * 0.045);
    var size = L.cell - pad * 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = L.cell * 0.42; }
    roundRectPath(ctx, px + pad, py + pad, size, size, Math.max(2, L.cell * 0.16));
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, px + pad + size * 0.16, py + pad + size * 0.13, size * 0.42, size * 0.13, 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStack(state) {
    var L = layout;
    for (var y = 0; y < E.ROWS; y++) {
      for (var x = 0; x < E.COLS; x++) {
        var v = state.grid[y][x];
        if (v) drawBlock(L.bx + x * L.cell, L.by + y * L.cell, colorFor(v), 1, false);
      }
    }
  }

  function drawGhost(state) {
    if (!state.active) return;
    var L = layout;
    var a = state.active;
    var color = colorFor(a.value);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    for (var i = 0; i < a.cells.length; i++) {
      var px = L.bx + (a.x + a.cells[i][0]) * L.cell;
      var py = L.by + (a.ghostY + a.cells[i][1]) * L.cell;
      var pad = Math.max(2, L.cell * 0.09);
      roundRectPath(ctx, px + pad, py + pad, L.cell - pad * 2, L.cell - pad * 2, Math.max(2, L.cell * 0.14));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawActive(state, t) {
    if (!state.active) return;
    var L = layout;
    var a = state.active;
    var color = colorFor(a.value);
    var pulse = 0.82 + 0.18 * Math.sin(t * 6);
    for (var i = 0; i < a.cells.length; i++) {
      var px = L.bx + (a.x + a.cells[i][0]) * L.cell;
      var py = L.by + (a.y + a.cells[i][1]) * L.cell;
      drawBlock(px, py, color, pulse, true);
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var alpha = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  function drawRotationHint(state) {
    if (!state.rotation.active) return;
    var L = layout;
    var p = state.rotation.progress;
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.5;
    ctx.strokeStyle = state.rotation.dir > 0 ? E.COLORS.I : E.COLORS.T;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(L.bx + L.size / 2, L.by + L.size / 2, L.size * 0.58 + p * 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function draw(state, t) {
    if (!ctx || !layout) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    drawBackground(t);

    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
    }
    drawPanel();

    var L = layout;
    ctx.save();
    roundRectPath(ctx, L.bx, L.by, L.size, L.size, 16);
    ctx.clip();

    if (state.rotation && state.rotation.active) {
      var cx = L.bx + L.size / 2;
      var cy = L.by + L.size / 2;
      var progress = state.rotation.progress;
      var angle = -state.rotation.dir * (1 - progress) * Math.PI / 2;
      var zoom = 1 - 0.16 * Math.sin(Math.PI * progress);
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.scale(zoom, zoom);
      ctx.translate(-cx, -cy);
    }

    drawGridLines();
    drawStack(state);
    drawGhost(state);
    drawActive(state, t);
    ctx.restore();

    drawRotationHint(state);
    ctx.restore();

    drawParticles();
  }

  /* ---------- 入力 ---------- */
  function doMoveLeft() { if (game.moveLeft()) { if (audio && audio.move) audio.move(); refresh(game.getState()); } }
  function doMoveRight() { if (game.moveRight()) { if (audio && audio.move) audio.move(); refresh(game.getState()); } }
  function doSoftDrop() { if (game.softDrop()) { if (audio && audio.move) audio.move(); refresh(game.getState()); } }
  function doHardDrop() {
    if (audio && audio.drop) audio.drop();
    if (game.hardDrop()) refresh(game.getState());
  }
  function doRotate(dir) {
    if (game.rotateBoard(dir)) refresh(game.getState());
  }

  function bindButton(el, fn) {
    if (!el || !el.addEventListener) return;
    el.addEventListener('click', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      fn();
    });
  }

  bindButton(els.btnStart, begin);
  bindButton(els.btnRetry, begin);
  bindButton(els.btnLeft, doMoveLeft);
  bindButton(els.btnRight, doMoveRight);
  bindButton(els.btnDown, doSoftDrop);
  bindButton(els.btnDrop, doHardDrop);
  bindButton(els.btnCcw, function () { doRotate(-1); });
  bindButton(els.btnCw, function () { doRotate(1); });

  function bindMute(el) {
    bindButton(el, function () {
      if (audio) audio.toggleMute();
      soundLabels();
    });
  }
  bindMute(els.btnMute);
  bindMute(els.btnSound);
  bindMute(els.btnEndMute);

  if (root.addEventListener) {
    root.addEventListener('keydown', function (event) {
      if (!event) return;
      var code = event.code || '';
      var key = event.key || '';
      var state = game.state;

      if (state.phase === 'start' || state.phase === 'over' || state.phase === 'victory') {
        if (code === 'Enter' || code === 'Space' || key === ' ' || key === 'Enter') {
          if (event.preventDefault) event.preventDefault();
          if (!event.repeat) begin();
        }
        return;
      }

      var handled = true;
      if (code === 'ArrowLeft' || key === 'a' || key === 'A') doMoveLeft();
      else if (code === 'ArrowRight' || key === 'd' || key === 'D') doMoveRight();
      else if (code === 'ArrowDown' || key === 's' || key === 'S') doSoftDrop();
      else if (code === 'Space' || key === ' ') { if (!event.repeat) doHardDrop(); }
      else if (code === 'KeyQ' || key === 'q' || key === 'Q') { if (!event.repeat) doRotate(-1); }
      else if (code === 'KeyE' || key === 'e' || key === 'E') { if (!event.repeat) doRotate(1); }
      else handled = false;

      if (handled && event.preventDefault) event.preventDefault();
    });
    root.addEventListener('resize', function () {
      resize();
    });
  }

  /* ---------- 起動 ---------- */
  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
    lastNow = now;
    if (game.state.phase === 'playing') game.update(dt);
    updateEffects(dt);
    var state = game.getState();
    refresh(state);
    draw(state, now / 1000);
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  root.__GAME__ = {
    id: 'gravity-well',
    title: 'GRAVITY WELL',
    start: begin,
    autoPlayStep: aiStep,
    isDone: function () { return game.state.phase === 'over' || game.state.phase === 'victory'; },
    getState: function () { return game.getState(); }
  };

  resize();
  soundLabels();
  show(els.start, true);
  show(els.end, false);
  hide(els.hud, true);
  hide(els.touch, true);
  draw(game.getState(), 0);
  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
