/* renderer.js : Canvas 2D の描画（ゲーム進行・DOM UIを含まない） */
(function (root, factory) {
  'use strict';
  var C = (typeof module !== 'undefined' && module.exports) ? require('./content.js') : root.GraphContent;
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.GraphCrossEngine;
  var api = factory(C, E);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, E) {
  'use strict';

  function create(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) return null;
    var viewW = 960;
    var viewH = 560;
    var dpr = 1;

    function resize(w, h, scale) {
      dpr = scale || 1;
      viewW = w;
      viewH = h;
      var pw = Math.max(2, Math.round(w * dpr));
      var ph = Math.max(2, Math.round(h * dpr));
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
    }

    function drawGrid(state, time) {
      var w = viewW, h = viewH;
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0a1424');
      grad.addColorStop(0.6, '#070d18');
      grad.addColorStop(1, '#05080f');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      var worldX = state ? state.worldX : time * 90;
      var headX = state ? state.headX : w * 0.28;
      var top = state ? state.top : Math.max(44, Math.min(76, h * 0.11));
      var bottom = state ? state.bottom : h - Math.max(44, Math.min(76, h * 0.11)) - 16;

      ctx.lineWidth = 1;
      var spacing = 74;
      var offset = -(worldX % spacing);
      for (var x = offset - spacing; x < w + spacing; x += spacing) {
        var worldAt = worldX + (x - headX);
        var world = Math.round(worldAt);
        var major = Math.round(worldAt / spacing) % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(80, 170, 220, 0.16)' : 'rgba(80, 170, 220, 0.07)';
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom + 18);
        ctx.stroke();
        if (major) {
          ctx.fillStyle = 'rgba(120, 190, 230, 0.42)';
          ctx.font = '10px ui-monospace, Menlo, monospace';
          ctx.fillText('x=' + world, x + 4, h - 10);
        }
      }

      ctx.strokeStyle = 'rgba(80, 170, 220, 0.08)';
      for (var y = top; y <= bottom; y += 44) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(95, 240, 255, 0.20)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, bottom);
      ctx.lineTo(w, bottom);
      ctx.stroke();

      if (!state) {
        ctx.strokeStyle = 'rgba(95, 240, 255, 0.16)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i <= 80; i++) {
          var px = i / 80 * w;
          var py = (top + bottom) / 2 + Math.sin(i * 0.22 + time * 1.4) * 46;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 122, 217, 0.12)';
        ctx.beginPath();
        for (i = 0; i <= 80; i++) {
          px = i / 80 * w;
          py = (top + bottom) / 2 + Math.cos(i * 0.17 - time * 1.1) * 70;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }

    function drawRivals(state, time) {
      if (!state) return;
      for (var i = 0; i < state.rivals.length; i++) {
        var r = state.rivals[i];
        if (r.x > viewW + 40 || r.x + r.len < -40) continue;
        var points = 26;
        ctx.beginPath();
        for (var j = 0; j <= points; j++) {
          var local = r.len * j / points;
          var px = r.x + local;
          var py = E.rivalY(r, local);
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        var family = r.family || 'wave';
        var color = C.FAMILY_COLORS[family] || C.FAMILY_COLORS.wave;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 0.92;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (r.armor) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.lineWidth = 4;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();

        var cx = r.x + r.len / 2;
        var cy = E.rivalY(r, r.len / 2);
        if (r.splitter) {
          ctx.save();
          ctx.strokeStyle = '#d7b8ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx - 7, cy, 3, 0, Math.PI * 2);
          ctx.arc(cx + 7, cy, 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (r.jammer) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 77, 141, 0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 7 + Math.sin(time * 8) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;
        ctx.font = '9.5px ui-monospace, Menlo, monospace';
        var labelY = E.rivalY(r, 0) - 8;
        if (labelY < state.top + 10) labelY = E.rivalY(r, 0) + 16;
        var special = r.armor ? ' / ARMOR' : (r.splitter ? ' / SPLIT' : (r.jammer ? ' / JAM' : ''));
        ctx.fillText(r.label + ' / WEAK:' + (C.FAMILY_LABELS_EN[family] || '—') + special, r.x + 4, labelY);
        ctx.globalAlpha = 1;
      }
    }

    function drawAllies(state, time) {
      if (!state || !state.allies) return;
      for (var i = 0; i < state.allies.length; i++) {
        var ally = state.allies[i];
        var color = C.ITEM_INFO.graph.color;
        var alpha = Math.min(1, ally.life / 1.2);
        ctx.save();
        ctx.globalAlpha = 0.35 + alpha * 0.5;
        ctx.beginPath();
        for (var x = ally.x0; x <= ally.x1; x += 18) {
          var y = E.allyY(ally, x, ally.age || 0);
          if (x === ally.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.font = '900 10px ui-monospace, Menlo, monospace';
        ctx.fillText('ALLY GRAPH', ally.x0 + 10, E.allyY(ally, ally.x0, ally.age || 0) - 10);
        ctx.restore();
      }
    }

    function drawItems(state, time) {
      if (!state || !state.items) return;
      for (var i = 0; i < state.items.length; i++) {
        var item = state.items[i];
        var info = C.ITEM_INFO[item.type] || C.ITEM_INFO.score;
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.globalAlpha = 0.9;
        ctx.shadowColor = info.color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = info.color;
        ctx.beginPath();
        ctx.moveTo(0, -item.r);
        ctx.lineTo(item.r, 0);
        ctx.lineTo(0, item.r);
        ctx.lineTo(-item.r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.rotate(-(time * 1.4 + item.phase));
        ctx.fillStyle = '#0b1220';
        ctx.font = '900 10px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(info.short, 0, 1);
        ctx.restore();
      }
    }

    function drawBoss(state, time) {
      if (!state || !state.boss) return;
      var boss = state.boss;
      if (boss.x > viewW + 80 || boss.x + boss.len < -80) return;
      var color = C.FAMILY_COLORS[boss.family] || C.FAMILY_COLORS.wave;
      var points = 44;
      ctx.beginPath();
      for (var j = 0; j <= points; j++) {
        var local = boss.len * j / points;
        var px = boss.x + local;
        var py = E.rivalY(boss, local);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (boss.flash > 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.min(0.9, boss.flash * 3) + ')';
        ctx.lineWidth = 8;
        ctx.stroke();
      }
      ctx.restore();

      for (var k = 1; k <= 3; k++) {
        var lp = boss.len * k / 4;
        var wx = boss.x + lp;
        var wy = E.rivalY(boss, lp);
        var pulse = 0.7 + 0.3 * Math.sin(time * 5 + k * 1.7);
        ctx.fillStyle = color;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(wx, wy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = color;
      ctx.font = '900 13px ui-monospace, Menlo, monospace';
      var labelY = E.rivalY(boss, 0) - 18;
      if (labelY < state.top + 12) labelY = E.rivalY(boss, 0) + 24;
      ctx.fillText((boss.final ? 'FINAL BOSS' : 'BOSS') + ' P' + (boss.phase || 1) + ' / WEAK:' + (C.FAMILY_LABELS_EN[boss.family] || '—'), boss.x + 8, labelY);
    }

    function drawBossAttacks(state, time) {
      if (!state) return;
      var boss = state.boss;
      if (boss && boss.warning) {
        var w = boss.warning;
        var pulse = 0.45 + 0.4 * Math.sin(time * 18);
        ctx.save();
        if (w.kind === 'laser') {
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = '#ff4d8d';
          ctx.lineWidth = 2;
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.moveTo(0, w.y);
          ctx.lineTo(viewW, w.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#ff8f9f';
          ctx.font = '900 10px ui-monospace, Menlo, monospace';
          ctx.fillText('LASER', viewW - 48, w.y - 7);
        } else {
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(boss.x + Math.min(boss.len, 500) / 2, boss.baseY, 28 + Math.sin(time * 12) * 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#ffd166';
          ctx.font = '900 10px ui-monospace, Menlo, monospace';
          ctx.fillText(w.kind === 'fan' ? 'FAN' : 'SHOT', boss.x + 8, boss.baseY - 34);
        }
        ctx.restore();
      }
      if (boss && boss.beamTimer > 0) {
        var alpha = Math.min(1, boss.beamTimer / 0.26);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = 'rgba(255, 77, 141, 0.95)';
        ctx.shadowColor = '#ff4d8d';
        ctx.shadowBlur = 24;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, boss.beamY);
        ctx.lineTo(viewW, boss.beamY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
      if (state.bossShots) {
        for (var i = 0; i < state.bossShots.length; i++) {
          var shot = state.bossShots[i];
          ctx.save();
          ctx.shadowColor = '#ff4d8d';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#ff7a9f';
          ctx.beginPath();
          ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(shot.x - 1, shot.y - 1, Math.max(2, shot.r * 0.35), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    function drawPlayer(state, time) {
      if (!state) return;
      var trail = state.trail;
      if (!trail.length) return;

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(80, 230, 255, 0.8)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(95, 240, 255, 0.22)';
      ctx.lineWidth = 9;
      ctx.beginPath();
      for (var i = 0; i < trail.length; i++) {
        if (i === 0) ctx.moveTo(trail[i].x, trail[i].y);
        else ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(120, 245, 255, 0.98)';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      if (trail.length > 1) {
        ctx.save();
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        for (i = 1; i < trail.length; i++) {
          var pointMode = trail[i].mode || state.mode;
          ctx.strokeStyle = C.modeColor(pointMode);
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
        ctx.restore();
      }

      var headColor = C.modeColor(state.mode);
      var hx = state.headX;
      var hy = state.y;
      ctx.save();
      ctx.shadowColor = headColor;
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#eaffff';
      ctx.beginPath();
      ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = headColor;
      ctx.beginPath();
      ctx.arc(hx, hy, 10 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
      ctx.globalAlpha = 0.28;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      if (state.playerInvuln > 0) {
        var blink = 0.55 + 0.35 * Math.sin(time * 24);
        ctx.save();
        ctx.globalAlpha = blink;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = headColor;
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillText(C.formatModeLabel(state.mode, state.deckParams, state.fusion), hx + 15, hy - 12);
    }

    function drawEffects(effects) {
      var beams = effects.beams || [];
      var rings = effects.rings || [];
      var particles = effects.particles || [];
      var labels = effects.labels || [];
      var i;
      for (i = 0; i < beams.length; i++) {
        var beam = beams[i];
        var ba = Math.max(0, Math.min(1, beam.life / beam.max));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = ba;
        ctx.strokeStyle = 'rgba(120, 245, 255, 0.95)';
        ctx.shadowColor = '#5ff0ff';
        ctx.shadowBlur = 28;
        ctx.lineWidth = 2 + 8 * ba;
        ctx.beginPath();
        ctx.moveTo(beam.x, 0);
        ctx.lineTo(beam.x, viewH);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = ba * 0.36;
        ctx.lineWidth = 18;
        ctx.stroke();
        ctx.restore();
      }
      for (i = 0; i < rings.length; i++) {
        var r = rings[i];
        var a = Math.max(0, Math.min(1, r.life / r.max));
        ctx.globalAlpha = a;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2 + 2 * a;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (i = 0; i < particles.length; i++) {
        var p = particles[i];
        var pa = Math.max(0, Math.min(1, p.life / p.max));
        ctx.globalAlpha = pa;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      for (i = 0; i < labels.length; i++) {
        var l = labels[i];
        var la = Math.max(0, Math.min(1, l.life / l.max));
        ctx.globalAlpha = la;
        ctx.fillStyle = l.color;
        ctx.font = '900 ' + l.size + 'px "Hiragino Kaku Gothic ProN", system-ui, sans-serif';
        ctx.fillText(l.text, l.x - 10, l.y);
      }
      ctx.globalAlpha = 1;
    }

    function draw(state, time, effects) {
      effects = effects || {};
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      var shake = effects.shake || 0;
      if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * 18 * shake, (Math.random() - 0.5) * 18 * shake);
      }
      drawGrid(state, time);
      drawRivals(state, time);
      drawAllies(state, time);
      drawBoss(state, time);
      drawBossAttacks(state, time);
      drawPlayer(state, time);
      drawItems(state, time);
      drawEffects(effects);
      var flash = effects.flash || 0;
      if (flash > 0) {
        ctx.fillStyle = 'rgba(' + (effects.flashColor || '255, 255, 255') + ', ' + (flash * 0.5) + ')';
        ctx.fillRect(0, 0, viewW, viewH);
      }
      ctx.restore();
    }

    function drawPreview(canvas, key, params) {
      if (!canvas || typeof canvas.getContext !== 'function') return;
      var pctx = canvas.getContext('2d');
      if (!pctx) return;
      var W = 560;
      var H = 92;
      var top = 8;
      var bottom = 84;
      pctx.clearRect(0, 0, W, H);
      pctx.fillStyle = 'rgba(7, 13, 24, 0.95)';
      pctx.fillRect(0, 0, W, H);
      pctx.strokeStyle = 'rgba(80, 170, 220, 0.12)';
      pctx.lineWidth = 1;
      for (var gx = 0; gx <= W; gx += 40) {
        pctx.beginPath();
        pctx.moveTo(gx, top);
        pctx.lineTo(gx, bottom);
        pctx.stroke();
      }
      for (var gy = top; gy <= bottom; gy += 19) {
        pctx.beginPath();
        pctx.moveTo(0, gy);
        pctx.lineTo(W, gy);
        pctx.stroke();
      }
      pctx.strokeStyle = 'rgba(95, 240, 255, 0.25)';
      pctx.beginPath();
      pctx.moveTo(0, top);
      pctx.lineTo(W, top);
      pctx.moveTo(0, bottom);
      pctx.lineTo(W, bottom);
      pctx.stroke();

      if (!key || !params || !C.MODES[key]) return;
      var color = C.modeColor(key);
      var dt = 1 / 60;
      var tmax = 1.6;
      var fieldH = 520;
      var y = fieldH / 2;
      var power = Math.max(2, Math.round(params.p || 2));
      var shapeIndex = Math.max(0, Math.min(7, Math.round(params.shape || 0)));
      var waveAmp = 68 * (params.a || 1);
      var waveBase = fieldH / 2 - waveAmp * E.waveShapeValue(shapeIndex, params.c || 0, 0);
      var vy = (params.b || 0) * 120;
      var powerSign = key === 'quad' ? -1 : 1;
      var points = [{ x: 0, y: top + (y / fieldH) * (bottom - top) }];
      var off = false;
      for (var t = dt; t <= tmax + 1e-9; t += dt) {
        if (key === 'wave') {
          var theta = t * 4.2 * (params.b || 1) + (params.c || 0);
          y = waveBase + waveAmp * E.waveShapeValue(shapeIndex, theta, t);
        } else {
          vy = powerSign * 280 * (params.a || 1) * power * Math.pow(t, power - 1) + (params.b || 0) * 120;
          y += vy * dt;
        }
        if (y < 0 || y > fieldH) {
          off = true;
          y = Math.max(0, Math.min(fieldH, y));
        }
        points.push({ x: W * t / tmax, y: top + (y / fieldH) * (bottom - top) });
      }

      pctx.save();
      pctx.lineCap = 'round';
      pctx.lineJoin = 'round';
      pctx.shadowColor = color;
      pctx.shadowBlur = 9;
      pctx.strokeStyle = color;
      pctx.lineWidth = 2.6;
      pctx.beginPath();
      for (var i = 0; i < points.length; i++) {
        if (i === 0) pctx.moveTo(points[i].x, points[i].y);
        else pctx.lineTo(points[i].x, points[i].y);
      }
      pctx.stroke();
      pctx.shadowBlur = 0;
      pctx.fillStyle = '#eaffff';
      pctx.beginPath();
      pctx.arc(points[0].x + 3, points[0].y, 3, 0, Math.PI * 2);
      pctx.fill();
      var last = points[points.length - 1];
      pctx.fillStyle = color;
      pctx.beginPath();
      pctx.arc(last.x - 3, last.y, 3.5, 0, Math.PI * 2);
      pctx.fill();
      pctx.restore();
    }

    return {
      resize: resize,
      draw: draw,
      drawPreview: drawPreview,
      getWidth: function () { return viewW; },
      getHeight: function () { return viewH; }
    };
  }

  return { create: create };
});
