(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.KenTsunagiEngine;
  var DATA = root.KEN_DATA;
  if (!E || !DATA) return;

  var C = { VIEW_W: 480, VIEW_H: 800, BEST_KEY: 'ken-tsunagi-best' };
  var BOX = { x: 16, y: 64, w: 448, h: 541 };
  var SCALE = BOX.w / E.world.w;
  var FLOOR_Y = BOX.y + E.world.h * SCALE;
  var PANEL_Y = 608;
  var HINT_RECT = { x: 20, y: 710, w: 132, h: 60 };
  var SHAKE_RECT = { x: 160, y: 710, w: 132, h: 60 };

  var canvas = null;
  var ctx = null;
  var els = {};
  var game = null;
  var best = loadBest();
  var shownScreen = 'screen-title';
  var lastTs = 0;
  var scaleX = 1;
  var scaleY = 1;
  var pointer = null;
  var effects = null;
  var hint = null;
  var autoState = { wait: 0 };
  var ui = { finalized: false };
  var stars = [];
  var motes = [];

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
      banner: null
    };
    hint = null;
  }

  function beginRun() {
    game = E.createRun();
    ui.finalized = false;
    autoState.wait = 0;
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

    var st = E.getState(game);
    if (els.score) els.score.textContent = String(st.score);
    if (els.count) els.count.textContent = st.largest + '/' + st.total;
    if (els.time) {
      if (st.allDropped) {
        els.time.textContent = formatClock(Math.ceil(st.finishTimer), false);
        els.time.classList.toggle('low', st.phase === 'run' && st.finishTimer <= 15);
      } else {
        els.time.textContent = '--:--';
        els.time.classList.remove('low');
      }
    }

    var target = null;
    if (st.phase === 'over') target = 'screen-over';
    else if (st.phase === 'clear') target = 'screen-clear';
    else if (st.paused) target = 'screen-pause';
    setScreen(target);

    if ((st.phase === 'over' || st.phase === 'clear') && !ui.finalized) finalizeBest();

    if (st.phase === 'over') {
      if (els.overKicker) els.overKicker.textContent = st.reason === 'overflow' ? 'BOX FULL' : 'TIME UP';
      if (els.overTitle) els.overTitle.textContent = st.reason === 'overflow' ? '箱がいっぱい' : 'TIME UP';
      if (els.overScore) els.overScore.textContent = String(st.score);
      if (els.overCount) els.overCount.textContent = st.largest + '/' + st.total;
      if (els.overBestScore) els.overBestScore.textContent = String(best.score);
      if (els.overBestTime) els.overBestTime.textContent = formatBestTime(best.time);
    } else if (st.phase === 'clear') {
      if (els.clearScore) els.clearScore.textContent = String(st.score);
      if (els.clearTime) els.clearTime.textContent = formatClock(st.finishTime, true);
      if (els.clearBestScore) els.clearBestScore.textContent = String(best.score);
      if (els.clearBestTime) els.clearBestTime.textContent = formatBestTime(best.time);
    }

    if (els.titleBestScore) els.titleBestScore.textContent = String(best.score);
    if (els.titleBestTime) els.titleBestTime.textContent = formatBestTime(best.time);

    if (els.pause) {
      els.pause.classList.toggle('hidden', !(st.phase === 'run' && !st.paused));
    }
  }

  function pauseGame() {
    if (!game || game.phase !== 'run' || game.paused) return;
    game.paused = true;
    E.setPaused(game, true);
    pointer = null;
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

  function screenOf(bodyX, bodyY, ref, mp) {
    return {
      x: BOX.x + (bodyX + mp[0] - ref.center[0]) * SCALE,
      y: BOX.y + (bodyY + mp[1] - ref.center[1]) * SCALE
    };
  }

  function tracePref(p, bodyX, bodyY, ref, offsetX, offsetY) {
    var ox = offsetX || 0;
    var oy = offsetY || 0;
    ctx.beginPath();
    for (var i = 0; i < p.rings.length; i++) {
      var ring = p.rings[i];
      for (var j = 0; j < ring.length; j++) {
        var s = screenOf(bodyX, bodyY, ref, ring[j]);
        var x = s.x + ox;
        var y = s.y + oy;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }

  function drawPref(p, bodyX, bodyY, ref, fill, stroke, width, ox, oy, shadow) {
    ctx.save();
    if (shadow) {
      ctx.shadowColor = shadow;
      ctx.shadowBlur = 16;
    }
    tracePref(p, bodyX, bodyY, ref, ox, oy);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width || 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMini(p, cx, cy, maxW, maxH, alpha) {
    var b = p.bbox;
    var bw = b[2] - b[0];
    var bh = b[3] - b[1];
    var sc = Math.min(maxW / bw, maxH / bh);
    var ox = cx - ((b[0] + b[2]) / 2) * sc;
    var oy = cy - ((b[1] + b[3]) / 2) * sc;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.beginPath();
    for (var i = 0; i < p.rings.length; i++) {
      var ring = p.rings[i];
      for (var j = 0; j < ring.length; j++) {
        var x = ox + ring[j][0] * sc;
        var y = oy + ring[j][1] * sc;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(5, 10, 20, 0.8)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  function drawBackdrop(time) {
    var sky = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
    sky.addColorStop(0, '#0b1530');
    sky.addColorStop(0.48, '#081126');
    sky.addColorStop(1, '#04070f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    var glow = ctx.createRadialGradient(240, 310, 20, 240, 310, 350);
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
      ctx.fillStyle = 'rgba(242, 199, 108, ' + (0.04 + 0.07 * Math.abs(Math.sin(time + m.phase))) + ')';
      ctx.beginPath();
      ctx.arc(m.x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBox(time) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 26;
    var panel = ctx.createLinearGradient(BOX.x, BOX.y, BOX.x, BOX.y + BOX.h);
    panel.addColorStop(0, '#10203c');
    panel.addColorStop(0.55, '#0a1730');
    panel.addColorStop(1, '#060d1d');
    ctx.fillStyle = panel;
    roundRect(BOX.x, BOX.y, BOX.w, BOX.h, 16);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(119, 228, 223, 0.16)';
    ctx.lineWidth = 1;
    roundRect(BOX.x + 0.5, BOX.y + 0.5, BOX.w - 1, BOX.h - 1, 16);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    roundRect(BOX.x + 1, BOX.y + 1, BOX.w - 2, BOX.h - 2, 15);
    ctx.clip();
    ctx.strokeStyle = 'rgba(119, 228, 223, 0.035)';
    for (var gx = BOX.x + 18; gx < BOX.x + BOX.w; gx += 28) {
      ctx.beginPath();
      ctx.moveTo(gx, BOX.y);
      ctx.lineTo(gx, BOX.y + BOX.h);
      ctx.stroke();
    }
    for (var gy = BOX.y + 18; gy < BOX.y + BOX.h; gy += 28) {
      ctx.beginPath();
      ctx.moveTo(BOX.x, gy);
      ctx.lineTo(BOX.x + BOX.w, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(242, 199, 108, 0.12)';
    ctx.beginPath();
    ctx.arc(BOX.x + BOX.w / 2, BOX.y + BOX.h / 2, 220, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(BOX.x + BOX.w / 2, BOX.y + BOX.h / 2, 178, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242, 199, 108, 0.34)';
    ctx.font = '700 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', BOX.x + 14, BOX.y + 16);
    ctx.strokeStyle = 'rgba(242, 199, 108, 0.3)';
    ctx.beginPath();
    ctx.moveTo(BOX.x + 24, BOX.y + 12);
    ctx.lineTo(BOX.x + 24, BOX.y + 25);
    ctx.stroke();

    var danger = game ? game.overflowTimer : 0;
    ctx.strokeStyle = danger > 0 ? 'rgba(255, 120, 105, ' + (0.55 + 0.35 * Math.sin(time * 9)) + ')' : 'rgba(255, 120, 105, 0.38)';
    ctx.lineWidth = danger > 0 ? 2 : 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(BOX.x + 8, BOX.y + 3);
    ctx.lineTo(BOX.x + BOX.w - 8, BOX.y + 3);
    ctx.stroke();
    ctx.setLineDash([]);
    if (danger > 0) {
      var warn = ctx.createLinearGradient(0, BOX.y, 0, BOX.y + 38);
      warn.addColorStop(0, 'rgba(255, 90, 80, 0.24)');
      warn.addColorStop(1, 'rgba(255, 90, 80, 0)');
      ctx.fillStyle = warn;
      ctx.fillRect(BOX.x + 1, BOX.y + 1, BOX.w - 2, 38);
    }
    ctx.restore();
  }

  function drawBodies(time) {
    if (!game) return;
    ctx.save();
    ctx.beginPath();
    roundRect(BOX.x + 2, BOX.y + 2, BOX.w - 4, BOX.h - 4, 14);
    ctx.clip();
    for (var i = 0; i < game.bodies.length; i++) {
      var body = game.bodies[i];
      var ref = E.byCode[body.ref];
      for (var j = 0; j < body.members.length; j++) {
        var p = E.byCode[body.members[j]];
        drawPref(p, body.x, body.y, ref, p.color, 'rgba(5, 10, 20, 0.84)', 1.1, 0, 0, null);
      }
    }
    ctx.restore();
  }

  function drawActive(time) {
    if (!game || !game.activeCode) return;
    var p = E.byCode[game.activeCode];
    var y = E.spawnYFor(game.activeCode);
    var x = BOX.x + game.activeX * SCALE;
    ctx.save();
    ctx.beginPath();
    roundRect(BOX.x + 2, BOX.y + 2, BOX.w - 4, BOX.h - 4, 14);
    ctx.clip();
    ctx.strokeStyle = 'rgba(242, 199, 108, 0.26)';
    ctx.setLineDash([4, 9]);
    ctx.beginPath();
    ctx.moveTo(x, BOX.y + 30);
    ctx.lineTo(x, FLOOR_Y - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    drawPref(p, game.activeX, y, p, p.color, 'rgba(255, 240, 177, 0.95)', 1.7, 0, 0, p.color);
    ctx.restore();
  }

  function drawHint(time) {
    if (!game || !hint || nowMs() > hint.until || !game.activeCode) return;
    var sx = BOX.x + hint.x * SCALE;
    ctx.save();
    ctx.beginPath();
    roundRect(BOX.x + 2, BOX.y + 2, BOX.w - 4, BOX.h - 4, 14);
    ctx.clip();
    var pulse = 0.55 + 0.45 * Math.sin(time * 7);
    ctx.globalAlpha = 0.72 + pulse * 0.2;
    ctx.strokeStyle = 'rgba(255, 238, 171, ' + (0.55 + pulse * 0.35) + ')';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(sx, BOX.y + 24);
    ctx.lineTo(sx, FLOOR_Y - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffe8a8';
    ctx.shadowColor = 'rgba(242, 199, 108, 0.9)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(sx - 6, BOX.y + 30);
    ctx.lineTo(sx + 6, BOX.y + 30);
    ctx.lineTo(sx, BOX.y + 40);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#ffe8a8';
    ctx.font = '900 10px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText('ここへ落とす', sx, BOX.y + 58);
    ctx.restore();
  }

  function drawPanel() {
    var panel = ctx.createLinearGradient(0, PANEL_Y, 0, C.VIEW_H);
    panel.addColorStop(0, 'rgba(12, 22, 45, 0.98)');
    panel.addColorStop(1, 'rgba(5, 10, 22, 0.99)');
    ctx.fillStyle = panel;
    roundRect(0, PANEL_Y, C.VIEW_W, C.VIEW_H - PANEL_Y, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(119, 228, 223, 0.14)';
    ctx.beginPath();
    ctx.moveTo(16, PANEL_Y + 1);
    ctx.lineTo(C.VIEW_W - 16, PANEL_Y + 1);
    ctx.stroke();

    var st = E.getState(game);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (st.activeCode) {
      var active = E.byCode[st.activeCode];
      ctx.fillStyle = '#fff1bd';
      ctx.font = '900 15px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.fillText('いま: ' + active.label, 20, 625);
    } else {
      ctx.fillStyle = '#fff1bd';
      ctx.font = '900 14px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.fillText('全部落とした! 60秒で完成させよう', 20, 625);
    }
    ctx.fillStyle = 'rgba(145, 174, 199, 0.95)';
    ctx.font = '800 10px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('のこり ' + st.queueLength, 460, 625);
    ctx.textAlign = 'left';
    ctx.font = '800 8px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(145, 174, 199, 0.8)';
    ctx.fillText('NEXT', 20, 650);

    var next = st.queue.slice(1, 4);
    for (var i = 0; i < next.length; i++) {
      var p = E.byCode[next[i]];
      var x = 70 + i * 74;
      ctx.save();
      ctx.fillStyle = 'rgba(17, 33, 61, 0.78)';
      ctx.strokeStyle = 'rgba(119, 228, 223, 0.1)';
      roundRect(x, 638, 66, 54, 9);
      ctx.fill();
      ctx.stroke();
      drawMini(p, x + 33, 660, 48, 27, 0.92);
      ctx.fillStyle = 'rgba(219, 236, 252, 0.86)';
      ctx.font = '700 8px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, x + 33, 682);
      ctx.restore();
    }

    drawButton(HINT_RECT, 'ヒント ' + st.hints, st.hints > 0);
    drawButton(SHAKE_RECT, 'ゆらす ' + st.shakes, st.shakes > 0);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(145, 174, 199, 0.9)';
    ctx.font = '700 9px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.fillText('左右にドラッグ', 310, 726);
    ctx.fillText('離す / タップで落とす', 310, 742);
    ctx.fillText('H:ヒント  X:ゆらす', 310, 758);
  }

  function drawButton(rect, text, enabled) {
    ctx.save();
    ctx.fillStyle = enabled ? 'rgba(242, 199, 108, 0.14)' : 'rgba(90, 110, 135, 0.08)';
    ctx.strokeStyle = enabled ? 'rgba(242, 199, 108, 0.72)' : 'rgba(130, 155, 180, 0.22)';
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

  function drawTitle(time) {
    drawBackdrop(time);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 26;
    var panel = ctx.createLinearGradient(BOX.x, BOX.y, BOX.x, BOX.y + BOX.h);
    panel.addColorStop(0, '#10203c');
    panel.addColorStop(1, '#060d1d');
    ctx.fillStyle = panel;
    roundRect(BOX.x, BOX.y, BOX.w, BOX.h, 16);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(119, 228, 223, 0.16)';
    roundRect(BOX.x + 0.5, BOX.y + 0.5, BOX.w - 1, BOX.h - 1, 16);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    roundRect(BOX.x + 1, BOX.y + 1, BOX.w - 2, BOX.h - 2, 15);
    ctx.clip();
    var demo = [
      { code: 1, x: 0.62, y: 0.72 },
      { code: 2, x: 0.60, y: 0.61 },
      { code: 3, x: 0.64, y: 0.55 },
      { code: 4, x: 0.63, y: 0.49 },
      { code: 7, x: 0.60, y: 0.42 },
      { code: 13, x: 0.57, y: 0.33 },
      { code: 27, x: 0.44, y: 0.42 },
      { code: 40, x: 0.24, y: 0.55 }
    ];
    for (var i = 0; i < demo.length; i++) {
      var p = E.byCode[demo[i].code];
      drawPref(p, demo[i].x, demo[i].y, p, hexAlpha(p.color, 0.32), hexAlpha(p.color, 0.55), 0.8, 0, 0, null);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(12, 22, 45, 0.84)';
    roundRect(0, PANEL_Y, C.VIEW_W, C.VIEW_H - PANEL_Y, 20);
    ctx.fill();
    ctx.fillStyle = 'rgba(242, 199, 108, 0.55)';
    ctx.font = '900 10px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP · MERGE · 47 PREFECTURES', C.VIEW_W / 2, 678);
    ctx.fillStyle = 'rgba(145, 174, 199, 0.55)';
    ctx.font = '700 9px ui-monospace, Menlo, monospace';
    ctx.fillText('FALL · TOUCH · CONNECT', C.VIEW_W / 2, 704);
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
      ctx.translate((Math.random() - 0.5) * 16 * effects.shake, (Math.random() - 0.5) * 16 * effects.shake);
    }
    if (game) {
      drawBackdrop(time);
      drawBox(time);
      drawBodies(time);
      drawActive(time);
      drawHint(time);
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
    effects.banner = { text: text, sub: sub || '', color: color || '#ffe6a3', life: 1.9, max: 1.9 };
  }

  function processEvents() {
    if (!game) return;
    var events = E.consumeEvents(game);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'merge') {
        var x = BOX.x + ev.x * SCALE;
        var y = BOX.y + ev.y * SCALE;
        burst(x, y, 14, ['#ffe6a3', '#77e4df', '#ffffff'], 220, 0.55);
        popup('+' + ev.gain, x, y - 10, '#ffe6a3', 17);
        popup(ev.count + '県 合体', x, y - 28, '#9ff4ef', 11);
        effects.shake = Math.max(effects.shake, 0.18);
      } else if (ev.type === 'region') {
        var codes = E.byRegion[ev.region];
        var rx = 0;
        var ry = 0;
        for (var k = 0; k < codes.length; k++) {
          var rp = E.byCode[codes[k]];
          rx += rp.center[0];
          ry += rp.center[1];
        }
        rx = BOX.x + (rx / codes.length) * SCALE;
        ry = BOX.y + (ry / codes.length) * SCALE;
        burst(rx, ry, 28, [E.regionColor[ev.region], '#fff4c9', '#ffffff'], 280, 0.9);
        showBanner(ev.label + ' 完成', '+500', E.regionColor[ev.region]);
      } else if (ev.type === 'drop') {
        var dx = BOX.x + ev.x * SCALE;
        burst(dx, BOX.y + 15, 6, ['#77e4df', '#ffffff'], 80, 0.28, 240);
      } else if (ev.type === 'hint') {
        hint = { code: ev.code, x: ev.x, y: ev.y, until: nowMs() + 2700 };
      } else if (ev.type === 'shake') {
        effects.shake = Math.max(effects.shake, 0.6);
      } else if (ev.type === 'overflow') {
        effects.flash = 0.8;
        effects.flashColor = '255, 120, 100';
      } else if (ev.type === 'timeout') {
        effects.flash = 0.8;
        effects.flashColor = '255, 120, 100';
      } else if (ev.type === 'clear') {
        effects.flash = 0.85;
        effects.flashColor = '255, 246, 210';
        showBanner('日本列島 完成!', 'BONUS +' + ev.bonus, '#ffe6a3');
        for (var n = 0; n < 90; n++) {
          effects.particles.push({
            x: Math.random() * C.VIEW_W,
            y: -20 - Math.random() * 140,
            vx: (Math.random() - 0.5) * 80,
            vy: 80 + Math.random() * 150,
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

  function inBox(pos) {
    return pos.x >= BOX.x && pos.x <= BOX.x + BOX.w && pos.y >= BOX.y && pos.y <= BOX.y + BOX.h;
  }

  function setActiveFromScreen(x) {
    if (!game || !game.activeCode) return;
    E.setActiveX(game, (x - BOX.x) / SCALE);
  }

  function dropActive() {
    if (!game || game.phase !== 'run' || game.paused) return null;
    var body = E.dropActive(game);
    processEvents();
    syncUI();
    return body;
  }

  function useHint() {
    if (!game || game.phase !== 'run' || game.paused) return;
    var target = E.useHint(game);
    if (target) {
      hint = { code: target.code, x: target.x, y: target.y, until: nowMs() + 2700 };
      effects.flash = Math.max(effects.flash, 0.12);
      effects.flashColor = '255, 232, 150';
    } else {
      popup('ヒントはつかえない', C.VIEW_W / 2, 560, '#ff9d8c', 13);
    }
    processEvents();
    syncUI();
  }

  function useShake() {
    if (!game || game.phase !== 'run' || game.paused) return;
    if (E.shake(game)) {
      processEvents();
      syncUI();
    }
  }

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!game || game.phase !== 'run' || game.paused || pointer) return;
    var pos = pointerPosition(e);
    var mode = 'none';
    if (inRect(pos, HINT_RECT)) mode = 'hint';
    else if (inRect(pos, SHAKE_RECT)) mode = 'shake';
    else if (inBox(pos)) {
      mode = 'drop';
      setActiveFromScreen(pos.x);
    }
    pointer = { id: e.pointerId == null ? 1 : e.pointerId, mode: mode, x: pos.x, y: pos.y };
    try {
      if (canvas.setPointerCapture) canvas.setPointerCapture(pointer.id);
    } catch (err) { }
  }

  function onPointerMove(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!pointer) {
      var hover = pointerPosition(e);
      if (canvas) {
        canvas.style.cursor = (inRect(hover, HINT_RECT) || inRect(hover, SHAKE_RECT) || inBox(hover)) ? 'pointer' : 'default';
      }
      return;
    }
    if ((e.pointerId == null ? 1 : e.pointerId) !== pointer.id) return;
    var pos = pointerPosition(e);
    pointer.x = pos.x;
    pointer.y = pos.y;
    if (pointer.mode === 'drop') setActiveFromScreen(pos.x);
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
    if (!game || game.phase !== 'run' || game.paused) return;
    if (p.mode === 'hint') useHint();
    else if (p.mode === 'shake') useShake();
    else if (p.mode === 'drop') dropActive();
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
        useHint();
      }
      return;
    }
    if (k === 'x' || k === 'X') {
      if (game && game.phase === 'run' && !game.paused) {
        if (e.preventDefault) e.preventDefault();
        useShake();
      }
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (game && game.phase === 'run' && !game.paused) {
        if (e.preventDefault) e.preventDefault();
        E.moveActive(game, k === 'ArrowLeft' ? -0.03 : 0.03);
      }
      return;
    }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || code === 'Space') {
      if (e.preventDefault) e.preventDefault();
      if (!game || game.phase === 'over' || game.phase === 'clear') {
        if (!e.repeat) beginRun();
      } else if (game.paused) {
        resumeGame();
      } else if (game.phase === 'run' && !e.repeat) {
        dropActive();
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
    if (game.paused || game.phase !== 'run' || !game.activeCode) return;
    if (autoState.wait > 0) {
      autoState.wait--;
      return;
    }
    var target = E.targetForActive(game);
    if (target) E.setActiveX(game, target.x);
    E.dropActive(game);
    processEvents();
    syncUI();
    autoState.wait = 30;
  }

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
    els.overKicker = $('over-kicker');
    els.overTitle = $('over-title');
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
            score: 0,
            total: E.total,
            queueLength: E.total,
            largest: 0,
            best: best
          };
        }
        var state = E.getState(game);
        state.best = { score: best.score, time: best.time };
        return state;
      },
      getScreenPoint: function (wx, wy) {
        var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
        return {
          x: rect.left + (BOX.x + wx * SCALE) / C.VIEW_W * (rect.width || 480),
          y: rect.top + (BOX.y + wy * SCALE) / C.VIEW_H * (rect.height || 800)
        };
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
