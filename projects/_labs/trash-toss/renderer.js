/* renderer.js : TRASH TOSS の疑似3D Canvas 描画 */
(function (root) {
  'use strict';

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var width = 390, height = 844, dpr = 1;
    var fx = [];
    var fxTime = 0;
    var seenEvents = 0;

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

    function camera() {
      var cam = { x: 0, y: 1.65, z: -2.8 };
      var look = { x: 0, y: 0.55, z: 3.0 };
      var fx = look.x - cam.x, fy = look.y - cam.y, fz = look.z - cam.z;
      var fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      var forward = { x: fx / fl, y: fy / fl, z: fz / fl };
      var rx = 1 * forward.z - 0 * forward.y;
      var ry = 0 * forward.x - 0 * forward.z;
      var rz = 0 * forward.y - 1 * forward.x;
      var rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
      var right = { x: rx / rl, y: ry / rl, z: rz / rl };
      var ux = forward.y * right.z - forward.z * right.y;
      var uy = forward.z * right.x - forward.x * right.z;
      var uz = forward.x * right.y - forward.y * right.x;
      var ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
      return {
        cam: cam,
        forward: forward,
        right: right,
        up: { x: ux / ul, y: uy / ul, z: uz / ul },
        focal: Math.min(width * 1.60, height * 0.80),
        cx: width / 2,
        cy: height * 0.58
      };
    }

    function project(c, x, y, z) {
      var dx = x - c.cam.x, dy = y - c.cam.y, dz = z - c.cam.z;
      var depth = dx * c.forward.x + dy * c.forward.y + dz * c.forward.z;
      if (depth < 0.25) return null;
      var rx = dx * c.right.x + dy * c.right.y + dz * c.right.z;
      var uy = dx * c.up.x + dy * c.up.y + dz * c.up.z;
      return {
        x: c.cx + c.focal * rx / depth,
        y: c.cy - c.focal * uy / depth,
        scale: c.focal / depth,
        depth: depth
      };
    }

    function poly(c, points, fill, stroke) {
      var first = null;
      ctx.beginPath();
      for (var i = 0; i < points.length; i++) {
        var p = project(c, points[i].x, points[i].y, points[i].z);
        if (!p) return;
        if (!first) { first = p; ctx.moveTo(p.x, p.y); }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }

    function box(c, x0, x1, y0, y1, z0, z1, fill, stroke) {
      var v = [
        { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 },
        { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }
      ];
      var faces = [
        [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]
      ];
      faces.sort(function (a, b) {
        var az = 0, bz = 0;
        for (var i = 0; i < a.length; i++) az += v[a[i]].z;
        for (var j = 0; j < b.length; j++) bz += v[b[j]].z;
        return bz - az;
      });
      for (var f = 0; f < faces.length; f++) {
        var pts = faces[f].map(function (idx) { return v[idx]; });
        poly(c, pts, fill, stroke);
      }
    }

    function drawRoom(c, t) {
      var bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#0b1119');
      bg.addColorStop(0.45, '#17202a');
      bg.addColorStop(1, '#080b11');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // side walls
      poly(c, [{ x: -3.5, y: 0, z: -0.2 }, { x: -3.5, y: 0, z: 7.2 }, { x: -3.5, y: 3.0, z: 7.2 }, { x: -3.5, y: 3.0, z: -0.2 }], '#111b25');
      poly(c, [{ x: 3.5, y: 0, z: -0.2 }, { x: 3.5, y: 0, z: 7.2 }, { x: 3.5, y: 3.0, z: 7.2 }, { x: 3.5, y: 3.0, z: -0.2 }], '#101a23');

      // floor
      poly(c, [{ x: -3.5, y: 0, z: -0.2 }, { x: 3.5, y: 0, z: -0.2 }, { x: 3.5, y: 0, z: 7.2 }, { x: -3.5, y: 0, z: 7.2 }], '#1a1d20');
      for (var fz = 0; fz < 7.3; fz += 0.45) {
        var a = project(c, -3.5, 0.005, fz);
        var b = project(c, 3.5, 0.005, fz);
        if (a && b) {
          ctx.strokeStyle = 'rgba(205, 160, 110, 0.09)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      for (var fx2 = -3.0; fx2 <= 3.0; fx2 += 0.75) {
        var p1 = project(c, fx2, 0.006, 0.2);
        var p2 = project(c, fx2, 0.006, 7.0);
        if (p1 && p2) {
          ctx.strokeStyle = 'rgba(220, 175, 120, 0.065)';
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }
      }

      // rug
      poly(c, [{ x: -2.4, y: 0.012, z: 1.7 }, { x: 2.4, y: 0.012, z: 1.7 }, { x: 2.4, y: 0.012, z: 5.6 }, { x: -2.4, y: 0.012, z: 5.6 }], '#26343b', 'rgba(111, 214, 195, 0.22)');
      poly(c, [{ x: -2.25, y: 0.014, z: 1.85 }, { x: 2.25, y: 0.014, z: 1.85 }, { x: 2.25, y: 0.014, z: 5.45 }, { x: -2.25, y: 0.014, z: 5.45 }], 'rgba(75, 105, 108, 0.3)');

      // back wall
      poly(c, [{ x: -3.5, y: 0, z: 7.2 }, { x: 3.5, y: 0, z: 7.2 }, { x: 3.5, y: 3.0, z: 7.2 }, { x: -3.5, y: 3.0, z: 7.2 }], '#202831', 'rgba(255, 210, 150, 0.08)');
      poly(c, [{ x: -3.5, y: 0, z: 7.18 }, { x: 3.5, y: 0, z: 7.18 }, { x: 3.5, y: 0.14, z: 7.18 }, { x: -3.5, y: 0.14, z: 7.18 }], '#2d2a27');

      // window / night
      poly(c, [{ x: -2.7, y: 1.1, z: 7.16 }, { x: -1.2, y: 1.1, z: 7.16 }, { x: -1.2, y: 2.3, z: 7.16 }, { x: -2.7, y: 2.3, z: 7.16 }], '#0a1525', 'rgba(150, 210, 255, 0.28)');
      ctx.strokeStyle = 'rgba(180, 230, 255, 0.16)';
      ctx.lineWidth = 1;
      var w1 = project(c, -1.95, 1.1, 7.14), w2 = project(c, -1.95, 2.3, 7.14);
      if (w1 && w2) { ctx.beginPath(); ctx.moveTo(w1.x, w1.y); ctx.lineTo(w2.x, w2.y); ctx.stroke(); }

      // sofa at the back
      box(c, -2.1, 2.1, 0, 0.55, 5.8, 6.7, '#3b3330', 'rgba(255, 220, 170, 0.08)');
      box(c, -2.1, 2.1, 0.55, 1.25, 6.35, 6.8, '#4b3d38', 'rgba(255, 220, 170, 0.08)');
      box(c, -2.35, -1.95, 0, 0.75, 5.75, 6.8, '#453934');
      box(c, 1.95, 2.35, 0, 0.75, 5.75, 6.8, '#453934');
      box(c, -1.65, -0.1, 0.58, 0.92, 5.85, 6.5, '#6a5248');
      box(c, 0.1, 1.65, 0.58, 0.92, 5.85, 6.5, '#70564b');

      // TV on wall
      box(c, -0.95, 0.95, 1.2, 2.15, 7.02, 7.08, '#0b0d10', 'rgba(111, 214, 195, 0.3)');
      var tv = project(c, 0, 1.68, 7.0);
      if (tv) {
        var tg = ctx.createRadialGradient(tv.x, tv.y, 0, tv.x, tv.y, 50);
        tg.addColorStop(0, 'rgba(111, 214, 195, 0.14)');
        tg.addColorStop(1, 'rgba(111, 214, 195, 0)');
        ctx.fillStyle = tg;
        ctx.fillRect(tv.x - 55, tv.y - 55, 110, 110);
      }

      // side table + lamp
      box(c, -3.05, -2.3, 0, 0.46, 2.2, 3.2, '#4a3930', 'rgba(255, 210, 150, 0.1)');
      var lampBase = project(c, -2.68, 0.46, 2.7);
      var lampTop = project(c, -2.68, 1.25, 2.7);
      if (lampBase && lampTop) {
        ctx.strokeStyle = 'rgba(220, 180, 120, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lampBase.x, lampBase.y); ctx.lineTo(lampTop.x, lampTop.y); ctx.stroke();
        var lg = ctx.createRadialGradient(lampTop.x, lampTop.y, 0, lampTop.x, lampTop.y, 55);
        lg.addColorStop(0, 'rgba(255, 205, 135, 0.45)');
        lg.addColorStop(0.35, 'rgba(255, 180, 95, 0.16)');
        lg.addColorStop(1, 'rgba(255, 160, 80, 0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(lampTop.x, lampTop.y, 55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f3c07c';
        ctx.beginPath(); ctx.arc(lampTop.x, lampTop.y, Math.max(3, 6 * (lampTop.scale / 80)), 0, Math.PI * 2); ctx.fill();
      }

      // plant
      var plantBase = project(c, 2.55, 0, 6.0);
      if (plantBase) {
        var ps = plantBase.scale;
        ctx.fillStyle = '#59443a';
        ctx.beginPath(); ctx.ellipse(plantBase.x, plantBase.y, 0.28 * ps, 0.35 * ps, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(100, 190, 150, 0.75)';
        ctx.lineWidth = Math.max(1, 0.035 * ps);
        for (var li = 0; li < 6; li++) {
          var la = -Math.PI / 2 + (li - 2.5) * 0.36;
          ctx.beginPath();
          ctx.moveTo(plantBase.x, plantBase.y - 0.25 * ps);
          ctx.quadraticCurveTo(plantBase.x + Math.cos(la) * 0.55 * ps, plantBase.y - 0.9 * ps, plantBase.x + Math.cos(la) * 0.75 * ps, plantBase.y - 1.35 * ps);
          ctx.stroke();
        }
      }

      // warm ambient bloom
      var amb = ctx.createRadialGradient(width * 0.5, height * 0.35, 0, width * 0.5, height * 0.35, width * 0.9);
      amb.addColorStop(0, 'rgba(255, 190, 120, 0.055)');
      amb.addColorStop(1, 'rgba(255, 190, 120, 0)');
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, width, height);
    }

    function drawBin(c, state, t) {
      var b = state.bin;
      var base = project(c, b.x, 0, b.z);
      var top = project(c, b.x, 0.95, b.z);
      if (!base || !top) return;
      var s = base.scale;
      var w = 0.78 * s;
      var bodyTop = top.y + 0.1 * s;
      var bodyBottom = base.y;
      var h = bodyBottom - bodyTop;
      var x = base.x;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.beginPath();
      ctx.ellipse(x, base.y + 0.02 * s, w * 0.75, w * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // legs
      ctx.fillStyle = '#161e25';
      ctx.beginPath();
      ctx.arc(x - w * 0.3, base.y - 0.02 * s, w * 0.08, 0, Math.PI * 2);
      ctx.arc(x + w * 0.3, base.y - 0.02 * s, w * 0.08, 0, Math.PI * 2);
      ctx.fill();

      // body
      var bg = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      bg.addColorStop(0, '#27353d');
      bg.addColorStop(0.45, '#5b7c80');
      bg.addColorStop(1, '#20313a');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.36, bodyTop);
      ctx.lineTo(x + w * 0.36, bodyTop);
      ctx.lineTo(x + w * 0.48, bodyBottom);
      ctx.quadraticCurveTo(x, bodyBottom + w * 0.12, x - w * 0.48, bodyBottom);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 240, 230, 0.38)';
      ctx.lineWidth = Math.max(1, 0.012 * s);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(10, 25, 32, 0.5)';
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * w * 0.24, bodyTop + h * 0.2);
        ctx.lineTo(x + i * w * 0.3, bodyBottom - h * 0.1);
        ctx.stroke();
      }

      // rim / opening
      ctx.fillStyle = '#13242a';
      ctx.beginPath();
      ctx.ellipse(x, bodyTop, w * 0.4, Math.max(2, w * 0.13), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f4c96b';
      ctx.lineWidth = Math.max(1.5, 0.02 * s);
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(244, 201, 107, 0.65)';
      ctx.stroke();
      ctx.shadowBlur = 0;

      // cute face
      ctx.fillStyle = 'rgba(4, 15, 19, 0.9)';
      ctx.beginPath();
      ctx.arc(x - w * 0.15, bodyTop + h * 0.46, Math.max(1.2, w * 0.035), 0, Math.PI * 2);
      ctx.arc(x + w * 0.15, bodyTop + h * 0.46, Math.max(1.2, w * 0.035), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 245, 235, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top.y + 0.04 * s);
      ctx.lineTo(x, base.y - 0.55 * s);
      ctx.stroke();

      // target marker on the opening
      if (state.aimActive) {
        var aim = project(c, state.aim.x, 0.92, state.aim.z);
        if (aim) {
          ctx.strokeStyle = 'rgba(111, 214, 195, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(aim.x, aim.y, 0.42 * aim.scale, 0.42 * aim.scale * 0.32, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(aim.x, aim.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#f4c96b';
          ctx.fill();
        }
      }
    }

    function drawPreview(c, state, t) {
      if (!state.aimActive || !state.preview.length) return;
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.strokeStyle = 'rgba(111, 214, 195, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < state.preview.length; i++) {
        var p = project(c, state.preview[i].x, state.preview[i].y, state.preview[i].z);
        if (!p) continue;
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      var aim = project(c, state.aim.x, 0.92, state.aim.z);
      if (aim) {
        var pulse = 1 + Math.sin(t * 6) * 0.08;
        ctx.strokeStyle = 'rgba(244, 201, 107, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(aim.x, aim.y, 0.12 * aim.scale * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawProjectiles(c, state) {
      for (var i = 0; i < state.projectiles.length; i++) {
        var pr = state.projectiles[i];
        var t = Math.max(0, Math.min(1, pr.t / pr.duration));
        for (var j = 3; j >= 0; j--) {
          var tt = Math.max(0, t - j * 0.028);
          var p = project(c,
            pr.from.x + (pr.to.x - pr.from.x) * tt,
            pr.from.y + (pr.to.y - pr.from.y) * tt + Math.sin(Math.PI * tt) * pr.arc,
            pr.from.z + (pr.to.z - pr.from.z) * tt);
          if (!p) continue;
          var alpha = (1 - j / 4) * 0.4;
          ctx.fillStyle = 'rgba(255, 230, 170, ' + alpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1, 0.045 * p.scale * (1 - j * 0.08)), 0, Math.PI * 2);
          ctx.fill();
        }
        var head = project(c,
          pr.from.x + (pr.to.x - pr.from.x) * t,
          pr.from.y + (pr.to.y - pr.from.y) * t + Math.sin(Math.PI * t) * pr.arc,
          pr.from.z + (pr.to.z - pr.from.z) * t);
        if (head) {
          ctx.fillStyle = '#f4c96b';
          ctx.strokeStyle = '#fff6d2';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(head.x, head.y, Math.max(2, 0.08 * head.scale), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    function drawHand(c, state, t) {
      var h = project(c, 0, 0.95, -1.4);
      if (!h) return;
      var s = h.scale * 0.18;
      ctx.save();
      ctx.globalAlpha = state.aimActive ? 0.82 : 1;
      ctx.fillStyle = 'rgba(66, 45, 35, 0.95)';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y + 0.12 * s, 0.22 * s, 0.32 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d0a078';
      ctx.beginPath();
      ctx.ellipse(h.x - 0.1 * s, h.y - 0.04 * s, 0.1 * s, 0.13 * s, -0.3, 0, Math.PI * 2);
      ctx.ellipse(h.x + 0.1 * s, h.y - 0.04 * s, 0.1 * s, 0.13 * s, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7c9b79';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - 0.2 * s, 0.17 * s, 0.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function spawnEffects(c, state) {
      if (state.events.length < seenEvents) seenEvents = 0;
      for (var i = seenEvents; i < state.events.length; i++) {
        var ev = state.events[i];
        if (ev.type !== 'in' && ev.type !== 'perfect' && ev.type !== 'miss') continue;
        var p = project(c, ev.x || 0, ev.type === 'miss' ? 0.2 : 1.0, ev.z || 3.4);
        if (!p) continue;
        var hue = ev.type === 'perfect' ? 52 : (ev.type === 'miss' ? 345 : 160);
        var count = ev.type === 'perfect' ? 22 : (ev.type === 'miss' ? 6 : 14);
        for (var n = 0; n < count; n++) {
          var a = Math.random() * Math.PI * 2;
          var sp = 20 + Math.random() * 75;
          fx.push({
            x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 25,
            life: 0.45 + Math.random() * 0.45, max: 0.9, size: 1.5 + Math.random() * 3, hue: hue
          });
        }
        if (ev.type === 'perfect' || ev.type === 'in') {
          fx.push({ text: ev.type === 'perfect' ? 'PERFECT!' : '+1', x: p.x, y: p.y - 12, vx: 0, vy: -22, life: 0.8, max: 0.8, size: 12, hue: ev.type === 'perfect' ? 52 : 160 });
        } else if (ev.type === 'miss') {
          fx.push({ text: 'MISS', x: p.x, y: p.y, vx: 0, vy: -16, life: 0.55, max: 0.55, size: 10, hue: 345 });
        }
      }
      seenEvents = state.events.length;
    }

    function drawEffects(c, dt) {
      for (var i = fx.length - 1; i >= 0; i--) {
        var f = fx[i];
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.text) {
          f.vy += 12 * dt;
        } else {
          f.vy += 95 * dt;
        }
        f.life -= dt;
        if (f.life <= 0) { fx.splice(i, 1); continue; }
        var a = Math.max(0, f.life / f.max);
        if (f.text) {
          ctx.font = '900 ' + Math.round(f.size * Math.max(0.7, (height / 844))) + 'px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'hsla(' + f.hue + ', 100%, 76%, ' + a.toFixed(3) + ')';
          ctx.fillText(f.text, f.x, f.y);
        } else {
          ctx.fillStyle = 'hsla(' + f.hue + ', 95%, 70%, ' + a.toFixed(3) + ')';
          ctx.fillRect(f.x - f.size, f.y - f.size, f.size * 2, f.size * 2);
        }
      }
    }

    function draw(state, t) {
      if (!ctx) return;
      var dt = fxTime ? Math.min(0.05, Math.max(0, t - fxTime)) : 0.016;
      fxTime = t;
      var c = camera();
      drawRoom(c, t);
      drawProjectiles(c, state);
      drawBin(c, state, t);
      drawPreview(c, state, t);
      drawHand(c, state, t);
      spawnEffects(c, state);
      drawEffects(c, dt);

      // thrower foreground silhouette
      ctx.fillStyle = '#080709';
      ctx.beginPath();
      ctx.moveTo(-20, height + 10);
      ctx.lineTo(-20, height - 110);
      ctx.quadraticCurveTo(width * 0.22, height - 175, width * 0.38, height + 10);
      ctx.lineTo(width * 0.62, height + 10);
      ctx.quadraticCurveTo(width * 0.78, height - 175, width + 20, height - 110);
      ctx.lineTo(width + 20, height + 10);
      ctx.closePath();
      ctx.fill();

      // cozy vignette
      var vg = ctx.createRadialGradient(width / 2, height * 0.44, width * 0.22, width / 2, height * 0.44, width * 0.85);
      vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vg.addColorStop(1, 'rgba(2, 4, 8, 0.62)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);
    }

    resize();
    return { resize: resize, draw: draw };
  }

  root.TrashTossRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
