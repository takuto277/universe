/* game.js : アプリの配線（エンジン更新・入力・演出・画面遷移） */
(function () {
  'use strict';

  var C = (typeof window !== 'undefined' && window.GraphContent) ? window.GraphContent : null;
  var B = (typeof window !== 'undefined' && window.GraphBalance) ? window.GraphBalance : null;
  var E = (typeof window !== 'undefined' && window.GraphCrossEngine) ? window.GraphCrossEngine : null;
  var AU = (typeof window !== 'undefined' && window.GraphCrossAudio) ? window.GraphCrossAudio : null;
  var R = (typeof window !== 'undefined' && window.GraphRenderer) ? window.GraphRenderer : null;
  var UI = (typeof window !== 'undefined' && window.GraphUI) ? window.GraphUI : null;

  var canvas = null;
  var renderer = null;
  var ui = null;
  var audio = AU ? AU.create() : null;
  var state = null;
  var checkpoint = null;
  var view = { phase: 'idle', deathAt: 0, clearAt: 0, endingAt: 0, upgradeIds: [], pendingSlot: false, slotChoices: [], pendingDeckSwap: false, rescueSlot: -1, rescueChoices: [] };
  var tutorial = { active: false, step: 0, total: 3, completed: false, targetTimer: 0, itemTimer: 0 };
  var paused = false;
  var viewW = 960;
  var viewH = 560;
  var dpr = 1;
  var lastTs = 0;
  var lastCombo = 0;
  var particles = [];
  var rings = [];
  var beams = [];
  var labels = [];
  var shake = 0;
  var flash = 0;
  var flashColor = '255, 255, 255';

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function $(id) { return document.getElementById(id); }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function playUi() {
    if (audio) audio.play('ui');
  }

  function onSoundChange(muted) {
    if (!audio) return;
    audio.setMuted(muted);
    if (muted) {
      audio.stopBgm();
    } else {
      audio.unlock();
      if (view.phase === 'run') audio.startBgm();
    }
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

  function addBeam(x, y, life) {
    beams.push({ x: x, y: y, life: life, max: life });
  }

  function addLabel(x, y, text, color, size) {
    labels.push({ x: x, y: y, text: text, color: color, size: size || 18, life: 0.9, max: 0.9 });
  }

  function processEvents() {
    if (!state) return;
    var events = E.consumeEvents(state);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'hit' || ev.type === 'bossHit') {
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
        if (audio) audio.play('hit', ev.combo, ev.perfect);
        if (ev.weak) {
          addLabel(ev.x, ev.y - 78, 'WEAK x1.5', '#ffd166', 16);
          addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.95)', 118, 0.55);
          if (audio) audio.play('weak');
        }
        if (ev.type === 'bossHit') {
          addLabel(ev.x, ev.y - 100, 'BOSS -' + ev.damage, '#ff9f6b', 18);
        }
        if (ev.multi > 1) {
          addLabel(ev.x, ev.y - 122, 'MULTI x' + ev.multi, '#ffd166', 18);
          addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.75)', 140, 0.55);
          if (audio) audio.play('multi', ev.multi);
        }
        if (ev.heal) {
          addLabel(ev.x, ev.y + 52, 'LIFE +1', '#57e08a', 14);
          addRing(ev.x, ev.y, 'rgba(87, 224, 138, 0.8)', 60, 0.5);
          if (audio) audio.play('heal');
        }
      } else if (ev.type === 'itemPickup') {
        var itemInfo = C.ITEM_INFO[ev.itemType] || C.ITEM_INFO.score;
        spawnParticles(ev.x, ev.y, 22, [itemInfo.color, '#ffffff'], 220, 0.7);
        addRing(ev.x, ev.y, itemInfo.color, 58, 0.45);
        addLabel(ev.x - 30, ev.y - 22, itemInfo.labelEn || itemInfo.label, itemInfo.color, 18);
        if (audio) audio.play('item');
      } else if (ev.type === 'allySpawn') {
        spawnParticles(ev.x, ev.y, 30, [C.ITEM_INFO.graph.color, '#ffffff'], 260, 0.8);
        addRing(ev.x, ev.y, C.ITEM_INFO.graph.color, 100, 0.6);
        addLabel(ev.x - 50, ev.y - 28, 'ALLY GRAPH', C.ITEM_INFO.graph.color, 22);
        if (audio) audio.play('ally');
      } else if (ev.type === 'allyHit') {
        spawnParticles(ev.x, ev.y, 16, [C.ITEM_INFO.graph.color, '#ffd166'], 200, 0.55);
        addLabel(ev.x - 12, ev.y - 20, '+' + ev.gain, '#9ffaff', 14);
        if (audio) audio.play('ally');
      } else if (ev.type === 'allyBossHit') {
        spawnParticles(ev.x, ev.y, 20, [C.ITEM_INFO.graph.color, '#ffffff'], 220, 0.6);
        addLabel(ev.x - 20, ev.y - 48, 'ALLY -1', C.ITEM_INFO.graph.color, 15);
        if (audio) audio.play('ally');
      } else if (ev.type === 'armorHit') {
        spawnParticles(ev.x, ev.y, 14, ['#ffd166', '#ffffff'], 200, 0.5);
        addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.8)', 48, 0.35);
        addLabel(ev.x - 24, ev.y - 24, 'ARMOR', '#ffd166', 15);
        if (audio) audio.play('armor');
      } else if (ev.type === 'split') {
        spawnParticles(ev.x, ev.y, 24, ['#b48cff', '#ff7ad9', '#ffffff'], 260, 0.65);
        addRing(ev.x, ev.y, 'rgba(180, 140, 255, 0.85)', 76, 0.5);
        addLabel(ev.x - 26, ev.y - 30, 'SPLIT', '#d7b8ff', 17);
        if (audio) audio.play('split');
      } else if (ev.type === 'jam') {
        addRing(ev.x, ev.y, 'rgba(255, 77, 141, 0.9)', 62, 0.45);
        addLabel(ev.x - 20, ev.y - 30, 'JAM', '#ff6b9f', 18);
        flash = Math.max(flash, 0.2);
        flashColor = '255, 77, 141';
        if (ui && state) ui.updateSlots(state, view.phase);
        if (audio) audio.play('jam');
      } else if (ev.type === 'jamEnd') {
        if (ui && state) ui.updateSlots(state, view.phase);
      } else if (ev.type === 'bossSpawn') {
        spawnParticles(ev.x, ev.y, 32, ['#ff4d8d', '#ffd166', '#ffffff'], 280, 0.9);
        addRing(ev.x, ev.y, 'rgba(255, 77, 141, 0.95)', 90, 0.6);
        addLabel(ev.x - 60, ev.y - 20, ev.final ? 'FINAL BOSS' : 'BOSS', '#ff4d8d', 30);
        shake = 1;
        flash = 0.45;
        flashColor = '255, 77, 141';
        if (audio) audio.play('boss');
      } else if (ev.type === 'bossShift') {
        addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.9)', 80, 0.5);
        addLabel(ev.x - 20, ev.y - 62, 'WEAK SHIFT: ' + (C.FAMILY_LABELS_EN[ev.family] || ev.familyLabel), '#ffd166', 15);
        if (audio) audio.play('weak');
      } else if (ev.type === 'beam') {
        addBeam(ev.x, ev.y, 0.22);
        spawnParticles(ev.x, ev.y, 18, ['#9ffaff', '#ffffff', '#5ff0ff'], 240, 0.55);
        addRing(ev.x, ev.y, 'rgba(95, 240, 255, 0.75)', 58, 0.32);
        if (ev.kills && ev.kills.length) {
          for (var bk = 0; bk < ev.kills.length; bk++) {
            var bkill = ev.kills[bk];
            addLabel(bkill.x - 12, bkill.y - 20, '+' + bkill.gain, '#9ffaff', 14);
            addRing(bkill.x, bkill.y, 'rgba(95, 240, 255, 0.6)', 28, 0.28);
          }
        } else {
          addLabel(ev.x + 10, ev.y - 28, 'PRISM', '#9ffaff', 14);
        }
        shake = Math.max(shake, 0.35);
        flash = Math.max(flash, 0.16);
        flashColor = '180, 245, 255';
        if (audio) audio.play('beam');
      } else if (ev.type === 'revive') {
        spawnParticles(ev.x, ev.y, 48, ['#57e08a', '#9ffaff', '#ffffff'], 320, 0.9);
        addRing(ev.x, ev.y, 'rgba(87, 224, 138, 0.9)', 150, 0.7);
        addLabel(ev.x - 40, ev.y - 30, 'REVIVE', '#57e08a', 28);
        addLabel(ev.x - 30, ev.y + 18, 'LIFE 1', '#9ffaff', 15);
        shake = 0.8;
        flash = 0.5;
        flashColor = '87, 224, 138';
        if (audio) audio.play('revive');
      } else if (ev.type === 'guard') {
        addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.9)', 70, 0.45);
        addLabel(ev.x + 24, ev.y - 20, 'COMBO GUARD', '#ffd166', 16);
        if (audio) audio.play('guard');
      } else if (ev.type === 'bossWarning') {
        addRing(ev.x, ev.y, 'rgba(255, 77, 141, 0.8)', 52, 0.4);
        addLabel(ev.x - 50, ev.y - 34, ev.kind === 'laser' ? 'LASER WARNING' : (ev.kind === 'fan' ? 'FAN WARNING' : 'SHOT WARNING'), '#ff8f9f', 15);
        if (audio) audio.play('warn');
      } else if (ev.type === 'bossLaser') {
        spawnParticles(ev.x, ev.y, 24, ['#ff4d8d', '#ffd166', '#ffffff'], 260, 0.6);
        shake = Math.max(shake, 0.6);
        flash = Math.max(flash, 0.22);
        flashColor = '255, 77, 141';
        if (audio) audio.play('laser');
      } else if (ev.type === 'bossShots') {
        addLabel(ev.x - 30, ev.y - 30, ev.kind === 'fan' ? 'FAN SHOT' : 'SHOT', '#ffd166', 14);
        if (audio) audio.play('shot');
      } else if (ev.type === 'bossPhase') {
        addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.95)', 150, 0.8);
        addLabel(ev.x - 60, ev.y - 50, 'PHASE ' + ev.phase, '#ffd166', 26);
        addLabel(ev.x - 30, ev.y + 20, 'WEAK SHIFT', '#9ffaff', 14);
        shake = 0.9;
        flash = 0.45;
        flashColor = '255, 209, 102';
        if (audio) audio.play('phase');
      } else if (ev.type === 'playerHit') {
        spawnParticles(ev.x, ev.y, 26, ['#ff4d8d', '#ff8f9a', '#ffffff'], 280, 0.65);
        addLabel(ev.x - 40, ev.y - 24, 'DAMAGE -1', '#ff6b7a', 20);
        shake = 1;
        flash = 0.45;
        flashColor = '255, 77, 141';
        if (audio) audio.play('miss');
      } else if (ev.type === 'shotBlocked') {
        spawnParticles(ev.x, ev.y, 12, ['#5ff0ff', '#ffffff'], 180, 0.45);
        addLabel(ev.x - 20, ev.y - 18, '+' + ev.gain, '#9ffaff', 13);
        if (audio) audio.play('ui');
      } else if (ev.type === 'bossEscape') {
        addLabel(viewW * 0.5 - 80, viewH * 0.4, 'BOSS ESCAPED', '#ff6b5e', 24);
        spawnParticles(40, ev.y || viewH * 0.5, 24, ['#ff4d8d', '#ff8f6b'], 240, 0.8);
        shake = 0.9;
        flash = 0.4;
        flashColor = '255, 77, 141';
        if (audio) audio.play('miss');
      } else if (ev.type === 'runComplete') {
        spawnParticles(viewW * 0.5, viewH * 0.45, 90, ['#ffd166', '#5ff0ff', '#ffffff', '#ff7ad9'], 420, 1.4);
        addRing(viewW * 0.5, viewH * 0.45, 'rgba(255, 209, 102, 0.95)', 220, 0.9);
        addLabel(viewW * 0.5 - 90, viewH * 0.3, 'FINAL STAGE CLEAR', '#ffd166', 30);
        addLabel(viewW * 0.5 - 40, viewH * 0.42, '+' + ev.bonus, '#9ffaff', 18);
        shake = 1;
        flash = 0.7;
        flashColor = '255, 240, 190';
        if (audio) {
          audio.setIntensity(0);
          audio.stopBgm();
          audio.play('clear');
        }
      } else if (ev.type === 'stageClear') {
        spawnParticles(ev.x, ev.y, 60, ['#ffd166', '#5ff0ff', '#ffffff', '#ff7ad9'], 380, 1.2);
        addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.95)', 150, 0.8);
        addRing(ev.x, ev.y, 'rgba(95, 240, 255, 0.9)', 90, 0.6);
        addLabel(ev.x - 80, ev.y - 40, 'STAGE CLEAR!', '#ffd166', 30);
        addLabel(ev.x - 40, ev.y + 12, '+' + ev.bonus, '#9ffaff', 18);
        shake = 1;
        flash = 0.65;
        flashColor = '255, 240, 190';
        if (audio) {
          audio.setIntensity(0);
          audio.stopBgm();
          audio.play('clear');
        }
      } else if (ev.type === 'miss') {
        spawnParticles(ev.x, ev.y, 14, ['#ff4d8d', '#ff8f6b'], 190, 0.6);
        addLabel(ev.x + 60, ev.y, 'MISS', '#ff6b5e', 15);
        if (audio) audio.play('miss');
        shake = Math.max(shake, 0.6);
        flash = Math.max(flash, 0.3);
        flashColor = '255, 77, 141';
      } else if (ev.type === 'over') {
        shake = 1;
        flash = 0.65;
        flashColor = '255, 77, 141';
      }
      if (tutorial.active && !tutorial.completed) {
        if (ev.type === 'hit' && tutorial.step === 1) advanceTutorial(2);
        else if (ev.type === 'itemPickup' && tutorial.step === 2) advanceTutorial(3);
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
    for (i = beams.length - 1; i >= 0; i--) {
      var bm = beams[i];
      bm.life -= dt;
      if (bm.life <= 0) { beams.splice(i, 1); }
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

  /* ===== 進行 ===== */
  function clearEffects() {
    particles = [];
    rings = [];
    beams = [];
    labels = [];
    shake = 0;
    flash = 0;
  }

  function enterStageView(banner) {
    view.phase = 'run';
    view.deathAt = 0;
    view.clearAt = 0;
    view.endingAt = 0;
    view.upgradeIds = [];
    view.pendingSlot = false;
    view.slotChoices = [];
    view.pendingDeckSwap = false;
    lastCombo = 0;
    clearEffects();
    lastTs = 0;
    paused = false;
    ui.hideScreens();
    ui.setPauseVisible(true);
    ui.setRuntime(state, 'run');
    ui.showStageBanner(banner);
    if (audio && !ui.isMuted()) {
      audio.setIntensity(0);
      audio.unlock();
      audio.startBgm();
      audio.play('start');
    }
  }

  function spawnTutorialItem() {
    if (!state) return;
    state.items.push({ x: state.headX + 10, y: state.bottom - 70, type: 'score', r: 12, phase: 0, stationary: true });
  }

  function advanceTutorial(step) {
    if (!tutorial.active || tutorial.completed || step <= tutorial.step) return;
    tutorial.step = step;
    if (step === 1) {
      state.rivals = [];
      state.items = [];
      tutorial.targetTimer = 1.5;
    } else if (step === 2) {
      state.rivals = [];
      state.items = [];
      tutorial.itemTimer = 2.2;
    } else if (step >= 3) {
      tutorial.completed = true;
      view.phase = 'tutorialDone';
      ui.markTutorialDone();
      ui.showTutorialComplete();
      if (audio) audio.play('clear');
      return;
    }
    ui.showTutorialStep(step, tutorial.total);
    if (audio) audio.play('ui');
  }

  function tutorialTick(dt) {
    if (!tutorial.active || tutorial.completed || !state) return;
    if (tutorial.step === 1) {
      if (state.rivals.length) {
        tutorial.targetTimer = 1.2;
      } else {
        tutorial.targetTimer -= dt;
        if (tutorial.targetTimer <= 0) {
          E.spawnTutorialTarget(state);
          tutorial.targetTimer = 1.2;
        }
      }
    } else if (tutorial.step === 2) {
      if (state.items.length) {
        tutorial.itemTimer = 1.5;
      } else {
        tutorial.itemTimer -= dt;
        if (tutorial.itemTimer <= 0) {
          spawnTutorialItem();
          tutorial.itemTimer = 1.5;
        }
      }
    }
  }

  function pauseGame() {
    if (paused || view.phase !== 'run' || !state || state.over || state.stageCleared) return;
    paused = true;
    if (audio) audio.stopBgm();
    ui.showPause(!!checkpoint);
  }

  function resumeGame() {
    if (!paused) return;
    paused = false;
    ui.hideScreens();
    ui.setPauseVisible(true);
    lastTs = 0;
    if (audio && !ui.isMuted()) {
      audio.unlock();
      audio.startBgm();
    }
  }

  function pauseRetry() {
    if (!checkpoint) {
      resumeGame();
      return;
    }
    paused = false;
    ui.hideScreens();
    retryStage();
  }

  function beginTutorial() {
    if (!ui) return;
    state = E.createGame({
      width: viewW,
      height: viewH,
      unlocked: ui.getUnlocked(),
      deck: ['hold', 'up', 'down'],
      deckParams: null,
      fusion: null,
      mode: 'normal'
    });
    state.hp = 99;
    state.maxHp = 3;
    state.stageHits = 0;
    state.stageTarget = 999;
    state.stageCleared = false;
    state.spawnTimer = 999;
    state.itemTimer = 999;
    state.rivals = [];
    state.items = [];
    state.boss = null;
    state.bossCooldown = 0;
    checkpoint = null;
    tutorial = { active: true, step: 0, total: 3, completed: false, targetTimer: 0, itemTimer: 0 };
    enterStageView('TUTORIAL');
    ui.setTutorialMode(true);
    ui.showTutorialStep(0, tutorial.total);
  }

  function finishTutorial(startGame) {
    tutorial.active = false;
    tutorial.completed = false;
    ui.hideTutorial();
    ui.setTutorialMode(false);
    if (startGame && ui.getDeck().length === C.DECK_SIZE) beginRun('normal');
    else showStart();
  }

  function beginRun(mode) {
    if (!ui || ui.getDeck().length !== C.DECK_SIZE) return;
    tutorial.active = false;
    tutorial.completed = false;
    ui.hideTutorial();
    ui.setTutorialMode(false);
    var stress = mode === 'stress';
    state = E.createGame({
      width: viewW,
      height: viewH,
      unlocked: ui.getUnlocked(),
      deck: ui.getDeck(),
      deckParams: ui.getParams(),
      fusion: ui.getFusion(),
      mode: stress ? 'stress' : 'normal'
    });
    checkpoint = state.gameMode === 'stress' ? null : E.makeCheckpoint(state);
    if (audio) audio.setMuted(ui.isMuted());
    enterStageView(stress ? 'STRESS MODE' : 1);
  }

  function showStart() {
    if (audio) audio.stopBgm();
    state = null;
    paused = false;
    tutorial.active = false;
    tutorial.step = 0;
    tutorial.completed = false;
    ui.hideTutorial();
    ui.setTutorialMode(false);
    ui.setPauseVisible(false);
    view.phase = 'idle';
    view.endingAt = 0;
    view.upgradeIds = [];
    view.pendingSlot = false;
    view.slotChoices = [];
    view.pendingDeckSwap = false;
    view.rescueSlot = -1;
    view.rescueChoices = [];
    clearEffects();
    ui.showStart();
  }

  function showEnding() {
    paused = false;
    tutorial.active = false;
    ui.hideTutorial();
    ui.setTutorialMode(false);
    ui.setPauseVisible(false);
    view.phase = 'endingDone';
    if (audio) {
      audio.setIntensity(0);
      audio.stopBgm();
    }
    ui.showEnding(state);
  }

  function rescueCandidates() {
    if (!checkpoint || !state) return [];
    var unlocked = state.unlocked || ui.getUnlocked();
    var out = [];
    for (var i = 0; i < unlocked.length; i++) {
      var key = unlocked[i];
      if (C.MODES[key] && key !== 'fusion' && checkpoint.deck.indexOf(key) < 0) out.push(key);
    }
    return out;
  }

  function openRescue() {
    if (!checkpoint || checkpoint.rescueUsed || !state) return;
    var pool = rescueCandidates();
    if (!pool.length) return;
    var picks = [];
    while (picks.length < 3 && pool.length) {
      var index = Math.floor(Math.random() * pool.length) % pool.length;
      picks.push(pool.splice(index, 1)[0]);
    }
    var slot = checkpoint.deck.indexOf(state.mode);
    if (slot < 0) slot = 0;
    view.rescueSlot = slot;
    view.rescueChoices = picks;
    ui.showRescueChoices(state, picks);
  }

  function pickRescue(index) {
    if (!checkpoint || !state) return;
    var key = view.rescueChoices[index];
    if (!key || !C.MODES[key]) return;
    checkpoint.deck[view.rescueSlot] = key;
    checkpoint.deckParams = checkpoint.deckParams || {};
    if (C.PARAM_SPECS[key]) {
      var all = E.normalizeParams(checkpoint.deckParams);
      checkpoint.deckParams[key] = all[key];
    }
    checkpoint.rescueUsed = true;
    state.rescueUsed = true;
    view.rescueSlot = -1;
    view.rescueChoices = [];
    ui.hideScreens();
    retryStage();
  }

  function backFromRescue() {
    if (!state) return;
    ui.showEnd(state, !!checkpoint, !!(checkpoint && !checkpoint.rescueUsed));
  }

  function showEnd() {
    paused = false;
    tutorial.active = false;
    ui.hideTutorial();
    ui.setTutorialMode(false);
    ui.setPauseVisible(false);
    view.phase = 'over';
    if (audio) {
      audio.setIntensity(0);
      audio.stopBgm();
      audio.play('over');
    }
    ui.showEnd(state, !!checkpoint, !!(checkpoint && !checkpoint.rescueUsed));
  }

  function showClear() {
    paused = false;
    tutorial.active = false;
    ui.hideTutorial();
    ui.setTutorialMode(false);
    ui.setPauseVisible(false);
    view.phase = 'clear';
    view.pendingSlot = false;
    view.slotChoices = [];
    view.pendingDeckSwap = false;
    if (state.pendingDeckSwap) {
      view.pendingDeckSwap = true;
      view.upgradeIds = [];
      ui.showDeckSwapChoices(state, state.pendingDeckSwap);
      return;
    }
    if (B && ui && typeof ui.grantGachaPoints === 'function') {
      ui.grantGachaPoints(B.GACHA_STAGE_REWARD);
    }
    view.upgradeIds = E.upgradeChoices(state);
    ui.showClear(state, view.upgradeIds);
  }

  function goNextStage() {
    if (!state || !state.stageCleared) return;
    if (!E.nextStage(state)) return;
    checkpoint = E.makeCheckpoint(state);
    enterStageView(state.stage);
  }

  function retryStage() {
    if (!checkpoint) return;
    paused = false;
    state = E.restoreCheckpoint(checkpoint, { width: viewW, height: viewH });
    enterStageView(state.stage);
  }

  function chooseUpgrade(index) {
    if (view.phase !== 'clear' || !state) return;
    if (view.pendingDeckSwap) {
      var offer = state.pendingDeckSwap;
      var swapKey = offer && offer.choices[index];
      if (!swapKey) return;
      if (!E.applyDeckSwap(state, swapKey)) return;
      view.pendingDeckSwap = false;
      view.upgradeIds = E.upgradeChoices(state);
      ui.showClear(state, view.upgradeIds);
      return;
    }
    if (view.pendingSlot) {
      var key = view.slotChoices[index];
      if (!key) return;
      if (!E.applyUpgrade(state, 'slot', key)) return;
      view.pendingSlot = false;
      view.slotChoices = [];
      goNextStage();
      return;
    }
    var id = view.upgradeIds[index];
    if (!id) return;
    if (id === 'slot') {
      var choices = E.slotChoices(state);
      if (!choices.length) return;
      view.pendingSlot = true;
      view.slotChoices = choices;
      ui.showFunctionChoices(state, choices);
      return;
    }
    if (!E.applyUpgrade(state, id)) {
      view.upgradeIds = E.upgradeChoices(state);
      ui.updateUpgradeCards(view.upgradeIds, E.snapshot(state));
      return;
    }
    goNextStage();
  }

  function selectSlot(index) {
    if (!state || view.phase !== 'run' || state.over) return;
    var key = state.deck[index];
    if (key && E.setMode(state, key)) {
      ui.updateSlots(state, view.phase);
      if (tutorial.active && !tutorial.completed && tutorial.step === 0) advanceTutorial(1);
    }
  }

  function startOrRestart() {
    if (view.phase === 'clear') {
      if (!view.pendingDeckSwap) chooseUpgrade(0);
      return;
    }
    if (view.phase === 'idle' || view.phase === 'over') beginRun();
  }

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (paused && (k === 'p' || k === 'P' || k === 'Escape' || k === 'Esc')) {
      resumeGame();
      return;
    }
    if (view.phase === 'run' && !paused && (k === 'p' || k === 'P')) {
      pauseGame();
      return;
    }
    if (tutorial.active && (k === 'Escape' || k === 'Esc')) {
      showStart();
      return;
    }
    if (tutorial.completed && (k === ' ' || k === 'Enter')) {
      if (e.preventDefault) e.preventDefault();
      finishTutorial(true);
      return;
    }
    if (k === 'Escape' || k === 'Esc') {
      if (state && state.gameMode === 'stress') {
        showStart();
        return;
      }
    }
    if (view.phase === 'endingDone' && (k === ' ' || k === 'Enter')) {
      if (e.preventDefault) e.preventDefault();
      beginRun('normal');
      return;
    }
    if (view.phase === 'over' && (k === 'r' || k === 'R')) {
      retryStage();
      return;
    }
    if (view.phase === 'clear') {
      if (k === '1') chooseUpgrade(0);
      else if (k === '2') chooseUpgrade(1);
      else if (k === '3') chooseUpgrade(2);
      else if ((k === ' ' || k === 'Enter') && !view.pendingDeckSwap) chooseUpgrade(0);
      return;
    }
    if (k === ' ' || k === 'Enter') {
      if (e.preventDefault) e.preventDefault();
      startOrRestart();
      return;
    }
    if (k === '1') selectSlot(0);
    else if (k === '2') selectSlot(1);
    else if (k === '3') selectSlot(2);
    else if (k === '4') selectSlot(3);
  }

  /* ===== ループ・サイズ ===== */
  function resizeCanvas() {
    if (!canvas) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var w = canvas.clientWidth || 960;
    var h = canvas.clientHeight || 560;
    if (w <= 0) w = 960;
    if (h <= 0) h = 560;
    viewW = w;
    viewH = h;
    if (renderer) renderer.resize(w, h, dpr);
    if (state) E.resize(state, w, h);
  }

  function watchStageSize() {
    var stage = $('stage');
    if (typeof ResizeObserver === 'undefined' || !stage) return;
    var observer = new ResizeObserver(function () { resizeCanvas(); });
    observer.observe(stage);
  }

  function frame(ts) {
    if (ts == null) ts = nowMs();
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    dt = clamp(dt, 0, 0.05);

    if (!paused && view.phase === 'run' && state && !state.over && !state.stageCleared) {
      E.update(state, dt);
      processEvents();
      if (state.combo !== lastCombo) {
        lastCombo = state.combo;
        if (audio) audio.setIntensity(Math.min(3, Math.floor(state.combo / 2)));
      }
      if (state.runComplete) {
        view.phase = 'ending';
        view.endingAt = ts;
        ui.updateSlots(state, 'over');
      } else if (state.stageCleared) {
        view.phase = 'clearing';
        view.clearAt = ts;
        ui.updateSlots(state, 'clearing');
      } else if (state.over) {
        view.phase = 'dying';
        view.deathAt = ts;
        ui.updateSlots(state, 'dying');
      } else {
        ui.updateHud(state);
      }
    } else if (view.phase === 'dying' && state && state.over) {
      if (ts - view.deathAt > 700) showEnd();
    } else if (view.phase === 'clearing' && state && state.stageCleared) {
      if (ts - view.clearAt > 900) showClear();
    } else if (view.phase === 'ending' && state && state.runComplete) {
      if (ts - view.endingAt > 900) showEnding();
    }

    if (!paused && tutorial.active && !tutorial.completed && view.phase === 'run') {
      tutorialTick(dt);
    }
    if (!paused) updateEffects(dt);
    if (renderer) {
      renderer.draw(state, ts / 1000, {
        particles: particles,
        rings: rings,
        beams: beams,
        labels: labels,
        shake: shake,
        flash: flash,
        flashColor: flashColor
      });
    }
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
  }

  /* ===== 初期化 ===== */
  function init() {
    canvas = $('arena');
    renderer = R && R.create ? R.create(canvas) : null;
    resizeCanvas();
    ui = UI.create({
      renderer: renderer,
      actions: {
        onStart: function () { beginRun('normal'); },
        onStressStart: function () { beginRun('stress'); },
        onTutorial: beginTutorial,
        onTutorialStart: function () { finishTutorial(true); },
        onTutorialSkip: showStart,
        onPause: pauseGame,
        onResume: resumeGame,
        onPauseRetry: pauseRetry,
        onPauseExit: showStart,
        onEndingAgain: function () { beginRun('normal'); },
        onEndingTitle: showStart,
        onRescue: openRescue,
        onRescuePick: pickRescue,
        onRescueBack: backFromRescue,
        onExit: showStart,
        onRetry: retryStage,
        onBackToDeck: showStart,
        onUpgrade: chooseUpgrade,
        onSlot: selectSlot,
        onSoundChange: onSoundChange,
        playUi: playUi
      }
    });
    ui.init();
    if (audio) audio.setMuted(ui.isMuted());

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
    watchStageSize();
    startLoop();

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'graph-cross',
        title: 'グラフクロス',
        start: function () { beginRun('normal'); },
        startTutorial: beginTutorial,
        autoPlayStep: function () {},
        isDone: function () {
          return !!(state && ((state.over && view.phase === 'over') ||
            (state.stageCleared && view.phase === 'clear') ||
            (state.runComplete && view.phase === 'endingDone')));
        },
        getState: function () {
          if (!state) return { phase: view.phase, over: false, score: 0, best: ui.getBest() };
          var snap = E.snapshot(state);
          snap.phase = view.phase;
          snap.best = ui.getBest();
          snap.tutorial = tutorial.active ? { step: tutorial.step, completed: tutorial.completed } : null;
          return snap;
        }
      };
    }
  }

  function startLoop() {
    function loop(ts) { frame(ts); }
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
