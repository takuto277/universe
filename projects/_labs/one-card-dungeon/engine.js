/* engine.js : ONE CARD DUNGEON（1ターン1枚デッキ構築） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OneCardEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_FLOOR = 6;
  var HAND_SIZE = 3;
  var START_HP = 60;
  var MAX_LOG = 6;

  var CARDS = {
    strike: { id: 'strike', name: 'ストライク', icon: '⚔', color: '#ff6b6b', desc: '8ダメージ', damage: 8 },
    guard: { id: 'guard', name: 'ガード', icon: '🛡', color: '#6db7ff', desc: '9ブロック', block: 9 },
    heavy: { id: 'heavy', name: 'ヘビー', icon: '💥', color: '#ff9f43', desc: '15ダメージ / 自分3', damage: 15, self: 3 },
    heal: { id: 'heal', name: 'ヒール', icon: '💚', color: '#58e6b0', desc: '9回復', heal: 9 },
    freeze: { id: 'freeze', name: 'フリーズ', icon: '❄', color: '#8ed2ff', desc: '敵の次の行動を止める', freeze: 1 },
    poison: { id: 'poison', name: 'ポイズン', icon: '☠', color: '#b48cff', desc: '3毒を3ターン', poison: { damage: 3, turns: 3 } },
    focus: { id: 'focus', name: 'フォーカス', icon: '✨', color: '#ffd166', desc: '次の攻撃+8', focus: 8 },
    drain: { id: 'drain', name: 'ドレイン', icon: '🩸', color: '#ff7bc8', desc: '6ダメージ + 6回復', damage: 6, heal: 6 },
    bash: { id: 'bash', name: 'シールドバッシュ', icon: '🔨', color: '#ffd166', desc: 'ブロック分ダメージ', bash: true }
  };

  var START_DECK = ['strike', 'strike', 'strike', 'guard', 'guard', 'heal', 'heavy', 'freeze'];
  var REWARD_POOL = ['strike', 'guard', 'heavy', 'heal', 'freeze', 'poison', 'focus', 'drain', 'bash'];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(state, list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(state.rng() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function pushLog(state, text) {
    state.log.push(text);
    if (state.log.length > MAX_LOG) state.log.shift();
  }

  function pushEvent(state, event) {
    state.events.push(event);
    if (state.events.length > 40) state.events.shift();
  }

  function makeCard(id, uid) {
    var def = CARDS[id];
    return { uid: uid, id: def.id, name: def.name, icon: def.icon, color: def.color, desc: def.desc };
  }

  function cardData(card) {
    var def = CARDS[card.id];
    return {
      uid: card.uid,
      id: def.id,
      name: def.name,
      icon: def.icon,
      color: def.color,
      desc: def.desc
    };
  }

  function makeEnemy(state, floor) {
    var names = ['スライム', 'コウモリ', 'ゴブリン', 'ゴーレム', 'リッチ', '魔王'];
    var normalPattern = ['attack', 'guard', 'wait', 'heavy'];
    var bossPattern = ['attack', 'heavy', 'guard', 'wait', 'attack'];
    var hp = 12 + floor * 5 + (floor === MAX_FLOOR ? 10 : 0);
    var attack = 2 + floor + (floor === MAX_FLOOR ? 1 : 0);
    var enemy = {
      name: names[floor - 1],
      floor: floor,
      hp: hp,
      maxHp: hp,
      shield: 0,
      attack: attack,
      pattern: floor === MAX_FLOOR ? bossPattern : normalPattern,
      intentIndex: 0,
      frozen: 0,
      poisonTurns: 0,
      poisonDamage: 0
    };
    enemy.intent = intentOf(enemy);
    return enemy;
  }

  function intentOf(enemy) {
    var kind = enemy.pattern[enemy.intentIndex % enemy.pattern.length];
    if (kind === 'guard') return { kind: 'guard', label: '防御', value: 6 };
    if (kind === 'wait') return { kind: 'wait', label: '様子見', value: 0 };
    if (kind === 'heavy') return { kind: 'heavy', label: '強撃', value: enemy.attack + 4 };
    return { kind: 'attack', label: '攻撃', value: enemy.attack };
  }

  function startFloor(state, floor) {
    state.floor = floor;
    state.phase = 'run';
    state.player.shield = 0;
    state.player.focus = 0;
    state.enemy = makeEnemy(state, floor);
    state.drawPile = shuffle(state, state.deck.slice());
    state.discard = [];
    state.hand = [];
    state.rewardChoices = [];
    state.log = [];
    state.turns = 0;
    pushLog(state, 'B' + floor + 'F: ' + state.enemy.name + 'が現れた');
    drawHand(state);
    pushEvent(state, { type: 'floor', floor: floor, enemy: state.enemy });
  }

  function drawHand(state) {
    while (state.hand.length < HAND_SIZE) {
      if (!state.drawPile.length) {
        if (!state.discard.length) break;
        state.drawPile = shuffle(state, state.discard.splice(0, state.discard.length));
        pushLog(state, '山札を再構築');
      }
      state.hand.push(state.drawPile.pop());
    }
  }

  function reset(state) {
    state.phase = 'idle';
    state.floor = 0;
    state.turns = 0;
    state.player = { hp: START_HP, maxHp: START_HP, shield: 0, focus: 0 };
    state.deck = [];
    state.hand = [];
    state.drawPile = [];
    state.discard = [];
    state.rewardChoices = [];
    state.enemy = null;
    state.result = null;
    state.log = [];
    state.events = [];
    state.nextUid = 1;
    state.over = false;
    state.win = false;
    return state;
  }

  function createGame(options) {
    options = options || {};
    var state = {
      rng: options.rng || Math.random
    };
    reset(state);
    return state;
  }

  function start(state) {
    if (!state || state.phase === 'run' || state.phase === 'reward') return false;
    reset(state);
    state.phase = 'run';
    state.deck = START_DECK.map(function (id) { return makeCard(id, state.nextUid++); });
    startFloor(state, 1);
    pushEvent(state, { type: 'start' });
    return true;
  }

  function dealDamage(state, amount) {
    var enemy = state.enemy;
    var blocked = Math.min(enemy.shield, amount);
    enemy.shield -= blocked;
    var dealt = amount - blocked;
    if (dealt > 0) enemy.hp = Math.max(0, enemy.hp - dealt);
    return dealt;
  }

  function hitPlayer(state, amount) {
    var player = state.player;
    var blocked = Math.min(player.shield, amount);
    player.shield -= blocked;
    var dealt = amount - blocked;
    if (dealt > 0) player.hp = Math.max(0, player.hp - dealt);
    return dealt;
  }

  function cardDamage(state, card) {
    var def = CARDS[card.id];
    var amount = def.bash ? state.player.shield : (def.damage || 0);
    if (!amount) return 0;
    amount += state.player.focus;
    state.player.focus = 0;
    if (def.bash) state.player.shield = 0;
    return amount;
  }

  function floorClear(state) {
    state.player.shield = 0;
    state.player.focus = 0;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 8);
    pushLog(state, '敵を倒した。HP+8');
    if (state.floor >= MAX_FLOOR) {
      state.phase = 'win';
      state.win = true;
      state.over = true;
      state.result = {
        win: true,
        floor: state.floor,
        turns: state.turns,
        hp: state.player.hp,
        maxHp: state.player.maxHp,
        deck: state.deck.map(function (c) { return c.name; }),
        rank: state.player.hp >= 20 ? 'S' : (state.player.hp >= 10 ? 'A' : 'B')
      };
      pushEvent(state, { type: 'win', result: state.result });
      return;
    }
    state.phase = 'reward';
    var pool = REWARD_POOL.slice();
    state.rewardChoices = [];
    for (var i = 0; i < 3 && pool.length; i++) {
      var idx = Math.floor(state.rng() * pool.length);
      state.rewardChoices.push(pool.splice(idx, 1)[0]);
    }
    pushEvent(state, { type: 'reward', choices: state.rewardChoices });
  }

  function gameOver(state) {
    state.phase = 'over';
    state.over = true;
    state.result = {
      win: false,
      floor: state.floor,
      turns: state.turns,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      deck: state.deck.map(function (c) { return c.name; }),
      rank: 'FLOOR ' + state.floor
    };
    pushEvent(state, { type: 'over', result: state.result });
  }

  function enemyTurn(state) {
    var enemy = state.enemy;
    var player = state.player;
    if (!enemy) return;
    if (enemy.frozen > 0) {
      enemy.frozen--;
      pushLog(state, enemy.name + 'は凍結している');
    } else {
      var intent = intentOf(enemy);
      if (intent.kind === 'guard') {
        enemy.shield += intent.value;
        pushLog(state, enemy.name + 'は防御した');
        pushEvent(state, { type: 'enemy', kind: 'guard', value: intent.value });
      } else if (intent.kind === 'wait') {
        pushLog(state, enemy.name + 'は様子を見ている');
        pushEvent(state, { type: 'enemy', kind: 'wait', value: 0 });
      } else {
        var dealt = hitPlayer(state, intent.value);
        pushLog(state, enemy.name + 'の' + intent.label + ' ' + dealt + 'ダメージ');
        pushEvent(state, { type: 'enemy', kind: intent.kind, value: dealt });
      }
    }
    player.shield = 0;
    enemy.intentIndex++;
    if (enemy.poisonTurns > 0) {
      enemy.hp = Math.max(0, enemy.hp - enemy.poisonDamage);
      enemy.poisonTurns--;
      pushLog(state, '毒が' + enemy.poisonDamage + 'ダメージ');
      pushEvent(state, { type: 'poison', value: enemy.poisonDamage });
    }
    if (enemy.hp <= 0) {
      floorClear(state);
      return;
    }
    if (player.hp <= 0) {
      gameOver(state);
      return;
    }
    enemy.intent = intentOf(enemy);
    state.turns++;
    drawHand(state);
  }

  function playCard(state, index) {
    if (!state || state.phase !== 'run') return false;
    if (index < 0 || index >= state.hand.length) return false;
    var card = state.hand[index];
    var def = CARDS[card.id];
    state.hand.splice(index, 1);
    state.discard.push(card);
    pushEvent(state, { type: 'play', card: cardData(card) });
    pushLog(state, 'あなた: ' + card.name);

    if (def.damage || def.bash) {
      var damage = cardDamage(state, card);
      var dealt = dealDamage(state, damage);
      pushEvent(state, { type: 'damage', value: dealt });
      pushLog(state, '敵に' + dealt + 'ダメージ');
    }
    if (def.block) {
      state.player.shield += def.block;
      pushEvent(state, { type: 'block', value: def.block });
    }
    if (def.heal) {
      var before = state.player.hp;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + def.heal);
      pushEvent(state, { type: 'heal', value: state.player.hp - before });
    }
    if (def.focus) {
      state.player.focus += def.focus;
      pushEvent(state, { type: 'focus', value: def.focus });
    }
    if (def.freeze) {
      state.enemy.frozen += def.freeze;
      pushEvent(state, { type: 'freeze', value: def.freeze });
    }
    if (def.poison) {
      state.enemy.poisonTurns = Math.max(state.enemy.poisonTurns, def.poison.turns);
      state.enemy.poisonDamage = Math.max(state.enemy.poisonDamage, def.poison.damage);
      pushEvent(state, { type: 'poisonApply', value: def.poison.damage });
    }
    if (def.self) {
      state.player.hp = Math.max(0, state.player.hp - def.self);
      pushEvent(state, { type: 'self', value: def.self });
    }

    if (state.enemy.hp <= 0) {
      floorClear(state);
      return true;
    }
    if (state.player.hp <= 0) {
      gameOver(state);
      return true;
    }
    enemyTurn(state);
    return true;
  }

  function chooseReward(state, index) {
    if (!state || state.phase !== 'reward') return false;
    if (index < 0 || index >= state.rewardChoices.length) return false;
    var id = state.rewardChoices[index];
    state.deck.push(makeCard(id, state.nextUid++));
    pushLog(state, CARDS[id].name + 'をデッキに追加');
    startFloor(state, state.floor + 1);
    return true;
  }

  function nextIntent(state) {
    if (!state || !state.enemy) return null;
    return intentOf(state.enemy);
  }

  function autoStep(state) {
    if (!state) return;
    if (state.phase === 'idle') { start(state); return; }
    if (state.phase === 'reward') { chooseReward(state, 0); return; }
    if (state.phase !== 'run' || !state.hand.length) return;
    var intent = intentOf(state.enemy);
    var hand = state.hand;
    var pick = 0;
    var bestScore = -999;
    for (var i = 0; i < hand.length; i++) {
      var def = CARDS[hand[i].id];
      var score = 0;
      if (def.heal && state.player.hp <= state.player.maxHp * 0.55) score += 50;
      if (def.freeze && intent.kind === 'heavy') score += 45;
      if (def.guard && intent.kind !== 'guard') score += 18;
      if (def.damage) score += def.damage;
      if (def.bash) score += state.player.shield * 1.2;
      if (def.poison && state.enemy.poisonTurns === 0) score += 22;
      if (def.focus) score += 15;
      if (def.self) score -= def.self;
      if (score > bestScore) { bestScore = score; pick = i; }
    }
    playCard(state, pick);
  }

  function snapshot(state) {
    if (!state) return null;
    return {
      phase: state.phase,
      floor: state.floor,
      maxFloor: MAX_FLOOR,
      turns: state.turns,
      player: {
        hp: state.player.hp,
        maxHp: state.player.maxHp,
        shield: state.player.shield,
        focus: state.player.focus
      },
      enemy: state.enemy ? {
        name: state.enemy.name,
        hp: state.enemy.hp,
        maxHp: state.enemy.maxHp,
        shield: state.enemy.shield,
        frozen: state.enemy.frozen,
        poisonTurns: state.enemy.poisonTurns,
        poisonDamage: state.enemy.poisonDamage,
        intent: intentOf(state.enemy)
      } : null,
      hand: state.hand.map(cardData),
      drawCount: state.drawPile.length,
      discardCount: state.discard.length,
      deckCount: state.deck.length,
      rewardChoices: state.rewardChoices.map(function (id) { return cardData({ id: id }); }),
      log: state.log.slice(),
      over: state.over,
      win: state.win,
      result: state.result
    };
  }

  function consumeEvents(state) {
    if (!state) return [];
    var events = state.events;
    state.events = [];
    return events;
  }

  return {
    MAX_FLOOR: MAX_FLOOR,
    HAND_SIZE: HAND_SIZE,
    CARDS: CARDS,
    START_HP: START_HP,
    createGame: createGame,
    start: start,
    playCard: playCard,
    chooseReward: chooseReward,
    nextIntent: nextIntent,
    autoStep: autoStep,
    snapshot: snapshot,
    consumeEvents: consumeEvents,
    mulberry32: mulberry32
  };
});
