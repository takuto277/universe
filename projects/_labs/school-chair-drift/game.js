(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.SchoolChairDriftEngine;
  if (!E) return;
  var T = root.THREE;
  var Audio = root.SoccerAudio;

  var canvas = null;
  var renderer = null;
  var scene = null;
  var camera = null;
  var stageGroup = null;
  var racerGroups = [];
  var itemMeshes = [];
  var trapMeshes = [];
  var shadowMeshes = [];
  var els = {};
  var game = null;
  var mode = 'title';
  var shownScreen = 'screen-title';
  var stageIndex = 0;
  var lastTs = 0;
  var pointer = null;
  var keySteer = 0;
  var toastTimer = null;
  var resultDelay = 0;
  var flashTimer = null;
  var itemSignatures = {};
  var trapSignatures = {};

  var HORIZON_Y = 2.95;
  var TRACK_W = 5.2;

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function wrapS(s, len) { while (s < 0) s += len; while (s >= len) s -= len; return s; }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function stageData() { return E.STAGES[game.stage]; }
  function playerRacer() { return game.racers[0]; }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var screens = [
      ['screen-title', els.screenTitle], ['screen-over', els.screenOver],
      ['screen-stage', els.screenStage], ['screen-ending', els.screenEnding],
      ['screen-pause', els.screenPause]
    ];
    for (var i = 0; i < screens.length; i++) {
      if (screens[i][1]) screens[i][1].classList.toggle('visible', screens[i][0] === name);
    }
  }

  function toast(text, color) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.style.color = color || '';
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 1200);
  }

  function flash(color) {
    if (!els.flash) return;
    els.flash.style.background = color || '#eafff4';
    els.flash.style.opacity = '0.65';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { els.flash.style.opacity = '0'; }, 80);
  }

  function showTitle() {
    mode = 'title';
    game = null;
    stageIndex = 0;
    pointer = null;
    resultDelay = 0;
    setScreen('screen-title');
    if (els.hud) els.hud.classList.add('hidden');
    if (els.itemBtn) els.itemBtn.classList.add('hidden');
    if (els.pause) els.pause.classList.add('hidden');
    if (els.countdown) els.countdown.textContent = '';
    if (els.driftHud) els.driftHud.style.display = 'none';
    if (scene) scene.background = new T.Color(0x07110d);
    if (stageGroup) clearStage();
    lastTs = 0;
  }

  function beginStage() {
    mode = 'match';
    if (Audio) Audio.start();
    game = E.createGame({ stage: stageIndex });
    pointer = null;
    keySteer = 0;
    resultDelay = 0;
    setScreen(null);
    if (els.hud) els.hud.classList.remove('hidden');
    if (els.pause) els.pause.classList.remove('hidden');
    if (els.itemBtn) els.itemBtn.classList.add('hidden');
    if (els.driftHud) els.driftHud.style.display = '';
    if (els.countdown) els.countdown.textContent = '';
    if (renderer) buildSchool();
    lastTs = 0;
    syncUI();
  }

  function syncAudioButton() {
    if (!els.sound) return;
    var muted = Audio ? Audio.isMuted() : true;
    els.sound.classList.toggle('muted', muted);
    els.sound.setAttribute('aria-label', muted ? 'BGMを再生' : 'BGMを消音');
  }
  function toggleAudio() { if (Audio) { Audio.toggle(); syncAudioButton(); } }

  function pauseGame() {
    if (!game || (game.phase !== 'playing' && game.phase !== 'countdown') || game.paused) return;
    pointer = null;
    E.setSteer(game, 0);
    game.paused = true;
    E.setPaused(game, true);
    setScreen('screen-pause');
    syncUI();
  }
  function resumeGame() {
    if (!game || !game.paused) return;
    game.paused = false;
    E.setPaused(game, false);
    setScreen(null);
    lastTs = 0;
    syncUI();
  }
  function togglePause() { if (game) { if (game.paused) resumeGame(); else pauseGame(); } }

  function useItem() {
    if (!game || game.phase !== 'playing') return;
    if (E.useItem(game, 'player')) {
      processEvents();
      syncUI();
    }
  }

  function itemLabel(item) {
    if (item === 'milk') return 'MILK!';
    if (item === 'eraser') return 'ERASER';
    if (item === 'tray') return 'TRAY';
    return 'ITEM';
  }

  function syncUI() {
    if (els.hud) els.hud.classList.toggle('hidden', mode !== 'match');
    if (!game) return;
    var st = E.getState(game);
    var lap = Math.min(st.lap, st.laps);
    if (els.lap) els.lap.textContent = lap + '/' + st.laps;
    if (els.rank) els.rank.textContent = st.place + '/' + st.racers.length;
    if (els.turn) els.turn.textContent = st.phase === 'countdown' ? 'READY' : st.stageName;
    if (els.shots) els.shots.textContent = st.phase === 'countdown' ? 'START IN ' + Math.max(0, Math.min(3, Math.ceil(st.countdown))) : 'RANK ' + st.place + '/' + st.racers.length + ' · ' + Math.round(st.progress * 100) + '%';
    if (els.countdown) {
      els.countdown.textContent = st.phase === 'countdown' ? String(Math.max(1, Math.min(3, Math.ceil(st.countdown)))) : '';
    }
    if (els.driftFill) els.driftFill.style.width = Math.round(st.player.drift * 100) + '%';
    if (els.toast && st.player.boost > 0 && !els.toast.classList.contains('show')) { /* reserved */ }
    if (els.itemBtn) {
      var show = st.phase === 'playing' && st.player.item;
      els.itemBtn.classList.toggle('hidden', !show);
      els.itemBtn.classList.remove('milk', 'eraser', 'tray');
      if (show) {
        els.itemBtn.textContent = itemLabel(st.player.item);
        els.itemBtn.classList.add(st.player.item);
        els.itemBtn.disabled = false;
      }
    }
    var target = null;
    if (resultDelay > 0) target = null;
    else if (st.phase === 'clear') target = st.stage + 1 < st.stageTotal ? 'screen-stage' : 'screen-ending';
    else if (st.phase === 'over') target = 'screen-over';
    else if (st.paused) target = 'screen-pause';
    setScreen(target);
    if (els.pause) els.pause.classList.toggle('hidden', !((st.phase === 'playing' || st.phase === 'countdown') && !st.paused));
    if (st.phase === 'clear' && st.stage + 1 < st.stageTotal) {
      if (els.stageClearText) els.stageClearText.textContent = '1位でフィニッシュ！ 次は ' + E.STAGES[st.stage + 1].name;
    }
    if (st.phase === 'over') {
      if (els.overRank) els.overRank.textContent = st.place + '/' + st.racers.length;
      if (els.overLap) els.overLap.textContent = lap + '/' + st.laps;
      if (els.overStage) els.overStage.textContent = (st.stage + 1) + '/' + st.stageTotal;
      if (els.overSub) els.overSub.textContent = st.reason === 'timeup' ? 'タイムアップ。' : '1位でないと次のコースへ進めない。';
    }
  }

  /* ---------- Three.js school ---------- */
  function material(color, emissive) {
    return new T.MeshStandardMaterial({
      color: color, roughness: 0.82, metalness: 0.04,
      emissive: emissive || 0x000000, emissiveIntensity: emissive ? 0.7 : 0,
      side: T.DoubleSide
    });
  }
  function addBox(group, w, h, d, x, y, z, color, rotY, emissive) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), material(color, emissive));
    m.position.set(x, y, z);
    if (rotY) m.rotation.y = rotY;
    group.add(m);
    return m;
  }
  function addPlane(group, w, h, x, y, z, rotY, color, emissive) {
    var m = new T.Mesh(new T.PlaneGeometry(w, h), material(color, emissive));
    m.position.set(x, y, z);
    m.rotation.y = rotY || 0;
    group.add(m);
    return m;
  }
  function textPlane(text, color) {
    if (!T || typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = 'rgba(5,18,12,0.9)';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = color || '#8ff0d0';
    g.strokeRect(2, 2, 252, 60);
    g.fillStyle = color || '#dfffea';
    g.font = '900 30px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    var tex = new T.CanvasTexture(c);
    tex.minFilter = T.LinearFilter;
    return new T.Mesh(new T.PlaneGeometry(3.4, 0.85), new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide }));
  }

  function clearStage() {
    if (!stageGroup) return;
    scene.remove(stageGroup);
    stageGroup.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    stageGroup = null;
    racerGroups = [];
    itemMeshes = [];
    trapMeshes = [];
    itemSignatures = {};
    trapSignatures = {};
  }

  function pointOf(s) { return E.coursePoint(stageData(), s); }
  function tangentOf(s) { return E.courseTangent(stageData(), s); }
  function normalOf(s) { return E.courseNormal(stageData(), s); }

  function buildTrackMesh(group, y, color, widthScale, emissive) {
    var st = stageData();
    var n = 220;
    var verts = [], idx = [];
    for (var i = 0; i <= n; i++) {
      var s = st.length * i / n;
      var p = pointOf(s);
      var normal = normalOf(s);
      var hw = st.halfWidth * (widthScale == null ? 1 : widthScale);
      verts.push(p.x + normal.x * hw, y, p.z + normal.z * hw);
      verts.push(p.x - normal.x * hw, y, p.z - normal.z * hw);
    }
    for (i = 0; i < n; i++) {
      var a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    var mesh = new T.Mesh(geo, material(color, emissive));
    group.add(mesh);
    return mesh;
  }

  function zoneFor(s) {
    var t = wrapS(s, stageData().length) / stageData().length;
    if (t < 0.09) return 'entrance';
    if (t < 0.30) return 'classroom';
    if (t < 0.55) return 'gym';
    if (t < 0.74) return 'special';
    return 'corridor';
  }

  function buildWallRing(group, inner, color) {
    var st = stageData();
    var n = 72;
    for (var i = 0; i < n; i++) {
      var s1 = st.length * i / n;
      var s2 = st.length * (i + 1) / n;
      var mid = (s1 + s2) / 2;
      var zone = zoneFor(mid);
      if (!inner && (zone === 'entrance' || zone === 'classroom' || zone === 'gym')) continue;
      var p1 = pointOf(s1), p2 = pointOf(s2);
      var n1 = normalOf(s1), n2 = normalOf(s2);
      var off = inner ? st.halfWidth + 0.10 : -(st.halfWidth + 0.15);
      var x1 = p1.x + n1.x * off, z1 = p1.z + n1.z * off;
      var x2 = p2.x + n2.x * off, z2 = p2.z + n2.z * off;
      var mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      var len = Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1)) + 0.04;
      var angle = Math.atan2(x2 - x1, z2 - z1);
      addBox(group, 0.12, inner ? 0.92 : 2.9, len, mx, inner ? 0.46 : 1.45, mz, color, angle);
      if (inner) {
        addBox(group, 0.16, 0.14, len, mx, 1.22, mz, 0x8ff0d0, angle, 0x2b6b58);
      }
    }
  }

  function addLockerRow(group, s1, s2, side, color) {
    var st = stageData();
    var steps = 7;
    for (var i = 0; i < steps; i++) {
      var s = s1 + (s2 - s1) * i / steps;
      var p = pointOf(s);
      var normal = normalOf(s);
      var tangent = tangentOf(s);
      var off = side * (st.halfWidth + 0.38);
      addBox(group, 0.55, 1.55, 0.55, p.x + normal.x * off, 0.78, p.z + normal.z * off, color, Math.atan2(tangent.x, tangent.z), 0x183c32);
    }
  }

  function buildRoom(group, sMid, type) {
    var st = stageData();
    var p = pointOf(sMid);
    var tangent = tangentOf(sMid);
    var normal = normalOf(sMid);
    var angle = Math.atan2(tangent.x, tangent.z);
    var room = new T.Group();
    room.position.set(p.x, 0, p.z);
    room.rotation.y = angle;
    group.add(room);
    var depth = type === 'gym' ? 13 : 7;
    var width = type === 'gym' ? 22 : 13;
    var baseX = st.halfWidth + depth / 2;
    var floorColor = type === 'gym' ? 0xa87950 : (type === 'classroom' ? 0x8a765b : 0x5e8a79);
    // Local +X is outward from the track at this point.
    addBox(room, depth, 0.08, width, baseX, 0.02, 0, floorColor);
    addBox(room, 0.16, type === 'gym' ? 5.6 : 3.0, width, st.halfWidth + depth, (type === 'gym' ? 2.8 : 1.5), 0, type === 'gym' ? 0x3c6f62 : 0x6d5b45);
    addBox(room, depth, type === 'gym' ? 5.6 : 3.0, 0.16, baseX, (type === 'gym' ? 2.8 : 1.5), width / 2, 0x4d5e50);
    addBox(room, depth, type === 'gym' ? 5.6 : 3.0, 0.16, baseX, (type === 'gym' ? 2.8 : 1.5), -width / 2, 0x4d5e50);
    if (type === 'gym') {
      // court lines and hoops
      for (var line = -2; line <= 2; line++) {
        addBox(room, 0.025, 0.012, width * 0.84, baseX + line * 1.9, 0.08, 0, 0xd7a75b);
      }
      addBox(room, 0.08, 0.08, width * 0.84, baseX, 0.1, 0, 0xf3d48e);
      addBox(room, 0.4, 2.1, 0.4, st.halfWidth + 1.2, 1.05, width / 2 - 0.7, 0x8a5e3a);
      addBox(room, 0.4, 2.1, 0.4, st.halfWidth + 1.2, 1.05, -width / 2 + 0.7, 0x8a5e3a);
      addBox(room, 0.08, 0.08, 1.1, st.halfWidth + 1.2, 2.6, width / 2 - 0.7, 0xffd166, 0, 0xffd166);
      addBox(room, 0.08, 0.08, 1.1, st.halfWidth + 1.2, 2.6, -width / 2 + 0.7, 0xffd166, 0, 0xffd166);
      var sign = textPlane('体育館', '#8ff0d0');
      if (sign) { sign.position.set(st.halfWidth + depth + 0.02, 3.8, 0); sign.rotation.y = -Math.PI / 2; room.add(sign); }
    } else {
      // desks, blackboard, windows
      for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
          addBox(room, 0.55, 0.5, 0.9, st.halfWidth + 2.0 + i * 0.8, 0.35, j * 1.35, 0x76563d);
          addBox(room, 0.56, 0.36, 0.92, st.halfWidth + 2.0 + i * 0.8, 0.68, j * 1.35, 0x9b7651);
        }
      }
      addBox(room, 0.08, 1.2, width * 0.64, st.halfWidth + depth - 0.08, 1.5, 0, 0x1e342b);
      var classSign = textPlane(type === 'special' ? '特別教室' : '教室', '#ffd166');
      if (classSign) { classSign.position.set(st.halfWidth + depth - 0.2, 2.45, 0); classSign.rotation.y = -Math.PI / 2; room.add(classSign); }
    }
  }

  function addCorridorSigns(group) {
    var st = stageData();
    var signs = [
      { s: st.length * 0.03, text: '昇降口', color: '#8ff0d0' },
      { s: st.length * 0.37, text: '体育館', color: '#ffd166' },
      { s: st.length * 0.62, text: '階段', color: '#8ff0d0' },
      { s: st.length * 0.80, text: '特別教室', color: '#ffd166' }
    ];
    for (var i = 0; i < signs.length; i++) {
      var p = pointOf(signs[i].s);
      var n = normalOf(signs[i].s);
      var t = tangentOf(signs[i].s);
      var sign = textPlane(signs[i].text, signs[i].color);
      if (!sign) continue;
      sign.position.set(p.x - n.x * (st.halfWidth + 0.16), 2.15, p.z - n.z * (st.halfWidth + 0.16));
      sign.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
      group.add(sign);
    }
  }

  function buildSchool() {
    var st = stageData();
    stageGroup = new T.Group();
    scene.add(stageGroup);
    buildTrackMesh(stageGroup, 0.0, st.floor === 1 ? 0x5f614b : (st.floor === 2 ? 0x536557 : 0x4b5d62), 1);
    buildTrackMesh(stageGroup, 0.03, 0x7d6a4f, 0.86);
    // courtyard grass
    var courtGeo = new T.CircleGeometry(1, 64);
    var court = new T.Mesh(courtGeo, material(0x284f35));
    court.rotation.x = -Math.PI / 2;
    court.scale.set(st.a - 4, st.b - 4, 1);
    court.position.y = -0.04;
    stageGroup.add(court);
    // walls and rooms
    buildWallRing(stageGroup, true, 0x6b7d69);
    buildWallRing(stageGroup, false, st.floor === 1 ? 0x6f6654 : 0x5f6e67);
    buildRoom(stageGroup, st.length * 0.25, 'classroom');
    buildRoom(stageGroup, st.length * 0.50, 'gym');
    buildRoom(stageGroup, st.length * 0.73, 'special');
    addLockerRow(stageGroup, 0, st.length * 0.045, 1, 0x416d86);
    addLockerRow(stageGroup, 0, st.length * 0.045, -1, 0x416d86);
    addCorridorSigns(stageGroup);
    // ceiling
    buildTrackMesh(stageGroup, HORIZON_Y, 0x18251f, 1.04);

    // obstacles
    var i;
    for (i = 0; i < game.obstacles.length; i++) {
      var o = game.obstacles[i];
      var op = pointOf(o.s);
      var on = normalOf(o.s);
      var ot = tangentOf(o.s);
      var x = op.x + on.x * o.off, z = op.z + on.z * o.off;
      var col = o.kind === 'locker' ? 0x315a72 : (o.kind === 'bucket' ? 0x507f7b : (o.kind === 'cart' ? 0x8a663f : (o.kind === 'plant' ? 0x2b5a3b : 0x5e4734)));
      var mesh = addBox(stageGroup, o.w, o.kind === 'locker' ? 1.4 : 0.62, o.h, x, o.kind === 'locker' ? 0.7 : 0.31, z, col, Math.atan2(ot.x, ot.z));
      mesh.userData.obstacle = i;
    }
    racerGroups = [];
    for (i = 0; i < game.racers.length; i++) {
      var rg = buildChair(game.racers[i].team, i === 0);
      scene.add(rg);
      racerGroups.push(rg);
    }
    itemMeshes = [];
    for (i = 0; i < game.itemBoxes.length; i++) {
      var b = game.itemBoxes[i];
      var bp = pointOf(b.s), bn = normalOf(b.s), bt = tangentOf(b.s);
      var cube = new T.Mesh(new T.BoxGeometry(0.75, 0.75, 0.75), material(0x3b8c77, 0x2b6b58));
      cube.position.set(bp.x + bn.x * b.x, 0.7, bp.z + bn.z * b.x);
      cube.rotation.y = Math.atan2(bt.x, bt.z);
      stageGroup.add(cube);
      itemMeshes.push(cube);
    }
  }

  function buildChair(team, player) {
    var group = new T.Group();
    var color = team === 'cpu' ? 0xff8fbd : 0x8ff0d0;
    var seat = team === 'cpu' ? 0x5e2148 : 0x1c5c48;
    addBox(group, 0.8, 0.18, 0.8, 0, 0.5, 0, seat);
    addBox(group, 0.7, 0.8, 0.16, 0, 0.95, -0.32, seat);
    addBox(group, 0.16, 0.22, 0.8, -0.44, 0.68, 0, color, 0, color);
    addBox(group, 0.16, 0.22, 0.8, 0.44, 0.68, 0, color, 0, color);
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      var wheel = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.12, 8), material(0x111a15));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(Math.cos(a) * 0.48, 0.12, Math.sin(a) * 0.48);
      group.add(wheel);
    }
    var body = new T.Mesh(new T.CylinderGeometry(0.27, 0.32, 0.55, 10), material(0x7df5c7));
    body.position.set(0, 1.05, 0.02);
    group.add(body);
    var head = new T.Mesh(new T.SphereGeometry(0.25, 12, 10), material(0xffd166));
    head.position.set(0, 1.5, 0.02);
    group.add(head);
    if (player) {
      var ring = new T.Mesh(new T.TorusGeometry(0.58, 0.035, 6, 24), new T.MeshBasicMaterial({ color: 0xffd166 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.06;
      group.add(ring);
    }
    return group;
  }

  function racerWorld(r) {
    var p = pointOf(r.s);
    var n = normalOf(r.s);
    var t = tangentOf(r.s);
    return { x: p.x + n.x * r.x, z: p.z + n.z * r.x, angle: Math.atan2(t.x, t.z), t: t, n: n };
  }

  function updateScene(dt) {
    if (!renderer || !game) return;
    for (var i = 0; i < racerGroups.length; i++) {
      var r = game.racers[i];
      var g = racerGroups[i];
      if (!g) continue;
      if (r.finished) { g.visible = false; continue; }
      g.visible = true;
      var w = racerWorld(r);
      g.position.set(w.x, 0.02, w.z);
      g.rotation.y = w.angle;
      if (r.isPlayer) g.rotation.z = clamp(r.steer * 0.05, -0.05, 0.05);
    }
    for (i = 0; i < itemMeshes.length; i++) itemMeshes[i].visible = game.itemBoxes[i].cooldown <= 0;
    // dynamic traps
    var live = {};
    for (i = 0; i < game.traps.length; i++) {
      var trap = game.traps[i];
      live['t' + i] = true;
      if (!trapMeshes[i]) {
        var mesh = new T.Mesh(new T.BoxGeometry(0.42, 0.12, 0.22), material(0xff8fbd, 0x5e2148));
        trapMeshes[i] = mesh;
        scene.add(mesh);
      }
      var tp = pointOf(trap.s), tn = normalOf(trap.s);
      trapMeshes[i].position.set(tp.x + tn.x * trap.x, 0.18, tp.z + tn.z * trap.x);
      trapMeshes[i].visible = true;
    }
    for (i = 0; i < trapMeshes.length; i++) {
      if (!live['t' + i] && trapMeshes[i]) trapMeshes[i].visible = false;
    }
    // player camera
    var p = playerRacer();
    var cp = pointOf(p.s);
    var ct = tangentOf(p.s);
    var cn = normalOf(p.s);
    var camS = wrapS(p.s - 8.2, stageData().length);
    var camP = pointOf(camS);
    var camN = normalOf(camS);
    var lookS = wrapS(p.s + 10, stageData().length);
    var lookP = pointOf(lookS);
    var lookN = normalOf(lookS);
    camera.position.set(camP.x + camN.x * p.x * 0.12, 2.3, camP.z + camN.z * p.x * 0.12);
    camera.lookAt(lookP.x + lookN.x * p.x * 0.3, 0.78, lookP.z + lookN.z * p.x * 0.3);
  }

  function resizeCanvas() {
    if (!renderer) return;
    renderer.setPixelRatio(1);
    renderer.setSize(480, 800, false);
  }

  function processEvents() {
    if (!game) return;
    var events = E.consumeEvents(game);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'itemBox' && ev.id === 'player') toast('GET ' + itemLabel(ev.item), '#8ff0d0');
      else if (ev.type === 'itemUse' && ev.id === 'player') toast(itemLabel(ev.item), ev.item === 'eraser' ? '#ff8fbd' : '#ffd166');
      else if (ev.type === 'trapHit' && ev.id === 'player') { toast('SPIN OUT!', '#ff8fbd'); flash('#ff8fbd'); }
      else if (ev.type === 'shieldBlock' && ev.id === 'player') toast('BLOCK!', '#5ee7ff');
      else if (ev.type === 'boost' && ev.id === 'player') toast('MINI TURBO!', '#ffd166');
      else if (ev.type === 'crash' && ev.id === 'player') toast('CRASH', '#ffd166');
      else if (ev.type === 'lap' && ev.id === 'player') toast('LAP ' + ev.lap, '#ffd166');
      else if (ev.type === 'finish' && ev.id === 'player') {
        flash('#eafff4');
        toast(ev.order === 1 ? '1ST PLACE!' : 'FINISH ' + ev.order + '位', ev.order === 1 ? '#8ff0d0' : '#ffd166');
        resultDelay = 1.4;
      } else if (ev.type === 'raceover') resultDelay = 1.4;
      else if (ev.type === 'timeup') { resultDelay = 1.2; toast('TIME UP', '#ff8fbd'); }
    }
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts || nowMs();
    var dt = ((ts || nowMs()) - lastTs) / 1000;
    lastTs = ts || nowMs();
    dt = clamp(dt, 0, 0.05);
    if (resultDelay > 0) resultDelay = Math.max(0, resultDelay - dt);
    if (game && !game.paused && mode === 'match') {
      E.update(game, dt);
      processEvents();
      syncUI();
    }
    updateScene(dt);
    if (renderer && scene && camera) renderer.render(scene, camera);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!game || game.paused || game.phase !== 'playing' || pointer) return;
    var pos = pointerPosition(e);
    pointer = { id: e.pointerId == null ? 1 : e.pointerId, startX: pos.x };
    E.setSteer(game, 0);
    try { if (canvas.setPointerCapture) canvas.setPointerCapture(pointer.id); } catch (err) { }
  }
  function onPointerMove(e) {
    if (!pointer) return;
    if ((e.pointerId == null ? 1 : e.pointerId) !== pointer.id) return;
    var pos = pointerPosition(e);
    if (game && game.phase === 'playing') E.setSteer(game, clamp((pos.x - pointer.startX) / 70, -1, 1));
  }
  function onPointerUp(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!pointer) return;
    var id = e.pointerId == null ? 1 : e.pointerId;
    if (id !== pointer.id) return;
    pointer = null;
    if (game) E.setSteer(game, keySteer);
    try { if (canvas.releasePointerCapture) canvas.releasePointerCapture(id); } catch (err) { }
  }
  function pointerPosition(e) {
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 800 };
    return { x: (e.clientX - rect.left) / (rect.width || 480) * 480, y: (e.clientY - rect.top) / (rect.height || 800) * 800 };
  }

  function onKeyDown(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === 'm' || k === 'M') { toggleAudio(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { if (game && (game.phase === 'playing' || game.phase === 'countdown')) { e.preventDefault && e.preventDefault(); togglePause(); } return; }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keySteer = -1; if (game && game.phase === 'playing') E.setSteer(game, -1); return; }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { keySteer = 1; if (game && game.phase === 'playing') E.setSteer(game, 1); return; }
    if (k === 'i' || k === 'I') { useItem(); return; }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || e.code === 'Space') {
      if (e.preventDefault) e.preventDefault();
      if (mode === 'title') { stageIndex = 0; beginStage(); }
      else if (game && game.phase === 'clear' && resultDelay <= 0) {
        if (game.stage + 1 < game.stageTotal) { stageIndex = game.stage + 1; beginStage(); }
        else { stageIndex = 0; showTitle(); }
      } else if (game && game.phase === 'over' && resultDelay <= 0) beginStage();
      else if (game && game.paused) resumeGame();
    }
  }
  function onKeyUp(e) {
    if (!e) return;
    var k = e.key || '';
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D') {
      keySteer = 0;
      if (game && game.phase === 'playing') E.setSteer(game, 0);
    }
  }

  function autoPlayStep() {
    if (mode === 'title') { stageIndex = 0; beginStage(); return; }
    if (!game || game.paused || game.phase !== 'playing') return;
    var p = playerRacer();
    var st = stageData();
    var s = wrapS(p.s + 4, st.length);
    var pn = normalOf(s);
    var target = pn.x * -0.7;
    E.setSteer(game, clamp((target - p.x) / 1.2, -1, 1));
    if (p.item && Math.random() < 0.02) E.useItem(game, 'player');
  }

  function init() {
    canvas = $('game');
    els.hud = $('hud'); els.lap = $('lap'); els.turn = $('turn'); els.shots = $('shots'); els.rank = $('rank');
    els.itemBtn = $('btn-item'); els.sound = $('btn-sound'); els.pause = $('btn-pause');
    els.screenTitle = $('screen-title'); els.screenOver = $('screen-over'); els.screenStage = $('screen-stage');
    els.screenEnding = $('screen-ending'); els.screenPause = $('screen-pause');
    els.overSub = $('over-sub'); els.overRank = $('over-rank'); els.overLap = $('over-lap'); els.overStage = $('over-stage');
    els.stageClearText = $('stage-clear-text'); els.countdown = $('countdown'); els.toast = $('toast'); els.flash = $('flash');
    els.driftHud = $('drift-hud'); els.driftFill = $('drift-fill');

    if (T && canvas) {
      try {
        renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(1);
        renderer.setSize(480, 800, false);
        scene = new T.Scene();
        scene.background = new T.Color(0x07110d);
        scene.fog = new T.Fog(0x07110d, 45, 120);
        camera = new T.PerspectiveCamera(66, 480 / 800, 0.05, 220);
        scene.add(new T.HemisphereLight(0xe8fff6, 0x1b2a24, 2.2));
        var sun = new T.DirectionalLight(0xfff0c8, 2.0);
        sun.position.set(8, 22, -12);
        scene.add(sun);
        var fill = new T.DirectionalLight(0x8ff0d0, 0.8);
        fill.position.set(-12, 8, 20);
        scene.add(fill);
      } catch (e) {
        renderer = null;
        scene = null;
        camera = null;
      }
    }
    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');
    if (els.itemBtn) els.itemBtn.classList.add('hidden');
    if (els.driftHud) els.driftHud.style.display = 'none';

    var start = $('btn-start'), retry = $('btn-retry'), resume = $('btn-resume'), next = $('btn-next-stage'), ending = $('btn-ending-retry');
    if (start) start.addEventListener('click', function () { stageIndex = 0; beginStage(); });
    if (retry) retry.addEventListener('click', beginStage);
    if (next) next.addEventListener('click', function () { stageIndex++; beginStage(); });
    if (ending) ending.addEventListener('click', showTitle);
    if (resume) resume.addEventListener('click', resumeGame);
    if (els.pause) els.pause.addEventListener('click', togglePause);
    if (els.itemBtn) els.itemBtn.addEventListener('click', useItem);
    if (els.sound) els.sound.addEventListener('click', toggleAudio);
    syncAudioButton();

    if (canvas) {
      canvas.addEventListener('pointerdown', onPointerDown, false);
      canvas.addEventListener('pointermove', onPointerMove, false);
      canvas.addEventListener('pointerup', onPointerUp, false);
      canvas.addEventListener('pointercancel', function () { pointer = null; if (game) E.setSteer(game, keySteer); }, false);
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault && e.preventDefault(); }, false);
      canvas.addEventListener('dblclick', function (e) { e.preventDefault && e.preventDefault(); }, false);
    }
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    window.addEventListener('blur', pauseGame, false);
    window.addEventListener('resize', resizeCanvas, false);
    document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); }, false);
    document.addEventListener('gesturestart', function (e) { e.preventDefault && e.preventDefault(); }, false);
    document.addEventListener('gesturechange', function (e) { e.preventDefault && e.preventDefault(); }, false);
    document.addEventListener('gestureend', function (e) { e.preventDefault && e.preventDefault(); }, false);

    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
    root.__GAME__ = {
      id: 'school-chair-drift',
      title: '放課後チェア・グランプリ',
      start: function () { stageIndex = 0; beginStage(); },
      autoPlayStep: autoPlayStep,
      isDone: function () { return !!(game && (game.phase === 'clear' || game.phase === 'over')); },
      getState: function () {
        if (!game) return { id: 'school-chair-drift', phase: mode, stage: stageIndex, stageTotal: E.STAGES.length };
        return E.getState(game);
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
