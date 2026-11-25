/* game.js : TUTOR（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.TutorEngine) ? window.TutorEngine : null;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var game = E.createGame();

  var els = {
    phase: document.getElementById('phase-label'),
    samples: document.getElementById('samples'),
    cores: document.getElementById('cores'),
    time: document.getElementById('time'),
    hint: document.getElementById('hint'),
    start: document.getElementById('start-overlay'),
    result: document.getElementById('result-overlay'),
    resultTitle: document.getElementById('result-title'),
    resultSub: document.getElementById('result-sub'),
    resultCores: document.getElementById('result-cores'),
    resultHits: document.getElementById('result-hits'),
    resultSamples: document.getElementById('result-samples'),
    resultRank: document.getElementById('result-rank'),
    resultBest: document.getElementById('result-best'),
    bestStart: document.getElementById('best-start'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right')
  };

  var best = 0;
  try { best = Number(window.localStorage && window.localStorage.getItem('tutor-best')) || 0; } catch (e) { best = 0; }

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
  var shake = 0;
  var flash = 0;
  var particles = [];

  function show(el, on) { if (el && el.classList) el.classList.toggle('visible', !!on); }
  function setText(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function saveBest(value) {
    try { if (window.localStorage) window.localStorage.setItem('tutor-best', String(value)); } catch (e) { }
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

  function burst(worldX, worldY, color, count, spread) {
    var x = sx(worldX);
    var y = sy(worldY);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = (50 + Math.random() * 170) * (spread || 1);
      particles.push({
        x: x,
        y: y,
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
    if (flash > 0) flash = Math.max(0, flash - dt * 2.4);
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
      if (ev.type === 'catch') {
        burst(ev.x, ev.y, '#ffd166', 12, 0.9);
      } else if (ev.type === 'bomb') {
        burst(ev.x, ev.y, '#ff5d73', 26, 1.2);
        shake = 1;
        flash = 1;
      } else if (ev.type === 'finish') {
        showEnd();
      }
    }
    seenEvents = game.events.length;
  }

  function updateHud() {
    var s = E.snapshot(game);
    if (!s) return;
    var phaseText = 'READY';
    var timeText = '—';
    if (s.phase === 'demo') {
      phaseText = 'DEMO ' + s.demoIndex + '/' + s.demoCount;
      timeText = Math.max(0, s.demoTime - s.demoTimer).toFixed(1);
    } else if (s.phase === 'train') {
      phaseText = 'TRAINING';
      timeText = 'AI';
    } else if (s.phase === 'eval') {
      phaseText = 'TRIAL ' + s.trialIndex + '/' + s.trialCount;
      timeText = Math.max(0, s.trialTime - s.trialTimer).toFixed(1);
    } else if (s.phase === 'finished') {
      phaseText = 'RESULT';
      timeText = '—';
    }
    setText(els.phase, phaseText);
    setText(els.samples, s.samples);
    setText(els.cores, s.phase === 'demo' ? s.demoCores : s.scoreSoFar);
    setText(els.time, timeText);
    if (els.hint) {
      if (s.phase === 'demo') els.hint.textContent = '← → で手本。コアを取り、ボムを避ける';
      else if (s.phase === 'train') els.hint.textContent = '手本 ' + s.samples + ' 件から動きを学習中…';
      else if (s.phase === 'eval') els.hint.textContent = 'AIが10回の本番をプレイ中（3倍速）';
      else els.hint.textContent = '手本を変えるとAIの成績が変わる';
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
    setText(els.resultTitle, r.rank);
    if (els.resultTitle) {
      els.resultTitle.classList.toggle('clear', r.rank === 'S' || r.rank === 'A');
      els.resultTitle.classList.toggle('down', r.rank === 'D');
    }
    setText(els.resultSub, r.score >= 25
      ? 'AIはコアを ' + r.score + ' 個取った。手本が効いている。'
      : 'AIはコアを ' + r.score + ' 個しか取れなかった。手本を見直そう。');
    setText(els.resultCores, r.cores);
    setText(els.resultHits, r.hits);
    setText(els.resultSamples, r.samples);
    setText(els.resultRank, 'TRIALS ' + r.trialsDone + ' / ' + r.trials);
    setText(els.resultBest, best);
    setText(els.bestStart, 'BEST ' + best);
    show(els.start, false);
    show(els.result, true);
  }

  function applyMove() {
    if (game.phase !== 'demo') return;
    E.setInput(game, (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0));
  }

  function begin() {
    E.start(game);
    leftHeld = false;
    rightHeld = false;
    seenEvents = 0;
    overShown = false;
    lastTs = 0;
    particles = [];
    shake = 0;
    flash = 0;
    show(els.start, false);
    show(els.result, false);
    updateHud();
  }

  function drawBackground(time) {
    var bg = ctx.createLinearGradient(0, 0, 0, viewH);
    bg.addColorStop(0, '#0a1226');
    bg.addColorStop(0.55, '#060b16');
    bg.addColorStop(1, '#02040a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    ctx.strokeStyle = 'rgba(93,244,255,.06)';
    ctx.lineWidth = 1;
    for (var x = 40; x < E.W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, E.H);
      ctx.stroke();
    }
    for (var y = 80; y < E.H; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(E.W, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(93,244,255,.14)';
    ctx.strokeRect(0.5, 0.5, E.W - 1, E.H - 1);

    ctx.fillStyle = 'rgba(93,244,255,.35)';
    ctx.fillRect(0, E.ROBOT_Y + 30, E.W, 2);

    ctx.fillStyle = 'rgba(160,200,255,.16)';
    for (var i = 0; i < 34; i++) {
      var px = (i * 137.5) % E.W;
      var py = (i * 83.7 + time * 12) % E.H;
      ctx.fillRect(px, py, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
    }
    ctx.restore();
  }

  function drawObjects(time) {
    for (var i = 0; i < game.objects.length; i++) {
      var obj = game.objects[i];
      var x = sx(obj.x);
      var y = sy(obj.y);
      var r = obj.r * scale;
      if (obj.kind === 'core') {
        var pulse = 0.85 + Math.sin(time * 6 + i) * 0.15;
        ctx.save();
        ctx.shadowColor = '#ffd166';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(x, y - r * pulse);
        ctx.lineTo(x + r * 0.8 * pulse, y);
        ctx.lineTo(x, y + r * pulse);
        ctx.lineTo(x - r * 0.8 * pulse, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff4c9';
        ctx.beginPath();
        ctx.arc(x - r * 0.16, y - r * 0.16, r * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * 2.4 + i);
        ctx.shadowColor = '#ff5d73';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ff5d73';
        ctx.beginPath();
        for (var k = 0; k < 10; k++) {
          var a = k * Math.PI / 5;
          var rad = k % 2 === 0 ? r : r * 0.62;
          if (k === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawRobot(time) {
    var s = E.snapshot(game);
    var x = sx(game.robot.x);
    var y = sy(game.robot.y);
    var r = game.robot.r * scale;
    var dir = s && s.phase === 'eval' ? s.aiDir : game.input;
    var tilt = dir * 0.16;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.shadowColor = '#5df4ff';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#5df4ff';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-r, -r * 0.8, r * 2, r * 1.7, r * 0.5) : ctx.rect(-r, -r * 0.8, r * 2, r * 1.7);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#b8fbff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.8);
    ctx.lineTo(x, y - r * 1.7);
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(x, y - r * 1.85, r * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#06101f';
    var look = dir * r * 0.2;
    ctx.beginPath();
    ctx.arc(x - r * 0.38 + look, y - r * 0.06, r * 0.19, 0, Math.PI * 2);
    ctx.arc(x + r * 0.38 + look, y - r * 0.06, r * 0.19, 0, Math.PI * 2);
    ctx.fill();

    if (s && s.phase === 'eval') {
      ctx.fillStyle = 'rgba(93,244,255,.85)';
      ctx.font = '900 ' + Math.max(10, 11 * scale) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AI', x, y - r * 2.3);
    } else if (s && s.phase === 'demo') {
      ctx.fillStyle = 'rgba(255,93,115,.9)';
      ctx.beginPath();
      ctx.arc(x, y - r * 2.3, 3.2 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(232,242,255,.75)';
      ctx.font = '800 ' + Math.max(9, 10 * scale) + 'px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('REC', x + 7 * scale, y - r * 2.1);
    }
  }

  function drawTrialPips() {
    var s = E.snapshot(game);
    if (!s || (s.phase !== 'eval' && s.phase !== 'finished')) return;
    var total = s.trialCount;
    var gap = 5 * scale;
    var barW = (E.W * scale - gap * (total - 1) - 40 * scale) / total;
    var startX = sx(20);
    var y = oy + 74;
    for (var i = 0; i < total; i++) {
      var x = startX + i * (barW + gap);
      var trial = s.trials[i];
      var active = i === s.trialIndex - 1 && s.phase === 'eval';
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(x, y, barW, 6);
      if (trial) {
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(x, y, barW * Math.min(1, trial.cores / 6), 6);
      } else if (active) {
        ctx.fillStyle = 'rgba(93,244,255,.65)';
        ctx.fillRect(x, y, barW, 6);
      }
    }
  }

  function drawTrainOverlay() {
    var s = E.snapshot(game);
    if (!s || s.phase !== 'train') return;
    var progress = 1 - Math.max(0, s.phaseTimer) / E.TRAIN_PAUSE;
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,16,.78)';
    ctx.fillRect(ox, oy + E.H * scale * 0.32, E.W * scale, E.H * scale * 0.2);
    ctx.fillStyle = '#5df4ff';
    ctx.textAlign = 'center';
    ctx.font = '900 ' + Math.max(20, 30 * scale) + 'px system-ui, sans-serif';
    ctx.fillText('TRAINING AI', viewW / 2, oy + E.H * scale * 0.41);
    ctx.fillStyle = 'rgba(232,242,255,.7)';
    ctx.font = '700 ' + Math.max(10, 12 * scale) + 'px system-ui, sans-serif';
    ctx.fillText(s.samples + ' SAMPLES', viewW / 2, oy + E.H * scale * 0.45);
    var barW = E.W * scale * 0.6;
    var barX = viewW / 2 - barW / 2;
    var barY = oy + E.H * scale * 0.48;
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(barX, barY, barW, 5);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(barX, barY, barW * progress, 5);
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

  function draw(time) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var oxShake = shake > 0 ? (Math.random() * 2 - 1) * shake * 6 : 0;
    var oyShake = shake > 0 ? (Math.random() * 2 - 1) * shake * 6 : 0;
    ctx.save();
    ctx.translate(oxShake, oyShake);
    drawBackground(time);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, E.W * scale, E.H * scale);
    ctx.clip();
    drawObjects(time);
    drawRobot(time);
    drawEffects();
    drawTrialPips();
    drawTrainOverlay();
    ctx.restore();
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.3;
      ctx.fillStyle = '#ff5d73';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function loop(now) {
    if (now == null) now = (window.performance ? window.performance.now() : Date.now());
    var dt = lastTs ? (now - lastTs) / 1000 : 0;
    lastTs = now;
    E.update(game, Math.min(0.05, dt));
    processEvents();
    updateHud();
    syncScreens();
    updateEffects(Math.min(0.05, dt));
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
    if (game.phase !== 'demo') return;
    if (code === 'ArrowLeft' || code === 'KeyA') {
      if (event.preventDefault) event.preventDefault();
      leftHeld = true;
      applyMove();
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      if (event.preventDefault) event.preventDefault();
      rightHeld = true;
      applyMove();
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
  bindHold(els.btnLeft, function () { leftHeld = true; applyMove(); }, function () { leftHeld = false; applyMove(); });
  bindHold(els.btnRight, function () { rightHeld = true; applyMove(); }, function () { rightHeld = false; applyMove(); });

  setText(els.bestStart, 'BEST ' + best);
  updateHud();

  window.__GAME__ = {
    id: 'tutor',
    title: 'TUTOR',
    start: begin,
    autoPlayStep: function () { E.autoStep(game); },
    isDone: function () { return game.phase === 'finished'; },
    getState: function () { return E.snapshot(game); }
  };

  if (window.requestAnimationFrame) window.requestAnimationFrame(loop);
})();
