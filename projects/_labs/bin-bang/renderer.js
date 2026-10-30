/* renderer.js : BIN BANG の Canvas 描画 */
(function (root) {
  'use strict';

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var width = 390, height = 844, dpr = 1;
    var stars = [];

    for (var i = 0; i < 70; i++) {
      stars.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.5, a: 0.15 + Math.random() * 0.55 });
    }

    function resize() {
      if (!canvas) return;
      dpr = Math.min(2, root.devicePixelRatio || 1);
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      width = rect && rect.width ? rect.width : 390;
      height = rect && rect.height ? rect.height : 844;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ctx) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
    }

    function roundRect(x, y, w, h, r) {
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawBackground(t) {
      var bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#050b18');
      bg.addColorStop(0.55, '#07111e');
      bg.addColorStop(1, '#0d0810');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        var tw = 0.45 + 0.55 * Math.sin(t * 1.8 + i);
        ctx.fillStyle = 'rgba(150, 220, 255, ' + (st.a * tw).toFixed(3) + ')';
        ctx.fillRect(st.x * width, st.y * height * 0.72, st.s, st.s);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawAlley(scale, ox, oy) {
      // city silhouettes behind the playfield
      ctx.fillStyle = 'rgba(8, 26, 37, 0.9)';
      var base = oy + 520 * scale;
      var heights = [42, 84, 55, 112, 68, 95, 48, 80, 60, 104, 45];
      var bw = (360 * scale) / heights.length;
      for (var i = 0; i < heights.length; i++) {
        var bh = heights[i] * scale;
        ctx.fillRect(ox + i * bw, base - bh, bw + 1, bh + height);
        ctx.fillStyle = i % 3 === 0 ? 'rgba(255, 190, 80, 0.24)' : 'rgba(70, 180, 210, 0.16)';
        ctx.fillRect(ox + i * bw + bw * 0.25, base - bh + 8 * scale, bw * 0.12, 4 * scale);
        ctx.fillRect(ox + i * bw + bw * 0.6, base - bh + 20 * scale, bw * 0.12, 4 * scale);
        ctx.fillStyle = 'rgba(8, 26, 37, 0.9)';
      }
      // neon horizon
      var line = ctx.createLinearGradient(ox, 0, ox + 360 * scale, 0);
      line.addColorStop(0, 'rgba(255, 70, 170, 0)');
      line.addColorStop(0.35, 'rgba(255, 70, 170, 0.6)');
      line.addColorStop(0.7, 'rgba(80, 240, 220, 0.6)');
      line.addColorStop(1, 'rgba(80, 240, 220, 0)');
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox, base);
      ctx.lineTo(ox + 360 * scale, base);
      ctx.stroke();

      // neon signs on the back wall
      ctx.save();
      ctx.font = '900 ' + Math.round(20 * scale) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      var neon = ['TRASH', 'BIN', 'BANG', 'DUMP'];
      for (var n = 0; n < neon.length; n++) {
        var nx = ox + (42 + n * 96) * scale;
        var ny = base - (160 + (n % 2) * 35) * scale;
        ctx.shadowBlur = 16;
        ctx.shadowColor = n % 2 ? 'rgba(255, 101, 178, 0.8)' : 'rgba(111, 214, 195, 0.8)';
        ctx.fillStyle = n % 2 ? 'rgba(255, 150, 200, 0.55)' : 'rgba(150, 255, 235, 0.5)';
        ctx.fillText(neon[n], nx, ny);
      }
      ctx.restore();

      // bins along the bottom of the alley
      for (var b = 0; b < 5; b++) {
        var bx = ox + (18 + b * 78) * scale;
        var by = base + 4 * scale;
        ctx.fillStyle = b % 2 ? '#162f36' : '#1b2933';
        roundRect(bx, by, 28 * scale, 22 * scale, 4 * scale);
        ctx.fill();
        ctx.fillStyle = 'rgba(111, 214, 195, 0.22)';
        ctx.fillRect(bx + 4 * scale, by + 4 * scale, 20 * scale, 2 * scale);
      }
    }

    function drawEnemy(e, scale, ox, oy) {
      var x = ox + e.x * scale;
      var y = oy + e.y * scale;
      var r = e.r * scale;
      if (y < oy - r * 2 || y > height + r * 2) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalCompositeOperation = 'lighter';
      var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
      glow.addColorStop(0, 'hsla(' + e.hue + ', 100%, 65%, 0.5)');
      glow.addColorStop(1, 'hsla(' + e.hue + ', 100%, 60%, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      if (e.type === 'gold') {
        ctx.fillStyle = 'rgba(255, 220, 95, 0.98)';
        ctx.strokeStyle = 'rgba(255, 255, 220, 1)';
        ctx.lineWidth = Math.max(1, 1.5 * scale);
        ctx.beginPath();
        for (var sp = 0; sp < 10; sp++) {
          var sa = -Math.PI / 2 + sp * Math.PI / 5;
          var sr = sp % 2 ? r * 0.5 : r * 1.1;
          if (sp === 0) ctx.moveTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
          else ctx.lineTo(Math.cos(sa) * sr, Math.sin(sa) * sr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (e.type === 'bottle') {
        ctx.fillStyle = 'rgba(90, 240, 255, 0.98)';
        roundRect(-r * 0.34, -r, r * 0.68, r * 2, r * 0.22);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(-r * 0.16, -r * 0.7, r * 0.12, r * 1.1);
        ctx.fillStyle = 'rgba(255, 235, 150, 0.8)';
        ctx.fillRect(-r * 0.25, -r * 1.05, r * 0.5, r * 0.16);
      } else if (e.type === 'can') {
        ctx.fillStyle = 'rgba(80, 245, 190, 0.85)';
        roundRect(-r * 0.7, -r * 0.8, r * 1.4, r * 1.6, r * 0.18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(208, 255, 235, 0.7)';
        ctx.lineWidth = Math.max(1, scale);
        ctx.strokeRect(-r * 0.7, -r * 0.8, r * 1.4, r * 1.6);
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.2);
        ctx.lineTo(r * 0.7, -r * 0.2);
        ctx.stroke();
      } else if (e.type === 'bomb') {
        ctx.fillStyle = '#3a1020';
        ctx.strokeStyle = 'rgba(255, 90, 120, 0.95)';
        ctx.lineWidth = Math.max(1.5, 2 * scale);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 210, 100, 0.85)';
        ctx.beginPath();
        ctx.moveTo(r * 0.2, -r * 0.7);
        ctx.quadraticCurveTo(r * 0.6, -r * 1.2, r * 0.35, -r * 1.55);
        ctx.stroke();
        ctx.fillStyle = '#ffb45e';
        ctx.beginPath();
        ctx.arc(r * 0.35, -r * 1.55, Math.max(1.5, r * 0.18), 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'boss') {
        ctx.fillStyle = 'rgba(120, 35, 92, 0.9)';
        ctx.strokeStyle = 'rgba(255, 115, 195, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r, r * 0.3);
        ctx.quadraticCurveTo(-r * 1.1, -r * 0.9, 0, -r);
        ctx.quadraticCurveTo(r * 1.1, -r * 0.9, r, r * 0.3);
        ctx.quadraticCurveTo(r * 0.5, r * 0.9, 0, r * 0.8);
        ctx.quadraticCurveTo(-r * 0.5, r * 0.9, -r, r * 0.3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 220, 120, 0.92)';
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.8);
        ctx.lineTo(-r * 0.2, -r * 1.25);
        ctx.lineTo(0, -r * 0.88);
        ctx.lineTo(r * 0.2, -r * 1.25);
        ctx.lineTo(r * 0.5, -r * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 245, 230, 0.9)';
        ctx.fillRect(-r * 0.54, -r * 0.2, r * 0.2, r * 0.24);
        ctx.fillRect(r * 0.34, -r * 0.2, r * 0.2, r * 0.24);
      } else {
        // bag
        ctx.fillStyle = 'hsla(45, 92%, 64%, 0.96)';
        ctx.strokeStyle = 'rgba(255, 250, 190, 1)';
        ctx.lineWidth = Math.max(1, 1.5 * scale);
        ctx.beginPath();
        ctx.moveTo(-r * 0.8, -r * 0.35);
        ctx.quadraticCurveTo(-r * 1.0, -r * 0.9, -r * 0.25, -r * 0.92);
        ctx.quadraticCurveTo(0, -r * 1.2, r * 0.25, -r * 0.92);
        ctx.quadraticCurveTo(r * 1.0, -r * 0.9, r * 0.8, -r * 0.35);
        ctx.quadraticCurveTo(r * 0.55, r * 0.85, 0, r * 0.85);
        ctx.quadraticCurveTo(-r * 0.55, r * 0.85, -r * 0.8, -r * 0.35);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(42, 20, 4, 0.92)';
        ctx.beginPath();
        ctx.arc(-r * 0.25, 0, Math.max(1.2, r * 0.1), 0, Math.PI * 2);
        ctx.arc(r * 0.25, 0, Math.max(1.2, r * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }

      if (e.maxHp > 1) {
        var w = r * 2;
        var pct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(-w / 2, -r - 8 * scale, w, 3 * scale);
        ctx.fillStyle = pct > 0.5 ? '#6fd6c3' : '#ff8b6b';
        ctx.fillRect(-w / 2, -r - 8 * scale, w * pct, 3 * scale);
      }
      ctx.restore();
    }

    function drawPlayer(state, scale, ox, oy, t) {
      var p = state.player;
      var x = ox + p.x * scale;
      var y = oy + p.y * scale;
      var r = p.r * scale;
      var over = state.overdrive > 0;
      var pulse = 1 + Math.sin(t * 9) * 0.03;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pulse, pulse);

      if (state.invuln > 0) {
        ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 38);
      }
      if (over) {
        var aura = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3.4);
        aura.addColorStop(0, 'rgba(111, 214, 195, 0.28)');
        aura.addColorStop(1, 'rgba(111, 214, 195, 0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, r * 3.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // cannon glow / muzzle heat
      var muzzle = ctx.createRadialGradient(0, -r * 1.15, 0, 0, -r * 1.15, r * 1.1);
      muzzle.addColorStop(0, over ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 220, 130, 0.7)');
      muzzle.addColorStop(0.45, over ? 'rgba(111, 214, 195, 0.45)' : 'rgba(255, 140, 80, 0.25)');
      muzzle.addColorStop(1, 'rgba(255, 140, 80, 0)');
      ctx.fillStyle = muzzle;
      ctx.beginPath();
      ctx.arc(0, -r * 1.15, r * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // wheels
      ctx.fillStyle = '#0a1218';
      ctx.beginPath();
      ctx.arc(-r * 0.55, r * 0.9, r * 0.2, 0, Math.PI * 2);
      ctx.arc(r * 0.55, r * 0.9, r * 0.2, 0, Math.PI * 2);
      ctx.fill();

      // can body
      var body = ctx.createLinearGradient(-r, 0, r, 0);
      body.addColorStop(0, '#1d8f8e');
      body.addColorStop(0.45, '#63e5cc');
      body.addColorStop(1, '#116b73');
      ctx.fillStyle = body;
      roundRect(-r * 0.78, -r * 0.6, r * 1.56, r * 1.45, r * 0.22);
      ctx.fill();
      ctx.strokeStyle = 'rgba(210, 255, 245, 0.8)';
      ctx.lineWidth = Math.max(1, 1.5 * scale);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(5, 40, 45, 0.45)';
      ctx.lineWidth = Math.max(1, scale);
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.34, -r * 0.3);
        ctx.lineTo(i * r * 0.34, r * 0.65);
        ctx.stroke();
      }

      // lid
      ctx.save();
      ctx.translate(0, -r * 0.7);
      ctx.rotate(-0.36);
      ctx.fillStyle = '#b7fff0';
      roundRect(-r * 0.9, -r * 0.4, r * 1.8, r * 0.38, r * 0.12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 235, 160, 0.9)';
      ctx.lineWidth = Math.max(1, 1.2 * scale);
      ctx.stroke();
      ctx.restore();

      // eyes
      ctx.fillStyle = '#041018';
      ctx.beginPath();
      ctx.arc(-r * 0.28, -r * 0.05, r * 0.13, 0, Math.PI * 2);
      ctx.arc(r * 0.28, -r * 0.05, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(-r * 0.24, -r * 0.1, r * 0.045, 0, Math.PI * 2);
      ctx.arc(r * 0.32, -r * 0.1, r * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function draw(state, t) {
      if (!ctx) return;
      drawBackground(t);
      var scale = Math.min(width / 360, (height - 120) / 640);
      var ox = (width - 360 * scale) / 2;
      var oy = 68 + Math.max(0, (height - 120 - 640 * scale) / 2);
      ctx.save();
      var sh = state.shake || 0;
      if (sh > 0.2) ctx.translate(Math.sin(t * 70) * sh, Math.cos(t * 53) * sh * 0.5);

      drawAlley(scale, ox, oy);

      // playfield rim
      ctx.strokeStyle = 'rgba(111, 214, 195, 0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, 360 * scale, 640 * scale);

      for (var i = 0; i < state.enemies.length; i++) drawEnemy(state.enemies[i], scale, ox, oy);

      ctx.globalCompositeOperation = 'lighter';
      for (var bi = 0; bi < state.bullets.length; bi++) {
        var b = state.bullets[bi];
        var bx = ox + b.x * scale;
        var by = oy + b.y * scale;
        var br = Math.max(2.5, b.r * scale);
        ctx.strokeStyle = 'hsla(' + b.hue + ', 100%, 72%, 0.7)';
        ctx.lineWidth = br * 0.9;
        ctx.beginPath();
        ctx.moveTo(bx, by + br * 5);
        ctx.lineTo(bx, by);
        ctx.stroke();
        var bg = ctx.createRadialGradient(bx, by, 0, bx, by, br * 3);
        bg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        bg.addColorStop(0.3, 'hsla(' + b.hue + ', 100%, 70%, 0.75)');
        bg.addColorStop(1, 'hsla(' + b.hue + ', 100%, 65%, 0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(bx, by, br * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      for (var pi = 0; pi < state.particles.length; pi++) {
        var p = state.particles[pi];
        var a = Math.max(0, p.life / p.max);
        var px = ox + p.x * scale;
        var py = oy + p.y * scale;
        ctx.fillStyle = 'hsla(' + p.hue + ', 95%, 70%, ' + a.toFixed(3) + ')';
        ctx.fillRect(px - p.size, py - p.size, p.size * 2, p.size * 2);
      }

      for (var ri = 0; ri < state.rings.length; ri++) {
        var ring = state.rings[ri];
        ctx.strokeStyle = 'hsla(' + ring.hue + ', 100%, 72%, ' + Math.max(0, ring.life).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1, (1 + ring.life * 2) * scale);
        ctx.beginPath();
        ctx.arc(ox + ring.x * scale, oy + ring.y * scale, Math.max(1, ring.r * scale), 0, Math.PI * 2);
        ctx.stroke();
      }

      drawPlayer(state, scale, ox, oy, t);

      ctx.textAlign = 'center';
      ctx.font = '900 ' + Math.round(13 * scale) + 'px ui-sans-serif, system-ui, sans-serif';
      for (var pi2 = 0; pi2 < state.popups.length; pi2++) {
        var pop = state.popups[pi2];
        var alpha = Math.max(0, pop.life / pop.max);
        ctx.fillStyle = 'hsla(' + pop.hue + ', 100%, 80%, ' + alpha.toFixed(3) + ')';
        ctx.fillText(pop.text, ox + pop.x * scale, oy + pop.y * scale);
      }

      ctx.restore();

      ctx.fillStyle = 'rgba(160, 225, 255, 0.025)';
      for (var sl = 0; sl < height; sl += 4) ctx.fillRect(0, sl, width, 1);

      if (state.flash > 0) {
        ctx.fillStyle = 'rgba(190, 255, 245, ' + Math.min(0.22, state.flash * 0.55).toFixed(3) + ')';
        ctx.fillRect(0, 0, width, height);
      }
      if (state.overdrive > 0) {
        ctx.strokeStyle = 'rgba(111, 214, 195, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, width - 4, height - 4);
      }
    }

    function toWorldX(clientX) {
      if (!canvas || !canvas.getBoundingClientRect) return 180;
      var rect = canvas.getBoundingClientRect();
      var scale = Math.min(rect.width / 360, (rect.height - 120) / 640);
      var ox = (rect.width - 360 * scale) / 2;
      return (clientX - rect.left - ox) / scale;
    }

    resize();
    return { resize: resize, draw: draw, toWorldX: toWorldX };
  }

  root.BinBangRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
