/* gacha.js : ローカル関数ガチャの抽選ロジック（UI・保存に依存しない） */
(function (root, factory) {
  'use strict';
  var C = (typeof module !== 'undefined' && module.exports) ? require('./content.js') : root.GraphContent;
  var B = (typeof module !== 'undefined' && module.exports) ? require('./balance.js') : root.GraphBalance;
  var api = factory(C, B);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphGacha = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, B) {
  'use strict';

  var POOL_RARITIES = ['common', 'uncommon', 'rare', 'epic'];

  function createDefault() {
    return {
      version: 1,
      unlocked: C.STARTER_FUNCTIONS.slice(),
      points: B.GACHA_START_POINTS,
      pityRare: 0,
      pityEpic: 0,
      rolls: 0,
      lastResult: null
    };
  }

  function normalize(state) {
    var out = state && typeof state === 'object' ? state : {};
    var unlocked = [];
    if (Array.isArray(out.unlocked)) {
      for (var i = 0; i < out.unlocked.length; i++) {
        var key = out.unlocked[i];
        if (C.MODES[key] && key !== 'fusion' && unlocked.indexOf(key) < 0) unlocked.push(key);
      }
    }
    for (i = 0; i < C.STARTER_FUNCTIONS.length; i++) {
      if (unlocked.indexOf(C.STARTER_FUNCTIONS[i]) < 0) unlocked.push(C.STARTER_FUNCTIONS[i]);
    }
    out.version = 1;
    out.unlocked = unlocked;
    out.points = Math.max(0, Math.floor(Number(out.points)));
    if (!isFinite(out.points)) out.points = B.GACHA_START_POINTS;
    out.pityRare = Math.max(0, Math.floor(Number(out.pityRare) || 0));
    out.pityEpic = Math.max(0, Math.floor(Number(out.pityEpic) || 0));
    out.rolls = Math.max(0, Math.floor(Number(out.rolls) || 0));
    if (!out.lastResult || !C.MODES[out.lastResult.key]) out.lastResult = null;
    return out;
  }

  function allUnlocked(state) {
    for (var i = 0; i < C.MODE_KEYS.length; i++) {
      if (state.unlocked.indexOf(C.MODE_KEYS[i]) < 0) return false;
    }
    return true;
  }

  function poolFor(rarity) {
    var out = [];
    for (var i = 0; i < C.MODE_KEYS.length; i++) {
      var key = C.MODE_KEYS[i];
      if (C.MODES[key].rarity === rarity) out.push(key);
    }
    return out;
  }

  function pickRarity(state, random) {
    if (state.pityEpic >= B.GACHA_EPIC_PITY - 1) return 'epic';
    var forceRare = state.pityRare >= B.GACHA_RARE_PITY - 1;
    var rarities = forceRare ? ['rare', 'epic'] : POOL_RARITIES;
    var total = 0;
    var i;
    for (i = 0; i < rarities.length; i++) total += C.RARITY_INFO[rarities[i]].weight;
    if (total <= 0) return 'common';
    var target = random() * total;
    for (i = 0; i < rarities.length; i++) {
      target -= C.RARITY_INFO[rarities[i]].weight;
      if (target < 0) return rarities[i];
    }
    return rarities[rarities.length - 1];
  }

  function roll(state, random) {
    state = normalize(state);
    if (allUnlocked(state)) return { ok: false, reason: 'complete', state: state };
    if (state.points < B.GACHA_COST) return { ok: false, reason: 'points', state: state };
    var rand = typeof random === 'function' ? random : Math.random;
    state.points -= B.GACHA_COST;
    var rarity = pickRarity(state, rand);
    var pool = poolFor(rarity);
    if (!pool.length) {
      rarity = 'common';
      pool = poolFor(rarity);
    }
    var key = pool[Math.floor(rand() * pool.length) % pool.length];
    var isNew = state.unlocked.indexOf(key) < 0;
    if (isNew) state.unlocked.push(key);
    var duplicatePoints = isNew ? 0 : C.RARITY_INFO[rarity].duplicate;
    if (duplicatePoints) state.points += duplicatePoints;
    state.rolls++;
    if (rarity === 'epic') {
      state.pityRare = 0;
      state.pityEpic = 0;
    } else if (rarity === 'rare') {
      state.pityRare = 0;
      state.pityEpic++;
    } else {
      state.pityRare++;
      state.pityEpic++;
    }
    var result = {
      ok: true,
      key: key,
      rarity: rarity,
      isNew: isNew,
      duplicatePoints: duplicatePoints,
      points: state.points,
      rolls: state.rolls
    };
    state.lastResult = result;
    return { ok: true, value: result, state: state };
  }

  function grant(state, amount) {
    state = normalize(state);
    var n = Math.max(0, Math.floor(Number(amount) || 0));
    state.points += n;
    return n;
  }

  return {
    createDefault: createDefault,
    normalize: normalize,
    allUnlocked: allUnlocked,
    roll: roll,
    grant: grant,
    poolFor: poolFor
  };
});
