/* ui.js : DOM・HUD・デッキ選択・関数ビルダー・画面遷移（ゲーム進行は game.js） */
(function (root, factory) {
  'use strict';
  var C = (typeof module !== 'undefined' && module.exports) ? require('./content.js') : root.GraphContent;
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.GraphCrossEngine;
  var B = (typeof module !== 'undefined' && module.exports) ? require('./balance.js') : root.GraphBalance;
  var api = factory(C, E, B);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, E, B) {
  'use strict';

  function create(options) {
    options = options || {};
    var renderer = options.renderer || null;
    var actions = options.actions || {};
    var els = {};
    var slotButtons = [];
    var deckCards = {};
    var selectedDeck = loadDeck();
    var selectedParams = loadParams();
    var previewKey = null;
    var best = loadBest();
    var muted = loadMuted();
    var lastState = null;
    var lastPhase = 'idle';

    function $(id) { return document.getElementById(id); }
    function playUi() { if (typeof actions.playUi === 'function' && !muted) actions.playUi(); }

    function loadMuted() {
      try {
        if (typeof localStorage === 'undefined') return false;
        return localStorage.getItem('graph-cross-muted') === '1';
      } catch (e) { return false; }
    }
    function saveMuted(value) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('graph-cross-muted', value ? '1' : '0');
      } catch (e) { }
    }
    function loadBest() {
      try {
        if (typeof localStorage === 'undefined') return 0;
        return Math.max(0, parseInt(localStorage.getItem('graph-cross-best') || '0', 10) || 0);
      } catch (e) { return 0; }
    }
    function saveBest(value) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('graph-cross-best', String(value));
      } catch (e) { }
    }
    function loadParams() {
      try {
        if (typeof localStorage === 'undefined') return E.normalizeParams(null);
        var raw = localStorage.getItem('graph-cross-params');
        return E.normalizeParams(raw ? JSON.parse(raw) : null);
      } catch (e) { return E.normalizeParams(null); }
    }
    function saveParams() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('graph-cross-params', JSON.stringify(selectedParams));
        }
      } catch (e) { }
    }
    function deckIsValid(deck) {
      if (!Array.isArray(deck) || deck.length !== C.DECK_SIZE) return false;
      var seen = {};
      for (var i = 0; i < deck.length; i++) {
        if (!C.MODES[deck[i]] || seen[deck[i]]) return false;
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
      } catch (e) { return fallback; }
    }
    function saveDeck() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('graph-cross-deck', JSON.stringify(selectedDeck));
        }
      } catch (e) { }
    }
    function lifeText(hp, maxHp) {
      var total = maxHp || E.MAX_HP;
      var out = '';
      for (var i = 0; i < total; i++) out += i < hp ? '●' : '○';
      return out;
    }

    function updateSoundButton() {
      if (!els.btnSound) return;
      els.btnSound.textContent = muted ? '音 OFF' : '音 ON';
      els.btnSound.classList.toggle('muted', muted);
    }

    function updateHud(state) {
      lastState = state || null;
      var snap = state ? E.snapshot(state) : null;
      var stress = !!(snap && snap.infiniteLives);
      if (els.score) els.score.textContent = snap ? String(snap.score) : '0';
      if (els.best) els.best.textContent = String(best);
      if (els.combo) els.combo.textContent = snap && snap.combo > 0 ? 'x' + snap.combo : '-';
      if (els.life) els.life.textContent = stress ? '∞' : (snap ? lifeText(snap.hp, snap.maxHp) : lifeText(E.MAX_HP, E.MAX_HP));
      if (els.life) els.life.classList.toggle('danger', !!(snap && !stress && snap.hp <= 1));

      if (els.stageLabel) {
        var stage = snap ? snap.stage : 1;
        if (stress) {
          els.stageLabel.textContent = 'STRESS MODE';
          if (els.stageFill) els.stageFill.style.width = '100%';
          if (els.stageNote) els.stageNote.textContent = '倒した敵 ' + (snap.hits || 0) + ' / COMBO x' + (snap.combo || 0);
        } else if (snap && snap.stageCleared) {
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
          els.stageInfo.classList.toggle('stress', stress);
          els.stageInfo.classList.toggle('boss', !!(snap && snap.boss && !snap.stageCleared && !stress));
          els.stageInfo.classList.toggle('cleared', !!(snap && snap.stageCleared && !stress));
        }
      }
      if (els.btnExit) els.btnExit.classList.toggle('hidden', !stress);
    }

    function updateSlots(state, phase) {
      lastPhase = phase || lastPhase;
      var deck = state ? state.deck : selectedDeck;
      var params = state ? state.deckParams : selectedParams;
      for (var i = 0; i < 4; i++) {
        var btn = slotButtons[i];
        if (!btn) continue;
        var key = deck[i];
        if (!key) {
          btn.innerHTML = '<b>-</b><span>空き</span><em>' + (i + 1) + '</em>';
          btn.disabled = true;
          btn.classList.remove('active');
          btn.classList.add('hidden');
          if (btn.removeAttribute) btn.removeAttribute('data-genre');
          else btn.setAttribute('data-genre', '');
          continue;
        }
        btn.classList.remove('hidden');
        var mode = C.MODES[key];
        btn.setAttribute('data-genre', C.GENRE_LABELS[mode.genre] || '');
        var familyNote = mode.family !== 'none' ? ' · ' + C.FAMILY_LABELS[mode.family] : '';
        btn.innerHTML = '<b>' + C.formatModeLabel(key, params) + '</b><span>' + mode.note + familyNote + '</span><em>' + (i + 1) + '</em>';
        btn.style.setProperty('--mode-color', C.modeColor(key));
        btn.disabled = !(state && phase === 'run' && !state.over);
        btn.classList.toggle('active', !!(state && state.mode === key));
      }
      if (els.modeButtons) els.modeButtons.classList.toggle('four', deck.length > 3);
      if (els.tip) els.tip.textContent = '画面タップ / 1〜' + deck.length + ' で関数切替 · 曲線で敵を迎え撃て';
    }

    function updateTuneRow(key) {
      var params = selectedParams[key];
      if (!params) return;
      var formula = $('tune-' + key + '-formula');
      if (formula) formula.textContent = C.formatModeLabel(key, selectedParams);
      var specs = C.PARAM_SPECS[key];
      for (var name in specs) {
        if (!Object.prototype.hasOwnProperty.call(specs, name)) continue;
        var val = $('tune-' + key + '-' + name + '-val');
        if (val) val.textContent = C.fmtNum(params[name]);
      }
    }

    function updateTunePreview() {
      var params = previewKey ? selectedParams[previewKey] : null;
      if (renderer && els.tunePreview && previewKey && params) {
        renderer.drawPreview(els.tunePreview, previewKey, params);
      }
      if (!els.tuneDesc) return;
      if (!previewKey || !params) {
        els.tuneDesc.textContent = 'スライダーを動かすと、この先の軌道がプレビューされます。';
        return;
      }
      var desc;
      if (previewKey === 'wave') {
        var shapeIndex = Math.max(0, Math.min(4, Math.round(params.shape || 0)));
        desc = (C.WAVE_SHAPE_LABELS[shapeIndex] || '波') + ' / 振幅 a=' + C.fmtNum(params.a) +
          ' / 周波数 b=' + C.fmtNum(params.b) + ' / 位相 c=' + C.fmtNum(params.c) +
          '。' + (C.WAVE_SHAPE_DESCS[shapeIndex] || '') + '。';
      } else {
        var power = Math.max(2, Math.round(params.p || 2));
        var dir = previewKey === 'quad' ? '上' : '下';
        var bend = power >= 4 ? '終盤で一気に曲がる' : power === 3 ? '後半で強く曲がる' : 'じわじわ曲がる';
        desc = '累乗 p=' + power + ' / 曲率 a=' + C.fmtNum(params.a) + ' / 初速 b=' + C.fmtNum(params.b) +
          '。' + dir + 'に加速するカーブ。最初は' +
          (params.b > 0 ? '下向き' : params.b < 0 ? '上向き' : '水平') + '、' + bend + '。';
      }
      els.tuneDesc.textContent = desc;
    }

    function updateTunePanel() {
      var any = false;
      var first = null;
      var keys = Object.keys(C.PARAM_SPECS);
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
        var specs = C.PARAM_SPECS[key];
        for (var name in specs) {
          if (!Object.prototype.hasOwnProperty.call(specs, name)) continue;
          var input = $('tune-' + key + '-' + name);
          if (input && (!(typeof document !== 'undefined' && document.activeElement === input))) {
            input.value = params[name];
          }
        }
        updateTuneRow(key);
      }
      if (els.tuneEmpty) els.tuneEmpty.classList.toggle('hidden', any);
      if (els.tunePreviewWrap) els.tunePreviewWrap.classList.toggle('hidden', !any);
      if (!any) {
        previewKey = null;
      } else if (!previewKey || selectedDeck.indexOf(previewKey) < 0 || !C.PARAM_SPECS[previewKey]) {
        previewKey = first;
      }
      updateTunePreview();
    }

    function updateDeckUi() {
      if (els.deckCount) els.deckCount.textContent = selectedDeck.length + '/' + C.DECK_SIZE;
      for (var key in deckCards) {
        if (!Object.prototype.hasOwnProperty.call(deckCards, key)) continue;
        deckCards[key].classList.toggle('selected', selectedDeck.indexOf(key) >= 0);
      }
      if (els.btnStart) {
        var ready = selectedDeck.length === C.DECK_SIZE;
        els.btnStart.disabled = !ready;
        els.btnStart.classList.toggle('disabled', !ready);
        if (els.btnStress) {
          els.btnStress.disabled = !ready;
        }
      }
      updateSlots(lastState, lastPhase);
      updateTunePanel();
    }

    function setPreviewKey(key) {
      previewKey = key;
      updateTunePreview();
    }

    function onParamInput(key, name, value) {
      var spec = C.PARAM_SPECS[key] && C.PARAM_SPECS[key][name];
      if (!spec) return;
      var v = parseFloat(value);
      if (!isFinite(v)) return;
      selectedParams[key][name] = Math.max(spec.min, Math.min(spec.max, v));
      previewKey = key;
      saveParams();
      updateTunePanel();
      updateSlots(lastState, lastPhase);
    }

    function onParamCommit(key, name, value) {
      var spec = C.PARAM_SPECS[key] && C.PARAM_SPECS[key][name];
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
      updateSlots(lastState, lastPhase);
      playUi();
    }

    function toggleDeck(key) {
      if (!C.MODES[key]) return;
      var idx = selectedDeck.indexOf(key);
      if (idx >= 0) selectedDeck.splice(idx, 1);
      else if (selectedDeck.length < C.DECK_SIZE) selectedDeck.push(key);
      else return;
      saveDeck();
      updateDeckUi();
      playUi();
    }

    function toggleSound() {
      muted = !muted;
      saveMuted(muted);
      updateSoundButton();
      if (typeof actions.onSoundChange === 'function') actions.onSoundChange(muted);
      playUi();
    }

    function showStageBanner(stage) {
      if (!els.stageBanner) return;
      els.stageBanner.textContent = typeof stage === 'number' ? 'STAGE ' + stage : String(stage);
      els.stageBanner.classList.remove('show');
      void els.stageBanner.offsetWidth;
      els.stageBanner.classList.add('show');
    }

    function hideScreens() {
      if (els.screenStart) els.screenStart.classList.remove('visible');
      if (els.screenEnd) els.screenEnd.classList.remove('visible');
      if (els.screenClear) els.screenClear.classList.remove('visible');
    }

    function showStart() {
      lastState = null;
      lastPhase = 'idle';
      if (els.screenStart) els.screenStart.classList.add('visible');
      if (els.screenEnd) els.screenEnd.classList.remove('visible');
      if (els.screenClear) els.screenClear.classList.remove('visible');
      if (els.btnExit) els.btnExit.classList.add('hidden');
      updateDeckUi();
      updateHud(null);
    }

    function updateUpgradeCards(ids, snap) {
      for (var i = 0; i < 3; i++) {
        var btn = $('upgrade-' + i);
        if (!btn) continue;
        var id = ids[i];
        if (!id) {
          btn.classList.add('hidden');
          continue;
        }
        btn.classList.remove('hidden');
        var info = C.UPGRADE_INFO[id] || { title: id, desc: '' };
        btn.innerHTML = '<em>' + (i + 1) + '</em><b>' + info.title + '</b><span>' + info.desc + '</span>';
      }
      if (els.runUpgrades) {
        var parts = [];
        var upgrades = snap && snap.upgrades ? snap.upgrades : {};
        for (var key in C.UPGRADE_INFO) {
          if (!Object.prototype.hasOwnProperty.call(C.UPGRADE_INFO, key)) continue;
          var count = upgrades[key] || 0;
          if (count > 0) {
            var title = C.UPGRADE_INFO[key].title;
            var base = key === 'bonus' ? 'スコア +' + C.fmtNum(B.UPGRADE_BONUS_SCORE) : title;
            if (key === 'life') base = 'ライフ +' + count;
            else if (key === 'hit') base = '判定 +' + count * B.UPGRADE_HIT_STEP;
            else if (key === 'combo') base = 'コンボ +' + C.fmtNum(count * B.UPGRADE_COMBO_STEP) + '秒';
            else if (key === 'score') base = 'スコア +' + Math.round(count * B.UPGRADE_SCORE_STEP * 100) + '%';
            else if (key === 'boss') base = 'ボス HP -' + count * B.UPGRADE_BOSS_STEP;
            parts.push(base);
          }
        }
        els.runUpgrades.textContent = parts.length ? 'このランの強化: ' + parts.join(' / ') : 'このランの強化: なし';
      }
    }

    function showEnd(state) {
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
      if (els.screenStart) els.screenStart.classList.remove('visible');
      if (els.screenClear) els.screenClear.classList.remove('visible');
      if (els.btnExit) els.btnExit.classList.add('hidden');
      updateHud(state);
      updateSlots(state, 'over');
    }

    function showClear(state, upgradeIds) {
      var snap = E.snapshot(state);
      if (snap.score > best) {
        best = snap.score;
        saveBest(best);
      }
      if (els.clearStage) els.clearStage.textContent = 'STAGE ' + snap.stage;
      if (els.clearScore) els.clearScore.textContent = String(snap.score);
      if (els.clearBonus) els.clearBonus.textContent = '+' + snap.stageClearBonus;
      if (els.clearLife) els.clearLife.textContent = lifeText(snap.hp, snap.maxHp);
      if (els.deckSwap) {
        var swap = snap.lastDeckSwap;
        if (swap) {
          var genreText = swap.genre ? ' [' + (C.GENRE_LABELS[swap.genre] || '') + ']' : '';
          els.deckSwap.innerHTML = 'デッキ変動' + genreText + ': ' + C.formatModeLabel(swap.oldKey, snap.deckParams) +
            ' <span>→</span> ' + C.formatModeLabel(swap.newKey, snap.deckParams);
          els.deckSwap.classList.remove('hidden');
        } else {
          els.deckSwap.classList.add('hidden');
        }
      }
      updateUpgradeCards(upgradeIds, snap);
      if (els.screenClear) els.screenClear.classList.add('visible');
      if (els.screenStart) els.screenStart.classList.remove('visible');
      if (els.screenEnd) els.screenEnd.classList.remove('visible');
      if (els.btnExit) els.btnExit.classList.add('hidden');
      updateHud(state);
      updateSlots(state, 'clear');
    }

    function setRuntime(state, phase) {
      lastState = state || null;
      lastPhase = phase || 'idle';
      updateHud(state);
      updateSlots(state, lastPhase);
    }

    function init() {
      els.stage = $('stage');
      els.score = $('score');
      els.best = $('best');
      els.combo = $('combo');
      els.life = $('life');
      els.screenStart = $('screen-start');
      els.screenEnd = $('screen-end');
      els.screenClear = $('screen-clear');
      els.btnStart = $('btn-start');
      els.btnStress = $('btn-stress');
      els.btnExit = $('btn-exit');
      els.btnAgain = $('btn-again');
      els.btnDeck = $('btn-deck');
      els.btnSound = $('btn-sound');
      els.clearStage = $('clear-stage');
      els.clearScore = $('clear-score');
      els.clearBonus = $('clear-bonus');
      els.clearLife = $('clear-life');
      els.runUpgrades = $('run-upgrades');
      els.deckSwap = $('deck-swap');
      els.endScore = $('end-score');
      els.endBest = $('end-best');
      els.endCombo = $('end-combo');
      els.endStage = $('end-stage');
      els.endX = $('end-x');
      els.stageInfo = $('stage-info');
      els.stageLabel = $('stage-label');
      els.stageFill = $('stage-fill');
      els.stageNote = $('stage-note');
      els.stageBanner = $('stage-banner');
      els.modeButtons = $('mode-buttons');
      els.tip = $('tip');
      els.deckCount = $('deck-count');
      els.tuneRows = $('tune-rows');
      els.tuneEmpty = $('tune-empty');
      els.tunePreviewWrap = $('tune-preview-wrap');
      els.tunePreview = $('tune-preview');
      els.tuneDesc = $('tune-desc');

      var keys = C.MODE_KEYS;
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var card = $('card-' + key);
        if (!card) continue;
        deckCards[key] = card;
        card.style.setProperty('--mode-color', C.modeColor(key));
        card.setAttribute('data-genre', C.GENRE_LABELS[C.MODES[key].genre] || '');
        var b = card.children && card.children[0];
        var note = card.children && card.children[1];
        if (b) b.textContent = C.MODES[key].label;
        if (note) {
          var fam = C.MODES[key].family;
          note.textContent = C.MODES[key].note + (fam !== 'none' ? ' / ' + C.FAMILY_LABELS[fam] : '');
        }
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
            if (typeof actions.onSlot === 'function') actions.onSlot(index);
            if (el.blur) el.blur();
          });
        })(i, slot);
      }

      var paramDefs = [];
      for (var pkey in C.PARAM_SPECS) {
        if (!Object.prototype.hasOwnProperty.call(C.PARAM_SPECS, pkey)) continue;
        for (var pname in C.PARAM_SPECS[pkey]) {
          if (Object.prototype.hasOwnProperty.call(C.PARAM_SPECS[pkey], pname)) {
            if (pname !== 'shape') paramDefs.push(['tune-' + pkey + '-' + pname, pkey, pname]);
          }
        }
      }
      for (i = 0; i < paramDefs.length; i++) {
        (function (def) {
          var el = $('tune-' + def[1] + '-' + def[2]);
          if (!el) return;
          el.addEventListener('input', function () { onParamInput(def[1], def[2], el.value); });
          el.addEventListener('change', function () { onParamCommit(def[1], def[2], el.value); });
          el.addEventListener('focus', function () { setPreviewKey(def[1]); });
        })(paramDefs[i]);
      }
      var tuneKeys = Object.keys(C.PARAM_SPECS);
      for (i = 0; i < tuneKeys.length; i++) {
        (function (key) {
          var row = $('tune-row-' + key);
          if (row) row.addEventListener('click', function () { setPreviewKey(key); });
        })(tuneKeys[i]);
      }
      var waveShapeSelect = $('tune-wave-shape');
      if (waveShapeSelect) {
        waveShapeSelect.addEventListener('change', function () { onWaveShapeChange(waveShapeSelect.value); });
      }

      if (els.btnStart) els.btnStart.addEventListener('click', function () { if (typeof actions.onStart === 'function') actions.onStart(); });
      if (els.btnStress) els.btnStress.addEventListener('click', function () { if (typeof actions.onStressStart === 'function') actions.onStressStart(); });
      if (els.btnExit) els.btnExit.addEventListener('click', function () { if (typeof actions.onExit === 'function') actions.onExit(); });
      if (els.btnAgain) els.btnAgain.addEventListener('click', function () { if (typeof actions.onStart === 'function') actions.onStart(); });
      if (els.btnDeck) els.btnDeck.addEventListener('click', function () { if (typeof actions.onBackToDeck === 'function') actions.onBackToDeck(); });
      if (els.btnSound) els.btnSound.addEventListener('click', toggleSound);
      for (i = 0; i < 3; i++) {
        (function (index) {
          var btn = $('upgrade-' + index);
          if (btn) btn.addEventListener('click', function () { if (typeof actions.onUpgrade === 'function') actions.onUpgrade(index); });
        })(i);
      }

      updateSoundButton();
      updateDeckUi();
      showStart();
    }

    return {
      init: init,
      getDeck: function () { return selectedDeck.slice(); },
      getParams: function () { return selectedParams; },
      getBest: function () { return best; },
      isMuted: function () { return muted; },
      setRuntime: setRuntime,
      updateHud: updateHud,
      updateSlots: updateSlots,
      updateUpgradeCards: updateUpgradeCards,
      showStart: showStart,
      hideScreens: hideScreens,
      showEnd: showEnd,
      showClear: showClear,
      showStageBanner: showStageBanner
    };
  }

  return { create: create };
});
