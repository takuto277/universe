(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.SchoolChairDriftEngine;
  if (!E) return;
  var Audio = root.SoccerAudio;

  var C = E.C;
  var HORIZON = 220;
  var FLOOR_K = 56000;
  var X_FOCAL = 330;
  var VIEW_DEPTH = 2400;
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
  var keySteer = 0;
  var effects = null;
  var skid = [];
  var tutorial = 0;

  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function wrapS(s, length) { while (s < 0) s += length; while (s >= length) s -= length; return s; }
  function stageData() { return E.STAGES[game.stage]; }
  function playerRacer() { return game ? game.racers[0] : null; }

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
      fireworkTimer: 0, resultDelay: 0, countdownPulse: 0
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
    if (els.itemBtn) els.itemBtn.classList.add('hidden');
    if (els.pause) els.pause.classList.add('hidden');
    lastTs = 0;
  }

  function beginStage() {
    mode = 'match';
    if (Audio) Audio.start();
    game = E.createGame({ stage: stageIndex });
    pointer = null;
    keySteer = 0;
    resetEffects();
    setScreen(null);
    if (els.hud) els.hud.classList.remove('hidden');
    if (els.pause) els.pause.classList.remove('hidden');
    if (els.itemBtn) els.itemBtn.classList.add('hidden');
    lastTs = 0;
    syncUI();
  }

  function itemLabel(item) {
    if (item === 'milk') return 'MILK!';
    if (item === 'eraser') return 'ERASER';
    if (item === 'tray') return 'TRAY';
    return 'ITEM';
  }

  function syncUI() {
    if (els.hud) els.hud.classList.toggle('hidden', mode !== 'match');
    if (!game) return;
    var st = E.getState(game);
    if (els.lap) els.lap.textContent = Math.min(st.lap, st.laps) + '/' + st.laps;
    if (els.rank) els.rank.textContent = st.place + '/' + st.racers.length;
    if (els.turn) {
      els.turn.textContent = st.phase === 'countdown' ? 'READY' : st.stageName;
    }
    if (els.shots) {
      if (st.phase === 'countdown') els.shots.textContent = 'START IN ' + Math.max(0, Math.ceil(st.countdown));
      else els.shots.textContent = 'RANK ' + st.place + '/' + st.racers.length + ' · ' + Math.round(st.progress * 100) + '%';
    }

    if (els.itemBtn) {
      var showItem = st.phase === 'playing' && st.player.item;
      els.itemBtn.classList.toggle('hidden', !showItem);
      els.itemBtn.classList.remove('milk', 'eraser', 'tray');
      if (showItem) {
        els.itemBtn.textContent = itemLabel(st.player.item);
        els.itemBtn.classList.add(st.player.item);
        els.itemBtn.disabled = false;
      } else {
        els.itemBtn.textContent = 'ITEM';
      }
    }

    var target = null;
    if (st.phase === 'clear' && !effects.resultDelay) {
      target = st.stage + 1 < st.stageTotal ? 'screen-stage' : 'screen-ending';
    } else if (st.phase === 'over' && !effects.resultDelay) {
      target = 'screen-over';
    } else if (st.paused) {
      target = 'screen-pause';
    }
    setScreen(target);
    if (els.pause) els.pause.classList.toggle('hidden', !((st.phase === 'playing' || st.phase === 'countdown') && !st.paused));
    if (els.itemBtn && st.paused) els.itemBtn.classList.add('hidden');

    if (st.phase === 'clear' && st.stage + 1 < st.stageTotal) {
      if (els.stageClearText) els.stageClearText.textContent = '1位でフィニッシュ！ 次のコースは ' + E.STAGES[st.stage + 1].name;
    }
    if (st.phase === 'over') {
      if (els.overRank) els.overRank.textContent = st.place + '/' + st.racers.length;
      if (els.overLap) els.overLap.textContent = Math.min(st.lap, st.laps) + '/' + st.laps;
      if (els.overStage) els.overStage.textContent = (st.stage + 1) + '/' + st.stageTotal;
      if (els.overSub) els.overSub.textContent = st.reason === 'timeup' ? 'タイムアップ。' : (st.place === 1 ? '同着？' : '1位でないと次のコースへ進めない。');
    }
  }

  function syncAudioButton() {
    if (!els.sound) return;
    var muted = Audio ? Audio.isMuted() : true;
    els.sound.classList.toggle('muted', muted);
    els.sound.setAttribute('aria-label', muted ? 'BGMを再生' : 'BGMを消音');
  }
  function toggleAudio() { if (Audio) { Audio.toggle(); syncAudioButton(); } }

  function pauseGame() {
    if (!game || (game.phase !== 'playing' && game.phase !== 'countdown') || game.paused) return;
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
  function togglePause() { if (!game) return; if (game.paused) resumeGame(); else pauseGame(); }

  function useItem() {
    if (!game || game.phase !== 'playing') return;
    if (E.useItem(game, 'player')) {
      processEvents();
      syncUI();
    }
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
    sky.addColorStop(0.34, '#0b1820');
    sky.addColorStop(0.56, '#071510');
    sky.addColorStop(1, '#020605');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    for (var i = 0; i < 42; i++) {
      var x = mod(i * 97 + 31 - time * (3 + i % 5), C.VIEW_W);
      var y = mod(i * 61 + 17, 200);
      ctx.fillStyle = 'rgba(160, 230, 255, ' + (0.02 + (i % 4) * 0.012) + ')';
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.fillStyle = 'rgba(255, 209, 102, 0.05)';
    ctx.fillRect(0, HORIZON - 2, C.VIEW_W, 2);
  }

  function project(worldS, worldX, depth) {
    if (!game) return null;
    var p = playerRacer();
    var st = stageData();
    var d = depth == null ? wrapS(worldS - p.s, st.length) : depth;
    if (d < 52 || d > VIEW_DEPTH) return null;
    var scale = X_FOCAL / d;
    return {
      x: C.VIEW_W / 2 + (worldX - p.x) * scale,
      y: HORIZON + FLOOR_K / d,
      scale: scale,
      d: d
    };
  }

  function drawFloor() {
    var p = playerRacer();
    var st = stageData();
    var step = 55;
    for (var d = VIEW_DEPTH; d > 54; d -= step) {
      var d2 = Math.max(54, d - step);
      var s1 = wrapS(p.s + d, st.length);
      var s2 = wrapS(p.s + d2, st.length);
      var c1 = E.trackCenter(st, s1);
      var c2 = E.trackCenter(st, s2);
      var p1 = project(s1, c1 - st.halfWidth, d);
      var p2 = project(s1, c1 + st.halfWidth, d);
      var p3 = project(s2, c2 + st.halfWidth, d2);
      var p4 = project(s2, c2 - st.halfWidth, d2);
      if (!p1 || !p2 || !p3 || !p4) continue;
      ctx.fillStyle = (Math.floor((p.s + d) / 120) % 2 === 0) ? '#153629' : '#0e2a20';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fill();
      if (Math.floor((p.s + d) / 120) % 5 === 0) {
        ctx.strokeStyle = 'rgba(196, 255, 225, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p4.x, p4.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();
      }
    }

    // lane edges & side walls
    for (d = VIEW_DEPTH; d > 54; d -= step) {
      var d2w = Math.max(54, d - step);
      s1 = wrapS(p.s + d, st.length);
      s2 = wrapS(p.s + d2w, st.length);
      c1 = E.trackCenter(st, s1);
      c2 = E.trackCenter(st, s2);
      drawWall(c1 - st.halfWidth, c2 - st.halfWidth, s1, s2, d, d2w, '#203d31', '#6fe6b8');
      drawWall(c1 + st.halfWidth, c2 + st.halfWidth, s1, s2, d, d2w, '#203d31', '#6fe6b8');
    }

    drawSchoolDetails();

    // overhead lights
    for (d = 260; d < VIEW_DEPTH; d += 420) {
      s1 = wrapS(p.s + d, st.length);
      c1 = E.trackCenter(st, s1);
      var lp = project(s1, c1, d);
      if (!lp) continue;
      var lw = 36 * lp.scale;
      ctx.save();
      ctx.shadowColor = 'rgba(255, 238, 180, 0.55)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(255, 238, 190, 0.3)';
      ctx.fillRect(lp.x - lw / 2, lp.y - 128 * lp.scale, lw, 5 * lp.scale);
      ctx.restore();
    }
  }

  function drawWall(x1, x2, s1, s2, d1, d2, fill, edge) {
    var p = playerRacer();
    var st = stageData();
    var f1 = project(s1, x1, d1);
    var f2 = project(s2, x2, d2);
    if (!f1 || !f2) return;
    var h1 = 125 * f1.scale;
    var h2 = 125 * f2.scale;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(f1.x, f1.y);
    ctx.lineTo(f2.x, f2.y);
    ctx.lineTo(f2.x, f2.y - h2);
    ctx.lineTo(f1.x, f1.y - h1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(143, 240, 208, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(f1.x, f1.y - h1);
    ctx.lineTo(f2.x, f2.y - h2);
    ctx.stroke();
  }

  function panelQuad(s, x, d, height, fill, edge, inset) {
    var p = playerRacer();
    var st = stageData();
    var s2 = s + 150;
    var d2 = wrapS(s2 - p.s, st.length);
    if (d < 70 || d > 1900 || d2 < 70 || d2 > 1900) return null;
    var p1 = project(s, x, d);
    var p2 = project(s2, x, d2);
    if (!p1 || !p2) return null;
    var top1 = p1.y - height * p1.scale;
    var top2 = p2.y - height * p2.scale;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p2.x, top2);
    ctx.lineTo(p1.x, top1);
    ctx.closePath();
    ctx.fill();
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    return { x1: p1.x, x2: p2.x, y1: p1.y, y2: p2.y, top1: top1, top2: top2 };
  }

  function drawWallText(text, s, x, d, yOffset, size) {
    var p = playerRacer();
    var st = stageData();
    var pr = project(s, x, d);
    if (!pr) return;
    var px = pr.x;
    var py = pr.y - yOffset * pr.scale;
    if (px < -60 || px > C.VIEW_W + 60 || py < 0 || py > C.VIEW_H) return;
    ctx.save();
    ctx.fillStyle = 'rgba(237, 255, 244, 0.82)';
    ctx.font = '900 ' + Math.max(6, size * pr.scale) + 'px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px, py);
    ctx.restore();
  }

  function drawSchoolDetails() {
    var p = playerRacer();
    var st = stageData();
    var base = Math.floor((p.s - 200) / 260) * 260;
    for (var s = base; s < p.s + 1900; s += 260) {
      var d = wrapS(s - p.s, st.length);
      if (d < 90 || d > 1900) continue;
      var center = E.trackCenter(st, s);
      var leftX = center - st.halfWidth;
      var rightX = center + st.halfWidth;
      var index = Math.floor(s / 260);
      var side = index % 4;
      // opposite walls get doors/windows; near the start, shoe lockers.
      if (s >= -260 && s < 320) {
        panelQuad(s + 20, leftX, wrapS(s + 20 - p.s, st.length), 96, 'rgba(57, 100, 132, 0.75)', 'rgba(182, 233, 255, 0.45)');
        panelQuad(s + 20, rightX, wrapS(s + 20 - p.s, st.length), 96, 'rgba(57, 100, 132, 0.75)', 'rgba(182, 233, 255, 0.45)');
        drawWallText('下駄箱', s + 70, leftX, wrapS(s + 70 - p.s, st.length), 58, 10);
        drawWallText('昇降口', s + 70, rightX, wrapS(s + 70 - p.s, st.length), 58, 10);
      } else if (side === 0 || side === 3) {
        panelQuad(s, leftX, d, 90, 'rgba(26, 62, 48, 0.8)', 'rgba(143, 240, 208, 0.35)');
        drawWallText(index % 3 === 0 ? '教室' : '特別教室', s + 10, leftX, wrapS(s + 10 - p.s, st.length), 52, 9);
      } else if (side === 1) {
        // classroom door
        panelQuad(s, leftX, d, 86, 'rgba(101, 69, 40, 0.9)', 'rgba(255, 209, 102, 0.5)');
        panelQuad(s + 8, leftX, wrapS(s + 8 - p.s, st.length), 70, 'rgba(171, 121, 69, 0.55)', 'rgba(255, 226, 150, 0.35)');
        drawWallText('1-A', s + 14, leftX, wrapS(s + 14 - p.s, st.length), 62, 8);
      } else {
        // windows along the right wall
        panelQuad(s, rightX, d, 74, 'rgba(97, 181, 196, 0.26)', 'rgba(180, 247, 255, 0.55)');
        for (var w = 1; w < 4; w++) {
          var ws = s + w * 34;
          var wd = wrapS(ws - p.s, st.length);
          var wp = project(ws, rightX, wd);
          if (wp) {
            ctx.strokeStyle = 'rgba(207, 252, 255, 0.33)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(wp.x, wp.y - 70 * wp.scale);
            ctx.lineTo(wp.x, wp.y - 10 * wp.scale);
            ctx.stroke();
          }
        }
      }
      if (index % 2 === 1) {
        panelQuad(s, rightX, d, 68, 'rgba(38, 81, 67, 0.64)', 'rgba(160, 245, 214, 0.28)');
      }
    }
    // stairs signs at fixed sections of each floor
    var stairS = st.id === 'corridor' ? 1500 : (st.id === 'special' ? 2300 : 3300);
    var stairD = wrapS(stairS - p.s, st.length);
    if (stairD < 1600) {
      var sc = E.trackCenter(st, stairS);
      drawWallText('階段', stairS, sc - st.halfWidth, stairD, 62, 10);
      drawWallText('↑', stairS + 18, sc - st.halfWidth, wrapS(stairS + 18 - p.s, st.length), 48, 12);
    }
  }

  function drawFinish() {
    var p = playerRacer();
    var st = stageData();
    var d = wrapS(-p.s, st.length);
    if (d < 55 || d > VIEW_DEPTH) return;
    var center = E.trackCenter(st, 0);
    var left = project(0, center - st.halfWidth, d);
    var right = project(0, center + st.halfWidth, d);
    if (!left || !right) return;
    var top = Math.min(left.y, right.y) - 95 * left.scale;
    var cols = 10;
    for (var row = 0; row < 2; row++) {
      for (var col = 0; col < cols; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? 'rgba(245, 255, 250, 0.9)' : 'rgba(15, 30, 24, 0.9)';
        var x1 = left.x + (right.x - left.x) * col / cols;
        var x2 = left.x + (right.x - left.x) * (col + 1) / cols;
        var y1 = left.y - 28 * left.scale + row * 14 * left.scale;
        ctx.fillRect(x1, y1, x2 - x1, 14 * left.scale);
      }
    }
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(left.x, left.y - 32 * left.scale, right.x - left.x, 30 * left.scale);
    ctx.fillStyle = '#ffe6a3';
    ctx.font = '900 ' + Math.max(6, 10 * left.scale) + 'px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', (left.x + right.x) / 2, top);
  }

  function drawObstacle(o) {
    var p = playerRacer();
    var st = stageData();
    var d = wrapS(o.s - p.s, st.length);
    if (d < 60 || d > VIEW_DEPTH) return;
    var pr = project(o.s, o.x, d);
    if (!pr) return;
    var scale = pr.scale;
    var w = o.w * scale * 0.9;
    var h = Math.max(8, o.h * scale * (o.kind === 'locker' ? 1.3 : 0.9));
    var x = pr.x;
    var y = pr.y;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, w * 0.52, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    var fill = o.kind === 'locker' ? '#315a72' : (o.kind === 'bucket' ? '#507f7b' : (o.kind === 'cart' ? '#8a663f' : (o.kind === 'plant' ? '#2b5a3b' : '#5e4734')));
    var edge = o.kind === 'locker' ? '#9fe3ff' : '#ffd166';
    ctx.fillStyle = fill;
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1, 2 * scale);
    if (o.kind === 'bucket') {
      ctx.beginPath();
      ctx.ellipse(x, y - h * 0.35, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (o.kind === 'plant') {
      ctx.beginPath();
      ctx.arc(x, y - h * 0.4, w * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x - w / 2, y - h);
      ctx.lineTo(x + w / 2, y - h);
      ctx.lineTo(x + w / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(x - w * 0.36, y - h * 0.84, w * 0.72, Math.max(2, h * 0.12));
    }
    ctx.restore();
  }

  function drawItemBox(b) {
    if (b.cooldown > 0) return;
    var p = playerRacer();
    var st = stageData();
    var d = wrapS(b.s - p.s, st.length);
    if (d < 55 || d > VIEW_DEPTH) return;
    var pr = project(b.s, b.x, d);
    if (!pr) return;
    var size = 24 * pr.scale;
    var bob = Math.sin((b.s + performance.now() * 0.002)) * 3 * pr.scale;
    ctx.save();
    ctx.translate(pr.x, pr.y - size * 0.65 + bob);
    ctx.rotate(Math.sin(b.s) * 0.12);
    ctx.shadowColor = '#7df5c7';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(40, 120, 95, 0.8)';
    ctx.strokeStyle = '#baffdf';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.fillStyle = '#ffe6a3';
    ctx.font = '900 ' + Math.max(6, size * 0.5) + 'px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 1);
    ctx.restore();
  }

  function drawTrap(t) {
    var p = playerRacer();
    var st = stageData();
    var d = wrapS(t.s - p.s, st.length);
    if (d < 55 || d > VIEW_DEPTH) return;
    var pr = project(t.s, t.x, d);
    if (!pr) return;
    var size = 15 * pr.scale;
    ctx.save();
    ctx.translate(pr.x, pr.y - size * 0.4);
    ctx.rotate(0.35);
    ctx.fillStyle = 'rgba(255, 143, 189, 0.9)';
    ctx.strokeStyle = '#ffd1e2';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-size / 2, -size / 3, size, size * 0.66);
    ctx.strokeRect(-size / 2, -size / 3, size, size * 0.66);
    ctx.restore();
  }

  function drawRacerChair(r, pr, color) {
    var size = 22 * pr.scale;
    if (size < 4) size = 4;
    var x = pr.x;
    var y = pr.y;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.8, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(x, y - size * 0.1);
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(20, 55, 42, 0.95)';
    ctx.lineWidth = Math.max(1, 1.5 * pr.scale);
    // base
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.2);
      ctx.lineTo(Math.cos(a) * size * 0.65, size * 0.2 + Math.sin(a) * size * 0.3);
      ctx.stroke();
    }
    ctx.fillStyle = r.team === 'cpu' ? '#5e2148' : '#1c5c48';
    roundRect(-size * 0.5, -size * 0.85, size, size * 0.8, size * 0.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -size * 1.05, size * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawOpponents() {
    var p = playerRacer();
    var st = stageData();
    for (var i = 1; i < game.racers.length; i++) {
      var r = game.racers[i];
      if (r.finished) continue;
      var rel = (r.lap - p.lap) * st.length + (r.s - p.s);
      if (rel < 45 || rel > VIEW_DEPTH) continue;
      var pr = project(r.s, r.x, rel);
      if (!pr) continue;
      drawRacerChair(r, pr, '#ff8fbd');
    }
  }

  function drawPlayerChair() {
    var p = playerRacer();
    var x = C.VIEW_W / 2 + clamp(p.vx * 0.04, -8, 8);
    var y = 690;
    var color = 'rgba(143, 240, 208, 0.9)';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(clamp(p.steer * 0.08 + p.vx * 0.00012, -0.16, 0.16));
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 24, 32, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // caster base
    ctx.strokeStyle = 'rgba(180, 255, 232, 0.8)';
    ctx.fillStyle = 'rgba(10, 25, 19, 0.95)';
    ctx.lineWidth = 2;
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      var wx = Math.cos(a) * 22;
      var wy = 18 + Math.sin(a) * 9;
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.lineTo(wx, wy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wx, wy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // seat
    ctx.shadowColor = 'rgba(125, 245, 199, 0.7)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#1c5c48';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    roundRect(-22, -14, 44, 35, 9);
    ctx.fill();
    ctx.stroke();
    // back of chair
    ctx.fillStyle = '#123d2f';
    roundRect(-20, -38, 40, 18, 7);
    ctx.fill();
    ctx.stroke();
    // armrests
    ctx.fillStyle = '#173e31';
    roundRect(-27, -14, 7, 24, 4);
    ctx.fill();
    ctx.stroke();
    roundRect(20, -14, 7, 24, 4);
    ctx.fill();
    ctx.stroke();
    // rider back / hair
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#5a351f';
    ctx.beginPath();
    ctx.arc(0, -14, 12, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7df5c7';
    ctx.fillRect(-8, -5, 16, 16);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, -17, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (p.shield > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(94, 231, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#5ee7ff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y - 10, 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (p.drift > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + 14, 30, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHudBar() {
    var p = playerRacer();
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
    roundRect(x, y - 3, barW * clamp(p.drift, 0, 1), 12, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(230, 255, 242, 0.82)';
    ctx.font = '900 7px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('DRIFT', x - 2, y - 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = p.boost > 0 ? '#ffd166' : 'rgba(230, 255, 242, 0.58)';
    ctx.fillText(p.boost > 0 ? 'BOOST!' : Math.round(p.drift * 100) + '%', x + barW + 2, y - 12);
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

  function drawCountdown() {
    if (!game || game.phase !== 'countdown') return;
    var value = game.countdown;
    var text = value > 2.2 ? '3' : (value > 1.2 ? '2' : '1');
    var alpha = clamp((value % 1) * 1.8, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0.35, alpha);
    ctx.fillStyle = '#ffe6a3';
    ctx.shadowColor = 'rgba(255, 209, 102, 0.8)';
    ctx.shadowBlur = 24;
    ctx.font = '900 80px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, C.VIEW_W / 2, 360);
    ctx.restore();
  }

  function draw(time) {
    if (!ctx) return;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, C.VIEW_W, C.VIEW_H);
    ctx.save();
    if (effects.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * effects.shake, (Math.random() - 0.5) * 14 * effects.shake);
    drawBackdrop(time);
    if (game) {
      drawFloor();
      drawFinish();
      for (var i = 0; i < game.obstacles.length; i++) drawObstacle(game.obstacles[i]);
      for (i = 0; i < game.itemBoxes.length; i++) drawItemBox(game.itemBoxes[i]);
      for (i = 0; i < game.traps.length; i++) drawTrap(game.traps[i]);
      drawOpponents();
      drawPlayerChair();
      drawHudBar();
      drawCountdown();
      var hint = 'ドラッグで曲がる / 離すと直進';
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

  function screenPoint(s, x) {
    var pr = project(s, x);
    return pr || { x: C.VIEW_W / 2, y: 600 };
  }

  function processEvents() {
    if (!game) return;
    var events = E.consumeEvents(game);
    var p = playerRacer();
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var pt;
      if (ev.type === 'itemBox') {
        if (ev.id === 'player') {
          var box = screenPoint(p.s + 80, p.x);
          burst(box.x, box.y, 18, ['#7df5c7', '#ffffff', '#5ee7ff'], 220, 0.7);
          showBanner('GET ' + itemLabel(ev.item), 'アイテムボタンで使用', '#7df5c7');
        }
      } else if (ev.type === 'itemUse') {
        if (ev.id === 'player') {
          if (ev.item === 'milk') showBanner('MILK BOOST!', '加速', '#7df5c7');
          else if (ev.item === 'eraser') showBanner('ERASER!', '後方に落とした', '#ff8fbd');
          else showBanner('TRAY SHIELD!', '一度だけガード', '#5ee7ff');
        }
      } else if (ev.type === 'trapHit') {
        if (ev.id === 'player') {
          effects.shake = 1.0;
          effects.flash = 0.5;
          effects.flashColor = '255, 143, 189';
          showBanner('SPIN OUT!', '消しゴムに乗った', '#ff8fbd');
          burst(C.VIEW_W / 2, 610, 24, ['#ff8fbd', '#ffffff', '#ffd166'], 260, 0.7);
        }
      } else if (ev.type === 'shieldBlock') {
        if (ev.id === 'player') {
          showBanner('BLOCK!', '給食トレイが守った', '#5ee7ff');
          burst(C.VIEW_W / 2, 610, 20, ['#5ee7ff', '#ffffff', '#7df5c7'], 220, 0.6);
        }
      } else if (ev.type === 'boost') {
        if (ev.id === 'player') {
          showBanner('MINI TURBO!', 'ドリフトブースト', '#ffd166');
          burst(C.VIEW_W / 2, 650, 28, ['#ffd166', '#ffffff', '#7df5c7'], 300, 0.7);
          shockwave(C.VIEW_W / 2, 650, '#ffd166', 90, 0.6, 3);
        }
      } else if (ev.type === 'crash') {
        if (ev.id === 'player') {
          effects.shake = 0.7;
          showBanner('CRASH', '障害物にぶつかった', '#ff8fbd');
          burst(C.VIEW_W / 2, 640, 16, ['#ffd166', '#ffffff', '#ff8fbd'], 180, 0.5);
        }
      } else if (ev.type === 'lap') {
        if (ev.id === 'player') showBanner('LAP ' + ev.lap, 'あと' + Math.max(0, game.laps - ev.lap) + '周', '#ffd166');
      } else if (ev.type === 'finish') {
        if (ev.id === 'player') {
          effects.flash = 1.0;
          effects.flashColor = '190, 255, 222';
          effects.shake = 1.2;
          effects.fireworks = 2.4;
          effects.fireworkTimer = 0;
          effects.resultDelay = 1.4;
          confettiBurst(C.VIEW_W / 2, 320, 140, ['#7df5c7', '#ffd166', '#ffffff', '#5ee7ff', '#ff8fbd'], 420, 1.8);
          shockwave(C.VIEW_W / 2, 320, '#7df5c7', 260, 0.9, 6);
          if (ev.order === 1) showBanner('1ST PLACE!', 'コースクリア', '#7df5c7');
          else showBanner('FINISH', ev.order + '位', '#ffd166');
        }
      } else if (ev.type === 'raceover') {
        effects.resultDelay = 1.4;
      } else if (ev.type === 'timeup') {
        effects.flash = 0.7;
        effects.resultDelay = 1.2;
        showBanner('TIME UP', 'レースを終了', '#ff8fbd');
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
      if (game && (game.phase === 'playing' || game.phase === 'countdown')) {
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
    if (k === 'i' || k === 'I') { useItem(); return; }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || code === 'Space') {
      if (e.preventDefault) e.preventDefault();
      if (mode === 'title') { stageIndex = 0; beginStage(); return; }
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
      if (game.phase === 'playing') {
        var p = playerRacer();
        if (p.drift > 0) {
          skid.push({ x: C.VIEW_W / 2 - 18, y: 710, life: 0.55, max: 0.55 });
          skid.push({ x: C.VIEW_W / 2 + 18, y: 710, life: 0.55, max: 0.55 });
          if (skid.length > 90) skid.splice(0, skid.length - 90);
        }
      }
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
    var p = playerRacer();
    var st = stageData();
    var target = E.trackCenter(st, wrapS(p.s + 120, st.length));
    E.setSteer(game, clamp((target - p.x) / 85, -1, 1));
    if (p.item && Math.random() < 0.02) E.useItem(game, 'player');
  }

  function init() {
    canvas = $('game');
    els.hud = $('hud');
    els.lap = $('lap');
    els.turn = $('turn');
    els.shots = $('shots');
    els.rank = $('rank');
    els.itemBtn = $('btn-item');
    els.sound = $('btn-sound');
    els.pause = $('btn-pause');
    els.screenTitle = $('screen-title');
    els.screenOver = $('screen-over');
    els.screenStage = $('screen-stage');
    els.screenEnding = $('screen-ending');
    els.screenPause = $('screen-pause');
    els.overSub = $('over-sub');
    els.overRank = $('over-rank');
    els.overLap = $('over-lap');
    els.overStage = $('over-stage');
    els.stageClearText = $('stage-clear-text');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }
    resetEffects();
    resizeCanvas();
    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');
    if (els.itemBtn) els.itemBtn.classList.add('hidden');

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
    if (els.itemBtn) els.itemBtn.addEventListener('click', useItem);
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
      title: '放課後チェア・グランプリ',
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
