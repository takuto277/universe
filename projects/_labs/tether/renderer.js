/* renderer.js : TETHER のCanvas描画 */
(function (root) {
  'use strict';

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var width = 390, height = 844, dpr = 1;
    var stars = [];
    for (var i = 0; i < 80; i++) {
      stars.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.4, a: 0.15 + Math.random() * 0.4 });
    }

    function resize() {
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      width = Math.max(1, (rect && rect.width) || canvas.clientWidth || 390);
      height = Math.max(1, (rect && rect.height) || canvas.clientHeight || 844);
      dpr = Math.min(2, root.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ctx) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
    }

    function draw(state, t) {
      if (!ctx) return;
      var p = state.player;
      var scale = width / 390;
      var camY = Math.max(0, p.y - height / scale * 0.62);
      function sx(x) { return width / 2 + x * scale; }
      function sy(y) { return height - (y - camY) * scale; }
      var hue = 174;

      ctx.globalCompositeOperation = 'source-over';
      var bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#050b14');
      bg.addColorStop(0.55, '#08131c');
      bg.addColorStop(1, '#0b0a0c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      var glow = ctx.createRadialGradient(width / 2, height * 0.45, 0, width / 2, height * 0.45, width * 0.8);
      glow.addColorStop(0, 'hsla(174, 80%, 55%, 0.06)');
      glow.addColorStop(1, 'hsla(174, 80%, 50%, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];
        var yy = (st.y * height * 3 - camY * 0.25) % height;
        if (yy < 0) yy += height;
        ctx.fillStyle = 'rgba(210, 235, 255, ' + st.a.toFixed(3) + ')';
        ctx.fillRect(st.x * width, yy, st.s, st.s);
      }

      ctx.strokeStyle = 'rgba(120, 210, 210, 0.12)';
      ctx.lineWidth = 1;
      for (var gy = Math.floor(camY / 100) * 100; gy < camY + height / scale + 100; gy += 100) {
        if (gy < 0) continue;
        ctx.beginPath();
        ctx.moveTo(sx(-178), sy(gy));
        ctx.lineTo(sx(178), sy(gy));
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120, 210, 210, 0.35)';
      ctx.beginPath();
      ctx.moveTo(sx(-178), 0);
      ctx.lineTo(sx(-178), height);
      ctx.moveTo(sx(178), 0);
      ctx.lineTo(sx(178), height);
      ctx.stroke();

      for (var i = 0; i < state.anchors.length; i++) {
        var a = state.anchors[i];
        var ax = sx(a.x), ay = sy(a.y);
        if (ay < -60 || ay > height + 60) continue;
        var isTether = state.tether && state.tether.anchorId === a.id;
        ctx.strokeStyle = a.used && !isTether ? 'rgba(150, 180, 200, 0.25)' : 'rgba(244, 201, 107, 0.8)';
        ctx.lineWidth = isTether ? 3 : 1.5;
        ctx.beginPath();
        ctx.arc(ax, ay, isTether ? 15 : 12, 0, Math.PI * 2);
        ctx.stroke();
        if (!a.used) {
          ctx.fillStyle = 'rgba(244, 201, 107, 0.85)';
          ctx.beginPath();
          ctx.arc(ax, ay, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (state.tether) {
        var ta = state.anchors[state.tether.anchorId];
        ctx.strokeStyle = 'rgba(244, 201, 107, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx(ta.x), sy(ta.y));
        ctx.lineTo(sx(p.x), sy(p.y));
        ctx.stroke();
      }

      for (var oi = 0; oi < state.obstacles.length; oi++) {
        var o = state.obstacles[oi];
        var ox = sx(o.x), oy = sy(o.y);
        if (oy < -200 || oy > height + 200) continue;
        var dx = Math.cos(o.angle) * o.len * scale;
        var dy = Math.sin(o.angle) * o.len * scale;
        ctx.strokeStyle = 'rgba(235, 240, 250, 0.55)';
        ctx.lineWidth = Math.max(3, o.thickness * scale);
        ctx.beginPath();
        ctx.moveTo(ox - dx, oy - dy);
        ctx.lineTo(ox + dx, oy + dy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(235, 240, 250, 0.6)';
        ctx.beginPath();
        ctx.arc(ox, oy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      var px = sx(p.x), py = sy(p.y);
      var pr = Math.max(3, 9 * scale);
      var pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 4);
      pg.addColorStop(0, 'hsla(' + hue + ', 95%, 72%, 0.55)');
      pg.addColorStop(1, 'hsla(' + hue + ', 90%, 60%, 0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'hsla(' + hue + ', 95%, 72%, 0.95)';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(px - pr * 0.25, py - pr * 0.32, pr * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    resize();
    return { resize: resize, draw: draw };
  }

  root.TetherRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
