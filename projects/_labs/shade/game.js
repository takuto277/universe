/* game.js : SHADE（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.ShadeEngine) ? window.ShadeEngine : null;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var game = E.createGame();

  var els = {
    stage: document.getElementById('stage-label'),
    turn: document.getElementById('turn'),
    shadows: document.getElementById('shadows'),
    state: document.getElementById('state'),
    hint: document.getElementById('hint'),
    turnbar: document.getElementById('turnbar'),
    lampLabel: document.getElementById('lamp-label'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultTitle: document.getElementById('result-title'),
    resultSub: document.getElementById('result-sub'),
    resultStage: document.getElementById('result-stage'),
    resultTurns: document.getElementById('result-turns'),
    resultShadows: document.getElementById('result-shadows'),
    resultCaught: document.getElementById('result-caught'),
    resultRank: document.getElementById('result-rank'),
    resultBest: document.getElementById('result-best'),
    resultSeed: document.getElementById('result-seed'),
    bestStart: document.getElementById('best-start'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnLamp: document.getElementById('btn-lamp'),
    btnUndo: document.getElementById('btn-undo'),
    btnUp: document.getElementById('btn-up'),
    btnDown: document.getElementById('btn-down'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right')
  };

  var best = 0;
  try {
    best = Number(window.localStorage && window.localStorage.getItem('shade-best')) || 0;
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
  var flashColor = '255,80,110';
  var particles = [];
  var floats = [];
  var ripples = [];

  function setText(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function show(el, on) { if (el && el.classList) el.classList.toggle('visible', !!on); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }

  function saveBest(value) {
    try { if (window.localStorage) window.localStorage.setItem('shade-best', String(value)); } catch (e) { }
  }

  function blurActive() {
    try {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    } catch (e) { }
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

  function cellCenter(cx, cy) {
    return { x: E.PAD + (cx + 0.5) * E.CELL, y: E.PAD + (cy + 0.5) * E.CELL };
  }

  function toCell(clientX, clientY) {
    if (!canvas || !canvas.getBoundingClientRect) return null;
    var rect = canvas.getBoundingClientRect();
    var wx = (clientX - rect.left - offsetX) / (scale || 1);
    var wy = (clientY - rect.top - offsetY) / (scale || 1);
    var cx = Math.floor((wx - E.PAD) / E.CELL);
    var cy = Math.floor((wy - E.PAD) / E.CELL);
    if (cx < 0 || cy < 0 || cx >= E.COLS || cy >= E.ROWS) return null;
    return { x: cx, y: cy };
  }

  function letters(index) {
    return String.fromCharCode(65 + index);
  }

  function burst(x, y, color, count, spread) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (40 + Math.random() * 170) * (spread || 1);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.5,
        max: 0.8,
        size: 2 + Math.random() * 4,
        color: color
      });
    }
  }

  function ripple(x, y, color, maxR) {
    ripples.push({ x: x, y: y, r: 4, max: maxR || 60, life: 0.55, maxLife: 0.55, color: color });
  }

  function floatText(x, y, text, color) {
    floats.push({ x: x, y: y, text: text, color: color, life: 0.9, max: 0.9 });
  }

  function updateEffects(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 4.2);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
    for (var j = ripples.length - 1; j >= 0; j--) {
      var r = ripples[j];
      r.life -= dt;
      if (r.life <= 0) { ripples.splice(j, 1); continue; }
      r.r += (r.max - r.r) * Math.min(1, dt * 6);
    }
    for (var f = floats.length - 1; f >= 0; f--) {
      var t = floats[f];
      t.life -= dt;
      if (t.life <= 0) { floats.splice(f, 1); continue; }
      t.y -= dt * 26;
    }
  }

  function processEvents() {
    if (game.events.length < seenEvents) seenEvents = 0;
    for (var i = seenEvents; i < game.events.length; i++) {
      var ev = game.events[i];
      if (ev.type === 'stageStart') {
        flash = 0.55;
        flashColor = '120,220,255';
      } else if (ev.type === 'lamp') {
        var sock = game.stage ? game.stage.sockets[ev.socket] : null;
        if (sock) {
          var c = cellCenter(sock.x, sock.y);
          burst(c.x, c.y, '#ffd27a', 12, 0.6);
          ripple(c.x, c.y, '255,210,120', 54);
          floatText(c.x, c.y - 18, 'LIGHT ' + letters(ev.socket), '#ffd27a');
        }
      } else if (ev.type === 'caught') {
        shake = 1;
        flash = 1;
        flashColor = '255,70,100';
        var hit = (ev.x != null) ? cellCenter(ev.x, ev.y) : (game.player ? cellCenter(game.player.x, game.player.y) : null);
        if (hit) {
          burst(hit.x, hit.y, '#ff5d73', 24, 1.15);
          floatText(hit.x, hit.y - 20, 'SEEN', '#ff8095');
        }
      } else if (ev.type === 'timeout') {
        shake = 0.5;
        flash = 0.8;
        flashColor = '255,170,90';
        var tc = (ev.x != null) ? cellCenter(ev.x, ev.y) : (game.player ? cellCenter(game.player.x, game.player.y) : null);
        if (tc) floatText(tc.x, tc.y - 20, 'TIME OUT', '#ffb35c');
      } else if (ev.type === 'clear') {
        flash = 0.9;
        flashColor = '120,255,220';
        var ec = (ev.x != null) ? cellCenter(ev.x, ev.y) : (game.stage ? cellCenter(game.stage.exit.x, game.stage.exit.y) : null);
        if (ec) {
          burst(ec.x, ec.y, '#7dffd0', 26, 1.0);
          ripple(ec.x, ec.y, '120,255,210', 90);
        }
        floatText(E.W / 2, E.H * 0.4, 'STAGE CLEAR', '#8dffd8');
      } else if (ev.type === 'undo') {
        flash = Math.max(flash, 0.18);
        flashColor = '160,180,255';
        floats = [];
        particles = [];
      } else if (ev.type === 'finish') {
        showEnd();
      }
    }
    seenEvents = game.events.length;
  }

  function shadowIcons(n) {
    var out = '';
    for (var i = 0; i < E.MAX_SHADOWS; i++) out += i < n ? '\u25c8' : '\u00b7';
    return out;
  }

  function lampText() {
    if (!game.stage) return '';
    var n = game.stage.sockets.length;
    if (n < 2) return '';
    var cur = game.lamp;
    var next = (cur + 1) % n;
    return letters(cur) + '\u2192' + letters(next);
  }

  function updateHud() {
    var s = E.snapshot(game);
    if (!s) return;
    setText(els.stage, s.stage + '/' + s.stages);
    setText(els.turn, s.turn + '/' + s.turnLimit);
    setText(els.shadows, shadowIcons(s.shadows));
    var remain = Math.max(0, 1 - s.turn / s.turnLimit);
    if (els.turnbar) els.turnbar.style.width = (remain * 100).toFixed(1) + '%';
    setText(els.lampLabel, (s.lampRisk ? '! ' : '') + lampText());
    if (els.btnLamp) els.btnLamp.classList.toggle('danger', !!(s.phase === 'playing' && s.lampRisk));
    if (els.state) {
      els.state.textContent = s.phase === 'playing'
        ? (s.turn === 0 ? 'HIDDEN' : 'SHADOW')
        : (s.phase === 'finished' ? (s.result && s.result.reason === 'clear' ? 'ESCAPED' : 'CAUGHT') : 'READY');
    }
    if (els.hint) {
      els.hint.textContent = s.phase === 'playing'
        ? '\u77e2\u5370: \u79fb\u52d5 / L: \u30e9\u30f3\u30d7\u5207\u66ff / Z: \u623b\u3059'
        : '\u5f71\u3092\u8d70\u308a\u629c\u3051\u308d';
    }
    if (els.btnUndo) els.btnUndo.classList.toggle('ready', !!s.canUndo);
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
    setText(els.resultTitle, clear ? 'ESCAPED' : 'CAUGHT');
    if (els.resultTitle) {
      els.resultTitle.classList.toggle('clear', clear);
      els.resultTitle.classList.toggle('down', !clear);
    }
    setText(els.resultSub, clear
      ? '5つの部屋を影で抜けた。光は、隠れるために使うもの。'
      : '残影が尽きた。照らされる前に、影を選び直せ。');
    setText(els.resultStage, r.cleared + '/' + r.stages);
    setText(els.resultTurns, r.turns);
    setText(els.resultShadows, r.shadows);
    setText(els.resultCaught, r.caught);
    setText(els.resultRank, r.rank);
    setText(els.resultBest, best);
    setText(els.resultSeed, game.seed);
    setText(els.bestStart, 'BEST ' + best);
    show(els.start, false);
    show(els.result, true);
  }

  function begin() {
    E.start(game);
    blurActive();
    seenEvents = 0;
    overShown = false;
    lastTs = 0;
    particles = [];
    floats = [];
    ripples = [];
    shake = 0;
    flash = 0;
    show(els.start, false);
    show(els.result, false);
    processEvents();
    updateHud();
  }

  function doAct(action) {
    if (game.phase !== 'playing') return;
    E.act(game, action);
    processEvents();
    updateHud();
  }

  function doUndo() {
    if (game.phase !== 'playing') return;
    E.undo(game);
    processEvents();
    updateHud();
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
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawEmptyArena(time) {
    var ax = E.PAD;
    var ay = E.PAD;
    var aw = E.COLS * E.CELL;
    var ah = E.ROWS * E.CELL;
    ctx.fillStyle = '#060a13';
    roundRect(ax, ay, aw, ah, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,160,230,.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (var i = 0; i < 26; i++) {
      var x = ax + ((i * 137.5) % aw);
      var y = ay + ((i * 83.7 + time * 12) % ah);
      ctx.fillStyle = 'rgba(140,180,255,' + (0.05 + (i % 4) * 0.02) + ')';
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawFloor(stage, time) {
    var lit = stage.lit;
    var seen = stage.seen;
    var seenAlpha = 0.10 + (Math.sin(time * 4) + 1) * 0.035;
    for (var y = 0; y < E.ROWS; y++) {
      for (var x = 0; x < E.COLS; x++) {
        if (stage.walls[y][x]) continue;
        var px = E.PAD + x * E.CELL;
        var py = E.PAD + y * E.CELL;
        var color;
        if (seen[y][x]) color = '#3b1220';
        else if (lit[y][x]) color = '#2a2112';
        else color = '#0a1220';
        ctx.fillStyle = color;
        ctx.fillRect(px + 1, py + 1, E.CELL - 2, E.CELL - 2);
        if (lit[y][x] && !seen[y][x]) {
          ctx.fillStyle = 'rgba(255,196,120,.06)';
          ctx.fillRect(px + 1, py + 1, E.CELL - 2, E.CELL - 2);
        }
        if (seen[y][x]) {
          ctx.fillStyle = 'rgba(255,70,100,' + seenAlpha.toFixed(3) + ')';
          ctx.fillRect(px + 1, py + 1, E.CELL - 2, E.CELL - 2);
        }
      }
    }
  }

  function drawWalls(stage) {
    for (var y = 0; y < E.ROWS; y++) {
      for (var x = 0; x < E.COLS; x++) {
        if (!stage.walls[y][x]) continue;
        var px = E.PAD + x * E.CELL;
        var py = E.PAD + y * E.CELL;
        var edge = (x === 0 || y === 0 || x === E.COLS - 1 || y === E.ROWS - 1);
        ctx.fillStyle = edge ? '#101827' : '#162034';
        roundRect(px + 1, py + 1, E.CELL - 2, E.CELL - 2, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(150,190,255,.10)';
        ctx.fillRect(px + 6, py + 5, E.CELL - 12, 4);
        ctx.fillStyle = 'rgba(0,0,0,.42)';
        ctx.fillRect(px + 6, py + E.CELL - 9, E.CELL - 12, 5);
      }
    }
  }

  function drawLamp(stage, time) {
    var active = stage.sockets[game.lamp];
    var pulse = 0.75 + Math.sin(time * 4) * 0.25;
    for (var i = 0; i < stage.sockets.length; i++) {
      var sock = stage.sockets[i];
      var c = cellCenter(sock.x, sock.y);
      var isActive = i === game.lamp;
      if (isActive) {
        ctx.save();
        ctx.globalAlpha = 0.35 * pulse;
        var g = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, E.CELL * 0.9);
        g.addColorStop(0, 'rgba(255,214,140,.9)');
        g.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, E.CELL * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = isActive ? '#ffd27a' : 'rgba(255,210,140,.35)';
      ctx.lineWidth = isActive ? 2.4 : 1.4;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = isActive ? '#fff0c4' : 'rgba(255,210,140,.4)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, isActive ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.fillStyle = isActive ? '#3a2a10' : 'rgba(20,12,4,.75)';
      ctx.font = '800 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(letters(i), c.x, c.y + 20);
      ctx.restore();
    }

    // active socketから次のsocketへの向き
    if (stage.sockets.length > 1) {
      var next = stage.sockets[(game.lamp + 1) % stage.sockets.length];
      var a = cellCenter(active.x, active.y);
      var b = cellCenter(next.x, next.y);
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var d = len(dx, dy) || 1;
      dx /= d; dy /= d;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,210,140,.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x + dx * 18, a.y + dy * 18);
      ctx.lineTo(a.x + dx * 30, a.y + dy * 30);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,210,140,.7)';
      ctx.beginPath();
      ctx.moveTo(a.x + dx * 34, a.y + dy * 34);
      ctx.lineTo(a.x + dx * 27 - dy * 5, a.y + dy * 27 + dx * 5);
      ctx.lineTo(a.x + dx * 27 + dy * 5, a.y + dy * 27 - dx * 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return active;
  }

  function drawGuards(stage) {
    for (var i = 0; i < stage.guards.length; i++) {
      var g = stage.guards[i];
      var c = cellCenter(g.x, g.y);
      var v = E.DIRS[g.dir];
      ctx.save();
      ctx.shadowColor = '#ff3d5c';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#2a0a12';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ff8a9c';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // 向きの楔
      var px = -v.y;
      var py = v.x;
      ctx.fillStyle = 'rgba(255,110,135,.9)';
      ctx.beginPath();
      ctx.moveTo(c.x + v.x * 23, c.y + v.y * 23);
      ctx.lineTo(c.x + v.x * 12 + px * 7, c.y + v.y * 12 + py * 7);
      ctx.lineTo(c.x + v.x * 12 - px * 7, c.y + v.y * 12 - py * 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawExit(stage, time) {
    var c = cellCenter(stage.exit.x, stage.exit.y);
    var pulse = 0.6 + Math.sin(time * 2.6) * 0.25;
    var exposed = !!(stage.seen[stage.exit.y] && stage.seen[stage.exit.y][stage.exit.x]);
    var rgb = exposed ? '255,93,115' : '125,255,208';
    var hex = exposed ? '#ff5d73' : '#5dffc0';
    var label = exposed ? 'SEEN' : 'EXIT';

    ctx.save();
    ctx.shadowColor = hex;
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(' + rgb + ',' + (0.14 + pulse * 0.16) + ')';
    roundRect(c.x - 15, c.y - 18, 30, 36, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.6 + pulse * 0.35) + ')';
    ctx.lineWidth = 2;
    roundRect(c.x - 15, c.y - 18, 30, 36, 12);
    ctx.stroke();
    if (exposed) {
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 22 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    ctx.fillStyle = exposed ? 'rgba(255,150,165,.95)' : 'rgba(180,255,230,.9)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.fillStyle = 'rgba(' + rgb + ',.85)';
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, c.x, c.y - 24);
    ctx.restore();
  }

  function drawLegalMoves(time) {
    var moves = E.safeMoves(game);
    var p = game.player;
    if (!p) return;
    for (var i = 0; i < moves.length; i++) {
      var d = E.DIRS[moves[i]];
      var tx = p.x + d.x;
      var ty = p.y + d.y;
      var c = cellCenter(tx, ty);
      var a = 0.25 + Math.sin(time * 4 + i) * 0.12;
      ctx.fillStyle = 'rgba(180,210,255,' + a + ')';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(time) {
    if (!game.player) return;
    var p = game.player;
    var c = cellCenter(p.x, p.y);
    var pulse = 0.8 + Math.sin(time * 3.4) * 0.2;
    ctx.save();
    ctx.globalAlpha = 0.35 * pulse;
    ctx.fillStyle = '#9b7bff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, E.CELL * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = '#8f7bff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#0a0916';
    ctx.beginPath();
    ctx.arc(c.x, c.y, E.CELL * 0.23, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9b6ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#7df9ff';
    ctx.beginPath();
    ctx.arc(c.x - 4, c.y - 2, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x + 4, c.y - 2, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawRipples() {
    for (var i = 0; i < ripples.length; i++) {
      var r = ripples[i];
      ctx.globalAlpha = Math.max(0, r.life / r.maxLife) * 0.6;
      ctx.strokeStyle = 'rgba(' + r.color + ',1)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
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

  function draw(time) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop();
    var ox = shake > 0 ? (Math.random() * 2 - 1) * shake * 6 : 0;
    var oy = shake > 0 ? (Math.random() * 2 - 1) * shake * 6 : 0;
    ctx.save();
    ctx.translate(offsetX + ox, offsetY + oy);
    ctx.scale(scale, scale);

    if (!game.stage) {
      drawEmptyArena(time);
    } else {
      var stage = game.stage;
      var ax = E.PAD;
      var ay = E.PAD;
      var aw = E.COLS * E.CELL;
      var ah = E.ROWS * E.CELL;
      ctx.fillStyle = '#05080f';
      roundRect(ax, ay, aw, ah, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,160,230,.16)';
      ctx.lineWidth = 1;
      roundRect(ax, ay, aw, ah, 18);
      ctx.stroke();

      drawFloor(stage, time);
      drawLamp(stage, time);
      drawWalls(stage);
      drawExit(stage, time);
      drawLegalMoves(time);
      drawGuards(stage);
      drawPlayer(time);
      drawRipples();
      drawParticles();
      drawFloats();

      if (flash > 0) {
        ctx.globalAlpha = flash * 0.22;
        ctx.fillStyle = 'rgba(' + flashColor + ',1)';
        ctx.fillRect(ax - 10, ay - 10, aw + 20, ah + 20);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function loop(now) {
    if (now == null) now = (window.performance ? window.performance.now() : Date.now());
    var dt = lastTs ? (now - lastTs) / 1000 : 0;
    lastTs = now;
    dt = Math.min(0.05, Math.max(0, dt));
    processEvents();
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
    if (event.repeat) return;
    if (code === 'ArrowUp' || code === 'KeyW') { if (event.preventDefault) event.preventDefault(); doAct('N'); }
    else if (code === 'ArrowDown' || code === 'KeyS') { if (event.preventDefault) event.preventDefault(); doAct('S'); }
    else if (code === 'ArrowLeft' || code === 'KeyA') { if (event.preventDefault) event.preventDefault(); doAct('W'); }
    else if (code === 'ArrowRight' || code === 'KeyD') { if (event.preventDefault) event.preventDefault(); doAct('E'); }
    else if (code === 'KeyL' || code === 'Space') { if (event.preventDefault) event.preventDefault(); doAct('lamp'); }
    else if (code === 'KeyZ' || code === 'Backspace') { if (event.preventDefault) event.preventDefault(); doUndo(); }
  }

  function onCanvasPointer(event) {
    if (!event) return;
    if (game.phase !== 'playing') return;
    var cell = toCell(event.clientX, event.clientY);
    if (!cell || !game.player) return;
    var dx = cell.x - game.player.x;
    var dy = cell.y - game.player.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    if (event.preventDefault) event.preventDefault();
    if (dx === 1) doAct('E');
    else if (dx === -1) doAct('W');
    else if (dy === 1) doAct('S');
    else doAct('N');
  }

  function bindTap(el, action) {
    if (!el || !el.addEventListener) return;
    el.addEventListener('click', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      action();
      blurActive();
    });
  }

  resize();
  if (window.addEventListener) {
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
  }
  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', onCanvasPointer);
  }
  if (els.btnStart) els.btnStart.addEventListener('click', begin);
  if (els.btnRetry) els.btnRetry.addEventListener('click', begin);
  bindTap(els.btnLamp, function () { doAct('lamp'); });
  bindTap(els.btnUndo, doUndo);
  bindTap(els.btnUp, function () { doAct('N'); });
  bindTap(els.btnDown, function () { doAct('S'); });
  bindTap(els.btnLeft, function () { doAct('W'); });
  bindTap(els.btnRight, function () { doAct('E'); });

  setText(els.bestStart, 'BEST ' + best);
  updateHud();

  window.__GAME__ = {
    id: 'shade',
    title: 'SHADE',
    start: begin,
    autoPlayStep: function () { E.autoStep(game); },
    isDone: function () { return game.phase === 'finished'; },
    getState: function () { return E.snapshot(game); }
  };

  if (window.requestAnimationFrame) window.requestAnimationFrame(loop);
})();
