(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.BlockCraftEngine;
  if (!E) return;
  var T = root.THREE;

  var canvas, renderer, scene, camera, worldGroup, outline, hand;
  var game = null;
  var mode = 'title';
  var shownScreen = 'screen-title';
  var keys = { w: false, a: false, s: false, d: false };
  var pointer = null;
  var joy = { id: null };
  var autoStep = 0;
  var lastTs = 0;
  var lastHud = '';
  var els = {};

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var list = [
      ['screen-title', els.screenTitle],
      ['screen-help', els.screenHelp]
    ];
    for (var i = 0; i < list.length; i++) {
      if (list[i][1]) list[i][1].classList.toggle('visible', list[i][0] === name);
    }
  }

  function startGame(seed) {
    seed = Number(seed);
    if (!isFinite(seed) || seed <= 0) seed = 20261104;
    game = E.createGame({ seed: seed });
    mode = 'play';
    pointer = null; joy.id = null;
    autoStep = 0;
    setScreen(null);
    if (els.hud) els.hud.classList.remove('hidden');
    if (els.crosshair) els.crosshair.classList.remove('hidden');
    if (els.hotbar) els.hotbar.classList.remove('hidden');
    if (renderer) buildWorld();
    invalidateHud();
    lastTs = 0;
  }

  function showHelp() {
    if (mode !== 'play') return;
    mode = 'help';
    setScreen('screen-help');
  }
  function closeHelp() {
    mode = 'play';
    setScreen(null);
    lastTs = 0;
  }

  function invalidateHud() { lastHud = ''; }

  function syncHud() {
    if (!game) return;
    var st = E.getState(game);
    var line = 'X ' + Math.floor(st.position.x) + ' · Y ' + Math.floor(st.position.y) + ' · Z ' + Math.floor(st.position.z);
    if (line !== lastHud) {
      if (els.coords) els.coords.textContent = line;
      lastHud = line;
    }
    if (els.slots) {
      for (var i = 0; i < els.slots.length; i++) els.slots[i].classList.toggle('selected', i === st.selected);
    }
    if (hand && hand.material) hand.material.color.setHex(E.BLOCK_INFO[st.selectedType].color);
  }

  function clearWorld() {
    if (!worldGroup) return;
    scene.remove(worldGroup);
    worldGroup.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    worldGroup = null;
  }

  function buildWorld() {
    if (!scene) return;
    clearWorld();
    worldGroup = new T.Group();
    scene.add(worldGroup);
    var counts = {};
    var x, y, z, type;
    for (x = 0; x < E.WORLD.x; x++) {
      for (z = 0; z < E.WORLD.z; z++) {
        for (y = 0; y < E.WORLD.y; y++) {
          type = E.getBlock(game.world, x, y, z);
          if (type) counts[type] = (counts[type] || 0) + 1;
        }
      }
    }
    var matrix = new T.Matrix4();
    for (type in counts) {
      if (!Object.prototype.hasOwnProperty.call(counts, type)) continue;
      var t = Number(type);
      var info = E.BLOCK_INFO[t];
      var geometry = new T.BoxGeometry(1, 1, 1);
      var positions = geometry.getAttribute('position');
      var normals = geometry.getAttribute('normal');
      var colors = new Float32Array(positions.count * 3);
      var topColor = new T.Color(info.top || info.color);
      var sideColor = new T.Color(info.side || info.color);
      var bottomColor = new T.Color(info.bottom || info.color);
      for (var vi = 0; vi < positions.count; vi++) {
        var faceColor = normals.getY(vi) > 0.5 ? topColor : (normals.getY(vi) < -0.5 ? bottomColor : sideColor);
        colors[vi * 3] = faceColor.r;
        colors[vi * 3 + 1] = faceColor.g;
        colors[vi * 3 + 2] = faceColor.b;
      }
      geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      var material = new T.MeshLambertMaterial({ vertexColors: true });
      var mesh = new T.InstancedMesh(geometry, material, counts[t]);
      var at = 0;
      for (x = 0; x < E.WORLD.x; x++) {
        for (z = 0; z < E.WORLD.z; z++) {
          for (y = 0; y < E.WORLD.y; y++) {
            if (E.getBlock(game.world, x, y, z) !== t) continue;
            matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
            mesh.setMatrixAt(at++, matrix);
          }
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      worldGroup.add(mesh);
    }
    var stemGeo = new T.BoxGeometry(0.045, 0.28, 0.045);
    var stemMat = new T.MeshLambertMaterial({ color: 0x3e7c32 });
    var headGeo = new T.BoxGeometry(0.14, 0.14, 0.14);
    for (var di = 0; di < game.world.decor.length; di++) {
      var dec = game.world.decor[di];
      var stem = new T.Mesh(stemGeo, stemMat);
      stem.position.set(dec.x + 0.5, dec.y + 0.14, dec.z + 0.5);
      worldGroup.add(stem);
      var head = new T.Mesh(headGeo, new T.MeshLambertMaterial({ color: dec.color }));
      head.position.set(dec.x + 0.5, dec.y + 0.32, dec.z + 0.5);
      head.rotation.y = di * 1.7;
      worldGroup.add(head);
    }
    if (hand) hand.material.color.setHex(E.BLOCK_INFO[E.getState(game).selectedType].color);
  }

  function updateScene(time) {
    if (!renderer || !game || !camera) return;
    var p = game.position;
    camera.position.set(p.x, p.y + E.EYE_HEIGHT, p.z);
    camera.rotation.y = game.yaw;
    camera.rotation.x = game.pitch;
    var target = E.getTarget(game);
    if (outline) {
      if (target) {
        outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
        outline.visible = true;
      } else outline.visible = false;
    }
    if (hand) {
      hand.position.set(0.46 + Math.sin(time * 0.8) * 0.006, -0.42, -0.82);
      hand.rotation.set(0.18, -0.25, 0.1);
    }
    renderer.render(scene, camera);
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);
    if (game && mode === 'play') {
      var f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      var r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      E.setInput(game, { forward: f, right: r });
      E.update(game, dt);
      consumeEdits();
      syncHud();
    }
    updateScene(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function consumeEdits() {
    if (!game) return;
    var events = E.consumeEvents(game);
    for (var i = 0; i < events.length; i++) {
      if (events[i].type === 'edit' && renderer) { buildWorld(); syncHud(); return; }
    }
  }

  function actionMine() {
    if (!game || mode !== 'play') return;
    if (E.mine(game)) { consumeEdits(); syncHud(); }
  }
  function actionPlace() {
    if (!game || mode !== 'play') return;
    if (E.place(game)) { consumeEdits(); syncHud(); }
  }
  function selectSlot(index) {
    if (!game) return;
    E.setSelected(game, index);
    syncHud();
  }

  function onKeyDown(e) {
    var k = e.key || '';
    if (k === 'w' || k === 'W') keys.w = true;
    else if (k === 'a' || k === 'A') keys.a = true;
    else if (k === 's' || k === 'S') keys.s = true;
    else if (k === 'd' || k === 'D') keys.d = true;
    else if (k === ' ' || k === 'Spacebar') {
      e.preventDefault && e.preventDefault();
      if (mode === 'play' && game) E.setInput(game, { jump: true });
    } else if (k >= '1' && k <= '5') selectSlot(Number(k) - 1);
    else if (k === 'r' || k === 'R') { if (mode === 'play') startGame((Date.now() % 100000) + 17); }
    else if (k === '?' || k === 'h' || k === 'H') {
      if (mode === 'play') showHelp();
      else if (mode === 'help') closeHelp();
    } else if (k === 'Escape' && mode === 'help') closeHelp();
  }
  function onKeyUp(e) {
    var k = e.key || '';
    if (k === 'w' || k === 'W') keys.w = false;
    else if (k === 'a' || k === 'A') keys.a = false;
    else if (k === 's' || k === 'S') keys.s = false;
    else if (k === 'd' || k === 'D') keys.d = false;
  }

  function onCanvasDown(e) {
    if (!game || mode !== 'play') return;
    if (e.pointerType === 'mouse' && e.button === 2) {
      e.preventDefault && e.preventDefault();
      actionPlace();
      return;
    }
    if (e.button != null && e.button !== 0) return;
    e.preventDefault && e.preventDefault();
    pointer = { id: e.pointerId == null ? 1 : e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button == null ? 0 : e.button, type: e.pointerType || 'mouse' };
    try { canvas.setPointerCapture && canvas.setPointerCapture(pointer.id); } catch (err) { }
  }
  function onCanvasMove(e) {
    if (!pointer) return;
    if ((e.pointerId == null ? 1 : e.pointerId) !== pointer.id) return;
    var dx = e.clientX - pointer.x;
    var dy = e.clientY - pointer.y;
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.moved += Math.abs(dx) + Math.abs(dy);
    E.look(game, dx * 0.0042, dy * 0.0042);
  }
  function onCanvasUp(e) {
    if (!pointer) return;
    var wasClick = pointer.moved < 7;
    var button = pointer.button;
    var pointerType = pointer.type;
    pointer = null;
    try { canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId == null ? 1 : e.pointerId); } catch (err) { }
    if (wasClick && mode === 'play' && pointerType !== 'touch') {
      if (button === 0) actionMine();
      else if (button === 2) actionPlace();
    }
  }

  function updateJoy(e) {
    if (!game) return;
    var rect = els.joystick.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dx = e.clientX - cx;
    var dy = e.clientY - cy;
    var max = rect.width * 0.34;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    if (els.joyKnob) els.joyKnob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    var nx = dx / max, ny = dy / max;
    E.setInput(game, { forward: -ny, right: nx });
  }
  function startJoy(e) {
    if (!game || mode !== 'play') return;
    e.preventDefault && e.preventDefault();
    joy.id = e.pointerId == null ? 1 : e.pointerId;
    try { els.joystick.setPointerCapture && els.joystick.setPointerCapture(joy.id); } catch (err) { }
    updateJoy(e);
  }
  function moveJoy(e) {
    if (joy.id == null || (e.pointerId == null ? 1 : e.pointerId) !== joy.id) return;
    e.preventDefault && e.preventDefault();
    updateJoy(e);
  }
  function endJoy(e) {
    if (joy.id == null) return;
    if (e && (e.pointerId == null ? 1 : e.pointerId) !== joy.id) return;
    joy.id = null;
    if (els.joyKnob) els.joyKnob.style.transform = 'translate(-50%, -50%)';
    if (game) E.setInput(game, { forward: 0, right: 0 });
  }

  function makeRenderer() {
    if (!T || !canvas) return;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(1);
      renderer.setSize(480, 800, false);
      scene = new T.Scene();
      scene.background = new T.Color(0x8bcdeb);
      scene.fog = new T.Fog(0xb9e7f5, 20, 42);
      camera = new T.PerspectiveCamera(72, 480 / 800, 0.05, 80);
      camera.rotation.order = 'YXZ';
      scene.add(camera);
      var ocean = new T.Mesh(new T.PlaneGeometry(150, 150), new T.MeshLambertMaterial({ color: 0x3b95c8 }));
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.y = 0.08;
      scene.add(ocean);
      scene.add(new T.HemisphereLight(0xffffff, 0x4c6b4a, 1.65));
      var sun = new T.DirectionalLight(0xfff1c9, 1.7);
      sun.position.set(18, 28, 10);
      scene.add(sun);
      var fill = new T.DirectionalLight(0x9fe0ff, 0.45);
      fill.position.set(-12, 8, -10);
      scene.add(fill);
      var edgeGeo = new T.EdgesGeometry(new T.BoxGeometry(1.01, 1.01, 1.01));
      outline = new T.LineSegments(edgeGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      outline.visible = false;
      scene.add(outline);
      hand = new T.Mesh(new T.BoxGeometry(0.25, 0.25, 0.25), new T.MeshLambertMaterial({ color: 0x74b84c, depthTest: false, transparent: true, opacity: 0.95 }));
      hand.renderOrder = 20;
      camera.add(hand);
      for (var i = 0; i < 7; i++) {
        var cloud = new T.Mesh(new T.BoxGeometry(2.2 + (i % 3) * 0.7, 0.35, 1.1), new T.MeshLambertMaterial({ color: 0xf3ffff, transparent: true, opacity: 0.72 }));
        cloud.position.set(-12 + i * 5.4, 14.5 + (i % 2) * 1.2, -12 + (i * 7.3) % 27);
        scene.add(cloud);
      }
    } catch (err) {
      renderer = null; scene = null; camera = null;
    }
  }

  function init() {
    canvas = $('game');
    els.hud = $('hud'); els.coords = $('coords'); els.crosshair = $('crosshair');
    els.screenTitle = $('screen-title'); els.screenHelp = $('screen-help');
    els.slots = document.querySelectorAll ? document.querySelectorAll('.slot') : [];
    els.hotbar = $('hotbar'); els.joystick = $('joystick'); els.joyKnob = $('joy-knob');
    makeRenderer();
    var start = $('btn-start'), help = $('btn-help'), close = $('btn-help-close');
    if (start) start.addEventListener('click', function () { setTimeout(function () { startGame(); }, 0); });
    if (help) help.addEventListener('click', showHelp);
    if (close) close.addEventListener('click', closeHelp);
    for (var i = 0; i < els.slots.length; i++) {
      els.slots[i].addEventListener('click', function (e) {
        selectSlot(Number(e.currentTarget.getAttribute('data-index')) || 0);
      });
    }
    if (canvas) {
      canvas.addEventListener('pointerdown', onCanvasDown, false);
      canvas.addEventListener('pointermove', onCanvasMove, false);
      canvas.addEventListener('pointerup', onCanvasUp, false);
      canvas.addEventListener('pointercancel', function () { pointer = null; }, false);
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault && e.preventDefault(); }, false);
    }
    var jump = $('btn-jump'), mine = $('btn-mine'), place = $('btn-place');
    if (jump) jump.addEventListener('pointerdown', function (e) { e.preventDefault && e.preventDefault(); if (game) E.setInput(game, { jump: true }); });
    if (mine) mine.addEventListener('pointerdown', function (e) { e.preventDefault && e.preventDefault(); actionMine(); });
    if (place) place.addEventListener('pointerdown', function (e) { e.preventDefault && e.preventDefault(); actionPlace(); });
    if (els.joystick) {
      els.joystick.addEventListener('pointerdown', startJoy, false);
      els.joystick.addEventListener('pointermove', moveJoy, false);
      els.joystick.addEventListener('pointerup', endJoy, false);
      els.joystick.addEventListener('pointercancel', endJoy, false);
    }
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    window.addEventListener('blur', function () { keys.w = keys.a = keys.s = keys.d = false; });
    window.addEventListener('resize', function () { renderer && renderer.setSize(480, 800, false); }, false);
    if (('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)) document.body.classList.add('touch');
    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.hud) els.hud.classList.add('hidden');
    if (els.crosshair) els.crosshair.classList.add('hidden');
    if (els.hotbar) els.hotbar.classList.add('hidden');
    syncHud();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    root.__GAME__ = {
      id: 'block-craft', title: 'BLOCK CRAFT - 夜明けのボクセル島',
      start: startGame,
      autoPlayStep: function () {
        if (!game || mode !== 'play') { startGame(); return; }
        autoStep++;
        if (autoStep % 9 === 0) E.setInput(game, { forward: 1 });
        else if (autoStep % 9 === 4) E.setInput(game, { forward: 0 });
        if (autoStep % 53 === 0) E.look(game, 0.18, 0.12);
        if (autoStep % 71 === 0) {
          if (!E.getTarget(game)) game.pitch = -1.1;
          E.mine(game);
          consumeEdits();
        }
        if (autoStep % 97 === 0) {
          E.setSelected(game, autoStep % 5);
          E.place(game);
          consumeEdits();
        }
      },
      isDone: function () { return false; },
      getState: function () {
        if (!game) return { id: 'block-craft', phase: mode };
        var st = E.getState(game);
        st.mode = mode;
        st.over = false;
        return st;
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
