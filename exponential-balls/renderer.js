/* renderer.js : BLOOM のCanvas描画（AUTOの分裂・FRAMEのフレーム回収） */
(function (root) {
  'use strict';

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var width = 390;
    var height = 844;
    var dpr = 1;
    var balls = [];
    var waves = [];
    var flash = 0;
    var beatPulse = 0;
    var radius = 30;
    var lastCycle = 0;
    var lastBar = 0;
    var lastBeat = 0;
    var hueBase = 188;

    function resize() {
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      var w = (rect && rect.width) || canvas.clientWidth || 390;
      var h = (rect && rect.height) || canvas.clientHeight || 844;
      dpr = Math.min(2, (root.devicePixelRatio || 1));
      width = Math.max(1, w);
      height = Math.max(1, h);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
      clampBalls();
    }

    function clampBalls() {
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        b.x = Math.max(radius, Math.min(width - radius, b.x));
        b.y = Math.max(radius, Math.min(height - radius, b.y));
      }
    }

    function newBall(x, y, vx, vy, hue) {
      return { x: x, y: y, vx: vx, vy: vy, hue: hue == null ? hueBase : hue };
    }

    function reset(state) {
      var hue = state && state.root ? state.root.hue : 188;
      hueBase = hue;
      radius = radiusFor(1);
      balls = [newBall(width / 2, height / 2, -70 + Math.random() * 140, -70 + Math.random() * 140, hue)];
      waves = [];
      flash = 1;
      beatPulse = 1;
      waves.push({ x: width / 2, y: height / 2, r: 10, speed: 280, life: 1, hue: hue, width: 3 });
    }

    function radiusFor(count) {
      return Math.max(1.15, 32 * Math.pow(Math.max(1, count), -0.28));
    }

    function split(state) {
      var next = [];
      var hue = state && state.root ? state.root.hue : hueBase;
      hueBase = hue + (state ? state.bar * 7 : 0);
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        var angle = Math.atan2(b.vy, b.vx) + (-0.7 + Math.random() * 1.4);
        var speed = Math.max(35, Math.hypot(b.vx, b.vy));
        var half = speed * 0.55;
        var hue2 = (b.hue + (-14 + Math.random() * 28) + 360) % 360;
        next.push(newBall(
          b.x + Math.cos(angle) * radius * 0.5,
          b.y + Math.sin(angle) * radius * 0.5,
          b.vx * 0.72 + Math.cos(angle) * half,
          b.vy * 0.72 + Math.sin(angle) * half,
          b.hue
        ));
        next.push(newBall(
          b.x - Math.cos(angle) * radius * 0.5,
          b.y - Math.sin(angle) * radius * 0.5,
          b.vx * 0.72 - Math.cos(angle) * half,
          b.vy * 0.72 - Math.sin(angle) * half,
          hue2
        ));
      }
      balls = next;
    }

    function sync(state) {
      hueBase = state && state.root ? state.root.hue + state.bar * 7 : hueBase;
      radius = radiusFor(state ? state.count : balls.length);
      if (state && state.reset) {
        reset(state);
        return;
      }
      if (state && state.split) split(state);
      var target = state ? state.count : balls.length;
      var guard = 0;
      while (balls.length < target && guard++ < 12) split(state);
      while (balls.length > target) balls.pop();
      if (!balls.length) reset(state);
    }

    function clear() {
      balls = [];
      waves = [];
      flash = 0;
      beatPulse = 0;
    }

    function pulse(state) {
      if (!state) return;
      if (state.cycle !== lastCycle) {
        lastCycle = state.cycle;
        flash = 1;
        waves.push({ x: width / 2, y: height / 2, r: 12, speed: 320, life: 1, hue: state.root.hue, width: 3 });
      }
      if (state.bar !== lastBar) {
        lastBar = state.bar;
        waves.push({ x: width / 2, y: height / 2, r: 8, speed: 220, life: 1, hue: state.root.hue, width: 2 });
      }
      if (state.beat !== lastBeat) {
        lastBeat = state.beat;
        beatPulse = 1;
      }
    }

    function update(dt, state) {
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
      pulse(state);
      radius = radiusFor(state ? state.count : balls.length);
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < radius) { b.x = radius; b.vx = Math.abs(b.vx) * 0.92; }
        if (b.x > width - radius) { b.x = width - radius; b.vx = -Math.abs(b.vx) * 0.92; }
        if (b.y < radius) { b.y = radius; b.vy = Math.abs(b.vy) * 0.92; }
        if (b.y > height - radius) { b.y = height - radius; b.vy = -Math.abs(b.vy) * 0.92; }
      }
      for (var w = waves.length - 1; w >= 0; w--) {
        var wave = waves[w];
        wave.r += wave.speed * dt;
        wave.life -= dt * 1.35;
        wave.speed *= 0.985;
        if (wave.life <= 0) waves.splice(w, 1);
      }
      flash = Math.max(0, flash - dt * 2.6);
      beatPulse = Math.max(0, beatPulse - dt * 2.4);
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
    }

    function drawWaves(hue) {
      for (var w = 0; w < waves.length; w++) {
        var wave = waves[w];
        ctx.strokeStyle = 'hsla(' + wave.hue + ', 85%, 65%, ' + Math.max(0, wave.life * 0.5).toFixed(3) + ')';
        ctx.lineWidth = wave.width || 2;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (beatPulse > 0) {
        ctx.strokeStyle = 'hsla(' + hue + ', 90%, 72%, ' + (beatPulse * 0.22).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 35 + (1 - beatPulse) * 90, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (flash > 0) {
        ctx.fillStyle = 'hsla(175, 90%, 78%, ' + (flash * 0.10).toFixed(3) + ')';
        ctx.fillRect(0, 0, width, height);
      }
    }

    function background(hue) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(4, 7, 12, 0.32)';
      ctx.fillRect(0, 0, width, height);
      var glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.62);
      glow.addColorStop(0, 'hsla(' + hue + ', 80%, 58%, ' + (0.012 + beatPulse * 0.018).toFixed(3) + ')');
      glow.addColorStop(1, 'hsla(' + hue + ', 80%, 50%, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
    }

    function ballColor(b) {
      var depth = Math.min(8, b.depth || 0);
      var light = Math.max(30, 64 - depth * 4.5);
      var sat = Math.min(100, 82 + depth * 4);
      return 'hsla(' + (b.hue % 360) + ', ' + sat + '%, ' + light + '%, 0.82)';
    }

    function tap(x, y) {
      var radiusSq = 120 * 120;
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        var dx = b.x - x;
        var dy = b.y - y;
        var d2 = dx * dx + dy * dy;
        if (d2 > radiusSq) continue;
        var d = Math.sqrt(d2) || 1;
        var force = 260 * (1 - d / 120);
        b.vx += (dx / d) * force;
        b.vy += (dy / d) * force;
      }
      waves.push({ x: x, y: y, r: 6, speed: 260, life: 1, hue: hueBase, width: 2 });
    }

    function draw(state, t) {
      if (!ctx) return;
      var hue = (state && state.root ? state.root.hue : 188) + (state ? state.bar * 7 : 0);
      background(hue);
      var r = radiusFor(state ? state.count : balls.length);
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        ctx.fillStyle = ballColor(b);
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      drawWaves(hue);
    }

    function drawFrame(state, t) {
      if (!ctx || !state || !state.line || !state.field) return;
      var sx = width / state.field.w;
      var sy = height / state.field.h;
      var hue = state.root ? state.root.hue : 188;
      background(hue);

      var r = Math.max(1.2, radiusFor(state.count) * Math.min(sx, sy));
      for (var i = 0; i < state.balls.length; i++) {
        var b = state.balls[i];
        ctx.fillStyle = ballColor(b);
        ctx.beginPath();
        ctx.arc(b.x * sx, b.y * sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      var lx = state.line.x * sx;
      var ly = state.line.y * sy;
      var lw = state.line.w * sx;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'hsla(' + hue + ', 90%, 70%, ' + (0.12 + beatPulse * 0.1).toFixed(3) + ')';
      ctx.lineWidth = 10 + beatPulse * 8;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + lw, ly);
      ctx.stroke();
      ctx.strokeStyle = 'hsla(' + hue + ', 90%, 74%, ' + (0.55 + beatPulse * 0.35).toFixed(3) + ')';
      ctx.lineWidth = 2 + beatPulse * 2;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + lw, ly);
      ctx.stroke();

      for (var e = 0; e < state.captureEvents.length; e++) {
        var event = state.captureEvents[e];
        if (event.reset) {
          flash = 1;
          waves.push({ x: event.x * sx, y: event.y * sy, r: 20, speed: 420, life: 1, hue: event.hue, width: 4 });
        } else {
          waves.push({ x: event.x * sx, y: event.y * sy, r: 6, speed: 200, life: 1, hue: event.hue, width: 2 });
        }
      }
      drawWaves(hue);
    }

    resize();
    return {
      resize: resize,
      sync: sync,
      update: update,
      draw: draw,
      drawFrame: drawFrame,
      tap: tap,
      clear: clear,
      state: function () { return balls; }
    };
  }

  root.ExponentialRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
