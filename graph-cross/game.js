/* game.js : 画面・入力・2D描画。ルールと曲線の数学は engine.js に任せる */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.GraphCrossEngine) ? window.GraphCrossEngine : null;
  var AU = (typeof window !== 'undefined' && window.GraphCrossAudio) ? window.GraphCrossAudio : null;
  var audio = AU ? AU.create() : null;
  var muted = loadMuted();
  var selectedParams = loadParams();
  var previewCtx = null;
  var previewKey = null;
  var FAMILY_COLORS = { linear: '#5ff0ff', quad: '#ffd166', wave: '#ff7ad9', none: '#a8bad8' };
  var UPGRADE_INFO = {
    life: { title: 'ライフ +1', desc: '最大ライフ+1 / 1回復' },
    hit: { title: '判定 +2', desc: '交差判定が広がる' },
    combo: { title: 'コンボ +0.8秒', desc: 'コンボが切れにくい' },
    score: { title: 'スコア +20%', desc: '獲得スコアアップ' },
    boss: { title: 'ボス HP -3', desc: '次のボスが弱体化' },
    slot: { title: '関数スロット +1', desc: '新しい関数を追加' },
    bonus: { title: 'スコア +3000', desc: '即時ボーナス' }
  };
  var lastCombo = 0;

  var canvas = null;
  var ctx = null;
  var els = {};
  var slotButtons = [];
  var deckCards = {};
  var selectedDeck = loadDeck();
  var state = null;
  var view = { phase: 'idle', deathAt: 0, clearAt: 0, upgradeIds: [] };
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

  function loadMuted() {
    try {
      if (typeof localStorage === 'undefined') return false;
      return localStorage.getItem('graph-cross-muted') === '1';
    } catch (e) {
      return false;
    }
  }

  function saveMuted(value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('graph-cross-muted', value ? '1' : '0');
    } catch (e) { }
  }

  function loadParams() {
    try {
      if (typeof localStorage === 'undefined') return E.normalizeParams(null);
      var raw = localStorage.getItem('graph-cross-params');
      return E.normalizeParams(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return E.normalizeParams(null);
    }
  }

  function saveParams() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('graph-cross-params', JSON.stringify(selectedParams));
      }
    } catch (e) { }
  }

  function fmtNum(value) {
    var rounded = Math.round(value * 100) / 100;
    return String(rounded).replace(/\.0+$/, '');
  }

  function powLabel(power) {
    var marks = { 2: '²', 3: '³', 4: '⁴', 5: '⁵' };
    return marks[power] || ('^' + power);
  }

  function formatModeLabel(key, params) {
    if (key === 'quad' || key === 'quadDown') {
      var qp = params && params[key] ? params[key] : { a: 1, b: 0, p: 2 };
      var qa = qp.a || 1;
      var qb = qp.b || 0;
      var qpPower = Math.max(2, Math.round(qp.p || 2));
      var qcoef = qa === 1 ? '' : fmtNum(qa);
      var qlabel = 'y = ' + (key === 'quadDown' ? '-' : '') + qcoef + 'x' + powLabel(qpPower);
      if (qb !== 0) qlabel += (qb > 0 ? ' + ' : ' - ') + fmtNum(Math.abs(qb)) + 'x';
      return qlabel;
    }
    if (key === 'wave') {
      var wp = params && params.wave ? params.wave : { a: 1, b: 1, c: 0, shape: 0 };
      var wa = wp.a || 1;
      var wb = wp.b || 1;
      var wc = wp.c || 0;
      var wshape = Math.max(0, Math.min(4, Math.round(wp.shape || 0)));
      var acoef = wa === 1 ? '' : fmtNum(wa) + ' ';
      var inner = wb === 1 ? 'x' : fmtNum(wb) + 'x';
      if (wc !== 0) inner += (wc > 0 ? ' + ' : ' - ') + fmtNum(Math.abs(wc));
      var fname = wshape === 4 ? 'damp·sin' : (E.WAVE_SHAPES[wshape] || 'sin');
      return 'y = ' + acoef + fname + '(' + inner + ')';
    }
    return E.MODES[key] ? E.MODES[key].label : '';
  }

  function modeColor(key) {
    var mode = E.MODES[key];
    return mode ? (FAMILY_COLORS[mode.family] || mode.color) : FAMILY_COLORS.none;
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
  function lifeText(hp, maxHp) {
    var total = maxHp || E.MAX_HP;
    var out = '';
    for (var i = 0; i < total; i++) out += i < hp ? '●' : '○';
    return out;
  }

  function updateSoundButton() {
    if (!els.btnSound) return;
    els.btnSound.textContent = audio ? (muted ? '音 OFF' : '音 ON') : '音 OFF';
    els.btnSound.classList.toggle('muted', !audio || muted);
    els.btnSound.disabled = !audio;
  }

  function updateHud() {
    var snap = state ? E.snapshot(state) : null;
    if (els.score) els.score.textContent = snap ? String(snap.score) : '0';
    if (els.best) els.best.textContent = String(best);
    if (els.combo) els.combo.textContent = snap && snap.combo > 0 ? 'x' + snap.combo : '-';
    if (els.life) els.life.textContent = snap ? lifeText(snap.hp, snap.maxHp) : lifeText(E.MAX_HP, E.MAX_HP);
    if (els.life) els.life.classList.toggle('danger', !!(snap && snap.hp <= 1));

    if (els.stageLabel) {
      var stage = snap ? snap.stage : 1;
      if (snap && snap.stageCleared) {
        els.stageLabel.textContent = 'STAGE ' + stage + ' CLEAR';
        if (els.stageFill) els.stageFill.style.width = '100%';
        if (els.stageNote) els.stageNote.textContent = 'クリア!';
      } else if (snap && snap.boss) {
        els.stageLabel.textContent = 'STAGE ' + stage + ' · BOSS';
        if (els.stageFill) els.stageFill.style.width = Math.round(snap.boss.hp / snap.boss.maxHp * 100) + '%';
        if (els.stageNote) els.stageNote.textContent = '弱点: ' + snap.boss.familyLabel + ' / HP ' + snap.boss.hp + '/' + snap.boss.maxHp;
      } else {
        els.stageLabel.textContent = 'STAGE ' + stage;
        var hits = snap ? snap.stageHits : 0;
        var target = snap ? snap.stageTarget : E.stageTargetFor(1);
        if (els.stageFill) els.stageFill.style.width = Math.round(hits / target * 100) + '%';
        if (els.stageNote) els.stageNote.textContent = '敵 ' + hits + '/' + target;
      }
      if (els.stageInfo) {
        els.stageInfo.classList.toggle('boss', !!(snap && snap.boss && !snap.stageCleared));
        els.stageInfo.classList.toggle('cleared', !!(snap && snap.stageCleared));
      }
    }
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
    for (var i = 0; i < 4; i++) {
      var btn = slotButtons[i];
      if (!btn) continue;
      var key = deck[i];
      if (!key) {
        btn.innerHTML = '<b>-</b><span>空き</span><em>' + (i + 1) + '</em>';
        btn.disabled = true;
        btn.classList.remove('active');
        btn.classList.add('hidden');
        continue;
      }
      btn.classList.remove('hidden');
      var mode = E.MODES[key];
      var params = state ? state.deckParams : selectedParams;
      var familyNote = mode.family !== 'none' ? ' · ' + E.FAMILY_LABELS[mode.family] : '';
      btn.innerHTML = '<b>' + formatModeLabel(key, params) + '</b><span>' + mode.note + familyNote + '</span><em>' + (i + 1) + '</em>';
      btn.style.setProperty('--mode-color', modeColor(key));
      btn.disabled = !(state && view.phase === 'run' && !state.over);
      btn.classList.toggle('active', !!(state && state.mode === key));
    }
    if (els.modeButtons) els.modeButtons.classList.toggle('four', deck.length > 3);
    if (els.tip) els.tip.textContent = '画面タップ / 1〜' + deck.length + ' で関数切替 · 曲線で敵を迎え撃て';
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
    updateTunePanel();
  }

  function updateTuneRow(key) {
    var params = selectedParams[key];
    if (!params) return;
    var formula = $('tune-' + key + '-formula');
    if (formula) formula.textContent = formatModeLabel(key, selectedParams);
    var specs = E.PARAM_SPECS[key];
    for (var name in specs) {
      if (!Object.prototype.hasOwnProperty.call(specs, name)) continue;
      var val = $('tune-' + key + '-' + name + '-val');
      if (val) val.textContent = fmtNum(params[name]);
    }
  }

  function updateTunePanel() {
    var any = false;
    var first = null;
    var keys = ['quad', 'quadDown', 'wave'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var row = $('tune-row-' + key);
      if (!row) continue;
      var visible = selectedDeck.indexOf(key) >= 0;
      row.classList.toggle('hidden', !visible);
      if (!visible) continue;
      any = true;
      if (!first) first = key;
      var params = selectedParams[key];
      if (!params) continue;
      var specs = E.PARAM_SPECS[key];
      for (var name in specs) {
        if (!Object.prototype.hasOwnProperty.call(specs, name)) continue;
        var el = $('tune-' + key + '-' + name);
        if (el && (!(typeof document !== 'undefined' && document.activeElement === el))) {
          el.value = params[name];
        }
      }
      updateTuneRow(key);
    }
    if (els.tuneEmpty) els.tuneEmpty.classList.toggle('hidden', any);
    if (els.tunePreviewWrap) els.tunePreviewWrap.classList.toggle('hidden', !any);
    if (!any) {
      previewKey = null;
    } else if (!previewKey || selectedDeck.indexOf(previewKey) < 0 || !E.PARAM_SPECS[previewKey]) {
      previewKey = first;
    }
    updateTunePreview();
  }

  function setPreviewKey(key) {
    previewKey = key;
    updateTunePreview();
  }

  function onParamInput(key, name, value) {
    var spec = E.PARAM_SPECS[key] && E.PARAM_SPECS[key][name];
    if (!spec) return;
    var v = parseFloat(value);
    if (!isFinite(v)) return;
    selectedParams[key][name] = Math.max(spec.min, Math.min(spec.max, v));
    previewKey = key;
    saveParams();
    updateTunePanel();
    updateSlots();
  }

  function onParamCommit(key, name, value) {
    var spec = E.PARAM_SPECS[key] && E.PARAM_SPECS[key][name];
    if (!spec) return;
    var v = parseFloat(value);
    if (!isFinite(v)) v = selectedParams[key][name];
    selectedParams[key][name] = Math.max(spec.min, Math.min(spec.max, v));
    selectedParams = E.normalizeParams(selectedParams);
    saveParams();
    updateDeckUi();
  }

  function onWaveShapeChange(value) {
    var shape = Math.max(0, Math.min(4, Math.round(parseFloat(value) || 0)));
    selectedParams.wave.shape = shape;
    previewKey = 'wave';
    saveParams();
    updateTunePanel();
    updateSlots();
  }

  function updateTunePreview() {
    if (!previewCtx) return;
    var W = 560;
    var H = 92;
    var top = 8;
    var bottom = 84;
    previewCtx.clearRect(0, 0, W, H);
    previewCtx.fillStyle = 'rgba(7, 13, 24, 0.95)';
    previewCtx.fillRect(0, 0, W, H);
    previewCtx.strokeStyle = 'rgba(80, 170, 220, 0.12)';
    previewCtx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += 40) {
      previewCtx.beginPath();
      previewCtx.moveTo(gx, top);
      previewCtx.lineTo(gx, bottom);
      previewCtx.stroke();
    }
    for (var gy = top; gy <= bottom; gy += 19) {
      previewCtx.beginPath();
      previewCtx.moveTo(0, gy);
      previewCtx.lineTo(W, gy);
      previewCtx.stroke();
    }
    previewCtx.strokeStyle = 'rgba(95, 240, 255, 0.25)';
    previewCtx.beginPath();
    previewCtx.moveTo(0, top);
    previewCtx.lineTo(W, top);
    previewCtx.moveTo(0, bottom);
    previewCtx.lineTo(W, bottom);
    previewCtx.stroke();

    if (!previewKey || selectedDeck.indexOf(previewKey) < 0) {
      if (els.tuneDesc) els.tuneDesc.textContent = '係数を動かすと、この先の軌道がプレビューされます。';
      return;
    }
    var params = selectedParams[previewKey];
    if (!params) return;
    var mode = E.MODES[previewKey];
    var color = FAMILY_COLORS[mode.family] || FAMILY_COLORS.quad;
    var dt = 1 / 60;
    var tmax = 1.6;
    var fieldH = 520;
    var y = fieldH / 2;
    var power = Math.max(2, Math.round(params.p || 2));
    var shapeIndex = Math.max(0, Math.min(4, Math.round(params.shape || 0)));
    var waveAmp = 68 * (params.a || 1);
    var waveBase = fieldH / 2 - waveAmp * E.waveShapeValue(shapeIndex, params.c || 0, 0);
    var vy = (params.b || 0) * 120;
    var powerSign = previewKey === 'quad' ? -1 : 1;
    var points = [{ x: 0, y: top + (y / fieldH) * (bottom - top) }];
    var off = false;
    for (var t = dt; t <= tmax + 1e-9; t += dt) {
      if (previewKey === 'wave') {
        var theta = t * 4.2 * (params.b || 1) + (params.c || 0);
        y = waveBase + waveAmp * E.waveShapeValue(shapeIndex, theta, t);
      } else {
        vy = powerSign * 280 * (params.a || 1) * power * Math.pow(t, power - 1) + (params.b || 0) * 120;
        y += vy * dt;
      }
      if (y < 0 || y > fieldH) {
        off = true;
        y = clamp(y, 0, fieldH);
      }
      points.push({ x: W * t / tmax, y: top + (y / fieldH) * (bottom - top) });
    }

    previewCtx.save();
    previewCtx.lineCap = 'round';
    previewCtx.lineJoin = 'round';
    previewCtx.shadowColor = color;
    previewCtx.shadowBlur = 9;
    previewCtx.strokeStyle = color;
    previewCtx.lineWidth = 2.6;
    previewCtx.beginPath();
    for (var i = 0; i < points.length; i++) {
      if (i === 0) previewCtx.moveTo(points[i].x, points[i].y);
      else previewCtx.lineTo(points[i].x, points[i].y);
    }
    previewCtx.stroke();
    previewCtx.shadowBlur = 0;
    previewCtx.fillStyle = '#eaffff';
    previewCtx.beginPath();
    previewCtx.arc(points[0].x + 3, points[0].y, 3, 0, Math.PI * 2);
    previewCtx.fill();
    var last = points[points.length - 1];
    previewCtx.fillStyle = color;
    previewCtx.beginPath();
    previewCtx.arc(last.x - 3, last.y, 3.5, 0, Math.PI * 2);
    previewCtx.fill();
    previewCtx.restore();

    var desc;
    if (previewKey === 'wave') {
      var shapeNames = ['サイン', 'コサイン', '三角波', '角丸スクエア', '減衰サイン'];
      var shapeDescs = ['滑らかな上下', 'sinを位相ずらし', '折れ線で上下', '角を丸くした方形波', '時間とともに小さくなる'];
      desc = shapeNames[shapeIndex] + ' / 振幅 a=' + fmtNum(params.a) + ' / 周波数 b=' + fmtNum(params.b) + ' / 位相 c=' + fmtNum(params.c) +
        '。' + shapeDescs[shapeIndex] + '。';
    } else {
      var dir = previewKey === 'quad' ? '上' : '下';
      var bend = power >= 4 ? '終盤で一気に曲がる' : power === 3 ? '後半で強く曲がる' : 'じわじわ曲がる';
      desc = '累乗 p=' + power + ' / 曲率 a=' + fmtNum(params.a) + ' / 初速 b=' + fmtNum(params.b) +
        '。' + dir + 'に加速するカーブ。最初は' +
        (params.b > 0 ? '下向き' : params.b < 0 ? '上向き' : '水平') + '、' + bend + '。';
    }
    if (off) desc += ' このままだと画面端に到達。';
    if (els.tuneDesc) els.tuneDesc.textContent = desc;
  }

  function toggleDeck(key) {
    if (!E.MODES[key]) return;
    var idx = selectedDeck.indexOf(key);
    if (idx >= 0) selectedDeck.splice(idx, 1);
    else if (selectedDeck.length < 3) selectedDeck.push(key);
    else return;
    saveDeck();
    updateDeckUi();
    if (audio && !muted) audio.play('ui');
  }

  function showStart() {
    if (els.screenStart) els.screenStart.classList.add('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    if (els.screenClear) els.screenClear.classList.remove('visible');
    view.phase = 'idle';
    updateDeckUi();
  }

  function beginRun() {
    if (selectedDeck.length !== 3) return;
    state = E.createGame({ width: viewW, height: viewH, deck: selectedDeck.slice(), deckParams: selectedParams });
    view.phase = 'run';
    view.deathAt = 0;
    lastCombo = 0;
    if (audio) audio.setIntensity(0);
    particles = [];
    rings = [];
    labels = [];
    shake = 0;
    flash = 0;
    lastTs = 0;
    if (els.screenStart) els.screenStart.classList.remove('visible');
    if (els.screenEnd) els.screenEnd.classList.remove('visible');
    if (els.screenClear) els.screenClear.classList.remove('visible');
    if (els.btnStart && els.btnStart.blur) els.btnStart.blur();
    if (els.btnAgain && els.btnAgain.blur) els.btnAgain.blur();
    if (audio) {
      audio.setMuted(muted);
      if (!muted) {
        audio.unlock();
        audio.startBgm();
        audio.play('start');
      }
    }
    updateSlots();
    updateHud();
    showStageBanner(1);
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
    if (els.endStage) els.endStage.textContent = String(snap.stage);
    if (els.endX) els.endX.textContent = String(snap.x);
    if (els.screenEnd) els.screenEnd.classList.add('visible');
    if (audio) {
      audio.setIntensity(0);
      audio.stopBgm();
      audio.play('over');
    }
    updateSlots();
    updateHud();
  }

  function showStageBanner(stage) {
    if (!els.stageBanner) return;
    els.stageBanner.textContent = 'STAGE ' + stage;
    els.stageBanner.classList.remove('show');
    void els.stageBanner.offsetWidth;
    els.stageBanner.classList.add('show');
  }

  function showClear() {
    view.phase = 'clear';
    var snap = E.snapshot(state);
    if (snap.score > best) {
      best = snap.score;
      saveBest(best);
    }
    if (els.clearStage) els.clearStage.textContent = 'STAGE ' + snap.stage;
    if (els.clearScore) els.clearScore.textContent = String(snap.score);
    if (els.clearBonus) els.clearBonus.textContent = '+' + snap.stageClearBonus;
    if (els.clearLife) els.clearLife.textContent = lifeText(snap.hp, snap.maxHp);
    view.upgradeIds = E.upgradeChoices(state);
    updateUpgradeCards(snap);
    if (els.screenClear) els.screenClear.classList.add('visible');
    if (audio) {
      audio.setIntensity(0);
      audio.stopBgm();
    }
    updateSlots();
    updateHud();
  }

  function updateUpgradeCards(snap) {
    for (var i = 0; i < 3; i++) {
      var btn = $('upgrade-' + i);
      if (!btn) continue;
      var id = view.upgradeIds[i];
      if (!id) {
        btn.classList.add('hidden');
        continue;
      }
      btn.classList.remove('hidden');
      var info = UPGRADE_INFO[id] || { title: id, desc: '' };
      btn.innerHTML = '<em>' + (i + 1) + '</em><b>' + info.title + '</b><span>' + info.desc + '</span>';
    }
    if (els.runUpgrades) {
      var parts = [];
      var upgrades = snap && snap.upgrades ? snap.upgrades : {};
      for (var key in UPGRADE_INFO) {
        if (!Object.prototype.hasOwnProperty.call(UPGRADE_INFO, key)) continue;
        var count = upgrades[key] || 0;
        if (count > 0) parts.push(UPGRADE_INFO[key].title + (count > 1 ? ' x' + count : ''));
      }
      els.runUpgrades.textContent = parts.length ? 'このランの強化: ' + parts.join(' / ') : 'このランの強化: なし';
    }
  }

  function chooseUpgrade(index) {
    if (view.phase !== 'clear' || !state) return;
    var id = view.upgradeIds[index];
    if (!id) return;
    if (!E.applyUpgrade(state, id)) {
      view.upgradeIds = E.upgradeChoices(state);
      updateUpgradeCards(E.snapshot(state));
      return;
    }
    goNextStage();
  }

  function goNextStage() {
    if (!state || !state.stageCleared) return;
    if (!E.nextStage(state)) return;
    view.phase = 'run';
    view.deathAt = 0;
    view.clearAt = 0;
    lastCombo = 0;
    particles = [];
    rings = [];
    labels = [];
    shake = 0;
    flash = 0;
    lastTs = 0;
    if (els.screenClear) els.screenClear.classList.remove('visible');
    if (audio) {
      audio.setIntensity(0);
      if (!muted) {
        audio.unlock();
        audio.startBgm();
        audio.play('start');
      }
    }
    updateSlots();
    updateHud();
    showStageBanner(state.stage);
  }

  /* ===== 入力 ===== */
  function selectSlot(index) {
    if (!state || view.phase !== 'run' || state.over) return;
    var key = state.deck[index];
    if (key && E.setMode(state, key)) updateSlots();
  }

  function startOrRestart() {
    if (view.phase === 'clear') {
      chooseUpgrade(0);
      return;
    }
    if ((view.phase === 'idle' || view.phase === 'over') && selectedDeck.length === 3) beginRun();
  }

  function backToDeck() {
    if (audio) audio.stopBgm();
    if (els.screenClear) els.screenClear.classList.remove('visible');
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

  function toggleSound() {
    muted = !muted;
    saveMuted(muted);
    if (audio) {
      audio.setMuted(muted);
      if (muted) audio.stopBgm();
      else {
        audio.unlock();
        if (view.phase === 'run') audio.startBgm();
        audio.play('ui');
      }
    }
    updateSoundButton();
  }

  function onKey(e) {
    if (!e) return;
    var k = e.key || '';
    if (view.phase === 'clear') {
      if (k === '1') chooseUpgrade(0);
      else if (k === '2') chooseUpgrade(1);
      else if (k === '3') chooseUpgrade(2);
      else if (k === ' ' || k === 'Enter') chooseUpgrade(0);
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
        if (ev.heal) {
          addLabel(ev.x, ev.y + 52, 'LIFE +1', '#57e08a', 14);
          addRing(ev.x, ev.y, 'rgba(87, 224, 138, 0.8)', 60, 0.5);
          if (audio) audio.play('heal');
        }
      } else if (ev.type === 'bossSpawn') {
        spawnParticles(ev.x, ev.y, 32, ['#ff4d8d', '#ffd166', '#ffffff'], 280, 0.9);
        addRing(ev.x, ev.y, 'rgba(255, 77, 141, 0.95)', 90, 0.6);
        addLabel(ev.x - 60, ev.y - 20, 'BOSS', '#ff4d8d', 30);
        shake = 1;
        flash = 0.45;
        flashColor = '255, 77, 141';
        if (audio) audio.play('boss');
      } else if (ev.type === 'bossShift') {
        addRing(ev.x, ev.y, 'rgba(255, 209, 102, 0.9)', 80, 0.5);
        addLabel(ev.x - 20, ev.y - 62, 'WEAK SHIFT: ' + ev.familyLabel, '#ffd166', 15);
        if (audio) audio.play('weak');
      } else if (ev.type === 'bossEscape') {
        addLabel(viewW * 0.5 - 80, viewH * 0.4, 'BOSS ESCAPED', '#ff6b5e', 24);
        spawnParticles(40, ev.y || viewH * 0.5, 24, ['#ff4d8d', '#ff8f6b'], 240, 0.8);
        shake = 0.9;
        flash = 0.4;
        flashColor = '255, 77, 141';
        if (audio) audio.play('miss');
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
      var family = r.family || 'wave';
      var color = FAMILY_COLORS[family] || FAMILY_COLORS.wave;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.font = '9.5px ui-monospace, Menlo, monospace';
      var labelY = E.rivalY(r, 0) - 8;
      if (labelY < state.top + 10) labelY = E.rivalY(r, 0) + 16;
      ctx.fillText(r.label + ' / 弱点:' + (E.FAMILY_LABELS[family] || '—'), r.x + 4, labelY);
      ctx.globalAlpha = 1;
    }
  }

  function drawBoss(time) {
    if (!state || !state.boss) return;
    var boss = state.boss;
    if (boss.x > viewW + 80 || boss.x + boss.len < -80) return;
    var color = FAMILY_COLORS[boss.family] || FAMILY_COLORS.wave;
    var points = 44;
    ctx.beginPath();
    for (var j = 0; j <= points; j++) {
      var local = boss.len * j / points;
      var px = boss.x + local;
      var py = E.rivalY(boss, local);
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (boss.flash > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.min(0.9, boss.flash * 3) + ')';
      ctx.lineWidth = 8;
      ctx.stroke();
    }
    ctx.restore();

    for (var k = 1; k <= 3; k++) {
      var lp = boss.len * k / 4;
      var wx = boss.x + lp;
      var wy = E.rivalY(boss, lp);
      var pulse = 0.7 + 0.3 * Math.sin(time * 5 + k * 1.7);
      ctx.fillStyle = color;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(wx, wy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = color;
    ctx.font = '900 13px ui-monospace, Menlo, monospace';
    var labelY = E.rivalY(boss, 0) - 18;
    if (labelY < state.top + 12) labelY = E.rivalY(boss, 0) + 24;
    ctx.fillText('BOSS / 弱点:' + (E.FAMILY_LABELS[boss.family] || '—'), boss.x + 8, labelY);
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

    /* 描いた時点の関数の系統で色分けする。敵の色と一致すると弱点ボーナス */
    if (trail.length > 1) {
      ctx.save();
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      for (i = 1; i < trail.length; i++) {
        var pointMode = trail[i].mode || state.mode;
        var pointFamily = E.MODES[pointMode] ? E.MODES[pointMode].family : 'none';
        ctx.strokeStyle = FAMILY_COLORS[pointFamily] || FAMILY_COLORS.none;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    var headColor = modeColor(state.mode);
    var hx = state.headX;
    var hy = state.y;
    ctx.save();
    ctx.shadowColor = headColor;
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.arc(hx, hy, 10 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.fillStyle = headColor;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText(formatModeLabel(state.mode, state.deckParams), hx + 15, hy - 12);
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
    drawBoss(time);
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

    if (view.phase === 'run' && state && !state.over && !state.stageCleared) {
      E.update(state, dt);
      processEvents();
      if (state.combo !== lastCombo) {
        lastCombo = state.combo;
        if (audio) audio.setIntensity(Math.min(3, Math.floor(state.combo / 2)));
      }
      if (state.stageCleared) {
        view.phase = 'clearing';
        view.clearAt = ts;
        updateSlots();
        updateHud();
      } else if (state.over) {
        view.phase = 'dying';
        view.deathAt = ts;
        updateSlots();
      } else {
        updateHud();
      }
    } else if (view.phase === 'dying' && state && state.over) {
      if (ts - view.deathAt > 700) showEnd();
    } else if (view.phase === 'clearing' && state && state.stageCleared) {
      if (ts - view.clearAt > 900) showClear();
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
    els.modeButtons = $('mode-buttons');
    els.tip = $('tip');
    els.tuneRows = $('tune-rows');
    els.tuneEmpty = $('tune-empty');
    els.tunePreviewWrap = $('tune-preview-wrap');
    els.tunePreview = $('tune-preview');
    els.tuneDesc = $('tune-desc');
    if (els.tunePreview && typeof els.tunePreview.getContext === 'function') {
      try { previewCtx = els.tunePreview.getContext('2d'); } catch (e) { previewCtx = null; }
    }
    els.endScore = $('end-score');
    els.endBest = $('end-best');
    els.endCombo = $('end-combo');
    els.endStage = $('end-stage');
    els.endX = $('end-x');
    els.btnSound = $('btn-sound');
    els.stageInfo = $('stage-info');
    els.stageLabel = $('stage-label');
    els.stageFill = $('stage-fill');
    els.stageNote = $('stage-note');
    els.stageBanner = $('stage-banner');
    els.screenClear = $('screen-clear');
    els.clearStage = $('clear-stage');
    els.clearScore = $('clear-score');
    els.clearBonus = $('clear-bonus');
    els.clearLife = $('clear-life');
    els.runUpgrades = $('run-upgrades');

    if (canvas && typeof canvas.getContext === 'function') {
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
    }

    var keys = E.MODE_KEYS;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var card = $('card-' + key);
      if (!card) continue;
      deckCards[key] = card;
      card.style.setProperty('--mode-color', modeColor(key));
      (function (modeKey, el) {
        el.addEventListener('click', function () {
          toggleDeck(modeKey);
          if (el.blur) el.blur();
        });
      })(key, card);
    }

    for (i = 0; i < 4; i++) {
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

    for (i = 0; i < 3; i++) {
      (function (index) {
        var btn = $('upgrade-' + index);
        if (btn) btn.addEventListener('click', function () { chooseUpgrade(index); });
      })(i);
    }
    var paramDefs = [
      ['tune-quad-a', 'quad', 'a'],
      ['tune-quad-b', 'quad', 'b'],
      ['tune-quad-p', 'quad', 'p'],
      ['tune-quadDown-a', 'quadDown', 'a'],
      ['tune-quadDown-b', 'quadDown', 'b'],
      ['tune-quadDown-p', 'quadDown', 'p'],
      ['tune-wave-a', 'wave', 'a'],
      ['tune-wave-b', 'wave', 'b'],
      ['tune-wave-c', 'wave', 'c']
    ];
    for (i = 0; i < paramDefs.length; i++) {
      (function (def) {
        var el = $(def[0]);
        if (!el) return;
        el.addEventListener('input', function () { onParamInput(def[1], def[2], el.value); });
        el.addEventListener('change', function () { onParamCommit(def[1], def[2], el.value); });
        el.addEventListener('focus', function () { setPreviewKey(def[1]); });
      })(paramDefs[i]);
    }
    var waveShapeSelect = $('tune-wave-shape');
    if (waveShapeSelect) {
      waveShapeSelect.addEventListener('change', function () {
        onWaveShapeChange(waveShapeSelect.value);
      });
    }
    var tuneKeys = ['quad', 'quadDown', 'wave'];
    for (i = 0; i < tuneKeys.length; i++) {
      (function (key) {
        var row = $('tune-row-' + key);
        if (row) row.addEventListener('click', function () { setPreviewKey(key); });
      })(tuneKeys[i]);
    }
    if (els.btnStart) els.btnStart.addEventListener('click', beginRun);
    if (els.btnAgain) els.btnAgain.addEventListener('click', beginRun);
    if (els.btnDeck) els.btnDeck.addEventListener('click', backToDeck);
    if (els.btnSound) els.btnSound.addEventListener('click', toggleSound);
    if (audio) audio.setMuted(muted);
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
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!audio) return;
        if (document.hidden) audio.stopBgm();
        else if (view.phase === 'run' && !muted) audio.startBgm();
      });
    }

    resizeCanvas();
    watchStageSize();
    updateHud();
    updateSoundButton();
    updateDeckUi();
    showStart();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'graph-cross',
        title: 'グラフクロス',
        start: function () { beginRun(); },
        autoPlayStep: function () {},
        isDone: function () {
          return !!(state && ((state.over && view.phase === 'over') || (state.stageCleared && view.phase === 'clear')));
        },
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
