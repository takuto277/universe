/* game.js : ONE CARD DUNGEON（DOM描画・入力） */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.OneCardEngine) ? window.OneCardEngine : null;
  if (!E) return;

  var state = null;
  var best = 0;
  var els = {};
  var enemyHitTimer = null;

  function $(id) { return document.getElementById(id); }

  function loadBest() {
    try { return Number(localStorage.getItem('one-card-best')) || 0; } catch (e) { return 0; }
  }

  function saveBest(value) {
    try { localStorage.setItem('one-card-best', String(value)); } catch (e) { }
  }

  function setText(el, value) {
    if (el) el.textContent = value == null ? '' : String(value);
  }

  function makeCard(card, index, action) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'card';
    button.style.setProperty('--card-color', card.color);
    button.setAttribute('aria-label', card.name + '。' + card.desc);
    if (index < 9) button.dataset.key = String(index + 1);

    var icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = card.icon;
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = card.name;
    var desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = card.desc;
    button.appendChild(icon);
    button.appendChild(name);
    button.appendChild(desc);
    button.addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      action(index);
    });
    return button;
  }

  function makeRelic(relic, index, action) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'relic-choice';
    button.style.setProperty('--relic-color', relic.color);
    var icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = relic.icon;
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = relic.name;
    var desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = relic.desc;
    button.appendChild(icon);
    button.appendChild(name);
    button.appendChild(desc);
    button.addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      action(index);
    });
    return button;
  }

  function floatText(text, kind) {
    if (!els.fx) return;
    var el = document.createElement('span');
    el.className = 'float ' + (kind || '');
    el.textContent = text;
    els.fx.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 700);
  }

  function enemyHit() {
    if (!els.enemyAvatar) return;
    els.enemyAvatar.classList.add('hit');
    if (enemyHitTimer) clearTimeout(enemyHitTimer);
    enemyHitTimer = setTimeout(function () {
      if (els.enemyAvatar) els.enemyAvatar.classList.remove('hit');
    }, 180);
  }

  function shakeHud() {
    if (!els.hud) return;
    els.hud.classList.remove('shake');
    void els.hud.offsetWidth;
    els.hud.classList.add('shake');
  }

  function renderHand() {
    if (!els.hand) return;
    els.hand.innerHTML = '';
    if (!state || state.phase !== 'run') return;
    for (var i = 0; i < state.hand.length; i++) {
      els.hand.appendChild(makeCard(state.hand[i], i, playCard));
    }
  }

  function renderReward() {
    if (!els.rewardHand || !state) return;
    els.rewardHand.innerHTML = '';
    for (var i = 0; i < state.rewardChoices.length; i++) {
      var def = E.CARDS[state.rewardChoices[i]];
      if (def) els.rewardHand.appendChild(makeCard(def, i, chooseReward));
    }
  }

  function renderRelics() {
    if (!els.relicBar || !state) return;
    els.relicBar.innerHTML = '';
    for (var i = 0; i < state.relics.length; i++) {
      var relic = E.RELICS[state.relics[i]];
      if (!relic) continue;
      var chip = document.createElement('span');
      chip.className = 'relic-chip';
      chip.textContent = relic.icon + ' ' + relic.name;
      els.relicBar.appendChild(chip);
    }
    setText(els.deckCount, state.deck.length);
  }

  function renderRelicChoices() {
    if (!els.relicHand || !state) return;
    els.relicHand.innerHTML = '';
    for (var i = 0; i < state.relicChoices.length; i++) {
      var relic = E.RELICS[state.relicChoices[i]];
      if (relic) els.relicHand.appendChild(makeRelic(relic, i, chooseRelic));
    }
  }

  function renderDeck() {
    if (!els.deckList || !state) return;
    els.deckList.innerHTML = '';
    var counts = {};
    for (var i = 0; i < state.deck.length; i++) counts[state.deck[i].name] = (counts[state.deck[i].name] || 0) + 1;
    Object.keys(counts).sort().forEach(function (name) {
      var line = document.createElement('div');
      line.className = 'deck-line';
      var b = document.createElement('b');
      b.textContent = counts[name] + '×';
      line.appendChild(b);
      line.appendChild(document.createTextNode(name));
      els.deckList.appendChild(line);
    });
  }

  function renderStatus() {
    if (!els.enemyStatus || !state || !state.enemy) return;
    els.enemyStatus.innerHTML = '';
    if (state.enemy.elite || state.enemy.boss) {
      var rankChip = document.createElement('span');
      rankChip.className = 'chip';
      rankChip.textContent = state.enemy.boss ? '👑 BOSS' : '◆ ELITE';
      els.enemyStatus.appendChild(rankChip);
    }
    if (state.enemy.frozen > 0) {
      var freeze = document.createElement('span');
      freeze.className = 'chip freeze';
      freeze.textContent = '❄ 凍結 ' + state.enemy.frozen;
      els.enemyStatus.appendChild(freeze);
    }
    if (state.enemy.poisonTurns > 0) {
      var poison = document.createElement('span');
      poison.className = 'chip poison';
      poison.textContent = '☠ 毒 ' + state.enemy.poisonDamage + '×' + state.enemy.poisonTurns;
      els.enemyStatus.appendChild(poison);
    }
    if (state.enemy.shield > 0) {
      var shield = document.createElement('span');
      shield.className = 'chip';
      shield.textContent = '🛡 ' + state.enemy.shield;
      els.enemyStatus.appendChild(shield);
    }
  }

  function renderIntent() {
    if (!els.intent || !state || !state.enemy) return;
    var intent = state.enemy.intent;
    els.intent.className = 'intent ' + intent.kind;
    setText(els.intentLabel, intent.value > 0 ? intent.label + ' ' + intent.value : intent.label);
  }

  function renderLog() {
    if (!els.log || !state) return;
    els.log.innerHTML = '';
    var logs = state.log.slice(-4);
    for (var i = 0; i < logs.length; i++) {
      var p = document.createElement('p');
      p.textContent = logs[i];
      els.log.appendChild(p);
    }
  }

  function fillEnd() {
    if (!state || !state.result) return;
    var r = state.result;
    if (r.floor > best) {
      best = r.floor;
      saveBest(best);
    }
    if (r.win && r.floor > best) best = r.floor;
    setText(els.endEyebrow, r.win ? 'DUNGEON CLEAR' : 'RUN OVER');
    setText(els.endRank, r.rank);
    setText(els.endDetail, r.win ? '6階層の魔王を倒した。' : 'FLOOR ' + r.floor + 'で力尽きた。');
    setText(els.endFloor, r.floor);
    setText(els.endHp, r.hp + ' / ' + r.maxHp);
    setText(els.endTurns, r.turns);
    setText(els.endDeck, r.deck.length + ' cards: ' + r.deck.join(' / '));
    setText(els.endRelics, r.relics && r.relics.length ? 'RELICS: ' + r.relics.join(' / ') : 'RELICS: none');
    setText(els.endBest, best);
    setText(els.bestStart, 'BEST FLOOR ' + best);
  }

  function showOverlay(phase) {
    if (!els.overlay) return;
    if (phase === 'start' || phase === 'reward' || phase === 'relic' || phase === 'win' || phase === 'over') {
      els.overlay.classList.add('visible');
      if (phase !== 'start' && els.fx) els.fx.innerHTML = '';
    } else {
      els.overlay.classList.remove('visible');
    }
    var showStart = phase === 'start';
    var showReward = phase === 'reward';
    var showRelic = phase === 'relic';
    var showEnd = phase === 'win' || phase === 'over';
    if (els.start) els.start.classList.toggle('visible', showStart);
    if (els.rewardScreen) els.rewardScreen.classList.toggle('visible', showReward);
    if (els.relicScreen) els.relicScreen.classList.toggle('visible', showRelic);
    if (els.end) els.end.classList.toggle('visible', showEnd);
    if (showReward) renderReward();
    if (showRelic) renderRelicChoices();
    if (showEnd) fillEnd();
  }

  function render() {
    if (!state) return;
    setText(els.floor, state.floor || 1);
    setText(els.hpText, state.player.hp + ' / ' + state.player.maxHp);
    setText(els.shield, state.player.shield);
    setText(els.focus, state.player.focus);
    setText(els.turn, state.turns);
    if (els.hpFill) els.hpFill.style.width = Math.max(0, state.player.hp / state.player.maxHp * 100) + '%';

    if (state.enemy) {
      setText(els.enemyName, state.enemy.name);
      setText(els.enemyHpText, state.enemy.hp + ' / ' + state.enemy.maxHp);
      if (els.enemyHpFill) els.enemyHpFill.style.width = Math.max(0, state.enemy.hp / state.enemy.maxHp * 100) + '%';
      if (els.enemyAvatar) els.enemyAvatar.setAttribute('data-floor', String(state.floor));
    }
    renderStatus();
    renderRelics();
    renderIntent();
    renderLog();
    setText(els.pileInfo, 'DRAW ' + state.drawPile.length + ' / DISCARD ' + state.discard.length);
    renderHand();
    showOverlay(state.phase);
  }

  function processEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'damage') {
        enemyHit();
        floatText('-' + ev.value, 'damage');
      } else if (ev.type === 'enemy') {
        if (ev.value > 0) {
          shakeHud();
          floatText('-' + ev.value, 'damage');
        }
      } else if (ev.type === 'heal' && ev.value > 0) {
        floatText('+' + ev.value, 'heal');
      } else if (ev.type === 'block') {
        floatText('+' + ev.value + ' BLOCK', 'block');
      } else if (ev.type === 'focus') {
        floatText('+' + ev.value + ' FOCUS', '');
      } else if (ev.type === 'poisonApply') {
        floatText('POISON', '');
      }
    }
  }

  function begin() {
    if (!state) return;
    E.start(state);
    if (els.overlay) els.overlay.classList.remove('visible');
    render();
    processEvents(E.consumeEvents(state));
  }

  function playCard(index) {
    if (!state || state.phase !== 'run') return;
    E.playCard(state, index);
    processEvents(E.consumeEvents(state));
    render();
  }

  function chooseReward(index) {
    if (!state || state.phase !== 'reward') return;
    E.chooseReward(state, index);
    processEvents(E.consumeEvents(state));
    render();
  }

  function chooseRelic(index) {
    if (!state || state.phase !== 'relic') return;
    E.chooseRelic(state, index);
    processEvents(E.consumeEvents(state));
    render();
  }

  function skipReward() {
    if (!state || state.phase !== 'reward') return;
    E.skipReward(state);
    processEvents(E.consumeEvents(state));
    render();
  }

  function openDeck(open) {
    if (!els.deckModal) return;
    if (open) renderDeck();
    els.deckModal.classList.toggle('visible', !!open);
  }

  function onKey(e) {
    if (!e) return;
    var key = e.key || '';
    if (key === ' ' || key === 'Enter') {
      if (e.preventDefault) e.preventDefault();
      if (state && (state.phase === 'idle' || state.phase === 'win' || state.phase === 'over')) begin();
      return;
    }
    var n = Number(key);
    if (!n || n < 1 || n > 3) return;
    if (e.preventDefault) e.preventDefault();
    if (state && state.phase === 'run') playCard(n - 1);
    else if (state && state.phase === 'reward') chooseReward(n - 1);
    else if (state && state.phase === 'relic') chooseRelic(n - 1);
  }

  function init() {
    els = {
      hud: $('hud'),
      floor: $('floor'),
      hpText: $('hp-text'),
      hpFill: $('hp-fill'),
      shield: $('shield'),
      focus: $('focus'),
      turn: $('turn'),
      enemyName: $('enemy-name'),
      enemyStatus: $('enemy-status'),
      enemyAvatar: $('enemy-avatar'),
      enemyHpFill: $('enemy-hp-fill'),
      enemyHpText: $('enemy-hp-text'),
      intent: $('intent'),
      intentLabel: $('intent-label'),
      log: $('log'),
      hand: $('hand'),
      pileInfo: $('pile-info'),
      deckCount: $('deck-count'),
      relicBar: $('relic-bar'),
      btnDeck: $('btn-deck'),
      deckModal: $('deck-modal'),
      deckList: $('deck-list'),
      btnDeckClose: $('btn-deck-close'),
      fx: $('fx'),
      overlay: $('overlay'),
      start: $('screen-start'),
      rewardScreen: $('screen-reward'),
      rewardHand: $('reward-hand'),
      btnSkip: $('btn-skip'),
      relicScreen: $('screen-relic'),
      relicHand: $('relic-hand'),
      end: $('screen-end'),
      endEyebrow: $('end-eyebrow'),
      endRank: $('end-rank'),
      endDetail: $('end-detail'),
      endFloor: $('end-floor'),
      endHp: $('end-hp'),
      endTurns: $('end-turns'),
      endDeck: $('end-deck'),
      endRelics: $('end-relics'),
      endBest: $('end-best'),
      bestStart: $('best-start'),
      btnStart: $('btn-start'),
      btnAgain: $('btn-again')
    };
    best = loadBest();
    setText(els.bestStart, 'BEST FLOOR ' + best);
    state = E.createGame();
    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnAgain) els.btnAgain.addEventListener('click', begin);
    if (els.btnSkip) els.btnSkip.addEventListener('click', skipReward);
    if (els.btnDeck) els.btnDeck.addEventListener('click', function () { openDeck(true); });
    if (els.btnDeckClose) els.btnDeckClose.addEventListener('click', function () { openDeck(false); });
    if (els.deckModal) els.deckModal.addEventListener('click', function (e) {
      if (e.target === els.deckModal) openDeck(false);
    });
    window.addEventListener('keydown', onKey);
    render();
    showOverlay('start');

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'one-card-dungeon',
        title: 'ONE CARD DUNGEON',
        start: function () { begin(); },
        autoPlayStep: function () {
          if (!state) return;
          E.autoStep(state);
          processEvents(E.consumeEvents(state));
          render();
        },
        isDone: function () { return !!(state && (state.win || state.over)); },
        getState: function () { return state ? E.snapshot(state) : null; }
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
