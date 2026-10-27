/* game.js : ストレート or カーブ! 野球ゲームの描画・UI・進行 */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.BaseballEngine) ? window.BaseballEngine :
    (typeof require === 'function' ? require('./engine.js') : null);
  if (!E) throw new Error('engine.js が読み込まれていません');

  /* ===== フィールド座標 ===== */
  var W = 900, H = 780;
  var FENCE_R = 585;
  var HOME_PLATE = { x: 450, y: 650 };
  var MOUND = { x: 450, y: 465 };
  var BASES = [
    { x: 645, y: 455 },
    { x: 450, y: 260 },
    { x: 255, y: 455 }
  ];
  var BATTER_POS = { x: HOME_PLATE.x - 30, y: HOME_PLATE.y - 8 };
  var CATCHER_POS = { x: HOME_PLATE.x + 8, y: HOME_PLATE.y + 54 };
  var PITCHER_POS = { x: MOUND.x, y: MOUND.y - 6 };

  var TEAM = {
    home: { name: 'あなた', color: '#3d86f5' },
    away: { name: 'CPU', color: '#e2584d' }
  };

  var FONT = '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif';

  var T = { hit: 800, advance: 640, after: 340, swing: 820 };

  /* 球種の表示情報（label は engine 側の PITCH_LABELS を使用） */
  var PITCH_INFO = {
    straight: { btn: 'ストレート', color: '#ffd166', icon: 'line' },
    curve: { btn: 'カーブ', color: '#b39dff', icon: 'curve' },
    slider: { btn: 'スライダー', color: '#4fd1ff', icon: 'slider' },
    cutter: { btn: 'カット', color: '#ff9f45', icon: 'cut' },
    fork: { btn: 'フォーク', color: '#5f8dff', icon: 'drop' },
    changeup: { btn: 'チェンジ', color: '#ff7bc1', icon: 'line' },
    shoot: { btn: 'シュート', color: '#57e08a', icon: 'shoot' },
    sinker: { btn: 'シンカー', color: '#3fd4c4', icon: 'drop' },
    knuckle: { btn: 'ナックル', color: '#c8d2e3', icon: 'wobble' }
  };

  /* 球種ごとの軌道パラメータ */
  var TRAJ = {
    straight: { dur: 600, kind: 'line' },
    curve: { dur: 840, kind: 'arc', amp: 135, early: true },
    slider: { dur: 660, kind: 'arc', amp: 90 },
    cutter: { dur: 610, kind: 'arc', amp: 34 },
    fork: { dur: 640, kind: 'line', drop: 1 },
    changeup: { dur: 900, kind: 'line', slow: true },
    shoot: { dur: 620, kind: 'arc', amp: 42 },
    sinker: { dur: 640, kind: 'arc', amp: 30, drop: 1 },
    knuckle: { dur: 800, kind: 'wobble', amp: 26 }
  };

  /* ボタン用ミニSVG */
  var ICONS = {
    line: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 42 L24 8 M13 20 L24 8 L35 20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    curve: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 42 C10 22 22 12 38 9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M28 6 L38 9 L36 19" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    slider: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 42 C16 30 20 28 36 16" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M26 14 L36 16 L33 25" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cut: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M22 42 L26 26 L36 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M28 14 L36 12 L37 20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    shoot: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M26 42 L22 26 L12 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M20 14 L12 12 L11 20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    drop: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8 L24 34" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M15 25 L24 36 L33 25" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wobble: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 42 C36 34 12 30 24 22 C36 14 16 12 24 5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M17 12 L24 5 L30 13" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function pitchColor(key) {
    return (PITCH_INFO[key] && PITCH_INFO[key].color) || '#ffd166';
  }

  var SHORT = {
    straight: 'スト', curve: 'カー', slider: 'スラ', cutter: 'カッ', fork: 'フォ',
    changeup: 'チェ', shoot: 'シュ', sinker: 'シン', knuckle: 'ナッ'
  };

  /* ===== 状態 ===== */
  var canvas, ctx;
  var els = {};
  var state = null;
  var view = null;
  var stageObserver = null;
  var pendingChoice = null;
  var swing = null;
  var lastReadPct = null;
  var buttonsEnabled = false;
  var soundOn = true;
  var lastFrame = 0;
  var running = false;

  function $(id) { return document.getElementById(id); }

  /* ===== ユーティリティ ===== */
  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function tween(dur, ease, update) {
    return new Promise(function (resolve) {
      var t0 = now();
      function frame(ts) {
        if (ts == null) ts = now();
        var t = dur <= 0 ? 1 : Math.min(1, (ts - t0) / dur);
        update(ease ? ease(t) : t, t);
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function cubicPoint(p0, p1, p2, p3, t) {
    var u = 1 - t;
    var a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
    };
  }

  function lerpPt(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }

  function unit(dx, dy) {
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  function extend(B, A, e) {
    var u = unit(A.x - B.x, A.y - B.y);
    return { x: B.x + u.x * e, y: B.y + u.y * e };
  }

  function roundRectPath(c, x, y, w, h, r) {
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

  /* ===== サウンド（WebAudio 簡単な効果音） ===== */
  var audio = {
    ctx: null,
    ensure: function () {
      if (!soundOn) return null;
      try {
        if (!this.ctx) {
          var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
          if (!AC) return null;
          this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      } catch (e) { return null; }
    },
    tone: function (freq, dur, opts) {
      var ctx = this.ensure(); if (!ctx) return;
      opts = opts || {};
      try {
        var t0 = ctx.currentTime + (opts.delay || 0);
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = opts.type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
        var vol = opts.vol == null ? 0.12 : opts.vol;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + dur + 0.06);
      } catch (e) { }
    },
    noise: function (dur, vol, delay) {
      var ctx = this.ensure(); if (!ctx) return;
      try {
        var t0 = ctx.currentTime + (delay || 0);
        var n = Math.max(1, Math.floor(ctx.sampleRate * dur));
        var buf = ctx.createBuffer(1, n, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        var src = ctx.createBufferSource(); src.buffer = buf;
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(vol == null ? 0.2 : vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        if (ctx.createBiquadFilter) {
          var filt = ctx.createBiquadFilter();
          filt.type = 'lowpass';
          filt.frequency.value = 2400;
          src.connect(filt); filt.connect(gain);
        } else {
          src.connect(gain);
        }
        gain.connect(ctx.destination);
        src.start(t0);
      } catch (e) { }
    },
    pitchWhoosh: function (slow) {
      this.noise(slow ? 0.2 : 0.13, slow ? 0.1 : 0.12);
      this.tone(slow ? 250 : 340, slow ? 0.18 : 0.12, { type: 'triangle', vol: 0.05, slideTo: slow ? 90 : 130 });
    },
    hit: function () {
      this.noise(0.08, 0.3);
      this.tone(720, 0.16, { type: 'square', vol: 0.09, slideTo: 980 });
      this.tone(520, 0.28, { type: 'triangle', vol: 0.08, delay: 0.05 });
    },
    hr: function () {
      var f = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < f.length; i++) this.tone(f[i], 0.14, { type: 'square', vol: 0.07, delay: i * 0.07 });
      this.noise(0.3, 0.25, 0.42);
    },
    strike: function () {
      this.tone(210, 0.12, { type: 'square', vol: 0.09, slideTo: 160 });
    },
    out: function () {
      this.tone(300, 0.16, { type: 'sawtooth', vol: 0.09, slideTo: 180 });
      this.tone(180, 0.3, { type: 'sawtooth', vol: 0.09, delay: 0.14, slideTo: 90 });
    },
    run: function () {
      var f = [523, 659, 784, 1047];
      for (var i = 0; i < f.length; i++) this.tone(f[i], 0.16, { type: 'triangle', vol: 0.09, delay: i * 0.09 });
    },
    sadRun: function () {
      this.tone(330, 0.2, { type: 'triangle', vol: 0.08, slideTo: 260 });
    },
    change: function () {
      this.tone(392, 0.16, { type: 'triangle', vol: 0.1 });
      this.tone(494, 0.2, { type: 'triangle', vol: 0.1, delay: 0.14 });
      this.tone(587, 0.3, { type: 'triangle', vol: 0.1, delay: 0.28 });
    },
    win: function () {
      var f = [523, 659, 784, 1047, 784, 1047];
      for (var i = 0; i < f.length; i++) this.tone(f[i], 0.22, { type: 'triangle', vol: 0.1, delay: i * 0.13 });
    },
    lose: function () {
      var f = [392, 330, 262, 196];
      for (var i = 0; i < f.length; i++) this.tone(f[i], 0.3, { type: 'sine', vol: 0.1, delay: i * 0.16 });
    },
    drawS: function () {
      this.tone(440, 0.22, { type: 'sine', vol: 0.09 });
      this.tone(440, 0.22, { type: 'sine', vol: 0.09, delay: 0.28 });
    }
  };

  /* ===== ビュー（描画用の状態） ===== */
  function resetView() {
    view = {
      ball: { x: MOUND.x, y: MOUND.y - 10, r: 8, rot: 0, visible: false, alpha: 1 },
      runners: [],
      batter: { visible: true, x: BATTER_POS.x, y: BATTER_POS.y, team: 'home' },
      pitcher: { team: 'away' },
      catcher: { team: 'away' },
      bubble: null,
      pitchTag: null,
      popups: [],
      flash: 0
    };
  }

  function updateTeams() {
    if (!state) return;
    var batting = E.battingTeam(state);
    view.batter.team = batting;
    view.pitcher.team = batting === 'home' ? 'away' : 'home';
    view.catcher.team = view.pitcher.team;
  }

  function syncRunners() {
    if (!state) { view.runners = []; return; }
    var team = E.battingTeam(state);
    var list = [];
    for (var i = 0; i < 3; i++) {
      if (state.runners[i]) {
        list.push({ x: BASES[i].x, y: BASES[i].y, base: i, team: team, color: TEAM[team].color, alpha: 1 });
      }
    }
    view.runners = list;
  }

  /* ===== アニメーション ===== */
  function pitchStart() { return { x: MOUND.x, y: MOUND.y - 10 }; }
  function pitchTarget() { return { x: HOME_PLATE.x + 2, y: HOME_PLATE.y - 20 }; }

  function animatePitch(type) {
    var traj = TRAJ[type] || TRAJ.straight;
    var from = pitchStart();
    var to = pitchTarget();
    if (traj.drop) to = { x: to.x + 3, y: to.y + 18 };
    var dir = Math.random() < 0.5 ? -1 : 1;
    var u = unit(to.x - from.x, to.y - from.y);
    var px = -u.y * dir, py = u.x * dir;
    var c1 = null, c2 = null;
    var wobPhase = Math.random() * Math.PI * 2;
    if (traj.kind === 'line') {
      c1 = lerpPt(from, to, 0.4);
      c2 = lerpPt(from, to, 0.75);
    } else if (traj.kind === 'arc') {
      if (traj.early) {
        c1 = {
          x: lerp(from.x, to.x, 0.35) + px * traj.amp * 0.85,
          y: lerp(from.y, to.y, 0.35) + py * traj.amp * 0.85
        };
        c2 = {
          x: lerp(from.x, to.x, 0.72) + px * traj.amp * 0.6,
          y: lerp(from.y, to.y, 0.72) + py * traj.amp * 0.6
        };
      } else {
        c1 = lerpPt(from, to, 0.5);
        c2 = {
          x: lerp(from.x, to.x, 0.85) + px * traj.amp,
          y: lerp(from.y, to.y, 0.85) + py * traj.amp
        };
      }
    }
    var endR = traj.drop ? 5.5 : 9.5;
    view.ball.visible = true;
    view.ball.alpha = 1;
    audio.pitchWhoosh(!!traj.slow);
    return tween(traj.dur, null, function (t) {
      var p;
      if (traj.kind === 'wobble') {
        var off = Math.sin(t * 14 + wobPhase) * traj.amp * Math.sin(Math.PI * t);
        p = { x: lerp(from.x, to.x, t) + px * off, y: lerp(from.y, to.y, t) + py * off };
      } else {
        p = cubicPoint(from, c1, c2, to, t);
      }
      view.ball.x = p.x;
      view.ball.y = p.y;
      view.ball.r = lerp(6.5, endR, t);
      view.ball.rot += traj.slow ? 0.16 : 0.3;
    });
  }

  function animateHit(far) {
    var from = { x: HOME_PLATE.x + 4, y: HOME_PLATE.y - 22 };
    var to = far
      ? { x: W / 2 + (Math.random() - 0.5) * 320, y: -170 }
      : { x: 70 + Math.random() * (W - 140), y: -30 + Math.random() * 230 };
    var c1 = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 150 };
    var c2 = { x: to.x, y: to.y + 50 };
    view.ball.visible = true;
    view.ball.alpha = 1;
    return tween(far ? T.hit + 280 : T.hit, easeOut, function (t) {
      var p = cubicPoint(from, c1, c2, to, t);
      view.ball.x = p.x;
      view.ball.y = p.y;
      view.ball.r = lerp(10, 4, t);
      view.ball.rot += 0.45;
    }).then(function () {
      return tween(180, null, function (t) { view.ball.alpha = 1 - t; });
    }).then(function () {
      view.ball.visible = false;
      view.ball.alpha = 1;
    });
  }

  function animateCatcherCatch() {
    var from = { x: view.ball.x, y: view.ball.y };
    var to = { x: CATCHER_POS.x, y: CATCHER_POS.y - 4 };
    return tween(240, null, function (t) {
      view.ball.x = lerp(from.x, to.x, t);
      view.ball.y = lerp(from.y, to.y, t);
      view.ball.r = lerp(9.5, 7.5, t);
      view.ball.rot += 0.2;
    }).then(function () {
      return tween(150, null, function (t) { view.ball.alpha = 1 - t; });
    }).then(function () {
      view.ball.visible = false;
      view.ball.alpha = 1;
    });
  }

  function basePos(i) { return { x: BASES[i].x, y: BASES[i].y }; }

  function animateAdvance(team, bases) {
    bases = bases || 1;
    var moves = [];
    var scorers = [];
    var runners = view.runners;
    for (var i = 0; i < runners.length; i++) {
      var r = runners[i];
      var dest = r.base + bases;
      if (dest >= 3) {
        scorers.push(r);
        moves.push({ r: r, from: { x: r.x, y: r.y }, to: { x: HOME_PLATE.x - 6, y: HOME_PLATE.y + 44 } });
      } else {
        r.base = dest;
        var bp = basePos(dest);
        moves.push({ r: r, from: { x: r.x, y: r.y }, to: { x: bp.x, y: bp.y } });
      }
    }
    var batterFrom = { x: view.batter.x, y: view.batter.y };
    view.batter.visible = false;
    var nr = { x: batterFrom.x, y: batterFrom.y, base: 0, team: team, color: TEAM[team].color, alpha: 1 };
    view.runners.push(nr);
    if (bases >= 4) {
      scorers.push(nr);
      moves.push({ r: nr, from: batterFrom, to: { x: HOME_PLATE.x - 6, y: HOME_PLATE.y + 44 } });
    } else {
      nr.base = bases - 1;
      var p0 = basePos(bases - 1);
      moves.push({ r: nr, from: batterFrom, to: { x: p0.x, y: p0.y } });
    }

    var dur = T.advance + (bases - 1) * 260;
    return tween(dur, easeInOut, function (t) {
      for (var k = 0; k < moves.length; k++) {
        var m = moves[k];
        m.r.x = lerp(m.from.x, m.to.x, t);
        m.r.y = lerp(m.from.y, m.to.y, t);
      }
    }).then(function () {
      if (!scorers.length) return;
      for (var s = 0; s < scorers.length; s++) {
        view.popups.push({
          x: HOME_PLATE.x, y: HOME_PLATE.y - 46 - s * 22,
          text: '+1', color: '#ffd166', born: now(), ttl: 1100
        });
      }
      return tween(240, null, function (t) {
        for (var s2 = 0; s2 < scorers.length; s2++) scorers[s2].alpha = 1 - t;
      });
    }).then(function () {
      for (var s3 = 0; s3 < scorers.length; s3++) {
        var idx = view.runners.indexOf(scorers[s3]);
        if (idx >= 0) view.runners.splice(idx, 1);
      }
      syncRunners();
    });
  }

  /* ===== 表示エフェクト ===== */
  function showPitchTag(text, color, ttl) {
    view.pitchTag = { text: text, color: color || '#ffd166', born: now(), ttl: ttl || 950 };
  }
  function showBubble(text) {
    view.bubble = { text: text, born: now(), ttl: 1500 };
  }
  function hideBubble() { view.bubble = null; }
  function flash() { view.flash = 1; }

  /* ===== メッセージ・UI ===== */
  function msg(text, kind) {
    els.message.textContent = text;
    els.message.className = 'message' + (kind ? ' ' + kind : '');
    if (els.message.offsetWidth != null) { /* reflow でアニメ再開 */ var _r = els.message.offsetWidth; }
    els.message.classList.add('pop');
  }

  function setButtons(enabled) {
    buttonsEnabled = enabled;
    var list = els.pitchButtons || {};
    for (var k in list) {
      if (list.hasOwnProperty(k)) list[k].classList.toggle('disabled', !enabled);
    }
    if (els.btnTake) els.btnTake.classList.toggle('disabled', !enabled);
  }

  function askChoice(hint) {
    els.hint.textContent = hint;
    setButtons(true);
    return new Promise(function (resolve) { pendingChoice = resolve; });
  }

  function finishChoice(payload) {
    if (!pendingChoice || !buttonsEnabled) return;
    var resolve = pendingChoice;
    pendingChoice = null;
    setButtons(false);
    els.hint.textContent = '';
    audio.ensure();
    resolve(payload);
  }

  function choosePitch(pitch) { finishChoice({ action: 'swing', pitch: pitch }); }
  function chooseTake() { finishChoice({ action: 'take' }); }

  /* ===== タイミングバー（長打狙い） ===== */
  function askTiming() {
    els.powerbar.classList.remove('hidden');
    els.pbMarker.style.left = '0%';
    msg('タイミングを合わせろ!!', 'gold');
    return new Promise(function (resolve) {
      swing = { start: now(), dur: T.swing, resolve: resolve, target: 0 };
    });
  }

  function timingPos() {
    if (!swing) return 50;
    var t = (now() - swing.start) / swing.dur;
    if (t > 1) t = 1;
    return t * 100;
  }

  function stopTiming() {
    if (!swing) return;
    var pos = timingPos();
    var resolve = swing.resolve;
    swing = null;
    els.powerbar.classList.add('hidden');
    resolve({ pos: pos, offset: pos - 50, kind: E.timingResult(pos - 50) });
  }

  function updateSwingBar() {
    if (!swing) return;
    els.pbMarker.style.left = timingPos().toFixed(1) + '%';
    if (now() >= swing.start + swing.dur + 120) stopTiming();
  }

  function renderChart() {
    if (!state || !els.chartRows) return;
    var tend = E.pitchTendencies(state);
    els.chartStyle.textContent = 'CPUピッチャー: ' + tend.styleName + ' (持ち球5球種)';
    var arsenalNames = [];
    for (var an = 0; an < tend.arsenal.length; an++) arsenalNames.push(E.pitchLabel(tend.arsenal[an]));
    var goodNames = [];
    for (var g = 0; g < tend.good.length; g++) goodNames.push(E.pitchLabel(tend.good[g]));
    var badNames = [];
    for (var bd = 0; bd < tend.bad.length; bd++) badNames.push(E.pitchLabel(tend.bad[bd]));
    var html = '<div class="chart-note">持ち球: ' + arsenalNames.join('・') +
      ' の中からしか投げてこない</div>' +
      '<div class="chart-note">得意: ' + goodNames.join('・') +
      ' (ゾーンに入りやすい) / 苦手: ' + badNames.join('・') + ' (ボールになりやすい)</div>';
    var lastPitch = state.pitcherHistory.length
      ? state.pitcherHistory[state.pitcherHistory.length - 1] : null;
    for (var i = 0; i < tend.rows.length; i++) {
      var row = tend.rows[i];
      html += '<div class="chart-row"><span class="chart-label">' + row.strikes + 'ストライク:</span>';
      if (!row.items.length) {
        html += '<span class="chart-empty">まだデータなし</span>';
      } else {
        for (var j = 0; j < row.items.length && j < 4; j++) {
          var it = row.items[j];
          var zr = it.count ? Math.round((it.zoneCount / it.count) * 100) : 0;
          var latest = (lastPitch && lastPitch.strikes === row.strikes && lastPitch.pitch === it.pitch)
            ? ' latest' : '';
          html += '<span class="chip' + latest + '" style="--c:' + pitchColor(it.pitch) + '">' +
            (SHORT[it.pitch] || it.pitch) + '×' + it.count +
            '<small>ゾーン' + zr + '%</small></span>';
        }
        if (row.items.length > 4) {
          html += '<span class="chip more">+' + (row.items.length - 4) + '球種</span>';
        }
      }
      html += '</div>';
    }
    els.chartRows.innerHTML = html;
  }

  function renderDefensePanel() {
    if (!state || !els.defChips) return;
    var hist = state.playerHistory || [];
    var html = '';
    var start = Math.max(0, hist.length - 6);
    for (var i = hist.length - 1; i >= start; i--) {
      var p = hist[i];
      html += '<span class="chip' + (i === hist.length - 1 ? ' latest' : '') +
        '" style="--c:' + pitchColor(p) + '">' + (SHORT[p] || E.pitchLabel(p)) + '</span>';
    }
    if (!hist.length) html = '<span class="chart-empty">まだ投げていない</span>';
    els.defChips.innerHTML = html;

    var streak = 0;
    for (var s = hist.length - 1; s >= 0 && hist[s] === hist[hist.length - 1]; s--) streak++;
    var warn = '';
    var warnCls = '';
    if (streak >= 3) { warn = '同じ球を' + streak + '連投! 完全に読まれている'; warnCls = 'bad'; }
    else if (streak === 2) { warn = '同じ球を2連投。次は読まれるぞ'; warnCls = 'warn'; }
    els.defWarn.textContent = warn;
    els.defWarn.className = 'def-warn' + (warnCls ? ' ' + warnCls : '');

    els.defReadPct.textContent = lastReadPct == null ? '—' : lastReadPct + '%';
    els.defReadFill.style.width = (lastReadPct == null ? 0 : lastReadPct) + '%';
  }

  function updatePitchBadges() {
    if (!state || !els.zbadges) return;
    var attack = E.battingTeam(state) === 'home' && !state.over;
    var style = E.PITCH_STYLES[state.pitcherStyle] || { good: [], bad: [], arsenal: [] };
    for (var i = 0; i < E.PITCH_ORDER.length; i++) {
      var key = E.PITCH_ORDER[i];
      var badge = els.zbadges[key];
      if (!badge) continue;
      var btn = els.pitchButtons ? els.pitchButtons[key] : null;
      if (state.over) {
        badge.innerHTML = '';
        badge.className = 'zbadge';
        if (btn) btn.classList.remove('off');
        continue;
      }
      var inArsenal = style.arsenal.indexOf(key) >= 0;
      if (attack && !inArsenal) {
        badge.innerHTML = '×持ち球以外';
        badge.className = 'zbadge out';
        badge.style.setProperty('--z', '50%');
        if (btn) btn.classList.add('off');
        continue;
      }
      if (btn) btn.classList.remove('off');
      var zr = attack ? E.zoneRateFor(state.pitcherStyle, key) : (E.ZONE_RATES[key] || 0.5);
      var zp = Math.round(zr * 100);
      var isGood = attack && style.good.indexOf(key) >= 0;
      var isBad = attack && style.bad.indexOf(key) >= 0;
      badge.innerHTML = (isGood ? '得意 ' : isBad ? '苦手 ' : '') +
        '<span class="zv">ゾーン' + zp + '%</span> <span class="bv">ボール' + (100 - zp) + '%</span>';
      badge.className = 'zbadge' + (attack ? (isGood ? ' good' : (isBad ? ' bad' : ' plain')) : ' def');
      badge.style.setProperty('--z', zp + '%');
    }
  }

  function updateUI() {
    if (!state) return;
    els.inningLabel.textContent = E.halfLabel(state);
    els.phaseLabel.textContent = E.battingTeam(state) === 'home' ? 'あなたの攻撃' : 'あなたの守備';

    var teams = ['away', 'home'];
    for (var ti = 0; ti < teams.length; ti++) {
      var t = teams[ti];
      var cells = els.liCells[t];
      for (var i = 0; i < state.totalInnings; i++) {
        var v = state.linescore[t][i];
        cells[i].textContent = (v === null ? '-' : String(v));
        cells[i].classList.remove('current');
        if (!state.over && state.inning === i + 1 && E.battingTeam(state) === t) {
          cells[i].classList.add('current');
        }
      }
      els.runCells[t].textContent = String(state.score[t]);
      els.hitCells[t].textContent = String(state.hits[t]);
    }

    var dots = '';
    for (var s = 0; s < state.strikesPerInning; s++) dots += (s < state.strikes ? '●' : '○');
    els.strikeDots.textContent = dots;
    els.strikeDots.classList.toggle('danger', state.strikes === state.strikesPerInning - 1);

    var ballsPerWalk = state.ballsPerWalk || 4;
    var bdots = '';
    for (var bb = 0; bb < ballsPerWalk; bb++) bdots += (bb < state.balls ? '●' : '○');
    els.ballDots.textContent = bdots;
    els.ballDots.classList.toggle('danger', state.balls === ballsPerWalk - 1);
    if (els.ballWrap) {
      els.ballWrap.style.display = state.over ? 'none' : '';
    }
    if (els.chartWrap) {
      els.chartWrap.classList.toggle('hidden', E.battingTeam(state) !== 'home' || state.over);
    }
    renderChart();
    if (els.defensePanel) {
      els.defensePanel.classList.toggle('hidden', E.battingTeam(state) === 'home' || state.over);
    }
    renderDefensePanel();
    updatePitchBadges();

    els.rowAway.classList.toggle('batting', !state.over && E.battingTeam(state) === 'away');
    els.rowHome.classList.toggle('batting', !state.over && E.battingTeam(state) === 'home');
    resizeCanvas();
  }

  /* ===== 描画 ===== */
  function drawField(c) {
    c.fillStyle = '#0f1723';
    c.fillRect(0, 0, W, H);

    c.save();
    c.beginPath();
    c.arc(HOME_PLATE.x, HOME_PLATE.y, FENCE_R, 0, Math.PI * 2);
    c.clip();

    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#37995c');
    g.addColorStop(1, '#2c7f4c');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.fillStyle = 'rgba(255,255,255,0.045)';
    for (var sx = -260; sx < W + 260; sx += 120) {
      c.save();
      c.translate(sx, 0);
      c.rotate(-0.09);
      c.fillRect(0, -400, 60, H + 800);
      c.restore();
    }

    c.beginPath();
    c.arc(HOME_PLATE.x, HOME_PLATE.y, FENCE_R - 13, 0, Math.PI * 2);
    c.lineWidth = 26;
    c.strokeStyle = '#c39b63';
    c.stroke();
    c.restore();

    c.beginPath();
    c.arc(HOME_PLATE.x, HOME_PLATE.y, FENCE_R, 0, Math.PI * 2);
    c.lineWidth = 7;
    c.strokeStyle = '#6e4f33';
    c.stroke();

    drawInfieldDirt(c);
    drawLines(c);
    drawBases(c);
  }

  function drawInfieldDirt(c) {
    var pts = [HOME_PLATE, BASES[0], BASES[1], BASES[2]];
    var e = 34;
    var verts = [];
    for (var i = 0; i < 4; i++) {
      var B = pts[i], A = pts[(i + 3) % 4], C = pts[(i + 1) % 4];
      verts.push({ p1: extend(B, A, e), p2: extend(B, C, e), b: B });
    }
    c.beginPath();
    c.moveTo(verts[0].p2.x, verts[0].p2.y);
    for (var j = 1; j <= 4; j++) {
      var v = verts[j % 4];
      c.lineTo(v.p1.x, v.p1.y);
      c.quadraticCurveTo(v.b.x, v.b.y, v.p2.x, v.p2.y);
    }
    c.closePath();
    var dg = c.createRadialGradient(HOME_PLATE.x, HOME_PLATE.y - 140, 80, HOME_PLATE.x, HOME_PLATE.y - 140, 520);
    dg.addColorStop(0, '#cfa76f');
    dg.addColorStop(1, '#b98f58');
    c.fillStyle = dg;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(110,70,30,0.35)';
    c.stroke();

    c.beginPath();
    c.arc(HOME_PLATE.x, HOME_PLATE.y + 6, 86, 0, Math.PI * 2);
    c.fillStyle = '#c69d66';
    c.fill();

    c.beginPath();
    c.arc(MOUND.x, MOUND.y, 46, 0, Math.PI * 2);
    c.fillStyle = '#cfa76f';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(110,70,30,0.3)';
    c.stroke();
  }

  function drawLines(c) {
    var u1 = unit(BASES[0].x - HOME_PLATE.x, BASES[0].y - HOME_PLATE.y);
    var u3 = unit(BASES[2].x - HOME_PLATE.x, BASES[2].y - HOME_PLATE.y);
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.beginPath();
    c.moveTo(HOME_PLATE.x, HOME_PLATE.y);
    c.lineTo(HOME_PLATE.x + u1.x * FENCE_R, HOME_PLATE.y + u1.y * FENCE_R);
    c.moveTo(HOME_PLATE.x, HOME_PLATE.y);
    c.lineTo(HOME_PLATE.x + u3.x * FENCE_R, HOME_PLATE.y + u3.y * FENCE_R);
    c.stroke();

    c.beginPath();
    c.moveTo(BASES[0].x, BASES[0].y);
    c.lineTo(BASES[1].x, BASES[1].y);
    c.lineTo(BASES[2].x, BASES[2].y);
    c.stroke();
  }

  function drawDiamond(c, x, y, s, fill) {
    c.beginPath();
    c.moveTo(x, y - s);
    c.lineTo(x + s, y);
    c.lineTo(x, y + s);
    c.lineTo(x - s, y);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.stroke();
  }

  function drawBases(c) {
    for (var i = 0; i < 3; i++) drawDiamond(c, BASES[i].x, BASES[i].y, 13, '#ffffff');

    c.beginPath();
    c.moveTo(HOME_PLATE.x - 11, HOME_PLATE.y - 14);
    c.lineTo(HOME_PLATE.x + 11, HOME_PLATE.y - 14);
    c.lineTo(HOME_PLATE.x + 11, HOME_PLATE.y - 2);
    c.lineTo(HOME_PLATE.x, HOME_PLATE.y + 8);
    c.lineTo(HOME_PLATE.x - 11, HOME_PLATE.y - 2);
    c.closePath();
    c.fillStyle = '#ffffff';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.stroke();

    c.fillStyle = '#f2f2f2';
    c.fillRect(MOUND.x - 15, MOUND.y + 9, 30, 7);
  }

  function drawPerson(c, x, y, color, opts) {
    opts = opts || {};
    var r = opts.r || 13;
    c.beginPath();
    c.ellipse(x + 2, y + r * 0.75, r * 0.95, r * 0.5, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fill();

    var pg = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.2, x, y, r);
    pg.addColorStop(0, 'rgba(255,255,255,0.75)');
    pg.addColorStop(1, color);
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = pg;
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = '#ffffff';
    c.stroke();

    c.beginPath();
    c.arc(x, y, r * 0.42, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fill();

    if (opts.bat) {
      c.save();
      c.translate(x, y);
      c.rotate(-0.85);
      c.fillStyle = '#c9975b';
      c.fillRect(-2.5, -r - 22, 5, 24);
      c.restore();
    }
    if (opts.mitt) {
      c.beginPath();
      c.arc(x + r * 0.85, y - r * 0.55, 5, 0, Math.PI * 2);
      c.fillStyle = '#8a5a2b';
      c.fill();
    }
  }

  function drawBall(c) {
    var b = view.ball;
    if (!b.visible) return;
    c.save();
    if (b.alpha != null) c.globalAlpha = b.alpha;
    c.beginPath();
    c.ellipse(b.x + 2, b.y + 3, b.r * 0.9, b.r * 0.55, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fill();

    c.translate(b.x, b.y);
    c.rotate(b.rot);
    var bg = c.createRadialGradient(-b.r * 0.35, -b.r * 0.4, b.r * 0.15, 0, 0, b.r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#d8dde6');
    c.beginPath();
    c.arc(0, 0, b.r, 0, Math.PI * 2);
    c.fillStyle = bg;
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = 'rgba(80,90,110,0.55)';
    c.stroke();

    c.strokeStyle = '#d84a3f';
    c.lineWidth = Math.max(1.2, b.r * 0.16);
    c.beginPath();
    c.arc(-b.r * 0.55, 0, b.r * 0.75, -0.85, 0.85);
    c.stroke();
    c.beginPath();
    c.arc(b.r * 0.55, 0, b.r * 0.75, Math.PI - 0.85, Math.PI + 0.85);
    c.stroke();
    c.restore();
  }

  function drawBubble(c, ts) {
    var bub = view.bubble;
    if (!bub) return;
    var age = ts - bub.born;
    if (age > bub.ttl) { view.bubble = null; return; }
    var fadeIn = Math.min(1, age / 160);
    var fadeOut = Math.min(1, (bub.ttl - age) / 220);
    var alpha = Math.min(fadeIn, fadeOut);
    var x = HOME_PLATE.x + 14, y = HOME_PLATE.y - 100;
    c.save();
    c.globalAlpha = alpha;
    c.font = 'bold 20px ' + FONT;
    var tw = c.measureText(bub.text).width;
    var bw = tw + 26, bh = 38;
    roundRectPath(c, x - bw / 2, y - bh, bw, bh, 10);
    c.fillStyle = '#ffffff';
    c.fill();
    c.strokeStyle = '#2a3346';
    c.lineWidth = 2.5;
    c.stroke();
    c.beginPath();
    c.moveTo(x - 6, y);
    c.lineTo(x + 6, y);
    c.lineTo(x, y + 14);
    c.closePath();
    c.fillStyle = '#ffffff';
    c.fill();
    c.fillStyle = '#1b2333';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(bub.text, x, y - bh / 2 + 1);
    c.restore();
  }

  function drawPitchTag(c, ts) {
    var tag = view.pitchTag;
    if (!tag) return;
    var age = ts - tag.born;
    if (age > tag.ttl) { view.pitchTag = null; return; }
    var t = Math.min(1, age / 150);
    var scale = 0.6 + 0.4 * easeOut(t);
    var alpha = age > tag.ttl - 200 ? (tag.ttl - age) / 200 : 1;
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, alpha));
    c.translate(HOME_PLATE.x + 2, HOME_PLATE.y - 64);
    c.scale(scale, scale);
    c.font = '900 40px ' + FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.strokeStyle = 'rgba(15,20,32,0.9)';
    c.strokeText(tag.text, 0, 0);
    c.fillStyle = tag.color;
    c.fillText(tag.text, 0, 0);
    c.restore();
  }

  function drawPopups(c, ts) {
    for (var i = view.popups.length - 1; i >= 0; i--) {
      var p = view.popups[i];
      var age = ts - p.born;
      if (age > p.ttl) { view.popups.splice(i, 1); continue; }
      var t = age / p.ttl;
      c.save();
      c.globalAlpha = Math.max(0, 1 - t * t);
      c.font = '900 34px ' + FONT;
      c.textAlign = 'center';
      c.lineWidth = 7;
      c.strokeStyle = 'rgba(15,20,32,0.9)';
      c.strokeText(p.text, p.x, p.y - t * 70);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, p.y - t * 70);
      c.restore();
    }
  }

  function draw(ts) {
    if (ts == null) ts = now();
    if (!ctx) return;
    var c = ctx;
    drawField(c);

    var i;
    for (i = 0; i < view.runners.length; i++) {
      var r = view.runners[i];
      c.save();
      if (r.alpha != null) c.globalAlpha = r.alpha;
      drawPerson(c, r.x, r.y, r.color, { r: 12 });
      c.restore();
    }

    if (view.batter.visible) {
      drawPerson(c, view.batter.x, view.batter.y, TEAM[view.batter.team].color, { bat: true });
    }
    drawPerson(c, PITCHER_POS.x, PITCHER_POS.y, TEAM[view.pitcher.team].color, {});
    drawPerson(c, CATCHER_POS.x, CATCHER_POS.y, TEAM[view.catcher.team].color, { r: 10, mitt: true });

    drawBall(c);
    drawPitchTag(c, ts);
    drawBubble(c, ts);
    drawPopups(c, ts);

    if (view.flash > 0) {
      c.fillStyle = 'rgba(228,74,64,' + (view.flash * 0.22) + ')';
      c.fillRect(0, 0, W, H);
    }
  }

  /* ===== ゲーム進行 ===== */
  function updateHalfMessage() {
    if (!state) return;
    var batting = E.battingTeam(state);
    var role = batting === 'home' ? 'あなたの攻撃' : 'あなたの守備';
    msg(E.halfLabel(state) + ' ' + role + '!', batting === 'home' ? 'gold' : '');
  }

  function playHalfInning() {
    return new Promise(function (resolve) {
      updateTeams();
      syncRunners();
      updateUI();
      var batting = E.battingTeam(state);

      function nextAtBat() {
        if (state.over) { resolve(null); return; }
        lastReadPct = null;

        if (batting === 'home') {
          view.batter.visible = true;
          var pitch = E.pitcherPitch(state);
          msg('配球メモで持ち球のクセを読め! (1〜9 / 0=見逃し)');
          askChoice('どうする? 1〜9=スイング予想 / 0=見逃し').then(function (choice) {
            var actual = pitch.actual;
            if (choice.action === 'take') {
              var tev = E.resolveTake(state, pitch.zone);
              animatePitch(actual).then(function () {
                showPitchTag(E.pitchLabel(actual), pitchColor(actual));
                return wait(260);
              }).then(function () {
                if (tev.walk) {
                  showPitchTag('フォアボール!', '#4fd1ff', 1200);
                  if (tev.runs > 0) msg('押し出しフォアボール! ' + tev.runs + '点!!', 'gold');
                  else msg('フォアボール! 全員1つ進塁!', 'gold');
                  return animateAdvance('home', 1).then(function () { audio.run(); });
                }
                return animateCatcherCatch().then(function () {
                  if (tev.calledStrike) {
                    audio.strike();
                    flash();
                    showPitchTag('見逃しストライク!', '#ff6b5e', 1000);
                    if (tev.strikeout) {
                      audio.out();
                      msg('見逃し三振!! チェンジ!', 'red');
                      return wait(750);
                    }
                    msg('見逃しストライク! あと' + (state.strikesPerInning - state.strikes) + 'つでチェンジ', 'red');
                    return;
                  }
                  msg('ボール! あと' + (state.ballsPerWalk - state.balls) + '球で四球', '');
                });
              }).then(function () {
                updateUI();
                if (tev.gameEnded || tev.inningEnded) { resolve(tev); return; }
                wait(T.after).then(nextAtBat);
              });
              return;
            }
            var ev = E.resolvePlayerSwing(state, choice.pitch, actual, pitch.zone);
            animatePitch(actual).then(function () {
              showPitchTag(E.pitchLabel(actual), pitchColor(actual));
              if (ev.correct) {
                if (!pitch.zone) {
                  return wait(280).then(function () {
                    var hev = E.resolveHit(state, 'single');
                    if (hev.gameEnded) { ev.gameEnded = true; ev.result = hev.result; }
                    var label = hev.walkoff ? 'サヨナラタイムリー!' : 'ボール球をすくい上げた! 単打!';
                    audio.hit();
                    showPitchTag(hev.walkoff ? 'サヨナラヒット!' : 'ボール球をヒット!', '#57e08a', 1250);
                    if (hev.runs > 0) msg(label + ' ' + hev.runs + '点!!', 'gold');
                    else msg(label, 'gold');
                    return animateHit(false).then(function () {
                      return animateAdvance('home', 1);
                    }).then(function () {
                      if (hev.runs > 0) audio.run();
                    });
                  });
                }
                return wait(280).then(askTiming).then(function (sw) {
                  var hev = E.resolveHit(state, sw.kind);
                  if (hev.gameEnded) { ev.gameEnded = true; ev.result = hev.result; }
                  var label;
                  if (sw.kind === 'hr') { label = 'ホームラン!!!'; audio.hr(); }
                  else if (sw.kind === 'double') label = '二塁打!';
                  else label = Math.abs(sw.offset) > 30 ? '打ち損じたが…ヒット!' : 'ヒット!';
                  if (hev.walkoff) label = 'サヨナラ' + label;
                  audio.hit();
                  showPitchTag(label, sw.kind === 'hr' ? '#ffd166' : '#57e08a', 1250);
                  if (hev.runs > 0) msg(label + ' ' + hev.runs + '点!!', 'gold');
                  else msg(label, 'gold');
                  return animateHit(sw.kind === 'hr').then(function () {
                    return animateAdvance('home', sw.kind === 'hr' ? 4 : (sw.kind === 'double' ? 2 : 1));
                  }).then(function () {
                    if (hev.runs > 0) audio.run();
                  });
                });
              }
              if (ev.ball) {
                if (ev.take.walk) {
                  showPitchTag('フォアボール!', '#4fd1ff', 1200);
                  if (ev.take.runs > 0) msg('押し出しフォアボール! ' + ev.take.runs + '点!!', 'gold');
                  else msg('予想は外れたが明らかなボール球! フォアボール!', 'gold');
                  return animateAdvance('home', 1).then(function () { audio.run(); });
                }
                return animateCatcherCatch().then(function () {
                  showPitchTag('ボール!', '#4fd1ff', 1000);
                  msg('予想は外れたが明らかなボール球! 空振りにならずボール! あと' +
                    (state.ballsPerWalk - state.balls) + '球で四球', '');
                });
              }
              return animateCatcherCatch().then(function () {
                audio.strike();
                flash();
                if (ev.strikeout) {
                  audio.out();
                  showPitchTag('三振!!', '#ff6b5e', 1000);
                  msg('三振!! チェンジ!', 'red');
                  return wait(750);
                }
                msg('空振り! ストライク! あと' + (state.strikesPerInning - state.strikes) + 'つでチェンジ', 'red');
              });
            }).then(function () {
              updateUI();
              if (ev.gameEnded || ev.inningEnded) { resolve(ev); return; }
              wait(T.after).then(nextAtBat);
            });
          });
        } else {
          view.batter.visible = true;
          msg('球種を選んで投げよう! ゾーン%が低い球はボールになりやすく四球に注意!');
          askChoice('投げる球種は? (1〜9キー)').then(function (choice) {
            var chosen = choice.pitch;
            var plan = E.resolveCpuAtBat(state, chosen);
            var endEv = plan.pitch || plan.take;
            var dec = plan.dec;
            var readPct = dec ? Math.round(dec.accuracy * 100) : 0;
            lastReadPct = dec ? readPct : null;
            var readTag = dec ? (dec.pattern ? ' (リズム察知!)' : (dec.streak >= 2 ? ' (連投バレ!)' : '')) : '';
            var bubbleText;
            if (plan.take) bubbleText = 'CPUはボールを見送った…';
            else if (plan.chased) bubbleText = 'CPUがボール球に手を出した! 待っているのは「' + E.pitchLabel(dec.guess) + '」' + readTag + '…';
            else bubbleText = 'CPUは「' + E.pitchLabel(dec.guess) + '」を待っている' + readTag + '…';
            var bubbleShown = false;
            var bubbleTimer = setTimeout(function () {
              bubbleShown = true;
              showBubble(bubbleText);
            }, 240);
            animatePitch(chosen).then(function () {
              clearTimeout(bubbleTimer);
              if (!bubbleShown) showBubble(bubbleText);
              showPitchTag(E.pitchLabel(chosen), pitchColor(chosen));
              return wait(280);
            }).then(function () {
              hideBubble();
              if (plan.take) {
                return animateCatcherCatch().then(function () {
                  if (plan.take.walk) {
                    showPitchTag('フォアボール…', '#ff9f45', 1100);
                    if (plan.take.runs > 0) {
                      audio.sadRun();
                      msg('押し出し四球… ' + plan.take.runs + '点取られた', 'red');
                    } else {
                      audio.tone(240, 0.12, { type: 'sine', vol: 0.07 });
                      msg('フォアボール… CPUにランナーを出した', 'red');
                    }
                    return animateAdvance('away', 1);
                  }
                  audio.tone(280, 0.1, { type: 'sine', vol: 0.06 });
                  showPitchTag('ボール', '#ffd166', 900);
                  msg('ボール! あと' + (state.ballsPerWalk - state.balls) + '球で四球…');
                });
              }
              if (plan.hit) {
                audio.hit();
                var kindLabel = plan.hit.kind === 'double' ? '二塁打' : 'ヒット';
                var cause = plan.chased ? 'ボール球を打たれた…' : '見破られた';
                if (plan.hit.runs > 0) msg(cause + readTag + '!(CPUの読み ' + readPct + '%) ' + kindLabel + '… ' + plan.hit.runs + '点取られた', 'red');
                else msg(cause + readTag + '!(CPUの読み ' + readPct + '%) CPUに' + kindLabel + 'を打たれた…', 'red');
                return animateHit(false).then(function () {
                  return animateAdvance('away', plan.hit.kind === 'double' ? 2 : 1);
                }).then(function () {
                  if (plan.hit.runs > 0) audio.sadRun();
                });
              }
              return animateCatcherCatch().then(function () {
                audio.strike();
                if (plan.pitch.strikeout) {
                  audio.out();
                  showPitchTag(plan.chased ? '空振り三振!!' : '三振!!', '#ffd166', 1000);
                  msg(plan.chased ? 'ボール球で三振に仕留めた!! チェンジ!' : '三振に仕留めた!! チェンジ!', 'gold');
                  return wait(750);
                }
                msg((plan.chased ? 'ボール球を空振り!' : 'CPUは空振り!') + ' ストライク! あと' + (state.strikesPerInning - state.strikes) + 'つでチェンジ');
              });
            }).then(function () {
              updateUI();
              if (endEv.gameEnded || endEv.inningEnded) { resolve(endEv); return; }
              wait(T.after).then(nextAtBat);
            });
          });
        }
      }

      nextAtBat();
    });
  }

  function showBanner(main, sub, ms) {
    els.bannerMain.textContent = main;
    els.bannerSub.textContent = sub || '';
    els.banner.classList.add('show');
    return wait(ms || 1500).then(function () {
      els.banner.classList.remove('show');
    });
  }

  function changeSides() {
    var batting = E.battingTeam(state);
    var role = batting === 'home' ? 'あなたの攻撃!' : 'あなたの守備!';
    msg('攻守交代!', 'gold');
    audio.change();
    return showBanner('チェンジ!', E.halfLabel(state) + ' ' + role, 1600).then(function () {
      return wait(280);
    }).then(function () {
      updateTeams();
      syncRunners();
      updateUI();
      updateHalfMessage();
    });
  }

  function showResult() {
    var r = state.result;
    els.endScore.textContent = 'あなた ' + state.score.home + ' - ' + state.score.away + ' CPU';
    var text, cls;
    if (r === 'home') { text = 'あなたの勝利!!'; cls = 'win'; audio.win(); }
    else if (r === 'away') { text = 'CPUの勝利…'; cls = 'lose'; audio.lose(); }
    else { text = '引き分け'; cls = 'draw'; audio.drawS(); }
    els.endResult.textContent = text;
    els.endResult.className = 'end-result ' + cls;
    els.endHits.textContent = '安打数  あなた ' + state.hits.home + ' / CPU ' + state.hits.away +
      '   (' + state.totalInnings + '回終了)';
    msg(text, cls === 'win' ? 'gold' : (cls === 'lose' ? 'red' : ''));
    return wait(700).then(function () {
      els.screenEnd.classList.add('visible');
    });
  }

  function beginGame() {
    if (running) return Promise.resolve();
    running = true;
    pendingChoice = null;
    swing = null;
    lastReadPct = null;
    els.screenStart.classList.remove('visible');
    els.screenEnd.classList.remove('visible');
    state = E.createGame();
    resetView();
    updateTeams();
    syncRunners();
    updateUI();
    setButtons(false);
    audio.ensure();
    var styleObj = E.PITCH_STYLES[state.pitcherStyle] || {};
    var styleName = styleObj.name || '';
    var arsenalNames = [];
    if (styleObj.arsenal) {
      for (var ai = 0; ai < styleObj.arsenal.length; ai++) arsenalNames.push(E.pitchLabel(styleObj.arsenal[ai]));
    }
    msg('プレイボール! CPUピッチャーは「' + styleName + '」タイプ! 持ち球は ' + arsenalNames.join('・'), 'gold');

    function loop() {
      if (state.over) return Promise.resolve();
      return playHalfInning().then(function () {
        if (state.over) return;
        return changeSides().then(loop);
      });
    }

    return wait(900).then(function () {
      return updateHalfMessage();
    }).then(function () {
      return wait(650);
    }).then(loop).then(function () {
      return wait(500);
    }).then(showResult).then(function () {
      running = false;
    }, function (err) {
      running = false;
      if (typeof console !== 'undefined' && console.error) console.error(err);
      throw err;
    });
  }

  /* ===== 初期化 ===== */
  function buildScoreCells() {
    els.liCells = {};
    els.runCells = {};
    els.hitCells = {};
    var teams = ['away', 'home'];
    for (var i = 0; i < teams.length; i++) {
      var t = teams[i];
      var row = t === 'away' ? els.rowAway : els.rowHome;
      var cells = [];
      for (var n = 1; n <= E.TOTAL_INNINGS; n++) {
        var td = document.createElement('td');
        td.className = 'inn';
        row.appendChild(td);
        cells.push(td);
      }
      var rTd = document.createElement('td');
      rTd.className = 'sum';
      row.appendChild(rTd);
      var hTd = document.createElement('td');
      hTd.className = 'sum';
      row.appendChild(hTd);
      els.liCells[t] = cells;
      els.runCells[t] = rTd;
      els.hitCells[t] = hTd;
    }
  }

  function watchStageSize() {
    if (typeof ResizeObserver === 'undefined' || !els.stage) return;
    if (!stageObserver) {
      stageObserver = new ResizeObserver(function () {
        resizeCanvas();
      });
    }
    stageObserver.observe(els.stage);
  }

  function resizeCanvas() {
    if (!canvas) return;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var availW = (els.stage && els.stage.clientWidth) ? els.stage.clientWidth - 16 : W;
    var availH = (els.stage && els.stage.clientHeight) ? els.stage.clientHeight - 8 : H;
    if (availW <= 0) availW = W;
    if (availH <= 0) availH = H;
    var scale = Math.min(availW / W, availH / H);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    var bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    var sw = Math.floor(W * scale) + 'px', sh = Math.floor(H * scale) + 'px';
    if (canvas.style.width !== sw) canvas.style.width = sw;
    if (canvas.style.height !== sh) canvas.style.height = sh;
    if (canvas.getContext) {
      ctx = canvas.getContext('2d');
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function startLoop() {
    function frame(ts) {
      if (ts == null) ts = now();
      var dt = 0.016;
      if (lastFrame > 0) dt = Math.min(0.05, (ts - lastFrame) / 1000);
      lastFrame = ts;
      if (view && view.flash > 0) {
        view.flash = Math.max(0, view.flash - dt * 1.8);
      }
      updateSwingBar();
      draw(ts);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function onKey(e) {
    var k = (e && e.key) || '';
    if (els.screenStart.classList.contains('visible') && (k === 'Enter' || k === ' ')) {
      e.preventDefault();
      beginGame();
      return;
    }
    if (els.screenEnd.classList.contains('visible') && (k === 'Enter' || k === ' ')) {
      e.preventDefault();
      beginGame();
      return;
    }
    if (swing) {
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        stopTiming();
      }
      return;
    }
    if (pendingChoice) {
      if (k === '0' || k === ' ') { e.preventDefault(); chooseTake(); return; }
      var idx = parseInt(k, 10);
      if (idx >= 1 && idx <= E.PITCH_ORDER.length) {
        e.preventDefault();
        choosePitch(E.PITCH_ORDER[idx - 1]);
      }
    }
  }

  function buildPitchButtons() {
    els.pitchButtons = {};
    els.zbadges = {};
    for (var i = 0; i < E.PITCH_ORDER.length; i++) {
      (function (key, num) {
        var info = PITCH_INFO[key];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pitch-btn disabled';
        btn.innerHTML = ICONS[info.icon] + '<span class="pname">' + info.btn + '</span>' +
          '<span class="keynum">' + num + '</span>';
        var zb = document.createElement('span');
        zb.className = 'zbadge';
        btn.appendChild(zb);
        btn.style.setProperty('--c', info.color);
        btn.addEventListener('click', function () { choosePitch(key); });
        els.buttons.appendChild(btn);
        els.pitchButtons[key] = btn;
        els.zbadges[key] = zb;
      })(E.PITCH_ORDER[i], i + 1);
    }
  }

  function init() {
    canvas = $('field');
    els.message = $('message');
    els.hint = $('hint');
    els.overlay = $('overlay');
    els.screenStart = $('screen-start');
    els.screenEnd = $('screen-end');
    els.endScore = $('end-score');
    els.endResult = $('end-result');
    els.endHits = $('end-hits');
    els.btnStart = $('btn-start');
    els.btnAgain = $('btn-again');
    els.buttons = $('buttons');
    els.btnTake = $('btn-take');
    els.powerbar = $('powerbar');
    els.pbMarker = $('pb-marker');
    els.ballDots = $('ball-dots');
    els.ballWrap = $('ball-wrap');
    els.chartWrap = $('chart');
    els.chartStyle = $('chart-style');
    els.chartRows = $('chart-rows');
    els.defensePanel = $('defense-panel');
    els.defChips = $('def-chips');
    els.defWarn = $('def-warn');
    els.defReadPct = $('def-read-pct');
    els.defReadFill = $('def-read-fill');
    els.soundBtn = $('sound-btn');
    els.rowAway = $('row-away');
    els.rowHome = $('row-home');
    els.inningLabel = $('inning-label');
    els.phaseLabel = $('phase-label');
    els.strikeDots = $('strike-dots');
    els.stage = $('stage');
    els.banner = $('banner');
    els.bannerMain = $('banner-main');
    els.bannerSub = $('banner-sub');

    buildScoreCells();
    buildPitchButtons();
    resetView();
    resizeCanvas();
    draw();

    els.btnStart.addEventListener('click', function () { beginGame().catch(function () { }); });
    els.btnAgain.addEventListener('click', function () { beginGame().catch(function () { }); });
    els.btnTake.addEventListener('click', function () { chooseTake(); });
    els.stage.addEventListener('click', function () { if (swing) stopTiming(); });
    els.soundBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      els.soundBtn.textContent = 'サウンド: ' + (soundOn ? 'ON' : 'OFF');
      if (soundOn) {
        audio.ensure();
        audio.tone(660, 0.1, { type: 'triangle', vol: 0.08 });
      }
    });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resizeCanvas);
    watchStageSize();

    startLoop();

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'baseball-game',
        title: '9球種を読め! 3回勝負ベースボール',
        start: function () { return beginGame(); },
        autoPlayStep: function () {
          if (swing) {
            if (!swing.target) swing.target = swing.start + 150 + Math.random() * 620;
            if (now() >= swing.target) stopTiming();
            return;
          }
          if (!pendingChoice) return;
          if (state && E.battingTeam(state) === 'home') {
            var past = {};
            for (var pk in state) {
              if (Object.prototype.hasOwnProperty.call(state, pk)) past[pk] = state[pk];
            }
            past.pitcherHistory = state.pitcherHistory.slice(0, Math.max(0, state.pitcherHistory.length - 1));
            var tend = E.pitchTendencies(past);
            var row = tend.rows[state.strikes] || tend.rows[0];
            var weights = {};
            if (row.total >= 3) {
              for (var wi = 0; wi < row.items.length; wi++) weights[row.items[wi].pitch] = row.items[wi].count;
            } else {
              weights = E.tendencyWeights(state);
            }
            var best = null, bestW = -1;
            for (var bi = 0; bi < E.PITCH_ORDER.length; bi++) {
              if (weights[E.PITCH_ORDER[bi]] > bestW) { bestW = weights[E.PITCH_ORDER[bi]]; best = E.PITCH_ORDER[bi]; }
            }
            if (best == null) { chooseTake(); return; }
            if (E.zoneRateFor(state.pitcherStyle, best) < 0.5 && Math.random() < 0.35) {
              chooseTake();
              return;
            }
            choosePitch(best);
          } else {
            choosePitch(E.randomPitch());
          }
        },
        isAwaiting: function () { return !!pendingChoice; },
        isDone: function () { return !!(state && state.over); },
        getState: function () { return state; },
        getView: function () { return view; }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
