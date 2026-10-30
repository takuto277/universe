(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.StickColosseumEngine;
  if (!E) return;
  var Audio = root.SoccerAudio;

  var C = { VIEW_W: 480, VIEW_H: 800 };
  var CENTER = E.CENTER;
  var CHAR_R = E.CHAR_R;
  var canvas = null;
  var ctx = null;
  var els = {};
  var game = null;
  var mode = 'title';
  var shownScreen = 'screen-title';
  var stageIndex = 0;
  var presetId = 'balanced';
  var lastTs = 0;
  var scaleX = 1;
  var scaleY = 1;
  var pointer = null;
  var effects = null;
  var sprites = {};

  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function presetLabel(id) {
    for (var i = 0; i < E.PRESETS.length; i++) if (E.PRESETS[i].id === id) return E.PRESETS[i].label;
    return id;
  }

  function loadSprites() {
    if (typeof Image === 'undefined') return;
    var files = { player: 'assets/player.png', cpu: 'assets/cpu.png' };
    for (var key in files) {
      if (!Object.prototype.hasOwnProperty.call(files, key)) continue;
      var img = new Image();
      img.src = files[key];
      sprites[key] = img;
    }
  }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var screens = [
      ['screen-title', els.screenTitle],
      ['screen-over', els.screenOver],
      ['screen-stage', els.screenStage],
      ['screen-ending', els.screenEnding],
      ['screen-pause', els.screenPause]
    ];
    for (var i = 0; i < screens.length; i++) {
      if (!screens[i][1]) continue;
      screens[i][1].classList.toggle('visible', screens[i][0] === name);
    }
  }

  function resetEffects() {
    effects = {
      particles: [], popups: [], rings: [],
      shake: 0, flash: 0, flashColor: '220, 255, 230',
      banner: null, fireworks: 0, fireworkTimer: 0,
      goalPulse: 0, resultDelay: 0
    };
  }

  function showTitle() {
    mode = 'title';
    game = null;
    pointer = null;
    resetEffects();
    setScreen('screen-title');
    if (els.hud) els.hud.classList.add('hidden');
    if (els.pause) els.pause.classList.add('hidden');
    lastTs = 0;
  }

  function beginMatch() {
    mode = 'match';
    if (Audio) Audio.start();
    game = E.createGame({ preset: presetId, stage: stageIndex });
    pointer = null;
    resetEffects();
    setScreen(null);
    if (els.hud) els.hud.classList.remove('hidden');
    if (els.pause) els.pause.classList.remove('hidden');
    lastTs = 0;
    syncUI();
  }

  function choosePreset(id) {
    presetId = id;
    stageIndex = 0;
    if (Audio) Audio.start();
    beginMatch();
  }

  function syncUI() {
    if (els.hud) els.hud.classList.toggle('hidden', mode !== 'match');
    if (!game) return;
    var st = E.getState(game);
    if (els.you) els.you.textContent = String(st.score.player);
    if (els.cpu) els.cpu.textContent = String(st.score.cpu);
    if (els.shots) els.shots.textContent = 'STAGE ' + (st.stage + 1) + '/' + st.stageTotal + ' · KICK ' + st.shots;
    if (els.turn) {
      var label = 'YOUR TURN';
      if (st.phase === 'over') label = 'FULL TIME';
      else if (st.phase === 'ringout') label = 'RING OUT!';
      else if (st.phase === 'cpuThink' || st.phase === 'cpuAim') label = 'CPU TURN';
      else if (st.phase === 'moving') label = st.turn === 'player' ? 'DASH!' : 'CPU DASH!';
      else if (st.phase === 'aim' && st.turn === 'cpu') label = 'CPU TURN';
      els.turn.textContent = label;
    }

    var target = null;
    if (st.phase === 'over' && !effects.resultDelay) {
      if (st.winner === 'player' && st.stage + 1 < st.stageTotal) target = 'screen-stage';
      else if (st.winner === 'player') target = 'screen-ending';
      else target = 'screen-over';
    } else if (st.paused) {
      target = 'screen-pause';
    }
    setScreen(target);
    if (els.pause) els.pause.classList.toggle('hidden', !(st.phase !== 'over' && !st.paused));

    if (st.phase === 'over') {
      var winner = st.winner;
      if (els.overKicker) els.overKicker.textContent = 'FIRST TO 3 RINGOUTS';
      if (els.overTitle) {
        els.overTitle.textContent = winner === 'player' ? 'YOU WIN' : (winner === 'cpu' ? 'CPU WIN' : 'DRAW');
        els.overTitle.className = 'result-title' + (winner === 'cpu' ? ' lose' : (winner === 'draw' ? ' draw' : ''));
      }
      if (els.overScore) els.overScore.textContent = st.score.player + ' - ' + st.score.cpu;
      if (els.overYou) els.overYou.textContent = String(st.score.player);
      if (els.overCpu) els.overCpu.textContent = String(st.score.cpu);
      if (els.overShots) els.overShots.textContent = String(st.shots);
      if (els.stageClearText && st.winner === 'player' && st.stage + 1 < st.stageTotal) {
        var nextStage = E.STAGES[st.stage + 1];
        els.stageClearText.textContent = 'STAGE ' + (st.stage + 2) + ' / ' + st.stageTotal + ' · CPU ' + presetLabel(nextStage.cpuPreset) + ' / LV.' + (st.stage + 2);
      }
    }
  }

  function syncAudioButton() {
    if (!els.sound) return;
    var muted = Audio ? Audio.isMuted() : true;
    els.sound.classList.toggle('muted', muted);
    els.sound.setAttribute('aria-label', muted ? 'BGMを再生' : 'BGMを消音');
  }

  function toggleAudio() {
    if (!Audio) return;
    Audio.toggle();
    syncAudioButton();
  }

  function pauseGame() {
    if (!game || game.phase === 'over' || game.paused) return;
    pointer = null;
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
    if (game.paused) resumeGame(); else pauseGame();
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
    sky.addColorStop(0, '#060d12');
    sky.addColorStop(0.45, '#071510');
    sky.addColorStop(1, '#020605');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    var glow = ctx.createRadialGradient(CENTER.x, CENTER.y, 20, CENTER.x, CENTER.y, 430);
    glow.addColorStop(0, 'rgba(255, 190, 90, 0.13)');
    glow.addColorStop(0.52, 'rgba(30, 110, 80, 0.08)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    for (var i = 0; i < 54; i++) {
      var x = mod(i * 97 + 31 - time * (4 + i % 6), C.VIEW_W);
      var y = mod(i * 61 + 17, 760);
      ctx.fillStyle = 'rgba(255, 226, 155, ' + (0.025 + (i % 4) * 0.015) + ')';
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  function drawArena(time) {
    var radius = game ? game.arenaRadius : E.STAGES[0].radius;
    ctx.save();
    var floor = ctx.createRadialGradient(CENTER.x, CENTER.y, 20, CENTER.x, CENTER.y, radius * 1.1);
    floor.addColorStop(0, '#173a2c');
    floor.addColorStop(0.62, '#0b241a');
    floor.addColorStop(0.94, '#07160f');
    floor.addColorStop(1, '#030907');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 209, 102, 0.12)';
    ctx.lineWidth = 1;
    for (var r = 1; r <= 4; r++) {
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, radius * r / 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(125, 245, 199, 0.12)';
    ctx.beginPath();
    ctx.moveTo(CENTER.x - radius, CENTER.y);
    ctx.lineTo(CENTER.x + radius, CENTER.y);
    ctx.moveTo(CENTER.x, CENTER.y - radius);
    ctx.lineTo(CENTER.x, CENTER.y + radius);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 209, 102, 0.94)';
    ctx.shadowColor = 'rgba(255, 190, 90, 0.7)';
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 240, 190, 0.46)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, radius - 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 209, 102, 0.12)';
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFighter(c, index, time) {
    if (!c || c.out) return;
    var sprite = c.team === 'cpu' ? sprites.cpu : sprites.player;
    var color = c.team === 'cpu' ? '#ff8fbd' : '#7df5c7';
    if (sprite && sprite.complete && sprite.naturalWidth) {
      var sh = 72;
      var sw = sh * sprite.naturalWidth / sprite.naturalHeight;
      var bob = Math.sin(time * 2 + index) * 1.2;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.drawImage(sprite, c.x - sw / 2, c.y - sh / 2 + bob, sw, sh);
      ctx.restore();
    } else {
      drawStickFigure(c, index, time);
    }
    ctx.save();
    if (c.guard > 0) {
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
      ctx.shadowColor = 'rgba(255, 209, 102, 0.75)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(255, 111, 159, 0.5)';
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.2;
    }
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 34, 16, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawStickFigure(c, index, time) {
    var color = c.team === 'cpu' ? '#ff8fbd' : (index % 2 === 0 ? '#7df5c7' : '#ffd166');
    var sway = Math.sin(time * 2 + index) * 2;
    ctx.save();
    ctx.translate(c.x, c.y);
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

  function drawFighters(time) {
    if (!game) return;
    for (var i = 0; i < game.chars.length; i++) drawFighter(game.chars[i], i, time);
  }

  function drawAim(st) {
    if (!game) return;
    var pullX = 0, pullY = 0, anchor = null, active = false;
    var color = st.turn === 'player' ? '#7df5c7' : '#ff8fbd';
    if (st.phase === 'aim' && st.turn === 'player' && pointer && pointer.index != null) {
      anchor = game.chars[pointer.index];
      if (anchor) {
        pullX = pointer.x - anchor.x;
        pullY = pointer.y - anchor.y;
        active = true;
      }
    } else if (st.phase === 'cpuAim' && st.cpuAim) {
      anchor = game.chars[st.cpuAim.index];
      if (anchor) {
        pullX = -st.cpuAim.vx / E.PULL_POWER;
        pullY = -st.cpuAim.vy / E.PULL_POWER;
        active = true;
      }
    }
    if (!active || !anchor) return;
    var len = Math.sqrt(pullX * pullX + pullY * pullY);
    if (len < 1) return;
    var max = E.MAX_PULL;
    if (len > max) { pullX = pullX / len * max; pullY = pullY / len * max; len = max; }
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 245, 200, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(anchor.x + pullX, anchor.y + pullY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    var sx = anchor.x - pullX;
    var sy = anchor.y - pullY;
    var angle = Math.atan2(-pullY, -pullX);
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
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
    ctx.arc(anchor.x + pullX, anchor.y + pullY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = '#e9fff5';
    ctx.font = '900 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(len / max * 100) + '%', anchor.x + pullX, anchor.y + pullY - 16);
    ctx.restore();
  }

  function drawBanner() {
    if (!effects.banner) return;
    var b = effects.banner;
    var alpha = clamp(b.life / b.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha * 1.7);
    var y = 300 - (1 - alpha) * 8;
    ctx.fillStyle = 'rgba(3, 12, 8, 0.84)';
    roundRect(60, y - 28, 360, 68, 14);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.3;
    roundRect(60, y - 28, 360, 68, 14);
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
    for (var ri = 0; ri < effects.rings.length; ri++) {
      var rg = effects.rings[ri];
      ctx.globalAlpha = clamp(rg.life / rg.maxLife, 0, 1) * 0.7;
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = rg.width;
      ctx.shadowColor = rg.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    for (var i = 0; i < effects.particles.length; i++) {
      var p = effects.particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.shape === 'rect' ? 4 : 9;
      if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
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
    if (effects.shake > 0) ctx.translate((Math.random() - 0.5) * 18 * effects.shake, (Math.random() - 0.5) * 18 * effects.shake);
    drawBackdrop(time);
    drawArena(time);
    if (game) {
      drawFighters(time);
      var st = E.getState(game);
      drawAim(st);
      var hint = '自分の選手を引っ張って離す / 相手をリングの外へ';
      if (st.phase === 'ringout') hint = 'RING OUT! 次のターンは失点側から';
      else if (st.phase === 'moving') hint = 'ぶつかった相手をリングの外へ押し出せ';
      ctx.fillStyle = 'rgba(170, 190, 175, 0.68)';
      ctx.font = '800 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hint, C.VIEW_W / 2, 752);
    }
    drawEffects();
    if (effects.goalPulse > 0) {
      var pulse = ctx.createRadialGradient(CENTER.x, CENTER.y, 20, CENTER.x, CENTER.y, 430);
      pulse.addColorStop(0, 'rgba(' + effects.flashColor + ', ' + (effects.goalPulse * 0.26) + ')');
      pulse.addColorStop(0.55, 'rgba(' + effects.flashColor + ', ' + (effects.goalPulse * 0.08) + ')');
      pulse.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = pulse;
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
    if (effects.flash > 0) {
      ctx.fillStyle = 'rgba(' + effects.flashColor + ', ' + Math.min(0.72, effects.flash * 0.62) + ')';
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
    ctx.restore();
  }

  function burst(x, y, count, colors, speed, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = speed * (0.35 + Math.random() * 0.9);
      effects.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        g: 480, life: life * (0.6 + Math.random() * 0.5), max: life,
        size: 1.5 + Math.random() * 3.8,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function confettiBurst(x, y, count, colors, speed, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = speed * (0.25 + Math.random() * 1.05);
      effects.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        g: 620, life: life * (0.65 + Math.random() * 0.7), max: life,
        size: 1.6 + Math.random() * 2.4,
        shape: 'rect', w: 3 + Math.random() * 5, h: 2 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 16,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function shockwave(x, y, color, maxR, life, width) {
    effects.rings.push({ x: x, y: y, r: 12, maxR: maxR, life: life, maxLife: life, color: color, width: width || 3 });
  }

  function popup(text, x, y, color, size) {
    effects.popups.push({ text: text, x: x, y: y, life: 0.8, max: 0.8, color: color, size: size || 15 });
  }

  function showBanner(text, sub, color) {
    effects.banner = { text: text, sub: sub || '', color: color || '#7df5c7', life: 1.35, max: 1.35 };
  }

  function processEvents() {
    if (!game) return;
    var events = E.consumeEvents(game);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'launch') {
        burst(ev.x, ev.y, 14, ev.team === 'player' ? ['#7df5c7', '#ffffff', '#ffd166'] : ['#ff8fbd', '#ffffff', '#ffd166'], 190, 0.45);
      } else if (ev.type === 'hit') {
        burst(ev.x, ev.y, 7, ['#ffd166', '#ffffff', '#ff8fbd', '#7df5c7'], 150, 0.35);
        popup('CLASH', ev.x, ev.y - 18, '#ffe6a3', 10);
      } else if (ev.type === 'edgeSave') {
        effects.flash = 0.36;
        effects.flashColor = '255, 220, 130';
        effects.shake = 0.65;
        showBanner('EDGE SAVE!', 'ふんばりがリング際で踏ん張った', '#ffd166');
        burst(ev.x, ev.y, 26, ['#ffd166', '#ffffff', '#7df5c7'], 260, 0.8);
        shockwave(ev.x, ev.y, '#ffd166', 90, 0.65, 3);
      } else if (ev.type === 'ringoutScored') {
        var color = ev.scorer === 'player' ? '#7df5c7' : '#ff8fbd';
        var colors = ev.scorer === 'player' ? ['#7df5c7', '#ffd166', '#ffffff', '#5ee7ff'] : ['#ff8fbd', '#ffd166', '#ffffff', '#b68cff'];
        effects.flash = 1.2;
        effects.flashColor = ev.scorer === 'player' ? '190, 255, 222' : '255, 150, 190';
        effects.shake = 1.5;
        effects.goalPulse = 1.2;
        effects.fireworks = 2.4;
        effects.fireworkTimer = 0;
        showBanner('RING OUT!', (ev.scorer === 'player' ? 'YOU' : 'CPU') + '  ' + ev.score.player + ' - ' + ev.score.cpu, color);
        confettiBurst(CENTER.x, CENTER.y, 120, colors, 430, 1.8);
        burst(CENTER.x, CENTER.y, 60, colors, 450, 1.4);
        shockwave(CENTER.x, CENTER.y, color, 250, 0.9, 6);
      } else if (ev.type === 'turn') {
        if (ev.turn === 'player') showBanner('YOUR TURN', '自分の選手を引っ張って離す', '#7df5c7');
        else showBanner('CPU TURN', 'CPUが押し出しを狙う', '#ff8fbd');
      } else if (ev.type === 'over') {
        effects.flash = 0.55;
        effects.resultDelay = 1.4;
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
      p.vx *= Math.exp(-dt * (p.shape === 'rect' ? 0.7 : 1.1));
      if (p.shape === 'rect') p.rot = (p.rot || 0) + (p.vr || 0) * dt;
    }
    for (i = effects.rings.length - 1; i >= 0; i--) {
      var ring = effects.rings[i];
      ring.life -= dt;
      ring.r += (ring.maxR - ring.r) * Math.min(1, dt * 7);
      if (ring.life <= 0) effects.rings.splice(i, 1);
    }
    for (i = effects.popups.length - 1; i >= 0; i--) {
      var pop = effects.popups[i];
      pop.life -= dt;
      pop.y -= 32 * dt;
      if (pop.life <= 0) effects.popups.splice(i, 1);
    }
    if (effects.shake > 0) effects.shake = Math.max(0, effects.shake - dt * 2.6);
    if (effects.flash > 0) effects.flash = Math.max(0, effects.flash - dt * 2.4);
    if (effects.goalPulse > 0) effects.goalPulse = Math.max(0, effects.goalPulse - dt * 1.4);
    if (effects.resultDelay > 0) effects.resultDelay = Math.max(0, effects.resultDelay - dt);
    if (effects.fireworks > 0) {
      effects.fireworks -= dt;
      effects.fireworkTimer -= dt;
      if (effects.fireworkTimer <= 0) {
        effects.fireworkTimer = 0.16;
        var fx = 70 + Math.random() * 340;
        var fy = 150 + Math.random() * 300;
        var fcolors = ['#7df5c7', '#ffd166', '#ffffff', '#5ee7ff', '#ff8fbd'];
        burst(fx, fy, 28, fcolors, 280, 1.0);
        shockwave(fx, fy, fcolors[Math.floor(Math.random() * fcolors.length)], 70, 0.6, 2);
      }
    }
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

  function nearPlayer(pos) {
    if (!game) return false;
    return E.charAt(game, pos.x, pos.y, 'player') >= 0;
  }

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    var pos = pointerPosition(e);
    if (!game || game.paused || game.phase !== 'aim' || game.turn !== 'player' || pointer) return;
    var index = E.charAt(game, pos.x, pos.y, 'player');
    if (index < 0) return;
    pointer = {
      id: e.pointerId == null ? 1 : e.pointerId,
      index: index,
      startX: pos.x, startY: pos.y, x: pos.x, y: pos.y
    };
    try { if (canvas.setPointerCapture) canvas.setPointerCapture(pointer.id); } catch (err) { }
  }

  function onPointerMove(e) {
    if (!pointer) {
      if (canvas) {
        var p = pointerPosition(e);
        canvas.style.cursor = nearPlayer(p) && game && game.phase === 'aim' && game.turn === 'player' ? 'grab' : 'default';
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
    var anchor = game.chars[p.index];
    if (!anchor) return;
    var dx = p.x - anchor.x;
    var dy = p.y - anchor.y;
    if (E.pullCharacter(game, p.index, dx, dy)) {
      processEvents();
      syncUI();
    }
  }

  function onKeyDown(e) {
    if (!e) return;
    var k = e.key || '';
    var code = e.code || '';
    if (k === 'm' || k === 'M') { toggleAudio(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game && game.phase !== 'over') {
        if (e.preventDefault) e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || code === 'Space') {
      if (e.preventDefault) e.preventDefault();
      if (mode === 'title') {
        if (!e.repeat) beginMatch();
      } else if (!game || game.phase === 'over') {
        if (!e.repeat) {
          if (game && game.phase === 'over' && game.winner === 'player') {
            if (game.stage + 1 < E.STAGES.length) {
              stageIndex = game.stage + 1;
              beginMatch();
              return;
            }
            showTitle();
            return;
          }
          if (game && game.phase === 'over') beginMatch();
          else showTitle();
        }
      } else if (game.paused) {
        resumeGame();
      }
    }
  }

  function resizeCanvas() {
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
    if (game && !game.paused && mode === 'match') {
      E.update(game, dt);
      processEvents();
      syncUI();
    }
    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function autoPlayStep() {
    if (mode === 'title') { beginMatch(); return; }
    if (!game || game.paused) return;
    if (game.phase === 'aim' && game.turn === 'player') {
      E.autoShot(game, 'player');
      processEvents();
      syncUI();
    }
  }

  function init() {
    canvas = $('game');
    els.hud = $('hud');
    els.you = $('you');
    els.cpu = $('cpu');
    els.turn = $('turn');
    els.shots = $('shots');
    els.sound = $('btn-sound');
    els.pause = $('btn-pause');
    els.screenTitle = $('screen-title');
    els.screenOver = $('screen-over');
    els.screenStage = $('screen-stage');
    els.screenEnding = $('screen-ending');
    els.screenPause = $('screen-pause');
    els.overKicker = $('over-kicker');
    els.overTitle = $('over-title');
    els.overScore = $('over-score');
    els.overYou = $('over-you');
    els.overCpu = $('over-cpu');
    els.overShots = $('over-shots');
    els.stageClearText = $('stage-clear-text');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }
    resetEffects();
    loadSprites();
    resizeCanvas();
    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');

    var retry = $('btn-retry');
    var resume = $('btn-resume');
    var nextStage = $('btn-next-stage');
    var endingRetry = $('btn-ending-retry');
    var presetButtons = [
      ['balanced', $('preset-balanced')],
      ['aggressive', $('preset-aggressive')],
      ['defensive', $('preset-defensive')]
    ];
    for (var i = 0; i < presetButtons.length; i++) {
      (function (id, button) {
        if (button) button.addEventListener('click', function () { choosePreset(id); });
      })(presetButtons[i][0], presetButtons[i][1]);
    }
    if (retry) retry.addEventListener('click', beginMatch);
    if (nextStage) nextStage.addEventListener('click', function () { stageIndex++; beginMatch(); });
    if (endingRetry) endingRetry.addEventListener('click', showTitle);
    if (resume) resume.addEventListener('click', resumeGame);
    if (els.pause) els.pause.addEventListener('click', togglePause);
    if (els.sound) els.sound.addEventListener('click', toggleAudio);
    syncAudioButton();

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
      id: 'stick-colosseum',
      title: 'スティック・コロシアム',
      start: function () { if (mode === 'title') { stageIndex = 0; beginMatch(); } else beginMatch(); },
      autoPlayStep: autoPlayStep,
      isDone: function () { return !!(game && game.phase === 'over'); },
      getState: function () {
        if (!game) return { id: 'stick-colosseum', phase: mode, stage: stageIndex, preset: presetId, score: { player: 0, cpu: 0 } };
        var state = E.getState(game);
        state.preset = presetId;
        return state;
      },
      getPreset: function () { return presetId; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
