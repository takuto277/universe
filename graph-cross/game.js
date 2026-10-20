/* game.js : 画面・入力・2D描画。ルールと曲線の数学は engine.js に任せる */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.GraphCrossEngine) ? window.GraphCrossEngine : null;

  var canvas = null;
  var ctx = null;
  var els = {};
  var slotButtons = [];
  var deckCards = {};
  var selectedDeck = loadDeck();
  var state = null;
  var view = { phase: 'idle', deathAt: 0 };
  var viewW = 960;
  var viewH = 560;
  var dpr = 1;
  var lastTs = 0;
  var particles = [];
  var rings = [];
  var labels = [];
  var shake = 0;
  var flash = 0;
  var flashColor = '255, 255, 255';
  var best = loadBest();

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function $(id) { return document.getElementById(id); }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function loadBest() {
    try {
      if (typeof localStorage === 'undefined') return 0;
      return Math.max(0, parseInt(localStorage.getItem('graph-cross-best') || '0', 10) || 0);
    } catch (e) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('graph-cross-best', String(value));
    } catch (e) { }
  }

  /* ===== HUD ===== */
  function lifeText(hp) {
    var out = '';
    for (var i = 0; i < E.MAX_HP; i++) out += i < hp ? '●' : '○';
    return out;
  }

  function updateHud() {
    var snap = state ? E.snapshot(state) : null;
    if (els.score) els.score.textContent = snap ? String(snap.score) : '0';
    if (els.best) els.best.textContent = String(best);
    if (els.combo) els.combo.textContent = snap && snap.combo > 0 ? 'x' + snap.combo : '-';
    if (els.life) els.life.textContent = snap ? lifeText(snap.hp) : lifeText(E.MAX_HP);
    if (els.life) els.life.classList.toggle('danger', !!(snap && snap.hp <= 1));
  }

  function deckIsValid(deck) {
    if (!Array.isArray(deck) || deck.length !== 3) return false;
    var seen = {};
    for (var i = 0; i < deck.length; i++) {
      if (!E.MODES[deck[i]] || seen[deck[i]]) return false;
      seen[deck[i]] = true;
    }
    return true;
  }

  function loadDeck() {
    var fallback = ['hold', 'up', 'wave'];
    try {
      if (typeof localStorage === 'undefined') return fallback;
      var raw = localStorage.getItem('graph-cross-deck');
      if (!raw) return fallback;
      var deck = JSON.parse(raw);
      return deckIsValid(deck) ? deck : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveDeck() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('graph-cross-deck', JSON.stringify(selectedDeck));
      }
    } catch (e) { }
  }

  function updateSlots() {
    var deck = state ? state.deck : selectedDeck;
    for (var i = 0; i < 3; i++) {
      var btn = slotButtons[i];
      if (!btn) continue;
      var key = deck[i];
      if (!key) {
        btn.innerHTML = '<b>-</b><span>空き</span><em>' + (i + 1) + '</em>';
        btn.disabled = true;
        btn.classList.remove('active');
        continue;
      }
      var mode = E.MODES[key];
      btn.innerHTML = '<b>' + mode.label + '</b><span>' + mode.note + '</span><em>' + (i + 1) + '</em>';
      btn.style.setProperty('--mode-color', mode.color);
      btn.disabled = !(state && view.phase === 'run' && !state.over);
      btn.classList.toggle('active', !!(state && state.mode === key));
    }
  }

  function updateDeckUi() {
    if (els.deckCount) els.deckCount.textContent = selectedDeck.length + '/' + 3;
    for (var key in deckCards) {
      if (!Object.prototype.hasOwnProperty.call(deckCards, key)) continue;
      deckCards[key].classList.toggle('selected', selectedDeck.indexOf(key) >= 0);
    }
    if (els.btnStart) {
      var ready = selectedDeck.length === 3;
      els.btnStart.disabled = !ready;
      els.btnStart.classList.toggle('disabled', !ready);
    }
    updateSlots();
  }

  function toggleDeck(key) {
    if (!E.MODES[key]) return;
    var idx = selectedDeck.indexOf(key);
    if (idx >= 0) selectedDeck.splice(idx, 1);
    else if (selectedDeck.length < 3) selectedDeck.push(key);
    else return;
    saveDeck();
    updateDeckUi();
  }

  function showStart() {
    if (els.screenStart) els.screenStart.classList.add('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    view.phase = 'idle';
    updateDeckUi();
  }

  function beginRun() {
    if (selectedDeck.length !== 3) return;
    state = E.createGame({ width: viewW, height: viewH, deck: selectedDeck.slice() });
    view.phase = 'run';
    view.deathAt = 0;
    particles = [];
    rings = [];
    labels = [];
    shake = 0;
    flash = 0;
    lastTs = 0;
    if (els.screenStart) els.screenStart.classList.remove('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    if (els.btnStart && els.btnStart.blur) els.btnStart.blur();
    if (els.btnAgain && els.btnAgain.blur) els.btnAgain.blur();
    updateSlots();
    updateHud();
  }

  function showEnd() {
    view.phase = 'over';
    var snap = E.snapshot(state);
    if (snap.score > best) {
      best = snap.score;
      saveBest(best);
    }
    if (els.endScore) els.endScore.textContent = String(snap.score);
    if (els.endBest) els.endBest.textContent = String(best);
    if (els.endCombo) els.endCombo.textContent = 'x' + snap.maxCombo;
    if (els.endX) els.endX.textContent = String(snap.x);
    if (els.screenEnd) els.screenEnd.classList.add('visible');
    updateSlots();
    updateHud();
  }

  /* ===== 入力 ===== */
  function selectSlot(index) {
    if (!state || view.phase !== 'run' || state.over) return;
    var key = state.deck[index];
    if (key && E.setMode(state, key)) updateSlots();
  }

  function startOrRestart() {
    if ((view.phase === 'idle' || view.phase === 'over') && selectedDeck.length === 3) beginRun();
  }

  function backToDeck() {
    state = null;
    view.phase = 'idle';
    particles = [];
    rings = [];
    labels = [];
    shake = 0;
    flash = 0;
    updateHud();
    showStart();
  }

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === ' ' || k === 'Enter') {
      if (e.preventDefault) e.preventDefault();
      startOrRestart();
      return;
    }
    if (k === '1') selectSlot(0);
    else if (k === '2') selectSlot(1);
    else if (k === '3') selectSlot(2);
  }

  /* ===== エフェクト ===== */
  function spawnParticles(x, y, count, colors, speed, life) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = speed * (0.3 + Math.random() * 0.9);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.7),
        max: life,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 160
      });
    }
  }

  function addRing(x, y, color, radius, life) {
    rings.push({ x: x, y: y, color: color, r: 6, maxR: radius, life: life, max: life });
  }

  function addLabel(x, y, text, color, size) {
    labels.push({ x: x, y: y, text: text, color: color, size: size || 18, life: 0.9, max: 0.9 });
  }

  function processEvents() {
    if (!state) return;
    var events = E.consumeEvents(state);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'hit') {
        var colors = ['#5ff0ff', '#ff7ad9', '#ffd166', '#ffffff'];
        var mult = ev.mult || 1;
        spawnParticles(ev.x, ev.y, ev.perfect ? 50 : 34, colors, 300, 0.9);
        addRing(ev.x, ev.y, 'rgba(120, 240, 255, 0.95)', 60 + Math.min(80, (ev.combo || 1) * 6) + (mult - 1) * 45, 0.55);
        addRing(ev.x, ev.y, 'rgba(255, 122, 217, 0.75)', 36 + (mult - 1) * 20, 0.42);
        addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.65)', 22, 0.3);
        addLabel(ev.x, ev.y - 24, '+' + ev.gain, '#ffd166', 24);
        addLabel(ev.x, ev.y + 28, 'CROSS x' + ev.combo + ' / ' + (ev.angle || 0) + '°', '#9ffaff', 13);
        if (ev.perfect) {
          addLabel(ev.x, ev.y - 56, 'STEEP CROSS x' + mult, '#ffd166', 14);
          addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.9)', 90, 0.5);
          shake = Math.max(shake, 0.9);
        }
        shake = Math.max(shake, 0.7);
        flash = Math.max(flash, 0.28);
        flashColor = '180, 245, 255';
        if (ev.heal) {
          addLabel(ev.x, ev.y + 52, 'LIFE +1', '#57e08a', 14);
          addRing(ev.x, ev.y, 'rgba(87, 224, 138, 0.8)', 60, 0.5);
        }
      } else if (ev.type === 'miss') {
        spawnParticles(ev.x, ev.y, 14, ['#ff4d8d', '#ff8f6b'], 190, 0.6);
        addLabel(ev.x + 60, ev.y, 'MISS', '#ff6b5e', 15);
        shake = Math.max(shake, 0.6);
        flash = Math.max(flash, 0.3);
        flashColor = '255, 77, 141';
      } else if (ev.type === 'over') {
        shake = 1;
        flash = 0.65;
        flashColor = '255, 77, 141';
      }
    }
  }

  function updateEffects(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.6);
      p.vy *= Math.exp(-dt * 0.4);
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i];
      r.life -= dt;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      r.r += (r.maxR - r.r) * Math.min(1, dt * 14);
    }
    for (i = labels.length - 1; i >= 0; i--) {
      var l = labels[i];
      l.life -= dt;
      if (l.life <= 0) { labels.splice(i, 1); continue; }
      l.y -= dt * 34;
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 2.4);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.4);
  }

  /* ===== 描画 ===== */
  function drawGrid(time) {
    var w = viewW, h = viewH;
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a1424');
    grad.addColorStop(0.6, '#070d18');
    grad.addColorStop(1, '#05080f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    var worldX = state ? state.worldX : time * 90;
    var headX = state ? state.headX : w * 0.28;
    var top = state ? state.top : clamp(h * 0.11, 44, 76);
    var bottom = state ? state.bottom : h - clamp(h * 0.11, 44, 76) - 16;

    ctx.lineWidth = 1;
    var spacing = 74;
    var offset = -((worldX) % spacing);
    for (var x = offset - spacing; x < w + spacing; x += spacing) {
      var worldAt = worldX + (x - headX);
      var world = Math.round(worldAt);
      var major = Math.round(worldAt / spacing) % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(80, 170, 220, 0.16)' : 'rgba(80, 170, 220, 0.07)';
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom + 18);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = 'rgba(120, 190, 230, 0.42)';
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillText('x=' + world, x + 4, h - 10);
      }
    }

    ctx.strokeStyle = 'rgba(80, 170, 220, 0.08)';
    for (var y = top; y <= bottom; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(95, 240, 255, 0.20)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, bottom);
    ctx.lineTo(w, bottom);
    ctx.stroke();

    if (!state) {
      ctx.strokeStyle = 'rgba(95, 240, 255, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i = 0; i <= 80; i++) {
        var px = i / 80 * w;
        var py = (top + bottom) / 2 + Math.sin(i * 0.22 + time * 1.4) * 46;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 122, 217, 0.12)';
      ctx.beginPath();
      for (i = 0; i <= 80; i++) {
        px = i / 80 * w;
        py = (top + bottom) / 2 + Math.cos(i * 0.17 - time * 1.1) * 70;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  function drawRivals(time) {
    if (!state) return;
    for (var i = 0; i < state.rivals.length; i++) {
      var r = state.rivals[i];
      if (r.x > viewW + 40 || r.x + r.len < -40) continue;
      var points = 26;
      ctx.beginPath();
      for (var j = 0; j <= points; j++) {
        var local = r.len * j / points;
        var px = r.x + local;
        var py = E.rivalY(r, local);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.save();
      ctx.shadowColor = 'rgba(255, 80, 170, 0.65)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(255, 105, 185, 0.92)';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 220, 245, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 150, 205, 0.75)';
      ctx.font = '10px ui-monospace, Menlo, monospace';
      var labelY = E.rivalY(r, 0) - 8;
      if (labelY < state.top + 10) labelY = E.rivalY(r, 0) + 16;
      ctx.fillText(r.label, r.x + 4, labelY);
    }
  }

  function drawPlayer(time) {
    if (!state) return;
    var trail = state.trail;
    if (!trail.length) return;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(80, 230, 255, 0.8)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(95, 240, 255, 0.22)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (var i = 0; i < trail.length; i++) {
      if (i === 0) ctx.moveTo(trail[i].x, trail[i].y);
      else ctx.lineTo(trail[i].x, trail[i].y);
    }
    ctx.stroke();
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(120, 245, 255, 0.98)';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    var mode = E.MODES[state.mode] || E.MODES.hold;
    var start = Math.max(0, trail.length - 14);
    if (trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = mode.color;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (i = start; i < trail.length; i++) {
        if (i === start) ctx.moveTo(trail[i].x, trail[i].y);
        else ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    var hx = state.headX;
    var hy = state.y;
    ctx.save();
    ctx.shadowColor = mode.color;
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mode.color;
    ctx.beginPath();
    ctx.arc(hx, hy, 10 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.fillStyle = mode.color;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText(mode.label, hx + 15, hy - 12);
  }

  function drawEffects() {
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i];
      var a = clamp(r.life / r.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2 + 2 * a;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      var pa = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = pa;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    for (i = 0; i < labels.length; i++) {
      var l = labels[i];
      var la = clamp(l.life / l.max, 0, 1);
      ctx.globalAlpha = la;
      ctx.fillStyle = l.color;
      ctx.font = '900 ' + l.size + 'px "Hiragino Kaku Gothic ProN", system-ui, sans-serif';
      ctx.fillText(l.text, l.x - 10, l.y);
    }
    ctx.globalAlpha = 1;
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * 18 * shake, (Math.random() - 0.5) * 18 * shake);
    }
    drawGrid(time);
    drawRivals(time);
    drawPlayer(time);
    drawEffects();
    if (flash > 0) {
      ctx.fillStyle = 'rgba(' + flashColor + ', ' + (flash * 0.5) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    ctx.restore();
  }

  /* ===== ループ・サイズ ===== */
  function resizeCanvas() {
    if (!canvas) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var w = canvas.clientWidth || (els.stage && els.stage.clientWidth) || 960;
    var h = canvas.clientHeight || (els.stage && els.stage.clientHeight) || 560;
    if (w <= 0) w = 960;
    if (h <= 0) h = 560;
    viewW = w;
    viewH = h;
    var pw = Math.max(2, Math.round(w * dpr));
    var ph = Math.max(2, Math.round(h * dpr));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    if (state) E.resize(state, w, h);
  }

  function watchStageSize() {
    if (typeof ResizeObserver === 'undefined' || !els.stage) return;
    var observer = new ResizeObserver(function () { resizeCanvas(); });
    observer.observe(els.stage);
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);

    if (view.phase === 'run' && state && !state.over) {
      E.update(state, dt);
      processEvents();
      if (state.over) {
        view.phase = 'dying';
        view.deathAt = ts;
        updateSlots();
      } else {
        updateHud();
      }
    } else if (view.phase === 'dying' && state && state.over) {
      if (ts - view.deathAt > 700) showEnd();
    }

    updateEffects(dt);
    draw(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  /* ===== 初期化 ===== */
  function init() {
    canvas = $('arena');
    els.stage = $('stage');
    els.score = $('score');
    els.best = $('best');
    els.combo = $('combo');
    els.life = $('life');
    els.screenStart = $('screen-start');
    els.screenEnd = $('screen-end');
    els.btnStart = $('btn-start');
    els.btnAgain = $('btn-again');
    els.btnDeck = $('btn-deck');
    els.deckCount = $('deck-count');
    els.endScore = $('end-score');
    els.endBest = $('end-best');
    els.endCombo = $('end-combo');
    els.endX = $('end-x');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }

    var keys = E.MODE_KEYS;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var card = $('card-' + key);
      if (!card) continue;
      deckCards[key] = card;
      card.style.setProperty('--mode-color', E.MODES[key].color);
      (function (modeKey, el) {
        el.addEventListener('click', function () {
          toggleDeck(modeKey);
          if (el.blur) el.blur();
        });
      })(key, card);
    }

    for (i = 0; i < 3; i++) {
      var slot = $('slot-' + i);
      if (!slot) continue;
      slotButtons.push(slot);
      (function (index, el) {
        el.addEventListener('click', function () {
          selectSlot(index);
          if (el.blur) el.blur();
        });
      })(i, slot);
    }

    if (els.btnStart) els.btnStart.addEventListener('click', beginRun);
    if (els.btnAgain) els.btnAgain.addEventListener('click', beginRun);
    if (els.btnDeck) els.btnDeck.addEventListener('click', backToDeck);
    if (canvas) {
      canvas.addEventListener('pointerdown', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (view.phase !== 'run' || !state || state.over) return;
        var index = state.deck.indexOf(state.mode);
        selectSlot((index + 1) % state.deck.length);
      });
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resizeCanvas);

    resizeCanvas();
    watchStageSize();
    updateHud();
    updateDeckUi();
    showStart();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'graph-cross',
        title: 'グラフクロス',
        start: function () { beginRun(); },
        autoPlayStep: function () {},
        isDone: function () { return !!(state && state.over && view.phase === 'over'); },
        getState: function () {
          if (!state) return { phase: view.phase, over: false, score: 0, best: best };
          var snap = E.snapshot(state);
          snap.phase = view.phase;
          snap.best = best;
          return snap;
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
