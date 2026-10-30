(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.NightMiniGolfEngine;
  if (!E) return;
  var Audio = root.SoccerAudio;

  var C = { w: 480, h: 800 };
  var F = E.FIELD;
  var canvas = null;
  var ctx = null;
  var els = {};
  var game = null;
  var mode = 'title';
  var shownScreen = 'screen-title';
  var stageIndex = 0;
  var holeIndex = 0;
  var stageStrokes = 0;
  var totalStrokes = 0;
  var stagePar = 0;
  var totalPar = 0;
  var lastTs = 0;
  var scaleX = 1;
  var scaleY = 1;
  var pointer = null;
  var effects = null;
  var trail = [];
  var advanceTimer = 0;
  var holeFinalized = false;
  var sinkBanner = null;

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var screens = [
      ['screen-title', els.screenTitle], ['screen-stage', els.screenStage],
      ['screen-ending', els.screenEnding], ['screen-pause', els.screenPause]
    ];
    for (var i = 0; i < screens.length; i++) {
      if (screens[i][1]) screens[i][1].classList.toggle('visible', screens[i][0] === name);
    }
  }

  function resetEffects() {
    effects = { particles: [], popups: [], rings: [], shake: 0, flash: 0, flashColor: '220,255,230', banner: null, fireworks: 0, fireTimer: 0 };
    trail = [];
    sinkBanner = null;
  }

  function showTitle() {
    mode = 'title';
    game = null;
    stageIndex = 0;
    holeIndex = 0;
    stageStrokes = 0;
    totalStrokes = 0;
    stagePar = 0;
    totalPar = 0;
    pointer = null;
    resetEffects();
    setScreen('screen-title');
    if (els.hud) els.hud.classList.add('hidden');
    if (els.pause) els.pause.classList.add('hidden');
    lastTs = 0;
  }

  function startTour() {
    stageIndex = 0;
    holeIndex = 0;
    stageStrokes = 0;
    totalStrokes = 0;
    stagePar = 0;
    totalPar = 0;
    beginHole();
  }

  function beginHole() {
    if (Audio) Audio.start();
    mode = 'hole';
    game = E.createGame({ stage: stageIndex, hole: holeIndex });
    pointer = null;
    advanceTimer = 0;
    holeFinalized = false;
    resetEffects();
    setScreen(null);
    if (els.hud) els.hud.classList.remove('hidden');
    if (els.pause) els.pause.classList.remove('hidden');
    lastTs = 0;
    syncUI();
  }

  function syncUI() {
    if (els.hud) els.hud.classList.toggle('hidden', mode !== 'hole');
    if (!game) return;
    var st = E.getState(game);
    if (els.hole) els.hole.textContent = (st.hole + 1) + '/' + st.holeTotal;
    if (els.turn) els.turn.textContent = st.stageName;
    if (els.par) els.par.textContent = 'PAR ' + st.par + ' · STROKES ' + st.strokes;
    if (els.strokes) els.strokes.textContent = String(totalStrokes + (holeFinalized ? 0 : st.strokes));
    if (els.pause) els.pause.classList.toggle('hidden', mode !== 'hole' || game.paused);
  }

  function stageClear() {
    mode = 'stage';
    game.phase = 'clear';
    if (stageIndex + 1 < E.STAGES.length) {
      setScreen('screen-stage');
      if (els.stageStrokes) els.stageStrokes.textContent = String(stageStrokes);
      if (els.stagePar) els.stagePar.textContent = String(stagePar);
      if (els.stageTotal) els.stageTotal.textContent = String(totalStrokes);
      if (els.stageScore) els.stageScore.textContent = scoreText(stageStrokes - stagePar);
      if (els.stageClearText) els.stageClearText.textContent = '次は ' + E.STAGES[stageIndex + 1].name + '。';
    } else {
      mode = 'ending';
      setScreen('screen-ending');
      if (els.endingStrokes) els.endingStrokes.textContent = String(totalStrokes);
      if (els.endingPar) els.endingPar.textContent = String(totalPar);
      if (els.endingScore) els.endingScore.textContent = scoreText(totalStrokes - totalPar);
    }
    if (els.pause) els.pause.classList.add('hidden');
  }

  function scoreText(n) { return n === 0 ? 'EVEN' : (n > 0 ? '+' + n : String(n)); }

  function finishHole() {
    if (holeFinalized) return;
    holeFinalized = true;
    stageStrokes += game.strokes;
    totalStrokes += game.strokes;
    stagePar += game.par;
    totalPar += game.par;
    advanceTimer = 1.15;
    var diff = game.strokes - game.par;
    var title = game.strokes === 1 ? 'HOLE IN ONE!' : (diff < 0 ? 'BIRDIE!' : (diff === 0 ? 'PAR' : (diff === 1 ? 'BOGEY' : 'HOLE CLEAR')));
    sinkBanner = { text: title, sub: game.strokes + ' STROKES / PAR ' + game.par, color: diff <= 0 ? '#7df5c7' : '#ffd166' };
    effects.flash = 0.8;
    effects.flashColor = '180,255,220';
    effects.shake = 0.5;
    effects.fireworks = 1.6;
    effects.fireTimer = 0;
    confettiBurst(game.target.x, game.target.y, 80, ['#7df5c7', '#ffd166', '#ffffff', '#5ee7ff'], 300, 1.5);
    shockwave(game.target.x, game.target.y, '#7df5c7', 150, 0.8, 4);
    syncUI();
  }

  function nextHole() {
    if (holeIndex + 1 < E.STAGES[stageIndex].holes.length) {
      holeIndex++;
      beginHole();
    } else {
      stageClear();
    }
  }

  function nextStage() {
    if (stageIndex + 1 >= E.STAGES.length) { showTitle(); return; }
    stageIndex++;
    holeIndex = 0;
    stageStrokes = 0;
    stagePar = 0;
    beginHole();
  }

  function pauseGame() {
    if (!game || mode !== 'hole' || game.paused) return;
    pointer = null;
    E.setPaused(game, true);
    game.paused = true;
    setScreen('screen-pause');
  }
  function resumeGame() {
    if (!game || !game.paused) return;
    game.paused = false;
    E.setPaused(game, false);
    setScreen(null);
    lastTs = 0;
  }
  function togglePause() { if (!game || mode !== 'hole') return; if (game.paused) resumeGame(); else pauseGame(); }

  function syncAudioButton() {
    if (!els.sound) return;
    var muted = Audio ? Audio.isMuted() : true;
    els.sound.classList.toggle('muted', muted);
    els.sound.setAttribute('aria-label', muted ? 'BGMを再生' : 'BGMを消音');
  }
  function toggleAudio() { if (Audio) { Audio.toggle(); syncAudioButton(); } }

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
    var bg = ctx.createLinearGradient(0, 0, 0, C.h);
    bg.addColorStop(0, '#080d1b');
    bg.addColorStop(0.55, '#0b1b1a');
    bg.addColorStop(1, '#030807');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, C.w, C.h);
    for (var i = 0; i < 52; i++) {
      var x = mod(i * 97 + 19 - time * (2 + i % 4), C.w);
      var y = mod(i * 53 + 7, 90);
      ctx.fillStyle = 'rgba(190, 230, 255, ' + (0.04 + (i % 4) * 0.02) + ')';
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.fillStyle = 'rgba(255, 244, 190, 0.18)';
    ctx.beginPath();
    ctx.arc(400, 62, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawField() {
    var grd = ctx.createLinearGradient(0, F.y, 0, F.bottom);
    grd.addColorStop(0, '#163a32');
    grd.addColorStop(0.5, '#102b27');
    grd.addColorStop(1, '#0b1e1b');
    ctx.fillStyle = grd;
    roundRect(F.x, F.y, F.w, F.h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(125, 245, 199, 0.42)';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (var i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(180, 255, 220, 0.022)' : 'rgba(0, 0, 0, 0.035)';
      ctx.fillRect(F.x + 2, F.y + i * F.h / 9, F.w - 4, F.h / 9);
    }
    ctx.strokeStyle = 'rgba(160, 240, 210, 0.1)';
    ctx.lineWidth = 1;
    for (i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(F.x, F.y + F.h * i / 5);
      ctx.lineTo(F.right, F.y + F.h * i / 5);
      ctx.stroke();
    }
  }

  function drawHazards(st) {
    for (var i = 0; i < st.walls.length; i++) {
      var w = st.walls[i];
      ctx.save();
      ctx.shadowColor = 'rgba(255, 143, 189, 0.45)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(86, 45, 65, 0.9)';
      ctx.strokeStyle = 'rgba(255, 143, 189, 0.72)';
      ctx.lineWidth = 2;
      roundRect(w.x, w.y, w.w, w.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    for (i = 0; i < st.bumpers.length; i++) {
      var b = st.bumpers[i];
      ctx.save();
      ctx.shadowColor = 'rgba(125, 245, 199, 0.8)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(45, 135, 110, 0.75)';
      ctx.strokeStyle = '#a8ffe0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    for (i = 0; i < (st.rotors || []).length; i++) {
      var rot = st.rotors[i];
      ctx.save();
      ctx.translate(rot.x, rot.y);
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.72)';
      ctx.fillStyle = 'rgba(255, 209, 102, 0.8)';
      ctx.shadowColor = 'rgba(255, 209, 102, 0.7)';
      ctx.shadowBlur = 10;
      for (var arm = 0; arm < rot.arms; arm++) {
        var aa = rot.angle + arm * Math.PI * 2 / rot.arms;
        var px = Math.cos(aa) * rot.r;
        var py = Math.sin(aa) * rot.r;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#7df5c7';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (i = 0; i < st.sand.length; i++) {
      var s = st.sand[i];
      ctx.fillStyle = 'rgba(190, 156, 90, 0.7)';
      ctx.strokeStyle = 'rgba(255, 220, 140, 0.5)';
      ctx.lineWidth = 1;
      roundRect(s.x, s.y, s.w, s.h, 12);
      ctx.fill();
      ctx.stroke();
    }
    for (i = 0; i < st.water.length; i++) {
      var wa = st.water[i];
      ctx.fillStyle = 'rgba(45, 125, 165, 0.72)';
      ctx.strokeStyle = 'rgba(120, 230, 255, 0.55)';
      ctx.lineWidth = 1;
      roundRect(wa.x, wa.y, wa.w, wa.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.strokeStyle = 'rgba(190, 250, 255, 0.28)';
      for (var k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(wa.x + 6, wa.y + wa.h * k / 4);
        ctx.lineTo(wa.x + wa.w - 6, wa.y + wa.h * k / 4);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawHole(st) {
    var h = st.target;
    ctx.save();
    ctx.shadowColor = 'rgba(125, 245, 199, 0.85)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(2, 10, 8, 0.9)';
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(170, 255, 220, 0.76)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7df5c7';
    ctx.font = '900 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CUP', h.x, h.y);
    ctx.strokeStyle = 'rgba(235, 255, 245, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y - h.r);
    ctx.lineTo(h.x, h.y - 66);
    ctx.stroke();
    ctx.fillStyle = '#ff8fbd';
    ctx.beginPath();
    ctx.moveTo(h.x, h.y - 66);
    ctx.lineTo(h.x + 28, h.y - 56);
    ctx.lineTo(h.x, h.y - 46);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBall(st) {
    var b = st.ball;
    for (var i = 0; i < trail.length; i++) {
      var p = trail[i];
      ctx.fillStyle = 'rgba(235, 255, 246, ' + ((i + 1) / trail.length * 0.2) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, E.BALL_R * (0.3 + 0.5 * (i + 1) / trail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(235, 255, 245, 0.95)';
    ctx.shadowBlur = 16;
    var grad = ctx.createRadialGradient(b.x - 2, b.y - 3, 1, b.x, b.y, E.BALL_R);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.65, '#d9fff0');
    grad.addColorStop(1, '#7bcaa8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, E.BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAim(st) {
    if (!pointer || st.phase !== 'aim') return;
    var b = st.ball;
    var dx = pointer.x - pointer.startX;
    var dy = pointer.y - pointer.startY;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 6) return;
    var preview = E.previewDrag(game, dx, dy);
    if (preview && preview.length > 1) {
      ctx.save();
      for (var pi = 1; pi < preview.length; pi += 2) {
        var pp = preview[pi];
        ctx.globalAlpha = 0.32 * (1 - pi / preview.length);
        ctx.fillStyle = '#bfffdf';
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    var max = 150;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; len = max; }
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 243, 180, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + dx, b.y + dy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#7df5c7';
    ctx.fillStyle = '#7df5c7';
    ctx.shadowColor = '#7df5c7';
    ctx.shadowBlur = 12;
    var sx = b.x - dx, sy = b.y - dy;
    var angle = Math.atan2(-dy, -dx);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - Math.cos(angle - 0.4) * 12, sy - Math.sin(angle - 0.4) * 12);
    ctx.lineTo(sx - Math.cos(angle + 0.4) * 12, sy - Math.sin(angle + 0.4) * 12);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eafff4';
    ctx.font = '900 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(len / max * 100) + '%', b.x + dx, b.y + dy - 14);
    ctx.restore();
  }

  function drawBanner() {
    if (sinkBanner) {
      var b = sinkBanner;
      ctx.save();
      ctx.fillStyle = 'rgba(3,12,8,0.82)';
      roundRect(70, 250, 340, 72, 14);
      ctx.fill();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.4;
      roundRect(70, 250, 340, 72, 14);
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 18;
      ctx.font = '900 26px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, C.w / 2, 280);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#eafff4';
      ctx.font = '800 10px ui-monospace, Menlo, monospace';
      ctx.fillText(b.sub, C.w / 2, 306);
      ctx.restore();
    }
    if (effects.banner) {
      var eb = effects.banner;
      var a = clamp(eb.life / eb.max, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 1.7);
      ctx.fillStyle = eb.color;
      ctx.font = '900 16px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(eb.text, C.w / 2, 170);
      ctx.globalAlpha = 1;
    }
  }

  function drawEffects() {
    for (var i = 0; i < effects.particles.length; i++) {
      var p = effects.particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.shape === 'rect' ? 4 : 9;
      if (p.shape === 'rect') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    for (i = 0; i < effects.rings.length; i++) {
      var r = effects.rings[i];
      ctx.globalAlpha = clamp(r.life / r.maxLife, 0, 1) * 0.75;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawBanner();
  }

  function draw(time) {
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, C.w, C.h);
    drawBackdrop(time);
    if (game) {
      drawField();
      var st = E.getState(game);
      drawHazards(st);
      drawHole(st);
      drawAim(st);
      drawBall(st);
      drawEffects();
      ctx.fillStyle = 'rgba(170, 210, 195, 0.66)';
      ctx.font = '800 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ボールをドラッグして離す / 少ない打数でカップへ', C.w / 2, 758);
    } else {
      drawEffects();
      ctx.fillStyle = 'rgba(170, 210, 195, 0.55)';
      ctx.font = '800 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('月夜の9ホール', C.w / 2, 758);
    }
    if (effects.flash > 0) {
      ctx.fillStyle = 'rgba(' + effects.flashColor + ', ' + Math.min(0.7, effects.flash * 0.6) + ')';
      ctx.fillRect(0, 0, C.w, C.h);
    }
  }

  function burst(x, y, count, colors, speed, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = speed * (0.35 + Math.random() * 0.9);
      effects.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 420, life: life * (0.6 + Math.random() * 0.5), max: life, size: 1.5 + Math.random() * 3.2, color: colors[Math.floor(Math.random() * colors.length)] });
    }
  }
  function confettiBurst(x, y, count, colors, speed, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = speed * (0.25 + Math.random() * 1.05);
      effects.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, g: 560, life: life * (0.65 + Math.random() * 0.7), max: life, shape: 'rect', w: 3 + Math.random() * 5, h: 2 + Math.random() * 5, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 14, color: colors[Math.floor(Math.random() * colors.length)] });
    }
  }
  function shockwave(x, y, color, maxR, life, width) { effects.rings.push({ x: x, y: y, r: 10, maxR: maxR, life: life, maxLife: life, color: color, width: width || 3 }); }
  function popup(text, x, y, color, size) { effects.popups.push({ text: text, x: x, y: y, life: 0.8, max: 0.8, color: color, size: size || 14 }); }
  function showBanner(text, color) { effects.banner = { text: text, color: color || '#8ff0d0', life: 1.2, max: 1.2 }; }

  function processEvents() {
    if (!game) return;
    var events = E.consumeEvents(game);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'sunk') { finishHole(); }
      else if (ev.type === 'water') { effects.flash = 0.5; effects.flashColor = '80,190,255'; burst(ev.x, ev.y, 26, ['#5ee7ff', '#ffffff', '#7df5c7'], 240, 0.8); showBanner('WATER +1', '#5ee7ff'); }
      else if (ev.type === 'bumper') { burst(ev.x, ev.y, 10, ['#7df5c7', '#ffffff'], 160, 0.4); }
    }
  }

  function updateEffects(dt) {
    for (var i = effects.particles.length - 1; i >= 0; i--) {
      var p = effects.particles[i];
      p.life -= dt;
      if (p.life <= 0) { effects.particles.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.1);
      if (p.shape === 'rect') p.rot += (p.vr || 0) * dt;
    }
    for (i = effects.rings.length - 1; i >= 0; i--) {
      var r = effects.rings[i];
      r.life -= dt;
      r.r += (r.maxR - r.r) * Math.min(1, dt * 7);
      if (r.life <= 0) effects.rings.splice(i, 1);
    }
    if (effects.shake > 0) effects.shake = Math.max(0, effects.shake - dt * 2.6);
    if (effects.flash > 0) effects.flash = Math.max(0, effects.flash - dt * 2.4);
    if (effects.banner) { effects.banner.life -= dt; if (effects.banner.life <= 0) effects.banner = null; }
    if (effects.fireworks > 0) {
      effects.fireworks -= dt;
      effects.fireTimer -= dt;
      if (effects.fireTimer <= 0) {
        effects.fireTimer = 0.18;
        burst(80 + Math.random() * 320, 150 + Math.random() * 250, 16, ['#7df5c7', '#ffd166', '#ffffff', '#5ee7ff'], 240, 0.8);
      }
    }
  }

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
    return { x: (e.clientX - rect.left) / (rect.width || 480) * C.w, y: (e.clientY - rect.top) / (rect.height || 800) * C.h };
  }
  function nearBall(pos) {
    if (!game) return false;
    var b = game.ball;
    var dx = pos.x - b.x, dy = pos.y - b.y;
    return Math.sqrt(dx * dx + dy * dy) < 80;
  }
  function onPointerDown(e) {
    e.preventDefault && e.preventDefault();
    if (!game || mode !== 'hole' || game.phase !== 'aim' || game.paused || pointer) return;
    var pos = pointerPos(e);
    if (!nearBall(pos)) return;
    pointer = { id: e.pointerId == null ? 1 : e.pointerId, startX: pos.x, startY: pos.y, x: pos.x, y: pos.y };
    try { canvas.setPointerCapture && canvas.setPointerCapture(pointer.id); } catch (err) { }
  }
  function onPointerMove(e) {
    if (!pointer) return;
    if ((e.pointerId == null ? 1 : e.pointerId) !== pointer.id) return;
    var pos = pointerPos(e);
    pointer.x = pos.x; pointer.y = pos.y;
  }
  function onPointerUp(e) {
    e.preventDefault && e.preventDefault();
    if (!pointer) return;
    var id = e.pointerId == null ? 1 : e.pointerId;
    if (id !== pointer.id) return;
    var p = pointer;
    pointer = null;
    if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(id); } catch (err) { } }
    if (!game || mode !== 'hole' || game.phase !== 'aim' || game.paused) return;
    var dx = p.x - p.startX, dy = p.y - p.startY;
    if (E.shootDrag(game, dx, dy)) { processEvents(); syncUI(); }
  }

  function onKeyDown(e) {
    var k = e.key || '';
    if (k === 'm' || k === 'M') { toggleAudio(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { if (game && mode === 'hole') { e.preventDefault && e.preventDefault(); togglePause(); } return; }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || e.code === 'Space') {
      e.preventDefault && e.preventDefault();
      if (mode === 'title') startTour();
      else if (mode === 'stage') nextStage();
      else if (mode === 'ending') showTitle();
      else if (game && game.paused) resumeGame();
    }
  }

  function resize() {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(2, Math.max(1, window.devicePixelRatio)) : 1;
    var w = Math.round(C.w * dpr), h = Math.round(C.h * dpr);
    canvas.width = w; canvas.height = h;
    scaleX = w / C.w; scaleY = h / C.h;
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);
    if (game && mode === 'hole' && !game.paused) {
      E.update(game, dt);
      if (game.phase === 'moving') {
        trail.push({ x: game.ball.x, y: game.ball.y });
        if (trail.length > 14) trail.shift();
      } else if (game.phase === 'aim') {
        if (trail.length) trail = [];
      }
      if (game.phase === 'sunk' && !holeFinalized) processEvents();
      if (advanceTimer > 0) {
        advanceTimer -= dt;
        if (advanceTimer <= 0) { sinkBanner = null; nextHole(); }
      }
      processEvents();
      syncUI();
    }
    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function autoPlayStep() {
    if (mode === 'title') { startTour(); return; }
    if (mode !== 'hole' || !game || game.paused) return;
    if (game.phase === 'aim') {
      E.autoShot(game);
      processEvents();
      syncUI();
    }
  }

  function init() {
    canvas = $('game');
    els.hud = $('hud'); els.hole = $('hole'); els.turn = $('turn'); els.par = $('par'); els.strokes = $('strokes');
    els.sound = $('btn-sound'); els.pause = $('btn-pause');
    els.screenTitle = $('screen-title'); els.screenStage = $('screen-stage'); els.screenEnding = $('screen-ending'); els.screenPause = $('screen-pause');
    els.stageStrokes = $('stage-strokes'); els.stagePar = $('stage-par'); els.stageTotal = $('stage-total'); els.stageScore = $('stage-score'); els.stageClearText = $('stage-clear-text');
    els.endingStrokes = $('ending-strokes'); els.endingPar = $('ending-par'); els.endingScore = $('ending-score');
    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (err) { ctx = null; }
    }
    resetEffects(); resize();
    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');
    var start = $('btn-start'), next = $('btn-next-stage'), ending = $('btn-ending-retry'), resume = $('btn-resume'), retry = $('btn-retry');
    if (start) start.addEventListener('click', startTour);
    if (next) next.addEventListener('click', nextStage);
    if (ending) ending.addEventListener('click', showTitle);
    if (resume) resume.addEventListener('click', resumeGame);
    if (retry) retry.addEventListener('click', beginHole);
    if (els.pause) els.pause.addEventListener('click', togglePause);
    if (els.sound) els.sound.addEventListener('click', toggleAudio);
    syncAudioButton();
    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown, false);
      canvas.addEventListener('pointermove', onPointerMove, false);
      canvas.addEventListener('pointerup', onPointerUp, false);
      canvas.addEventListener('pointercancel', function () { pointer = null; }, false);
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault && e.preventDefault(); }, false);
      canvas.addEventListener('dblclick', function (e) { e.preventDefault && e.preventDefault(); }, false);
    }
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('blur', pauseGame, false);
    window.addEventListener('resize', resize, false);
    document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); }, false);
    document.addEventListener('gesturestart', function (e) { e.preventDefault && e.preventDefault(); }, false);
    document.addEventListener('gesturechange', function (e) { e.preventDefault && e.preventDefault(); }, false);
    document.addEventListener('gestureend', function (e) { e.preventDefault && e.preventDefault(); }, false);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
    root.__GAME__ = {
      id: 'night-mini-golf', title: '月夜のミニゴルフ',
      start: startTour, autoPlayStep: autoPlayStep,
      isDone: function () { return mode === 'stage' || mode === 'ending'; },
      getState: function () {
        if (!game) return { id: 'night-mini-golf', phase: mode, stage: stageIndex, hole: holeIndex };
        var state = E.getState(game);
        state.stageStrokes = stageStrokes;
        state.totalStrokes = totalStrokes;
        state.stagePar = stagePar;
        state.totalPar = totalPar;
        if (mode === 'stage') state.phase = 'clear';
        if (mode === 'ending') state.phase = 'ending';
        state.over = mode === 'stage' || mode === 'ending';
        return state;
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
