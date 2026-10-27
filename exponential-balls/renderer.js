/* renderer.js : 倍々のCanvas描画（ボールの分裂・波紋・光の軌跡） */
(function (root) {
  'use strict';

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var width = 390;
    var height = 844;
    var dpr = 1;
    var balls = [];
    var waves = [];
    var ripples = [];
    var flash = 0;
    var beatPulse = 0;
    var radius = 30;
    var lastCycle = 0;
    var lastBar = 0;
    var lastBeat = 0;
    var hueBase = 188;

    function rnd(a, b) { return a + Math.random() * (b - a); }

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
      return {
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        hue: hue == null ? hueBase : hue
      };
    }

    function reset(state) {
      var hue = state && state.root ? state.root.hue : 188;
      hueBase = hue;
      radius = radiusFor(1);
      balls = [newBall(width / 2, height / 2, rnd(-70, 70), rnd(-70, 70), hue)];
      waves = [];
      ripples = [];
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
        var angle = Math.atan2(b.vy, b.vx) + rnd(-0.7, 0.7);
        var speed = Math.max(35, Math.hypot(b.vx, b.vy));
        var half = speed * 0.55;
        var hue2 = (b.hue + rnd(-14, 14) + 360) % 360;
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
        lastCycle = state.cycle;
        lastBar = state.bar;
        lastBeat = state.beat;
        return;
      }
      if (state && state.split) {
        split(state);
      }
      var target = state ? state.count : balls.length;
      var guard = 0;
      while (balls.length < target && guard++ < 12) split(state);
      while (balls.length > target) balls.pop();
      if (!balls.length) reset(state);
      if (state && state.cycle !== lastCycle) {
        lastCycle = state.cycle;
        flash = 1;
        waves.push({ x: width / 2, y: height / 2, r: 12, speed: 320, life: 1, hue: hueBase, width: 3 });
      }
      if (state && state.bar !== lastBar) {
        lastBar = state.bar;
        waves.push({ x: width / 2, y: height / 2, r: 8, speed: 220, life: 1, hue: hueBase, width: 2 });
      }
      if (state && state.beat !== lastBeat) {
        lastBeat = state.beat;
        beatPulse = 1;
      }
    }

    function update(dt, state) {
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
      dt = Math.min(0.05, dt);
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
      for (var r = ripples.length - 1; r >= 0; r--) {
        var ripple = ripples[r];
        ripple.r += ripple.speed * dt;
        ripple.life -= dt * 1.5;
        if (ripple.life <= 0) ripples.splice(r, 1);
      }
      flash = Math.max(0, flash - dt * 2.6);
      beatPulse = Math.max(0, beatPulse - dt * 2.4);
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
      ripples.push({ x: x, y: y, r: 6, speed: 260, life: 1, hue: hueBase });
    }

    function draw(state, t) {
      if (!ctx) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(4, 7, 12, 0.32)';
      ctx.fillRect(0, 0, width, height);

      var hue = (state && state.root ? state.root.hue : 188) + (state ? state.bar * 7 : 0);
      var glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.62);
      glow.addColorStop(0, 'hsla(' + hue + ', 80%, 58%, ' + (0.012 + beatPulse * 0.018).toFixed(3) + ')');
      glow.addColorStop(1, 'hsla(' + hue + ', 80%, 50%, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      var r = radiusFor(state ? state.count : balls.length);
      for (var i = 0; i < balls.length; i++) {
        var b = balls[i];
        ctx.fillStyle = 'hsla(' + (b.hue % 360) + ', 86%, 62%, 0.78)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var w = 0; w < waves.length; w++) {
        var wave = waves[w];
        ctx.strokeStyle = 'hsla(' + wave.hue + ', 85%, 65%, ' + Math.max(0, wave.life * 0.5).toFixed(3) + ')';
        ctx.lineWidth = wave.width || 2;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (var p = 0; p < ripples.length; p++) {
        var ripple = ripples[p];
        ctx.strokeStyle = 'hsla(178, 90%, 72%, ' + Math.max(0, ripple.life * 0.7).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
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

    resize();
    return {
      resize: resize,
      sync: sync,
      update: update,
      draw: draw,
      tap: tap,
      state: function () { return balls; }
    };
  }

  root.ExponentialRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
