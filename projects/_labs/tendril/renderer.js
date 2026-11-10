/* renderer.js : TENDRIL のCanvas描画（発光・パーティクル・シェイク） */
(function (root) {
  'use strict';

  var W = 390;
  var H = 844;
  var TAU = Math.PI * 2;

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var width = 390;
    var height = 844;
    var dpr = 1;
    var scale = 1;
    var ox = 0;
    var oy = 0;
    var lastCssW = -1;
    var lastCssH = -1;
    var lastT = 0;
    var flash = 0;
    var particles = [];
    var motes = [];
    var i;

    for (i = 0; i < 84; i++) {
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.6 + Math.random() * 1.6,
        a: 0.12 + Math.random() * 0.4,
        d: 0.3 + Math.random() * 1.2
      });
    }

    function resize() {
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      var cssW = Math.max(1, (rect && rect.width) || canvas.clientWidth || 390);
      var cssH = Math.max(1, (rect && rect.height) || canvas.clientHeight || 844);
      lastCssW = cssW;
      lastCssH = cssH;
      width = cssW;
      height = cssH;
      dpr = Math.min(2, root.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ctx) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
      scale = Math.min(width / W, height / H);
      ox = (width - W * scale) / 2;
      oy = (height - H * scale) / 2;
    }

    function screenToWorld(px, py, rect) {
      rect = rect || (canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 });
      var lx = (px - (rect.left || 0) - ox) / (scale || 1);
      var ly = (py - (rect.top || 0) - oy) / (scale || 1);
      return { x: lx, y: ly };
    }

    function blob(x, y, r, color) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    function spawnBurst(x, y, hue, count, power) {
      for (var k = 0; k < count; k++) {
        var ang = Math.random() * TAU;
        var sp = power * (0.35 + Math.random() * 0.9);
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 20,
          r: 1 + Math.random() * 3,
          life: 0.5 + Math.random() * 0.6,
          max: 1.1,
          hue: hue + (Math.random() - 0.5) * 40
        });
      }
      if (particles.length > 220) particles.splice(0, particles.length - 220);
    }

    function consumeEvents(state) {
      if (!state || !state.events || !state.events.length) return;
      for (var k = 0; k < state.events.length; k++) {
        var e = state.events[k];
        if (e.type === 'eat') {
          spawnBurst(e.x, e.y, e.hue || 186, 16, 190);
          flash = Math.min(1, flash + 0.4);
        } else if (e.type === 'hit') {
          spawnBurst(e.x, e.y, 344, 22, 240);
          flash = Math.min(1, flash + 0.5);
        }
      }
      state.events.length = 0;
    }

    function updateParticles(dt) {
      for (var k = particles.length - 1; k >= 0; k--) {
        var p = particles[k];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(k, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - Math.min(0.4, dt * 2.4);
        p.vy *= 1 - Math.min(0.4, dt * 2.4);
      }
      if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
    }

    function drawBackground(t) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      var bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#03060f');
      bg.addColorStop(0.5, '#06101f');
      bg.addColorStop(1, '#0a0616');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';
      blob(width * 0.3 + Math.sin(t * 0.22) * 26, height * 0.24, Math.max(width, height) * 0.52, 'rgba(36,190,255,0.10)');
      blob(width * 0.78, height * 0.66, Math.max(width, height) * 0.46, 'rgba(196,60,255,0.08)');
      blob(width * 0.5, height * 0.95, Math.max(width, height) * 0.4, 'rgba(30,255,210,0.05)');
    }

    function drawCaustics(t) {
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 5; k++) {
        var base = (k / 5) * TAU + Math.sin(t * 0.2 + k) * 0.3;
        var x = W * 0.5 + Math.cos(base) * W * 0.42;
        var w = 26 + Math.sin(t * 0.5 + k * 1.7) * 10;
        var g = ctx.createLinearGradient(x, 0, x + w * 1.4, H * 0.8);
        g.addColorStop(0, 'rgba(90,230,255,0.05)');
        g.addColorStop(1, 'rgba(90,230,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + w, 0);
        ctx.lineTo(x + w * 2.2, H);
        ctx.lineTo(x + w * 1.2, H);
        ctx.closePath();
        ctx.fill();
      }
    }

    function drawMotes(t) {
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < motes.length; k++) {
        var m = motes[k];
        var yy = m.y - (t * 12 * m.d) % H;
        if (yy < 0) yy += H;
        ctx.fillStyle = 'rgba(170,235,255,' + m.a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(m.x, yy, m.r, 0, TAU);
        ctx.fill();
      }
    }

    function drawOrb(o, t) {
      var pulse = 1 + Math.sin(t * 5 + o.phase) * 0.14;
      ctx.globalCompositeOperation = 'lighter';
      blob(o.x, o.y, o.r * 5.2 * pulse, 'hsla(' + o.hue + ',100%,65%,0.22)');
      blob(o.x, o.y, o.r * 2.2 * pulse, 'hsla(' + o.hue + ',100%,72%,0.5)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(245,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 0.52, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'hsla(' + o.hue + ',100%,74%,0.85)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * pulse, t * 1.8 + o.phase, t * 1.8 + o.phase + 4.1);
      ctx.stroke();
      ctx.strokeStyle = 'hsla(' + o.hue + ',100%,80%,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 1.5 * pulse, -t * 1.2 + o.phase, -t * 1.2 + o.phase + 2.2);
      ctx.stroke();
    }

    function drawSpike(sp) {
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.angle);
      ctx.globalCompositeOperation = 'lighter';
      blob(0, 0, sp.r * 3, 'rgba(255,70,120,0.16)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#170a16';
      ctx.beginPath();
      ctx.arc(0, 0, sp.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2c0f22';
      for (var k = 0; k < 9; k++) {
        var a = (k / 9) * TAU;
        var len = sp.r * (1.5 + (k % 2) * 0.4);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.16) * sp.r * 0.8, Math.sin(a - 0.16) * sp.r * 0.8);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.lineTo(Math.cos(a + 0.16) * sp.r * 0.8, Math.sin(a + 0.16) * sp.r * 0.8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,96,140,0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, sp.r * 0.9, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,120,165,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, sp.r * 0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    function drawTentacle(state, t) {
      var tc = state.tentacle;
      if (!tc || tc.len < 6) return;
      var h = state.head;
      var bend = Math.sin(t * 9) * Math.min(16, tc.len * 0.12);
      var mx = (h.x + tc.tipX) / 2 - (tc.tipY - h.y) / (tc.len || 1) * bend;
      var my = (h.y + tc.tipY) / 2 + (tc.tipX - h.x) / (tc.len || 1) * bend;

      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(90,240,255,0.16)';
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.quadraticCurveTo(mx, my, tc.tipX, tc.tipY);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(120,250,255,0.5)';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.quadraticCurveTo(mx, my, tc.tipX, tc.tipY);
      ctx.stroke();

      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(235,255,255,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.quadraticCurveTo(mx, my, tc.tipX, tc.tipY);
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      blob(tc.tipX, tc.tipY, 16, 'rgba(120,250,255,0.45)');
      ctx.fillStyle = 'rgba(240,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(tc.tipX, tc.tipY, 4.2, 0, TAU);
      ctx.fill();

      if (tc.grabbedId >= 0) {
        ctx.strokeStyle = 'rgba(150,255,255,0.85)';
        ctx.lineWidth = 2;
        for (var k = 0; k < 3; k++) {
          var a = t * 8 + k * (TAU / 3);
          ctx.beginPath();
          ctx.arc(tc.tipX, tc.tipY, 9, a, a + 1.1);
          ctx.stroke();
        }
      }
    }

    function drawBody(state, t) {
      var nodes = state.body;
      if (!nodes || nodes.length < 2) return;
      var n = Math.min(state.bodyLen, nodes.length);
      if (n < 2) return;

      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < n; i++) {
        var p = nodes[i];
        var k = i / (n - 1);
        var r = 12 - k * 9;
        ctx.fillStyle = 'hsla(' + (186 + k * 66) + ',100%,62%,' + (0.12 * (1 - k * 0.5)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.5, 0, TAU);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      for (var j = 0; j < n - 1; j++) {
        var a = nodes[j];
        var b = nodes[j + 1];
        for (var sIdx = 0; sIdx < 3; sIdx++) {
          var tt = sIdx / 3;
          var idx = j + tt;
          var kk = idx / (n - 1);
          var x = a.x + (b.x - a.x) * tt;
          var y = a.y + (b.y - a.y) * tt;
          var rad = 10.5 - kk * 8;
          ctx.fillStyle = 'hsla(' + (184 + kk * 70) + ',95%,' + (66 - kk * 8) + '%,0.9)';
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(235,255,255,0.35)';
          ctx.beginPath();
          ctx.arc(x - rad * 0.22, y - rad * 0.26, rad * 0.42, 0, TAU);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(140,255,255,0.28)';
      ctx.lineWidth = 1.4;
      for (var q = 2; q < n - 1; q += 3) {
        var c0 = nodes[q];
        var c1 = nodes[q - 1];
        var ang = Math.atan2(c0.y - c1.y, c0.x - c1.x) + Math.PI / 2;
        var side = q % 2 ? 1 : -1;
        var len = 7 * (1 - q / n) + 2;
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.lineTo(c0.x + Math.cos(ang) * len * side, c0.y + Math.sin(ang) * len * side);
        ctx.stroke();
      }

      var tail = nodes[n - 1];
      var prev = nodes[n - 2];
      var ta = Math.atan2(tail.y - prev.y, tail.x - prev.x);
      ctx.strokeStyle = 'rgba(160,120,255,0.4)';
      ctx.lineWidth = 2;
      for (var w = -1; w <= 1; w += 2) {
        var wig = Math.sin(t * 6 + w) * 0.5;
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.quadraticCurveTo(
          tail.x + Math.cos(ta + w * 0.5 + wig) * 18,
          tail.y + Math.sin(ta + w * 0.5 + wig) * 18,
          tail.x + Math.cos(ta + w * 0.9 + wig) * 30,
          tail.y + Math.sin(ta + w * 0.9 + wig) * 30
        );
        ctx.stroke();
      }
    }

    function drawHead(state, t) {
      var h = state.head;
      var ang = Math.atan2(state.aim.y - h.y, state.aim.x - h.x);
      var speed = Math.sqrt(h.vx * h.vx + h.vy * h.vy);
      var stretch = Math.min(0.28, speed / 1500);
      var alpha = 1;
      if (state.invuln > 0) alpha = 0.55 + Math.abs(Math.sin(t * 26)) * 0.45;

      ctx.globalCompositeOperation = 'lighter';
      blob(h.x, h.y, 44, 'rgba(80,235,255,' + (0.2 * alpha).toFixed(3) + ')');
      blob(h.x, h.y, 22, 'rgba(120,255,255,' + (0.3 * alpha).toFixed(3) + ')');

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(ang);
      ctx.scale(1 + stretch, 1 - stretch * 0.55);
      var g = ctx.createRadialGradient(-3, -4, 1.5, 0, 0, 14);
      g.addColorStop(0, '#f2ffff');
      g.addColorStop(0.45, '#6ef0ff');
      g.addColorStop(1, '#116d95');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 13.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,190,230,0.5)';
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.quadraticCurveTo(-20, -9, -24, 0);
      ctx.quadraticCurveTo(-20, 9, -8, 0);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;

      var ex = Math.cos(ang);
      var ey = Math.sin(ang);
      for (var si = -1; si <= 1; si += 2) {
        var px = h.x + ex * 4.5 - ey * 5 * si;
        var py = h.y + ey * 4.5 + ex * 5 * si;
        ctx.fillStyle = 'rgba(250,255,255,' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(px, py, 3.9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#052532';
        ctx.beginPath();
        ctx.arc(px + ex * 1.3, py + ey * 1.3, 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(px + ex * 0.4 - 0.6, py + ey * 0.4 - 0.8, 0.8, 0, TAU);
        ctx.fill();
      }
    }

    function drawParticles() {
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < particles.length; k++) {
        var p = particles[k];
        var a = Math.max(0, Math.min(1, p.life / p.max));
        ctx.fillStyle = 'hsla(' + p.hue + ',100%,72%,' + (a * 0.9).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.4 + a), 0, TAU);
        ctx.fill();
      }
    }

    function draw(state, t) {
      if (!ctx) return;
      if (canvas.clientWidth !== undefined && (canvas.clientWidth !== lastCssW || canvas.clientHeight !== lastCssH)) {
        resize();
      }
      var dt = lastT ? Math.min(0.05, t - lastT) : 0.016;
      lastT = t;
      if (dt < 0) dt = 0.016;

      consumeEvents(state);
      updateParticles(dt);

      drawBackground(t);

      var shake = state ? (state.shake || 0) : 0;
      var sx = Math.sin(t * 83) * shake * 0.6;
      var sy = Math.cos(t * 71) * shake * 0.6;

      ctx.save();
      ctx.translate(ox + sx * scale, oy + sy * scale);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();

      drawCaustics(t);
      drawMotes(t);

      if (state) {
        var k;
        for (k = 0; k < state.orbs.length; k++) drawOrb(state.orbs[k], t);
        for (k = 0; k < state.spikes.length; k++) drawSpike(state.spikes[k]);
        drawTentacle(state, t);
        drawBody(state, t);

        if (state.head) {
          var h = state.head;
          particles.push({
            x: h.x + (Math.random() - 0.5) * 14,
            y: h.y + (Math.random() - 0.5) * 14,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20 - 12,
            r: 1 + Math.random() * 1.4,
            life: 0.5,
            max: 0.9,
            hue: 190
          });
        }
        drawHead(state, t);
      }

      drawParticles();
      ctx.restore();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      var vg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.32, width / 2, height / 2, Math.max(width, height) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);

      if (flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(150,245,255,' + (flash * 0.16).toFixed(3) + ')';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    resize();
    return { resize: resize, draw: draw, screenToWorld: screenToWorld };
  }

  root.TendrilRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
