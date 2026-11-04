/* game.js : WORM RUSH（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.WormRushEngine) ? window.WormRushEngine : null;
  if (!E) return;

  var canvas = null;
  var ctx = null;
  var minimap = null;
  var mctx = null;
  var state = null;
  var viewW = 480;
  var viewH = 800;
  var dpr = 1;
  var zoom = 0.9;
  var camX = 0;
  var camY = 0;
  var lastTs = 0;
  var aimAngle = 0;
  var pointerDown = false;
  var pointerAngle = null;
  var keys = {};
  var boostHeld = false;
  var best = 0;
  var overShown = false;
  var shake = 0;
  var particles = [];
  var feedItems = [];
  var els = {};
  var hudTimer = 0;

  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function loadBest() {
    try { return Number(localStorage.getItem('worm-rush-best')) || 0; } catch (e) { return 0; }
  }
  function saveBest(value) {
    try { localStorage.setItem('worm-rush-best', String(value)); } catch (e) { }
  }
  function fmtTime(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function setText(el, value) { if (el) el.textContent = value == null ? '' : String(value); }

  function updateBestUi() {
    setText(els.bestStart, 'BEST ' + best);
    setText(els.endBest, best);
  }

  function begin() {
    if (!state) return;
    E.start(state);
    camX = state.player.x;
    camY = state.player.y;
    aimAngle = state.player.angle;
    pointerAngle = null;
    overShown = false;
    shake = 0;
    particles = [];
    feedItems = [];
    if (els.feed) els.feed.innerHTML = '';
    setOverlay(false);
    if (els.boost) els.boost.classList.add('live');
    updateHud(true);
  }

  function showEnd() {
    if (overShown || !state || !state.result) return;
    overShown = true;
    var r = state.result;
    if (r.score > best) { best = r.score; saveBest(best); }
    setText(els.endRank, r.rank);
    setText(els.endDetail, '体の長さ ' + r.length + ' で力尽きた。');
    setText(els.endScore, r.score);
    setText(els.endLength, r.length);
    setText(els.endKills, r.kills);
    setText(els.endTime, fmtTime(r.time));
    updateBestUi();
    setOverlay(true, 'end');
    if (els.boost) els.boost.classList.remove('live');
  }

  function setOverlay(visible, which) {
    if (!els.overlay) return;
    els.overlay.classList.toggle('visible', !!visible);
    if (els.startScreen) els.startScreen.classList.toggle('visible', visible && which === 'start');
    if (els.endScreen) els.endScreen.classList.toggle('visible', visible && which === 'end');
  }

  function updateHud(force) {
    if (!state) return;
    if (els.score) els.score.textContent = String(state.player ? state.player.score : 0);
    if (els.length) els.length.textContent = String(state.player ? state.player.length : E.START_LENGTH);
    if (els.kills) els.kills.textContent = String(state.player ? state.player.kills : 0);
    if (els.time) els.time.textContent = fmtTime(state.time);
    if (els.aiAlive) els.aiAlive.textContent = String(state.worms.filter(function (w) { return w.alive && !w.isPlayer; }).length);
    if (els.status) {
      if (state.player && state.player.boosting) els.status.textContent = 'DASH!';
      else {
        var center = state.player ? Math.sqrt(state.player.x * state.player.x + state.player.y * state.player.y) : 0;
        els.status.textContent = center > E.WORLD_RADIUS * 0.86 ? '境界注意' : '餌を食べて育て';
      }
    }
    if (force || hudTimer <= 0) {
      updateLeaderboard();
      hudTimer = 0.18;
    }
  }

  function updateLeaderboard() {
    if (!els.leaderList || !state) return;
    els.leaderList.innerHTML = '';
    var list = state.leaderboard.slice(0, 5);
    for (var i = 0; i < list.length; i++) {
      var row = document.createElement('li');
      if (list[i].isPlayer) row.className = 'you';
      var name = document.createElement('span');
      name.textContent = (i + 1) + '. ' + list[i].name;
      var len = document.createElement('b');
      len.textContent = list[i].length;
      row.appendChild(name);
      row.appendChild(len);
      els.leaderList.appendChild(row);
    }
  }

  function addFeed(text, kind) {
    if (!els.feed) return;
    var item = document.createElement('div');
    item.className = kind || '';
    item.textContent = text;
    els.feed.appendChild(item);
    feedItems.push({ el: item, life: 2.2 });
    while (feedItems.length > 4) {
      var old = feedItems.shift();
      if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
    }
  }

  function burst(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 20 + Math.random() * 90;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.35, max: 0.6,
        size: 2 + Math.random() * 3, color: color
      });
    }
  }

  function processEvents() {
    var events = E.consumeEvents(state);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'eat' && ev.worm && ev.worm.isPlayer) {
        burst(ev.worm.x, ev.worm.y, '#ffd166', 3);
      } else if (ev.type === 'death') {
        var killer = ev.killer;
        if (killer && killer.isPlayer) {
          addFeed('YOU が ' + ev.worm.name + ' を倒した', 'kill');
          shake = 1;
        } else if (ev.worm.isPlayer) {
          addFeed('YOU が倒れた', 'death');
          shake = 1.3;
        } else {
          addFeed(ev.worm.name + ' が倒れた', '');
        }
        burst(ev.worm.x, ev.worm.y, ev.worm.color, 18);
      } else if (ev.type === 'respawn') {
        if (state.time - (ev.worm.lastRespawnAt || 0) > 1) {
          addFeed(ev.worm.name + ' が復活', '');
        }
        ev.worm.lastRespawnAt = state.time;
      } else if (ev.type === 'over') {
        showEnd();
      }
    }
  }

  function drawBackground() {
    var bg = ctx.createRadialGradient(viewW / 2, viewH / 2, 10, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.72);
    bg.addColorStop(0, '#101c36');
    bg.addColorStop(0.5, '#080d1a');
    bg.addColorStop(1, '#03050b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    // distant stars
    ctx.fillStyle = 'rgba(160,200,255,.28)';
    for (var i = 0; i < 26; i++) {
      var x = ((i * 137.5) % viewW);
      var y = ((i * 83.3) % viewH);
      ctx.fillRect(x, y, 1.2, 1.2);
    }
  }

  function worldToScreen(x, y) {
    return { x: (x - camX) * zoom + viewW / 2, y: (y - camY) * zoom + viewH / 2 };
  }

  function drawWorld(time) {
    var R = E.WORLD_RADIUS;
    // boundary
    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    ctx.strokeStyle = 'rgba(93,244,255,.20)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,123,200,.08)';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(0, 0, R + 6, 0, Math.PI * 2);
    ctx.stroke();

    // grid
    ctx.strokeStyle = 'rgba(90,120,190,.08)';
    ctx.lineWidth = 1;
    for (var gx = -R; gx <= R; gx += 260) {
      ctx.beginPath(); ctx.moveTo(gx, -R); ctx.lineTo(gx, R); ctx.stroke();
    }
    for (var gy = -R; gy <= R; gy += 260) {
      ctx.beginPath(); ctx.moveTo(-R, gy); ctx.lineTo(R, gy); ctx.stroke();
    }

    // food
    for (var f = 0; f < state.foods.length; f++) {
      var food = state.foods[f];
      if (Math.abs(food.x - camX) > viewW / zoom * 0.7 || Math.abs(food.y - camY) > viewH / zoom * 0.7) continue;
      var pulse = 0.75 + Math.sin(time * 3 + food.phase) * 0.25;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = food.color;
      ctx.beginPath();
      ctx.arc(food.x, food.y, food.r * 2.1 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(food.x, food.y, food.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // worms
    var worms = state.worms.slice().sort(function (a, b) { return a.length - b.length; });
    for (var w = 0; w < worms.length; w++) drawWorm(worms[w], time);

    // boost particles
    for (var p = 0; p < particles.length; p++) {
      var part = particles[p];
      ctx.globalAlpha = clamp(part.life / part.max, 0, 1);
      ctx.fillStyle = part.color;
      ctx.fillRect(part.x - part.size / 2, part.y - part.size / 2, part.size, part.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawWorm(worm, time) {
    if (!worm.alive) return;
    var blink = worm.invuln > 0 && Math.floor(time * 12) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    var n = worm.segments.length;
    for (var i = n - 1; i >= 0; i--) {
      var seg = worm.segments[i];
      var t = 1 - i / Math.max(1, n);
      var r = 5.2 + t * 3.2;
      ctx.fillStyle = worm.color;
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (i % 4 === 0) {
        ctx.globalAlpha = (blink ? 0.2 : 0.55);
        ctx.strokeStyle = 'rgba(255,255,255,.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = blink ? 0.35 : 1;
      }
    }

    // head
    if (worm.isPlayer) {
      ctx.shadowColor = worm.color;
      ctx.shadowBlur = worm.boosting ? 24 : 14;
    }
    ctx.fillStyle = worm.color;
    ctx.beginPath();
    ctx.arc(worm.x, worm.y, E.HEAD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // eyes
    var ex = Math.cos(worm.angle);
    var ey = Math.sin(worm.angle);
    var px = -ey;
    var py = ex;
    var eyeDist = 4.2;
    var eyeForward = 3.2;
    for (var e = -1; e <= 1; e += 2) {
      var x = worm.x + ex * eyeForward + px * eyeDist * e;
      var y = worm.y + ey * eyeForward + py * eyeDist * e;
      ctx.fillStyle = '#f7fbff';
      ctx.beginPath(); ctx.arc(x, y, 2.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#06101f';
      ctx.beginPath(); ctx.arc(x + ex * 1.0, y + ey * 1.0, 1.35, 0, Math.PI * 2); ctx.fill();
    }

    if (worm.isPlayer) {
      ctx.strokeStyle = 'rgba(93,244,255,.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(worm.x, worm.y, E.HEAD_RADIUS + 5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(230,242,255,.72)';
      ctx.font = '700 ' + (9 / zoom) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(worm.name, worm.x, worm.y - 18);
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap() {
    if (!mctx || !state) return;
    var w = minimap.width;
    var h = minimap.height;
    var R = E.WORLD_RADIUS;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = 'rgba(5,9,18,.9)';
    mctx.beginPath(); mctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = 'rgba(93,244,255,.35)';
    mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2); mctx.stroke();
    for (var i = 0; i < state.worms.length; i++) {
      var worm = state.worms[i];
      if (!worm.alive) continue;
      var x = w / 2 + worm.x / R * (w / 2 - 6);
      var y = h / 2 + worm.y / R * (h / 2 - 6);
      mctx.fillStyle = worm.isPlayer ? '#5df4ff' : worm.color;
      mctx.beginPath();
      mctx.arc(x, y, worm.isPlayer ? 3.5 : 2.2, 0, Math.PI * 2);
      mctx.fill();
    }
  }

  function updateEffects(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 4);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    for (var f = feedItems.length - 1; f >= 0; f--) {
      feedItems[f].life -= dt;
      if (feedItems[f].life <= 0) {
        if (feedItems[f].el.parentNode) feedItems[f].el.parentNode.removeChild(feedItems[f].el);
        feedItems.splice(f, 1);
      }
    }
  }

  function updateCamera(dt) {
    if (!state || !state.player) return;
    var targetX = state.player.x;
    var targetY = state.player.y;
    var k = Math.min(1, dt * 6.5);
    camX += (targetX - camX) * k;
    camY += (targetY - camY) * k;
  }

  function currentAngle(dt) {
    var dx = 0;
    var dy = 0;
    if (keys.ArrowLeft || keys.a) dx -= 1;
    if (keys.ArrowRight || keys.d) dx += 1;
    if (keys.ArrowUp || keys.w) dy -= 1;
    if (keys.ArrowDown || keys.s) dy += 1;
    if (dx || dy) {
      aimAngle = Math.atan2(dy, dx);
    } else if (pointerAngle != null) {
      aimAngle = pointerAngle;
    }
    return aimAngle;
  }

  function frame(ts) {
    if (ts == null) ts = performance.now();
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);

    if (state && state.phase === 'run') {
      E.setInput(state, { angle: currentAngle(dt), boost: boostHeld });
      E.update(state, dt);
      processEvents();
      updateCamera(dt);
    }
    updateEffects(dt);
    hudTimer -= dt;
    if (state) {
      updateHud();
      draw();
      drawMinimap();
    }
    requestAnimationFrame(frame);
  }

  function draw() {
    if (!state) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    drawBackground();
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 9 * shake, (Math.random() - 0.5) * 8 * shake);
    drawWorld(performance.now() / 1000);
    ctx.restore();
    if (state.phase === 'over') {
      ctx.fillStyle = 'rgba(4,6,12,.28)';
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function setPointer(e) {
    if (!state || !state.player) return;
    var rect = canvas.getBoundingClientRect();
    var sx = (e.clientX - rect.left) / rect.width * viewW;
    var sy = (e.clientY - rect.top) / rect.height * viewH;
    var wx = camX + (sx - viewW / 2) / zoom;
    var wy = camY + (sy - viewH / 2) / zoom;
    pointerAngle = Math.atan2(wy - state.player.y, wx - state.player.x);
  }

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!state || state.phase !== 'run') return;
    pointerDown = true;
    setPointer(e);
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
    }
  }

  function onPointerMove(e) {
    if ((pointerDown || e.pointerType === 'mouse') && state && state.phase === 'run') {
      setPointer(e);
    }
  }

  function onPointerUp(e) {
    pointerDown = false;
    if (canvas.releasePointerCapture && e && e.pointerId != null) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
    }
  }

  function setBoost(value, button) {
    boostHeld = !!value;
    if (button === 'button') {
      if (els.boost) els.boost.classList.toggle('pressed', !!value);
    }
  }

  function onKeyDown(e) {
    var key = e.key || '';
    if (key === ' ' || key === 'Enter') {
      if (e.preventDefault) e.preventDefault();
      if (!state || state.phase !== 'run') begin();
      else setBoost(true);
      return;
    }
    if (key === 'Shift') { setBoost(true); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd'].indexOf(key) >= 0) {
      if (e.preventDefault) e.preventDefault();
      keys[key] = true;
    }
  }

  function onKeyUp(e) {
    var key = e.key || '';
    if (key === ' ' || key === 'Shift') setBoost(false);
    keys[key] = false;
  }

  function resizeCanvas() {
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var w = canvas.clientWidth || 480;
    var h = canvas.clientHeight || 800;
    if (w <= 0) w = 480;
    if (h <= 0) h = 800;
    viewW = w;
    viewH = h;
    canvas.width = Math.max(2, Math.round(w * dpr));
    canvas.height = Math.max(2, Math.round(h * dpr));
    zoom = Math.max(0.72, Math.min(1.0, Math.min(w / 520, h / 820)));
  }

  function init() {
    canvas = $('arena');
    ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    minimap = $('minimap');
    mctx = minimap && minimap.getContext ? minimap.getContext('2d') : null;
    if (!canvas || !ctx) return;
    els = {
      score: $('score'), length: $('length'), kills: $('kills'), time: $('time'),
      aiAlive: $('ai-alive'), status: $('status'), leaderList: $('leader-list'),
      feed: $('feed'), boost: $('btn-boost'), overlay: $('overlay'),
      startScreen: $('screen-start'), endScreen: $('screen-end'),
      endRank: $('end-rank'), endDetail: $('end-detail'), endScore: $('end-score'),
      endLength: $('end-length'), endKills: $('end-kills'), endTime: $('end-time'),
      endBest: $('end-best'), bestStart: $('best-start'),
      btnStart: $('btn-start'), btnAgain: $('btn-again')
    };
    best = loadBest();
    updateBestUi();
    state = E.createGame();
    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnAgain) els.btnAgain.addEventListener('click', begin);
    if (els.boost) {
      els.boost.addEventListener('pointerdown', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        setBoost(true, 'button');
        if (els.boost.setPointerCapture && e.pointerId != null) {
          try { els.boost.setPointerCapture(e.pointerId); } catch (err) { }
        }
      });
      els.boost.addEventListener('pointerup', function () { setBoost(false, 'button'); });
      els.boost.addEventListener('pointercancel', function () { setBoost(false, 'button'); });
    }
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', resizeCanvas);
    if (typeof ResizeObserver !== 'undefined' && $('stage')) {
      new ResizeObserver(resizeCanvas).observe($('stage'));
    }
    resizeCanvas();
    setOverlay(true, 'start');
    requestAnimationFrame(frame);

    window.__GAME__ = {
      id: 'worm-rush',
      title: 'WORM RUSH',
      start: function () { begin(); },
      autoPlayStep: function () { if (state) E.autoStep(state); },
      isDone: function () { return !!(state && state.phase === 'over'); },
      getState: function () { return state ? E.snapshot(state) : null; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
