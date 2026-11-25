/* game.js : STILL の描画・入力・起動（Canvas 2D） */
(function (root) {
  'use strict';

  var E = root.StillEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var game = E.createGame({ seed: 20261111 });
  var audio = root.StillAudio;

  var els = {};
  var best = 0;
  var seenEvents = 0;
  var lastNow = null;
  var endShown = false;
  var autoPlaying = false;
  var trail = [];

  var keys = {};
  var mouseDown = false;
  var mouseAim = false;
  var mouseWorld = { x: 480, y: 320 };
  var touchMove = { x: 0, y: 0 };
  var touchAim = false;
  var pointers = {};
  var movePointer = null;
  var aimPointer = null;

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function hide(el, on) { if (el) el.classList.toggle('is-hidden', !!on); }
  function text(el, v) { if (el) el.textContent = v == null ? '' : String(v); }
  function setClass(el, name, on) { if (el) el.classList.toggle(name, !!on); }

  function setupCanvas() {
    if (!canvas) return;
    var dpr = root.devicePixelRatio || 1;
    canvas.width = Math.round(E.W * dpr);
    canvas.height = Math.round(E.H * dpr);
    if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!ctx && canvas.getContext) ctx = canvas.getContext('2d');
  }

  function formatTime(sec) {
    var s = Math.max(0, Math.ceil(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : r);
  }

  function loadBest() {
    try {
      best = Number(root.localStorage && root.localStorage.getItem('still-best')) || 0;
    } catch (e) { best = 0; }
  }

  function saveBest(score) {
    if (!(score > best)) return false;
    best = score;
    try {
      if (root.localStorage) root.localStorage.setItem('still-best', String(best));
    } catch (e) { }
    return true;
  }

  function updateBestLabel() {
    text(els.bestLabel, best > 0 ? 'BEST ' + best : 'BEST ---');
    text(els.endBest, best > 0 ? 'BEST ' + best : 'BEST ---');
  }

  function begin() {
    game.start();
    seenEvents = 0;
    lastNow = null;
    endShown = false;
    autoPlaying = false;
    trail = [];
    show(els.startOverlay, false);
    show(els.endOverlay, false);
    if (audio) audio.start();
    updateBestLabel();
    updateHud(game.getState());
    setClass(els.flowBadge, 'is-stopped', true);
    setClass(els.flowBadge, 'is-flowing', false);
  }

  function backToTitle() {
    game.backToStart();
    endShown = false;
    trail = [];
    show(els.endOverlay, false);
    show(els.startOverlay, true);
    if (audio) audio.click();
    updateBestLabel();
  }

  function updateInput(s) {
    if (!s || s.phase !== 'playing') return;
    var kx = 0;
    var ky = 0;
    if (keys['a'] || keys['A'] || keys['ArrowLeft']) kx -= 1;
    if (keys['d'] || keys['D'] || keys['ArrowRight']) kx += 1;
    if (keys['w'] || keys['W'] || keys['ArrowUp']) ky -= 1;
    if (keys['s'] || keys['S'] || keys['ArrowDown']) ky += 1;

    var mx = kx + touchMove.x;
    var my = ky + touchMove.y;
    game.setMove(mx, my);

    if (!touchAim && mouseAim) {
      game.setAim(mouseWorld.x - s.player.x, mouseWorld.y - s.player.y);
    }
    game.setFiring(!!keys[' '] || mouseDown || touchAim);
  }

  function processEvents(s) {
    if (!audio || !s || !s.events) return;
    if (seenEvents > s.events.length) seenEvents = 0;
    for (var i = seenEvents; i < s.events.length; i++) {
      var ev = s.events[i];
      if (ev.type === 'shoot') audio.shoot();
      else if (ev.type === 'enemyShoot') audio.enemyShoot();
      else if (ev.type === 'kill') audio.kill();
      else if (ev.type === 'exitOpen') audio.exitOpen();
      else if (ev.type === 'roomClear') audio.roomClear();
      else if (ev.type === 'playerHit') audio.playerHit();
      else if (ev.type === 'finish') audio.finish(ev.reason);
    }
    seenEvents = s.events.length;
  }

  function updateHud(s) {
    if (!s) return;
    text(els.time, formatTime(s.timeLeft));
    text(els.score, s.score);
    text(els.room, s.roomNumber + '/' + s.roomCount);
    var flow = s.flow || 0;
    text(els.flowLabel, 'TIME FLOW ' + flow.toFixed(2));
    if (els.flowBar) els.flowBar.style.width = Math.round(flow * 100) + '%';
    setClass(els.flowBadge, 'is-flowing', flow > 0.35);
    setClass(els.flowBadge, 'is-stopped', flow <= 0.05);

    if (s.phase === 'roomclear') {
      text(els.roomBanner, 'ROOM CLEAR');
      if (els.roomBanner) els.roomBanner.style.opacity = '1';
    } else if (s.roomBanner > 0) {
      text(els.roomBanner, 'ROOM ' + s.roomNumber);
      var op = Math.min(1, s.roomBanner / 0.45);
      if (els.roomBanner) els.roomBanner.style.opacity = String(op);
    } else if (els.roomBanner) {
      els.roomBanner.style.opacity = '0';
    }
  }

  function syncOverlay(s) {
    if (!s) return;
    var ended = s.phase === 'over' || s.phase === 'victory';
    if (!ended || endShown || !s.result) return;
    endShown = true;
    var r = s.result;
    var newBest = saveBest(r.score);
    text(els.endRank, r.rank);
    text(els.endScore, r.score);
    text(els.endKills, r.kills);
    text(els.endRooms, r.roomsCleared + '/' + s.roomCount);
    text(els.endTime, r.timeLeft.toFixed(1));
    if (r.reason === 'victory') {
      text(els.endEyebrow, 'RUN COMPLETE');
      text(els.endTitle, 'ESCAPED');
      text(els.endSub, '3つの部屋を抜けた。止まる判断が刃になった。');
    } else if (r.reason === 'time') {
      text(els.endEyebrow, 'TIME UP');
      text(els.endTitle, 'OUT OF TIME');
      text(els.endSub, '60秒が尽きた。動く時間と止まる時間の配分を見直そう。');
    } else {
      text(els.endEyebrow, 'SIGNAL LOST');
      text(els.endTitle, 'HIT');
      text(els.endSub, '被弾した。弾が止まる瞬間を味方にしよう。');
    }
    text(els.endBest, newBest && best > 0 ? 'NEW BEST ' + best : (best > 0 ? 'BEST ' + best : 'BEST ---'));
    show(els.endOverlay, true);
    show(els.startOverlay, false);
  }

  function roundRectPath(c, x, y, w, h, r) {
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

  function drawWalls(s) {
    for (var i = 0; i < s.walls.length; i++) {
      var w = s.walls[i];
      if (w.w > 940 && w.h > 600) continue;
      roundRectPath(ctx, w.x, w.y, w.w, w.h, 7);
      ctx.fillStyle = '#101a2b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(92, 154, 200, 0.42)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = '#b9ecff';
      ctx.beginPath();
      ctx.moveTo(w.x + 4, w.y + 4);
      ctx.lineTo(w.x + w.w - 4, w.y + 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawExit(s, t) {
    var e = s.exit;
    var open = e.open;
    var color = open ? '#7ef0ff' : '#67506f';
    ctx.save();
    ctx.translate(e.x, e.y);
    var pulse = open ? 1 + Math.sin(t * 4) * 0.08 : 1;
    ctx.globalAlpha = open ? 0.95 : 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = open ? 20 : 6;
    ctx.save();
    ctx.rotate(t * (open ? 1.4 : 0.22));
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 1.35);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate(-t * (open ? 0.9 : 0.16));
    ctx.beginPath();
    ctx.arc(0, 0, 19 * pulse, 0.4, Math.PI * 1.8);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = open ? 0.9 : 0.4;
    ctx.fillStyle = color;
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(open ? 'EXIT' : 'LOCKED', e.x, e.y + 46);
    ctx.restore();
  }

  function drawEnemy(e, s, t) {
    if (!e.alive) return;
    var p = s.player;
    var ang = Math.atan2(p.y - e.y, p.x - e.x);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = e.color;
    ctx.fillStyle = 'rgba(24, 16, 34, 0.92)';
    ctx.lineWidth = 2;
    if (e.type === 'turret') {
      ctx.rotate(Math.sin(t * 0.6 + e.id) * 0.15);
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = (Math.PI * 2 / 6) * i + Math.PI / 6;
        var x = Math.cos(a) * e.r;
        var y = Math.sin(a) * e.r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-Math.sin(t * 0.6 + e.id) * 0.15);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * (e.r + 18), Math.sin(ang) * (e.r + 18));
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = 0.75;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fillStyle = e.color;
      ctx.fill();
    } else {
      ctx.rotate(e.angle);
      for (var b = 0; b < 3; b++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 / 3) * b);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(e.r + 14, 0);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      for (var k = 0; k < 3; k++) {
        var aa = (Math.PI * 2 / 3) * k - Math.PI / 2;
        var xx = Math.cos(aa) * e.r;
        var yy = Math.sin(aa) * e.r;
        if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(38, 20, 24, 0.94)';
      ctx.fill();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fillStyle = e.color;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(s, t) {
    var p = s.player;
    for (var i = 0; i < trail.length; i++) {
      var tr = trail[i];
      var a = (i / trail.length) * 0.32 * tr.life;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 7 * tr.life, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(126, 240, 255,' + a + ')';
      ctx.fill();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.shadowColor = '#7ef0ff';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12, 30, 44, 0.95)';
    ctx.fill();
    ctx.strokeStyle = '#7ef0ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, p.core, 0, Math.PI * 2);
    ctx.fillStyle = '#eaffff';
    ctx.fill();
    var ax = p.aimX;
    var ay = p.aimY;
    if (ax === 0 && ay === 0) { ax = 1; ay = 0; }
    ctx.beginPath();
    ctx.moveTo(ax * (p.r + 3), ay * (p.r + 3));
    ctx.lineTo(ax * (p.r + 34), ay * (p.r + 34));
    ctx.strokeStyle = 'rgba(126, 240, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax * (p.r + 36), ay * (p.r + 36), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#7ef0ff';
    ctx.fill();
    if (p.invuln > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 7 + Math.sin(t * 18) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(126, 240, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBullets(s) {
    for (var i = 0; i < s.bullets.length; i++) {
      var b = s.bullets[i];
      var tx = b.x - (b.vx || 0) * 0.016;
      var ty = b.y - (b.vy || 0) * 0.016;
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.friendly ? 12 : 9;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.friendly ? 3 : 2.4;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.friendly ? '#eaffff' : b.color;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(s) {
    for (var i = 0; i < s.particles.length; i++) {
      var p = s.particles[i];
      var a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.save();
      ctx.globalAlpha = a;
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = p.color;
      var sz = p.size * (0.5 + a * 0.7);
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      ctx.restore();
    }
  }

  function drawJoysticks() {
    var list = [movePointer, aimPointer];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = i === 0 ? '#7ef0ff' : '#ff9f6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.ox, p.oy, 38, 0, Math.PI * 2);
      ctx.stroke();
      var dx = p.x - p.ox;
      var dy = p.y - p.oy;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > 38) { dx = dx / len * 38; dy = dy / len * 38; }
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(p.ox + dx, p.oy + dy, 15, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#7ef0ff' : '#ff9f6b';
      ctx.fill();
      ctx.restore();
    }
  }

  function draw(s, t) {
    if (!ctx) return;
    ctx.clearRect(0, 0, E.W, E.H);
    var bg = ctx.createRadialGradient(E.W / 2, E.H * 0.46, 40, E.W / 2, E.H * 0.5, 640);
    bg.addColorStop(0, '#0c1626');
    bg.addColorStop(0.55, '#080f1c');
    bg.addColorStop(1, '#04070d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, E.W, E.H);

    ctx.save();
    var shake = s.shake || 0;
    if (shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    ctx.strokeStyle = 'rgba(70, 118, 160, 0.10)';
    ctx.lineWidth = 1;
    for (var x = 0; x <= E.W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, E.H); ctx.stroke();
    }
    for (var y = 0; y <= E.H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(E.W, y); ctx.stroke();
    }

    drawWalls(s);
    drawExit(s, t);
    for (var i = 0; i < s.enemies.length; i++) drawEnemy(s.enemies[i], s, t);
    drawParticles(s);
    drawBullets(s);
    drawPlayer(s, t);
    drawJoysticks();
    ctx.restore();

    if (s.flash > 0) {
      ctx.fillStyle = 'rgba(185, 240, 255,' + Math.min(0.5, s.flash * 0.5) + ')';
      ctx.fillRect(0, 0, E.W, E.H);
    }

    var vg = ctx.createRadialGradient(E.W / 2, E.H / 2, 180, E.W / 2, E.H / 2, 660);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, E.W, E.H);
  }

  function worldPoint(e) {
    if (!canvas || !canvas.getBoundingClientRect) return { x: 0, y: 0 };
    var rect = canvas.getBoundingClientRect();
    var w = rect.width || 960;
    var h = rect.height || 640;
    return {
      x: ((e.clientX - rect.left) / w) * E.W,
      y: ((e.clientY - rect.top) / h) * E.H
    };
  }

  function pointerDown(e) {
    if (!e || !canvas) return;
    if (e.preventDefault) e.preventDefault();
    var pt = worldPoint(e);
    if (e.pointerType === 'mouse' || !e.pointerType) {
      mouseDown = true;
      mouseAim = true;
      mouseWorld = pt;
      return;
    }
    var role = pt.x < E.W / 2 ? 'move' : 'aim';
    var p = { role: role, ox: pt.x, oy: pt.y, x: pt.x, y: pt.y };
    pointers[e.pointerId] = p;
    if (role === 'move') movePointer = p;
    else { aimPointer = p; touchAim = true; }
  }

  function pointerMove(e) {
    if (!e) return;
    var pt = worldPoint(e);
    if (e.pointerType === 'mouse' || !e.pointerType) {
      mouseWorld = pt;
      mouseAim = true;
      return;
    }
    var p = pointers[e.pointerId];
    if (!p) return;
    p.x = pt.x;
    p.y = pt.y;
    var dx = p.x - p.ox;
    var dy = p.y - p.oy;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (p.role === 'move') {
      if (len > 6) {
        var mag = Math.min(1, (len - 6) / 52);
        touchMove.x = (dx / len) * mag;
        touchMove.y = (dy / len) * mag;
      } else {
        touchMove.x = 0;
        touchMove.y = 0;
      }
    } else if (len > 8) {
      game.setAim(dx, dy);
    }
  }

  function pointerUp(e) {
    if (!e) return;
    if (e.pointerType === 'mouse' || !e.pointerType) {
      mouseDown = false;
      return;
    }
    var p = pointers[e.pointerId];
    if (!p) return;
    delete pointers[e.pointerId];
    if (p.role === 'move') {
      movePointer = null;
      touchMove.x = 0;
      touchMove.y = 0;
    } else {
      aimPointer = null;
      touchAim = false;
    }
  }

  function bindInput() {
    if (canvas && canvas.addEventListener) {
      canvas.addEventListener('pointerdown', pointerDown);
      canvas.addEventListener('pointermove', pointerMove);
      canvas.addEventListener('pointerup', pointerUp);
      canvas.addEventListener('pointercancel', pointerUp);
      canvas.addEventListener('pointerleave', function (e) {
        if (e && (e.pointerType === 'mouse' || !e.pointerType)) mouseDown = false;
      });
      canvas.addEventListener('contextmenu', function (e) { if (e && e.preventDefault) e.preventDefault(); });
    }
    if (root.addEventListener) {
      root.addEventListener('keydown', function (e) {
        if (!e) return;
        keys[e.key] = true;
        if (e.key === ' ' || e.code === 'Space') {
          if (e.preventDefault) e.preventDefault();
        }
      });
      root.addEventListener('keyup', function (e) {
        if (!e) return;
        keys[e.key] = false;
      });
      root.addEventListener('blur', function () {
        keys = {};
        mouseDown = false;
        touchMove.x = 0;
        touchMove.y = 0;
        touchAim = false;
        pointers = {};
        movePointer = null;
        aimPointer = null;
      });
      root.addEventListener('resize', setupCanvas);
    }
  }

  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    var before = game.getState();
    if (before.phase === 'playing' || before.phase === 'roomclear') {
      if (!autoPlaying) updateInput(before);
      game.update(dt);
    } else {
      game.update(dt);
    }
    var s = game.getState();

    if (s.phase === 'playing') {
      trail.push({ x: s.player.x, y: s.player.y, life: 1 });
      if (trail.length > 16) trail.shift();
    }
    for (var i = trail.length - 1; i >= 0; i--) {
      trail[i].life -= dt * 2.4;
      if (trail[i].life <= 0) trail.splice(i, 1);
    }

    processEvents(s);
    updateHud(s);
    syncOverlay(s);
    draw(s, now / 1000);
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  function init() {
    els = {
      canvas: canvas,
      time: $('time'),
      score: $('score'),
      room: $('room'),
      flowBadge: $('flow-badge'),
      flowLabel: $('flow-label'),
      flowBar: $('flow-bar'),
      roomBanner: $('room-banner'),
      startOverlay: $('start-overlay'),
      endOverlay: $('end-overlay'),
      btnStart: $('btn-start'),
      btnAgain: $('btn-again'),
      btnTitle: $('btn-title'),
      btnMute: $('btn-mute'),
      bestLabel: $('best-label'),
      endBest: $('end-best'),
      endEyebrow: $('end-eyebrow'),
      endRank: $('end-rank'),
      endTitle: $('end-title'),
      endSub: $('end-sub'),
      endScore: $('end-score'),
      endKills: $('end-kills'),
      endRooms: $('end-rooms'),
      endTime: $('end-time')
    };
    setupCanvas();
    bindInput();
    loadBest();
    updateBestLabel();

    game.start();
    game.backToStart();
    seenEvents = 0;
    updateHud(game.getState());
    draw(game.getState(), 0);

    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnAgain) els.btnAgain.addEventListener('click', begin);
    if (els.btnTitle) els.btnTitle.addEventListener('click', backToTitle);
    if (els.btnMute) els.btnMute.addEventListener('click', function () {
      if (!audio) return;
      var on = audio.toggleMute();
      text(els.btnMute, on ? 'SOUND ON' : 'SOUND OFF');
    });

    root.__GAME__ = {
      id: 'still',
      title: 'STILL',
      start: begin,
      autoPlayStep: function () { autoPlaying = true; game.autoStep(); },
      isDone: function () {
        var s = game.state;
        return s.phase === 'over' || s.phase === 'victory';
      },
      getState: function () { return game.getState(); }
    };

    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
