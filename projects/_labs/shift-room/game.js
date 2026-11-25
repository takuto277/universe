/* game.js : SHIFT ROOM の描画・入力・画面遷移 */
(function (root) {
  'use strict';

  var E = root.ShiftRoomEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var audio = root.ShiftRoomAudio;

  var els = {
    hud: document.getElementById('hud'),
    room: document.getElementById('room'),
    keys: document.getElementById('keys'),
    time: document.getElementById('time'),
    best: document.getElementById('best'),
    hint: document.getElementById('hint'),
    start: document.getElementById('start-overlay'),
    end: document.getElementById('end-overlay'),
    endEyebrow: document.getElementById('end-eyebrow'),
    endTitle: document.getElementById('end-title'),
    endRank: document.getElementById('end-rank'),
    endTime: document.getElementById('end-time'),
    endScore: document.getElementById('end-score'),
    endMeta: document.getElementById('end-meta'),
    endBest: document.getElementById('end-best'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    btnSound: document.getElementById('btn-sound'),
    btnResultSound: document.getElementById('btn-result-sound')
  };

  var sticks = {
    visible: false,
    left: { active: false, id: null, startX: 0, startY: 0, x: 0, y: 0 },
    right: { active: false, id: null, startX: 0, startY: 0, x: 0, y: 0 }
  };

  var keysDown = {};
  var best = 0;
  var seenEvents = 0;
  var lastPhase = null;
  var lastNow = null;

  try {
    best = Number(root.localStorage && root.localStorage.getItem('shiftroom-best')) || 0;
  } catch (e) { }

  function text(el, value) {
    if (el) el.textContent = value == null ? '' : String(value);
  }

  function show(el, on) {
    if (el) el.classList.toggle('visible', !!on);
  }

  function hide(el, on) {
    if (el) el.classList.toggle('is-hidden', !!on);
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.ceil(seconds || 0));
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + ':' + (sec < 10 ? '0' + sec : String(sec));
  }

  function soundLabel() {
    var on = audio ? audio.isEnabled() : true;
    text(els.btnMute, on ? 'SOUND ON' : 'SOUND OFF');
    text(els.btnSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
    text(els.btnResultSound, 'SOUND: ' + (on ? 'ON' : 'OFF'));
  }

  function addNoiseParticles(list, x, y, color, count, power) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var speed = power * (0.4 + Math.random() * 0.9);
      list.push({
        x: x,
        y: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.35 + Math.random() * 0.55,
        max: 0.9,
        size: 1.5 + Math.random() * 2.6,
        color: color
      });
    }
  }

  function createRenderer(target) {
    var ctx = target && target.getContext ? target.getContext('2d') : null;
    var width = 390;
    var height = 844;
    var dpr = 1;
    var view = { scale: 1, ox: 0, oy: 0 };
    var particles = [];
    var shake = 0;
    var flash = 0;
    var lastDrawT = 0;

    function resize() {
      if (!target) return;
      dpr = Math.min(2, root.devicePixelRatio || 1);
      var rect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
      var w = rect && rect.width ? rect.width : (target.clientWidth || 390);
      var h = rect && rect.height ? rect.height : (target.clientHeight || 844);
      width = Math.max(1, w);
      height = Math.max(1, h);
      target.width = Math.round(width * dpr);
      target.height = Math.round(height * dpr);
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }

    function syncSize() {
      if (!target || !target.getBoundingClientRect) return;
      var rect = target.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) return;
      if (Math.abs(rect.width - width) > 0.5 || Math.abs(rect.height - height) > 0.5) resize();
    }

    function updateView(state) {
      var pad = Math.max(10, Math.min(width, height) * 0.045);
      var rw = state.roomWidth || 900;
      var rh = state.roomHeight || 900;
      var scale = Math.min((width - pad * 2) / rw, (height - pad * 2) / rh);
      if (!isFinite(scale) || scale <= 0) scale = 0.4;
      view.scale = scale;
      view.ox = (width - rw * scale) / 2;
      view.oy = (height - rh * scale) / 2;
    }

    function screenToWorld(clientX, clientY) {
      var rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
      var sx = clientX - (rect ? rect.left : 0);
      var sy = clientY - (rect ? rect.top : 0);
      return {
        x: (sx - view.ox) / view.scale,
        y: (sy - view.oy) / view.scale
      };
    }

    function worldTransform() {
      if (!ctx) return;
      ctx.save();
      ctx.translate(view.ox, view.oy);
      ctx.scale(view.scale, view.scale);
    }

    function resetEffects() {
      particles = [];
      shake = 0;
      flash = 0;
      lastDrawT = 0;
    }

    function addShake(value) {
      shake = Math.min(14, shake + value);
    }

    function addFlash(value) {
      flash = Math.min(1, flash + value);
    }

    function spawnBurst(state, x, y, color, count, power) {
      addNoiseParticles(particles, x, y, color, count, power);
    }

    function drawFloor(state) {
      var pal = state.palette;
      var rw = state.roomWidth;
      var rh = state.roomHeight;
      var grad = ctx.createLinearGradient(0, 0, rw, rh);
      grad.addColorStop(0, pal.floor);
      grad.addColorStop(1, pal.bg);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, rw, rh);

      ctx.strokeStyle = pal.line;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      for (var x = 50; x < rw; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rh);
        ctx.stroke();
      }
      for (var y = 50; y < rh; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rw, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawWalls(state) {
      var pal = state.palette;
      for (var i = 0; i < state.walls.length; i++) {
        var wall = state.walls[i];
        ctx.fillStyle = pal.wall;
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        ctx.strokeStyle = pal.wallEdge;
        ctx.lineWidth = 2;
        ctx.strokeRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(wall.x + 4, wall.y + 4);
        ctx.lineTo(wall.x + wall.w - 4, wall.y + 4);
        ctx.stroke();
      }

      ctx.strokeStyle = pal.wallEdge;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, state.roomWidth - 4, state.roomHeight - 4);
    }

    function drawGaze(state) {
      var pal = state.palette;
      var p = state.player;
      var a = state.aimAngle;
      var half = state.gazeHalfAngle;
      var range = state.gazeRange;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, state.roomWidth, state.roomHeight);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';

      var grad = ctx.createRadialGradient(p.x, p.y, 12, p.x, p.y, range);
      grad.addColorStop(0, 'rgba(255, 250, 220, 0.20)');
      grad.addColorStop(0.45, 'rgba(255, 240, 175, 0.11)');
      grad.addColorStop(1, 'rgba(255, 230, 150, 0)');
      ctx.fillStyle = grad;

      var layers = [
        { h: 1, a: 0.34 },
        { h: 0.84, a: 0.34 },
        { h: 0.56, a: 0.30 }
      ];
      for (var i = 0; i < layers.length; i++) {
        ctx.globalAlpha = layers[i].a;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, range, a - half * layers[i].h, a + half * layers[i].h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = 'rgba(255, 242, 190, 0.16)';
      ctx.lineWidth = 1.2;
      for (var s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a + half * s) * range, p.y + Math.sin(a + half * s) * range);
        ctx.stroke();
      }
      ctx.restore();
    }

    function isObserved(state, x, y, radius) {
      var p = state.player;
      var dx = x - p.x;
      var dy = y - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > state.gazeRange + radius) return false;
      if (dist <= radius + 0.001) return true;
      var diff = Math.abs(normalize(Math.atan2(dy, dx) - state.aimAngle));
      var allowance = state.gazeHalfAngle;
      if (radius > 0) allowance += Math.asin(Math.min(1, radius / Math.max(dist, 0.001)));
      return diff <= allowance;
    }

    function normalize(a) {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    }

    function drawKeys(state, t) {
      var pal = state.palette;
      for (var i = 0; i < state.keys.length; i++) {
        var key = state.keys[i];
        if (key.collected) continue;
        var observed = isObserved(state, key.x, key.y, key.r);
        var jitter = key.unseen > 0.2 ? Math.min(5, key.unseen * 7) : 0;
        var x = key.x + Math.sin(t * 41 + i * 7) * jitter;
        var y = key.y + Math.cos(t * 37 + i * 5) * jitter;
        var pulse = 0.6 + 0.4 * Math.sin(t * 4 + i * 1.7);

        ctx.save();
        ctx.globalAlpha = observed ? 1 : 0.66;

        ctx.globalCompositeOperation = 'lighter';
        var glow = ctx.createRadialGradient(x, y, 0, x, y, 40 + pulse * 10);
        glow.addColorStop(0, pal.key);
        glow.addColorStop(0.22, 'rgba(140, 240, 255, 0.28)');
        glow.addColorStop(1, 'rgba(100, 220, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 42 + pulse * 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4 + Math.sin(t * 1.8 + i) * 0.07);
        ctx.fillStyle = pal.key;
        ctx.fillRect(-8, -8, 16, 16);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-8, -8, 16, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(-2, -2, 4, 4);
        ctx.rotate(-(Math.PI / 4 + Math.sin(t * 1.8 + i) * 0.07));

        if (key.unseen > 0.02) {
          var frac = Math.min(1, key.unseen / state.shiftTime);
          ctx.strokeStyle = frac > 0.66 ? 'rgba(255,90,110,0.95)' : 'rgba(255,190,120,0.9)';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(0, 0, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawDoor(state, t) {
      var pal = state.palette;
      var door = state.door;
      if (!door) return;
      var observed = isObserved(state, door.x, door.y, door.r);
      var jitter = door.unseen > 0.2 ? Math.min(6, door.unseen * 8) : 0;
      var x = door.x + Math.sin(t * 33 + 2) * jitter;
      var y = door.y + Math.cos(t * 29 + 4) * jitter;
      var open = state.doorOpen;

      ctx.save();
      ctx.globalAlpha = observed ? 1 : 0.7;

      ctx.globalCompositeOperation = 'lighter';
      var glow = ctx.createRadialGradient(x, y, 0, x, y, 70);
      glow.addColorStop(0, open ? pal.door : 'rgba(140, 120, 80, 0.5)');
      glow.addColorStop(0.3, open ? 'rgba(255, 220, 120, 0.22)' : 'rgba(120, 100, 70, 0.12)');
      glow.addColorStop(1, 'rgba(255, 220, 120, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.translate(x, y);
      ctx.fillStyle = open ? 'rgba(18, 24, 20, 0.95)' : 'rgba(16, 18, 24, 0.95)';
      ctx.fillRect(-18, -26, 36, 52);
      ctx.strokeStyle = open ? pal.door : 'rgba(150, 140, 120, 0.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(-18, -26, 36, 52);
      ctx.fillStyle = open ? pal.door : 'rgba(150, 140, 120, 0.9)';
      ctx.fillRect(-11, -19, 22, 5);
      ctx.fillRect(-11, 14, 22, 3);

      if (!open) {
        ctx.strokeStyle = 'rgba(220, 200, 160, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 7, Math.PI, 0);
        ctx.stroke();
        ctx.fillRect(-8, 0, 16, 12);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(-2, -10, 4, 20);
        ctx.fillRect(-10, -2, 20, 4);
      }

      if (door.unseen > 0.02) {
        var frac = Math.min(1, door.unseen / state.shiftTime);
        ctx.strokeStyle = frac > 0.66 ? 'rgba(255,90,110,0.95)' : 'rgba(255,190,120,0.9)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawPlayer(state, t) {
      var pal = state.palette;
      var p = state.player;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 46);
      glow.addColorStop(0, 'rgba(220, 250, 255, 0.45)');
      glow.addColorStop(1, 'rgba(160, 230, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.fillStyle = pal.player;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(state.aimAngle);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.moveTo(p.r + 10, 0);
      ctx.lineTo(p.r + 1, -6);
      ctx.lineTo(p.r + 1, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();
    }

    function drawParticles(dt) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    function drawVignette() {
      var grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.22, width / 2, height / 2, Math.max(width, height) * 0.72);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    function drawSticks() {
      if (!sticks.visible) return;
      var accent = (game.getState().palette || {}).accent || '#6ff2ff';
      var list = [sticks.left, sticks.right];
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s.active) continue;
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.startX, s.startY, 42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawFlash(state) {
      if (flash > 0.001) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(0.5, flash * 0.5));
        ctx.fillStyle = (state.palette || {}).accent || '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
      if (state.phase === 'transition') {
        var a = Math.max(0, state.transitionTimer / 0.9) * 0.32;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = (state.palette || {}).accent || '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }

    function draw(state, t, dt) {
      if (!ctx) return;
      syncSize();
      updateView(state);

      var shx = shake ? Math.sin(t * 91) * shake : 0;
      var shy = shake ? Math.cos(t * 77) * shake : 0;
      view.ox += shx;
      view.oy += shy;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = state.palette.bg;
      ctx.fillRect(0, 0, width, height);

      worldTransform();
      drawFloor(state);
      ctx.restore();

      ctx.fillStyle = 'rgba(2, 4, 9, 0.55)';
      ctx.fillRect(0, 0, width, height);

      worldTransform();
      drawGaze(state);
      ctx.restore();

      worldTransform();
      drawWalls(state);
      drawDoor(state, t);
      drawKeys(state, t);
      drawPlayer(state, t);
      drawParticles(dt || 0);
      ctx.restore();

      drawVignette();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFlash(state);
      drawSticks();

      shake *= 0.84;
      flash *= 0.9;
      lastDrawT = t;
    }

    resize();

    return {
      resize: resize,
      draw: draw,
      screenToWorld: screenToWorld,
      spawnBurst: spawnBurst,
      addShake: addShake,
      addFlash: addFlash,
      resetEffects: resetEffects
    };
  }

  var renderer = createRenderer(canvas);

  function updateHud(state) {
    text(els.room, (state.roomIndex + 1) + '/' + state.roomCount);
    text(els.keys, state.keysCollected + '/' + state.keysTotal);
    text(els.time, formatTime(state.timeLeft));
    text(els.best, best > 0 ? best : '—');
    if (state.phase === 'transition') {
      text(els.hint, 'ROOM CLEAR · STEP INTO THE NEXT ROOM');
    } else if (state.doorOpen) {
      text(els.hint, 'DOOR OPEN · KEEP THE DOOR IN YOUR CONE');
    } else {
      text(els.hint, 'KEEP THE KEY IN YOUR CONE · WALLS BLOCK YOU, NOT THE LIGHT');
    }
  }

  function processEvents(state) {
    if (state.events.length < seenEvents) seenEvents = 0;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev.type === 'shift') {
        renderer.spawnBurst(state, ev.fromX, ev.fromY, 'rgba(190, 120, 255, 0.9)', 12, 120);
        renderer.spawnBurst(state, ev.x, ev.y, 'rgba(140, 250, 255, 0.9)', 16, 150);
        renderer.addShake(6);
        if (audio && audio.shift) audio.shift();
      } else if (ev.type === 'key') {
        renderer.spawnBurst(state, ev.x, ev.y, 'rgba(255, 255, 190, 0.95)', 18, 130);
        if (audio && audio.key) audio.key();
      } else if (ev.type === 'dooropen') {
        var door = state.door;
        if (door) renderer.spawnBurst(state, door.x, door.y, 'rgba(255, 220, 120, 0.95)', 24, 150);
        renderer.addFlash(0.35);
        if (audio && audio.doorOpen) audio.doorOpen();
      } else if (ev.type === 'roomclear') {
        if (state.door) renderer.spawnBurst(state, state.door.x, state.door.y, 'rgba(160, 255, 210, 0.95)', 30, 180);
        renderer.addFlash(0.8);
        renderer.addShake(9);
        if (audio && audio.roomClear) audio.roomClear();
      } else if (ev.type === 'room') {
        renderer.addFlash(0.4);
      } else if (ev.type === 'victory') {
        renderer.addFlash(1);
        if (audio && audio.victory) audio.victory();
      } else if (ev.type === 'over') {
        renderer.addShake(10);
        if (audio && audio.gameOver) audio.gameOver();
      }
    }
    seenEvents = state.events.length;
  }

  function finishUI(state) {
    var result = state.result || {};
    var won = !!result.won;
    var score = result.score || 0;
    if (score > best) {
      best = score;
      try {
        if (root.localStorage) root.localStorage.setItem('shiftroom-best', String(best));
      } catch (e) { }
    }
    text(els.endEyebrow, won ? 'ESCAPED' : 'TIME UP');
    text(els.endTitle, won ? 'YOU LEFT THE ROOM' : 'THE ROOM KEPT YOU');
    text(els.endRank, result.rank || 'D');
    text(els.endTime, 'TIME ' + formatTime(result.timeUsed || 0));
    text(els.endScore, 'SCORE ' + score);
    text(els.endMeta, 'KEYS ' + (result.totalKeys || 0) + ' · ROOMS ' + (result.rooms || 0) + ' · SHIFTS ' + (result.shifts || 0));
    text(els.endBest, 'BEST ' + best);
    show(els.start, false);
    show(els.end, true);
    hide(els.hud, true);
  }

  function syncOverlay(state) {
    if (state.phase === lastPhase) return;
    lastPhase = state.phase;
    if (state.phase === 'victory' || state.phase === 'over') {
      finishUI(state);
    } else if (state.phase === 'start') {
      show(els.start, true);
      show(els.end, false);
      hide(els.hud, true);
    } else {
      show(els.start, false);
      show(els.end, false);
      hide(els.hud, false);
    }
  }

  function begin() {
    game.start();
    clearSticks();
    if (audio) {
      audio.start();
      soundLabel();
    }
    seenEvents = 0;
    lastPhase = null;
    lastNow = null;
    renderer.resetEffects();
    show(els.start, false);
    show(els.end, false);
    hide(els.hud, false);
    updateHud(game.getState());
  }

  function clearSticks() {
    sticks.left.active = false;
    sticks.right.active = false;
    sticks.left.id = null;
    sticks.right.id = null;
    sticks.visible = false;
    game.setMove(0, 0);
  }

  function applySticks() {
    if (sticks.left.active) {
      var ldx = sticks.left.x - sticks.left.startX;
      var ldy = sticks.left.y - sticks.left.startY;
      var lmag = Math.sqrt(ldx * ldx + ldy * ldy);
      if (lmag > 7) {
        var power = Math.min(1, lmag / 48);
        game.setMove((ldx / lmag) * power, (ldy / lmag) * power);
      } else {
        game.setMove(0, 0);
      }
    }
    if (sticks.right.active) {
      var rdx = sticks.right.x - sticks.right.startX;
      var rdy = sticks.right.y - sticks.right.startY;
      var rmag = Math.sqrt(rdx * rdx + rdy * rdy);
      if (rmag > 8) game.setAim(rdx, rdy);
    }
  }

  function touchPoint(touch) {
    var rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    return {
      x: touch.clientX - (rect ? rect.left : 0),
      y: touch.clientY - (rect ? rect.top : 0)
    };
  }

  function handleTouchStart(event) {
    if (!event || !event.touches) return;
    if (event.preventDefault) event.preventDefault();
    var rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var halfWidth = rect && rect.width ? rect.width / 2 : 195;
    for (var i = 0; i < event.touches.length; i++) {
      var touch = event.touches[i];
      var pos = touchPoint(touch);
      if (pos.x < halfWidth && !sticks.left.active) {
        sticks.left.active = true;
        sticks.left.id = touch.identifier;
        sticks.left.startX = pos.x;
        sticks.left.startY = pos.y;
        sticks.left.x = pos.x;
        sticks.left.y = pos.y;
        sticks.visible = true;
      } else if (pos.x >= halfWidth && !sticks.right.active) {
        sticks.right.active = true;
        sticks.right.id = touch.identifier;
        sticks.right.startX = pos.x;
        sticks.right.startY = pos.y;
        sticks.right.x = pos.x;
        sticks.right.y = pos.y;
        sticks.visible = true;
      }
    }
    applySticks();
  }

  function handleTouchMove(event) {
    if (!event || !event.touches) return;
    if (event.preventDefault) event.preventDefault();
    for (var i = 0; i < event.touches.length; i++) {
      var touch = event.touches[i];
      var pos = touchPoint(touch);
      if (sticks.left.active && sticks.left.id === touch.identifier) {
        sticks.left.x = pos.x;
        sticks.left.y = pos.y;
      } else if (sticks.right.active && sticks.right.id === touch.identifier) {
        sticks.right.x = pos.x;
        sticks.right.y = pos.y;
      }
    }
    applySticks();
  }

  function handleTouchEnd(event) {
    if (!event) return;
    if (event.preventDefault) event.preventDefault();
    var changed = event.changedTouches || [];
    for (var i = 0; i < changed.length; i++) {
      var touch = changed[i];
      if (sticks.left.active && sticks.left.id === touch.identifier) {
        sticks.left.active = false;
        sticks.left.id = null;
        game.setMove(0, 0);
      }
      if (sticks.right.active && sticks.right.id === touch.identifier) {
        sticks.right.active = false;
        sticks.right.id = null;
      }
    }
    if (!sticks.left.active && !sticks.right.active) sticks.visible = false;
    applySticks();
  }

  function handleKey(event) {
    var key = event && event.key ? event.key.toLowerCase() : '';
    return key;
  }

  function syncKeyboardMove() {
    var dx = 0;
    var dy = 0;
    if (keysDown.w || keysDown.arrowup) dy -= 1;
    if (keysDown.s || keysDown.arrowdown) dy += 1;
    if (keysDown.a || keysDown.arrowleft) dx -= 1;
    if (keysDown.d || keysDown.arrowright) dx += 1;
    game.setMove(dx, dy);
  }

  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    if (root.PointerEvent) {
      canvas.addEventListener('pointermove', function (event) {
        if (!event || event.pointerType === 'touch') return;
        var world = renderer.screenToWorld(event.clientX, event.clientY);
        var dx = world.x - game.state.player.x;
        var dy = world.y - game.state.player.y;
        if (dx * dx + dy * dy > 36) game.setAim(dx, dy);
      });
    } else {
      canvas.addEventListener('mousemove', function (event) {
        if (!event) return;
        var world = renderer.screenToWorld(event.clientX, event.clientY);
        var dx = world.x - game.state.player.x;
        var dy = world.y - game.state.player.y;
        if (dx * dx + dy * dy > 36) game.setAim(dx, dy);
      });
    }
  }

  if (root.addEventListener) {
    root.addEventListener('keydown', function (event) {
      if (!event) return;
      var key = handleKey(event);
      if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright' || key === ' ') {
        if (event.preventDefault) event.preventDefault();
      }
      if (key === 'm') {
        if (audio) {
          audio.toggleMute();
          soundLabel();
        }
        return;
      }
      keysDown[key] = true;
      syncKeyboardMove();
    });
    root.addEventListener('keyup', function (event) {
      if (!event) return;
      var key = handleKey(event);
      keysDown[key] = false;
      syncKeyboardMove();
    });
    root.addEventListener('blur', function () {
      keysDown = {};
      game.setMove(0, 0);
      clearSticks();
    });
    root.addEventListener('resize', function () { renderer.resize(); });
    root.addEventListener('orientationchange', function () { renderer.resize(); });
  }

  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', begin);
  if (els.btnMute) els.btnMute.addEventListener('click', function () {
    if (audio) audio.toggleMute();
    soundLabel();
  });
  if (els.btnSound) els.btnSound.addEventListener('click', function () {
    if (audio) audio.toggleMute();
    soundLabel();
  });
  if (els.btnResultSound) els.btnResultSound.addEventListener('click', function () {
    if (audio) audio.toggleMute();
    soundLabel();
  });

  root.__GAME__ = {
    id: 'shift-room',
    title: 'SHIFT ROOM',
    start: begin,
    autoPlayStep: function () {
      game.autoStep();
    },
    isDone: function () {
      return game.state.phase === 'victory' || game.state.phase === 'over';
    },
    getState: function () {
      return game.getState();
    }
  };

  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    game.update(dt);
    var state = game.getState();
    processEvents(state);
    updateHud(state);
    syncOverlay(state);
    renderer.draw(state, now / 1000, dt);
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  show(els.start, true);
  show(els.end, false);
  hide(els.hud, true);
  soundLabel();
  updateHud(game.getState());
  renderer.draw(game.getState(), 0, 0);

  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
