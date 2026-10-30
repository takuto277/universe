/* game.js : 0.1秒ドアマン（描画・入力・画面遷移） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.DoormanEngine) ? window.DoormanEngine : null;
  if (!E) return;

  var canvas = null;
  var ctx = null;
  var state = null;
  var viewW = 480;
  var viewH = 800;
  var dpr = 1;
  var lastTs = 0;
  var endShown = false;
  var shake = 0;
  var flash = 0;
  var slam = null;
  var particles = [];
  var els = {};

  function $(id) { return document.getElementById(id); }
  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

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

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function doorRect() {
    return { x: viewW * 0.18, y: viewH * 0.09, w: viewW * 0.62, h: viewH * 0.83 };
  }

  function setControls(live) {
    if (els.controls) els.controls.classList.toggle('live', !!live);
  }

  function updateHud() {
    if (!state) return;
    if (els.time) els.time.textContent = state.remaining.toFixed(1);
    if (els.score) els.score.textContent = String(state.score);
    if (els.combo) els.combo.textContent = String(state.combo);
  }

  function showScreen(el, visible) {
    if (el) el.classList.toggle('visible', !!visible);
  }

  function showStart() {
    showScreen(els.start, true);
    showScreen(els.end, false);
    setControls(false);
    endShown = false;
  }

  function beginRun() {
    if (!state) return;
    E.start(state);
    showScreen(els.start, false);
    showScreen(els.end, false);
    setControls(true);
    endShown = false;
    slam = null;
    particles = [];
    shake = 0;
    flash = 0;
    updateHud();
  }

  function showEnd() {
    if (endShown || !state || !state.result) return;
    endShown = true;
    var r = state.result;
    if (els.endRank) els.endRank.textContent = E.rank(r.score);
    if (els.endDetail) els.endDetail.textContent = '30秒で' + r.served + '人を仕分け、' + r.missed + '回ミスした。';
    if (els.endScore) els.endScore.textContent = String(r.score);
    if (els.endServed) els.endServed.textContent = String(r.served);
    if (els.endMissed) els.endMissed.textContent = String(r.missed);
    if (els.endCombo) els.endCombo.textContent = String(r.maxCombo);
    if (els.endPerfect) els.endPerfect.textContent = String(r.perfect);
    setControls(false);
    showScreen(els.end, true);
  }

  function passengerPos(p) {
    var progress = p.progress;
    if (p.resolved) {
      if (p.outcome === 'entered' || p.outcome === 'intruded') {
        progress = Math.min(1.05, progress + p.outTimer * 0.55);
      } else {
        progress = Math.max(0, progress - p.outTimer * 0.24);
      }
    }
    var y = viewH * (0.26 + 0.56 * progress);
    var spread = 0.08 + 0.30 * Math.min(1, progress);
    var x = viewW / 2 + p.lane * viewW * spread;
    var scale = 0.34 + 0.86 * Math.min(1, progress);
    return { x: x, y: y, scale: scale, progress: progress };
  }

  function burst(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 40 + Math.random() * 150;
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0.35 + Math.random() * 0.35,
        max: 0.7,
        size: 2 + Math.random() * 4,
        color: color
      });
    }
  }

  function processEvents() {
    if (!state) return;
    var events = E.consumeEvents(state);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'close') {
        slam = { text: 'バシッ', life: 0.34, max: 0.34, color: '#ffd166' };
        shake = 1;
        flash = 0.18;
      } else if (ev.type === 'open') {
        slam = { text: 'シュッ', life: 0.24, max: 0.24, color: '#8ed2ff' };
        shake = 0.45;
      } else if (ev.type === 'entered' || ev.type === 'blocked') {
        var p = ev.passenger;
        var pos = passengerPos(p);
        burst(pos.x, pos.y - viewH * 0.1, ev.type === 'blocked' ? '#ffd166' : '#58e6b0', 10);
      } else if (ev.type === 'intruded' || ev.type === 'missed') {
        var bad = passengerPos(ev.passenger);
        burst(bad.x, bad.y - viewH * 0.1, '#ff5c72', 14);
        shake = 0.8;
        flash = 0.22;
      } else if (ev.type === 'finish') {
        showEnd();
      }
    }
  }

  function updateEffects(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 5);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.8);
    if (slam) {
      slam.life -= dt;
      if (slam.life <= 0) slam = null;
    }
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 280 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawSideWall(x0, x1, top, bottom, left) {
    var w = x1 - x0;
    var cream = ctx.createLinearGradient(x0, top, x1, bottom);
    cream.addColorStop(0, left ? '#d8c4a6' : '#b9a184');
    cream.addColorStop(0.55, '#ead9bd');
    cream.addColorStop(1, left ? '#9f876c' : '#d6c1a2');
    ctx.fillStyle = cream;
    ctx.fillRect(x0, top, w, bottom - top);

    ctx.fillStyle = 'rgba(90,55,27,.22)';
    ctx.fillRect(x0, top, w, 7);
    ctx.fillRect(x0, bottom - 12, w, 12);
    ctx.fillStyle = '#4b2d18';
    ctx.fillRect(x0, top, left ? 7 : 0, bottom - top);
    ctx.fillRect(x1 - (left ? 0 : 7), top, left ? 0 : 7, bottom - top);

    // wood panel frames
    ctx.strokeStyle = 'rgba(94,54,24,.72)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 + w * 0.16, top + (bottom - top) * 0.16, w * 0.68, (bottom - top) * 0.58);
    ctx.strokeStyle = 'rgba(255,239,200,.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + w * 0.16 + 4, top + (bottom - top) * 0.16 + 4, w * 0.68 - 8, (bottom - top) * 0.58 - 8);

    // handrail
    var railY = top + (bottom - top) * 0.70;
    ctx.fillStyle = '#a8792c';
    ctx.fillRect(x0 + 2, railY, w - 4, 5);
    ctx.fillStyle = 'rgba(255,220,130,.55)';
    ctx.fillRect(x0 + 4, railY + 1, w - 8, 1);
  }

  function drawElevatorShell(time) {
    var d = doorRect();
    var bg = ctx.createLinearGradient(0, 0, 0, viewH);
    bg.addColorStop(0, '#1b110b');
    bg.addColorStop(0.42, '#352116');
    bg.addColorStop(1, '#0d0906');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, viewH);

    // ceiling cove
    ctx.fillStyle = '#3b2415';
    ctx.fillRect(0, 0, viewW, d.y);
    var cove = ctx.createLinearGradient(0, 0, 0, d.y);
    cove.addColorStop(0, 'rgba(255,225,160,.36)');
    cove.addColorStop(1, 'rgba(255,225,160,0)');
    ctx.fillStyle = cove;
    ctx.fillRect(0, 0, viewW, d.y);
    ctx.fillStyle = 'rgba(255,231,175,.9)';
    ctx.fillRect(viewW * 0.30, d.y * 0.30, viewW * 0.40, 3);
    ctx.fillStyle = 'rgba(255,231,175,.24)';
    ctx.fillRect(viewW * 0.22, d.y * 0.30 - 6, viewW * 0.56, 14);

    drawSideWall(0, d.x, d.y, d.y + d.h, true);
    drawSideWall(d.x + d.w, viewW, d.y, d.y + d.h, false);

    // floor
    var floorY = d.y + d.h;
    var floor = ctx.createLinearGradient(0, floorY, 0, viewH);
    floor.addColorStop(0, '#4b3421');
    floor.addColorStop(0.45, '#2a1b10');
    floor.addColorStop(1, '#120c08');
    ctx.fillStyle = floor;
    ctx.fillRect(0, floorY, viewW, viewH - floorY);
    ctx.strokeStyle = 'rgba(255,220,150,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, floorY + 1); ctx.lineTo(viewW, floorY + 1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,150,.10)';
    ctx.lineWidth = 1;
    for (var i = 0; i < 4; i++) {
      var y = floorY + 12 + i * 12;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(viewW, y); ctx.stroke();
    }

    // control panel plate (buttons are HTML on top)
    var px = viewW * 0.835;
    var py = viewH * 0.33;
    var pw = viewW * 0.13;
    var ph = viewH * 0.34;
    var plate = ctx.createLinearGradient(px, py, px + pw, py + ph);
    plate.addColorStop(0, '#d3a74a');
    plate.addColorStop(0.5, '#8b6325');
    plate.addColorStop(1, '#4b2e0f');
    ctx.fillStyle = plate;
    roundRect(px, py, pw, ph, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,170,.75)';
    ctx.lineWidth = 1;
    roundRect(px + 3, py + 3, pw - 6, ph - 6, 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,235,170,.7)';
    for (var s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.arc(px + 6 + (s % 2) * (pw - 12), py + 7 + Math.floor(s / 2) * (ph - 14), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCorridor(time) {
    var d = doorRect();
    var cx = viewW / 2;
    var horizon = d.y + d.h * 0.18;
    var bg = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
    bg.addColorStop(0, '#2b2118');
    bg.addColorStop(0.5, '#1b1713');
    bg.addColorStop(1, '#0b0907');
    ctx.fillStyle = bg;
    ctx.fillRect(d.x, d.y, d.w, d.h);

    // corridor ceiling glow
    var glow = ctx.createRadialGradient(cx, horizon * 0.9, 4, cx, horizon * 0.9, d.w * 0.7);
    glow.addColorStop(0, 'rgba(255,220,155,.24)');
    glow.addColorStop(1, 'rgba(255,220,155,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(d.x, d.y, d.w, d.h);

    // walls / floor
    ctx.fillStyle = '#201811';
    ctx.beginPath();
    ctx.moveTo(d.x, d.y); ctx.lineTo(cx - d.w * 0.16, horizon);
    ctx.lineTo(cx - d.w * 0.16, d.y + d.h); ctx.lineTo(d.x, d.y + d.h); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(d.x + d.w, d.y); ctx.lineTo(cx + d.w * 0.16, horizon);
    ctx.lineTo(cx + d.w * 0.16, d.y + d.h); ctx.lineTo(d.x + d.w, d.y + d.h); ctx.closePath(); ctx.fill();

    var floor = ctx.createLinearGradient(0, horizon, 0, d.y + d.h);
    floor.addColorStop(0, '#3c2d1e');
    floor.addColorStop(1, '#120d08');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.moveTo(cx - d.w * 0.16, horizon);
    ctx.lineTo(cx + d.w * 0.16, horizon);
    ctx.lineTo(d.x + d.w, d.y + d.h);
    ctx.lineTo(d.x, d.y + d.h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,225,170,.12)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 6; i++) {
      var fx = d.x + d.w * i / 6;
      ctx.beginPath(); ctx.moveTo(cx, horizon); ctx.lineTo(fx, d.y + d.h); ctx.stroke();
    }
    for (var j = 1; j < 5; j++) {
      var fy = horizon + Math.pow(j / 5, 1.7) * (d.y + d.h - horizon);
      ctx.beginPath(); ctx.moveTo(d.x, fy); ctx.lineTo(d.x + d.w, fy); ctx.stroke();
    }

    // corridor lights
    for (var l = 0; l < 3; l++) {
      var ly = horizon * (0.55 + l * 0.22);
      var lw = 8 + l * 16;
      ctx.fillStyle = 'rgba(255,226,165,.55)';
      roundRect(cx - lw / 2, ly, lw, 2 + l, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,226,165,.10)';
      ctx.beginPath(); ctx.arc(cx, ly, lw * 1.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawDress(time, p) {
    var bob = Math.sin(time * 12 + p.id) * 0.015;
    var leg = Math.sin(time * 14 + p.id) * 0.09;
    ctx.save();
    ctx.translate(0, bob);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath();
    ctx.ellipse(0, 0.02, 0.30, 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.strokeStyle = '#d9a08f';
    ctx.lineWidth = 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.07, -0.23); ctx.lineTo(-0.10 - leg, -0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.07, -0.23); ctx.lineTo(0.10 + leg, -0.02); ctx.stroke();
    ctx.fillStyle = '#e66a9e';
    ctx.beginPath(); ctx.ellipse(-0.10 - leg, -0.015, 0.075, 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.10 + leg, -0.015, 0.075, 0.035, 0, 0, Math.PI * 2); ctx.fill();

    // dress
    var dress = ctx.createLinearGradient(0, -0.62, 0, -0.15);
    dress.addColorStop(0, '#ff9fd5');
    dress.addColorStop(1, '#d9368e');
    ctx.fillStyle = dress;
    ctx.beginPath();
    ctx.moveTo(-0.16, -0.60);
    ctx.lineTo(0.16, -0.60);
    ctx.lineTo(0.30, -0.18);
    ctx.quadraticCurveTo(0, -0.10, -0.30, -0.18);
    ctx.closePath();
    ctx.fill();

    // arms
    ctx.strokeStyle = '#d9a08f';
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(-0.15, -0.53); ctx.lineTo(-0.27, -0.34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.15, -0.53); ctx.lineTo(0.27, -0.34); ctx.stroke();

    // handbag
    ctx.fillStyle = '#ffd166';
    roundRect(-0.36, -0.38, 0.13, 0.12, 0.03);
    ctx.fill();
    ctx.strokeStyle = '#b88620';
    ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.arc(-0.295, -0.38, 0.05, Math.PI, Math.PI * 2); ctx.stroke();

    // head / hair
    ctx.fillStyle = '#5b2b33';
    ctx.beginPath(); ctx.arc(0, -0.78, 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f3c3ad';
    ctx.beginPath(); ctx.arc(0, -0.77, 0.125, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b2b33';
    ctx.beginPath(); ctx.arc(0, -0.84, 0.13, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-0.13, -0.84, 0.05, 0.25);
    ctx.fillRect(0.08, -0.84, 0.05, 0.25);

    // face
    ctx.fillStyle = '#3a1d29';
    ctx.beginPath(); ctx.arc(-0.04, -0.76, 0.014, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.04, -0.76, 0.014, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a44865';
    ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.arc(0, -0.73, 0.04, 0.1, Math.PI - 0.1); ctx.stroke();

    // badge
    drawBadge(p, -1.02, '#ff7bc8', 'OK');
    ctx.restore();
  }

  function drawSuit(time, p) {
    var bob = Math.sin(time * 11 + p.id) * 0.012;
    var leg = Math.sin(time * 13 + p.id) * 0.08;
    ctx.save();
    ctx.translate(0, bob);

    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(0, 0.02, 0.31, 0.06, 0, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = '#29334a';
    ctx.lineWidth = 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.08, -0.24); ctx.lineTo(-0.11 - leg, -0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.08, -0.24); ctx.lineTo(0.11 + leg, -0.02); ctx.stroke();
    ctx.fillStyle = '#101522';
    ctx.beginPath(); ctx.ellipse(-0.11 - leg, -0.012, 0.075, 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.11 + leg, -0.012, 0.075, 0.035, 0, 0, Math.PI * 2); ctx.fill();

    // jacket
    var suit = ctx.createLinearGradient(0, -0.62, 0, -0.15);
    suit.addColorStop(0, '#3f4d70');
    suit.addColorStop(1, '#1b243b');
    ctx.fillStyle = suit;
    roundRect(-0.24, -0.62, 0.48, 0.46, 0.08);
    ctx.fill();

    // shirt + tie
    ctx.fillStyle = '#dce7ff';
    ctx.beginPath();
    ctx.moveTo(-0.09, -0.60); ctx.lineTo(0.09, -0.60); ctx.lineTo(0.06, -0.35); ctx.lineTo(-0.06, -0.35); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff5c72';
    ctx.beginPath();
    ctx.moveTo(0, -0.56); ctx.lineTo(0.055, -0.48); ctx.lineTo(0, -0.31); ctx.lineTo(-0.055, -0.48); ctx.closePath();
    ctx.fill();

    // arms
    ctx.strokeStyle = '#2b3857';
    ctx.lineWidth = 0.065;
    ctx.beginPath(); ctx.moveTo(-0.22, -0.54); ctx.lineTo(-0.33, -0.33); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.22, -0.54); ctx.lineTo(0.33, -0.33); ctx.stroke();

    // briefcase
    ctx.fillStyle = '#b88620';
    roundRect(0.27, -0.34, 0.19, 0.14, 0.025);
    ctx.fill();
    ctx.strokeStyle = '#6c4c0e';
    ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.arc(0.365, -0.34, 0.05, Math.PI, Math.PI * 2); ctx.stroke();

    // head / hair
    ctx.fillStyle = '#2c201c';
    ctx.beginPath(); ctx.arc(0, -0.78, 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d7a17f';
    ctx.beginPath(); ctx.arc(0, -0.77, 0.125, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c201c';
    ctx.beginPath(); ctx.arc(0, -0.85, 0.125, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-0.12, -0.84, 0.04, 0.10);

    // glasses
    ctx.strokeStyle = '#0e1320';
    ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.arc(-0.045, -0.77, 0.04, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.045, -0.77, 0.04, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.005, -0.77); ctx.lineTo(0.005, -0.77); ctx.stroke();

    // mustache / mouth
    ctx.strokeStyle = '#4a2d25';
    ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.arc(0, -0.70, 0.045, 0.1, Math.PI - 0.1); ctx.stroke();

    drawBadge(p, -1.02, '#6d8fd8', 'NG');
    ctx.restore();
  }

  function drawBadge(p, y, color, text) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,18,.78)';
    roundRect(-0.16, y - 0.11, 0.32, 0.14, 0.05);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.014;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '900 0.11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, y - 0.038);
    ctx.restore();
  }

  function drawPassengers(time) {
    if (!state) return;
    var list = state.passengers.slice().sort(function (a, b) {
      return a.progress - b.progress;
    });
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var pos = passengerPos(p);
      var alpha = p.resolved ? clamp(1 - p.outTimer / 0.85, 0, 1) : 1;
      var s = viewH * 0.22 * pos.scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pos.x, pos.y);
      ctx.scale(s, s);
      if (p.tag === 'dress') drawDress(time, p);
      else drawSuit(time, p);
      ctx.restore();
    }
  }

  function drawDoorPanel(x, w, top, h) {
    var metal = ctx.createLinearGradient(x, 0, x + w, 0);
    metal.addColorStop(0, '#4d3213');
    metal.addColorStop(0.18, '#d8ab52');
    metal.addColorStop(0.5, '#8d6326');
    metal.addColorStop(0.82, '#f0ce82');
    metal.addColorStop(1, '#5a3a16');
    ctx.fillStyle = metal;
    ctx.fillRect(x, top, w, h);

    ctx.strokeStyle = 'rgba(255,235,175,.25)';
    ctx.lineWidth = 1;
    for (var i = 1; i < 4; i++) {
      var yy = top + h * i / 4;
      ctx.beginPath(); ctx.moveTo(x + 6, yy); ctx.lineTo(x + w - 6, yy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(15,21,35,.28)';
    ctx.fillRect(x, top, 3, h);
    ctx.fillRect(x + w - 3, top, 3, h);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(x + w * 0.16, top + 8, 2, h - 16);
  }

  function drawDoors() {
    var d = doorRect();
    var open = state ? state.doorOpen : 0;
    var half = d.w / 2;
    var offset = half * open;
    ctx.save();
    roundRect(d.x, d.y, d.w, d.h, 10);
    ctx.clip();

    if (open < 0.98) {
      drawDoorPanel(d.x - offset, half, d.y, d.h);
      drawDoorPanel(d.x + half + offset, half, d.y, d.h);
    }

    // center seam
    if (open < 0.08) {
      ctx.fillStyle = 'rgba(8,12,20,.75)';
      ctx.fillRect(viewW / 2 - 1.5, d.y, 3, d.h);
    }
    ctx.restore();

    // frame
    ctx.strokeStyle = '#d6a94b';
    ctx.lineWidth = 4;
    roundRect(d.x, d.y, d.w, d.h, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,238,175,.45)';
    ctx.lineWidth = 1;
    roundRect(d.x + 5, d.y + 5, d.w - 10, d.h - 10, 7);
    ctx.stroke();

    // header
    ctx.fillStyle = 'rgba(7,10,18,.82)';
    roundRect(viewW / 2 - 45, d.y + 9, 90, 24, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,209,102,.5)';
    ctx.lineWidth = 1;
    roundRect(viewW / 2 - 45, d.y + 9, 90, 24, 7);
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = '900 11px "Hiragino Kaku Gothic ProN", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('0.1  DOOR', viewW / 2, d.y + 21);

    // status light
    ctx.fillStyle = open > 0.5 ? '#58e6b0' : '#ff5c72';
    ctx.beginPath();
    ctx.arc(viewW / 2, d.y + 44, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSlam() {
    if (!slam) return;
    var t = 1 - slam.life / slam.max;
    var alpha = clamp(1 - t * 1.15, 0, 1);
    var scale = 0.7 + Math.min(0.5, t * 1.6);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(viewW / 2, viewH * 0.70);
    ctx.scale(scale, scale);
    ctx.rotate(-0.06);
    ctx.fillStyle = slam.color;
    ctx.strokeStyle = 'rgba(8,10,18,.8)';
    ctx.lineWidth = 5;
    ctx.font = '900 34px "Hiragino Kaku Gothic ProN", "Yu Gothic", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(slam.text, 0, 0);
    ctx.fillText(slam.text, 0, 0);
    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * 12 * shake, (Math.random() - 0.5) * 10 * shake);
    }
    drawElevatorShell(time);
    var d = doorRect();
    ctx.save();
    roundRect(d.x, d.y, d.w, d.h, 8);
    ctx.clip();
    drawCorridor(time);
    drawPassengers(time);
    ctx.restore();
    drawDoors();
    drawSlam();
    drawParticles();
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,235,190,' + (flash * 0.3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    ctx.restore();
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var w = canvas.clientWidth || 480;
    var h = canvas.clientHeight || 800;
    if (w <= 0) w = 480;
    if (h <= 0) h = 800;
    viewW = w;
    viewH = h;
    canvas.width = Math.max(2, Math.round(w * dpr));
    canvas.height = Math.max(2, Math.round(h * dpr));
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);
    if (state && state.phase === 'run') {
      E.update(state, dt);
      processEvents();
      updateHud();
    }
    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function pulse(button) {
    if (!button) return;
    button.classList.add('pressed');
    setTimeout(function () { button.classList.remove('pressed'); }, 100);
  }

  function pressDoor(action, event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!state || state.phase !== 'run') return;
    E.press(state, action);
    pulse(action === 'close' ? els.btnClose : els.btnOpen);
  }

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === ' ' || k === 'Enter') {
      if (e.preventDefault) e.preventDefault();
      if (state && (state.phase === 'idle' || state.phase === 'over')) beginRun();
      return;
    }
    if (!state || state.phase !== 'run') return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'c' || k === 'C') {
      if (e.preventDefault) e.preventDefault();
      pressDoor('close', e);
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'o' || k === 'O') {
      if (e.preventDefault) e.preventDefault();
      pressDoor('open', e);
    }
  }

  function init() {
    canvas = $('arena');
    ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) return;
    els = {
      start: $('screen-start'),
      end: $('screen-end'),
      time: $('time'),
      score: $('score'),
      combo: $('combo'),
      controls: $('controls'),
      btnStart: $('btn-start'),
      btnAgain: $('btn-again'),
      btnClose: $('btn-close'),
      btnOpen: $('btn-open'),
      endRank: $('end-rank'),
      endDetail: $('end-detail'),
      endScore: $('end-score'),
      endServed: $('end-served'),
      endMissed: $('end-missed'),
      endCombo: $('end-combo'),
      endPerfect: $('end-perfect')
    };
    state = E.createGame({ width: viewW, height: viewH });
    if (els.btnStart) els.btnStart.addEventListener('click', beginRun);
    if (els.btnAgain) els.btnAgain.addEventListener('click', beginRun);
    if (els.btnClose) els.btnClose.addEventListener('pointerdown', function (e) { pressDoor('close', e); });
    if (els.btnOpen) els.btnOpen.addEventListener('pointerdown', function (e) { pressDoor('open', e); });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resizeCanvas);
    if (typeof ResizeObserver !== 'undefined' && $('stage')) {
      new ResizeObserver(function () { resizeCanvas(); }).observe($('stage'));
    }
    resizeCanvas();
    showStart();
    updateHud();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'zero-one-doorman',
        title: '0.1秒ドアマン',
        start: function () { beginRun(); },
        autoPlayStep: function () { if (state) E.autoStep(state); },
        isDone: function () { return !!(state && state.phase === 'over'); },
        getState: function () { return state ? E.snapshot(state) : null; }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
