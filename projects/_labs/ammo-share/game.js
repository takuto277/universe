/* game.js : AMMO SHARE（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.AmmoShareEngine) ? window.AmmoShareEngine : null;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var game = E.createGame();

  var els = {
    time: document.getElementById('time'),
    score: document.getElementById('score'),
    debt: document.getElementById('debt'),
    accuracy: document.getElementById('accuracy'),
    purge: document.getElementById('purge'),
    hint: document.getElementById('hint'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultTitle: document.getElementById('result-title'),
    resultSub: document.getElementById('result-sub'),
    resultScore: document.getElementById('result-score'),
    resultKills: document.getElementById('result-kills'),
    resultAccuracy: document.getElementById('result-accuracy'),
    resultRank: document.getElementById('result-rank'),
    resultBest: document.getElementById('result-best'),
    bestStart: document.getElementById('best-start'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
    btnFire: document.getElementById('btn-fire'),
    btnPurge: document.getElementById('btn-purge')
  };

  var best = 0;
  try { best = Number(window.localStorage && window.localStorage.getItem('ammo-share-best')) || 0; } catch (e) { best = 0; }

  var dpr = 1;
  var viewW = 480;
  var viewH = 800;
  var scale = 1;
  var ox = 0;
  var oy = 0;
  var lastTs = 0;
  var seenEvents = 0;
  var overShown = false;
  var leftHeld = false;
  var rightHeld = false;
  var fireHeld = false;
  var shake = 0;
  var flash = 0;
  var purging = 0;
  var particles = [];

  function show(el, on) { if (el && el.classList) el.classList.toggle('visible', !!on); }
  function setText(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function saveBest(value) {
    try { if (window.localStorage) window.localStorage.setItem('ammo-share-best', String(value)); } catch (e) { }
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
    scale = Math.min(viewW / E.W, viewH / E.H);
    ox = (viewW - E.W * scale) / 2;
    oy = (viewH - E.H * scale) / 2;
  }

  function sx(x) { return ox + x * scale; }
  function sy(y) { return oy + y * scale; }

  function burst(x, y, color, count, spread) {
    var px = sx(x);
    var py = sy(y);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (50 + Math.random() * 170) * (spread || 1);
      particles.push({
        x: px,
        y: py,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.28 + Math.random() * 0.4,
        max: 0.68,
        size: 2 + Math.random() * 3.5,
        color: color
      });
    }
  }

  function updateEffects(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 4.5);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
    if (purging > 0) purging = Math.max(0, purging - dt * 2.4);
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
      if (ev.type === 'kill') {
        burst(ev.x, ev.y, ev.color, 14, 1);
        shake = Math.max(shake, 0.35);
      } else if (ev.type === 'clean') {
        burst(ev.x, ev.y, '#ff5d73', 6, 0.6);
      } else if (ev.type === 'breach') {
        burst(ev.x, E.H - 10, '#ff9f43', 10, 0.9);
      } else if (ev.type === 'purge') {
        purging = 1;
        flash = 0.7;
        shake = 0.8;
      } else if (ev.type === 'finish') {
        showEnd();
      }
    }
    seenEvents = game.events.length;
  }

  function updateHud() {
    var s = E.snapshot(game);
    if (!s) return;
    var left = Math.max(0, Math.ceil(s.duration - s.time));
    setText(els.time, left);
    setText(els.score, s.score);
    setText(els.debt, s.debt);
    setText(els.accuracy, s.accuracy + '%');
    setText(els.purge, 'PURGE ' + s.purgeCharges);
    if (els.time) els.time.classList.toggle('low', left <= 10 && s.phase === 'playing');
    if (els.debt) els.debt.classList.toggle('high', s.debt >= 12);
    if (els.hint) {
      els.hint.textContent = s.debt >= 12
        ? 'DEBT HIGH：E / PURGE で返球を消せ'
        : '外した弾は1.5秒後に敵弾になって返る';
    }
  }

  function syncScreens() {
    var phase = game.phase;
    show(els.start, phase === 'idle');
    if (phase === 'finished') showEnd();
    else show(els.result, false);
  }

  function showEnd() {
    if (overShown || !game.result) return;
    overShown = true;
    var r = game.result;
    if (r.score > best) { best = r.score; saveBest(best); }
    setText(els.resultTitle, r.reason === 'clear' ? 'SURVIVED' : 'DOWN');
    if (els.resultTitle) {
      els.resultTitle.classList.toggle('clear', r.reason === 'clear');
      els.resultTitle.classList.toggle('down', r.reason !== 'clear');
    }
    setText(els.resultSub, r.reason === 'clear'
      ? '60秒を生き延びた。返球を抑え込んだ。'
      : '返ってきた弾に当たった。撃つ前に、返し方を見る。');
    setText(els.resultScore, r.score);
    setText(els.resultKills, r.kills);
    setText(els.resultAccuracy, r.accuracy + '%');
    setText(els.resultRank, 'RANK ' + r.rank);
    setText(els.resultBest, best);
    setText(els.bestStart, 'BEST ' + best);
    show(els.start, false);
    show(els.result, true);
  }

  function applyMove() {
    E.setMove(game, (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0));
  }

  function begin() {
    E.setFiring(game, false);
    E.start(game);
    fireHeld = false;
    leftHeld = false;
    rightHeld = false;
    seenEvents = 0;
    overShown = false;
    lastTs = 0;
    particles = [];
    shake = 0;
    flash = 0;
    purging = 0;
    show(els.start, false);
    show(els.result, false);
    updateHud();
  }

  function doPurge() {
    if (game.phase !== 'playing') return;
    E.purge(game);
  }

  function drawBackground() {
    var bg = ctx.createLinearGradient(0, 0, 0, viewH);
    bg.addColorStop(0, '#071025');
    bg.addColorStop(0.55, '#050a16');
    bg.addColorStop(1, '#02040a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    ctx.strokeStyle = 'rgba(93,244,255,.06)';
    ctx.lineWidth = 1;
    for (var gy = 80; gy < E.H; gy += 80) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(E.W, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(93,244,255,.12)';
    ctx.strokeRect(0.5, 0.5, E.W - 1, E.H - 1);

    ctx.fillStyle = 'rgba(160,200,255,.16)';
    for (var i = 0; i < 42; i++) {
      var x = (i * 137.5) % E.W;
      var y = (i * 83.7 + game.time * 18) % E.H;
      ctx.fillRect(x, y, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }

    ctx.fillStyle = 'rgba(93,244,255,.35)';
    ctx.fillRect(0, E.PLAYER_Y + 26, E.W, 2);
    ctx.restore();
  }

  function drawPending() {
    for (var i = 0; i < game.pending.length; i++) {
      var item = game.pending[i];
      var remain = Math.max(0, item.at - game.time);
      var blink = 0.35 + Math.abs(Math.sin(game.time * 9 + i)) * 0.5;
      var px = sx(item.x);
      var top = Math.max(sy(0), 78);
      var height = (30 + (1 - Math.min(1, remain / E.RETURN_DELAY)) * 40) * scale;
      ctx.globalAlpha = blink;
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, top + height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath();
      ctx.moveTo(px - 5, top);
      ctx.lineTo(px + 5, top);
      ctx.lineTo(px, top + 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemies() {
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      var x = sx(e.x);
      var y = sy(e.y);
      var r = e.r * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = e.color;
      ctx.shadowBlur = e.flash > 0 ? 26 : 14;
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
      ctx.beginPath();
      if (e.shape === 'square') {
        ctx.rect(-r, -r, r * 2, r * 2);
      } else if (e.shape === 'diamond') {
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
      } else if (e.shape === 'star') {
        for (var s = 0; s < 10; s++) {
          var a = -Math.PI / 2 + s * Math.PI / 5;
          var rad = s % 2 === 0 ? r : r * 0.46;
          if (s === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
      } else {
        ctx.moveTo(0, r);
        ctx.lineTo(r, -r * 0.8);
        ctx.lineTo(-r, -r * 0.8);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();

      if (e.maxHp > 1) {
        var w = e.r * 2 * scale;
        var bx = x - w / 2;
        var by = y - e.r * scale - 9;
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(bx, by, w, 3);
        ctx.fillStyle = e.color;
        ctx.fillRect(bx, by, w * (e.hp / e.maxHp), 3);
      }
    }
  }

  function drawThreats() {
    for (var i = 0; i < game.threats.length; i++) {
      var t = game.threats[i];
      var x = sx(t.x);
      var y = sy(t.y);
      var r = Math.max(3, t.r * scale);
      ctx.save();
      ctx.shadowColor = '#ff2d55';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y - r - 18 * scale);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawBullets() {
    ctx.save();
    ctx.shadowColor = '#5df4ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#b8fbff';
    for (var i = 0; i < game.bullets.length; i++) {
      var b = game.bullets[i];
      var x = sx(b.x);
      var y = sy(b.y);
      ctx.fillRect(x - 1.6 * scale, y - 9 * scale, 3.2 * scale, 14 * scale);
    }
    ctx.restore();
  }

  function drawPlayer() {
    var x = sx(game.player.x);
    var y = sy(game.player.y);
    var r = game.player.r * scale;
    ctx.save();
    ctx.shadowColor = '#5df4ff';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#5df4ff';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r, y + r * 0.8);
    ctx.lineTo(x, y + r * 0.35);
    ctx.lineTo(x - r, y + r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#06101f';
    ctx.beginPath();
    ctx.arc(x, y + r * 0.15, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

  function drawPurge() {
    if (purging <= 0) return;
    ctx.globalAlpha = purging * 0.6;
    ctx.strokeStyle = '#b8fbff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx(game.player.x), sy(game.player.y), (1 - purging) * 420 * scale + 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var oxShake = shake > 0 ? (Math.random() * 2 - 1) * shake * 6 : 0;
    var oyShake = shake > 0 ? (Math.random() * 2 - 1) * shake * 6 : 0;
    ctx.save();
    ctx.translate(oxShake, oyShake);
    drawBackground();
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, E.W * scale, E.H * scale);
    ctx.clip();
    drawPending();
    drawEnemies();
    drawThreats();
    drawBullets();
    drawPlayer();
    drawEffects();
    drawPurge();
    ctx.restore();
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.35;
      ctx.fillStyle = '#7fe9ff';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function loop(now) {
    if (now == null) now = (window.performance ? window.performance.now() : Date.now());
    var dt = lastTs ? (now - lastTs) / 1000 : 0;
    lastTs = now;
    if (game.phase === 'playing') E.update(game, Math.min(0.05, dt));
    processEvents();
    updateHud();
    syncScreens();
    updateEffects(Math.min(0.05, dt));
    draw();
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
      applyMove();
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      if (event.preventDefault) event.preventDefault();
      rightHeld = true;
      applyMove();
    } else if (code === 'Space' || code === 'KeyF') {
      if (event.preventDefault) event.preventDefault();
      fireHeld = true;
      E.setFiring(game, true);
    } else if (code === 'KeyE' || code === 'ShiftLeft' || code === 'ShiftRight') {
      if (event.preventDefault) event.preventDefault();
      doPurge();
    }
  }

  function onKeyUp(event) {
    if (!event) return;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      leftHeld = false;
      applyMove();
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      rightHeld = false;
      applyMove();
    } else if (event.code === 'Space' || event.code === 'KeyF') {
      fireHeld = false;
      if (game.phase === 'playing') E.setFiring(game, false);
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
  if (els.btnPurge) els.btnPurge.addEventListener('click', function (event) {
    if (event && event.preventDefault) event.preventDefault();
    doPurge();
  });
  bindHold(els.btnLeft, function () { leftHeld = true; applyMove(); }, function () { leftHeld = false; applyMove(); });
  bindHold(els.btnRight, function () { rightHeld = true; applyMove(); }, function () { rightHeld = false; applyMove(); });
  bindHold(els.btnFire, function () { fireHeld = true; E.setFiring(game, true); }, function () { fireHeld = false; E.setFiring(game, false); });

  setText(els.bestStart, 'BEST ' + best);
  updateHud();

  window.__GAME__ = {
    id: 'ammo-share',
    title: 'AMMO SHARE',
    start: begin,
    autoPlayStep: function () { E.autoStep(game); },
    isDone: function () { return game.phase === 'finished'; },
    getState: function () { return E.snapshot(game); }
  };

  if (window.requestAnimationFrame) window.requestAnimationFrame(loop);
})();
