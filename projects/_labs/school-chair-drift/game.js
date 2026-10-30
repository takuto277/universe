(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.SchoolChairDriftEngine;
  if (!E) return;
  var Audio = root.SoccerAudio;

  var C = E.C;
  var CHAIR_R = E.CHAIR_R;
  var canvas = null;
  var ctx = null;
  var els = {};
  var game = null;
  var mode = 'title';
  var shownScreen = 'screen-title';
  var stageIndex = 0;
  var lastTs = 0;
  var scaleX = 1;
  var scaleY = 1;
  var pointer = null;
  var effects = null;
  var skid = [];
  var tutorial = 0;
  var keySteer = 0;

  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

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
      particles: [], popups: [], rings: [], shake: 0, flash: 0,
      flashColor: '220, 255, 230', banner: null, fireworks: 0,
      fireworkTimer: 0, glow: 0, resultDelay: 0
    };
    skid = [];
  }

  function showTitle() {
    mode = 'title';
    game = null;
    pointer = null;
    stageIndex = 0;
    resetEffects();
    setScreen('screen-title');
    if (els.hud) els.hud.classList.add('hidden');
    if (els.pause) els.pause.classList.add('hidden');
    lastTs = 0;
  }

  function beginStage() {
    mode = 'match';
    if (Audio) Audio.start();
    game = E.createGame({ stage: stageIndex });
    pointer = null;
    keySteer = 0;
    tutorial = stageIndex === 0 ? 4 : 1.5;
    resetEffects();
    setScreen(null);
    if (els.hud) els.hud.classList.remove('hidden');
    if (els.pause) els.pause.classList.remove('hidden');
    lastTs = 0;
    syncUI();
  }

  function syncUI() {
    if (els.hud) els.hud.classList.toggle('hidden', mode !== 'match');
    if (!game) return;
    var st = E.getState(game);
    if (els.time) els.time.textContent = Math.max(0, st.time).toFixed(1);
    if (els.speed) els.speed.textContent = String(Math.round(st.chair.speed));
    if (els.turn) els.turn.textContent = st.stageName;
    if (els.shots) els.shots.textContent = 'STAGE ' + (st.stage + 1) + '/' + st.stageTotal + ' · ' + Math.round(st.progress * 100) + '%';

    var target = null;
    if (st.phase === 'clear' && !effects.resultDelay) {
      target = st.stage + 1 < st.stageTotal ? 'screen-stage' : 'screen-ending';
    } else if (st.phase === 'over' && !effects.resultDelay) {
      target = 'screen-over';
    } else if (st.paused) {
      target = 'screen-pause';
    }
    setScreen(target);
    if (els.pause) els.pause.classList.toggle('hidden', !(st.phase === 'playing' && !st.paused));

    if (st.phase === 'clear' && st.stage + 1 < st.stageTotal) {
      if (els.stageClearText) {
        els.stageClearText.textContent = 'TIME LEFT ' + st.finishTime.toFixed(1) + 's · MILK ' + st.milk + ' / NEXT ' + E.STAGES[st.stage + 1].name;
      }
    }
    if (st.phase === 'over') {
      if (els.overTime) els.overTime.textContent = '0.0';
      if (els.overMilk) els.overMilk.textContent = String(st.milk);
      if (els.overStage) els.overStage.textContent = (st.stage + 1) + '/' + st.stageTotal;
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
    if (!game || game.phase !== 'playing' || game.paused) return;
    pointer = null;
    E.setSteer(game, 0);
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
    sky.addColorStop(0, '#07121a');
    sky.addColorStop(0.45, '#071510');
    sky.addColorStop(1, '#020605');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    for (var i = 0; i < 52; i++) {
      var x = mod(i * 97 + 31 - time * (5 + i % 5), C.VIEW_W);
      var y = mod(i * 61 + 17, 780);
      ctx.fillStyle = 'rgba(160, 230, 255, ' + (0.025 + (i % 4) * 0.014) + ')';
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  function placeToScreen(wy) { return 600 + (wy - game.chair.y); }

  function drawCorridor(time) {
    var st = game;
    var stage = E.STAGES[st.stage];
    ctx.save();
    var top = -30;
    var bottom = 830;
    var step = 20;
    for (var sy = top; sy < bottom; sy += step) {
      var wy1 = st.chair.y + (sy - 600);
      var wy2 = st.chair.y + (sy + step - 600);
      var c1 = E.trackCenter(stage, wy1);
      var c2 = E.trackCenter(stage, wy2);
      var l1 = c1 - stage.halfWidth;
      var l2 = c2 - stage.halfWidth;
      var r1 = c1 + stage.halfWidth;
      var r2 = c2 + stage.halfWidth;
      ctx.fillStyle = (Math.floor((wy1 + stage.length) / 100) % 2 === 0) ? '#123426' : '#0d2a1f';
      ctx.beginPath();
      ctx.moveTo(l1, sy);
      ctx.lineTo(l2, sy + step);
      ctx.lineTo(r2, sy + step);
      ctx.lineTo(r1, sy);
      ctx.closePath();
      ctx.fill();
      if (sy > 580 && sy < 620) {
        ctx.fillStyle = 'rgba(255, 209, 102, 0.035)';
        ctx.fill();
      }
    }

    // wall edging
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.78)';
    ctx.shadowColor = 'rgba(255, 190, 90, 0.5)';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    var leftPoints = [];
    var rightPoints = [];
    for (sy = top; sy <= bottom; sy += 30) {
      var wy = st.chair.y + (sy - 600);
      var center = E.trackCenter(stage, wy);
      leftPoints.push([center - stage.halfWidth, sy]);
      rightPoints.push([center + stage.halfWidth, sy]);
    }
    ctx.beginPath();
    for (var i = 0; i < leftPoints.length; i++) {
      if (i === 0) ctx.moveTo(leftPoints[i][0], leftPoints[i][1]);
      else ctx.lineTo(leftPoints[i][0], leftPoints[i][1]);
    }
    ctx.stroke();
    ctx.beginPath();
    for (i = 0; i < rightPoints.length; i++) {
      if (i === 0) ctx.moveTo(rightPoints[i][0], rightPoints[i][1]);
      else ctx.lineTo(rightPoints[i][0], rightPoints[i][1]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // school wall details
    var startWy = Math.ceil((st.chair.y - 220) / 240) * 240;
    for (var wy = startWy; wy < st.chair.y + 500; wy += 240) {
      var yy = placeToScreen(wy);
      if (yy < -80 || yy > 880) continue;
      var cx = E.trackCenter(stage, wy);
      ctx.fillStyle = 'rgba(80, 150, 140, 0.14)';
      ctx.fillRect(cx - stage.halfWidth - 24, yy, 18, 92);
      ctx.fillRect(cx + stage.halfWidth + 6, yy, 18, 92);
      ctx.strokeStyle = 'rgba(160, 240, 220, 0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - stage.halfWidth - 24, yy, 18, 92);
      ctx.strokeRect(cx + stage.halfWidth + 6, yy, 18, 92);
    }

    // finish gate
    var finishY = placeToScreen(-stage.length);
    if (finishY > -100 && finishY < 900) {
      var fc = E.trackCenter(stage, -stage.length);
      ctx.save();
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 12; col++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(255,255,255,0.82)' : 'rgba(12, 30, 22, 0.82)';
          ctx.fillRect(fc - stage.halfWidth + col * (stage.halfWidth * 2 / 12), finishY - 18 + row * 12, stage.halfWidth * 2 / 12, 12);
        }
      }
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(fc - stage.halfWidth, finishY - 22, stage.halfWidth * 2, 40);
      ctx.fillStyle = '#ffe6a3';
      ctx.font = '900 10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GOAL', fc, finishY - 32);
      ctx.restore();
    }

    // obstacles
    for (i = 0; i < st.obstacles.length; i++) {
      var o = st.obstacles[i];
      var osy = placeToScreen(o.wy);
      if (osy < -80 || osy > 880) continue;
      drawFurniture(o, osy);
    }
    for (i = 0; i < st.milks.length; i++) {
      var m = st.milks[i];
      if (m.taken) continue;
      var msy = placeToScreen(m.wy);
      if (msy < -40 || msy > 840) continue;
      drawMilk(m.x, msy);
    }

    // skid marks
    for (i = 0; i < skid.length; i++) {
      var s = skid[i];
      ctx.globalAlpha = clamp(s.life / s.max, 0, 1) * 0.22;
      ctx.fillStyle = '#bfffe6';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 5, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawFurniture(o, sy) {
    var x = o.x;
    var w = o.w;
    var h = o.h;
    ctx.save();
    if (o.kind === 'bucket') {
      ctx.fillStyle = 'rgba(104, 180, 180, 0.5)';
      ctx.strokeStyle = 'rgba(180, 255, 235, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, sy, Math.max(w, h) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 255, 245, 0.4)';
      ctx.beginPath();
      ctx.arc(x, sy, Math.max(w, h) / 2 - 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (o.kind === 'plant') {
      ctx.fillStyle = 'rgba(35, 90, 55, 0.8)';
      ctx.strokeStyle = 'rgba(130, 245, 160, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, sy, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(120, 235, 150, 0.55)';
      ctx.beginPath();
      ctx.arc(x - 5, sy - 5, w / 5, 0, Math.PI * 2);
      ctx.arc(x + 6, sy + 2, w / 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      var fill = o.kind === 'locker' ? 'rgba(55, 90, 125, 0.72)' : (o.kind === 'cart' ? 'rgba(150, 105, 55, 0.75)' : 'rgba(85, 66, 48, 0.8)');
      var stroke = o.kind === 'locker' ? 'rgba(130, 220, 255, 0.72)' : 'rgba(255, 209, 102, 0.68)';
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      roundRect(x - w / 2, sy - h / 2, w, h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x - w / 2 + 7, sy - h / 2 + 7, w - 14, 5);
      if (o.kind === 'desk') {
        ctx.fillStyle = 'rgba(20, 30, 25, 0.8)';
        ctx.fillRect(x - w * 0.24, sy - h * 0.2, w * 0.48, h * 0.34);
      } else if (o.kind === 'locker') {
        ctx.strokeStyle = 'rgba(200, 245, 255, 0.25)';
        ctx.beginPath();
        ctx.moveTo(x, sy - h / 2 + 6);
        ctx.lineTo(x, sy + h / 2 - 6);
        ctx.stroke();
      } else if (o.kind === 'cart') {
        ctx.fillStyle = 'rgba(10, 20, 16, 0.75)';
        ctx.beginPath();
        ctx.arc(x - w * 0.27, sy + h * 0.36, 6, 0, Math.PI * 2);
        ctx.arc(x + w * 0.27, sy + h * 0.36, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (o.hit) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x - w / 2, sy - h / 2, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawMilk(x, y) {
    ctx.save();
    ctx.shadowColor = 'rgba(220, 255, 240, 0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#e9fff4';
    ctx.strokeStyle = '#7df5c7';
    ctx.lineWidth = 1.5;
    roundRect(x - 9, y - 12, 18, 24, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5ee7ff';
    ctx.fillRect(x - 7, y - 6, 14, 3);
    ctx.fillStyle = '#1a4030';
    ctx.font = '900 5px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MILK', x, y + 7);
    ctx.restore();
  }

  function drawChair() {
    var c = game.chair;
    var x = c.x;
    var y = 600;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.angle);

    // shadow and five-star caster base
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 17, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(180, 255, 232, 0.75)';
    ctx.fillStyle = 'rgba(10, 25, 19, 0.95)';
    ctx.lineWidth = 2;
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      var wx = Math.cos(a) * 21;
      var wy = Math.sin(a) * 21;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(wx, wy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wx, wy, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // seat
    ctx.shadowColor = 'rgba(125, 245, 199, 0.65)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#1c5c48';
    ctx.strokeStyle = '#8ff0d0';
    ctx.lineWidth = 2;
    roundRect(-16, -12, 32, 27, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(190, 255, 235, 0.12)';
    roundRect(-12, -8, 24, 8, 4);
    ctx.fill();

    // backrest and armrests
    ctx.fillStyle = '#123d2f';
    roundRect(-15, -26, 30, 12, 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(143, 240, 208, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, -24);
    ctx.lineTo(-12, -15);
    ctx.moveTo(12, -24);
    ctx.lineTo(12, -15);
    ctx.stroke();

    // rider
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, -6, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7df5c7';
    ctx.fillRect(-3.4, -2, 6.8, 9);
    ctx.restore();

    if (game.drifting) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + 16, 27, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHudBar() {
    var st = E.getState(game);
    var barW = 190;
    var x = (C.VIEW_W - barW) / 2;
    var y = 758;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 14, 10, 0.76)';
    roundRect(x - 9, y - 9, barW + 18, 24, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(125, 245, 199, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(125, 245, 199, 0.16)';
    roundRect(x, y - 3, barW, 12, 6);
    ctx.fill();
    var grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0, '#7df5c7');
    grad.addColorStop(0.6, '#ffd166');
    grad.addColorStop(1, '#ff8fbd');
    ctx.fillStyle = grad;
    roundRect(x, y - 3, barW * st.drift, 12, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(230, 255, 242, 0.82)';
    ctx.font = '900 7px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('DRIFT', x - 2, y - 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = st.boost > 0 ? '#ffd166' : 'rgba(230, 255, 242, 0.58)';
    ctx.fillText(st.boost > 0 ? 'BOOST!' : Math.round(st.drift * 100) + '%', x + barW + 2, y - 12);
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
    if (effects.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * effects.shake, (Math.random() - 0.5) * 14 * effects.shake);
    drawBackdrop(time);
    if (game) {
      drawCorridor(time);
      drawChair();
      drawHudBar();
      var hint = 'ドラッグで曲がる / 離すと直進';
      if (tutorial > 0) hint = '← ドラッグで曲がる → / 離すと直進';
      ctx.fillStyle = 'rgba(180, 210, 195, 0.68)';
      ctx.font = '800 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hint, C.VIEW_W / 2, 788);
    }
    drawEffects();
    if (effects.flash > 0) {
      ctx.fillStyle = 'rgba(' + effects.flashColor + ', ' + Math.min(0.7, effects.flash * 0.6) + ')';
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
        size: 1.5 + Math.random() * 3.6,
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
      if (ev.type === 'crash') {
        effects.shake = 0.7;
        burst(ev.x, 600 + (ev.y - game.chair.y), 16, ['#ffd166', '#ffffff', '#ff8fbd'], 170, 0.5);
        popup('BONK', ev.x, 570, '#ffe6a3', 12);
      } else if (ev.type === 'wall') {
        effects.shake = Math.max(effects.shake, 0.35);
        burst(ev.side === 'left' ? 30 : 450, 600, 6, ['#ffd166', '#ffffff'], 120, 0.3);
      } else if (ev.type === 'milk') {
        showBanner('MILK +1.4s', 'タイム回復', '#7df5c7');
        burst(ev.x, 600 + (ev.y - game.chair.y), 20, ['#ffffff', '#5ee7ff', '#7df5c7'], 220, 0.7);
      } else if (ev.type === 'boost') {
        effects.shake = 0.35;
        showBanner('DRIFT BOOST!', 'ドリフトゲージMAX', '#ffd166');
        burst(game.chair.x, 600, 34, ['#ffd166', '#ffffff', '#7df5c7'], 300, 0.8);
        shockwave(game.chair.x, 600, '#ffd166', 90, 0.6, 3);
      } else if (ev.type === 'finish') {
        effects.flash = 1.0;
        effects.flashColor = '190, 255, 222';
        effects.shake = 1.2;
        effects.fireworks = 2.4;
        effects.fireworkTimer = 0;
        effects.resultDelay = 1.2;
        showBanner('FINISH!', 'TIME LEFT ' + ev.time.toFixed(1) + 's', '#7df5c7');
        confettiBurst(240, 300, 130, ['#7df5c7', '#ffd166', '#ffffff', '#5ee7ff', '#ff8fbd'], 420, 1.8);
        shockwave(240, 300, '#7df5c7', 260, 0.9, 6);
      } else if (ev.type === 'timeup') {
        effects.flash = 0.7;
        effects.resultDelay = 1.2;
        showBanner('TIME UP', 'チャイムまでにゴールできなかった', '#ff8fbd');
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
    for (i = skid.length - 1; i >= 0; i--) {
      skid[i].life -= dt;
      if (skid[i].life <= 0) skid.splice(i, 1);
    }
    if (effects.shake > 0) effects.shake = Math.max(0, effects.shake - dt * 2.6);
    if (effects.flash > 0) effects.flash = Math.max(0, effects.flash - dt * 2.4);
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

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!game || game.paused || game.phase !== 'playing' || pointer) return;
    var pos = pointerPosition(e);
    pointer = { id: e.pointerId == null ? 1 : e.pointerId, startX: pos.x, x: pos.x };
    E.setSteer(game, 0);
    try { if (canvas.setPointerCapture) canvas.setPointerCapture(pointer.id); } catch (err) { }
  }

  function onPointerMove(e) {
    if (!pointer) return;
    if ((e.pointerId == null ? 1 : e.pointerId) !== pointer.id) return;
    var pos = pointerPosition(e);
    pointer.x = pos.x;
    if (game && game.phase === 'playing') E.setSteer(game, clamp((pointer.x - pointer.startX) / 70, -1, 1));
  }

  function onPointerUp(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!pointer) return;
    var id = e.pointerId == null ? 1 : e.pointerId;
    if (id !== pointer.id) return;
    pointer = null;
    if (game) E.setSteer(game, keySteer);
    try { if (canvas.releasePointerCapture) canvas.releasePointerCapture(id); } catch (err) { }
  }

  function onKeyDown(e) {
    if (!e) return;
    var k = e.key || '';
    var code = e.code || '';
    if (k === 'm' || k === 'M') { toggleAudio(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game && game.phase === 'playing') {
        if (e.preventDefault) e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      keySteer = -1;
      if (game && game.phase === 'playing') E.setSteer(game, keySteer);
      return;
    }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      keySteer = 1;
      if (game && game.phase === 'playing') E.setSteer(game, keySteer);
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || code === 'Space') {
      if (e.preventDefault) e.preventDefault();
      if (mode === 'title') { beginStage(); return; }
      if (!game) return;
      if (game.phase === 'clear' && !effects.resultDelay) {
        if (game.stage + 1 < game.stageTotal) { stageIndex = game.stage + 1; beginStage(); }
        else { stageIndex = 0; showTitle(); }
      } else if (game.phase === 'over' && !effects.resultDelay) {
        beginStage();
      } else if (game.paused) {
        resumeGame();
      }
    }
  }

  function onKeyUp(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D') {
      keySteer = 0;
      if (game && game.phase === 'playing') E.setSteer(game, 0);
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
      if (game.drifting && game.phase === 'playing') {
        skid.push({ x: game.chair.x - 10, y: 610, life: 0.55, max: 0.55 });
        skid.push({ x: game.chair.x + 10, y: 610, life: 0.55, max: 0.55 });
        if (skid.length > 90) skid.splice(0, skid.length - 90);
      }
      if (tutorial > 0) tutorial -= dt;
      processEvents();
      syncUI();
    }
    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function autoPlayStep() {
    if (mode === 'title') { stageIndex = 0; beginStage(); return; }
    if (!game || game.paused || game.phase !== 'playing') return;
    var st = E.getState(game);
    var stage = E.STAGES[st.stage];
    var target = E.trackCenter(stage, st.chair.y - 110);
    E.setSteer(game, clamp((target - st.chair.x) / 80, -1, 1));
  }

  function init() {
    canvas = $('game');
    els.hud = $('hud');
    els.time = $('time');
    els.turn = $('turn');
    els.shots = $('shots');
    els.speed = $('speed');
    els.sound = $('btn-sound');
    els.pause = $('btn-pause');
    els.screenTitle = $('screen-title');
    els.screenOver = $('screen-over');
    els.screenStage = $('screen-stage');
    els.screenEnding = $('screen-ending');
    els.screenPause = $('screen-pause');
    els.overTime = $('over-time');
    els.overMilk = $('over-milk');
    els.overStage = $('over-stage');
    els.stageClearText = $('stage-clear-text');

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
    var nextStage = $('btn-next-stage');
    var endingRetry = $('btn-ending-retry');
    if (start) start.addEventListener('click', function () { stageIndex = 0; beginStage(); });
    if (retry) retry.addEventListener('click', beginStage);
    if (nextStage) nextStage.addEventListener('click', function () { stageIndex++; beginStage(); });
    if (endingRetry) endingRetry.addEventListener('click', showTitle);
    if (resume) resume.addEventListener('click', resumeGame);
    if (els.pause) els.pause.addEventListener('click', togglePause);
    if (els.sound) els.sound.addEventListener('click', toggleAudio);
    syncAudioButton();

    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown, false);
      canvas.addEventListener('pointermove', onPointerMove, false);
      canvas.addEventListener('pointerup', onPointerUp, false);
      canvas.addEventListener('pointercancel', function () { pointer = null; if (game) E.setSteer(game, keySteer); }, false);
      canvas.addEventListener('contextmenu', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
      canvas.addEventListener('dblclick', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    }
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
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
      id: 'school-chair-drift',
      title: '放課後チェア・ドリフト',
      start: function () { stageIndex = 0; beginStage(); },
      autoPlayStep: autoPlayStep,
      isDone: function () { return !!(game && (game.phase === 'clear' || game.phase === 'over')); },
      getState: function () {
        if (!game) return { id: 'school-chair-drift', phase: mode, stage: stageIndex, stageTotal: E.STAGES.length };
        return E.getState(game);
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
