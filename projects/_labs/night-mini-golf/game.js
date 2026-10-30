(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var E = root.NightMiniGolfEngine;
  if (!E) return;
  var T = root.THREE;
  var Audio = root.SoccerAudio;

  var canvas, renderer, scene, camera, stageGroup;
  var ballMeshes = [], aimLine = null, activeRing = null;
  var rotorMeshes = [], sliderMeshes = [];
  var els = {};
  var game = null;
  var mode = 'title';
  var shownScreen = 'screen-title';
  var stageIndex = 0;
  var holeIndex = 0;
  var holesWon = { player: 0, cpu: 0 };
  var yaw = 0;
  var power = 0;
  var charging = false;
  var cpuTimer = 0;
  var holeTimer = 0;
  var pointer = null;
  var lastTs = 0;
  var scaleX = 1, scaleY = 1;
  var S = 0.025;

  function $(id) { return document.getElementById(id); }
  function clamp(v,a,b) { return v<a?a:(v>b?b:v); }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function mapX(x) { return (x - 240) * S; }
  function mapZ(y) { return (y - 410) * S; }

  function setScreen(name) {
    if (name === shownScreen) return;
    shownScreen = name;
    var list = [
      ['screen-title', els.screenTitle], ['screen-over', els.screenOver],
      ['screen-stage', els.screenStage], ['screen-ending', els.screenEnding],
      ['screen-pause', els.screenPause]
    ];
    for (var i=0;i<list.length;i++) if (list[i][1]) list[i][1].classList.toggle('visible', list[i][0]===name);
  }

  function showTitle() {
    mode = 'title'; game = null; stageIndex = 0; holeIndex = 0;
    holesWon = { player: 0, cpu: 0 }; charging = false; power = 0;
    setScreen('screen-title');
    if (els.hud) els.hud.classList.add('hidden');
    if (els.hit) els.hit.classList.add('hidden');
    if (els.powerHud) els.powerHud.style.display = 'none';
    if (els.pause) els.pause.classList.add('hidden');
    if (stageGroup) clearHole();
    lastTs = 0;
  }

  function beginHole(firstTurn) {
    if (Audio) Audio.start();
    mode = 'hole';
    game = E.createGame({ stage: stageIndex, hole: holeIndex, firstTurn: firstTurn || 'player' });
    charging = false; power = 0; cpuTimer = game.turn === 'cpu' ? 0.85 : 0; holeTimer = 0; pointer = null;
    yaw = angleToTarget(game.turn);
    setScreen(null);
    if (els.hud) els.hud.classList.remove('hidden');
    if (els.hit) els.hit.classList.remove('hidden');
    if (els.powerHud) els.powerHud.style.display = '';
    if (els.pause) els.pause.classList.remove('hidden');
    if (renderer) buildHole();
    lastTs = 0;
    syncUI();
  }

  function angleToTarget(turn) {
    if (!game) return 0;
    var b = game.balls[turn];
    return Math.atan2(game.target.x - b.x, game.target.y - b.y);
  }

  function syncAudioButton() {
    if (!els.sound) return;
    var muted = Audio ? Audio.isMuted() : true;
    els.sound.classList.toggle('muted', muted);
    els.sound.setAttribute('aria-label', muted ? 'BGMを再生' : 'BGMを消音');
  }
  function toggleAudio() { if (Audio) { Audio.toggle(); syncAudioButton(); } }

  function syncUI() {
    if (els.hud) els.hud.classList.toggle('hidden', mode !== 'hole');
    if (!game) return;
    var st = E.getState(game);
    if (els.you) els.you.textContent = String(holesWon.player);
    if (els.cpu) els.cpu.textContent = String(holesWon.cpu);
    if (els.turn) els.turn.textContent = st.phase === 'holeover' ? 'HOLE WIN' : (st.turn === 'player' ? 'YOUR TURN' : 'CPU TURN');
    if (els.shots) els.shots.textContent = 'H' + (holeIndex + 1) + '/3 · PAR ' + st.par + ' · ' + st.strokes.player + '-' + st.strokes.cpu;
    if (els.hit) els.hit.disabled = !(st.phase === 'aim' && st.turn === 'player' && mode === 'hole');
    if (els.powerFill) els.powerFill.style.width = Math.round(power * 100) + '%';
    var target = null;
    if (mode === 'stage') target = 'screen-stage';
    else if (mode === 'over') target = 'screen-over';
    else if (mode === 'ending') target = 'screen-ending';
    else if (game.paused) target = 'screen-pause';
    setScreen(target);
    if (els.pause) els.pause.classList.toggle('hidden', !(mode === 'hole' && !game.paused));
    if (mode === 'stage') {
      if (els.stageYou) els.stageYou.textContent = String(holesWon.player);
      if (els.stageCpu) els.stageCpu.textContent = String(holesWon.cpu);
      if (els.stageNum) els.stageNum.textContent = (stageIndex + 1) + '/' + E.STAGES.length;
      if (els.stageClearText) els.stageClearText.textContent = '次は ' + (E.STAGES[stageIndex + 1] ? E.STAGES[stageIndex + 1].name : '') + '。';
    }
    if (mode === 'over') {
      if (els.overYou) els.overYou.textContent = String(holesWon.player);
      if (els.overCpu) els.overCpu.textContent = String(holesWon.cpu);
      if (els.overStage) els.overStage.textContent = (stageIndex + 1) + '/' + E.STAGES.length;
    }
  }

  function pauseGame() {
    if (!game || mode !== 'hole' || game.paused) return;
    pointer = null; charging = false;
    E.setPaused(game, true); game.paused = true;
    setScreen('screen-pause');
  }
  function resumeGame() {
    if (!game || !game.paused) return;
    game.paused = false; E.setPaused(game, false);
    setScreen(null); lastTs = 0;
  }
  function togglePause() { if (game && mode === 'hole') { if (game.paused) resumeGame(); else pauseGame(); } }

  function startMatch() {
    stageIndex = 0; holeIndex = 0; holesWon = { player: 0, cpu: 0 };
    beginHole('player');
  }
  function retryCourse() {
    holesWon = { player: 0, cpu: 0 }; holeIndex = 0;
    beginHole('player');
  }
  function nextStage() {
    if (stageIndex + 1 >= E.STAGES.length) { mode = 'ending'; setScreen('screen-ending'); return; }
    stageIndex++; holeIndex = 0; holesWon = { player: 0, cpu: 0 };
    beginHole('player');
  }
  function stageClear() {
    mode = 'stage'; game.phase = 'clear';
    setScreen('screen-stage'); syncUI();
  }
  function courseOver() {
    mode = 'over'; game.phase = 'over';
    setScreen('screen-over'); syncUI();
  }
  function advanceHole() {
    var winner = game.holeWinner;
    if (!winner) return;
    holesWon[winner]++;
    if (holesWon.player >= 2) { stageClear(); return; }
    if (holesWon.cpu >= 2) { courseOver(); return; }
    if (holeIndex >= 2) {
      if (holesWon.player > holesWon.cpu) stageClear(); else courseOver();
      return;
    }
    holeIndex++;
    beginHole(winner === 'player' ? 'cpu' : 'player');
  }

  function processEvents() {
    if (!game) return;
    var events = E.consumeEvents(game);
    for (var i=0;i<events.length;i++) {
      var ev = events[i];
      if (ev.type === 'shoot') { if (Audio) Audio.playSfx('shot'); }
      else if (ev.type === 'bumper') { if (Audio) Audio.playSfx('bumper'); }
      else if (ev.type === 'water') { if (Audio) Audio.playSfx('water'); }
      else if (ev.type === 'holehole') {
        if (Audio) Audio.playSfx('sink');
        holeTimer = 1.1;
        if (Audio) Audio.playSfx('sink');
      } else if (ev.type === 'turn') {
        if (ev.turn === 'cpu') { cpuTimer = 0.85; yaw = angleToTarget('cpu'); }
        else { yaw = angleToTarget('player'); }
      }
    }
  }

  function startHit(e) {
    if (!game || mode !== 'hole' || game.paused || game.phase !== 'aim' || game.turn !== 'player') return;
    e.preventDefault && e.preventDefault();
    charging = true; power = 0.05;
    try { if (els.hit.setPointerCapture && e.pointerId != null) els.hit.setPointerCapture(e.pointerId); } catch (err) { }
  }
  function releaseHit(e) {
    if (!charging) return;
    e.preventDefault && e.preventDefault();
    charging = false;
    if (!game || game.phase !== 'aim' || game.turn !== 'player') { power = 0; return; }
    var p = power; power = 0;
    if (E.playerShoot(game, yaw, p)) { processEvents(); syncUI(); }
  }
  function onCanvasDown(e) {
    if (!game || mode !== 'hole' || game.paused || game.phase !== 'aim' || game.turn !== 'player') return;
    e.preventDefault && e.preventDefault();
    pointer = { id: e.pointerId == null ? 1 : e.pointerId, x: e.clientX };
    try { canvas.setPointerCapture && canvas.setPointerCapture(pointer.id); } catch (err) { }
  }
  function onCanvasMove(e) {
    if (!pointer) return;
    if ((e.pointerId == null ? 1 : e.pointerId) !== pointer.id) return;
    yaw += (e.clientX - pointer.x) * 0.008;
    pointer.x = e.clientX;
  }
  function onCanvasUp(e) {
    if (!pointer) return;
    pointer = null;
    try { canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId == null ? 1 : e.pointerId); } catch (err) { }
  }

  function onKeyDown(e) {
    var k = e.key || '';
    if (k === 'm' || k === 'M') { toggleAudio(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') { if (game && mode === 'hole') { e.preventDefault && e.preventDefault(); togglePause(); } return; }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { if (game && game.turn === 'player' && game.phase === 'aim') yaw -= 0.08; return; }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { if (game && game.turn === 'player' && game.phase === 'aim') yaw += 0.08; return; }
    if (k === ' ') {
      e.preventDefault && e.preventDefault();
      if (mode === 'title') startMatch();
      else if (mode === 'stage') nextStage();
      else if (mode === 'over') retryCourse();
      else if (mode === 'ending') showTitle();
      else if (game && game.paused) resumeGame();
      else if (game && game.phase === 'aim' && game.turn === 'player' && !charging) startHit({ preventDefault: function(){} });
    }
  }
  function onKeyUp(e) {
    if ((e.key || '') === ' ' && charging) releaseHit({ preventDefault: function(){} });
  }

  function mat(color, emissive) {
    return new T.MeshStandardMaterial({
      color: color, roughness: 0.8, metalness: 0.03,
      emissive: emissive || 0x000000, emissiveIntensity: 0.55, side: T.DoubleSide
    });
  }
  function boxMesh(group, w, h, d, x, y, z, color, emissive) {
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color, emissive));
    m.position.set(x, y, z); group.add(m); return m;
  }
  function clearHole() {
    if (!stageGroup) return;
    scene.remove(stageGroup);
    stageGroup.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    stageGroup = null; ballMeshes = []; aimLine = null; activeRing = null; rotorMeshes = []; sliderMeshes = [];
  }
  function buildHole() {
    clearHole();
    stageGroup = new T.Group(); scene.add(stageGroup);
    var fw = E.FIELD.w * S, fd = E.FIELD.h * S;
    boxMesh(stageGroup, fw, 0.12, fd, 0, 0, 0, 0x173c2d);
    boxMesh(stageGroup, fw + 0.24, 0.08, fd + 0.24, 0, -0.03, 0, 0x091713);
    for (var i=0;i<game.walls.length;i++) {
      var w=game.walls[i];
      boxMesh(stageGroup, w.w*S, 0.62, w.h*S, mapX(w.x+w.w/2), 0.31, mapZ(w.y+w.h/2), 0x68475a, 0x2d1824);
    }
    for (i=0;i<game.bumpers.length;i++) {
      var b=game.bumpers[i];
      var m=new T.Mesh(new T.CylinderGeometry(b.r*S, b.r*S, 0.7, 16), mat(0x2b8c78, 0x1a5b4d));
      m.position.set(mapX(b.x), 0.35, mapZ(b.y)); stageGroup.add(m);
    }
    for (i=0;i<game.sand.length;i++) {
      var sd=game.sand[i];
      boxMesh(stageGroup, sd.w*S, 0.035, sd.h*S, mapX(sd.x+sd.w/2), 0.06, mapZ(sd.y+sd.h/2), 0xb49758);
    }
    for (i=0;i<game.water.length;i++) {
      var wa=game.water[i];
      boxMesh(stageGroup, wa.w*S, 0.035, wa.h*S, mapX(wa.x+wa.w/2), 0.06, mapZ(wa.y+wa.h/2), 0x2f7890);
    }
    rotorMeshes = [];
    for (i=0;i<game.rotors.length;i++) {
      var rt=game.rotors[i];
      var rg=new T.Group(); rg.position.set(mapX(rt.x), 0, mapZ(rt.y)); stageGroup.add(rg);
      var hub=new T.Mesh(new T.CylinderGeometry(0.18, 0.24, 0.62, 12), mat(0xffcf7a, 0x6b4619));
      hub.position.y=0.31; rg.add(hub);
      var arms=[];
      for (var a=0;a<rt.arms;a++) {
        var arm=new T.Mesh(new T.BoxGeometry(rt.r*S, 0.18, 0.16), mat(0xffb45e, 0x6b3d12));
        arm.position.y=0.32; rg.add(arm);
        var cap=new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 0.26, 10), mat(0xffe2a8, 0x7b511d));
        cap.position.y=0.32; rg.add(cap);
        arms.push({ mesh: arm, cap: cap });
      }
      rotorMeshes.push({ group: rg, arms: arms });
    }
    sliderMeshes = [];
    for (i=0;i<game.sliders.length;i++) {
      var sl=game.sliders[i];
      var sm=new T.Mesh(new T.BoxGeometry(sl.w*S, 0.55, sl.h*S), mat(0x9c79d8, 0x3d245f));
      sm.position.set(mapX(sl.x), 0.31, mapZ(sl.y)); stageGroup.add(sm);
      var edge=new T.Mesh(new T.BoxGeometry(sl.w*S+0.06, 0.06, sl.h*S+0.06), mat(0xd9c2ff, 0x5b3e85));
      edge.position.y=0.34; sm.add(edge);
      sliderMeshes.push(sm);
    }
    var cup = new T.Mesh(new T.CylinderGeometry(E.HOLE_R*S, E.HOLE_R*S, 0.09, 24), new T.MeshBasicMaterial({ color: 0x010403 }));
    cup.position.set(mapX(game.target.x), 0.02, mapZ(game.target.y)); stageGroup.add(cup);
    boxMesh(stageGroup, 0.035, 1.65, 0.035, mapX(game.target.x), 0.83, mapZ(game.target.y), 0xe9fff4);
    var flag = new T.Mesh(new T.PlaneGeometry(0.8, 0.42), new T.MeshBasicMaterial({ color: 0xff8fbd, side: T.DoubleSide }));
    flag.position.set(mapX(game.target.x) + 0.4, 1.35, mapZ(game.target.y)); stageGroup.add(flag);

    ballMeshes = [];
    var colors = { player: 0x7df5c7, cpu: 0xff8fbd };
    for (i=0;i<2;i++) {
      var key = i === 0 ? 'player' : 'cpu';
      var ball = new T.Mesh(new T.SphereGeometry(0.22, 18, 12), mat(colors[key], colors[key]));
      stageGroup.add(ball);
      ballMeshes.push(ball);
    }
    activeRing = new T.Mesh(new T.TorusGeometry(0.35, 0.025, 6, 24), new T.MeshBasicMaterial({ color: 0xffd166 }));
    activeRing.rotation.x = Math.PI / 2; stageGroup.add(activeRing);
    var aimGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0,0,0), new T.Vector3(0,0,-1)]);
    aimLine = new T.Line(aimGeo, new T.LineBasicMaterial({ color: 0xffe6a3, transparent: true, opacity: 0.85 }));
    stageGroup.add(aimLine);
  }

  function ballWorld(key) {
    var b = game.balls[key];
    return new T.Vector3(mapX(b.x), 0.23, mapZ(b.y));
  }

  function updateScene(time) {
    if (!renderer || !game || !stageGroup) return;
    for (var i=0;i<2;i++) {
      var key = i === 0 ? 'player' : 'cpu';
      ballMeshes[i].position.copy(ballWorld(key));
    }
    for (var r=0;r<rotorMeshes.length;r++) {
      var rot=game.rotors[r], rm=rotorMeshes[r];
      for (var a=0;a<rot.arms;a++) {
        var ang=rot.angle + a * Math.PI * 2 / rot.arms;
        var len=rot.r*S;
        rm.arms[a].mesh.position.x=Math.cos(ang)*len/2;
        rm.arms[a].mesh.position.z=Math.sin(ang)*len/2;
        rm.arms[a].mesh.rotation.y=-ang;
        rm.arms[a].cap.position.x=Math.cos(ang)*len;
        rm.arms[a].cap.position.z=Math.sin(ang)*len;
      }
    }
    for (var q=0;q<sliderMeshes.length;q++) {
      var sd=game.sliders[q];
      sliderMeshes[q].position.set(mapX(sd.x), 0.31, mapZ(sd.y));
    }
    var active = game.turn;
    var ballPos = ballWorld(active);
    activeRing.position.set(ballPos.x, 0.06, ballPos.z);
    activeRing.visible = game.phase === 'aim' || game.phase === 'moving';
    var dir = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (game.phase === 'aim' && game.turn === 'player') {
      aimLine.visible = true;
      var len = 1.3 + power * 2.2;
      aimLine.geometry.setFromPoints([new T.Vector3(ballPos.x, 0.3, ballPos.z), new T.Vector3(ballPos.x + dir.x * len, 0.3, ballPos.z + dir.z * len)]);
    } else {
      aimLine.visible = false;
    }
    var camPos = new T.Vector3(ballPos.x - dir.x * 4.2, 2.25, ballPos.z - dir.z * 4.2);
    var look = new T.Vector3(ballPos.x + dir.x * 3.3, 0.25, ballPos.z + dir.z * 3.3);
    camera.position.lerp(camPos, 0.24);
    camera.lookAt(look);
    renderer.render(scene, camera);
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);
    if (game && mode === 'hole' && !game.paused) {
      if (charging && game.phase === 'aim' && game.turn === 'player') power = Math.min(1, power + dt * 0.9);
      E.update(game, dt);
      processEvents();
      if (game.phase === 'holeover' && holeTimer > 0) {
        holeTimer -= dt;
        if (holeTimer <= 0) advanceHole();
      }
      if (game.phase === 'aim' && game.turn === 'cpu' && !game.paused) {
        cpuTimer -= dt;
        if (cpuTimer <= 0) {
          if (E.cpuShot(game)) { processEvents(); syncUI(); }
        }
      }
      syncUI();
    }
    if (renderer) updateScene(ts / 1000);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  function autoPlayStep() {
    if (mode === 'title') { startMatch(); return; }
    if (mode !== 'hole' || !game || game.paused) return;
    if (game.phase === 'aim' && game.turn === 'player') {
      yaw = angleToTarget('player');
      if (E.autoShot(game)) { processEvents(); syncUI(); }
    }
  }

  function init() {
    canvas = $('game');
    els.hud = $('hud'); els.you = $('you'); els.cpu = $('cpu'); els.turn = $('turn'); els.shots = $('shots');
    els.hit = $('btn-hit'); els.powerHud = document.querySelector ? document.querySelector('.power-hud') : null; els.powerFill = $('power-fill');
    els.sound = $('btn-sound'); els.pause = $('btn-pause');
    els.screenTitle = $('screen-title'); els.screenOver = $('screen-over'); els.screenStage = $('screen-stage'); els.screenEnding = $('screen-ending'); els.screenPause = $('screen-pause');
    els.overYou = $('over-you'); els.overCpu = $('over-cpu'); els.overStage = $('over-stage');
    els.stageYou = $('stage-you'); els.stageCpu = $('stage-cpu'); els.stageNum = $('stage-num'); els.stageClearText = $('stage-clear-text');

    if (T && canvas) {
      try {
        renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(1);
        renderer.setSize(480, 800, false);
        scene = new T.Scene();
        scene.background = new T.Color(0x070b16);
        scene.fog = new T.Fog(0x070b16, 12, 26);
        camera = new T.PerspectiveCamera(58, 480 / 800, 0.05, 80);
        scene.add(new T.HemisphereLight(0xeafff5, 0x14231f, 2.2));
        var sun = new T.DirectionalLight(0xfff0c8, 2.2);
        sun.position.set(5, 12, -8); scene.add(sun);
        var fill = new T.DirectionalLight(0x8ff0d0, 0.9);
        fill.position.set(-8, 6, 8); scene.add(fill);
      } catch (err) { renderer = null; scene = null; camera = null; }
    }
    if (els.screenTitle) els.screenTitle.classList.add('visible');
    if (els.pause) els.pause.classList.add('hidden');
    if (els.hit) els.hit.classList.add('hidden');
    if (els.powerHud) els.powerHud.style.display = 'none';

    var start = $('btn-start'), retry = $('btn-retry'), resume = $('btn-resume'), next = $('btn-next-stage'), ending = $('btn-ending-retry');
    if (start) start.addEventListener('click', startMatch);
    if (retry) retry.addEventListener('click', retryCourse);
    if (next) next.addEventListener('click', nextStage);
    if (ending) ending.addEventListener('click', showTitle);
    if (resume) resume.addEventListener('click', resumeGame);
    if (els.pause) els.pause.addEventListener('click', togglePause);
    if (els.hit) {
      els.hit.addEventListener('pointerdown', startHit, false);
      els.hit.addEventListener('pointerup', releaseHit, false);
      els.hit.addEventListener('pointercancel', releaseHit, false);
      els.hit.addEventListener('contextmenu', function (e) { e.preventDefault && e.preventDefault(); }, false);
    }
    if (els.sound) els.sound.addEventListener('click', toggleAudio);
    syncAudioButton();
    if (canvas) {
      canvas.addEventListener('pointerdown', onCanvasDown, false);
      canvas.addEventListener('pointermove', onCanvasMove, false);
      canvas.addEventListener('pointerup', onCanvasUp, false);
      canvas.addEventListener('pointercancel', function () { pointer = null; }, false);
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault && e.preventDefault(); }, false);
      canvas.addEventListener('dblclick', function (e) { e.preventDefault && e.preventDefault(); }, false);
    }
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    window.addEventListener('blur', pauseGame, false);
    window.addEventListener('resize', function () { renderer && renderer.setSize(480, 800, false); }, false);
    document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); }, false);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    root.__GAME__ = {
      id: 'night-mini-golf', title: '月夜のミニゴルフ MATCH',
      start: startMatch, autoPlayStep: autoPlayStep,
      isDone: function () { return mode === 'stage' || mode === 'over' || mode === 'ending'; },
      getState: function () {
        if (!game) return { id: 'night-mini-golf', phase: mode, stage: stageIndex, hole: holeIndex };
        var st = E.getState(game);
        st.mode = mode; st.holesWon = { player: holesWon.player, cpu: holesWon.cpu };
        if (mode === 'stage') st.phase = 'clear';
        if (mode === 'over') st.phase = 'over';
        if (mode === 'ending') st.phase = 'ending';
        st.over = mode === 'stage' || mode === 'over' || mode === 'ending';
        return st;
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
