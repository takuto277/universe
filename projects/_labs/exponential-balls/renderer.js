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
    var raceTrails = {};
    var particles = [];
    var camYaw = 0.55;
    var camElev = 0.5;
    var camFocusNorm = 0;
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
      raceTrails = {};
      particles = [];
      camYaw = 0.55;
      camElev = 0.5;
      camFocusNorm = 0;
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
      if (state && state.mode === 'race' && state.race) {
        for (var rb = 0; rb < state.race.balls.length; rb++) {
          var ball = state.race.balls[rb];
          var trail = raceTrails[ball.id] || (raceTrails[ball.id] = { hue: ball.hue, points: [] });
          trail.hue = ball.hue;
          trail.points.push({ x: ball.x, y: ball.y, life: 1 });
          if (trail.points.length > 9) trail.points.shift();
        }
      }
      for (var key in raceTrails) {
        var pts = raceTrails[key].points;
        for (var pt = pts.length - 1; pt >= 0; pt--) {
          pts[pt].life -= dt * 3.5;
          if (pts[pt].life <= 0) pts.splice(pt, 1);
        }
        if (!pts.length) delete raceTrails[key];
      }
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


    function orbit(dx, dy) {
      camYaw -= dx * 0.006;
      camElev = Math.max(0.06, Math.min(1.4, camElev + dy * 0.004));
    }

    function setFocusNorm(norm) {
      camFocusNorm = Math.max(0, Math.min(1, norm));
    }

    function cameraState() {
      return { yaw: camYaw, elev: camElev, focusNorm: camFocusNorm };
    }

    function spawnBurst(x, y, hue, count, power) {
      for (var i = 0; i < count; i++) {
        var a = Math.random() * Math.PI * 2;
        var v = power * (0.35 + Math.random() * 0.9);
        particles.push({
          x: x, y: y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.6 + Math.random() * 0.7,
          hue: hue + (Math.random() * 30 - 15),
          size: 1.5 + Math.random() * 3
        });
      }
    }

    function drawRace(state, t) {
      if (!ctx || !state || !state.race || !state.field) return;
      var race = state.race;
      var hue = state.root ? state.root.hue : 188;
      var sx = width / state.field.w;
      var sy = height / state.field.h;
      function X(x) { return x * sx; }
      function Y(y) { return y * sy; }
      background(hue);

      for (var ev = 0; ev < race.events.length; ev++) {
        var evt = race.events[ev];
        var ex = X(evt.x);
        var ey = Y(evt.y);
        if (evt.type === 'bumper') {
          flash = Math.max(flash, 0.16);
          spawnBurst(ex, ey, evt.hue, 5, 120);
          waves.push({ x: ex, y: ey, r: 4, speed: 220, life: 1, hue: evt.hue, width: 2 });
        } else if (evt.type === 'spinner') {
          spawnBurst(ex, ey, evt.hue, 3, 90);
          waves.push({ x: ex, y: ey, r: 3, speed: 180, life: 1, hue: evt.hue, width: 1.5 });
        } else if (evt.type === 'boost') {
          flash = Math.max(flash, 0.2);
          spawnBurst(ex, ey, evt.hue, 7, 180);
          waves.push({ x: ex, y: ey, r: 5, speed: 260, life: 1, hue: evt.hue, width: 2.5 });
        } else if (evt.type === 'eliminate') {
          flash = Math.max(flash, 0.28);
          spawnBurst(ex, ey, evt.hue, 10, 150);
          waves.push({ x: ex, y: ey, r: 4, speed: 180, life: 1, hue: evt.hue, width: 2 });
        } else if (evt.type === 'portal') {
          spawnBurst(ex, ey, evt.hue, 4, 120);
          waves.push({ x: ex, y: ey, r: 6, speed: 240, life: 1, hue: evt.hue, width: 2 });
        } else if (evt.type === 'winner') {
          flash = 0.7;
          spawnBurst(ex, ey, evt.hue, 26, 230);
          waves.push({ x: ex, y: ey, r: 24, speed: 400, life: 1, hue: evt.hue, width: 4 });
        }
      }

      ctx.globalCompositeOperation = 'source-over';
      var left = X(race.arena.left);
      var right = X(race.arena.right);
      var top = Y(race.arena.top);
      ctx.fillStyle = 'rgba(8, 14, 23, 0.66)';
      ctx.fillRect(left, top, right - left, height - top);

      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'hsla(' + hue + ', 80%, 64%, 0.24)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, top);
      ctx.lineTo(left, height);
      ctx.moveTo(right, top);
      ctx.lineTo(right, height);
      ctx.stroke();

      var vy = Y(race.voidY);
      var vg = ctx.createLinearGradient(0, vy, 0, height);
      vg.addColorStop(0, 'rgba(4, 8, 14, 0)');
      vg.addColorStop(0.25, 'rgba(220, 48, 82, 0.18)');
      vg.addColorStop(1, 'rgba(4, 8, 14, 0.92)');
      ctx.fillStyle = vg;
      ctx.fillRect(left, vy, right - left, height - vy);
      ctx.strokeStyle = 'rgba(255, 92, 124, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left, vy);
      ctx.lineTo(right, vy);
      ctx.stroke();

      for (var c = 0; c < race.portals.length; c++) {
        var portal = race.portals[c];
        var px = X(portal.x);
        var py = Y(portal.y);
        var pr = portal.r * sx;
        ctx.strokeStyle = 'hsla(' + portal.hue + ', 90%, 72%, 0.42)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(px, py, pr + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'hsla(' + portal.hue + ', 90%, 68%, 0.18)';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var wll = 0; wll < race.wells.length; wll++) {
        var well = race.wells[wll];
        var wx = X(well.x);
        var wy = Y(well.y);
        var wr = well.r * sx;
        ctx.strokeStyle = 'hsla(' + ((hue + 180) % 360) + ', 90%, 72%, 0.22)';
        ctx.lineWidth = 1.5;
        for (var wrr = 0; wrr < 3; wrr++) {
          ctx.beginPath();
          ctx.arc(wx, wy, wr * (0.35 + wrr * 0.28) + Math.sin(t * 2 + wrr) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'hsla(' + ((hue + 180) % 360) + ', 90%, 70%, 0.05)';
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var bst = 0; bst < race.boosters.length; bst++) {
        var boost = race.boosters[bst];
        var bx = X(boost.x);
        var by = Y(boost.y);
        var ba = boost.angle;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ba);
        ctx.strokeStyle = 'hsla(' + ((hue + 60) % 360) + ', 95%, 72%, ' + (0.35 + beatPulse * 0.3).toFixed(3) + ')';
        ctx.lineWidth = 2;
        for (var ch = 0; ch < 3; ch++) {
          ctx.beginPath();
          ctx.moveTo(-10 + ch * 7, -10);
          ctx.lineTo(0 + ch * 7, 0);
          ctx.lineTo(-10 + ch * 7, 10);
          ctx.stroke();
        }
        ctx.restore();
      }

      var conv = race.conveyor;
      ctx.fillStyle = 'hsla(' + hue + ', 75%, 62%, 0.24)';
      ctx.fillRect(X(conv.x), Y(conv.y), conv.w * sx, Math.max(2, conv.h * sy));
      ctx.strokeStyle = 'hsla(' + hue + ', 85%, 72%, 0.42)';
      ctx.lineWidth = 1;
      for (var ar = 0; ar < 3; ar++) {
        var ax = X(conv.x + 20 + ar * 32);
        var ay = Y(conv.y) + 2;
        ctx.beginPath();
        ctx.moveTo(ax + 7, ay);
        ctx.lineTo(ax, ay);
        ctx.lineTo(ax + 3, ay - 4);
        ctx.stroke();
      }

      for (var peg = 0; peg < race.pegs.length; peg++) {
        var pegX = X(race.pegs[peg].x);
        var pegY = Y(race.pegs[peg].y);
        ctx.fillStyle = 'hsla(' + hue + ', 70%, 70%, 0.36)';
        ctx.beginPath();
        ctx.arc(pegX, pegY, 5 * sx, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var bump = 0; bump < race.bumpers.length; bump++) {
        var bumper = race.bumpers[bump];
        var bx = X(bumper.x);
        var by = Y(bumper.y);
        var br = bumper.r * sx;
        ctx.strokeStyle = 'hsla(174, 90%, 72%, ' + (0.45 + beatPulse * 0.25).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'hsla(174, 90%, 65%, 0.08)';
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var sp = 0; sp < race.spinners.length; sp++) {
        var spin = race.spinners[sp];
        var cx = X(spin.x);
        var cy = Y(spin.y);
        var ux = Math.cos(spin.angle);
        var uy = Math.sin(spin.angle);
        ctx.strokeStyle = 'hsla(' + ((hue + 120) % 360) + ', 90%, 72%, 0.5)';
        ctx.lineWidth = Math.max(3, spin.half * sx * 1.5);
        ctx.beginPath();
        ctx.moveTo(cx - ux * spin.len * sx, cy - uy * spin.len * sy);
        ctx.lineTo(cx + ux * spin.len * sx, cy + uy * spin.len * sy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5 * sx, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var key in raceTrails) {
        var trail = raceTrails[key];
        for (var pt = 0; pt < trail.points.length; pt++) {
          var point = trail.points[pt];
          ctx.fillStyle = 'hsla(' + trail.hue + ', 90%, 68%, ' + Math.max(0, point.life * 0.16).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(X(point.x), Y(point.y), Math.max(1, race.ballRadius * sx * point.life), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < race.balls.length; i++) {
        var ball = race.balls[i];
        var bx2 = X(ball.x);
        var by2 = Y(ball.y);
        var r = Math.max(2, ball.r * sx);
        var glow = ctx.createRadialGradient(bx2, by2, 0, bx2, by2, r * 3);
        glow.addColorStop(0, 'hsla(' + ball.hue + ', 92%, 68%, 0.32)');
        glow.addColorStop(1, 'hsla(' + ball.hue + ', 90%, 60%, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(bx2, by2, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'hsla(' + ball.hue + ', 92%, 64%, 0.95)';
        ctx.beginPath();
        ctx.arc(bx2, by2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(bx2 - r * 0.25, by2 - r * 0.25, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      for (var pp = 0; pp < particles.length; pp++) {
        var pcl = particles[pp];
        ctx.fillStyle = 'hsla(' + pcl.hue + ', 95%, 70%, ' + Math.max(0, pcl.life * 0.8).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(X(pcl.x), Y(pcl.y), pcl.size * sx, 0, Math.PI * 2);
        ctx.fill();
      }

      var win = race.result;
      if (win) {
        for (var wb = 0; wb < race.balls.length; wb++) {
          if (race.balls[wb].id !== win.winnerId) continue;
          var wx = X(race.balls[wb].x);
          var wy = Y(race.balls[wb].y);
          ctx.strokeStyle = 'hsla(' + win.winnerHue + ', 95%, 76%, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(wx, wy, 18 + Math.sin(t * 5) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      drawWaves(hue);
    }

    function drawRace3D(state, t) {
      if (!ctx || !state || !state.race3d || !state.field) return;
      var race = state.race3d;
      var hue = state.root ? state.root.hue : 188;
      function boardZ(y) { return race.board.z0 - race.board.slope * y; }

      var focal = 620;
      var focusY = race.goalY * camFocusNorm;
      var focusZ = boardZ(focusY) + 110;
      var radius = 620;
      var elev = camElev;
      var horizontal = Math.cos(elev) * radius;
      var cam = {
        x: Math.sin(camYaw) * horizontal,
        y: focusY - Math.cos(camYaw) * horizontal,
        z: focusZ + Math.sin(elev) * radius
      };
      var target = { x: 0, y: focusY, z: focusZ };
      var fx = target.x - cam.x;
      var fy = target.y - cam.y;
      var fz = target.z - cam.z;
      var fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      fx /= fl; fy /= fl; fz /= fl;
      var rx = fy;
      var ry = -fx;
      var rl = Math.sqrt(rx * rx + ry * ry) || 1;
      rx /= rl; ry /= rl;
      var ux = ry * fz;
      var uy = -rx * fz;
      var uz = rx * fy - ry * fx;
      var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      var camData = { cam: cam, fx: fx, fy: fy, fz: fz, rx: rx, ry: ry, rz: 0, ux: ux, uy: uy, uz: uz };

      function project(p) {
        var vx = p.x - cam.x;
        var vy = p.y - cam.y;
        var vz = p.z - cam.z;
        var depth = vx * camData.fx + vy * camData.fy + vz * camData.fz;
        if (depth < 40) return null;
        var sx = vx * camData.rx + vy * camData.ry + vz * camData.rz;
        var sy = vx * camData.ux + vy * camData.uy + vz * camData.uz;
        var k = focal / depth;
        return { x: width / 2 + sx * k, y: height / 2 - sy * k, depth: depth, scale: k };
      }

      function line3(a, b, color, widthPx) {
        var pa = project(a);
        var pb = project(b);
        if (!pa || !pb) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = widthPx || 1;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      function poly3(points, fill, stroke, widthPx) {
        var pts = [];
        for (var i = 0; i < points.length; i++) {
          var p = project(points[i]);
          if (p) pts.push(p);
        }
        if (pts.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
        ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = widthPx || 1; ctx.stroke(); }
      }

      function drawBox(block) {
        var bx = block.x;
        var by = block.y;
        var base = boardZ(by);
        var x0 = bx - block.w / 2;
        var x1 = bx + block.w / 2;
        var y0 = by - block.d / 2;
        var y1 = by + block.d / 2;
        var z0 = base;
        var z1 = base + block.h;
        var top = 'rgba(224, 232, 246, 0.34)';
        var front = 'rgba(188, 201, 222, 0.24)';
        var side = 'rgba(156, 171, 196, 0.20)';
        poly3([{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }], top, 'rgba(235,240,250,0.4)', 1);
        poly3([{ x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }], front, 'rgba(220,230,245,0.2)', 1);
        poly3([{ x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }], side, 'rgba(220,230,245,0.18)', 1);
      }

      background(hue);
      ctx.globalCompositeOperation = 'lighter';

      var xh = race.board.xHalf;
      var gy = race.goalY;
      poly3([
        { x: -xh, y: 0, z: boardZ(0) }, { x: xh, y: 0, z: boardZ(0) },
        { x: xh, y: gy, z: boardZ(gy) }, { x: -xh, y: gy, z: boardZ(gy) }
      ], 'rgba(20, 28, 40, 0.5)', 'rgba(210, 222, 242, 0.18)', 1.5);

      var gridCol = 'rgba(190, 205, 225, 0.10)';
      for (var gyi = 0; gyi <= gy; gyi += 250) {
        line3({ x: -xh, y: gyi, z: boardZ(gyi) }, { x: xh, y: gyi, z: boardZ(gyi) }, gridCol, 1);
      }
      for (var gxi = -xh; gxi <= xh; gxi += 50) {
        line3({ x: gxi, y: 0, z: boardZ(0) }, { x: gxi, y: gy, z: boardZ(gy) }, gridCol, 1);
      }
      line3({ x: -xh, y: 0, z: boardZ(0) }, { x: -xh, y: gy, z: boardZ(gy) }, 'rgba(220,230,245,0.25)', 1.5);
      line3({ x: xh, y: 0, z: boardZ(0) }, { x: xh, y: gy, z: boardZ(gy) }, 'rgba(220,230,245,0.25)', 1.5);
      line3({ x: -xh, y: gy, z: boardZ(gy) }, { x: xh, y: gy, z: boardZ(gy) }, 'rgba(245,248,255,0.55)', 2.5);

      for (var bi = 0; bi < race.blocks.length; bi++) drawBox(race.blocks[bi]);

      var indexed = [];
      for (var i = 0; i < race.balls.length; i++) {
        var b = race.balls[i];
        var bp = project(b);
        if (bp) indexed.push({ b: b, p: bp });
      }
      indexed.sort(function (a, b) { return b.p.depth - a.p.depth; });
      for (var ii = 0; ii < indexed.length; ii++) {
        var ball = indexed[ii].b;
        var p = indexed[ii].p;
        var r = Math.max(2, ball.r * p.scale);
        var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        glow.addColorStop(0, 'hsla(' + ball.hue + ', 92%, 68%, 0.3)');
        glow.addColorStop(1, 'hsla(' + ball.hue + ', 90%, 60%, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'hsla(' + ball.hue + ', 92%, 64%, 0.95)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (race.prediction != null && Number(race.prediction) === ball.id) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (race.result) {
        for (var wi = 0; wi < race.balls.length; wi++) {
          if (race.balls[wi].id !== race.result.winnerId) continue;
          var wp = project(race.balls[wi]);
          if (!wp) continue;
          ctx.strokeStyle = 'hsla(' + race.result.winnerHue + ', 95%, 76%, 0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(wp.x, wp.y, 18 + Math.sin(t * 5) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    resize();
    return {
      resize: resize,
      sync: sync,
      update: update,
      draw: draw,
      drawFrame: drawFrame,
      drawRace: drawRace,
      drawRace3D: drawRace3D,
      orbit: orbit,
      setFocusNorm: setFocusNorm,
      camera: cameraState,
      tap: tap,
      clear: clear,
      state: function () { return balls; }
    };
  }

  root.ExponentialRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
