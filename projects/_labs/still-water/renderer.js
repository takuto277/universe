/* renderer.js : STILL WATER のCanvas描画 */
(function (root) {
  'use strict';

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var width = 390, height = 844, dpr = 1;
    var stars = [];
    var fx = [];
    var seenEvents = 0;
    var lastT = 0;

    for (var i = 0; i < 80; i++) {
      stars.push({
        x: Math.random(), y: Math.random() * 0.32,
        s: 0.5 + Math.random() * 1.7, a: 0.15 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2
      });
    }
    var spots = root.StillWaterEngine ? root.StillWaterEngine.SPOTS : [
      { id: 'reeds', name: 'REEDS', x: -0.66 },
      { id: 'open', name: 'OPEN WATER', x: 0 },
      { id: 'rocks', name: 'DEEP ROCKS', x: 0.66 }
    ];

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

    function line(x1, y1, x2, y2, color, widthVal) {
      ctx.strokeStyle = color;
      ctx.lineWidth = widthVal || 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    function drawSky(t) {
      var sky = ctx.createLinearGradient(0, 0, 0, height * 0.48);
      sky.addColorStop(0, '#07111e');
      sky.addColorStop(0.55, '#132638');
      sky.addColorStop(1, '#4a4a4b');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height * 0.5);

      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = s.a * (0.55 + 0.45 * Math.sin(t * 1.2 + s.phase));
        ctx.fillStyle = 'rgba(210, 238, 248, ' + a.toFixed(3) + ')';
        ctx.fillRect(s.x * width, s.y * height, s.s, s.s);
      }
      ctx.globalCompositeOperation = 'source-over';

      // moon
      var mx = width * 0.78, my = height * 0.16, mr = Math.max(19, width * 0.065);
      var mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4);
      mg.addColorStop(0, 'rgba(255, 235, 190, 0.35)');
      mg.addColorStop(0.28, 'rgba(255, 226, 165, 0.14)');
      mg.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f7e6bd';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(210, 190, 150, 0.2)';
      ctx.beginPath();
      ctx.arc(mx - mr * 0.25, my - mr * 0.2, mr * 0.22, 0, Math.PI * 2);
      ctx.arc(mx + mr * 0.3, my + mr * 0.28, mr * 0.14, 0, Math.PI * 2);
      ctx.fill();

      // far mountains
      var horizon = height * 0.35;
      ctx.fillStyle = '#1b2e3b';
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(0, horizon - height * 0.1);
      ctx.lineTo(width * 0.14, horizon - height * 0.2);
      ctx.lineTo(width * 0.28, horizon - height * 0.11);
      ctx.lineTo(width * 0.44, horizon - height * 0.23);
      ctx.lineTo(width * 0.61, horizon - height * 0.1);
      ctx.lineTo(width * 0.76, horizon - height * 0.17);
      ctx.lineTo(width, horizon - height * 0.07);
      ctx.lineTo(width, horizon);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#10222d';
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(0, horizon - height * 0.04);
      ctx.lineTo(width * 0.19, horizon - height * 0.13);
      ctx.lineTo(width * 0.4, horizon - height * 0.03);
      ctx.lineTo(width * 0.57, horizon - height * 0.12);
      ctx.lineTo(width * 0.8, horizon - height * 0.03);
      ctx.lineTo(width, horizon - height * 0.09);
      ctx.lineTo(width, horizon);
      ctx.closePath();
      ctx.fill();
    }

    function drawWater(t, state) {
      var horizon = height * 0.35;
      var water = ctx.createLinearGradient(0, horizon, 0, height);
      water.addColorStop(0, '#25434b');
      water.addColorStop(0.28, '#102e3a');
      water.addColorStop(0.7, '#071923');
      water.addColorStop(1, '#050d14');
      ctx.fillStyle = water;
      ctx.fillRect(0, horizon, width, height - horizon);

      // moonlight reflection
      var mx = width * 0.78;
      var refl = ctx.createLinearGradient(0, horizon, 0, height * 0.8);
      refl.addColorStop(0, 'rgba(240, 220, 170, 0.16)');
      refl.addColorStop(1, 'rgba(240, 220, 170, 0)');
      ctx.fillStyle = refl;
      ctx.fillRect(mx - width * 0.08, horizon, width * 0.16, height * 0.46);

      for (var i = 0; i < 16; i++) {
        var y = horizon + 18 + i * (height - horizon) / 17;
        var off = Math.sin(t * 0.65 + i * 1.7) * 10;
        ctx.strokeStyle = 'rgba(135, 200, 202, ' + (0.075 - i * 0.0025).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-20, y);
        ctx.quadraticCurveTo(width * 0.5, y + off, width + 20, y - off * 0.3);
        ctx.stroke();
      }

      // reeds at the edge
      ctx.strokeStyle = 'rgba(88, 119, 101, 0.65)';
      ctx.lineWidth = 2;
      for (var r = 0; r < 12; r++) {
        var rx = r < 6 ? 14 + r * 10 : width - 14 - (r - 6) * 10;
        var rh = 38 + (r % 5) * 16;
        ctx.beginPath();
        ctx.moveTo(rx, height - 120);
        ctx.quadraticCurveTo(rx + Math.sin(t + r) * 6, height - 120 - rh * 0.6, rx + Math.sin(t + r) * 10, height - 120 - rh);
        ctx.stroke();
      }
    }

    function drawSpots(state, t) {
      var horizon = height * 0.35;
      for (var i = 0; i < spots.length; i++) {
        var sp = spots[i];
        var x = width * (0.5 + sp.x * 0.32);
        var y = horizon + height * 0.19 + (i % 2) * 12;
        var near = state.phase === 'aim' && Math.abs(state.aimX - sp.x) < 0.18;
        var hot = state.activeSpot === sp.id;
        var a = near ? 0.58 : (hot ? 0.34 : 0.16);
        ctx.strokeStyle = hot ? 'rgba(244, 201, 107, ' + a.toFixed(3) + ')' : 'rgba(128, 221, 205, ' + a.toFixed(3) + ')';
        ctx.lineWidth = hot ? 1.4 : 1;
        for (var r = 0; r < 2; r++) {
          var rr = 10 + r * 10 + Math.sin(t * 1.5 + i) * 3 + (hot ? 4 : 0);
          ctx.beginPath();
          ctx.ellipse(x, y, rr, rr * 0.23, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (hot) {
          var pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
          ctx.strokeStyle = 'rgba(244, 201, 107, ' + (0.12 + pulse * 0.18).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(x, y, 30 + pulse * 12, (30 + pulse * 12) * 0.23, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        drawFish(x + Math.sin(t * 0.9 + i) * 8, y + 22, 0.55 + i * 0.12 + (hot ? 0.08 : 0),
          hot ? '#e8c27a' : (i === 2 ? '#c79b5d' : (i === 0 ? '#7fbfac' : '#8caf8a')), i % 2 === 0, hot ? 0.62 : (near ? 0.48 : 0.25));
      }
    }

    function drawFish(x, y, scale, color, flip, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      var s = scale || 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 18 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-16 * s, 0);
      ctx.lineTo(-28 * s, -9 * s);
      ctx.lineTo(-27 * s, 9 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(9 * s, -2 * s, Math.max(1, 1.5 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawBobber(state, t, bx, by) {
      var dip = state.phase === 'bite' ? Math.sin(t * 24) * 4 + 5 : 0;
      var y = by + dip;
      ctx.strokeStyle = 'rgba(235, 238, 218, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx, y - 14);
      ctx.lineTo(bx, y + 5);
      ctx.stroke();
      ctx.fillStyle = '#e47a62';
      ctx.beginPath();
      ctx.arc(bx, y - 4, 6, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#f3ead2';
      ctx.beginPath();
      ctx.arc(bx, y - 4, 6, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'rgba(250, 236, 205, 0.2)';
      ctx.lineWidth = 1;
      for (var r = 0; r < 3; r++) {
        var rr = 12 + r * 9 + (t * 10 + r * 12) % 15;
        ctx.globalAlpha = Math.max(0, 0.32 - rr / 100);
        ctx.beginPath();
        ctx.ellipse(bx, y + 5, rr, rr * 0.24, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawRodAndLine(state, t, bx, by) {
      var tipX = width * 0.57;
      var tipY = height * 0.6;
      if (state.phase === 'aim') {
        tipX += state.charge * 25;
        tipY -= state.charge * 12;
      }
      if (state.phase === 'reel') {
        tipX -= state.tension * 12;
        tipY += state.tension * 6;
      }
      var baseX = width * 0.78;
      var baseY = height + 15;
      ctx.strokeStyle = '#8d6a43';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(width * 0.7, height * 0.8, tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(222, 190, 124, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(width * 0.7, height * 0.8, tipX, tipY);
      ctx.stroke();

      if (state.phase === 'aim') {
        var targetY = height * 0.35 + 70 + state.charge * height * 0.38;
        var targetX = width * (0.5 + state.aimX * 0.32);
        ctx.save();
        ctx.setLineDash([4, 7]);
        ctx.strokeStyle = 'rgba(114, 201, 189, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.quadraticCurveTo(width * 0.5, (tipY + targetY) * 0.35, targetX, targetY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(232, 194, 122, 0.8)';
        ctx.beginPath();
        ctx.ellipse(targetX, targetY, 20, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
      }

      var tension = state.phase === 'reel' ? state.tension : 0.2;
      ctx.strokeStyle = state.phase === 'reel' && tension > 0.85
        ? 'rgba(236, 128, 111, 0.95)'
        : 'rgba(235, 240, 220, 0.7)';
      ctx.lineWidth = state.phase === 'reel' ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      var cx = (tipX + bx) / 2 + (state.phase === 'reel' ? Math.sin(t * 23) * tension * 12 : 0);
      var cy = (tipY + by) * 0.5 + 18 + (state.phase === 'reel' ? tension * 23 : 0);
      ctx.quadraticCurveTo(cx, cy, bx, by);
      ctx.stroke();
    }

    function drawAimTarget(state) {
      if (state.phase !== 'aim') return;
      var y = height * 0.35 + 70 + state.charge * height * 0.38;
      var x = width * (0.5 + state.aimX * 0.32);
      var hot = null;
      for (var h = 0; h < spots.length; h++) if (spots[h].id === state.activeSpot) hot = spots[h];
      var onHot = hot && Math.abs(state.aimX - hot.x) <= 0.14;
      ctx.save();
      ctx.strokeStyle = onHot ? 'rgba(244, 201, 107, ' + (0.58 + state.charge * 0.32).toFixed(3) + ')' : 'rgba(114, 201, 189, ' + (0.35 + state.charge * 0.4).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 26 + state.charge * 12, 6 + state.charge * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(232, 194, 122, 0.8)';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 194, 122, 0.8)';
      ctx.fill();
      ctx.restore();
    }

    function drawFishUnder(state, t, bx, by) {
      if (!state.fish || (state.phase !== 'reel' && state.phase !== 'bite' && state.phase !== 'caught')) return;
      var f = state.fish;
      var size = f.rarity === 'LEGENDARY' ? 1.35 : (f.rarity === 'RARE' ? 1.15 : 0.9);
      var fight = state.phase === 'reel' ? state.tension : 0.15;
      var speed = f.fight === 'thrash' ? 9.2 : (f.fight === 'darter' ? 5.8 : 4.4);
      var x = bx + Math.sin(t * speed + (f.id.length || 1)) * (10 + fight * 25);
      var y = by + 24 + Math.sin(t * (f.fight === 'diver' ? 2.0 : 3.2)) * (f.fight === 'diver' ? 9 : 5);
      drawFish(x, y, size * (0.85 + fight * 0.2), f.color, true, 0.42 + fight * 0.2);
      // bubbles
      if (state.phase === 'reel') {
        for (var i = 0; i < 3; i++) {
          var a = (t * 0.8 + i * 0.31) % 1;
          ctx.globalAlpha = 0.22 * (1 - a);
          ctx.fillStyle = '#b6e7da';
          ctx.beginPath();
          ctx.arc(bx + Math.sin(t + i) * 16, by - a * 30, 1.5 + i, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    function drawCaught(state, t, bx, by) {
      if (state.phase !== 'caught' || !state.catches.length) return;
      var c = state.catches[state.catches.length - 1];
      var scale = c.rarity === 'LEGENDARY' ? 1.55 : (c.rarity === 'RARE' ? 1.3 : 1);
      var jump = Math.sin(Math.min(1, (t * 2.1) % 1) * Math.PI);
      var y = by - jump * 68;
      drawFish(bx + Math.sin(t * 2) * 10, y, scale, c.color, false, 1);
      ctx.strokeStyle = 'rgba(232, 194, 122, 0.38)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(bx, by + 5, 32 + jump * 18, 8 + jump * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawEscaped(state, t, bx, by) {
      if (state.phase !== 'escaped') return;
      var a = 0.7;
      for (var i = 0; i < 8; i++) {
        var ang = i / 8 * Math.PI * 2;
        var dist = 10 + ((t * 35 + i * 4) % 28);
        ctx.fillStyle = 'rgba(180, 226, 220, ' + (a * (1 - dist / 45)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(bx + Math.cos(ang) * dist, by + Math.sin(ang) * dist * 0.3, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function spawnEffects(state, bx, by) {
      if (state.events.length < seenEvents) seenEvents = 0;
      for (var i = seenEvents; i < state.events.length; i++) {
        var ev = state.events[i];
        var x = ev.type === 'catch' ? bx : bx;
        var y = ev.type === 'catch' ? by : by;
        if (ev.type === 'cast' || ev.type === 'bite' || ev.type === 'hook') {
          if (ev.type === 'cast' && ev.quality === 'perfect') {
            fx.push({ x: width * (0.5 + ev.aimX * 0.32), y: height * 0.35 + 120, vx: 0, vy: -18, life: 1, max: 1, size: 10, color: 'rgba(244, 201, 107,', text: 'PERFECT CAST' });
          }
          if (ev.type === 'hook' && ev.quality === 'perfect') {
            fx.push({ x: x, y: y - 20, vx: 0, vy: -20, life: .9, max: .9, size: 10, color: 'rgba(244, 201, 107,', text: 'PERFECT HOOK' });
          }
          for (var r = 0; r < (ev.type === 'cast' ? 14 : 8); r++) {
            var ang = Math.random() * Math.PI * 2;
            var sp = 15 + Math.random() * 50;
            fx.push({ x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.4, life: .5 + Math.random() * .5, max: 1, size: 1 + Math.random() * 2, color: 'rgba(150, 230, 220, ', text: null });
          }
        } else if (ev.type === 'catch') {
          var c = ev.catch;
          for (var j = 0; j < 24; j++) {
            var a2 = Math.random() * Math.PI * 2;
            var sp2 = 30 + Math.random() * 100;
            fx.push({ x: x, y: y, vx: Math.cos(a2) * sp2, vy: Math.sin(a2) * sp2 - 35, life: .6 + Math.random() * .7, max: 1.3, size: 1.5 + Math.random() * 3, color: c.rarity === 'LEGENDARY' ? 'rgba(244,201,107,' : 'rgba(114,201,189,', text: null });
          }
          fx.push({ x: x, y: y - 20, vx: 0, vy: -22, life: 1, max: 1, size: 13, color: c.rarity === 'LEGENDARY' ? 'rgba(244,201,107,' : 'rgba(232,194,122,', text: '+' + c.points });
        } else if (ev.type === 'escape') {
          for (var k = 0; k < 14; k++) {
            var a3 = Math.random() * Math.PI * 2;
            var sp3 = 15 + Math.random() * 65;
            fx.push({ x: x, y: y, vx: Math.cos(a3) * sp3, vy: Math.sin(a3) * sp3 * 0.4, life: .4 + Math.random() * .4, max: .8, size: 1 + Math.random() * 2, color: 'rgba(168, 204, 205, ', text: null });
          }
          fx.push({ x: x, y: y - 18, vx: 0, vy: -18, life: .8, max: .8, size: 10, color: 'rgba(226,145,120,', text: 'SNAP' });
        }
      }
      seenEvents = state.events.length;
    }

    function drawEffects(dt) {
      for (var i = fx.length - 1; i >= 0; i--) {
        var f = fx[i];
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.text) f.vy += 8 * dt;
        else f.vy += 24 * dt;
        f.life -= dt;
        if (f.life <= 0) { fx.splice(i, 1); continue; }
        var a = Math.max(0, f.life / f.max);
        if (f.text) {
          ctx.fillStyle = f.color + a.toFixed(3) + ')';
          ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(f.text, f.x, f.y);
        } else {
          ctx.fillStyle = f.color + a.toFixed(3) + ')';
          ctx.fillRect(f.x, f.y, f.size, f.size);
        }
      }
    }

    function draw(state, t) {
      if (!ctx) return;
      var dt = lastT ? Math.min(0.05, Math.max(0, t - lastT)) : 0.016;
      lastT = t;
      ctx.clearRect(0, 0, width, height);
      drawSky(t);
      drawWater(t, state);
      drawSpots(state, t);

      var horizon = height * 0.35;
      var power = state.phase === 'aim' ? state.charge : state.power;
      var bx = width * (0.5 + state.aimX * 0.32) + Math.sin(t * 0.7) * 4;
      var by = horizon + 70 + power * height * 0.38;

      if (state.phase === 'aim') drawAimTarget(state);
      drawFishUnder(state, t, bx, by);
      drawBobber(state, t, bx, by);
      drawRodAndLine(state, t, bx, by);
      drawCaught(state, t, bx, by);
      drawEscaped(state, t, bx, by);
      spawnEffects(state, bx, by);
      drawEffects(dt);

      if (state.phase === 'bite') {
        ctx.fillStyle = 'rgba(244, 201, 107, 0.92)';
        ctx.font = '900 28px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', bx, by - 30 + Math.sin(t * 14) * 3);
      }
    }

    resize();
    return { resize: resize, draw: draw };
  }

  root.StillWaterRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
