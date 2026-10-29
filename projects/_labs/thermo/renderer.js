/* renderer.js : THERMO の Canvas 描画 */
(function (root) {
  'use strict';

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var width = 390, height = 844, dpr = 1;

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

    function draw(state, t) {
      if (!ctx) return;
      var rows = state.grid.length;
      var cols = state.grid[0].length;
      var top = Math.max(154, height * 0.18);
      var bottom = height - Math.max(154, height * 0.19);
      var cell = Math.floor(Math.min((width - 24) / cols, (bottom - top) / rows, 38));
      var gridW = cell * cols;
      var gridH = cell * rows;
      var ox = Math.round((width - gridW) / 2);
      var oy = Math.round(top + (bottom - top - gridH) / 2);

      function sx(x) { return ox + x * cell; }
      function sy(y) { return oy + y * cell; }

      var bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#050b14');
      bg.addColorStop(0.55, '#07131b');
      bg.addColorStop(1, '#0b0a0c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      var glow = ctx.createRadialGradient(width / 2, oy + gridH * 0.45, 0, width / 2, oy + gridH * 0.45, width * 0.7);
      glow.addColorStop(0, 'rgba(111, 214, 195, 0.055)');
      glow.addColorStop(1, 'rgba(111, 214, 195, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // board shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.fillRect(ox - 5, oy - 5, gridW + 10, gridH + 10);

      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var tile = state.grid[y][x];
          var px = sx(x), py = sy(y);
          var inset = Math.max(1, Math.round(cell * 0.045));
          var inner = cell - inset * 2;

          if (tile === '#') {
            ctx.fillStyle = '#101f2b';
            ctx.fillRect(px + inset, py + inset, inner, inner);
            ctx.fillStyle = 'rgba(145, 190, 210, 0.08)';
            ctx.fillRect(px + inset, py + inset, inner, Math.max(1, inner * 0.12));
            continue;
          }

          ctx.fillStyle = (x + y) % 2 ? '#08151e' : '#091821';
          ctx.fillRect(px + inset, py + inset, inner, inner);

          if (tile === '~') {
            var wg = ctx.createLinearGradient(px, py, px, py + cell);
            wg.addColorStop(0, 'rgba(55, 150, 190, 0.5)');
            wg.addColorStop(1, 'rgba(20, 75, 112, 0.55)');
            ctx.fillStyle = wg;
            ctx.fillRect(px + inset + 1, py + inset + 1, inner - 2, inner - 2);
            ctx.strokeStyle = 'rgba(130, 225, 245, 0.38)';
            ctx.lineWidth = 1;
            for (var wi = 0; wi < 2; wi++) {
              var wave = py + cell * (0.38 + wi * 0.25) + Math.sin(t * 2 + x + wi) * 2;
              ctx.beginPath();
              ctx.moveTo(px + cell * 0.2, wave);
              ctx.quadraticCurveTo(px + cell * 0.5, wave - 4, px + cell * 0.8, wave);
              ctx.stroke();
            }
          } else if (tile === '*') {
            var ig = ctx.createLinearGradient(px, py, px + cell, py + cell);
            ig.addColorStop(0, 'rgba(175, 245, 255, 0.52)');
            ig.addColorStop(0.55, 'rgba(95, 205, 225, 0.32)');
            ig.addColorStop(1, 'rgba(35, 110, 145, 0.44)');
            ctx.fillStyle = ig;
            ctx.fillRect(px + inset + 1, py + inset + 1, inner - 2, inner - 2);
            ctx.strokeStyle = 'rgba(215, 255, 255, 0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px + cell * 0.28, py + cell * 0.64);
            ctx.lineTo(px + cell * 0.5, py + cell * 0.3);
            ctx.lineTo(px + cell * 0.72, py + cell * 0.58);
            ctx.stroke();
          } else if (tile === 'E') {
            var eg = ctx.createRadialGradient(px + cell / 2, py + cell / 2, 1, px + cell / 2, py + cell / 2, cell * 0.7);
            eg.addColorStop(0, 'rgba(255, 175, 74, 0.9)');
            eg.addColorStop(0.4, 'rgba(220, 92, 38, 0.38)');
            eg.addColorStop(1, 'rgba(220, 92, 38, 0)');
            ctx.fillStyle = eg;
            ctx.fillRect(px, py, cell, cell);
            ctx.fillStyle = '#ffb452';
            ctx.beginPath();
            ctx.arc(px + cell / 2, py + cell / 2, Math.max(2, cell * 0.15), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 230, 160, 0.9)';
            ctx.beginPath();
            ctx.arc(px + cell / 2, py + cell / 2, Math.max(1, cell * 0.06), 0, Math.PI * 2);
            ctx.fill();
          } else if (tile === 'D') {
            ctx.fillStyle = '#233b47';
            ctx.fillRect(px + inset + 1, py + inset + 1, inner - 2, inner - 2);
            ctx.strokeStyle = 'rgba(244, 201, 107, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + cell * 0.22, py + cell * 0.25, cell * 0.56, cell * 0.5);
            for (var bi = 0; bi < 3; bi++) {
              ctx.beginPath();
              ctx.moveTo(px + cell * (0.32 + bi * 0.12), py + cell * 0.34);
              ctx.lineTo(px + cell * (0.32 + bi * 0.12), py + cell * 0.66);
              ctx.stroke();
            }
          } else if (tile === 'O') {
            ctx.strokeStyle = 'rgba(111, 214, 195, 0.38)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + cell * 0.2, py + cell * 0.25, cell * 0.6, cell * 0.5);
          } else if (tile === 'X') {
            var xg = ctx.createRadialGradient(px + cell / 2, py + cell / 2, 0, px + cell / 2, py + cell / 2, cell * 0.65);
            xg.addColorStop(0, 'rgba(111, 214, 195, 0.28)');
            xg.addColorStop(1, 'rgba(111, 214, 195, 0)');
            ctx.fillStyle = xg;
            ctx.fillRect(px, py, cell, cell);
            ctx.strokeStyle = '#6fd6c3';
            ctx.lineWidth = 2;
            var m = cell * 0.32;
            ctx.beginPath();
            ctx.moveTo(px + m, py + cell / 2);
            ctx.lineTo(px + cell / 2, py + cell - m);
            ctx.lineTo(px + cell - m, py + cell / 2);
            ctx.lineTo(px + cell / 2, py + m);
            ctx.closePath();
            ctx.stroke();
          }

          ctx.strokeStyle = 'rgba(120, 210, 210, 0.07)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, inner - 1, inner - 1);
        }
      }

      // target brackets
      var target = state.target;
      if (target && target.kind) {
        var tx = sx(target.x), ty = sy(target.y), b = Math.max(4, cell * 0.16);
        ctx.strokeStyle = target.kind === 'absorb' ? 'rgba(255, 190, 90, 0.95)' : 'rgba(130, 230, 225, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx + b, ty + 2); ctx.lineTo(tx + 2, ty + 2); ctx.lineTo(tx + 2, ty + b);
        ctx.moveTo(tx + cell - b, ty + 2); ctx.lineTo(tx + cell - 2, ty + 2); ctx.lineTo(tx + cell - 2, ty + b);
        ctx.moveTo(tx + 2, ty + cell - b); ctx.lineTo(tx + 2, ty + cell - 2); ctx.lineTo(tx + b, ty + cell - 2);
        ctx.moveTo(tx + cell - 2, ty + cell - b); ctx.lineTo(tx + cell - 2, ty + cell - 2); ctx.lineTo(tx + cell - b, ty + cell - 2);
        ctx.stroke();
      }

      // player
      var p = state.player;
      var px = sx(p.x) + cell / 2;
      var py = sy(p.y) + cell / 2;
      var hot = Math.max(0, Math.min(1, (state.temp - 20) / 60));
      var hue = 194 - hot * 180;
      var pr = Math.max(4, cell * 0.19);
      var pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 3.4);
      pg.addColorStop(0, 'hsla(' + hue + ', 95%, 70%, 0.7)');
      pg.addColorStop(1, 'hsla(' + hue + ', 95%, 60%, 0)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'hsla(' + hue + ', 95%, 70%, 0.98)';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(px - pr * 0.3, py - pr * 0.35, pr * 0.3, 0, Math.PI * 2);
      ctx.fill();
      var f = p.facing === 'U' ? [0, -1] : p.facing === 'R' ? [1, 0] : p.facing === 'L' ? [-1, 0] : [0, 1];
      ctx.strokeStyle = 'hsla(' + hue + ', 95%, 82%, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + f[0] * pr * 0.7, py + f[1] * pr * 0.7);
      ctx.lineTo(px + f[0] * pr * 1.4, py + f[1] * pr * 1.4);
      ctx.stroke();
    }

    resize();
    return { resize: resize, draw: draw };
  }

  root.ThermoRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
