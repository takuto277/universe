(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.KenTsunagiEngine;
  var DATA = root.KEN_DATA;
  if (!E || !DATA) return;

  var C = {
    VIEW_W: 480,
    VIEW_H: 800,
    BEST_KEY: 'ken-tsunagi-best'
  };

  var BOARD = { x: 16, y: 64, w: 448, h: 476 };
  var BOARD_PAD = 12;
  var MAP_SCALE = Math.min((BOARD.w - BOARD_PAD * 2) / DATA.mapW, (BOARD.h - BOARD_PAD * 2) / DATA.mapH);
  var MAP_W = DATA.mapW * MAP_SCALE;
  var MAP_H = DATA.mapH * MAP_SCALE;
  var MAP_X = BOARD.x + (BOARD.w - MAP_W) / 2;
  var MAP_Y = BOARD.y + (BOARD.h - MAP_H) / 2;

  var HINT_RECT = { x: 22, y: 548, w: 100, h: 44 };
  var HINT_HIT = { x: 18, y: 540, w: 108, h: 58 };
  var TAB_Y = 604;
  var TAB_W = 56;
  var TAB_H = 46;
  var TAB_GAP = 2;
  var TRAY_X = 18;
  var TRAY_Y = 666;
  var TILE_W = 84;
  var TILE_H = 60;
  var TILE_GAP_X = 4;
  var TILE_GAP_Y = 6;
  var COLS = 5;

  var canvas = null;
  var ctx = null;
  var els = {};
  var game = null;
  var best = loadBest();
  var shownScreen = 'screen-title';
  var lastTs = 0;
  var dpr = 1;
  var scaleX = 1;
  var scaleY = 1;
  var pointer = null;
  var effects = null;
  var hintUntil = 0;
  var autoState = { delay: 0 };
  var ui = { finalized: false };
  var stars = [];
  var motes = [];
  var tabRects = [];

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function loadBest() {
    try {
      if (typeof localStorage === 'undefined') return { score: 0, time: 0 };
      var raw = JSON.parse(localStorage.getItem(C.BEST_KEY) || '{}');
      return {
        score: Math.max(0, parseInt(raw.score || 0, 10) || 0),
        time: Math.max(0, Number(raw.time) || 0)
      };
    } catch (e) {
      return { score: 0, time: 0 };
    }
  }

  function saveBest(value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(C.BEST_KEY, JSON.stringify(value));
    } catch (e) { }
  }

  function formatClock(seconds, tenths) {
    var s = Math.max(0, seconds);
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    if (tenths) return m + ':' + (sec < 10 ? '0' : '') + sec + '.' + Math.floor((s % 1) * 10);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function formatBestTime(seconds) {
    return seconds > 0 ? formatClock(seconds, true) : '--:--';
  }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var screens = [
      ['screen-title', els.screenTitle],
      ['screen-over', els.screenOver],
      ['screen-clear', els.screenClear],
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
      flashColor: '220, 250, 255',
      banner: null,
      confetti: 0,
      lastGlow: null
    };
    hintUntil = 0;
  }

  function beginRun() {
    game = E.createRun();
    ui.finalized = false;
    autoState.delay = 0;
    pointer = null;
    resetEffects();
    setScreen(null);
    if (els.pause) els.pause.classList.remove('hidden');
    lastTs = 0;
    syncUI();
  }

  function finalizeBest() {
    if (!game) return;
    if (game.score > best.score) best.score = game.score;
    if (game.phase === 'clear' && (best.time <= 0 || game.finishTime < best.time)) {
      best.time = game.finishTime;
    }
    saveBest(best);
    ui.finalized = true;
  }

  function syncUI() {
    if (els.titleBestScore) els.titleBestScore.textContent = String(best.score);
    if (els.titleBestTime) els.titleBestTime.textContent = formatBestTime(best.time);

    if (!game) return;
    if (els.score) els.score.textContent = String(game.score);
    if (els.time) {
      els.time.textContent = formatClock(Math.ceil(game.timeLeft), false);
      els.time.classList.toggle('low', game.phase === 'run' && game.timeLeft <= 30);
    }
    if (els.count) els.count.textContent = game.placedCount + '/' + E.total;

    var target = null;
    if (game.phase === 'over') target = 'screen-over';
    else if (game.phase === 'clear') target = 'screen-clear';
    else if (game.paused) target = 'screen-pause';
    setScreen(target);

    if ((game.phase === 'over' || game.phase === 'clear') && !ui.finalized) finalizeBest();

    if (game.phase === 'over' || game.phase === 'clear') {
      if (els.overScore) els.overScore.textContent = String(game.score);
      if (els.overCount) els.overCount.textContent = game.placedCount + '/' + E.total;
      if (els.overBestScore) els.overBestScore.textContent = String(best.score);
      if (els.overBestTime) els.overBestTime.textContent = formatBestTime(best.time);
      if (els.clearScore) els.clearScore.textContent = String(game.score);
      if (els.clearTime) els.clearTime.textContent = formatClock(game.finishTime, true);
      if (els.clearBestScore) els.clearBestScore.textContent = String(best.score);
      if (els.clearBestTime) els.clearBestTime.textContent = formatBestTime(best.time);
    }

    if (els.titleBestScore) els.titleBestScore.textContent = String(best.score);
    if (els.titleBestTime) els.titleBestTime.textContent = formatBestTime(best.time);

    if (els.pause) {
      var canPause = game.phase === 'run' && !game.paused;
      els.pause.classList.toggle('hidden', !canPause);
    }
  }

  function pauseGame() {
    if (!game || game.phase !== 'run' || game.paused) return;
    game.paused = true;
    E.setPaused(game, true);
    if (pointer) {
      pointer = null;
    }
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

  function mapPoint(pt) {
    return {
      x: MAP_X + pt[0] * MAP_SCALE,
      y: MAP_Y + pt[1] * MAP_SCALE
    };
  }

  function centerScreen(p) {
    return {
      x: MAP_X + p.center[0] * MAP_SCALE,
      y: MAP_Y + p.center[1] * MAP_SCALE
    };
  }

  function regionCenter(region) {
    var codes = E.regionCodes(region);
    var x = 0;
    var y = 0;
    var n = 0;
    for (var i = 0; i < codes.length; i++) {
      var p = E.byCode[codes[i]];
      x += p.center[0];
      y += p.center[1];
      n++;
    }
    if (!n) return { x: MAP_X + MAP_W / 2, y: MAP_Y + MAP_H / 2 };
    return { x: MAP_X + (x / n) * MAP_SCALE, y: MAP_Y + (y / n) * MAP_SCALE };
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

  function traceRings(p, ox, oy, scale) {
    var sx = ox == null ? MAP_X : ox;
    var sy = oy == null ? MAP_Y : oy;
    var sc = scale == null ? MAP_SCALE : scale;
    ctx.beginPath();
    for (var i = 0; i < p.rings.length; i++) {
      var ring = p.rings[i];
      for (var j = 0; j < ring.length; j++) {
        var x = sx + ring[j][0] * sc;
        var y = sy + ring[j][1] * sc;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }

  function drawMapShape(p, fill, stroke, lineWidth, ox, oy, scale) {
    traceRings(p, ox, oy, scale);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function drawBackdrop(time) {
    var sky = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
    sky.addColorStop(0, '#0b1530');
    sky.addColorStop(0.45, '#081126');
    sky.addColorStop(1, '#04070f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    var glow = ctx.createRadialGradient(240, 300, 20, 240, 300, 340);
    glow.addColorStop(0, 'rgba(47, 92, 150, 0.18)');
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
      ctx.fillStyle = 'rgba(242, 199, 108, ' + (0.04 + 0.07 * Math.abs(Math.sin(time + m.phase))) + ')';
      ctx.beginPath();
      ctx.arc(m.x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoard(time) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 24;
    var panel = ctx.createLinearGradient(BOARD.x, BOARD.y, BOARD.x, BOARD.y + BOARD.h);
    panel.addColorStop(0, '#101f3a');
    panel.addColorStop(0.55, '#0a1730');
    panel.addColorStop(1, '#060d1d');
    ctx.fillStyle = panel;
    roundRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 16);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(119, 228, 223, 0.16)';
    ctx.lineWidth = 1;
    roundRect(BOARD.x + 0.5, BOARD.y + 0.5, BOARD.w - 1, BOARD.h - 1, 16);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    roundRect(BOARD.x + 1, BOARD.y + 1, BOARD.w - 2, BOARD.h - 2, 15);
    ctx.clip();

    ctx.strokeStyle = 'rgba(119, 228, 223, 0.035)';
    ctx.lineWidth = 1;
    for (var gx = BOARD.x + 20; gx < BOARD.x + BOARD.w; gx += 28) {
      ctx.beginPath();
      ctx.moveTo(gx, BOARD.y);
      ctx.lineTo(gx, BOARD.y + BOARD.h);
      ctx.stroke();
    }
    for (var gy = BOARD.y + 20; gy < BOARD.y + BOARD.h; gy += 28) {
      ctx.beginPath();
      ctx.moveTo(BOARD.x, gy);
      ctx.lineTo(BOARD.x + BOARD.w, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(242, 199, 108, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(MAP_X + MAP_W / 2, MAP_Y + MAP_H / 2, MAP_H * 0.53, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(MAP_X + MAP_W / 2, MAP_Y + MAP_H / 2, MAP_H * 0.46, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(242, 199, 108, 0.32)';
    ctx.font = '700 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', BOARD.x + 14, BOARD.y + 20);
    ctx.strokeStyle = 'rgba(242, 199, 108, 0.28)';
    ctx.beginPath();
    ctx.moveTo(BOARD.x + 25, BOARD.y + 17);
    ctx.lineTo(BOARD.x + 25, BOARD.y + 30);
    ctx.stroke();
    ctx.restore();

    drawMap(time);
  }

  function drawMap(time) {
    var now = nowMs();
    var placedAll = game ? game.placed : {};

    for (var i = 0; i < E.prefectures.length; i++) {
      var p = E.prefectures[i];
      if (!placedAll[p.code]) continue;
      var glow = false;
      if (effects.lastGlow && effects.lastGlow.code === p.code && now < effects.lastGlow.until) glow = true;
      if (glow) {
        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 18;
        drawMapShape(p, p.color, 'rgba(5, 10, 20, 0.86)', 1.2);
        ctx.restore();
      } else {
        drawMapShape(p, p.color, 'rgba(5, 10, 20, 0.82)', 1.1);
      }
      ctx.save();
      ctx.globalAlpha = 0.5;
      drawMapShape(p, null, 'rgba(255, 255, 255, 0.22)', 0.7);
      ctx.restore();
    }

    var filter = game ? game.regionFilter : null;
    for (i = 0; i < E.prefectures.length; i++) {
      var q = E.prefectures[i];
      if (placedAll[q.code]) continue;
      var isFilter = q.region === filter;
      var isHint = hintUntil > now && hintUntilCode === q.code;
      var isPreview = pointer && pointer.moved && pointer.code === q.code && pointer.overBoard;
      var fill = isHint ? 'rgba(242, 199, 108, 0.34)' : (isFilter ? hexAlpha(q.color, 0.18) : hexAlpha(q.color, 0.045));
      var stroke = isHint ? 'rgba(255, 236, 167, 0.96)' : (isFilter ? hexAlpha(q.color, 0.52) : 'rgba(120, 180, 210, 0.12)');
      if (isPreview) {
        fill = 'rgba(255, 255, 255, 0.18)';
        stroke = 'rgba(255, 255, 255, 0.7)';
      }
      if (isHint) {
        var pulse = 0.5 + 0.5 * Math.sin(time * 7);
        ctx.save();
        ctx.shadowColor = 'rgba(242, 199, 108, 0.9)';
        ctx.shadowBlur = 10 + pulse * 12;
        drawMapShape(q, fill, stroke, 1.8);
        ctx.restore();
      } else {
        drawMapShape(q, fill, stroke, 0.9);
      }
    }

    if (hintUntil > now && hintUntilCode) {
      var hp = E.byCode[hintUntilCode];
      if (hp) {
        var c = centerScreen(hp);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffe8a8';
        ctx.font = '800 10px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 5;
        ctx.fillText(hp.label, c.x, c.y - 5);
        ctx.restore();
      }
    }

    if (game && game.lastPlaced) {
      var lp = E.byCode[game.lastPlaced.code];
      if (lp && effects.lastGlow && now < effects.lastGlow.until) {
        var lc = centerScreen(lp);
        ctx.save();
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = '#fff3c7';
        ctx.font = '800 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 4;
        ctx.fillText(lp.label, lc.x, lc.y);
        ctx.restore();
      }
    }
  }

  function drawDraggingPiece(time) {
    if (!pointer || !pointer.code || !pointer.moved) return;
    var p = E.byCode[pointer.code];
    if (!p) return;
    var target = centerScreen(p);
    var ox = MAP_X - target.x + pointer.x;
    var oy = MAP_Y - target.y + pointer.y;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 22;
    drawMapShape(p, p.color, 'rgba(255, 255, 255, 0.7)', 1.4, ox, oy, MAP_SCALE);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff3c7';
    ctx.font = '800 10px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 5;
    ctx.fillText(p.label, pointer.x, pointer.y - 14);
    ctx.restore();
  }

  function drawTray() {
    var panelY = 540;
    var panel = ctx.createLinearGradient(0, panelY, 0, C.VIEW_H);
    panel.addColorStop(0, 'rgba(12, 22, 45, 0.96)');
    panel.addColorStop(1, 'rgba(5, 10, 22, 0.98)');
    ctx.fillStyle = panel;
    roundRect(0, panelY, C.VIEW_W, C.VIEW_H - panelY, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(119, 228, 223, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, panelY + 1);
    ctx.lineTo(C.VIEW_W - 16, panelY + 1);
    ctx.stroke();

    var hintActive = game.hints > 0;
    ctx.save();
    ctx.fillStyle = hintActive ? 'rgba(242, 199, 108, 0.15)' : 'rgba(90, 110, 135, 0.1)';
    ctx.strokeStyle = hintActive ? 'rgba(242, 199, 108, 0.74)' : 'rgba(130, 155, 180, 0.25)';
    ctx.lineWidth = 1.3;
    roundRect(HINT_RECT.x, HINT_RECT.y, HINT_RECT.w, HINT_RECT.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hintActive ? '#ffe4a0' : '#71879c';
    ctx.font = '900 13px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ヒント ' + game.hints, HINT_RECT.x + HINT_RECT.w / 2, HINT_RECT.y + HINT_RECT.h / 2 + 1);
    ctx.restore();

    var selected = game.selectedCode ? E.byCode[game.selectedCode] : null;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (selected) {
      ctx.fillStyle = '#fff1bd';
      ctx.font = '900 16px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.fillText(selected.label, 138, 562);
      ctx.fillStyle = 'rgba(145, 174, 199, 0.95)';
      ctx.font = '700 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.fillText(E.regionLabel[selected.region] + ' / 地図の正しい場所へ', 138, 581);
    } else {
      ctx.fillStyle = 'rgba(224, 239, 255, 0.92)';
      ctx.font = '800 12px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.fillText('地方をえらんで、県を地図へ', 138, 562);
      ctx.fillStyle = 'rgba(145, 174, 199, 0.9)';
      ctx.font = '700 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.fillText('ドラッグでも、タップでも置けます', 138, 581);
    }

    for (var i = 0; i < tabRects.length; i++) drawTab(tabRects[i]);
    var pieces = E.tray(game);
    for (i = 0; i < pieces.length; i++) drawTile(pieces[i], i);
    if (!pieces.length) {
      ctx.fillStyle = 'rgba(145, 174, 199, 0.85)';
      ctx.font = '800 12px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('この地方は完成しました', C.VIEW_W / 2, 700);
    }
  }

  function drawTab(rect) {
    var region = rect.region;
    var remaining = E.regionRemaining(game, region).length;
    var active = game.regionFilter === region;
    var complete = remaining === 0;
    var color = E.regionColor[region];
    ctx.save();
    ctx.fillStyle = active ? hexAlpha(color, 0.2) : 'rgba(15, 30, 56, 0.72)';
    ctx.strokeStyle = active ? hexAlpha(color, 0.92) : 'rgba(119, 228, 223, 0.14)';
    ctx.lineWidth = active ? 1.6 : 1;
    roundRect(rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? '#fff3cc' : (complete ? 'rgba(126, 165, 188, 0.62)' : 'rgba(212, 232, 250, 0.9)');
    ctx.font = (active ? '900 ' : '800 ') + '9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(E.regionLabel[region], rect.x + rect.w / 2, rect.y + 28);
    if (remaining > 0) {
      ctx.fillStyle = active ? '#fff3cc' : color;
      ctx.beginPath();
      ctx.arc(rect.x + rect.w - 9, rect.y + 9, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#07101e';
      ctx.font = '900 8px ui-monospace, Menlo, monospace';
      ctx.fillText(String(remaining), rect.x + rect.w - 9, rect.y + 10);
    } else {
      ctx.strokeStyle = 'rgba(119, 228, 223, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.w - 14, rect.y + 9);
      ctx.lineTo(rect.x + rect.w - 10, rect.y + 13);
      ctx.lineTo(rect.x + rect.w - 4, rect.y + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function tileRect(index) {
    var col = index % COLS;
    var row = Math.floor(index / COLS);
    return {
      x: TRAY_X + col * (TILE_W + TILE_GAP_X),
      y: TRAY_Y + row * (TILE_H + TILE_GAP_Y),
      w: TILE_W,
      h: TILE_H
    };
  }

  function drawTile(p, index) {
    var r = tileRect(index);
    var active = game.selectedCode === p.code;
    ctx.save();
    ctx.fillStyle = active ? 'rgba(242, 199, 108, 0.14)' : 'rgba(17, 33, 61, 0.86)';
    ctx.strokeStyle = active ? 'rgba(255, 225, 157, 0.96)' : 'rgba(119, 228, 223, 0.1)';
    ctx.lineWidth = active ? 1.8 : 1;
    roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.stroke();

    var b = p.bbox;
    var bw = b[2] - b[0];
    var bh = b[3] - b[1];
    var scale = Math.min(42 / bw, 31 / bh);
    var cx = r.x + r.w / 2;
    var cy = r.y + 22;
    var ox = cx - ((b[0] + b[2]) / 2) * scale;
    var oy = cy - ((b[1] + b[3]) / 2) * scale;
    ctx.shadowColor = hexAlpha(p.color, 0.55);
    ctx.shadowBlur = active ? 9 : 4;
    drawMapShape(p, p.color, 'rgba(5, 10, 20, 0.78)', 0.8, ox, oy, scale);
    ctx.shadowBlur = 0;
    ctx.fillStyle = active ? '#fff4c9' : 'rgba(219, 236, 252, 0.9)';
    ctx.font = (active ? '900 ' : '700 ') + '9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.label, r.x + r.w / 2, r.y + 50);
    ctx.restore();
  }

  function drawIntroMap(time) {
    for (var i = 0; i < E.prefectures.length; i++) {
      var p = E.prefectures[i];
      drawMapShape(p, hexAlpha(p.color, 0.17 + 0.03 * Math.sin(time * 1.4 + i)), hexAlpha(p.color, 0.34), 0.8);
    }
  }

  function drawTitle(time) {
    drawBackdrop(time);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 24;
    var panel = ctx.createLinearGradient(BOARD.x, BOARD.y, BOARD.x, BOARD.y + BOARD.h);
    panel.addColorStop(0, '#101f3a');
    panel.addColorStop(1, '#060d1d');
    ctx.fillStyle = panel;
    roundRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 16);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(119, 228, 223, 0.16)';
    roundRect(BOARD.x + 0.5, BOARD.y + 0.5, BOARD.w - 1, BOARD.h - 1, 16);
    ctx.stroke();
    drawIntroMap(time);

    var panelY = 540;
    ctx.fillStyle = 'rgba(12, 22, 45, 0.8)';
    roundRect(0, panelY, C.VIEW_W, C.VIEW_H - panelY, 20);
    ctx.fill();
    ctx.fillStyle = 'rgba(242, 199, 108, 0.5)';
    ctx.font = '800 10px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('47 PIECES / 8 REGIONS / ONE MAP', C.VIEW_W / 2, 600);
    ctx.fillStyle = 'rgba(145, 174, 199, 0.6)';
    ctx.font = '700 9px ui-monospace, Menlo, monospace';
    ctx.fillText('DRAG · CONNECT · COMPLETE', C.VIEW_W / 2, 626);
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
      drawBoard(time);
      drawDraggingPiece(time);
      drawTray();
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
    effects.popups.push({
      text: text,
      x: x,
      y: y,
      life: 0.9,
      max: 0.9,
      color: color,
      size: size || 17
    });
  }

  function showBanner(text, sub, color) {
    effects.banner = {
      text: text,
      sub: sub || '',
      color: color || '#ffe6a3',
      life: 1.9,
      max: 1.9
    };
  }

  function processEvents() {
    if (!game) return;
    var events = E.consumeEvents(game);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'place') {
        var p = E.byCode[ev.code];
        if (!p) continue;
        var c = centerScreen(p);
        burst(c.x, c.y, ev.regionComplete ? 26 : 15, [p.color, '#fff4c9', '#ffffff'], ev.regionComplete ? 300 : 210, 0.65);
        popup('+' + ev.gain, c.x, c.y - 14, '#ffe6a3', 17);
        if (ev.neighbors > 0) popup('つながった ×' + ev.neighbors, c.x, c.y - 32, '#9ff4ef', 12);
        effects.lastGlow = { code: ev.code, until: nowMs() + 850 };
      } else if (ev.type === 'region') {
        var rc = regionCenter(ev.region);
        burst(rc.x, rc.y, 30, [E.regionColor[ev.region], '#fff4c9', '#ffffff'], 300, 0.9);
        showBanner(ev.label + ' 完成', '+500', E.regionColor[ev.region]);
      } else if (ev.type === 'miss') {
        effects.shake = Math.max(effects.shake, 0.8);
        effects.flash = Math.max(effects.flash, 0.4);
        effects.flashColor = '255, 110, 110';
        var md = ev.drop ? ev.drop : ev.target;
        var mt = mapPoint([md.x, md.y]);
        popup('ちがう... -2秒', mt.x, mt.y, '#ff9d8c', 15);
      } else if (ev.type === 'hint') {
        hintUntil = nowMs() + 2700;
        hintUntilCode = ev.code;
      } else if (ev.type === 'timeout') {
        effects.flash = 0.8;
        effects.flashColor = '255, 130, 110';
      } else if (ev.type === 'clear') {
        effects.flash = 0.8;
        effects.flashColor = '255, 246, 210';
        showBanner('日本地図 完成!', 'BONUS +' + ev.clearBonus, '#ffe6a3');
        for (var k = 0; k < 80; k++) {
          effects.particles.push({
            x: Math.random() * C.VIEW_W,
            y: -20 - Math.random() * 120,
            vx: (Math.random() - 0.5) * 80,
            vy: 80 + Math.random() * 140,
            g: 110,
            life: 3 + Math.random() * 2,
            max: 5,
            size: 2 + Math.random() * 4,
            color: ['#ffe6a3', '#77e4df', '#ff826d', '#ff77b7'][Math.floor(Math.random() * 4)],
            shape: 'line'
          });
        }
      }
    }
  }

  function updateEffects(dt) {
    if (!effects) return;
    for (var i = effects.particles.length - 1; i >= 0; i--) {
      var p = effects.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        effects.particles.splice(i, 1);
        continue;
      }
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
  }

  function drawEffects() {
    if (!effects) return;
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
      ctx.fillStyle = 'rgba(5, 10, 20, 0.78)';
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

  function pointerPosition(e) {
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
    var w = rect.width || 480;
    var h = rect.height || 800;
    return {
      x: (e.clientX - rect.left) / w * C.VIEW_W,
      y: (e.clientY - rect.top) / h * C.VIEW_H
    };
  }

  function inRect(pos, r) {
    return pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
  }

  function onBoard(pos) {
    return pos.x >= BOARD.x && pos.x <= BOARD.x + BOARD.w && pos.y >= BOARD.y && pos.y <= BOARD.y + BOARD.h;
  }

  function pieceAt(pos) {
    if (!game) return null;
    var pieces = E.tray(game);
    for (var i = 0; i < pieces.length; i++) {
      if (inRect(pos, tileRect(i))) return pieces[i];
    }
    return null;
  }

  function tabAt(pos) {
    for (var i = 0; i < tabRects.length; i++) {
      if (inRect(pos, { x: tabRects[i].x, y: 598, w: tabRects[i].w, h: 62 })) return tabRects[i].region;
    }
    return null;
  }

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!game || game.paused || game.phase !== 'run' || pointer) return;
    var pos = pointerPosition(e);
    var mode = 'none';
    var code = null;
    var region = null;

    if (inRect(pos, HINT_HIT)) mode = 'hint';
    else {
      region = tabAt(pos);
      if (region) mode = 'tab';
      else {
        var piece = pieceAt(pos);
        if (piece) {
          mode = 'drag';
          code = piece.code;
          E.selectPiece(game, code);
          syncUI();
        } else if (onBoard(pos)) {
          if (game.selectedCode) {
            mode = 'board';
            code = game.selectedCode;
          }
        }
      }
    }

    pointer = {
      id: e.pointerId == null ? 1 : e.pointerId,
      mode: mode,
      code: code,
      region: region,
      x: pos.x,
      y: pos.y,
      startX: pos.x,
      startY: pos.y,
      moved: false,
      overBoard: onBoard(pos)
    };
    try {
      if (canvas.setPointerCapture) canvas.setPointerCapture(pointer.id);
    } catch (err) { }
  }

  function onPointerMove(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!pointer) {
      var hover = pointerPosition(e);
      if (canvas) {
        var interactive = inRect(hover, HINT_HIT) || tabAt(hover) || pieceAt(hover) || (onBoard(hover) && game && game.selectedCode);
        canvas.style.cursor = interactive ? 'pointer' : 'default';
      }
      return;
    }
    if ((e.pointerId == null ? 1 : e.pointerId) !== pointer.id) return;
    var pos = pointerPosition(e);
    pointer.x = pos.x;
    pointer.y = pos.y;
    pointer.overBoard = onBoard(pos);
    if (Math.abs(pos.x - pointer.startX) + Math.abs(pos.y - pointer.startY) > 7) pointer.moved = true;
  }

  function onPointerUp(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!pointer) return;
    var id = e.pointerId == null ? 1 : e.pointerId;
    if (id !== pointer.id) return;
    var p = pointer;
    pointer = null;
    try {
      if (canvas.releasePointerCapture) canvas.releasePointerCapture(id);
    } catch (err) { }

    if (!game || game.paused || game.phase !== 'run') return;

    if (p.mode === 'hint' && !p.moved) {
      doHint();
    } else if (p.mode === 'tab' && !p.moved) {
      game.selectedCode = null;
      E.selectRegion(game, p.region);
      syncUI();
    } else if ((p.mode === 'drag' || p.mode === 'board') && p.code) {
      if (p.overBoard) attemptPlace(p.code, p.x, p.y);
    }
  }

  function onPointerCancel(e) {
    if (pointer && (e.pointerId == null || e.pointerId === pointer.id)) {
      var id = pointer.id;
      pointer = null;
      try {
        if (canvas.releasePointerCapture) canvas.releasePointerCapture(id);
      } catch (err) { }
    }
  }

  function attemptPlace(code, x, y) {
    if (!game || game.phase !== 'run' || game.paused) return;
    var nx = (x - MAP_X) / MAP_SCALE;
    var ny = (y - MAP_Y) / MAP_SCALE;
    var result = E.tryPlace(game, code, nx, ny);
    processEvents();
    syncUI();
    return result;
  }

  function doHint() {
    if (!game || game.phase !== 'run' || game.paused) return;
    var h = E.useHint(game);
    if (!h) {
      popup('ヒントはつかえない', C.VIEW_W / 2, 520, '#ff9d8c', 13);
      return;
    }
    hintUntil = nowMs() + 2700;
    hintUntilCode = h.code;
    showBanner(h.label + ' はここ', E.regionLabel[h.region], '#ffe6a3');
    processEvents();
    syncUI();
  }

  function onKeyDown(e) {
    if (!e) return;
    var k = e.key || '';
    var code = e.code || '';
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (game && (game.phase === 'run' || game.paused)) {
        if (e.preventDefault) e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === 'h' || k === 'H') {
      if (game && game.phase === 'run' && !game.paused) {
        if (e.preventDefault) e.preventDefault();
        doHint();
      }
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || code === 'Space') {
      if (e.preventDefault) e.preventDefault();
      if (!game || game.phase === 'over' || game.phase === 'clear') {
        if (!e.repeat) beginRun();
      } else if (game.paused) {
        resumeGame();
      }
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(2, Math.max(1, window.devicePixelRatio)) : 1;
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
      stars.push({
        x: Math.random() * C.VIEW_W,
        y: Math.random() * 520,
        r: 0.6 + Math.random() * 1.7,
        tw: 0.5 + Math.random() * 1.8,
        phase: Math.random() * 6.28
      });
    }
    motes = [];
    for (i = 0; i < 16; i++) {
      motes.push({
        x: Math.random() * C.VIEW_W,
        y: 120 + Math.random() * 420,
        r: 1 + Math.random() * 2.2,
        speed: 5 + Math.random() * 12,
        phase: Math.random() * 6.28
      });
    }
    tabRects = [];
    var totalW = E.regions.length * TAB_W + (E.regions.length - 1) * TAB_GAP;
    var startX = (C.VIEW_W - totalW) / 2;
    for (i = 0; i < E.regions.length; i++) {
      tabRects.push({
        x: startX + i * (TAB_W + TAB_GAP),
        y: TAB_Y,
        w: TAB_W,
        h: TAB_H,
        region: E.regions[i].id
      });
    }
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);

    if (game && !game.paused && game.phase === 'run') {
      E.tick(game, dt);
      processEvents();
      syncUI();
    } else if (game) {
      syncUI();
    }
    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function autoPlayStep() {
    if (!game) return;
    if (game.paused || game.phase !== 'run') return;
    if (autoState.delay > 0) {
      autoState.delay--;
      return;
    }
    var pieces = E.tray(game);
    var code = pieces.length ? pieces[0].code : E.firstRemaining(game);
    if (!code) return;
    var t = E.target(code);
    E.tryPlace(game, code, t.x, t.y);
    processEvents();
    syncUI();
    autoState.delay = 1;
  }

  function hexAlpha(hex, alpha) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  var hintUntilCode = null;

  function init() {
    canvas = $('game');
    els.score = $('score');
    els.time = $('time');
    els.count = $('count');
    els.pause = $('btn-pause');
    els.screenTitle = $('screen-title');
    els.screenOver = $('screen-over');
    els.screenClear = $('screen-clear');
    els.screenPause = $('screen-pause');
    els.titleBestScore = $('title-best-score');
    els.titleBestTime = $('title-best-time');
    els.overScore = $('over-score');
    els.overCount = $('over-count');
    els.overBestScore = $('over-best-score');
    els.overBestTime = $('over-best-time');
    els.clearScore = $('clear-score');
    els.clearTime = $('clear-time');
    els.clearBestScore = $('clear-best-score');
    els.clearBestTime = $('clear-best-time');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }
    resetEffects();
    buildScenery();
    resizeCanvas();

    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');
    if (els.titleBestScore) els.titleBestScore.textContent = String(best.score);
    if (els.titleBestTime) els.titleBestTime.textContent = formatBestTime(best.time);

    var start = $('btn-start');
    var over = $('btn-over-retry');
    var clear = $('btn-clear-retry');
    var resume = $('btn-resume');
    if (start) start.addEventListener('click', beginRun);
    if (over) over.addEventListener('click', beginRun);
    if (clear) clear.addEventListener('click', beginRun);
    if (resume) resume.addEventListener('click', resumeGame);
    if (els.pause) els.pause.addEventListener('click', togglePause);

    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown, false);
      canvas.addEventListener('pointermove', onPointerMove, false);
      canvas.addEventListener('pointerup', onPointerUp, false);
      canvas.addEventListener('pointercancel', onPointerCancel, false);
      canvas.addEventListener('lostpointercapture', onPointerCancel, false);
      canvas.addEventListener('contextmenu', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
      canvas.addEventListener('dblclick', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    }

    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('blur', pauseGame, false);
    window.addEventListener('resize', resizeCanvas, false);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pauseGame();
    }, false);
    document.addEventListener('gesturestart', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('gesturechange', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('gestureend', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('contextmenu', function (e) { if (e.preventDefault) e.preventDefault(); }, false);
    document.addEventListener('selectstart', function (e) { if (e.preventDefault) e.preventDefault(); }, false);

    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    root.__GAME__ = {
      id: 'ken-tsunagi',
      title: 'けんつなぎ',
      start: function () { beginRun(); },
      autoPlayStep: autoPlayStep,
      isDone: function () {
        return !!(game && (game.phase === 'clear' || game.phase === 'over'));
      },
      getState: function () {
        if (!game) {
          return {
            id: 'ken-tsunagi',
            phase: 'title',
            placedCount: 0,
            total: E.total,
            score: 0,
            timeLeft: E.timeLimit,
            best: best
          };
        }
        var state = E.getState(game);
        state.best = { score: best.score, time: best.time };
        return state;
      },
      getScreenTarget: function (code) {
        var p = E.byCode[Number(code)];
        if (!p) return null;
        var c = centerScreen(p);
        var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
        return {
          x: rect.left + c.x / C.VIEW_W * (rect.width || 480),
          y: rect.top + c.y / C.VIEW_H * (rect.height || 800)
        };
      },
      getPieceTile: function (code) {
        if (!game) return null;
        var pieces = E.tray(game);
        for (var i = 0; i < pieces.length; i++) {
          if (pieces[i].code === Number(code)) {
            var r = tileRect(i);
            var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
            return {
              x: rect.left + (r.x + r.w / 2) / C.VIEW_W * (rect.width || 480),
              y: rect.top + (r.y + r.h / 2) / C.VIEW_H * (rect.height || 800)
            };
          }
        }
        return null;
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
