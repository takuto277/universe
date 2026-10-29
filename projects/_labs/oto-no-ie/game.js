(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.OtoNoIeEngine;
  if (!E) return;

  var C = { VIEW_W: 480, VIEW_H: 800 };
  var CELL = 54;
  var GRID_X = 51;
  var GRID_Y = 116;
  var PANEL_Y = 608;
  var SLOT = { w: 58, h: 58, gap: 5 };
  var RUN_RECT = { x: 338, y: 618, w: 122, h: 58 };
  var RESET_RECT = { x: 338, y: 684, w: 122, h: 46 };
  var REASONS = {
    unheard: '次の鈴が聞こえなかった。音の届く場所に置こう。',
    blocked: '音は届いたが、ガラスや壁で歩けない。',
    'exit-unheard': '出口の鐘が聞こえない。最後の鈴を出口に近づけよう。',
    'exit-blocked': '出口への道がない。'
  };

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
  var runAnim = null;
  var ripples = [];
  var ui = { finalized: false };
  var stars = [];
  var motes = [];
  var audio = null;
  var muted = false;

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function loadMute() {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('oto-no-ie-muted') === '1'; } catch (e) { return false; }
  }
  function saveMute() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('oto-no-ie-muted', muted ? '1' : '0'); } catch (e) { }
  }

  function ensureAudio() {
    if (muted) return null;
    if (audio) return audio;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
      if (audio.state === 'suspended' && audio.resume) audio.resume();
      return audio;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, dur, vol, type) {
    var ac = ensureAudio();
    if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      gain.gain.setValueAtTime(0.0001, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(vol || 0.05, ac.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur + 0.02);
    } catch (e) { }
  }

  function pingCharm(index) {
    tone(520 + index * 90, 0.16, 0.045, 'sine');
    tone(1040 + index * 180, 0.1, 0.015, 'sine');
  }

  function pingClear() {
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
      (function (n, i) { setTimeout(function () { tone(n, 0.35, 0.035, 'sine'); }, i * 95); })(notes[i], i);
    }
  }

  function buzz() {
    tone(120, 0.3, 0.045, 'sawtooth');
  }

  function formatReason(reason) {
    return REASONS[reason] || '音の道をもう一度組み立てよう。';
  }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var screens = [
      ['screen-title', els.screenTitle],
      ['screen-level', els.screenLevel],
      ['screen-fail', els.screenFail],
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
      particles: [],
      popups: [],
      shake: 0,
      flash: 0,
      flashColor: '210, 248, 255',
      banner: null
    };
    ripples = [];
  }

  function beginGame() {
    game = E.createGame();
    runAnim = null;
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
    if (els.level) els.level.textContent = (st.levelIndex + 1) + '/' + st.levelTotal;
    if (els.charms) els.charms.textContent = st.bellsUsed + '/' + st.maxBells;
    if (els.mirrors) els.mirrors.textContent = st.mirrorsUsed + '/' + st.maxMirrors;
    if (els.range) els.range.textContent = String(st.range);
    if (els.clearLevel) els.clearLevel.textContent = String(st.levelIndex + 1);
    if (els.clearBells) els.clearBells.textContent = st.bellsUsed + '/' + st.maxBells;
    if (els.clearMirrors) els.clearMirrors.textContent = st.mirrorsUsed + '/' + st.maxMirrors;
    if (els.clearLeft) els.clearLeft.textContent = String(st.levelTotal - st.levelIndex - 1);
    if (els.failReason) els.failReason.textContent = formatReason(st.reason);

    var target = null;
    if (st.phase === 'clear') target = 'screen-level';
    else if (st.phase === 'fail') target = 'screen-fail';
    else if (st.phase === 'ending') target = 'screen-ending';
    else if (st.paused) target = 'screen-pause';
    setScreen(target);
    if (els.pause) els.pause.classList.toggle('hidden', !(st.phase === 'build' && !st.paused));
  }

  function pauseGame() {
    if (!game || game.phase !== 'build' || game.paused) return;
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
    sky.addColorStop(0, '#0b1530');
    sky.addColorStop(0.48, '#081126');
    sky.addColorStop(1, '#04070f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    var glow = ctx.createRadialGradient(240, 320, 20, 240, 320, 350);
    glow.addColorStop(0, 'rgba(47, 92, 150, 0.16)');
    glow.addColorStop(0.55, 'rgba(20, 50, 100, 0.06)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.3 + 0.7 * Math.abs(Math.sin(time * s.tw + s.phase));
      ctx.fillStyle = 'rgba(190, 224, 255, ' + (0.06 + tw * 0.24) + ')';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    for (i = 0; i < motes.length; i++) {
      var m = motes[i];
      var y = m.y - mod(time * m.speed, 500);
      ctx.fillStyle = 'rgba(244, 201, 107, ' + (0.04 + 0.07 * Math.abs(Math.sin(time + m.phase))) + ')';
      ctx.beginPath();
      ctx.arc(m.x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function cellRect(r, c) {
    return { x: GRID_X + c * CELL + 2, y: GRID_Y + r * CELL + 2, w: CELL - 4, h: CELL - 4, cx: GRID_X + c * CELL + CELL / 2, cy: GRID_Y + r * CELL + CELL / 2 };
  }

  function drawCellBase(r, c, ch) {
    var x = GRID_X + c * CELL;
    var y = GRID_Y + r * CELL;
    if (ch === '#') {
      var wall = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
      wall.addColorStop(0, '#2b3b58');
      wall.addColorStop(0.5, '#1a2842');
      wall.addColorStop(1, '#0e1729');
      ctx.fillStyle = wall;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = 'rgba(142, 188, 214, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      ctx.fillStyle = 'rgba(185, 218, 235, 0.12)';
      ctx.fillRect(x + 5, y + 5, CELL - 10, 1);
      ctx.fillRect(x + 5, y + 5, 1, CELL - 10);
      return;
    }
    var floor = ctx.createLinearGradient(x, y, x, y + CELL);
    floor.addColorStop(0, 'rgba(13, 34, 63, 0.96)');
    floor.addColorStop(1, 'rgba(6, 15, 30, 0.96)');
    ctx.fillStyle = floor;
    roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(119, 208, 232, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(119, 208, 232, 0.055)';
    ctx.beginPath();
    ctx.moveTo(x + CELL / 2, y + 8);
    ctx.lineTo(x + CELL / 2, y + CELL - 8);
    ctx.moveTo(x + 8, y + CELL / 2);
    ctx.lineTo(x + CELL - 8, y + CELL / 2);
    ctx.stroke();

    if (ch === '!') {
      ctx.save();
      ctx.fillStyle = 'rgba(130, 232, 226, 0.12)';
      ctx.fillRect(x + 5, y + 5, CELL - 10, CELL - 10);
      ctx.strokeStyle = 'rgba(130, 232, 226, 0.56)';
      ctx.lineWidth = 1.3;
      ctx.strokeRect(x + 5.5, y + 5.5, CELL - 11, CELL - 11);
      ctx.beginPath();
      ctx.rect(x + 6, y + 6, CELL - 12, CELL - 12);
      ctx.clip();
      for (var g = -CELL; g < CELL; g += 11) {
        ctx.beginPath();
        ctx.moveTo(x + Math.max(5, g), y + Math.min(CELL - 5, g + CELL));
        ctx.lineTo(x + Math.min(CELL - 5, g + CELL), y + Math.max(5, g));
        ctx.stroke();
      }
      ctx.restore();
    } else if (ch === 'D' || ch === 'X') {
      var doorColor = ch === 'D' ? 'rgba(244, 201, 107, 0.9)' : 'rgba(255, 138, 115, 0.75)';
      ctx.strokeStyle = doorColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + CELL - 8);
      ctx.lineTo(x + 10, y + 12);
      ctx.quadraticCurveTo(x + 10, y + 6, x + 16, y + 6);
      ctx.lineTo(x + CELL - 10, y + 6);
      ctx.lineTo(x + CELL - 10, y + CELL - 8);
      ctx.stroke();
      ctx.fillStyle = ch === 'D' ? 'rgba(244, 201, 107, 0.2)' : 'rgba(255, 138, 115, 0.16)';
      ctx.fillRect(x + 10, y + 8, CELL - 20, CELL - 18);
      if (ch === 'X') {
        ctx.strokeStyle = 'rgba(255, 138, 115, 0.8)';
        ctx.beginPath();
        ctx.moveTo(x + 13, y + 13);
        ctx.lineTo(x + CELL - 13, y + CELL - 13);
        ctx.moveTo(x + CELL - 13, y + 13);
        ctx.lineTo(x + 13, y + CELL - 13);
        ctx.stroke();
      }
    } else if (ch === 'A') {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 119, 175, 0.12)';
      ctx.fillRect(x + 8, y + 7, CELL - 16, CELL - 14);
      ctx.strokeStyle = 'rgba(255, 119, 175, 0.7)';
      ctx.lineWidth = 1.3;
      ctx.strokeRect(x + 8.5, y + 7.5, CELL - 17, CELL - 15);
      for (var wv = 0; wv < 3; wv++) {
        ctx.beginPath();
        ctx.moveTo(x + 14, y + 14 + wv * 12);
        ctx.quadraticCurveTo(x + CELL / 2, y + 8 + wv * 12, x + CELL - 14, y + 16 + wv * 12);
        ctx.stroke();
      }
      ctx.restore();
    } else if (ch === 'S') {
      ctx.save();
      ctx.fillStyle = 'rgba(244, 201, 107, 0.12)';
      ctx.beginPath();
      ctx.arc(x + CELL / 2, y + CELL / 2, CELL * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(244, 201, 107, 0.42)';
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else if (ch === 'E') {
      var eg = ctx.createRadialGradient(x + CELL / 2, y + CELL / 2, 2, x + CELL / 2, y + CELL / 2, CELL * 0.55);
      eg.addColorStop(0, 'rgba(255, 238, 166, 0.6)');
      eg.addColorStop(1, 'rgba(255, 210, 100, 0)');
      ctx.fillStyle = eg;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = 'rgba(255, 220, 130, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 13, y + CELL - 9);
      ctx.lineTo(x + 13, y + 13);
      ctx.quadraticCurveTo(x + 13, y + 8, x + 19, y + 8);
      ctx.lineTo(x + CELL - 11, y + 8);
      ctx.lineTo(x + CELL - 11, y + CELL - 9);
      ctx.stroke();
    }
  }

  function drawSoundZones() {
    if (!game || !game.level) return;
    var st = E.getState(game);
    for (var i = 0; i < st.bells.length; i++) {
      var ch = st.bells[i];
      if (!ch) continue;
      var selected = st.selected.type === 'bell' && st.selected.index === i;
      var cells = E.soundCells(game, ch);
      for (var j = 0; j < cells.length; j++) {
        var cell = cells[j];
        var alpha = selected ? (0.2 - cell.d * 0.03) : (0.08 - cell.d * 0.013);
        if (alpha <= 0) continue;
        var rr = cellRect(cell.r, cell.c);
        ctx.fillStyle = selected ? 'rgba(244, 201, 107, ' + alpha + ')' : 'rgba(130, 232, 226, ' + alpha + ')';
        ctx.fillRect(rr.x + 3, rr.y + 3, rr.w - 6, rr.h - 6);
        if (selected) {
          ctx.strokeStyle = 'rgba(255, 231, 162, 0.14)';
          ctx.strokeRect(rr.x + 4.5, rr.y + 4.5, rr.w - 9, rr.h - 9);
        }
      }
    }
  }

  function drawCharm(ch, slot, selected) {
    var rr = cellRect(ch.r, ch.c);
    var cx = rr.cx;
    var cy = rr.cy;
    ctx.save();
    ctx.translate(cx, cy);
    var p = 0.5 + 0.5 * Math.sin(nowMs() / 350 + slot);
    ctx.shadowColor = selected ? 'rgba(244, 201, 107, 0.95)' : 'rgba(130, 232, 226, 0.7)';
    ctx.shadowBlur = selected ? 12 + p * 8 : 8;
    ctx.fillStyle = selected ? '#ffe4a0' : '#bffdf7';
    ctx.beginPath();
    ctx.arc(0, 1, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101827';
    ctx.beginPath();
    ctx.arc(0, 1, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 1, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a1220';
    ctx.font = '900 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(slot + 1), 0, 2);
    ctx.restore();
  }

  function drawMirror(m, slot, selected) {
    var rr = cellRect(m.r, m.c);
    ctx.save();
    ctx.translate(rr.cx, rr.cy);
    ctx.rotate(-0.55);
    ctx.shadowColor = selected ? 'rgba(244, 201, 107, 0.95)' : 'rgba(130, 232, 226, 0.75)';
    ctx.shadowBlur = selected ? 14 : 8;
    ctx.fillStyle = selected ? 'rgba(255, 228, 160, 0.86)' : 'rgba(130, 232, 226, 0.75)';
    ctx.fillRect(-4, -17, 8, 34);
    ctx.fillStyle = 'rgba(10, 22, 40, 0.9)';
    ctx.fillRect(-1.2, -15, 2.4, 30);
    ctx.shadowBlur = 0;
    ctx.fillStyle = selected ? '#ffe4a0' : '#c9fffb';
    ctx.font = '900 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M' + (slot + 1), 0, -22);
    ctx.restore();
  }

  function drawResident(x, y, time, listening) {
    ctx.save();
    ctx.translate(x, y);
    if (listening) {
      var p = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.strokeStyle = 'rgba(244, 201, 107, ' + (0.25 + p * 0.35) + ')';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 20 + p * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = 'rgba(244, 201, 107, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.lineTo(24, 18);
    ctx.stroke();
    ctx.fillStyle = '#d9eaff';
    ctx.beginPath();
    ctx.arc(0, -18, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101827';
    ctx.fillRect(-6, -20, 12, 3.5);
    var body = ctx.createLinearGradient(0, -12, 0, 12);
    body.addColorStop(0, '#b8d9f2');
    body.addColorStop(1, '#4e7fa1');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -2, 8, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244, 201, 107, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, -12);
    ctx.lineTo(-10, 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawGrid(time) {
    var st = E.getState(game);
    var level = game.level;
    for (var r = 0; r < level.h; r++) {
      for (var c = 0; c < level.w; c++) {
        drawCellBase(r, c, E.cellAt(level, r, c));
      }
    }

    drawSoundZones();

    for (var i = 0; i < st.bells.length; i++) {
      var ch = st.bells[i];
      if (ch) drawCharm(ch, i, st.selected.type === 'bell' && st.selected.index === i);
    }
    for (var mi = 0; mi < st.mirrors.length; mi++) {
      var mirror = st.mirrors[mi];
      if (mirror) drawMirror(mirror, mi, st.selected.type === 'mirror' && st.selected.index === mi);
    }

    if (st.phase === 'build') {
      var srr = cellRect(level.start.r, level.start.c);
      drawResident(srr.cx, srr.cy, time, false);
    }

    if (runAnim) drawRunTrail();
  }

  function drawRunTrail() {
    if (!runAnim || !runAnim.steps.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 201, 107, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    for (var i = 0; i <= Math.min(runAnim.index, runAnim.steps.length - 1); i++) {
      var s = runAnim.steps[i];
      var rr = cellRect(s.r, s.c);
      if (i === 0) ctx.moveTo(rr.cx, rr.cy);
      else ctx.lineTo(rr.cx, rr.cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawRipples(time) {
    for (var i = 0; i < ripples.length; i++) {
      var rp = ripples[i];
      var age = (nowMs() - rp.start) / 1000;
      if (age > 1.2) continue;
      var rr = cellRect(rp.r, rp.c);
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - age / 1.2);
      ctx.strokeStyle = '#ffe7a2';
      ctx.lineWidth = 1.5;
      for (var k = 0; k < 3; k++) {
        var rad = 10 + age * 48 + k * 12;
        ctx.beginPath();
        ctx.arc(rr.cx, rr.cy, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawTitle(time) {
    drawBackdrop(time);
    var demo = [
      { r: 2, c: 2, ch: '#' }, { r: 2, c: 3, ch: '.' }, { r: 2, c: 4, ch: '!' },
      { r: 3, c: 2, ch: '.' }, { r: 3, c: 3, ch: 'D' }, { r: 3, c: 4, ch: '.' },
      { r: 4, c: 2, ch: '.' }, { r: 4, c: 3, ch: '.' }, { r: 4, c: 4, ch: 'E' }
    ];
    for (var i = 0; i < demo.length; i++) {
      var d = demo[i];
      ctx.save();
      ctx.globalAlpha = 0.35;
      drawCellBase(d.r + 1, d.c + 1, d.ch);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawResident(GRID_X + 2 * CELL + CELL / 2, GRID_Y + 4 * CELL + CELL / 2, time, true);
    ctx.restore();
    ctx.fillStyle = 'rgba(5, 10, 20, 0.75)';
    roundRect(0, PANEL_Y, C.VIEW_W, C.VIEW_H - PANEL_Y, 20);
    ctx.fill();
    ctx.fillStyle = 'rgba(244, 201, 107, 0.6)';
    ctx.font = '900 10px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LISTEN · WALK · ARRIVE', C.VIEW_W / 2, 678);
    ctx.fillStyle = 'rgba(145, 174, 199, 0.55)';
    ctx.font = '700 9px ui-monospace, Menlo, monospace';
    ctx.fillText('A FLOOR PLAN MADE OF SOUND', C.VIEW_W / 2, 704);
  }

  function drawPanel() {
    var panel = ctx.createLinearGradient(0, PANEL_Y, 0, C.VIEW_H);
    panel.addColorStop(0, 'rgba(12, 22, 45, 0.98)');
    panel.addColorStop(1, 'rgba(5, 10, 22, 0.99)');
    ctx.fillStyle = panel;
    roundRect(0, PANEL_Y, C.VIEW_W, C.VIEW_H - PANEL_Y, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(130, 232, 226, 0.14)';
    ctx.beginPath();
    ctx.moveTo(16, PANEL_Y + 1);
    ctx.lineTo(C.VIEW_W - 16, PANEL_Y + 1);
    ctx.stroke();

    var st = E.getState(game);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff1bd';
    ctx.font = '900 13px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.fillText('鈴と鏡を置いて、音をつなぐ', 20, 622);
    var entries = itemEntries(game);
    for (var i = 0; i < entries.length; i++) {
      drawItemSlot(16 + i * (SLOT.w + SLOT.gap), 638, entries[i], st);
    }

    drawButton(RUN_RECT, '音を鳴らす', st.phase === 'build');
    drawButton(RESET_RECT, 'ぜんぶ外す', st.bellsUsed + st.mirrorsUsed > 0);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(145, 174, 199, 0.9)';
    ctx.font = '700 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.fillText('鏡 = 音を中継 / A = 吸音カーテン', 20, 706);
    ctx.fillText('ガラス = 音は通る / 人は通れない', 20, 724);
    ctx.fillText('鈴・鏡をタップで外せます', 20, 742);
    ctx.fillStyle = 'rgba(145, 174, 199, 0.55)';
    ctx.fillText('M: 消音  P: ポーズ', 20, 766);
  }

  function itemEntries(g) {
    var out = [];
    for (var i = 0; i < g.level.maxBells; i++) out.push({ type: 'bell', index: i });
    for (i = 0; i < g.level.maxMirrors; i++) out.push({ type: 'mirror', index: i });
    return out;
  }

  function drawItemSlot(x, y, entry, st) {
    var selected = st.selected.type === entry.type && st.selected.index === entry.index;
    var placed = entry.type === 'bell' ? !!st.bells[entry.index] : !!st.mirrors[entry.index];
    var isMirror = entry.type === 'mirror';
    ctx.save();
    ctx.fillStyle = selected ? 'rgba(244, 201, 107, 0.15)' : 'rgba(17, 33, 61, 0.82)';
    ctx.strokeStyle = selected ? 'rgba(255, 228, 160, 0.96)' : (isMirror ? 'rgba(130, 232, 226, 0.3)' : 'rgba(255, 138, 115, 0.24)');
    ctx.lineWidth = selected ? 1.8 : 1;
    roundRect(x, y, SLOT.w, SLOT.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isMirror) {
      ctx.save();
      ctx.translate(x + SLOT.w / 2, y + 21);
      ctx.rotate(-0.55);
      ctx.fillStyle = selected ? '#ffe4a0' : '#82e8e2';
      ctx.fillRect(-3.5, -12, 7, 24);
      ctx.fillStyle = 'rgba(10, 22, 40, 0.9)';
      ctx.fillRect(-1, -10, 2, 20);
      ctx.restore();
      ctx.fillStyle = selected ? '#ffe4a0' : '#b8d9f2';
      ctx.font = '900 11px ui-monospace, Menlo, monospace';
      ctx.fillText('M' + (entry.index + 1), x + SLOT.w / 2, y + 43);
    } else {
      ctx.fillStyle = selected ? '#ffe4a0' : '#ff8a73';
      ctx.beginPath();
      ctx.arc(x + SLOT.w / 2, y + 21, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101827';
      ctx.beginPath();
      ctx.arc(x + SLOT.w / 2, y + 21, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = selected ? '#ffe4a0' : '#b8d9f2';
      ctx.font = '900 11px ui-monospace, Menlo, monospace';
      ctx.fillText(String(entry.index + 1), x + SLOT.w / 2, y + 43);
    }
    if (placed) {
      ctx.fillStyle = 'rgba(244, 201, 107, 0.95)';
      ctx.beginPath();
      ctx.arc(x + SLOT.w - 8, y + 8, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawButton(rect, text, enabled) {
    ctx.save();
    ctx.fillStyle = enabled ? 'rgba(244, 201, 107, 0.16)' : 'rgba(90, 110, 135, 0.08)';
    ctx.strokeStyle = enabled ? 'rgba(244, 201, 107, 0.78)' : 'rgba(130, 155, 180, 0.22)';
    ctx.lineWidth = 1.2;
    roundRect(rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = enabled ? '#ffe4a0' : '#71879c';
    ctx.font = '900 13px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    ctx.restore();
  }

  function drawEffects() {
    for (var i = 0; i < effects.particles.length; i++) {
      var p = effects.particles[i];
      var a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 9;
      if (p.shape === 'line') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(0, -p.size * 0.35, p.size * 2.6, p.size * 0.7);
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
      ctx.shadowColor = pop.color;
      ctx.shadowBlur = 10;
      ctx.font = '900 ' + pop.size + 'px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (effects.banner) {
      var b = effects.banner;
      var alpha = clamp(b.life / b.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha * 1.7);
      var y = 286 - (1 - alpha) * 8;
      ctx.fillStyle = 'rgba(5, 10, 20, 0.8)';
      roundRect(54, y - 27, 372, 66, 14);
      ctx.fill();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.2;
      roundRect(54, y - 27, 372, 66, 14);
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 18;
      ctx.font = '900 21px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, C.VIEW_W / 2, y);
      if (b.sub) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#e6f8ff';
        ctx.font = '800 11px ui-monospace, Menlo, monospace';
        ctx.fillText(b.sub, C.VIEW_W / 2, y + 21);
      }
      ctx.restore();
    }
  }

  function draw(time) {
    if (!ctx) return;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, C.VIEW_W, C.VIEW_H);
    ctx.save();
    if (effects && effects.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 14 * effects.shake, (Math.random() - 0.5) * 14 * effects.shake);
    }
    if (game) {
      drawBackdrop(time);
      ctx.fillStyle = 'rgba(255, 241, 190, 0.92)';
      ctx.font = '900 12px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('ROOM ' + (game.levelIndex + 1) + '  ' + game.level.title, 20, 80);
      ctx.fillStyle = 'rgba(145, 174, 199, 0.9)';
      ctx.font = '700 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.fillText(game.level.hint, 20, 98);
      drawGrid(time);
      if (runAnim) {
        var pos = runAnim.pos;
        var rr = cellRect(pos.r, pos.c);
        drawResident(rr.cx, rr.cy, time, true);
      }
      drawRipples(time);
      drawPanel();
    } else {
      drawTitle(time);
    }
    drawEffects();
    if (effects && effects.flash > 0) {
      ctx.fillStyle = 'rgba(' + effects.flashColor + ', ' + (effects.flash * 0.48) + ')';
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
    ctx.restore();
  }

  function burst(x, y, count, colors, speed, life, gravity) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = speed * (0.35 + Math.random() * 0.9);
      effects.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 50,
        g: gravity == null ? 580 : gravity,
        life: life * (0.55 + Math.random() * 0.65),
        max: life,
        size: 1.4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() < 0.35 ? 'line' : 'dot'
      });
    }
  }

  function popup(text, x, y, color, size) {
    effects.popups.push({ text: text, x: x, y: y, life: 0.9, max: 0.9, color: color, size: size || 16 });
  }

  function updateEffects(dt) {
    for (var i = effects.particles.length - 1; i >= 0; i--) {
      var p = effects.particles[i];
      p.life -= dt;
      if (p.life <= 0) { effects.particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 0.9);
    }
    for (i = effects.popups.length - 1; i >= 0; i--) {
      var pop = effects.popups[i];
      pop.life -= dt;
      pop.y -= 36 * dt;
      if (pop.life <= 0) effects.popups.splice(i, 1);
    }
    if (effects.shake > 0) effects.shake = Math.max(0, effects.shake - dt * 2.7);
    if (effects.flash > 0) effects.flash = Math.max(0, effects.flash - dt * 2.5);
    if (effects.banner) {
      effects.banner.life -= dt;
      if (effects.banner.life <= 0) effects.banner = null;
    }
    for (i = ripples.length - 1; i >= 0; i--) {
      if (nowMs() - ripples[i].start > 1400) ripples.splice(i, 1);
    }
  }

  function buildRunSteps(result) {
    var steps = [];
    for (var s = 0; s < result.segments.length; s++) {
      var seg = result.segments[s];
      for (var i = 0; i < seg.path.length; i++) {
        var cell = seg.path[i];
        var last = steps[steps.length - 1];
        if (last && last.r === cell.r && last.c === cell.c) continue;
        steps.push({ r: cell.r, c: cell.c, seg: s, type: seg.type, target: seg.target });
      }
    }
    return steps;
  }

  function startRun() {
    if (!game || game.phase !== 'build' || game.paused) return;
    var result = E.run(game);
    if (!result) return;
    runAnim = {
      result: result,
      steps: buildRunSteps(result),
      index: 0,
      timer: 0,
      startDelay: 0.22,
      endDelay: 0,
      pos: { r: game.level.start.r, c: game.level.start.c },
      done: false,
      triggered: {}
    };
    if (runAnim.steps.length) runAnim.pos = { r: runAnim.steps[0].r, c: runAnim.steps[0].c };
    pingCharm(0);
    var target = result.segments.length ? result.segments[0].target : null;
    if (target) ripples.push({ r: target.r, c: target.c, start: nowMs() });
    syncUI();
    updateRun(0);
  }

  function updateRun(dt) {
    if (!runAnim || runAnim.done) return;
    if (runAnim.startDelay > 0) {
      runAnim.startDelay -= dt;
      return;
    }
    runAnim.timer += dt;
    var interval = 0.12;
    while (runAnim.timer >= interval && runAnim.index < runAnim.steps.length) {
      runAnim.timer -= interval;
      runAnim.index++;
      if (runAnim.index < runAnim.steps.length) {
        runAnim.pos = { r: runAnim.steps[runAnim.index].r, c: runAnim.steps[runAnim.index].c };
        var step = runAnim.steps[runAnim.index];
        if (!runAnim.triggered[step.seg]) {
          runAnim.triggered[step.seg] = true;
          pingCharm(step.seg % 3);
          ripples.push({ r: step.target.r, c: step.target.c, start: nowMs() });
        }
      }
    }
    if (runAnim.index >= runAnim.steps.length) {
      runAnim.endDelay += dt;
      if (runAnim.endDelay > 0.45) {
        runAnim.done = true;
        E.completeRun(game);
        var st = E.getState(game);
        if (st.phase === 'clear') {
          pingClear();
          effects.flash = 0.55;
          effects.flashColor = '255, 238, 180';
        } else if (st.phase === 'ending') {
          pingClear();
          effects.flash = 0.8;
          effects.flashColor = '255, 246, 210';
        } else {
          buzz();
          effects.shake = 0.8;
          effects.flash = 0.4;
          effects.flashColor = '255, 120, 100';
        }
        syncUI();
      }
    }
  }

  function runFromSolution() {
    if (!game) return;
    E.clearItems(game);
    var sol = E.solutionFor(game.levelIndex);
    for (var i = 0; i < sol.bells.length; i++) E.placeItem(game, 'bell', i, sol.bells[i][0], sol.bells[i][1]);
    for (var m = 0; m < sol.mirrors.length; m++) E.placeItem(game, 'mirror', m, sol.mirrors[m][0], sol.mirrors[m][1]);
    E.run(game);
    E.completeRun(game);
  }

  function autoPlayStep() {
    if (!game) return;
    if (game.phase === 'build') {
      runFromSolution();
      return;
    }
    if (game.phase === 'clear') {
      E.nextLevel(game);
      syncUI();
      return;
    }
    if (game.phase === 'fail') {
      E.retry(game);
      runFromSolution();
      syncUI();
    }
  }

  function pointerPosition(e) {
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
    var w = rect.width || 480;
    var h = rect.height || 800;
    return { x: (e.clientX - rect.left) / w * C.VIEW_W, y: (e.clientY - rect.top) / h * C.VIEW_H };
  }

  function inRect(pos, r) {
    return pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
  }

  function slotAt(pos) {
    if (!game) return null;
    var entries = itemEntries(game);
    for (var i = 0; i < entries.length; i++) {
      var r = { x: 16 + i * (SLOT.w + SLOT.gap), y: 638, w: SLOT.w, h: SLOT.h };
      if (inRect(pos, r)) return entries[i];
    }
    return null;
  }

  function gridAt(pos) {
    if (!game) return null;
    for (var r = 0; r < game.level.h; r++) {
      for (var c = 0; c < game.level.w; c++) {
        var rr = { x: GRID_X + c * CELL, y: GRID_Y + r * CELL, w: CELL, h: CELL };
        if (inRect(pos, rr)) return { r: r, c: c };
      }
    }
    return null;
  }

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!game || game.paused || game.phase !== 'build') return;
    ensureAudio();
    var pos = pointerPosition(e);
    var slot = slotAt(pos);
    var grid = gridAt(pos);
    if (slot) E.selectItem(game, slot.type, slot.index);
    else if (inRect(pos, RUN_RECT)) {
      startRun();
      return;
    } else if (inRect(pos, RESET_RECT)) {
      E.clearItems(game);
      tone(380, 0.12, 0.035, 'triangle');
    } else if (grid) {
      if (E.removeItemAt(game, grid.r, grid.c)) {
        tone(320, 0.12, 0.03, 'triangle');
      } else {
        var selected = game.selected;
        if (E.placeItem(game, selected.type, selected.index, grid.r, grid.c)) {
          tone(selected.type === 'mirror' ? 880 : 720, 0.15, 0.04, 'sine');
          var rr = cellRect(grid.r, grid.c);
          burst(rr.cx, rr.cy, 8, selected.type === 'mirror' ? ['#82e8e2', '#ffffff', '#ffe4a0'] : ['#ffe4a0', '#ff8a73', '#ffffff'], 110, 0.45);
        }
      }
    }
    syncUI();
  }

  function onPointerMove(e) {
    if (!pointer && canvas) {
      var pos = pointerPosition(e);
      canvas.style.cursor = (slotAt(pos) || inRect(pos, RUN_RECT) || inRect(pos, RESET_RECT) || gridAt(pos)) ? 'pointer' : 'default';
    }
  }

  function onKeyDown(e) {
    if (!e) return;
    var k = e.key || '';
    var code = e.code || '';
    if (k === 'm' || k === 'M') {
      muted = !muted;
      saveMute();
      if (!muted) tone(600, 0.1, 0.03, 'sine');
      return;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game && (game.phase === 'build' || game.paused)) {
        if (e.preventDefault) e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === '1' || k === '2' || k === '3' || k === '4' || k === '5') {
      if (game && game.phase === 'build') {
        var n = Number(k);
        if (n <= game.level.maxBells) E.selectItem(game, 'bell', n - 1);
        else if (n <= game.level.maxBells + game.level.maxMirrors) E.selectItem(game, 'mirror', n - game.level.maxBells - 1);
      }
      return;
    }
    if (k === 'r' || k === 'R') {
      if (game && game.phase === 'build') startRun();
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || code === 'Space') {
      if (e.preventDefault) e.preventDefault();
      if (!game) return;
      if (game.phase === 'clear') nextLevel();
      else if (game.phase === 'fail') retryLevel();
      else if (game.phase === 'ending') beginGame();
      else if (game.paused) resumeGame();
      else if (game.phase === 'build' && !e.repeat) startRun();
    }
  }

  function nextLevel() {
    if (!game || game.phase !== 'clear') return;
    E.nextLevel(game);
    runAnim = null;
    setScreen(null);
    syncUI();
  }

  function retryLevel() {
    if (!game || game.phase !== 'fail') return;
    E.retry(game);
    runAnim = null;
    setScreen(null);
    syncUI();
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

  function buildScenery() {
    stars = [];
    for (var i = 0; i < 56; i++) {
      stars.push({ x: Math.random() * C.VIEW_W, y: Math.random() * 520, r: 0.6 + Math.random() * 1.7, tw: 0.5 + Math.random() * 1.8, phase: Math.random() * 6.28 });
    }
    motes = [];
    for (i = 0; i < 16; i++) {
      motes.push({ x: Math.random() * C.VIEW_W, y: 120 + Math.random() * 420, r: 1 + Math.random() * 2.2, speed: 5 + Math.random() * 12, phase: Math.random() * 6.28 });
    }
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);
    if (game) {
      if (game.phase === 'running' && !game.paused) updateRun(dt);
      syncUI();
    }
    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function init() {
    canvas = $('game');
    els.level = $('level');
    els.charms = $('charms');
    els.mirrors = $('mirrors');
    els.range = $('range');
    els.pause = $('btn-pause');
    els.screenTitle = $('screen-title');
    els.screenLevel = $('screen-level');
    els.screenFail = $('screen-fail');
    els.screenEnding = $('screen-ending');
    els.screenPause = $('screen-pause');
    els.clearLevel = $('clear-level');
    els.clearBells = $('clear-bells');
    els.clearMirrors = $('clear-mirrors');
    els.clearLeft = $('clear-left');
    els.failReason = $('fail-reason');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }
    muted = loadMute();
    resetEffects();
    buildScenery();
    resizeCanvas();

    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');

    var start = $('btn-start');
    var next = $('btn-next');
    var retry = $('btn-retry');
    var endRetry = $('btn-ending-retry');
    var resume = $('btn-resume');
    if (start) start.addEventListener('click', beginGame);
    if (next) next.addEventListener('click', nextLevel);
    if (retry) retry.addEventListener('click', retryLevel);
    if (endRetry) endRetry.addEventListener('click', beginGame);
    if (resume) resume.addEventListener('click', resumeGame);
    if (els.pause) els.pause.addEventListener('click', togglePause);

    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown, false);
      canvas.addEventListener('pointermove', onPointerMove, false);
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
      id: 'oto-no-ie',
      title: '音の家',
      start: function () { beginGame(); },
      autoPlayStep: autoPlayStep,
      isDone: function () { return !!(game && game.phase === 'ending'); },
      getState: function () {
        if (!game) return { id: 'oto-no-ie', phase: 'title', levelIndex: 0, levelTotal: E.total, total: E.total };
        return E.getState(game);
      },
      getCellPoint: function (r, c) {
        var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
        return {
          x: rect.left + (GRID_X + c * CELL + CELL / 2) / C.VIEW_W * (rect.width || 480),
          y: rect.top + (GRID_Y + r * CELL + CELL / 2) / C.VIEW_H * (rect.height || 800)
        };
      },
      getSlotPoint: function (i) {
        var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
        return {
          x: rect.left + (16 + i * (SLOT.w + SLOT.gap) + SLOT.w / 2) / C.VIEW_W * (rect.width || 480),
          y: rect.top + (638 + SLOT.h / 2) / C.VIEW_H * (rect.height || 800)
        };
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
