(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.StickSoccerEngine;
  if (!E) return;

  var C = { VIEW_W: 480, VIEW_H: 800 };
  var F = E.FIELD;
  var G = E.CENTER;
  var BALL_R = E.BALL_R;

  var canvas = null;
  var ctx = null;
  var els = {};
  var game = null;
  var shownScreen = 'screen-title';
  var lastTs = 0;
  var scaleX = 1;
  var scaleY = 1;
  var pointer = null;
  var effects = null;
  var trail = [];
  var ui = { finalized: false };

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var screens = [
      ['screen-title', els.screenTitle],
      ['screen-over', els.screenOver],
      ['screen-pause', els.screenPause]
    ];
    for (var i = 0; i < screens.length; i++) {
      if (!screens[i][1]) continue;
      screens[i][1].classList.toggle('visible', screens[i][0] === name);
    }
  }

  function resetEffects() {
    effects = {
      particles: [],
      popups: [],
      shake: 0,
      flash: 0,
      flashColor: '220, 255, 230',
      banner: null
    };
    trail = [];
  }

  function beginGame() {
    game = E.createGame();
    pointer = null;
    resetEffects();
    setScreen(null);
    if (els.pause) els.pause.classList.remove('hidden');
    lastTs = 0;
    syncUI();
  }

  function syncUI() {
    if (!game) return;
    var st = E.getState(game);
    if (els.you) els.you.textContent = String(st.score.player);
    if (els.cpu) els.cpu.textContent = String(st.score.cpu);
    if (els.shots) els.shots.textContent = 'KICK ' + st.shots + '/' + st.turns;
    if (els.turn) {
      var label = 'YOUR TURN';
      if (st.phase === 'over') label = 'FULL TIME';
      else if (st.phase === 'goal') label = 'GOAL!';
      else if (st.phase === 'cpuThink' || st.phase === 'cpuAim') label = 'CPU TURN';
      else if (st.phase === 'moving') label = st.turn === 'player' ? 'SHOT!' : 'CPU SHOT!';
      else if (st.phase === 'aim' && st.turn === 'cpu') label = 'CPU TURN';
      els.turn.textContent = label;
    }

    var target = null;
    if (st.phase === 'over') target = 'screen-over';
    else if (st.paused) target = 'screen-pause';
    setScreen(target);
    if (els.pause) els.pause.classList.toggle('hidden', !(st.phase !== 'over' && !st.paused));

    if (st.phase === 'over') {
      var winner = st.winner;
      if (els.overKicker) els.overKicker.textContent = st.reason === 'turns' ? '12 KICKS / FULL TIME' : 'FULL TIME';
      if (els.overTitle) {
        els.overTitle.textContent = winner === 'player' ? 'YOU WIN' : (winner === 'cpu' ? 'CPU WIN' : 'DRAW');
        els.overTitle.className = 'result-title' + (winner === 'cpu' ? ' lose' : (winner === 'draw' ? ' draw' : ''));
      }
      if (els.overScore) els.overScore.textContent = st.score.player + ' - ' + st.score.cpu;
      if (els.overYou) els.overYou.textContent = String(st.score.player);
      if (els.overCpu) els.overCpu.textContent = String(st.score.cpu);
      if (els.overShots) els.overShots.textContent = String(st.shots);
    }
  }

  function pauseGame() {
    if (!game || game.phase === 'over' || game.paused) return;
    game.paused = true;
    E.setPaused(game, true);
    setScreen('screen-pause');
    syncUI();
  }
  function resumeGame() {
    if (!game || !game.paused) return;
    game.paused = false;
    E.setPaused(game, false);
    setScreen(null);
    lastTs = 0;
    syncUI();
  }
  function togglePause() {
    if (!game) return;
    if (game.paused) resumeGame();
    else pauseGame();
  }

  function roundRect(x, y, w, h, r) {
    var rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function mod(n, m) { return ((n % m) + m) % m; }

  function drawBackdrop(time) {
    var sky = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
    sky.addColorStop(0, '#081810');
    sky.addColorStop(0.45, '#07130e');
    sky.addColorStop(1, '#020604');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    var glow = ctx.createRadialGradient(G.x, G.y, 20, G.x, G.y, 390);
    glow.addColorStop(0, 'rgba(45, 160, 105, 0.18)');
    glow.addColorStop(0.55, 'rgba(20, 80, 50, 0.06)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    for (var i = 0; i < 46; i++) {
      var x = mod(i * 97 + 31 - time * (4 + i % 5), C.VIEW_W);
      var y = mod(i * 61 + 17, 720);
      ctx.fillStyle = 'rgba(150, 255, 205, ' + (0.025 + (i % 4) * 0.012) + ')';
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }

  function drawGoal(top) {
    var cx = G.x;
    var mouthL = cx - E.GOAL_HALF;
    var mouthR = cx + E.GOAL_HALF;
    var lineY = top ? F.y : F.bottom;
    var netTop = top ? F.y - 26 : F.bottom;
    var netBottom = top ? F.y : F.bottom + 26;
    ctx.save();
    var net = ctx.createLinearGradient(0, netTop, 0, netBottom);
    net.addColorStop(0, top ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.11)');
    net.addColorStop(1, top ? 'rgba(255, 255, 255, 0.11)' : 'rgba(255, 255, 255, 0.03)');
    ctx.fillStyle = net;
    ctx.fillRect(mouthL, netTop, mouthR - mouthL, netBottom - netTop);
    ctx.strokeStyle = 'rgba(220, 255, 239, 0.45)';
    ctx.lineWidth = 1;
    for (var x = mouthL + 10; x < mouthR; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, netTop);
      ctx.lineTo(x, netBottom);
      ctx.stroke();
    }
    for (var y = netTop + 10; y < netBottom; y += 10) {
      ctx.beginPath();
      ctx.moveTo(mouthL, y);
      ctx.lineTo(mouthR, y);
      ctx.stroke();
    }
    ctx.shadowColor = top ? 'rgba(255, 111, 168, 0.7)' : 'rgba(125, 245, 199, 0.75)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = top ? 'rgba(255, 111, 168, 0.9)' : 'rgba(125, 245, 199, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mouthL, lineY);
    ctx.lineTo(mouthR, lineY);
    ctx.moveTo(mouthL, lineY);
    ctx.lineTo(mouthL, top ? netTop : netBottom);
    ctx.moveTo(mouthR, lineY);
    ctx.lineTo(mouthR, top ? netTop : netBottom);
    ctx.stroke();
    ctx.restore();
  }

  function drawField(time) {
    ctx.save();
    var pitch = ctx.createLinearGradient(0, F.y, 0, F.bottom);
    pitch.addColorStop(0, '#0b2319');
    pitch.addColorStop(0.5, '#0e3021');
    pitch.addColorStop(1, '#081b13');
    ctx.fillStyle = pitch;
    ctx.fillRect(F.x, F.y, F.w, F.h);
    for (var i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(150, 255, 205, 0.026)' : 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(F.x, F.y + i * (F.h / 10), F.w, F.h / 10);
    }
    ctx.strokeStyle = 'rgba(170, 255, 216, 0.34)';
    ctx.lineWidth = 2;
    ctx.strokeRect(F.x, F.y, F.w, F.h);
    ctx.beginPath();
    ctx.moveTo(F.x, G.y);
    ctx.lineTo(F.right, G.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(G.x, G.y, 72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(170, 255, 216, 0.6)';
    ctx.beginPath();
    ctx.arc(G.x, G.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeRect(F.x + 75, F.y, F.w - 150, 82);
    ctx.strokeRect(F.x + 75, F.bottom - 82, F.w - 150, 82);
    ctx.strokeRect(F.x + 130, F.y, F.w - 260, 38);
    ctx.strokeRect(F.x + 130, F.bottom - 38, F.w - 260, 38);
    ctx.beginPath();
    ctx.arc(G.x, F.y + 82, 42, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(G.x, F.bottom - 82, 42, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawGoal(true);
    drawGoal(false);
  }

  function drawStickFigure(o, index, time) {
    var x = o.x;
    var y = o.y;
    var color = index % 3 === 0 ? '#ffd166' : (index % 3 === 1 ? '#7df5c7' : '#ff8fbd');
    var sway = Math.sin(time * 1.8 + index) * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(205, 255, 230, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -36);
    ctx.lineTo(0, 38);
    ctx.stroke();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(sway * 0.3, -25, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sway * 0.3, -17);
    ctx.lineTo(0, 3);
    ctx.lineTo(-8 + sway, 18);
    ctx.moveTo(0, 3);
    ctx.lineTo(8 + sway, 18);
    ctx.moveTo(0, -9);
    ctx.lineTo(-11 + sway, -2);
    ctx.moveTo(0, -9);
    ctx.lineTo(11 + sway, -2);
    ctx.stroke();
    ctx.restore();
  }

  function drawObstacles(time) {
    for (var i = 0; i < E.OBSTACLES.length; i++) drawStickFigure(E.OBSTACLES[i], i, time);
  }

  function drawTrail() {
    for (var i = 0; i < trail.length; i++) {
      var p = trail[i];
      var a = (i + 1) / trail.length;
      ctx.fillStyle = 'rgba(190, 255, 226, ' + (a * 0.22) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, BALL_R * (0.25 + a * 0.55), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBall() {
    if (!game) return;
    var b = game.ball;
    ctx.save();
    ctx.shadowColor = 'rgba(220, 255, 240, 0.95)';
    ctx.shadowBlur = 18;
    var grad = ctx.createRadialGradient(b.x - 4, b.y - 5, 2, b.x, b.y, BALL_R);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.6, '#d7fff0');
    grad.addColorStop(1, '#7bcaa8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6, 28, 19, 0.6)';
    ctx.beginPath();
    ctx.arc(b.x - 3, b.y - 2, 2.2, 0, Math.PI * 2);
    ctx.arc(b.x + 4, b.y + 3, 1.8, 0, Math.PI * 2);
    ctx.arc(b.x + 1, b.y - 6, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAim(st) {
    if (!game) return;
    var pullX = 0;
    var pullY = 0;
    var active = false;
    if (st.phase === 'aim' && st.turn === 'player' && pointer) {
      pullX = pointer.x - game.ball.x;
      pullY = pointer.y - game.ball.y;
      active = true;
    } else if (st.phase === 'cpuAim' && st.cpuAim) {
      pullX = -st.cpuAim.vx / E.PULL_POWER;
      pullY = -st.cpuAim.vy / E.PULL_POWER;
      active = true;
    }
    if (!active) return;
    var len = Math.sqrt(pullX * pullX + pullY * pullY);
    if (len < 1) return;
    var max = E.MAX_PULL;
    if (len > max) {
      pullX = pullX / len * max;
      pullY = pullY / len * max;
      len = max;
    }
    var color = st.turn === 'player' ? '#7df5c7' : '#ff8fbd';
    ctx.save();
    ctx.strokeStyle = 'rgba(220, 255, 236, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(game.ball.x, game.ball.y);
    ctx.lineTo(game.ball.x + pullX, game.ball.y + pullY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    var sx = game.ball.x - pullX;
    var sy = game.ball.y - pullY;
    var angle = Math.atan2(-pullY, -pullX);
    ctx.beginPath();
    ctx.moveTo(game.ball.x, game.ball.y);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - Math.cos(angle - 0.4) * 12, sy - Math.sin(angle - 0.4) * 12);
    ctx.lineTo(sx - Math.cos(angle + 0.4) * 12, sy - Math.sin(angle + 0.4) * 12);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6, 20, 14, 0.85)';
    ctx.beginPath();
    ctx.arc(game.ball.x + pullX, game.ball.y + pullY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = '#e9fff5';
    ctx.font = '900 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(len / max * 100) + '%', game.ball.x + pullX, game.ball.y + pullY - 16);
    ctx.restore();
  }

  function drawBanner() {
    if (!effects.banner) return;
    var b = effects.banner;
    var alpha = clamp(b.life / b.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha * 1.7);
    var y = 300 - (1 - alpha) * 8;
    ctx.fillStyle = 'rgba(3, 12, 8, 0.82)';
    roundRect(64, y - 28, 352, 68, 14);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.3;
    roundRect(64, y - 28, 352, 68, 14);
    ctx.stroke();
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 18;
    ctx.font = '900 25px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, C.VIEW_W / 2, y);
    if (b.sub) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#eafff4';
      ctx.font = '800 10px ui-monospace, Menlo, monospace';
      ctx.fillText(b.sub, C.VIEW_W / 2, y + 23);
    }
    ctx.restore();
  }

  function drawEffects() {
    for (var i = 0; i < effects.particles.length; i++) {
      var p = effects.particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    for (i = 0; i < effects.popups.length; i++) {
      var pop = effects.popups[i];
      ctx.globalAlpha = clamp(pop.life / pop.max, 0, 1);
      ctx.fillStyle = pop.color;
      ctx.font = '900 ' + pop.size + 'px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
    drawBanner();
  }

  function draw(time) {
    if (!ctx) return;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, C.VIEW_W, C.VIEW_H);
    ctx.save();
    if (effects && effects.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 18 * effects.shake, (Math.random() - 0.5) * 18 * effects.shake);
    }
    if (game) {
      drawBackdrop(time);
      drawField(time);
      drawObstacles(time);
      drawTrail();
      drawAim(E.getState(game));
      drawBall();
      ctx.fillStyle = 'rgba(145, 190, 168, 0.62)';
      ctx.font = '800 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ボールを引っ張って離す / 棒人間に当たると跳ね返る', C.VIEW_W / 2, 752);
      drawEffects();
    } else {
      drawBackdrop(time);
      drawField(time);
      drawObstacles(time);
      drawBall();
    }
    if (effects && effects.flash > 0) {
      ctx.fillStyle = 'rgba(' + effects.flashColor + ', ' + (effects.flash * 0.45) + ')';
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
    ctx.restore();
  }

  function burst(x, y, count, colors, speed, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = speed * (0.35 + Math.random() * 0.9);
      effects.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        g: 480, life: life * (0.6 + Math.random() * 0.5), max: life,
        size: 1.5 + Math.random() * 3.8,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function popup(text, x, y, color, size) {
    effects.popups.push({ text: text, x: x, y: y, life: 0.8, max: 0.8, color: color, size: size || 15 });
  }

  function showBanner(text, sub, color) {
    effects.banner = { text: text, sub: sub || '', color: color || '#7df5c7', life: 1.3, max: 1.3 };
  }

  function processEvents() {
    if (!game) return;
    var events = E.consumeEvents(game);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'shoot') {
        burst(game.ball.x, game.ball.y, 9, ['#7df5c7', '#ffffff', '#ffd166'], 170, 0.45);
      } else if (ev.type === 'bounce') {
        burst(ev.x, ev.y, 8, ['#7df5c7', '#ffd166', '#ffffff'], 150, 0.4);
        popup('BONK', ev.x, ev.y - 20, '#ffe6a3', 12);
      } else if (ev.type === 'goal') {
        var scorer = ev.side === 'player' ? 'YOU' : 'CPU';
        effects.flash = 0.65;
        effects.flashColor = ev.side === 'player' ? '190, 255, 222' : '255, 150, 190';
        effects.shake = 0.8;
        showBanner('GOAL!', scorer + '  ' + ev.score.player + ' - ' + ev.score.cpu, ev.side === 'player' ? '#7df5c7' : '#ff8fbd');
        var gy = ev.side === 'player' ? F.y + 18 : F.bottom - 18;
        burst(G.x, gy, 50, ['#7df5c7', '#ffd166', '#ffffff', '#ff8fbd'], 350, 1.2);
      } else if (ev.type === 'turn') {
        if (ev.turn === 'player') showBanner('YOUR TURN', 'ボールを引っ張って離す', '#7df5c7');
        else showBanner('CPU TURN', 'CPUが引っ張っています', '#ff8fbd');
      } else if (ev.type === 'over') {
        effects.flash = 0.55;
      }
    }
  }

  function updateEffects(dt) {
    for (var i = effects.particles.length - 1; i >= 0; i--) {
      var p = effects.particles[i];
      p.life -= dt;
      if (p.life <= 0) { effects.particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.1);
    }
    for (i = effects.popups.length - 1; i >= 0; i--) {
      var pop = effects.popups[i];
      pop.life -= dt;
      pop.y -= 32 * dt;
      if (pop.life <= 0) effects.popups.splice(i, 1);
    }
    if (effects.shake > 0) effects.shake = Math.max(0, effects.shake - dt * 2.6);
    if (effects.flash > 0) effects.flash = Math.max(0, effects.flash - dt * 2.4);
    if (effects.banner) {
      effects.banner.life -= dt;
      if (effects.banner.life <= 0) effects.banner = null;
    }
  }

  function pointerPosition(e) {
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
    var w = rect.width || 480;
    var h = rect.height || 800;
    return { x: (e.clientX - rect.left) / w * C.VIEW_W, y: (e.clientY - rect.top) / h * C.VIEW_H };
  }

  function nearBall(pos) {
    if (!game) return false;
    var dx = pos.x - game.ball.x;
    var dy = pos.y - game.ball.y;
    return Math.sqrt(dx * dx + dy * dy) < 100;
  }

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!game || game.paused || game.phase !== 'aim' || game.turn !== 'player' || pointer) return;
    var pos = pointerPosition(e);
    if (!nearBall(pos)) return;
    pointer = {
      id: e.pointerId == null ? 1 : e.pointerId,
      x: pos.x,
      y: pos.y
    };
    try { if (canvas.setPointerCapture) canvas.setPointerCapture(pointer.id); } catch (err) { }
  }

  function onPointerMove(e) {
    if (!pointer) {
      if (canvas) {
        var p = pointerPosition(e);
        canvas.style.cursor = nearBall(p) && game && game.phase === 'aim' && game.turn === 'player' ? 'grab' : 'default';
      }
      return;
    }
    if ((e.pointerId == null ? 1 : e.pointerId) !== pointer.id) return;
    var pos = pointerPosition(e);
    pointer.x = pos.x;
    pointer.y = pos.y;
  }

  function onPointerUp(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!pointer) return;
    var id = e.pointerId == null ? 1 : e.pointerId;
    if (id !== pointer.id) return;
    var p = pointer;
    pointer = null;
    try { if (canvas.releasePointerCapture) canvas.releasePointerCapture(id); } catch (err) { }
    if (!game || game.paused || game.phase !== 'aim' || game.turn !== 'player') return;
    var dx = p.x - game.ball.x;
    var dy = p.y - game.ball.y;
    if (E.shootDrag(game, dx, dy)) {
      processEvents();
      syncUI();
    }
  }

  function onKeyDown(e) {
    if (!e) return;
    var k = e.key || '';
    var code = e.code || '';
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game && game.phase !== 'over') {
        if (e.preventDefault) e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || code === 'Space') {
      if (e.preventDefault) e.preventDefault();
      if (!game || game.phase === 'over') {
        if (!e.repeat) beginGame();
      } else if (game.paused) {
        resumeGame();
      }
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(2, Math.max(1, window.devicePixelRatio)) : 1;
    var w = Math.round(C.VIEW_W * dpr);
    var h = Math.round(C.VIEW_H * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    scaleX = canvas.width / C.VIEW_W;
    scaleY = canvas.height / C.VIEW_H;
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);
    if (game && !game.paused) {
      var oldX = game.ball.x;
      var oldY = game.ball.y;
      E.update(game, dt);
      if (game.phase === 'moving') {
        trail.push({ x: game.ball.x, y: game.ball.y });
        if (trail.length > 16) trail.shift();
      } else {
        trail = [];
      }
      processEvents();
      syncUI();
    }
    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function autoPlayStep() {
    if (!game) return;
    if (game.paused) return;
    if (game.phase === 'aim' && game.turn === 'player') {
      E.autoShot(game, 'player');
      processEvents();
      syncUI();
    }
  }

  function init() {
    canvas = $('game');
    els.you = $('you');
    els.cpu = $('cpu');
    els.turn = $('turn');
    els.shots = $('shots');
    els.pause = $('btn-pause');
    els.screenTitle = $('screen-title');
    els.screenOver = $('screen-over');
    els.screenPause = $('screen-pause');
    els.overKicker = $('over-kicker');
    els.overTitle = $('over-title');
    els.overScore = $('over-score');
    els.overYou = $('over-you');
    els.overCpu = $('over-cpu');
    els.overShots = $('over-shots');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }
    resetEffects();
    resizeCanvas();

    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');

    var start = $('btn-start');
    var retry = $('btn-retry');
    var resume = $('btn-resume');
    if (start) start.addEventListener('click', beginGame);
    if (retry) retry.addEventListener('click', beginGame);
    if (resume) resume.addEventListener('click', resumeGame);
    if (els.pause) els.pause.addEventListener('click', togglePause);

    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown, false);
      canvas.addEventListener('pointermove', onPointerMove, false);
      canvas.addEventListener('pointerup', onPointerUp, false);
      canvas.addEventListener('pointercancel', function () { pointer = null; }, false);
      canvas.addEventListener('contextmenu', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
      canvas.addEventListener('dblclick', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    }
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('blur', pauseGame, false);
    window.addEventListener('resize', resizeCanvas, false);
    document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); }, false);
    document.addEventListener('gesturestart', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('gesturechange', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('gestureend', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('contextmenu', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('selectstart', function (e) { if (e.preventDefault) e.preventDefault(); }, false);

    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    root.__GAME__ = {
      id: 'stick-soccer',
      title: 'スティックサッカー',
      start: function () { beginGame(); },
      autoPlayStep: autoPlayStep,
      isDone: function () { return !!(game && game.phase === 'over'); },
      getState: function () {
        if (!game) return { id: 'stick-soccer', phase: 'title', score: { player: 0, cpu: 0 } };
        return E.getState(game);
      },
      getBallPoint: function () {
        if (!game) return null;
        var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
        return {
          x: rect.left + game.ball.x / C.VIEW_W * (rect.width || 480),
          y: rect.top + game.ball.y / C.VIEW_H * (rect.height || 800)
        };
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
