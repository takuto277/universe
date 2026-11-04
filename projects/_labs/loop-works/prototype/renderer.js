/* renderer.js : line-lab prototype canvas */
(function (root) {
  'use strict';

  var BOARD = { l: 48 / 830, r: 790 / 830, t: 744 / 1895, b: 1482 / 1895 };
  var FILES = {
    bg: '../assets/factory-bg.jpg',
    source: '../assets/sprites/source.png',
    dock: '../assets/sprites/dock.png',
    beltH: '../assets/sprites/belt-horizontal.png',
    beltV: '../assets/sprites/belt-vertical.png',
    beltC: '../assets/sprites/belt-corner.png',
    crate: '../assets/sprites/crate-red-square.png'
  };

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var width = 390, height = 844, dpr = 1;
    var images = {};
    var loaded = {};
    var lastT = 0;

    for (var key in FILES) if (Object.prototype.hasOwnProperty.call(FILES, key)) {
      (function (name, src) {
        var img = new Image();
        img.onload = function () { loaded[name] = true; };
        img.src = src;
        images[name] = img;
      })(key, FILES[key]);
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
      var left = width * BOARD.l;
      var right = width * BOARD.r;
      var top = height * BOARD.t;
      var bottom = height * BOARD.b;
      return {
        left: left, top: top,
        width: right - left, height: bottom - top,
        cellW: (right - left) / 7, cellH: (bottom - top) / 7
      };
    }

    function center(g, x, y) {
      return {
        x: g.left + (x + 0.5) * g.cellW,
        y: g.top + (y + 0.5) * g.cellH
      };
    }

    function drawSprite(name, x, y, targetW, targetH, rotation, alpha) {
      var img = images[name];
      if (!img || !loaded[name]) return;
      var scale = Math.min(targetW / img.width, targetH / img.height);
      var w = img.width * scale;
      var h = img.height * scale;
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.translate(x, y);
      if (rotation) ctx.rotate(rotation);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    function drawBackground() {
      if (loaded.bg) ctx.drawImage(images.bg, 0, 0, width, height);
      else { ctx.fillStyle = '#06202a'; ctx.fillRect(0, 0, width, height); }
    }

    function drawPath(state, g, t) {
      if (!state.path || !state.path.length) return;
      var first = center(g, state.path[0].x, state.path[0].y);
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 201, 107, 0.28)';
      ctx.lineWidth = Math.max(5, g.cellW * 0.12);
      ctx.shadowColor = 'rgba(244, 201, 107, 0.45)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (var i = 1; i < state.path.length; i++) {
        var p = center(g, state.path[i].x, state.path[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();

      for (var j = 0; j < state.path.length; j++) {
        var c = state.path[j];
        var p0 = center(g, c.x, c.y);
        if (j === 0) {
          drawSprite('source', p0.x, p0.y - g.cellH * 0.08, g.cellW * 0.9, g.cellH * 1.3, 0);
        } else if (j === state.path.length - 1) {
          drawSprite('dock', p0.x, p0.y - g.cellH * 0.04, g.cellW * 1.0, g.cellH * 1.25, 0);
        } else {
          var prev = state.path[j - 1], next = state.path[j + 1];
          var horizontal = prev.y === c.y && next.y === c.y;
          var vertical = prev.x === c.x && next.x === c.x;
          if (horizontal) {
            drawSprite('beltH', p0.x, p0.y, g.cellW * 1.08, g.cellH * 0.7, 0);
          } else if (vertical) {
            drawSprite('beltV', p0.x, p0.y, g.cellW * 0.55, g.cellH * 1.08, 0);
          } else {
            var opens = {};
            if (prev.x > c.x) opens.right = true;
            if (prev.x < c.x) opens.left = true;
            if (prev.y > c.y) opens.bottom = true;
            if (prev.y < c.y) opens.top = true;
            if (next.x > c.x) opens.right = true;
            if (next.x < c.x) opens.left = true;
            if (next.y > c.y) opens.bottom = true;
            if (next.y < c.y) opens.top = true;
            var rot = 0;
            if (opens.top && opens.right) rot = 0;
            else if (opens.right && opens.bottom) rot = Math.PI / 2;
            else if (opens.bottom && opens.left) rot = Math.PI;
            else if (opens.left && opens.top) rot = -Math.PI / 2;
            drawSprite('beltC', p0.x, p0.y, g.cellW * 1.12, g.cellH * 1.12, rot);
          }
        }
      }
    }

    function drawCrates(state, g) {
      for (var i = 0; i < state.crates.length; i++) {
        var c = state.crates[i];
        var p = state.path;
        var d = c.d;
        if (d >= p.length - 1) d = p.length - 1;
        var idx = Math.max(0, Math.min(p.length - 2, Math.floor(d)));
        var f = Math.max(0, Math.min(1, d - idx));
        var a = p[idx], b = p[idx + 1] || p[idx];
        var x = g.left + (a.x + (b.x - a.x) * f + 0.5) * g.cellW;
        var y = g.top + (a.y + (b.y - a.y) * f + 0.5) * g.cellH;
        drawSprite('crate', x, y - g.cellH * 0.04, g.cellW * 0.72, g.cellH * 0.78, 0);
      }
    }

    function drawHandles(state, g, t) {
      for (var i = 0; i < state.corners.length; i++) {
        var c = state.corners[i];
        var p = center(g, c.x, c.y);
        var active = state.dragging === i;
        if (active && state.dragTarget) {
          p = center(g, state.dragTarget.x, state.dragTarget.y);
        }
        var bad = active && !state.dragValid;
        var pulse = 0.5 + 0.5 * Math.sin(t * 4 + i);
        var r = g.cellW * (0.28 + pulse * 0.035);
        ctx.save();
        ctx.strokeStyle = bad ? 'rgba(238, 112, 108, 0.95)' : 'rgba(244, 201, 107, 0.95)';
        ctx.shadowColor = bad ? 'rgba(238,112,108,0.8)' : 'rgba(244,201,107,0.8)';
        ctx.shadowBlur = 14;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = bad ? 'rgba(238,112,108,0.9)' : 'rgba(244,201,107,0.9)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function draw(state, t) {
      if (!ctx) return;
      var g = layout();
      ctx.clearRect(0, 0, width, height);
      drawBackground();
      if (state.path && state.path.length) {
        drawPath(state, g, t);
        drawCrates(state, g);
      }
      if (state.phase === 'playing') drawHandles(state, g, t);
      lastT = t;
    }

    resize();
    return {
      resize: resize,
      draw: draw,
      layout: layout,
      center: center,
      isLoaded: function (name) { return !!loaded[name]; }
    };
  }

  root.LoopWorksRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
