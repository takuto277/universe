/* renderer.js : ORBIT WARD のCanvas描画 */
(function (root) {
  'use strict';

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var width = 390, height = 844, dpr = 1;
    var stars = [];
    var dust = [];
    var fx = [];
    var seenEvents = 0;
    var lastT = 0;
    var shake = 0;

    for (var i = 0; i < 110; i++) {
      stars.push({
        x: Math.random(), y: Math.random(),
        s: 0.3 + Math.random() * 1.8,
        a: 0.12 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 1.2
      });
    }
    for (var d = 0; d < 7; d++) {
      dust.push({
        x: Math.random(), y: Math.random(),
        r: 18 + Math.random() * 55,
        hue: Math.random() < 0.5 ? 'teal' : 'violet',
        phase: Math.random() * Math.PI * 2
      });
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

    function layout() {
      var cx = width * 0.5;
      var cy = height * 0.52;
      var scale = Math.min(width * 0.44, height * 0.27);
      return { cx: cx, cy: cy, scale: scale, shield: scale * 0.56, core: scale * 0.13 };
    }

    function line(x1, y1, x2, y2, color, lineWidth) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth || 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    function drawBackground(t) {
      var bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#04050e');
      bg.addColorStop(0.46, '#080b1b');
      bg.addColorStop(1, '#03040a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      for (var i = 0; i < dust.length; i++) {
        var d = dust[i];
        var x = d.x * width + Math.sin(t * 0.05 + d.phase) * 16;
        var y = d.y * height + Math.cos(t * 0.04 + d.phase) * 12;
        var g = ctx.createRadialGradient(x, y, 0, x, y, d.r * 2.2);
        if (d.hue === 'teal') {
          g.addColorStop(0, 'rgba(58, 160, 164, 0.075)');
          g.addColorStop(0.55, 'rgba(41, 84, 121, 0.035)');
        } else {
          g.addColorStop(0, 'rgba(126, 92, 175, 0.07)');
          g.addColorStop(0.55, 'rgba(62, 48, 105, 0.032)');
        }
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, d.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];
        var a = st.a * (0.52 + 0.48 * Math.sin(t * st.speed + st.phase));
        ctx.fillStyle = 'rgba(205, 232, 246, ' + a.toFixed(3) + ')';
        ctx.fillRect(st.x * width, st.y * height, st.s, st.s);
      }
    }

    function drawOrbits(t, pos) {
      var cx = pos.cx, cy = pos.cy, R = pos.shield;
      ctx.save();
      ctx.strokeStyle = 'rgba(110, 194, 205, 0.075)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(166, 139, 228, 0.075)';
      ctx.setLineDash([1, 13]);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(232, 194, 122, 0.09)';
      ctx.lineWidth = 1;
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2 + t * 0.008;
        var r1 = R * 1.48;
        var r2 = R * 1.48 + (i % 3 === 0 ? 7 : 3);
        line(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1,
          cx + Math.cos(a) * r2, cy + Math.sin(a) * r2,
          'rgba(232, 194, 122, 0.2)', 1);
      }
      ctx.restore();
    }

    function drawCore(t, pos) {
      var cx = pos.cx, cy = pos.cy, r = pos.core;
      var pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
      var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 7);
      glow.addColorStop(0, 'rgba(255, 231, 172, 0.55)');
      glow.addColorStop(0.16, 'rgba(244, 193, 105, 0.24)');
      glow.addColorStop(0.5, 'rgba(221, 133, 82, 0.08)');
      glow.addColorStop(1, 'rgba(221, 133, 82, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.12);
      ctx.strokeStyle = 'rgba(255, 236, 181, ' + (0.22 + pulse * 0.18).toFixed(3) + ')';
      ctx.lineWidth = 1;
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * Math.PI * 2;
        var rr = r * (2.2 + pulse * 0.45 + (i % 2) * 0.3);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 1.55, Math.sin(a) * r * 1.55);
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.stroke();
      }
      ctx.restore();

      var body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      body.addColorStop(0, '#fff9db');
      body.addColorStop(0.35, '#ffe6a4');
      body.addColorStop(0.8, '#f1b965');
      body.addColorStop(1, '#c87345');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 251, 221, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawShield(state, t, pos) {
      var cx = pos.cx, cy = pos.cy, R = pos.shield;
      var half = state.shieldHalf;
      var ready = state.pulseCharge >= 1;
      var color = ready ? '244, 201, 107' : '111, 231, 222';

      ctx.save();
      ctx.shadowColor = 'rgba(' + color + ', 0.55)';
      ctx.shadowBlur = 15;
      ctx.strokeStyle = 'rgba(' + color + ', 0.9)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, R, state.shieldAngle - half, state.shieldAngle + half);
      ctx.stroke();

      ctx.shadowBlur = 5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 3, state.shieldAngle - half * 0.92, state.shieldAngle + half * 0.92);
      ctx.stroke();

      ctx.shadowBlur = 0;
      for (var i = 0; i < 7; i++) {
        var a = state.shieldAngle - half + (i + 1) / 8 * half * 2;
        line(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10),
          cx + Math.cos(a) * (R + 9), cy + Math.sin(a) * (R + 9),
          'rgba(' + color + ', 0.18)', 1);
      }

      var tip = state.shieldAngle;
      ctx.fillStyle = 'rgba(' + color + ', 0.95)';
      for (var e = -1; e <= 1; e += 2) {
        var ta = tip + e * half;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ta) * R, cy + Math.sin(ta) * R, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawShard(s, t, pos) {
      var x = pos.cx + Math.cos(s.angle) * s.r * pos.scale;
      var y = pos.cy + Math.sin(s.angle) * s.r * pos.scale;
      var size = Math.max(4, s.size * pos.scale * 1.45);
      var tailR = s.r + (s.kind === 'gold' ? 0.08 : 0.055);
      var tx = pos.cx + Math.cos(s.angle) * tailR * pos.scale;
      var ty = pos.cy + Math.sin(s.angle) * tailR * pos.scale;

      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1, size * 0.18);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = size * 0.7;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.translate(x, y);
      ctx.rotate(s.spin);
      ctx.shadowColor = s.color;
      ctx.shadowBlur = size * 1.6;
      ctx.fillStyle = s.color;

      if (s.kind === 'gold') {
        ctx.beginPath();
        for (var k = 0; k < 8; k++) {
          var a = k / 8 * Math.PI * 2;
          var rr = k % 2 === 0 ? size * 1.25 : size * 0.5;
          if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else if (s.kind === 'heavy') {
        ctx.fillRect(-size, -size, size * 2, size * 2);
        ctx.strokeStyle = 'rgba(20, 12, 20, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-size * 0.58, -size * 0.58, size * 1.16, size * 1.16);
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.78, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.78, 0);
        ctx.closePath();
        ctx.fill();
        if (s.kind === 'splitter') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function spawnFx(state, pos) {
      if (state.events.length < seenEvents) seenEvents = 0;
      var R = pos.shield;
      for (var i = seenEvents; i < state.events.length; i++) {
        var ev = state.events[i];
        if (ev.type === 'block') {
          var a = ev.angle;
          var x = pos.cx + Math.cos(a) * R;
          var y = pos.cy + Math.sin(a) * R;
          var n = ev.perfect ? 16 : 9;
          for (var j = 0; j < n; j++) {
            var ang = a + (Math.random() - 0.5) * 1.2;
            var sp = 35 + Math.random() * (ev.perfect ? 120 : 65);
            fx.push({
              x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
              life: 0.35 + Math.random() * 0.45, max: 0.8,
              size: 1 + Math.random() * 2.2,
              color: ev.perfect ? 'rgba(244,201,107,' : 'rgba(111,231,222,'
            });
          }
          if (ev.perfect) {
            fx.push({
              x: x, y: y - 14, vx: 0, vy: -25, life: 0.85, max: 0.85,
              size: 11, color: 'rgba(244,201,107,', text: 'PERFECT'
            });
          }
        } else if (ev.type === 'miss') {
          shake = 7;
          for (var k = 0; k < 20; k++) {
            var aa = Math.random() * Math.PI * 2;
            var ss = 25 + Math.random() * 120;
            fx.push({
              x: pos.cx, y: pos.cy, vx: Math.cos(aa) * ss, vy: Math.sin(aa) * ss,
              life: 0.4 + Math.random() * 0.5, max: 0.9,
              size: 1 + Math.random() * 3, color: 'rgba(238,112,108,'
            });
          }
          fx.push({
            x: pos.cx, y: pos.cy - 24, vx: 0, vy: -22, life: 0.9, max: 0.9,
            size: 13, color: 'rgba(238,112,108,', text: 'CORE HIT'
          });
        } else if (ev.type === 'reflect') {
          var fromX = pos.cx + Math.cos(ev.from) * pos.shield;
          var fromY = pos.cy + Math.sin(ev.from) * pos.shield;
          var toX = pos.cx + Math.cos(ev.angle) * (ev.targetR || 0.9) * pos.scale;
          var toY = pos.cy + Math.sin(ev.angle) * (ev.targetR || 0.9) * pos.scale;
          fx.push({
            x1: fromX, y1: fromY, x2: toX, y2: toY, line: true,
            life: 0.25, max: 0.25, color: 'rgba(244,201,107,'
          });
          for (var ri = 0; ri < 8; ri++) {
            var ra = Math.random() * Math.PI * 2;
            var rv = 20 + Math.random() * 70;
            fx.push({
              x: toX, y: toY, vx: Math.cos(ra) * rv, vy: Math.sin(ra) * rv,
              life: 0.3 + Math.random() * 0.3, max: 0.6,
              size: 1 + Math.random() * 2, color: 'rgba(244,201,107,'
            });
          }
        } else if (ev.type === 'surge') {
          shake = 4;
          fx.push({
            x: pos.cx, y: pos.cy - pos.scale * 0.92, vx: 0, vy: -10,
            life: 1, max: 1, size: 16, color: 'rgba(199,149,255,', text: 'SURGE'
          });
        } else if (ev.type === 'pulse') {
          fx.push({
            x: pos.cx, y: pos.cy - 30, vx: 0, vy: -30,
            life: 0.9, max: 0.9, size: 17, color: 'rgba(244,201,107,', text: 'PULSE'
          });
        } else if (ev.type === 'split') {
          for (var m = 0; m < 12; m++) {
            var sa = ev.angle + (Math.random() - 0.5) * 1.1;
            var sv = 20 + Math.random() * 55;
            fx.push({
              x: pos.cx + Math.cos(ev.angle) * 0.74 * pos.scale,
              y: pos.cy + Math.sin(ev.angle) * 0.74 * pos.scale,
              vx: Math.cos(sa) * sv, vy: Math.sin(sa) * sv,
              life: 0.3 + Math.random() * 0.3, max: 0.6,
              size: 1 + Math.random() * 1.8, color: 'rgba(199,149,255,'
            });
          }
        }
      }
      seenEvents = state.events.length;
    }

    function drawFx(dt) {
      for (var i = fx.length - 1; i >= 0; i--) {
        var f = fx[i];
        f.life -= dt;
        if (f.life <= 0) { fx.splice(i, 1); continue; }
        var a = Math.max(0, f.life / f.max);
        if (f.line) {
          ctx.strokeStyle = f.color + a.toFixed(3) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(f.x1, f.y1);
          ctx.lineTo(f.x2, f.y2);
          ctx.stroke();
          continue;
        }
        if (f.ring) {
          var progress = 1 - a;
          ctx.strokeStyle = f.color + (a * 0.8).toFixed(3) + ')';
          ctx.lineWidth = 3 * a + 1;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 20 + progress * 260, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= 0.98;
        f.vy *= 0.98;
        if (f.text) {
          ctx.fillStyle = f.color + a.toFixed(3) + ')';
          ctx.font = '800 ' + f.size + 'px ui-sans-serif, system-ui, sans-serif';
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
      var pos = layout();
      ctx.clearRect(0, 0, width, height);
      drawBackground(t);

      ctx.save();
      if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        shake = Math.max(0, shake - 24 * dt);
      }
      drawOrbits(t, pos);

      if (state.shards) {
        for (var i = 0; i < state.shards.length; i++) drawShard(state.shards[i], t, pos);
      }
      drawCore(t, pos);
      if (state.phase === 'playing' || state.phase === 'start') drawShield(state, t, pos);
      spawnFx(state, pos);
      drawFx(dt);
      ctx.restore();

      if (state.pulseTimer > 0) {
        var progress = 1 - state.pulseTimer / 0.7;
        ctx.strokeStyle = 'rgba(244, 201, 107, ' + (0.55 * (1 - progress)).toFixed(3) + ')';
        ctx.lineWidth = 4 + (1 - progress) * 6;
        ctx.beginPath();
        ctx.arc(pos.cx, pos.cy, 20 + progress * Math.max(width, height) * 0.8, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (state.phase === 'playing' && state.combo >= 4) {
        ctx.fillStyle = 'rgba(244, 201, 107, 0.86)';
        ctx.font = '800 14px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x' + state.combo + ' CHAIN', pos.cx, pos.cy + pos.scale * 1.02);
      }
    }

    resize();
    return { resize: resize, draw: draw };
  }

  root.OrbitWardRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
