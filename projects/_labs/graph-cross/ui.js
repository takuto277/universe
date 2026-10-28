/* ui.js : DOM・HUD・デッキ選択・関数ビルダー・画面遷移（ゲーム進行は game.js） */
(function (root, factory) {
  'use strict';
  var C = (typeof module !== 'undefined' && module.exports) ? require('./content.js') : root.GraphContent;
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.GraphCrossEngine;
  var B = (typeof module !== 'undefined' && module.exports) ? require('./balance.js') : root.GraphBalance;
  var G = (typeof module !== 'undefined' && module.exports) ? require('./gacha.js') : root.GraphGacha;
  var api = factory(C, E, B, G);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, E, B, G) {
  'use strict';

  function tutorialSvg(body) {
    return '<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<filter id="tutGlow" x="-60%" y="-60%" width="220%" height="220%">' +
          '<feGaussianBlur stdDeviation="3" result="b"/>' +
          '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
        '</filter>' +
        '<linearGradient id="tutBg" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#0a1a2c"/>' +
          '<stop offset="1" stop-color="#050b14"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<rect x="1" y="1" width="238" height="118" rx="12" fill="url(#tutBg)" stroke="#1e3b56"/>' +
      '<g stroke="#224666" stroke-width="1" opacity=".42">' +
        '<path d="M16 30 H224"/><path d="M16 60 H224"/><path d="M16 90 H224"/>' +
        '<path d="M50 10 V110"/><path d="M120 10 V110"/><path d="M190 10 V110"/>' +
      '</g>' +
      body +
    '</svg>';
  }

  var TUTORIAL_ART = {
    switch: tutorialSvg([
      '<rect x="17" y="16" width="58" height="54" rx="8" fill="#0b1a2c" stroke="#23435f"/>',
      '<path d="M27 54 C37 54 43 42 49 42 S60 54 67 54" fill="none" stroke="#5ff0ff" stroke-width="2" stroke-linecap="round"/>',
      '<rect x="89" y="12" width="62" height="62" rx="8" fill="#13283d" stroke="#ffd166" stroke-width="1.5" filter="url(#tutGlow)"/>',
      '<path d="M99 61 C112 61 120 34 141 24" fill="none" stroke="#ffd166" stroke-width="2.2" stroke-linecap="round"/>',
      '<circle cx="141" cy="24" r="3.2" fill="#ffd166" class="tut-pulse"/>',
      '<rect x="165" y="16" width="58" height="54" rx="8" fill="#0b1a2c" stroke="#23435f"/>',
      '<path d="M175 45 C183 30 191 58 199 45 S209 30 215 45" fill="none" stroke="#ff7ad9" stroke-width="2" stroke-linecap="round"/>',
      '<rect x="35" y="84" width="22" height="18" rx="4" fill="#102338" stroke="#2b4c6a"/>',
      '<text x="46" y="97" text-anchor="middle" fill="#9fb3cf" font-size="9" font-family="ui-monospace, Menlo, monospace" font-weight="700">1</text>',
      '<rect x="109" y="84" width="22" height="18" rx="4" fill="#ffd166" stroke="#fff1b8" class="tut-key-active"/>',
      '<text x="120" y="97" text-anchor="middle" fill="#241b06" font-size="9" font-family="ui-monospace, Menlo, monospace" font-weight="700">2</text>',
      '<rect x="183" y="84" width="22" height="18" rx="4" fill="#102338" stroke="#2b4c6a"/>',
      '<text x="194" y="97" text-anchor="middle" fill="#9fb3cf" font-size="9" font-family="ui-monospace, Menlo, monospace" font-weight="700">3</text>',
      '<text x="120" y="112" text-anchor="middle" fill="#8fa1bd" font-size="7.5">キー / 画面下のボタンで切替</text>'
    ].join('')),
    cross: tutorialSvg([
      '<text x="18" y="18" fill="#5ff0ff" font-size="7.5" font-weight="700">自分</text>',
      '<text x="18" y="112" fill="#ff7ad9" font-size="7.5" font-weight="700">敵</text>',
      '<path d="M18 76 C50 76 62 36 94 36 S136 76 168 76 S208 36 226 36" fill="none" stroke="#5ff0ff" stroke-width="2.4" stroke-linecap="round" class="tut-draw"/>',
      '<path d="M18 36 C50 36 62 76 94 76 S136 36 168 36 S208 76 226 76" fill="none" stroke="#ff7ad9" stroke-width="2.4" stroke-linecap="round" class="tut-draw tut-draw-delay"/>',
      '<path d="M120 14 V104" stroke="#ffd166" stroke-width="1" stroke-dasharray="3 4" opacity=".42"/>',
      '<g transform="translate(120 56)">',
        '<g class="tut-burst">',
          '<circle r="16" fill="rgba(95,240,255,.12)" stroke="#9ffaff" stroke-width="1.2"/>',
          '<path d="M0 -21 L4 -6 L18 -11 L7 1 L17 13 L2 7 L-2 22 L-7 7 L-20 12 L-9 0 L-18 -11 L-4 -6 Z" fill="#ffd166" opacity=".92"/>',
          '<circle r="5" fill="#ffffff"/>',
        '</g>',
      '</g>',
      '<text x="120" y="32" text-anchor="middle" fill="#ffd166" font-size="9" font-weight="900" letter-spacing="1">CROSS!</text>'
    ].join('')),
    item: tutorialSvg([
      '<path d="M18 78 C52 78 64 44 100 44 S154 74 222 56" fill="none" stroke="#5ff0ff" stroke-width="2.4" stroke-linecap="round" class="tut-draw"/>',
      '<g class="tut-pulse" transform="translate(164 40)">',
        '<circle r="21" fill="none" stroke="#ffd166" stroke-width="1.1" opacity=".45"/>',
        '<circle r="13" fill="rgba(255,209,102,.12)" stroke="#ffd166" stroke-width="1.2"/>',
        '<path d="M0 -12 L12 0 L0 12 L-12 0 Z" fill="#ffd166" stroke="#fff8d8" stroke-width="1"/>',
        '<text x="0" y="4" text-anchor="middle" fill="#241b06" font-size="10" font-weight="900">S</text>',
      '</g>',
      '<path d="M190 18 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z" fill="#ffffff" class="tut-spark"/>',
      '<path d="M136 18 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z" fill="#9ffaff" class="tut-spark"/>',
      '<text x="164" y="70" text-anchor="middle" fill="#ffd166" font-size="7" font-weight="700">GET</text>',
      '<text x="120" y="112" text-anchor="middle" fill="#8fa1bd" font-size="7.5">曲線で触れると取得</text>'
    ].join('')),
    ready: tutorialSvg([
      '<circle cx="120" cy="50" r="30" fill="rgba(87,224,138,.08)" stroke="#57e08a" stroke-width="1.5" filter="url(#tutGlow)"/>',
      '<path d="M104 51 l11 11 l25 -29" fill="none" stroke="#57e08a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="tut-draw"/>',
      '<circle cx="74" cy="26" r="2.5" fill="#ffd166" class="tut-spark"/>',
      '<circle cx="168" cy="30" r="2" fill="#5ff0ff" class="tut-spark"/>',
      '<circle cx="176" cy="78" r="2" fill="#ff7ad9" class="tut-spark"/>',
      '<text x="120" y="96" text-anchor="middle" fill="#57e08a" font-size="10" font-weight="900" letter-spacing="2">READY</text>',
      '<text x="120" y="110" text-anchor="middle" fill="#8fa1bd" font-size="7">3ステップ完了</text>'
    ].join(''))
  };

  function create(options) {
    options = options || {};
    var renderer = options.renderer || null;
    var actions = options.actions || {};
    var els = {};
    var slotButtons = [];
    var deckCards = {};
    var gacha = loadGacha();
    var selectedFusion = loadFusion();
    var selectedDeck = loadDeck();
    var selectedParams = loadParams();
    var previewKey = null;
    var best = loadBest();
    var muted = loadMuted();
    var lastState = null;
    var lastPhase = 'idle';
    var tutorialMode = false;
    var tutorialDone = loadTutorialDone();

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
    function loadGacha() {
      var key = 'graph-cross-gacha';
      var raw = null;
      try {
        if (typeof localStorage !== 'undefined') raw = localStorage.getItem(key);
      } catch (e) { raw = null; }
      var existed = !!raw;
      var state = null;
      if (raw) {
        try { state = JSON.parse(raw); } catch (e) { state = null; }
      }
      state = G.normalize(state || G.createDefault());
      if (!existed && typeof localStorage !== 'undefined') {
        try {
          var savedDeck = JSON.parse(localStorage.getItem('graph-cross-deck') || 'null');
          if (Array.isArray(savedDeck)) {
            for (var i = 0; i < savedDeck.length; i++) {
              var deckKey = savedDeck[i];
              if (C.MODES[deckKey] && deckKey !== 'fusion' && state.unlocked.indexOf(deckKey) < 0) state.unlocked.push(deckKey);
            }
          }
          var savedFusion = JSON.parse(localStorage.getItem('graph-cross-fusion') || 'null');
          if (savedFusion) {
            ['primary', 'secondary'].forEach(function (slot) {
              var fkey = savedFusion[slot];
              if (C.MODES[fkey] && fkey !== 'fusion' && state.unlocked.indexOf(fkey) < 0) state.unlocked.push(fkey);
            });
          }
        } catch (e) { }
      }
      writeGacha(state);
      return state;
    }
    function writeGacha(state) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('graph-cross-gacha', JSON.stringify(state));
      } catch (e) { }
    }
    function saveGacha() {
      writeGacha(gacha);
    }
    function loadTutorialDone() {
      try {
        if (typeof localStorage === 'undefined') return false;
        return localStorage.getItem('graph-cross-tutorial-done') === '1';
      } catch (e) { return false; }
    }
    function saveTutorialDone() {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('graph-cross-tutorial-done', '1');
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
    function loadFusion() {
      try {
        if (typeof localStorage === 'undefined') return null;
        var raw = localStorage.getItem('graph-cross-fusion');
        if (!raw) return null;
        var f = JSON.parse(raw);
        if (f && C.MODES[f.primary] && C.MODES[f.secondary] &&
          f.primary !== 'fusion' && f.secondary !== 'fusion' && f.primary !== f.secondary &&
          gacha.unlocked.indexOf(f.primary) >= 0 && gacha.unlocked.indexOf(f.secondary) >= 0) {
          return { primary: f.primary, secondary: f.secondary };
        }
      } catch (e) { }
      return null;
    }
    function saveFusion() {
      try {
        if (typeof localStorage !== 'undefined') {
          if (selectedFusion) localStorage.setItem('graph-cross-fusion', JSON.stringify(selectedFusion));
          else localStorage.removeItem('graph-cross-fusion');
        }
      } catch (e) { }
    }
    function deckIsValid(deck) {
      if (!Array.isArray(deck) || deck.length !== C.DECK_SIZE) return false;
      if (deck.indexOf('fusion') >= 0 && !selectedFusion) return false;
      var seen = {};
      for (var i = 0; i < deck.length; i++) {
        var key = deck[i];
        if (!C.MODES[key] || seen[key]) return false;
        if (key === 'fusion') {
          if (!selectedFusion ||
            gacha.unlocked.indexOf(selectedFusion.primary) < 0 ||
            gacha.unlocked.indexOf(selectedFusion.secondary) < 0) return false;
        } else if (gacha.unlocked.indexOf(key) < 0) {
          return false;
        }
        seen[key] = true;
      }
      return true;
    }
    function loadDeck() {
      var fallback = C.DEFAULT_DECK.slice();
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
      var english = !!lastState;
      els.btnSound.textContent = english ? (muted ? 'SOUND OFF' : 'SOUND ON') : (muted ? '音 OFF' : '音 ON');
      els.btnSound.classList.toggle('muted', muted);
    }

    function updateTutorialButton() {
      if (!els.btnTutorial) return;
      els.btnTutorial.textContent = tutorialDone ? 'チュートリアル' : 'はじめての遊び方';
      els.btnTutorial.classList.toggle('recommended', !tutorialDone);
    }

    function updateHud(state) {
      lastState = state || null;
      var snap = state ? E.snapshot(state) : null;
      var stress = !!(snap && snap.infiniteLives);
      var tutorial = tutorialMode;
      if (els.score) els.score.textContent = snap ? String(snap.score) : '0';
      if (els.best) els.best.textContent = String(best);
      if (els.combo) els.combo.textContent = snap && snap.combo > 0 ? 'x' + snap.combo : '-';
      if (els.life) els.life.textContent = (tutorial || stress) ? '∞' : (snap ? lifeText(snap.hp, snap.maxHp) : lifeText(E.MAX_HP, E.MAX_HP));
      if (els.life) els.life.classList.toggle('danger', !!(snap && !tutorial && !stress && snap.hp <= 1));

      if (els.stageLabel) {
        var stage = snap ? snap.stage : 1;
        if (tutorial) {
          els.stageLabel.textContent = 'TUTORIAL';
          if (els.stageFill) els.stageFill.style.width = '100%';
          if (els.stageNote) els.stageNote.textContent = 'TRAINING';
        } else if (stress) {
          els.stageLabel.textContent = 'STRESS MODE';
          if (els.stageFill) els.stageFill.style.width = '100%';
          if (els.stageNote) els.stageNote.textContent = 'DEFEATED ' + (snap.hits || 0) + ' / COMBO x' + (snap.combo || 0);
        } else if (snap && snap.stageCleared) {
          els.stageLabel.textContent = 'STAGE ' + stage + ' CLEAR';
          if (els.stageFill) els.stageFill.style.width = '100%';
          if (els.stageNote) els.stageNote.textContent = 'CLEAR!';
        } else if (snap && snap.boss) {
          els.stageLabel.textContent = snap.boss.final
            ? 'FINAL BOSS P' + (snap.boss.phase || 1)
            : 'STAGE ' + stage + ' · BOSS P' + (snap.boss.phase || 1);
          if (els.stageFill) els.stageFill.style.width = Math.round(snap.boss.hp / snap.boss.maxHp * 100) + '%';
          if (els.stageNote) els.stageNote.textContent = 'WEAK: ' + (C.FAMILY_LABELS_EN[snap.boss.family] || snap.boss.familyLabel) + ' / HP ' + snap.boss.hp + '/' + snap.boss.maxHp;
        } else {
          els.stageLabel.textContent = 'STAGE ' + stage;
          var hits = snap ? snap.stageHits : 0;
          var target = snap ? snap.stageTarget : E.stageTargetFor(1);
          if (els.stageFill) els.stageFill.style.width = Math.round(hits / target * 100) + '%';
          if (els.stageNote) els.stageNote.textContent = 'ENEMIES ' + hits + '/' + target;
        }
        if (els.stageInfo) {
          els.stageInfo.classList.toggle('stress', stress);
          els.stageInfo.classList.toggle('tutorial', tutorial);
          els.stageInfo.classList.toggle('boss', !!(snap && snap.boss && !snap.stageCleared && !stress && !tutorial));
          els.stageInfo.classList.toggle('cleared', !!(snap && snap.stageCleared && !stress && !tutorial));
        }
      }
      if (els.btnExit) els.btnExit.classList.toggle('hidden', !(stress || tutorial));
      updateSoundButton();
    }

    function clearSwapHighlight() {
      for (var i = 0; i < slotButtons.length; i++) {
        slotButtons[i].classList.remove('swap-target', 'swap-changed');
      }
    }

    function markSwapSlot(index, changed) {
      clearSwapHighlight();
      if (index < 0 || !slotButtons[index]) return;
      slotButtons[index].classList.add(changed ? 'swap-changed' : 'swap-target');
    }

    function updateSlots(state, phase) {
      lastPhase = phase || lastPhase;
      var deck = state ? state.deck : selectedDeck;
      var params = state ? state.deckParams : selectedParams;
      var fusion = state ? state.fusion : selectedFusion;
      for (var i = 0; i < 4; i++) {
        var btn = slotButtons[i];
        if (!btn) continue;
        var key = deck[i];
        var english = !!state;
        if (!key) {
          btn.innerHTML = '<b>-</b><span>' + (english ? 'EMPTY' : '空き') + '</span><em>' + (i + 1) + '</em>';
          btn.disabled = true;
          btn.classList.remove('active');
          btn.classList.add('hidden');
          if (btn.removeAttribute) btn.removeAttribute('data-genre');
          else btn.setAttribute('data-genre', '');
          continue;
        }
        btn.classList.remove('hidden');
        var mode = C.MODES[key];
        var genreLabel = english
          ? (C.GENRE_LABELS_EN[mode.genre] || '')
          : (C.GENRE_LABELS[mode.genre] || '');
        btn.setAttribute('data-genre', genreLabel);
        if (english) btn.setAttribute('data-genre-en', genreLabel);
        var familyLabel = english ? C.FAMILY_LABELS_EN[mode.family] : C.FAMILY_LABELS[mode.family];
        var familyNote = mode.family !== 'none' ? ' · ' + familyLabel : '';
        var modeNote = english ? (mode.noteEn || mode.note) : mode.note;
        btn.innerHTML = '<b>' + C.formatModeLabel(key, params, fusion) + '</b><span>' + modeNote + familyNote + '</span><em>' + (i + 1) + '</em>';
        btn.style.setProperty('--mode-color', C.modeColor(key));
        var jammed = !!(state && state.jamTimers && state.jamTimers[i] > 0);
        btn.disabled = !(state && phase === 'run' && !state.over) || jammed;
        btn.classList.toggle('active', !!(state && state.mode === key));
        btn.classList.toggle('jammed', jammed);
      }
      if (els.modeButtons) els.modeButtons.classList.toggle('four', deck.length > 3);
      if (els.tip) {
        els.tip.textContent = state
          ? 'TAP / 1-' + deck.length + ' SWITCH FUNCTIONS · CROSS THE CURVES'
          : '画面タップ / 1〜' + deck.length + ' で関数切替 · 曲線で敵を迎え撃て';
      }
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
        var shapeIndex = Math.max(0, Math.min(7, Math.round(params.shape || 0)));
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
        var visible = gacha.unlocked.indexOf(key) >= 0;
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

    function closeDeckBuilder() {
      if (els.deckBuilder) els.deckBuilder.classList.add('hidden');
      if (els.btnBuild) els.btnBuild.textContent = 'デッキを組む';
    }

    function toggleDeckBuilder() {
      if (!els.deckBuilder) return;
      var isHidden = els.deckBuilder.classList.toggle('hidden');
      if (els.btnBuild) els.btnBuild.textContent = isHidden ? 'デッキを組む' : '閉じる';
    }

    function buildFusionSelects() {
      var keys = [];
      for (var i = 0; i < C.MODE_KEYS.length; i++) {
        if (gacha.unlocked.indexOf(C.MODE_KEYS[i]) >= 0) keys.push(C.MODE_KEYS[i]);
      }
      var options = keys.map(function (key) {
        return '<option value="' + key + '">' + C.MODES[key].label + '</option>';
      }).join('');
      if (els.fusionPrimary) {
        els.fusionPrimary.innerHTML = options;
        els.fusionPrimary.value = selectedFusion ? selectedFusion.primary : (keys[0] || '');
      }
      if (els.fusionSecondary) {
        els.fusionSecondary.innerHTML = options;
        els.fusionSecondary.value = selectedFusion ? selectedFusion.secondary : (keys[1] || keys[0] || '');
      }
    }

    function updateFusionPreview() {
      if (!els.fusionPreview) return;
      var primary = els.fusionPrimary ? els.fusionPrimary.value : '';
      var secondary = els.fusionSecondary ? els.fusionSecondary.value : '';
      if (!C.MODES[primary] || !C.MODES[secondary] || primary === secondary ||
        primary === 'fusion' || secondary === 'fusion') {
        els.fusionPreview.classList.add('hidden');
        els.fusionPreview.innerHTML = '';
        return;
      }
      var fusion = { primary: primary, secondary: secondary };
      var label = C.formatModeLabel('fusion', selectedParams, fusion);
      els.fusionPreview.classList.remove('hidden');
      els.fusionPreview.innerHTML = modePreviewSvg('fusion', selectedParams, fusion) +
        '<div class="fusion-preview-copy"><span>FUSION TRAJECTORY</span><b>' + label + '</b></div>';
    }

    function updateFusionUi() {
      var card = deckCards.fusion;
      if (card) {
        if (!selectedFusion) {
          card.classList.add('hidden');
        } else {
          card.classList.remove('hidden');
          card.innerHTML = '<b>' + C.formatModeLabel('fusion', selectedParams, selectedFusion) +
            '</b><span>2関数の合成</span>';
          card.style.setProperty('--mode-color', C.modeColor('fusion'));
          card.setAttribute('data-genre', C.GENRE_LABELS.other);
          card.classList.add('rarity-legendary');
          card.setAttribute('data-rarity', C.RARITY_INFO.legendary.label);
        }
      }
      if (selectedFusion && els.fusionPrimary) els.fusionPrimary.value = selectedFusion.primary;
      if (selectedFusion && els.fusionSecondary) els.fusionSecondary.value = selectedFusion.secondary;
      if (els.fusionNote) {
        if (!selectedFusion) {
          els.fusionNote.textContent = '2つの関数を選んで合成できます。';
        } else {
          var label = C.formatModeLabel('fusion', selectedParams, selectedFusion);
          var selected = selectedDeck.indexOf('fusion') >= 0;
          els.fusionNote.textContent = '合成: ' + label +
            (selected ? ' / デッキに入っています' : ' / デッキに1枚空きがあれば追加できます');
        }
      }
      updateFusionPreview();
    }

    function createFusion() {
      var primary = els.fusionPrimary ? els.fusionPrimary.value : '';
      var secondary = els.fusionSecondary ? els.fusionSecondary.value : '';
      if (!C.MODES[primary] || !C.MODES[secondary] || primary === secondary ||
        primary === 'fusion' || secondary === 'fusion') {
        if (els.fusionNote) els.fusionNote.textContent = '別の関数を2つ選んでください。';
        return;
      }
      if (gacha.unlocked.indexOf(primary) < 0 || gacha.unlocked.indexOf(secondary) < 0) {
        if (els.fusionNote) els.fusionNote.textContent = '未解放の関数は合成できません。';
        return;
      }
      selectedFusion = { primary: primary, secondary: secondary };
      saveFusion();
      var canAdd = selectedDeck.length < C.DECK_SIZE && selectedDeck.indexOf('fusion') < 0;
      if (canAdd) {
        selectedDeck.push('fusion');
        saveDeck();
      }
      updateFusionUi();
      updateDeckUi();
      playUi();
    }

    function updateDeckLocks() {
      for (var key in deckCards) {
        if (!Object.prototype.hasOwnProperty.call(deckCards, key) || key === 'fusion') continue;
        var card = deckCards[key];
        var mode = C.MODES[key];
        if (!card || !mode) continue;
        var info = C.RARITY_INFO[mode.rarity] || C.RARITY_INFO.common;
        var unlocked = gacha.unlocked.indexOf(key) >= 0;
        card.classList.remove('rarity-common', 'rarity-uncommon', 'rarity-rare', 'rarity-epic', 'rarity-legendary');
        card.classList.add('rarity-' + mode.rarity);
        card.classList.toggle('locked', !unlocked);
        card.disabled = !unlocked;
        card.setAttribute('data-rarity', info.label);
        card.style.setProperty('--mode-color', C.modeColor(key));
        if (unlocked) {
          var fam = mode.family;
          card.setAttribute('data-genre', C.GENRE_LABELS[mode.genre] || '');
          card.innerHTML = '<b>' + mode.label + '</b><span>' + mode.note +
            (fam !== 'none' ? ' / ' + C.FAMILY_LABELS[fam] : '') + ' / ' + info.label + '</span>';
        } else {
          if (card.removeAttribute) card.removeAttribute('data-genre');
          else card.setAttribute('data-genre', '');
          card.classList.remove('selected');
          card.innerHTML = '<b>???</b><span>' + info.label + ' / 未解放</span>';
        }
      }
    }

    function updateDeckUi() {
      updateDeckLocks();
      if (els.deckCount) els.deckCount.textContent = selectedDeck.length + '/' + C.DECK_SIZE;
      if (els.deckSummary) {
        var chips = [];
        for (var di = 0; di < selectedDeck.length; di++) {
          var dkey = selectedDeck[di];
          var dgenre = C.GENRE_LABELS[C.MODES[dkey].genre] || '';
          chips.push('<span class="deck-chip" data-genre="' + dgenre + '">' +
            C.formatModeLabel(dkey, selectedParams, selectedFusion) + '<em>' + dgenre + '</em></span>');
        }
        els.deckSummary.innerHTML = chips.length ? chips.join('') : '<span class="deck-chip empty">デッキを選ぼう</span>';
      }
      for (var key in deckCards) {
        if (!Object.prototype.hasOwnProperty.call(deckCards, key)) continue;
        var selected = selectedDeck.indexOf(key) >= 0;
        if (key !== 'fusion' && gacha.unlocked.indexOf(key) < 0) selected = false;
        deckCards[key].classList.toggle('selected', selected);
      }
      if (els.btnStart) {
        var ready = selectedDeck.length === C.DECK_SIZE && deckIsValid(selectedDeck);
        els.btnStart.disabled = !ready;
        els.btnStart.classList.toggle('disabled', !ready);
        if (els.btnStress) {
          els.btnStress.disabled = !ready;
        }
      }
      updateSlots(lastState, lastPhase);
      updateTunePanel();
      updateFusionUi();
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
      var shape = Math.max(0, Math.min(7, Math.round(parseFloat(value) || 0)));
      selectedParams.wave.shape = shape;
      previewKey = 'wave';
      saveParams();
      updateTunePanel();
      updateSlots(lastState, lastPhase);
      playUi();
    }

    function randomUnit() {
      try {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
          var buf = new Uint32Array(1);
          crypto.getRandomValues(buf);
          return buf[0] / 4294967296;
        }
      } catch (e) { }
      return Math.random();
    }

    function updateGachaLabels() {
      if (els.gachaPoints) els.gachaPoints.textContent = String(gacha.points);
      if (els.gachaPointsLarge) els.gachaPointsLarge.textContent = String(gacha.points);
      var complete = G.allUnlocked(gacha);
      if (els.btnGachaRoll) {
        els.btnGachaRoll.disabled = complete || gacha.points < B.GACHA_COST;
        els.btnGachaRoll.textContent = complete ? 'コンプリート' : '1回まわす (' + B.GACHA_COST + ')';
      }
      if (els.gachaPity) {
        els.gachaPity.textContent = complete
          ? '全関数解放済み'
          : 'レア+ 天井 ' + gacha.pityRare + '/' + B.GACHA_RARE_PITY +
            ' · EPIC 天井 ' + gacha.pityEpic + '/' + B.GACHA_EPIC_PITY;
      }
      if (els.gachaRates) {
        var rates = G.rates(gacha);
        els.gachaRates.innerHTML = rates.length
          ? rates.map(function (r) {
            return '<span class="gacha-rate rarity-' + r.rarity + '">' +
              C.RARITY_INFO[r.rarity].label + ' <b>' + r.percent + '%</b></span>';
          }).join('')
          : '<span class="gacha-rate rarity-epic">COMPLETE</span>';
      }
      if (els.gachaCollectionCount) {
        els.gachaCollectionCount.textContent = gacha.unlocked.length + ' / ' + C.MODE_KEYS.length;
      }
      if (els.gachaReward) els.gachaReward.textContent = 'ステージクリアで関数ポイント +' + B.GACHA_STAGE_REWARD;
    }

    function renderGachaResult() {
      if (!els.gachaResult) return;
      var r = gacha.lastResult;
      if (!r || !C.MODES[r.key]) {
        els.gachaResult.innerHTML = '<div class="gacha-empty">' +
          '<div class="gacha-sigil">?</div>' +
          '<b>SUMMON</b>' +
          '<span>1回まわすと関数が解放されます</span>' +
        '</div>';
        return;
      }
      var info = C.RARITY_INFO[r.rarity] || C.RARITY_INFO.common;
      var label = C.formatModeLabel(r.key, selectedParams, selectedFusion);
      var note = C.MODES[r.key].note;
      var status = r.isNew
        ? '<span class="gacha-new">NEW! 関数を解放</span>'
        : '<span class="gacha-dup">重複 +' + r.duplicatePoints + ' pt</span>';
      els.gachaResult.innerHTML = '<div class="gacha-result-card rarity-' + r.rarity + '">' +
        modePreviewSvg(r.key, selectedParams, selectedFusion) +
        '<div class="gacha-result-info">' +
          '<em>' + info.label + '</em>' +
          '<b>' + label + '</b>' +
          '<span>' + note + '</span>' +
          status +
        '</div>' +
      '</div>';
    }

    function renderGachaCollection() {
      if (!els.gachaCollection) return;
      var html = '';
      for (var i = 0; i < C.MODE_KEYS.length; i++) {
        var key = C.MODE_KEYS[i];
        var mode = C.MODES[key];
        var info = C.RARITY_INFO[mode.rarity] || C.RARITY_INFO.common;
        var unlocked = gacha.unlocked.indexOf(key) >= 0;
        html += '<div class="gacha-item rarity-' + mode.rarity + (unlocked ? '' : ' locked') + '">' +
          '<span class="gacha-rarity-label">' + info.label + '</span>' +
          (unlocked ? modePreviewSvg(key, selectedParams, selectedFusion) : '<div class="gacha-locked-preview">?</div>') +
          '<b>' + (unlocked ? C.formatModeLabel(key, selectedParams, selectedFusion) : '???') + '</b>' +
          '<span>' + (unlocked ? mode.note : '未解放') + '</span>' +
        '</div>';
      }
      els.gachaCollection.innerHTML = html;
    }

    function renderGacha() {
      updateGachaLabels();
      renderGachaResult();
      renderGachaCollection();
    }

    function openGacha() {
      tutorialMode = false;
      hideTutorial();
      setPauseVisible(false);
      closeDeckBuilder();
      if (els.stageInfo) els.stageInfo.classList.add('hidden');
      showScreen('gacha');
      renderGacha();
    }

    function rollGacha() {
      var result = G.roll(gacha, randomUnit);
      if (!result.ok) {
        updateGachaLabels();
        return;
      }
      saveGacha();
      if (result.value.isNew) buildFusionSelects();
      updateDeckUi();
      renderGacha();
    }

    function grantGachaPoints(amount) {
      var n = G.grant(gacha, amount);
      saveGacha();
      updateGachaLabels();
      return n;
    }

    function toggleDeck(key) {
      if (!C.MODES[key]) return;
      if (key !== 'fusion' && gacha.unlocked.indexOf(key) < 0) return;
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

    function setPauseVisible(visible) {
      if (els.btnPause) els.btnPause.classList.toggle('hidden', !visible);
    }

    function showPause(canRetry) {
      if (els.btnPauseRetry) els.btnPauseRetry.classList.toggle('hidden', !canRetry);
      setPauseVisible(false);
      showScreen('pause');
    }

    function showScreen(name) {
      var screens = { start: els.screenStart, end: els.screenEnd, clear: els.screenClear, gacha: els.screenGacha, pause: els.screenPause, ending: els.screenEnding, rescue: els.screenRescue };
      for (var key in screens) {
        if (Object.prototype.hasOwnProperty.call(screens, key) && screens[key]) {
          screens[key].classList.toggle('visible', key === name);
        }
      }
      if (els.btnExit) els.btnExit.classList.add('hidden');
    }

    function setTutorialMode(value) {
      tutorialMode = !!value;
      updateHud(lastState);
      updateSlots(lastState, lastPhase);
    }

    function renderTutorialVisual(kind) {
      if (els.tutorialVisual) els.tutorialVisual.innerHTML = TUTORIAL_ART[kind] || '';
    }

    function setTutorialTarget(index) {
      for (var i = 0; i < slotButtons.length; i++) {
        slotButtons[i].classList.toggle('tutorial-target', i === index);
      }
    }

    function showTutorialStep(index, total) {
      var step = C.TUTORIAL_STEPS[index];
      if (!step || !els.tutorialPanel) return;
      els.tutorialPanel.classList.remove('hidden');
      els.tutorialPanel.classList.toggle('tutorial-top', index === 2);
      if (els.tutorialCount) els.tutorialCount.textContent = (index + 1) + ' / ' + total;
      if (els.tutorialTitle) els.tutorialTitle.textContent = step.title;
      if (els.tutorialDesc) els.tutorialDesc.textContent = step.desc;
      if (els.tutorialTip) els.tutorialTip.textContent = step.tip;
      renderTutorialVisual(['switch', 'cross', 'item'][index] || 'switch');
      setTutorialTarget(index === 0 ? 1 : -1);
      if (els.btnTutorialSkip) els.btnTutorialSkip.classList.remove('hidden');
      if (els.btnTutorialStart) els.btnTutorialStart.classList.add('hidden');
      if (els.btnTutorialBack) els.btnTutorialBack.classList.add('hidden');
      setTutorialMode(true);
    }

    function showTutorialComplete() {
      var info = C.TUTORIAL_COMPLETE;
      if (!info || !els.tutorialPanel) return;
      els.tutorialPanel.classList.remove('hidden');
      els.tutorialPanel.classList.remove('tutorial-top');
      if (els.tutorialCount) els.tutorialCount.textContent = 'READY';
      if (els.tutorialTitle) els.tutorialTitle.textContent = info.title;
      if (els.tutorialDesc) els.tutorialDesc.textContent = info.desc;
      if (els.tutorialTip) els.tutorialTip.textContent = info.tip;
      renderTutorialVisual('ready');
      setTutorialTarget(-1);
      if (els.btnTutorialSkip) els.btnTutorialSkip.classList.add('hidden');
      if (els.btnTutorialStart) els.btnTutorialStart.classList.remove('hidden');
      if (els.btnTutorialBack) els.btnTutorialBack.classList.remove('hidden');
      setTutorialMode(true);
    }

    function hideTutorial() {
      if (els.tutorialPanel) {
        els.tutorialPanel.classList.add('hidden');
        els.tutorialPanel.classList.remove('tutorial-top');
      }
      setTutorialTarget(-1);
    }

    function markTutorialDone() {
      tutorialDone = true;
      saveTutorialDone();
      updateTutorialButton();
    }

    function hideScreens() {
      showScreen(null);
    }

    function recordBest(score) {
      if (score > best) {
        best = score;
        saveBest(best);
      }
    }

    function showStart() {
      lastState = null;
      lastPhase = 'idle';
      tutorialMode = false;
      hideTutorial();
      clearSwapHighlight();
      setPauseVisible(false);
      showScreen('start');
      closeDeckBuilder();
      if (els.stageInfo) els.stageInfo.classList.remove('hidden');
      updateTutorialButton();
      updateGachaLabels();
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
        var info = C.UPGRADE_INFO_EN[id] || C.UPGRADE_INFO[id] || { title: id, desc: '' };
        btn.innerHTML = '<em>' + (i + 1) + '</em><b>' + info.title + '</b><span>' + info.desc + '</span>';
      }
      if (els.runUpgrades) {
        var parts = [];
        var upgrades = snap && snap.upgrades ? snap.upgrades : {};
        for (var key in C.UPGRADE_INFO_EN) {
          if (!Object.prototype.hasOwnProperty.call(C.UPGRADE_INFO_EN, key)) continue;
          var count = upgrades[key] || 0;
          if (count > 0) {
            var title = C.UPGRADE_INFO_EN[key].title;
            var base = key === 'bonus' ? 'SCORE +' + C.fmtNum(B.UPGRADE_BONUS_SCORE) : title;
            if (key === 'life') base = 'LIFE +' + count;
            else if (key === 'hit') base = 'HITBOX +' + count * B.UPGRADE_HIT_STEP;
            else if (key === 'combo') base = 'COMBO +' + C.fmtNum(count * B.UPGRADE_COMBO_STEP) + 's';
            else if (key === 'score') base = 'SCORE +' + Math.round(count * B.UPGRADE_SCORE_STEP * 100) + '%';
            else if (key === 'boss') base = 'BOSS HP -' + count * B.UPGRADE_BOSS_STEP;
            parts.push(base);
          }
        }
        els.runUpgrades.textContent = parts.length ? 'RUN UPGRADES: ' + parts.join(' / ') : 'RUN UPGRADES: NONE';
      }
    }

    function showEnding(state) {
      tutorialMode = false;
      hideTutorial();
      setPauseVisible(false);
      var snap = E.snapshot(state);
      recordBest(snap.score);
      if (els.endingScore) els.endingScore.textContent = String(snap.score);
      if (els.endingBest) els.endingBest.textContent = String(best);
      if (els.endingCombo) els.endingCombo.textContent = 'x' + snap.maxCombo;
      if (els.endingStage) els.endingStage.textContent = String(snap.stage);
      if (els.endingX) els.endingX.textContent = String(snap.x);
      showScreen('ending');
      updateHud(state);
      updateSlots(state, 'over');
    }

    function showRescueChoices(state, choices) {
      if (!els.screenRescue) return;
      for (var i = 0; i < 3; i++) {
        var btn = $('rescue-' + i);
        if (!btn) continue;
        var key = choices[i];
        if (!key || !C.MODES[key]) {
          btn.classList.add('hidden');
          continue;
        }
        var mode = C.MODES[key];
        btn.classList.remove('hidden');
        btn.style.setProperty('--mode-color', C.modeColor(key));
        btn.innerHTML = '<em>' + (i + 1) + '</em>' +
          modePreviewSvg(key, state ? state.deckParams : selectedParams, state ? state.fusion : selectedFusion) +
          '<b>' + C.formatModeLabel(key, state ? state.deckParams : selectedParams, state ? state.fusion : selectedFusion) +
          '</b><span>' + (mode.noteEn || mode.note) + ' / ' +
          (C.GENRE_LABELS_EN[mode.genre] || '') +
          (mode.family !== 'none' ? ' / ' + C.FAMILY_LABELS_EN[mode.family] : '') + '</span>';
      }
      showScreen('rescue');
    }

    function showEnd(state, canRetry, canRescue) {
      tutorialMode = false;
      hideTutorial();
      clearSwapHighlight();
      setPauseVisible(false);
      var snap = E.snapshot(state);
      recordBest(snap.score);
      if (els.endScore) els.endScore.textContent = String(snap.score);
      if (els.endBest) els.endBest.textContent = String(best);
      if (els.endCombo) els.endCombo.textContent = 'x' + snap.maxCombo;
      if (els.endStage) els.endStage.textContent = String(snap.stage);
      if (els.endX) els.endX.textContent = String(snap.x);
      showScreen('end');
      if (els.btnRetry) els.btnRetry.classList.toggle('hidden', !canRetry);
      if (els.btnRescue) els.btnRescue.classList.toggle('hidden', !canRescue);
      updateHud(state);
      updateSlots(state, 'over');
    }

    function modePreviewSvg(key, params, fusion) {
      var points = E.modePreview(key, params, fusion, 36, 1.4);
      if (!points || !points.length) return '';
      var W = 180;
      var H = 52;
      var pad = 7;
      var min = Infinity;
      var max = -Infinity;
      for (var i = 0; i < points.length; i++) {
        if (points[i].y < min) min = points[i].y;
        if (points[i].y > max) max = points[i].y;
      }
      if (max - min < 1) {
        min -= 1;
        max += 1;
      }
      var d = '';
      var last = null;
      for (i = 0; i < points.length; i++) {
        var px = pad + points[i].x * (W - pad * 2);
        var py = pad + (points[i].y - min) / (max - min) * (H - pad * 2);
        d += (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1);
        last = { x: px, y: py };
      }
      var color = C.modeColor(key);
      return '<svg class="swap-preview" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
        '<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="6" fill="#081425" stroke="#1d3550"/>' +
        '<g stroke="#224666" stroke-width="1" opacity=".45">' +
          '<path d="M6 26 H174"/><path d="M60 6 V46"/><path d="M120 6 V46"/>' +
        '</g>' +
        '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="2.4" fill="#ffffff"/>' +
      '</svg>';
    }

    function showFunctionChoices(state, choices) {
      if (els.clearTitle) els.clearTitle.textContent = 'FUNCTION +1';
      if (els.clearHint) els.clearHint.textContent = '1–3 / CHOOSE A FUNCTION TO ADD';
      for (var i = 0; i < 3; i++) {
        var btn = $('upgrade-' + i);
        if (!btn) continue;
        var key = choices[i];
        if (!key || !C.MODES[key]) {
          btn.classList.add('hidden');
          continue;
        }
        btn.classList.remove('hidden');
        btn.style.setProperty('--mode-color', C.modeColor(key));
        var params = state ? state.deckParams : selectedParams;
        var fusion = state ? state.fusion : selectedFusion;
        btn.innerHTML = '<em>' + (i + 1) + '</em>' +
          modePreviewSvg(key, params, fusion) + '<b>' +
          C.formatModeLabel(key, params, fusion) +
          '</b><span>' + (C.MODES[key].noteEn || C.MODES[key].note) + ' / ' +
          (C.GENRE_LABELS_EN[C.MODES[key].genre] || '') +
          (C.MODES[key].family !== 'none' ? ' / ' + C.FAMILY_LABELS_EN[C.MODES[key].family] : '') + '</span>';
      }
    }

    function showDeckSwapChoices(state, offer) {
      if (!offer) return;
      showClear(state, []);
      var snap = E.snapshot(state);
      if (els.clearTitle) els.clearTitle.textContent = 'DECK CHANGE';
      if (els.clearHint) els.clearHint.textContent = '1–3 / CHOOSE A FUNCTION';
      if (els.deckSwap) {
        var genreText = offer.genre ? ' [' + (C.GENRE_LABELS_EN[offer.genre] || '') + ']' : '';
        els.deckSwap.innerHTML = 'REPLACE SLOT ' + (offer.slot + 1) + genreText + ': ' +
          C.formatModeLabel(offer.oldKey, snap.deckParams, snap.fusion) +
          ' <span>→</span> CHOOSE 1 OF 3';
        els.deckSwap.classList.remove('hidden');
      }
      for (var i = 0; i < 3; i++) {
        var btn = $('upgrade-' + i);
        if (!btn) continue;
        var key = offer.choices[i];
        if (!key || !C.MODES[key]) {
          btn.classList.add('hidden');
          continue;
        }
        var mode = C.MODES[key];
        btn.classList.remove('hidden');
        btn.style.setProperty('--mode-color', C.modeColor(key));
        btn.innerHTML = '<em>' + (i + 1) + '</em>' +
          modePreviewSvg(key, snap.deckParams, snap.fusion) + '<b>' +
          C.formatModeLabel(key, snap.deckParams, snap.fusion) + '</b><span>' +
          (mode.noteEn || mode.note) + ' / ' + (C.GENRE_LABELS_EN[mode.genre] || '') +
          (mode.family !== 'none' ? ' / ' + C.FAMILY_LABELS_EN[mode.family] : '') + '</span>';
      }
      markSwapSlot(offer.slot, false);
    }

    function showClear(state, upgradeIds) {
      tutorialMode = false;
      hideTutorial();
      setPauseVisible(false);
      var snap = E.snapshot(state);
      if (els.clearTitle) els.clearTitle.textContent = 'STAGE CLEAR';
      if (els.clearGacha) els.clearGacha.textContent = 'STAGE CLEAR: FUNCTION POINTS +' + B.GACHA_STAGE_REWARD;
      if (els.clearHint) els.clearHint.textContent = '1–3 / CHOOSE AN UPGRADE AND CONTINUE';
      recordBest(snap.score);
      if (els.clearStage) els.clearStage.textContent = 'STAGE ' + snap.stage;
      if (els.clearScore) els.clearScore.textContent = String(snap.score);
      if (els.clearBonus) els.clearBonus.textContent = '+' + snap.stageClearBonus;
      if (els.clearLife) els.clearLife.textContent = lifeText(snap.hp, snap.maxHp);
      if (els.deckSwap) {
        var swap = snap.lastDeckSwap;
        if (swap) {
          var genreText = swap.genre ? ' [' + (C.GENRE_LABELS_EN[swap.genre] || '') + ']' : '';
          els.deckSwap.innerHTML = 'DECK CHANGE SLOT ' + (swap.slot + 1) + genreText + ': ' +
            C.formatModeLabel(swap.oldKey, snap.deckParams) +
            ' <span>→</span> ' + C.formatModeLabel(swap.newKey, snap.deckParams);
          els.deckSwap.classList.remove('hidden');
        } else {
          els.deckSwap.classList.add('hidden');
        }
      }
      updateUpgradeCards(upgradeIds, snap);
      showScreen('clear');
      updateHud(state);
      updateSlots(state, 'clear');
      if (snap.lastDeckSwap) markSwapSlot(snap.lastDeckSwap.slot, true);
      else markSwapSlot(-1, false);
    }

    function setRuntime(state, phase) {
      lastState = state || null;
      lastPhase = phase || 'idle';
      if (phase === 'run') clearSwapHighlight();
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
      els.screenGacha = $('screen-gacha');
      els.btnStart = $('btn-start');
      els.btnStress = $('btn-stress');
      els.btnExit = $('btn-exit');
      els.btnPause = $('btn-pause');
      els.screenPause = $('screen-pause');
      els.screenEnding = $('screen-ending');
      els.screenRescue = $('screen-rescue');
      els.btnRescue = $('btn-rescue');
      els.btnRescueBack = $('btn-rescue-back');
      els.btnResume = $('btn-resume');
      els.btnPauseRetry = $('btn-pause-retry');
      els.btnPauseExit = $('btn-pause-exit');
      els.endingScore = $('ending-score');
      els.endingBest = $('ending-best');
      els.endingCombo = $('ending-combo');
      els.endingStage = $('ending-stage');
      els.endingX = $('ending-x');
      els.btnEndingAgain = $('btn-ending-again');
      els.btnEndingTitle = $('btn-ending-title');
      els.btnAgain = $('btn-again');
      els.btnRetry = $('btn-retry');
      els.btnDeck = $('btn-deck');
      els.btnSound = $('btn-sound');
      els.btnTutorial = $('btn-tutorial');
      els.tutorialPanel = $('tutorial-panel');
      els.tutorialCount = $('tutorial-count');
      els.tutorialTitle = $('tutorial-title');
      els.tutorialDesc = $('tutorial-desc');
      els.tutorialTip = $('tutorial-tip');
      els.tutorialVisual = $('tutorial-visual');
      els.btnTutorialSkip = $('btn-tutorial-skip');
      els.btnTutorialStart = $('btn-tutorial-start');
      els.btnTutorialBack = $('btn-tutorial-back');
      els.btnGacha = $('btn-gacha');
      els.gachaPoints = $('gacha-points');
      els.gachaPointsLarge = $('gacha-points-large');
      els.gachaResult = $('gacha-result');
      els.btnGachaRoll = $('btn-gacha-roll');
      els.gachaPity = $('gacha-pity');
      els.gachaRates = $('gacha-rates');
      els.gachaReward = $('gacha-reward');
      els.gachaCollection = $('gacha-collection');
      els.gachaCollectionCount = $('gacha-collection-count');
      els.btnGachaClose = $('btn-gacha-close');
      els.clearTitle = $('clear-title');
      els.clearHint = $('clear-hint');
      els.clearStage = $('clear-stage');
      els.clearScore = $('clear-score');
      els.clearBonus = $('clear-bonus');
      els.clearLife = $('clear-life');
      els.runUpgrades = $('run-upgrades');
      els.clearGacha = $('clear-gacha');
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
      els.deckSummary = $('deck-summary');
      els.btnBuild = $('btn-build');
      els.deckBuilder = $('deck-builder');
      els.fusionPrimary = $('fusion-primary');
      els.fusionSecondary = $('fusion-secondary');
      els.btnFuse = $('btn-fuse');
      els.fusionNote = $('fusion-note');
      els.fusionPreview = $('fusion-preview');
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

      var fusionCard = $('card-fusion');
      if (fusionCard) {
        deckCards.fusion = fusionCard;
        fusionCard.style.setProperty('--mode-color', C.modeColor('fusion'));
        fusionCard.setAttribute('data-genre', C.GENRE_LABELS.other);
        fusionCard.addEventListener('click', function () {
          toggleDeck('fusion');
          if (fusionCard.blur) fusionCard.blur();
        });
      }
      buildFusionSelects();
      if (els.btnFuse) els.btnFuse.addEventListener('click', createFusion);
      if (els.fusionPrimary) els.fusionPrimary.addEventListener('change', updateFusionPreview);
      if (els.fusionSecondary) els.fusionSecondary.addEventListener('change', updateFusionPreview);

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
      if (els.btnPause) els.btnPause.addEventListener('click', function () { if (typeof actions.onPause === 'function') actions.onPause(); });
      if (els.btnResume) els.btnResume.addEventListener('click', function () { if (typeof actions.onResume === 'function') actions.onResume(); });
      if (els.btnPauseRetry) els.btnPauseRetry.addEventListener('click', function () { if (typeof actions.onPauseRetry === 'function') actions.onPauseRetry(); });
      if (els.btnPauseExit) els.btnPauseExit.addEventListener('click', function () { if (typeof actions.onPauseExit === 'function') actions.onPauseExit(); });
      if (els.btnEndingAgain) els.btnEndingAgain.addEventListener('click', function () { if (typeof actions.onEndingAgain === 'function') actions.onEndingAgain(); });
      if (els.btnEndingTitle) els.btnEndingTitle.addEventListener('click', function () { if (typeof actions.onEndingTitle === 'function') actions.onEndingTitle(); });
      if (els.btnRescue) els.btnRescue.addEventListener('click', function () { if (typeof actions.onRescue === 'function') actions.onRescue(); });
      if (els.btnRescueBack) els.btnRescueBack.addEventListener('click', function () { if (typeof actions.onRescueBack === 'function') actions.onRescueBack(); });
      for (i = 0; i < 3; i++) {
        (function (index) {
          var btn = $('rescue-' + index);
          if (btn) btn.addEventListener('click', function () { if (typeof actions.onRescuePick === 'function') actions.onRescuePick(index); });
        })(i);
      }
      if (els.btnRetry) els.btnRetry.addEventListener('click', function () { if (typeof actions.onRetry === 'function') actions.onRetry(); });
      if (els.btnBuild) els.btnBuild.addEventListener('click', toggleDeckBuilder);
      if (els.btnAgain) els.btnAgain.addEventListener('click', function () { if (typeof actions.onStart === 'function') actions.onStart(); });
      if (els.btnDeck) els.btnDeck.addEventListener('click', function () { if (typeof actions.onBackToDeck === 'function') actions.onBackToDeck(); });
      if (els.btnSound) els.btnSound.addEventListener('click', toggleSound);
      if (els.btnTutorial) els.btnTutorial.addEventListener('click', function () { if (typeof actions.onTutorial === 'function') actions.onTutorial(); });
      if (els.btnTutorialSkip) els.btnTutorialSkip.addEventListener('click', function () { if (typeof actions.onTutorialSkip === 'function') actions.onTutorialSkip(); });
      if (els.btnTutorialStart) els.btnTutorialStart.addEventListener('click', function () { if (typeof actions.onTutorialStart === 'function') actions.onTutorialStart(); });
      if (els.btnTutorialBack) els.btnTutorialBack.addEventListener('click', function () { if (typeof actions.onTutorialSkip === 'function') actions.onTutorialSkip(); });
      if (els.btnGacha) els.btnGacha.addEventListener('click', openGacha);
      if (els.btnGachaRoll) els.btnGachaRoll.addEventListener('click', rollGacha);
      if (els.btnGachaClose) els.btnGachaClose.addEventListener('click', showStart);
      for (i = 0; i < 3; i++) {
        (function (index) {
          var btn = $('upgrade-' + index);
          if (btn) btn.addEventListener('click', function () { if (typeof actions.onUpgrade === 'function') actions.onUpgrade(index); });
        })(i);
      }

      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('keydown', function (e) {
          var key = e && (e.key || '');
          if ((key === 'Escape' || key === 'Esc') && els.screenGacha &&
            els.screenGacha.classList.contains('visible')) {
            if (e.preventDefault) e.preventDefault();
            showStart();
          }
        });
      }
      updateSoundButton();
      updateTutorialButton();
      updateGachaLabels();
      updateDeckUi();
      showStart();
    }

    return {
      init: init,
      getDeck: function () { return selectedDeck.slice(); },
      getParams: function () { return selectedParams; },
      getFusion: function () { return selectedFusion ? { primary: selectedFusion.primary, secondary: selectedFusion.secondary } : null; },
      getUnlocked: function () { return gacha.unlocked.slice(); },
      grantGachaPoints: grantGachaPoints,
      getBest: function () { return best; },
      isMuted: function () { return muted; },
      setRuntime: setRuntime,
      setPauseVisible: setPauseVisible,
      showPause: showPause,
      showEnding: showEnding,
      updateHud: updateHud,
      updateSlots: updateSlots,
      updateUpgradeCards: updateUpgradeCards,
      showStart: showStart,
      hideScreens: hideScreens,
      showEnd: showEnd,
      showRescueChoices: showRescueChoices,
      showClear: showClear,
      showFunctionChoices: showFunctionChoices,
      showDeckSwapChoices: showDeckSwapChoices,
      showStageBanner: showStageBanner,
      showTutorialStep: showTutorialStep,
      showTutorialComplete: showTutorialComplete,
      hideTutorial: hideTutorial,
      setTutorialMode: setTutorialMode,
      markTutorialDone: markTutorialDone,
      isTutorialDone: function () { return tutorialDone; }
    };
  }

  return { create: create };
});
