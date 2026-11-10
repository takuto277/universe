/* renderer.js : PRISM のCanvas描画（光線・ミラー・発光） */
(function (root) {
  'use strict';

  var W = 390;
  var H = 844;
  var TAU = Math.PI * 2;

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var ENG = root.PrismEngine || null;
    var COLS = ENG ? ENG.COLS : 9;
    var ROWS = ENG ? ENG.ROWS : 13;
    var CELL = ENG ? ENG.CELL : 38;
    var BX = ENG && ENG.BOARD ? ENG.BOARD.x : 24;
    var BY = ENG && ENG.BOARD ? ENG.BOARD.y : 165;
    var BW = COLS * CELL;
    var BH = ROWS * CELL;

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
    var lift = 0;
    var particles = [];
    var dust = [];
    var prevLit = {};
    var prevLevel = -1;
    var prevPhase = 'idle';
    var i;

    for (i = 0; i < 70; i++) {
      dust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.5 + Math.random() * 1.5,
        a: 0.08 + Math.random() * 0.3,
        d: 0.2 + Math.random() * 1.1
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
      return {
        x: (px - (rect.left || 0) - ox) / (scale || 1),
        y: (py - (rect.top || 0) - oy) / (scale || 1)
      };
    }

    function cw(cx) { return BX + (cx + 0.5) * CELL; }
    function ch(cy) { return BY + (cy + 0.5) * CELL; }

    function blob(x, y, r, color) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    function burst(x, y, hue, count, power) {
      for (var k = 0; k < count; k++) {
        var a = Math.random() * TAU;
        var sp = power * (0.35 + Math.random() * 0.9);
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: 1 + Math.random() * 2.6,
          life: 0.45 + Math.random() * 0.7,
          max: 1.1,
          hue: hue + (Math.random() - 0.5) * 30
        });
      }
      if (particles.length > 200) particles.splice(0, particles.length - 200);
    }

    function updateParticles(dt) {
      for (var k = particles.length - 1; k >= 0; k--) {
        var p = particles[k];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(k, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - Math.min(0.5, dt * 3);
        p.vy *= 1 - Math.min(0.5, dt * 3);
      }
      if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
      if (lift > 0) lift = Math.max(0, lift - dt * 3);
    }

    function watchState(state) {
      if (!state) return;
      if (state.levelIndex !== prevLevel) {
        prevLevel = state.levelIndex;
        prevLit = {};
      }
      if (!state.targets) return;
      for (var k = 0; k < state.targets.length; k++) {
        var tg = state.targets[k];
        var key = state.levelIndex + ':' + k;
        if (tg.lit && !prevLit[key]) {
          var c = { x: cw(tg.x), y: ch(tg.y) };
          burst(c.x, c.y, tg.hue || 190, 14, 150);
          flash = Math.min(1, flash + 0.35);
        }
        prevLit[key] = !!tg.lit;
      }
      if (state.phase === 'clear' && prevPhase !== 'clear') {
        flash = Math.min(1, flash + 0.5);
        for (var q = 0; q < state.targets.length; q++) {
          if (state.targets[q].lit) {
            burst(cw(state.targets[q].x), ch(state.targets[q].y), state.targets[q].hue || 190, 20, 220);
          }
        }
      }
      prevPhase = state.phase;
    }

    function drawBackground(t) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      var bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#05060e');
      bg.addColorStop(0.5, '#0a0c1a');
      bg.addColorStop(1, '#080512');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';
      blob(width * 0.28, height * 0.2, Math.max(width, height) * 0.5, 'rgba(40,120,220,0.08)');
      blob(width * 0.78, height * 0.72, Math.max(width, height) * 0.48, 'rgba(180,50,220,0.07)');
      blob(width * 0.5, height * 0.5, Math.max(width, height) * 0.55, 'rgba(30,200,220,0.04)');

      for (var k = 0; k < dust.length; k++) {
        var d = dust[k];
        var yy = d.y - (t * 10 * d.d) % H;
        if (yy < 0) yy += H;
        ctx.fillStyle = 'rgba(180,220,255,' + d.a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(d.x, yy, d.r, 0, TAU);
        ctx.fill();
      }
    }

    function drawBoard() {
      ctx.globalCompositeOperation = 'source-over';
      var r = 18;
      var x = BX;
      var y = BY;
      var w = BW;
      var h = BH;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fillStyle = 'rgba(12,18,34,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,180,230,0.18)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      for (var gx = 0; gx < COLS; gx++) {
        for (var gy = 0; gy < ROWS; gy++) {
          ctx.fillStyle = 'rgba(110,180,220,0.10)';
          ctx.beginPath();
          ctx.arc(cw(gx), ch(gy), 1.1, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function drawWalls(state) {
      for (var i = 0; i < state.walls.length; i++) {
        var w = state.walls[i];
        var x = BX + w.x * CELL;
        var y = BY + w.y * CELL;
        ctx.fillStyle = 'rgba(26,32,50,0.95)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 7) : ctx.rect(x + 3, y + 3, CELL - 6, CELL - 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,160,200,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    function drawTargets(state, t) {
      for (var i = 0; i < state.targets.length; i++) {
        var tg = state.targets[i];
        var x = cw(tg.x);
        var y = ch(tg.y);
        var hue = tg.hue || 190;
        if (tg.lit) {
          var pulse = 1 + Math.sin(t * 5 + i) * 0.12;
          ctx.globalCompositeOperation = 'lighter';
          blob(x, y, CELL * 1.05 * pulse, 'hsla(' + hue + ',100%,65%,0.35)');
          ctx.strokeStyle = 'hsla(' + hue + ',100%,80%,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, CELL * 0.3 * pulse, t * 1.6, t * 1.6 + 4.2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(245,255,255,0.95)';
          ctx.beginPath();
          ctx.arc(x, y, CELL * 0.13, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.strokeStyle = 'rgba(110,150,185,0.45)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(x, y, CELL * 0.28, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = 'rgba(60,90,120,0.35)';
          ctx.beginPath();
          ctx.arc(x, y, CELL * 0.1, 0, TAU);
          ctx.fill();
        }
      }
    }

    function drawEmitters(state, t) {
      for (var i = 0; i < state.emitters.length; i++) {
        var em = state.emitters[i];
        var x = cw(em.x);
        var y = ch(em.y);
        var hue = em.hue || 186;
        var ang = Math.atan2(em.dy, em.dx);
        ctx.globalCompositeOperation = 'lighter';
        blob(x, y, CELL * 0.95 + Math.sin(t * 4 + i) * 3, 'hsla(' + hue + ',100%,65%,0.4)');
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.fillStyle = 'hsla(' + hue + ',100%,82%,0.95)';
        ctx.beginPath();
        ctx.moveTo(CELL * 0.28, 0);
        ctx.lineTo(-CELL * 0.16, -CELL * 0.2);
        ctx.lineTo(-CELL * 0.16, CELL * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(250,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(x, y, CELL * 0.1, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    function drawMirrors(state, t) {
      for (var i = 0; i < state.mirrors.length; i++) {
        var m = state.mirrors[i];
        var x = cw(m.x);
        var y = ch(m.y);
        var d = m.type === '/' ? 1 : -1;
        var ax = x - CELL * 0.34;
        var ay = y + d * CELL * 0.34;
        var bx = x + CELL * 0.34;
        var by = y - d * CELL * 0.34;

        if (m.rot) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(120,230,255,' + (0.10 + 0.05 * Math.sin(t * 3 + i)).toFixed(3) + ')';
          ctx.lineWidth = CELL * 0.6;
          ctx.beginPath();
          ctx.arc(x, y, CELL * 0.4, 0, TAU);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }

        ctx.strokeStyle = m.rot ? 'rgba(150,245,255,0.28)' : 'rgba(120,160,200,0.2)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();

        ctx.strokeStyle = m.rot ? 'rgba(225,255,255,0.95)' : 'rgba(160,190,220,0.6)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();

        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(150,240,255,0.8)';
        ctx.beginPath();
        ctx.arc(ax, ay, 1.6, 0, TAU);
        ctx.arc(bx, by, 1.6, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    function drawBeam(state, t) {
      var segs = state.trace && state.trace.segments ? state.trace.segments : [];
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        var x1 = cw(s.x1);
        var y1 = ch(s.y1);
        var x2 = cw(s.x2);
        var y2 = ch(s.y2);
        var hue = s.hue || 186;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'hsla(' + hue + ',100%,65%,0.10)';
        ctx.lineWidth = CELL * 0.52;
        ctx.stroke();
        ctx.strokeStyle = 'hsla(' + hue + ',100%,72%,0.22)';
        ctx.lineWidth = CELL * 0.2;
        ctx.stroke();
        ctx.strokeStyle = 'hsla(' + hue + ',100%,92%,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 13]);
        ctx.lineDashOffset = -t * 80 - i * 6;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      var hits = state.trace && state.trace.hits ? state.trace.hits : [];
      for (var k = 0; k < hits.length; k++) {
        var h = hits[k];
        blob(cw(h.x), ch(h.y), CELL * 0.34, 'hsla(' + (h.hue || 186) + ',100%,80%,0.6)');
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(cw(h.x), ch(h.y), 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
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

      watchState(state);
      updateParticles(dt);
      drawBackground(t);

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();

      if (state) {
        drawBoard();
        drawWalls(state);
        drawTargets(state, t);
        drawEmitters(state, t);
        drawMirrors(state, t);
        drawBeam(state, t);
        drawParticles();
      }
      ctx.restore();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      var vg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.34, width / 2, height / 2, Math.max(width, height) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);

      if (flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(150,240,255,' + (flash * 0.14).toFixed(3) + ')';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    resize();
    return { resize: resize, draw: draw, screenToWorld: screenToWorld };
  }

  root.PrismRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
