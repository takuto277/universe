/* game.js : AFTERIMAGE の描画・入力・起動（Canvas 2D） */
(function (root) {
  'use strict';

  var E = root.AfterimageEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var game = E.createGame({ seed: 20261111 });
  var audio = root.AfterimageAudio;

  var els = {};
  var best = 0;
  var seenEvents = 0;
  var lastNow = null;
  var autoPlaying = false;
  var endShown = false;
  var ghostTrail = [];
  var particles = [];
  var bannerTimer = 0;
  var bannerText = '';
  var keys = {};
  var touchMove = 0;
  var jumpHeld = false;

  var stars = [];
  (function buildStars() {
    var s = 987654321;
    function rnd() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    }
    for (var i = 0; i < 150; i++) {
      stars.push({
        x: rnd() * E.W,
        y: rnd() * 900,
        size: 0.6 + rnd() * 1.9,
        a: 0.18 + rnd() * 0.55,
        depth: 0.15 + rnd() * 0.55,
        phase: rnd() * Math.PI * 2
      });
    }
  })();

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function text(el, v) { if (el) el.textContent = v == null ? '' : String(v); }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rgba(r, g, b, a) { return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + (a == null ? 1 : a) + ')'; }
  function sy(worldY, cam) { return E.H - (worldY - cam); }

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
    try { best = Number(root.localStorage && root.localStorage.getItem('afterimage-best')) || 0; } catch (e) { best = 0; }
  }

  function saveBest(heightM) {
    if (!(heightM > best)) return false;
    best = heightM;
    try { if (root.localStorage) root.localStorage.setItem('afterimage-best', String(best)); } catch (e) { }
    return true;
  }

  function updateBestLabels(current) {
    var shown = Math.max(best, current || 0);
    text(els.best, shown + 'm');
    text(els.bestLabel, best > 0 ? 'BEST ' + best + 'm' : 'BEST ---');
    text(els.endBest, best > 0 ? 'BEST ' + best + 'm' : 'BEST ---');
  }

  function begin() {
    game.start();
    seenEvents = 0;
    lastNow = null;
    autoPlaying = false;
    endShown = false;
    ghostTrail = [];
    particles = [];
    bannerTimer = 0;
    bannerText = '';
    touchMove = 0;
    jumpHeld = false;
    keys = {};
    show(els.startOverlay, false);
    show(els.endOverlay, false);
    if (audio) audio.start();
    updateBestLabels(0);
    updateHud(game.getState());
  }

  function backToTitle() {
    game.backToStart();
    endShown = false;
    ghostTrail = [];
    particles = [];
    bannerTimer = 0;
    show(els.endOverlay, false);
    show(els.startOverlay, true);
    if (audio) audio.click();
    updateBestLabels(0);
  }

  function addParticles(x, y, color, count, speed) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = speed * (0.3 + Math.random() * 0.8);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.5,
        maxLife: 0.8,
        size: 1 + Math.random() * 2.6,
        color: color
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function processEvents(s) {
    if (!audio || !s || !s.events) return;
    if (seenEvents > s.events.length) seenEvents = 0;
    for (var i = seenEvents; i < s.events.length; i++) {
      var ev = s.events[i];
      if (ev.type === 'jump') audio.jump(ev.fromTrail);
      else if (ev.type === 'land') audio.land();
      else if (ev.type === 'solidify') audio.solidify();
      else if (ev.type === 'shatter') audio.shatter();
      else if (ev.type === 'checkpoint') {
        audio.checkpoint();
        bannerText = 'CHECKPOINT';
        bannerTimer = 1.7;
      } else if (ev.type === 'fall') {
        audio.fall();
        bannerText = 'FALL';
        bannerTimer = 1.2;
      } else if (ev.type === 'finish') {
        audio.finish(ev.reason);
      }
    }
    seenEvents = s.events.length;
  }

  function updateHud(s) {
    if (!s) return;
    text(els.height, s.heightM + 'm');
    text(els.lives, s.lives);
    text(els.time, formatTime(s.timeLeft));
    updateBestLabels(s.heightM);
    var pct = clamp(s.heightM / s.goalM, 0, 1) * 100;
    if (els.altitudeBar) els.altitudeBar.style.width = pct.toFixed(1) + '%';
    text(els.altitudeLabel, s.heightM + ' / ' + s.goalM + 'm');
    if (els.banner) {
      els.banner.textContent = bannerText;
      els.banner.style.opacity = bannerTimer > 0 ? String(clamp(bannerTimer / 0.4, 0, 1)) : '0';
    }
  }

  function syncOverlay(s) {
    if (!s) return;
    var ended = s.phase === 'over' || s.phase === 'victory';
    if (!ended || endShown || !s.result) return;
    endShown = true;
    var r = s.result;
    var newBest = saveBest(r.heightM);
    text(els.endRank, r.rank);
    text(els.endHeight, r.heightM + 'm');
    text(els.endCheckpoints, r.checkpoints);
    text(els.endTime, r.timeLeft.toFixed(1));
    text(els.endScore, r.score);
    if (r.reason === 'victory') {
      text(els.endEyebrow, 'SUMMIT REACHED');
      text(els.endTitle, '500m');
      text(els.endSub, '頂上に到達した。残像の階段が実を結んだ。');
    } else if (r.reason === 'fall') {
      text(els.endEyebrow, 'NO LIVES');
      text(els.endTitle, 'FALL');
      text(els.endSub, '3回落ちた。頂点の残像に戻る動きを磨こう。');
    } else {
      text(els.endEyebrow, 'TIME UP');
      text(els.endTitle, 'ASCENT ENDS');
      text(els.endSub, '60秒が尽きた。もう一段、上を目指そう。');
    }
    text(els.endBest, newBest && best > 0 ? 'NEW BEST ' + best + 'm' : (best > 0 ? 'BEST ' + best + 'm' : 'BEST ---'));
    show(els.endOverlay, true);
    show(els.startOverlay, false);
  }

  function updateInput() {
    if (autoPlaying) return;
    var mx = 0;
    if (keys['a'] || keys['A'] || keys['ArrowLeft']) mx -= 1;
    if (keys['d'] || keys['D'] || keys['ArrowRight']) mx += 1;
    mx += touchMove;
    game.setMove(clamp(mx, -1, 1));
  }

  function roundRectPath(c, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
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

  function drawBackground(s, t) {
    var progress = clamp(s.cameraY / E.GOAL_Y, 0, 1);
    var top = rgba(lerp(20, 82, progress), lerp(22, 38, progress), lerp(48, 92, progress));
    var bottom = rgba(lerp(4, 20, progress), lerp(7, 10, progress), lerp(14, 30, progress));
    var g = ctx.createLinearGradient(0, 0, 0, E.H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, E.W, E.H);

    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var yy = ((st.y - s.cameraY * st.depth) % 760 + 760) % 760;
      if (yy > E.H) continue;
      var alpha = st.a * (0.65 + 0.35 * Math.sin(t * 1.7 + st.phase));
      ctx.fillStyle = rgba(210, 235, 255, alpha);
      ctx.fillRect(st.x, yy, st.size, st.size);
    }

    var towerAlpha = 0.05 + progress * 0.04;
    ctx.strokeStyle = rgba(120, 170, 220, towerAlpha);
    ctx.lineWidth = 2;
    for (var k = 0; k < 7; k++) {
      var bx = 90 + k * 140;
      var off = ((s.cameraY * (0.12 + k * 0.015)) % 260);
      for (var n = -1; n < 3; n++) {
        var y0 = n * 260 + off;
        ctx.beginPath();
        ctx.moveTo(bx, y0);
        ctx.lineTo(bx, y0 + 120);
        ctx.stroke();
      }
    }
  }

  function drawBeacon(pl, s, t) {
    if (!pl.beacon) return;
    var y = sy(pl.y, s.cameraY);
    if (y < -160 || y > E.H + 60) return;
    var cx = pl.x + pl.w / 2;
    var color = pl.checked ? '#7ef0ff' : '#f4c96b';
    var pulse = 0.5 + 0.5 * Math.sin(t * 4 + pl.beaconId);
    ctx.save();
    ctx.globalAlpha = (pl.checked ? 0.2 : 0.32) + pulse * 0.12;
    var beam = ctx.createLinearGradient(cx, y - 150, cx, y);
    beam.addColorStop(0, 'rgba(244,201,107,0)');
    beam.addColorStop(1, color);
    ctx.fillStyle = beam;
    ctx.fillRect(cx - 12, y - 150, 24, 150);
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, y - 146, 8 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, y - 146, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawPlatforms(s) {
    for (var i = 0; i < s.platforms.length; i++) {
      var pl = s.platforms[i];
      var y = sy(pl.y, s.cameraY);
      if (y < -50 || y > E.H + 50) continue;
      if (pl.kind === 'trail') {
        var a = clamp(pl.life / pl.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.25 + a * 0.65;
        ctx.shadowColor = '#b9a7ff';
        ctx.shadowBlur = 14;
        roundRectPath(ctx, pl.x, y - 3, pl.w, 8, 4);
        ctx.fillStyle = 'rgba(185, 167, 255, 0.26)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(205, 190, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      } else if (pl.kind === 'goal') {
        ctx.save();
        ctx.shadowColor = '#f4c96b';
        ctx.shadowBlur = 26;
        roundRectPath(ctx, pl.x, y - 4, pl.w, 12, 5);
        ctx.fillStyle = 'rgba(244, 201, 107, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#f4c96b';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#f4c96b';
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SUMMIT', pl.x + pl.w / 2, y - 16);
        ctx.restore();
      } else {
        roundRectPath(ctx, pl.x, y - 3, pl.w, 10, 5);
        ctx.fillStyle = '#101b2f';
        ctx.fill();
        ctx.strokeStyle = pl.beacon ? 'rgba(244, 201, 107, 0.6)' : 'rgba(110, 166, 210, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = '#d7f4ff';
        ctx.beginPath();
        ctx.moveTo(pl.x + 5, y - 1);
        ctx.lineTo(pl.x + pl.w - 5, y - 1);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (var b = 0; b < s.platforms.length; b++) {
      if (s.platforms[b].beacon) drawBeacon(s.platforms[b], s, s.worldTime);
    }
  }

  function drawPending(s, t) {
    for (var i = 0; i < s.pendingTrails.length; i++) {
      var pt = s.pendingTrails[i];
      var y = sy(pt.y, s.cameraY);
      if (y < -40 || y > E.H + 40) continue;
      var prog = clamp(1 - (pt.at - s.worldTime) / 0.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.35 + prog * 0.5;
      ctx.strokeStyle = '#b9a7ff';
      ctx.shadowColor = '#b9a7ff';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, y, 5 + prog * 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawArc(s) {
    var arc = s.jumpArc;
    if (!arc || arc.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(185, 167, 255, 0.38)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#b9a7ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (var i = 0; i < arc.length; i++) {
      var x = arc[i].x;
      var y = sy(arc[i].y, s.cameraY);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(s, t) {
    var p = s.player;
    var x = p.x;
    var y = sy(p.y, s.cameraY) - p.r;
    for (var i = 0; i < ghostTrail.length; i++) {
      var g = ghostTrail[i];
      ctx.beginPath();
      ctx.arc(g.x, sy(g.y, s.cameraY) - p.r, 7 * g.life, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(185, 167, 255,' + (0.20 * g.life) + ')';
      ctx.fill();
    }
    var blink = p.invuln > 0 && Math.floor(t * 18) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.translate(x, y);
    ctx.shadowColor = p.fromTrail ? '#b9a7ff' : '#7ef0ff';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 22, 40, 0.95)';
    ctx.fill();
    ctx.strokeStyle = p.fromTrail ? '#b9a7ff' : '#7ef0ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    var dir = p.vx >= 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(dir * 2, -8);
    ctx.lineTo(dir * 10, 0);
    ctx.lineTo(dir * 2, 8);
    ctx.strokeStyle = p.fromTrail ? 'rgba(185,167,255,0.7)' : 'rgba(126,240,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(s) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      var sz = p.size * (0.4 + a * 0.8);
      ctx.fillRect(p.x - sz / 2, sy(p.y, s.cameraY) - sz / 2, sz, sz);
      ctx.restore();
    }
  }

  function draw(s, t) {
    if (!ctx) return;
    ctx.clearRect(0, 0, E.W, E.H);
    drawBackground(s, t);

    ctx.save();
    var sh = s.shake || 0;
    if (sh > 0.2) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    drawArc(s);
    drawPlatforms(s);
    drawPending(s, t);
    drawParticles(s);
    drawPlayer(s, t);
    ctx.restore();

    if (s.flash > 0) {
      ctx.fillStyle = 'rgba(200, 190, 255,' + Math.min(0.5, s.flash * 0.5) + ')';
      ctx.fillRect(0, 0, E.W, E.H);
    }

    var vg = ctx.createRadialGradient(E.W / 2, E.H / 2, 190, E.W / 2, E.H / 2, 660);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, E.W, E.H);
  }

  function bindInput() {
    if (root.addEventListener) {
      root.addEventListener('keydown', function (e) {
        if (!e) return;
        keys[e.key] = true;
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          if (e.preventDefault) e.preventDefault();
          if (!e.repeat && !jumpHeld) {
            jumpHeld = true;
            if (!autoPlaying) game.pressJump();
          }
        }
        if ((e.key === 'm' || e.key === 'M') && audio) {
          var on = audio.toggleMute();
          text(els.btnMute, on ? 'SOUND ON' : 'SOUND OFF');
        }
      });
      root.addEventListener('keyup', function (e) {
        if (!e) return;
        keys[e.key] = false;
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          if (jumpHeld) {
            jumpHeld = false;
            if (!autoPlaying) game.releaseJump();
          }
        }
      });
      root.addEventListener('blur', function () {
        keys = {};
        touchMove = 0;
        jumpHeld = false;
      });
      root.addEventListener('resize', setupCanvas);
    }

    function bindHold(el, onDown, onUp) {
      if (!el || !el.addEventListener) return;
      el.addEventListener('pointerdown', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        onDown();
      });
      el.addEventListener('pointerup', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        onUp();
      });
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('pointerleave', onUp);
    }

    bindHold(els.touchLeft, function () { touchMove = -1; }, function () { if (touchMove < 0) touchMove = 0; });
    bindHold(els.touchRight, function () { touchMove = 1; }, function () { if (touchMove > 0) touchMove = 0; });
    bindHold(els.touchJump, function () {
      if (autoPlaying) return;
      game.pressJump();
    }, function () {
      if (autoPlaying) return;
      game.releaseJump();
    });
  }

  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    var before = game.getState();
    if (before.phase === 'playing') {
      updateInput();
      game.update(dt);
    } else {
      game.update(dt);
    }
    var s = game.getState();

    if (s.phase === 'playing') {
      ghostTrail.push({ x: s.player.x, y: s.player.y, life: 1 });
      if (ghostTrail.length > 18) ghostTrail.shift();
    }
    for (var i = ghostTrail.length - 1; i >= 0; i--) {
      ghostTrail[i].life -= dt * 2.4;
      if (ghostTrail[i].life <= 0) ghostTrail.splice(i, 1);
    }
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(j, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    bannerTimer = Math.max(0, bannerTimer - dt);

    processEvents(s);
    updateHud(s);
    syncOverlay(s);
    draw(s, now / 1000);
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  function init() {
    els = {
      height: $('height'),
      best: $('best'),
      lives: $('lives'),
      time: $('time'),
      altitudeBar: $('altitude-bar'),
      altitudeLabel: $('altitude-label'),
      banner: $('banner'),
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
      endHeight: $('end-height'),
      endCheckpoints: $('end-checkpoints'),
      endTime: $('end-time'),
      endScore: $('end-score'),
      touchLeft: $('touch-left'),
      touchRight: $('touch-right'),
      touchJump: $('touch-jump')
    };
    setupCanvas();
    loadBest();
    updateBestLabels(0);
    bindInput();

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
      id: 'afterimage',
      title: 'AFTERIMAGE',
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
