/* engine.js : グラフクロスのコアロジック（UI非依存）
 *
 * ルール:
 *   - x が自動で増え、プレイヤーの曲線が左から右へ伸びていく
 *   - 関数モード(x/2, -x/2, x², sin x)を切り替えて曲線の形を変える
 *   - 右から流れてくる敵の曲線と自分の曲線が交差すると大爆発・得点
 *   - 交差できずに画面左へ逃がすとライフが減る。ライフ0で終了
 *   - 5コンボごとにライフが1回復する
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GraphCrossEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var C = (typeof module !== 'undefined' && module.exports)
    ? require('./content.js')
    : (typeof GraphContent !== 'undefined' ? GraphContent : null);
  var B = (typeof module !== 'undefined' && module.exports)
    ? require('./balance.js')
    : (typeof GraphBalance !== 'undefined' ? GraphBalance : null);
  if (!C || !B) throw new Error('graph-cross: content.js / balance.js が必要です');

  var MAX_HP = B.MAX_HP;
  var BASE_SPEED = B.BASE_SPEED;
  var MAX_SPEED = B.MAX_SPEED;
  var SPEED_RAMP = B.SPEED_RAMP;
  var RAMP_TIME = B.RAMP_TIME;
  var PLAYER_HALF = B.PLAYER_HALF;
  var HIT_DIST = B.HIT_DIST;
  var COMBO_WINDOW = B.COMBO_WINDOW;
  var MAX_PLAYER_VY = B.MAX_PLAYER_VY;
  var HEAL_COMBO = B.HEAL_COMBO;
  var MAX_DT = B.MAX_DT;
  var MAX_EVENTS = B.MAX_EVENTS;
  var WAVE_AMPLITUDE = B.WAVE_AMPLITUDE;

  var MODES = C.MODES;
  var MODE_KEYS = C.MODE_KEYS;
  var DEFAULT_DECK = C.DEFAULT_DECK;
  var DECK_SIZE = C.DECK_SIZE;
  var FAMILY_LABELS = C.FAMILY_LABELS;
  var PARAM_SPECS = C.PARAM_SPECS;
  var WAVE_SHAPES = C.WAVE_SHAPES;
  var BOSS_FAMILIES = ['linear', 'quad', 'wave'];

  function snapToSpec(value, spec) {
    var v = clamp(value, spec.min, spec.max);
    var steps = Math.round((v - spec.min) / spec.step);
    var snapped = spec.min + steps * spec.step;
    return Math.round(snapped * 100) / 100;
  }

  function normalizeParams(params) {
    var out = {};
    for (var key in PARAM_SPECS) {
      if (!Object.prototype.hasOwnProperty.call(PARAM_SPECS, key)) continue;
      out[key] = {};
      var specs = PARAM_SPECS[key];
      for (var name in specs) {
        if (!Object.prototype.hasOwnProperty.call(specs, name)) continue;
        var spec = specs[name];
        var raw = params && params[key] && typeof params[key][name] === 'number'
          ? params[key][name]
          : spec.default;
        out[key][name] = snapToSpec(raw, spec);
      }
    }
    return out;
  }

  function normalizeDeckParams(params, deck) {
    var all = normalizeParams(params);
    var out = {};
    for (var i = 0; i < deck.length; i++) {
      if (PARAM_SPECS[deck[i]]) out[deck[i]] = all[deck[i]];
    }
    return out;
  }

  function modeFamily(key) {
    return MODES[key] ? MODES[key].family : 'none';
  }

  function baseVy(state, key) {
    if (key === 'up') return -170;
    if (key === 'down') return 170;
    if (key === 'steepUp') return -320;
    if (key === 'steepDown') return 320;
    if (key === 'quad' || key === 'quadDown') {
      var q = state.deckParams[key] || {};
      return (q.b || 0) * 120;
    }
    return 0;
  }

  function waveShapeValue(shape, theta, t) {
    if (shape === 1) return Math.cos(theta);
    if (shape === 2) return (2 / Math.PI) * Math.asin(Math.sin(theta));
    if (shape === 3) return Math.tanh(2.6 * Math.sin(theta));
    if (shape === 4) return Math.exp(-1.1 * Math.max(0, t)) * Math.sin(theta);
    return Math.sin(theta);
  }

  function waveOffset(state, t) {
    var wp = state.deckParams.wave || { a: 1, b: 1, c: 0, shape: 0 };
    var shape = Math.max(0, Math.min(4, Math.round(wp.shape || 0)));
    var theta = t * 4.2 * (wp.b || 1) + (wp.c || 0);
    return WAVE_AMPLITUDE * (wp.a || 1) * waveShapeValue(shape, theta, t);
  }

  function directMode(key) {
    return key === 'wave' || key === 'expo' || key === 'log' ||
      key === 'sigmoid' || key === 'gauss' || key === 'easeDown' || key === 'fusion';
  }

  function modeOffset(state, key, t) {
    if (key === 'up') return -170 * t;
    if (key === 'down') return 170 * t;
    if (key === 'steepUp') return -320 * t;
    if (key === 'steepDown') return 320 * t;
    if (key === 'quad' || key === 'quadDown') {
      var qp = state.deckParams[key] || { a: 1, b: 0, p: 2 };
      var power = Math.max(2, Math.round(qp.p || 2));
      var dir = key === 'quadDown' ? 1 : -1;
      return dir * 280 * (qp.a || 1) * Math.pow(t, power) + (qp.b || 0) * 120 * t;
    }
    if (directMode(key)) return directOffset(state, key, t);
    return 0;
  }

  function directOffset(state, key, t) {
    var span = Math.max(1, state.bottom - state.top);
    if (key === 'fusion') {
      if (!state.fusion) return 0;
      return modeOffset(state, state.fusion.primary, t) + modeOffset(state, state.fusion.secondary, t);
    }
    if (key === 'wave') return waveOffset(state, t);
    if (key === 'expo') return -0.12 * span * (Math.exp(1.8 * t) - 1);
    if (key === 'log') return -0.28 * span * Math.log(1 + 3 * t);
    if (key === 'sigmoid') {
      var sig = function (x) { return 1 / (1 + Math.exp(-x)); };
      return -0.6 * span * (sig(3 * (t - 0.6)) - sig(-1.8));
    }
    if (key === 'gauss') {
      var g = function (x) { return Math.exp(-Math.pow((x - 1.0) / 0.55, 2)); };
      return -0.45 * span * (g(t) - g(0));
    }
    if (key === 'easeDown') return 0.5 * span * (1 - Math.exp(-2.2 * t));
    return 0;
  }

  function setModeBase(state) {
    state.waveBaseY = state.y - directOffset(state, state.mode, 0);
  }

  function normalizeDeck(deck) {
    if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return DEFAULT_DECK.slice();
    var out = [];
    var seen = {};
    for (var i = 0; i < deck.length; i++) {
      var key = deck[i];
      if (!MODES[key] || seen[key]) return DEFAULT_DECK.slice();
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function rand(rng) { return (rng || Math.random)(); }

  function difficulty(state) {
    return clamp(state.time / RAMP_TIME, 0, 1);
  }

  function pushEvent(state, event) {
    if (state.events.length >= MAX_EVENTS) state.events.shift();
    state.events.push(event);
  }

  function setBounds(state, width, height) {
    var oldHead = state.headX;
    state.width = Math.max(280, Number(width) || 960);
    state.height = Math.max(280, Number(height) || 560);
    var margin = clamp(state.height * 0.075, 32, 56);
    state.top = margin;
    state.bottom = state.height - margin - 10;
    state.headX = clamp(state.width * 0.28, 100, 340);
    var shift = state.headX - oldHead;

    if (state.trail && shift !== 0) {
      for (var i = 0; i < state.trail.length; i++) state.trail[i].x += shift;
    }
    if (state.rivals && shift !== 0) {
      for (var r = 0; r < state.rivals.length; r++) state.rivals[r].x += shift;
    }
    if (typeof state.y === 'number') {
      state.y = clamp(state.y, state.top + PLAYER_HALF, state.bottom - PLAYER_HALF);
    }
  }

  function resetRun(state) {
    state.time = 0;
    state.worldX = 0;
    state.speed = BASE_SPEED;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.maxCombo = 0;
    state.maxHp = MAX_HP;
    state.hp = state.maxHp;
    state.hitBonus = 0;
    state.comboWindow = COMBO_WINDOW;
    state.scoreMult = 1;
    state.bossHpReduction = 0;
    state.upgrades = {};
    state.lastDeckSwap = null;
    state.mode = state.deck[0];
    state.modeTime = 0;
    state.vy = baseVy(state, state.mode);
    state.y = (state.top + state.bottom) / 2;
    state.waveBaseY = state.y;
    if (directMode(state.mode)) setModeBase(state);
    state.trail = [];
    state.rivals = [];
    state.items = [];
    state.allies = [];
    state.itemTimer = state.gameMode === 'stress' ? 2.0 : B.ITEM_FIRST_DELAY;
    state.multi = 0;
    state.multiTimer = 0;
    state.events = [];
    state.over = false;
    state.deathCause = null;
    state.spawnTimer = 0.9;
    state.hits = 0;
    state.misses = 0;
    if (state.gameMode === 'stress') {
      state.spawnTimer = 0.12;
      return;
    }
    state.stage = 1;
    state.stageHits = 0;
    state.stageTarget = stageTargetFor(1);
    state.stageCleared = false;
    state.stageClearBonus = 0;
    state.boss = null;
    state.bossCooldown = 0;

    var openingSpacing = 300;
    for (var i = 0; i < 3; i++) {
      spawnRival(state, state.headX + openingSpacing + i * openingSpacing);
    }
    /* 右端から自然生成する分は、導入の3本が十分左へ流れてから始める */
    var openingRight = state.headX + openingSpacing * 3 + 300;
    var naturalX = state.width + 60;
    var wait = (openingRight + BASE_SPEED * 1.4 - naturalX) / BASE_SPEED;
    state.spawnTimer = Math.max(0.9, wait);
  }

  function normalizeFusion(fusion) {
    if (!fusion || !MODES[fusion.primary] || !MODES[fusion.secondary]) return null;
    if (fusion.primary === 'fusion' || fusion.secondary === 'fusion') return null;
    if (fusion.primary === fusion.secondary) return null;
    return { primary: fusion.primary, secondary: fusion.secondary };
  }

  function createGame(options) {
    options = options || {};
    var deck = normalizeDeck(options.deck);
    var fusion = normalizeFusion(options.fusion);
    var allParams = normalizeParams(options.deckParams);
    var deckParams = normalizeDeckParams(options.deckParams, deck);
    if (fusion) {
      if (PARAM_SPECS[fusion.primary]) deckParams[fusion.primary] = allParams[fusion.primary];
      if (PARAM_SPECS[fusion.secondary]) deckParams[fusion.secondary] = allParams[fusion.secondary];
    }
    var state = {
      rng: options.rng || Math.random,
      gameMode: options.mode === 'stress' ? 'stress' : 'normal',
      fusion: fusion,
      deck: deck,
      deckParams: deckParams,
      width: 0,
      height: 0,
      top: 0,
      bottom: 0,
      headX: 0,
      y: 0,
      vy: 0,
      waveBaseY: 0,
      mode: 'wave',
      modeTime: 0,
      time: 0,
      worldX: 0,
      speed: BASE_SPEED,
      score: 0,
      combo: 0,
      comboTimer: 0,
      maxCombo: 0,
      hp: MAX_HP,
      maxHp: MAX_HP,
      hitBonus: 0,
      comboWindow: COMBO_WINDOW,
      scoreMult: 1,
      bossHpReduction: 0,
      upgrades: {},
      lastDeckSwap: null,
      trail: [],
      rivals: [],
      items: [],
      allies: [],
      itemTimer: B.ITEM_FIRST_DELAY,
      multi: 0,
      multiTimer: 0,
      events: [],
      over: false,
      deathCause: null,
      spawnTimer: 0.9,
      hits: 0,
      misses: 0,
      stage: 1,
      stageHits: 0,
      stageTarget: 0,
      stageCleared: false,
      stageClearBonus: 0,
      boss: null,
      bossCooldown: 0
    };
    setBounds(state, options.width || 960, options.height || 560);
    resetRun(state);
    return state;
  }

  function resize(state, width, height) {
    if (!state) return state;
    setBounds(state, width, height);
    return state;
  }

  function setMode(state, key) {
    if (!state || state.over || !MODES[key]) return false;
    if (state.deck.indexOf(key) < 0) return false;
    if (key === 'fusion' && !state.fusion) return false;
    if (state.mode === key) return true;
    state.mode = key;
    state.modeTime = 0;
    state.vy = baseVy(state, key);
    state.waveBaseY = state.y;
    if (directMode(key)) setModeBase(state);
    return true;
  }

  function maxOffsetFor(r) {
    if (r.shape === 'sin') return r.amp;
    if (r.shape === 'parabola') return r.amp;
    return Math.abs(r.slope) * r.len / 2;
  }

  function shapeOffset(r, local) {
    var u = local / r.len;
    if (r.shape === 'sin') {
      return r.amp * Math.sin(u * Math.PI * r.waves + r.phase);
    }
    if (r.shape === 'parabola') {
      var v = u * 2 - 1;
      return r.dir * r.amp * (v * v - 0.5);
    }
    return r.slope * (local - r.len / 2);
  }

  function rivalY(r, local) {
    return r.baseY + shapeOffset(r, local);
  }

  function spawnRival(state, atX) {
    var d = difficulty(state);
    var rng = state.rng;
    var len = 190 + rng() * 90;
    var kind = Math.floor(rng() * 3);
    var r = {
      x: typeof atX === 'number' ? atX : state.width + 60,
      len: len,
      shape: 'sin',
      family: 'wave',
      baseY: 0,
      amp: 0,
      waves: 1,
      phase: 0,
      slope: 0,
      dir: 1,
      label: 'y = sin x',
      hit: false
    };

    if (kind === 0) {
      r.shape = 'sin';
      r.family = 'wave';
      r.amp = 38 + rng() * 34 + d * 12;
      r.waves = 1.1 + rng() * 1.1;
      r.phase = rng() * Math.PI * 2;
      r.label = 'y = sin x';
    } else if (kind === 1) {
      r.shape = 'parabola';
      r.family = 'quad';
      r.amp = 34 + rng() * 44 + d * 12;
      r.dir = rng() < 0.5 ? -1 : 1;
      r.label = 'y = x²';
    } else {
      r.shape = 'line';
      r.family = 'linear';
      r.slope = (rng() < 0.5 ? -1 : 1) * (0.10 + rng() * 0.24);
      r.label = r.slope < 0 ? 'y = -x/2' : 'y = x/2';
    }

    var margin = maxOffsetFor(r) + 26;
    var low = state.top + margin;
    var high = state.bottom - margin;
    if (high < low) {
      r.amp *= 0.5;
      r.slope *= 0.5;
      margin = maxOffsetFor(r) + 22;
      low = state.top + margin;
      high = state.bottom - margin;
    }
    r.baseY = low + rng() * Math.max(1, high - low);
    state.rivals.push(r);
    return r;
  }

  function spawnInterval(state) {
    var d = difficulty(state);
    return Math.max(0.82, 1.55 - 0.62 * d + state.rng() * 0.3);
  }

  function stageTargetFor(stage) {
    return B.STAGE_TARGET_BASE + stage * B.STAGE_TARGET_PER_STAGE;
  }

  function bossShapeFor(family, stage) {
    if (family === 'wave') {
      return { shape: 'sin', amp: 62 + stage * 6, waves: 1.5, slope: 0, dir: 1 };
    }
    if (family === 'quad') {
      return { shape: 'parabola', amp: 76 + stage * 7, waves: 1, slope: 0, dir: 1 };
    }
    return { shape: 'line', amp: 0, waves: 1, slope: 0.16 + stage * 0.012, dir: 1 };
  }

  function applyBossShape(boss, family, stage) {
    var shape = bossShapeFor(family, stage);
    boss.family = family;
    boss.shape = shape.shape;
    boss.amp = shape.amp;
    boss.waves = shape.waves;
    boss.slope = shape.slope;
    boss.dir = shape.dir;
  }

  function spawnBoss(state) {
    var familyIndex = (state.stage - 1) % BOSS_FAMILIES.length;
    var family = BOSS_FAMILIES[familyIndex];
    var centerY = (state.top + state.bottom) / 2;
    var hp = Math.max(B.BOSS_MIN_HP, B.BOSS_BASE_HP + state.stage * B.BOSS_HP_PER_STAGE - (state.bossHpReduction || 0));
    var boss = {
      x: state.width + 80,
      len: 500 + state.stage * 30,
      family: family,
      familyIndex: familyIndex,
      baseY: centerY,
      centerY: centerY,
      amp: 0,
      waves: 1,
      phase: 0,
      slope: 0,
      dir: 1,
      shape: 'sin',
      hp: hp,
      maxHp: hp,
      invuln: 0,
      flash: 0,
      hits: 0
    };
    applyBossShape(boss, family, state.stage);
    state.boss = boss;
    state.rivals = [];
    pushEvent(state, {
      type: 'bossSpawn',
      x: boss.x,
      y: boss.baseY,
      stage: state.stage,
      family: family,
      familyLabel: FAMILY_LABELS[family],
      hp: hp
    });
    return boss;
  }

  function clearStage(state, boss, hitX, hitY) {
    var bonus = Math.round(B.STAGE_CLEAR_SCORE * state.stage * (state.scoreMult || 1));
    state.stageCleared = true;
    state.stageClearBonus = bonus;
    state.score += bonus;
    state.boss = null;
    state.rivals = [];
    state.combo = 0;
    state.comboTimer = 0;
    state.multi = 0;
    state.multiTimer = 0;
    if (state.hp < state.maxHp) state.hp++;
    rotateDeck(state);
    pushEvent(state, {
      type: 'stageClear',
      x: hitX,
      y: hitY,
      stage: state.stage,
      bonus: bonus,
      score: state.score,
      weakness: boss ? boss.family : null
    });
  }

  function checkBossHits(state) {
    var boss = state.boss;
    if (!boss || state.stageCleared || boss.invuln > 0) return false;
    var trail = state.trail;
    for (var ti = trail.length - 1; ti >= 0; ti--) {
      var p = trail[ti];
      var local = p.x - boss.x;
      if (local < 0 || local > boss.len) continue;
      var by = rivalY(boss, local);
      if (Math.abs(p.y - by) > HIT_DIST + 2 + (state.hitBonus || 0)) continue;

      var m = crossMetrics(state, trail, ti, boss, local);
      var multi = registerMulti(state);
      var damage = 1 + (m.angle >= 50 ? 1 : 0) + (m.weak ? 1 : 0);
      boss.hp = Math.max(0, boss.hp - damage);
      boss.invuln = 0.32;
      boss.flash = 0.32;
      boss.hits++;
      state.hits++;

      state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
      state.comboTimer = state.comboWindow;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      var baseGain = 200 + (state.combo - 1) * 60;
      var gain = Math.round(baseGain * m.mult * m.weakMult * multi.mult * (state.scoreMult || 1));
      state.score += gain;
      var event = {
        type: 'bossHit',
        x: p.x,
        y: (p.y + by) / 2,
        gain: gain,
        combo: state.combo,
        damage: damage,
        angle: Math.round(m.angle),
        mult: Math.round(m.mult * 10) / 10,
        perfect: m.angle >= 70,
        weak: m.weak,
        weakMult: m.weakMult,
        playerFamily: m.playerFamily,
        weakness: boss.family,
        multi: multi.count,
        multiMult: Math.round(multi.mult * 100) / 100,
        bossHp: boss.hp,
        bossMaxHp: boss.maxHp
      };
      if (state.combo > 0 && state.combo % HEAL_COMBO === 0 && state.hp < state.maxHp) {
        state.hp++;
        event.heal = true;
      }
      pushEvent(state, event);

      if (boss.hits % 2 === 0) {
        boss.familyIndex = (boss.familyIndex + 1) % BOSS_FAMILIES.length;
        applyBossShape(boss, BOSS_FAMILIES[boss.familyIndex], state.stage);
        pushEvent(state, {
          type: 'bossShift',
          x: p.x,
          y: (p.y + by) / 2,
          family: boss.family,
          familyLabel: FAMILY_LABELS[boss.family]
        });
      }
      if (boss.hp <= 0) clearStage(state, boss, p.x, (p.y + by) / 2);
      return true;
    }
    return false;
  }

  function nextStage(state) {
    if (!state || !state.stageCleared) return false;
    state.stage++;
    state.stageHits = 0;
    state.stageTarget = stageTargetFor(state.stage);
    state.stageCleared = false;
    state.stageClearBonus = 0;
    state.lastDeckSwap = null;
    state.boss = null;
    state.bossCooldown = 0;
    state.rivals = [];
    state.trail = [];
    state.items = [];
    state.allies = [];
    state.itemTimer = state.gameMode === 'stress' ? 2.0 : B.ITEM_FIRST_DELAY;
    state.multi = 0;
    state.multiTimer = 0;
    state.y = (state.top + state.bottom) / 2;
    state.mode = state.deck[0];
    state.modeTime = 0;
    state.vy = baseVy(state, state.mode);
    state.waveBaseY = state.y;
    if (directMode(state.mode)) setModeBase(state);
    state.combo = 0;
    state.comboTimer = 0;
    state.spawnTimer = 1.0;
    state.hp = Math.min(state.maxHp, state.hp + 1);
    pushEvent(state, { type: 'stageStart', stage: state.stage });
    return true;
  }

  /* 通常敵とボスで共通の交差角度・弱点・倍率を計算する */
  function crossMetrics(state, trail, ti, target, local) {
    var p = trail[ti];
    var prev = trail[ti - 1] || trail[ti + 1];
    var playerSlope = 0;
    if (prev && Math.abs(p.x - prev.x) > 0.001) {
      playerSlope = (p.y - prev.y) / (p.x - prev.x);
    }
    var localA = Math.max(0, local - 3);
    var localB = Math.min(target.len, local + 3);
    var targetSlope = (shapeOffset(target, localB) - shapeOffset(target, localA)) /
      Math.max(1, localB - localA);
    var angle = Math.atan(Math.abs((playerSlope - targetSlope) / (1 + playerSlope * targetSlope)));
    var playerFamily = modeFamily(p.mode || state.mode);
    var weak = !!(target.family && target.family !== 'none' && playerFamily === target.family);
    return {
      p: p,
      angle: angle * 180 / Math.PI,
      mult: 1 + 0.8 * (angle / (Math.PI / 2)),
      playerFamily: playerFamily,
      weak: weak,
      weakMult: weak ? 1.5 : 1
    };
  }

  function registerStageProgress(state) {
    if (state.gameMode === 'stress') return;
    if (!state.boss && !state.stageCleared && state.stageHits < state.stageTarget) {
      state.stageHits++;
      if (state.stageHits >= state.stageTarget) {
        state.bossCooldown = 1.2;
        pushEvent(state, { type: 'bossIncoming', stage: state.stage });
      }
    }
  }

  function registerMulti(state) {
    state.multi = state.multiTimer > 0 ? Math.min(B.MULTI_MAX, state.multi + 1) : 1;
    state.multiTimer = B.MULTI_WINDOW;
    return {
      count: state.multi,
      mult: 1 + B.MULTI_STEP * (state.multi - 1)
    };
  }

  function spawnItem(state) {
    var r = rand(state.rng);
    var type = r < 0.5 ? 'graph' : (r < 0.75 ? 'life' : 'score');
    var margin = 64;
    var y = state.top + margin + rand(state.rng) * Math.max(1, (state.bottom - margin) - (state.top + margin));
    state.items.push({
      x: state.width + 60,
      y: y,
      type: type,
      r: B.ITEM_RADIUS,
      phase: rand(state.rng) * Math.PI * 2
    });
  }

  function spawnAlly(state) {
    var x0 = Math.max(0, state.headX - 120);
    var x1 = state.width;
    var centerY = (state.top + state.bottom) / 2;
    var ally = {
      x0: x0,
      x1: x1,
      baseY: centerY + (rand(state.rng) * 2 - 1) * 40,
      amp: 35 + rand(state.rng) * 45,
      freq: 0.8 + rand(state.rng) * 1.3,
      phase: rand(state.rng) * Math.PI * 2,
      slope: (rand(state.rng) < 0.5 ? -1 : 1) * (0.05 + rand(state.rng) * 0.08),
      life: B.ALLY_LIFESPAN,
      maxLife: B.ALLY_LIFESPAN,
      age: 0,
      cooldown: 0
    };
    if (state.allies.length >= B.ALLY_MAX) state.allies.shift();
    state.allies.push(ally);
    pushEvent(state, {
      type: 'allySpawn',
      x: (ally.x0 + ally.x1) / 2,
      y: ally.baseY,
      life: B.ALLY_LIFESPAN
    });
    return ally;
  }

  function allyY(ally, x, age) {
    var t = age || 0;
    var mid = (ally.x0 + ally.x1) / 2;
    var bob = Math.sin(t * 1.8 + ally.phase) * 26;
    var wavePhase = ally.phase + t * 1.2;
    return ally.baseY + bob + ally.amp * Math.sin(ally.freq * (x - ally.x0) + wavePhase) +
      ally.slope * (x - mid);
  }

  function allyCrossRival(ally, rival, age) {
    var xStart = Math.max(ally.x0, rival.x);
    var xEnd = Math.min(ally.x1, rival.x + rival.len);
    if (xEnd <= xStart) return null;
    for (var i = 0; i <= 24; i++) {
      var x = xStart + (xEnd - xStart) * i / 24;
      var ry = rivalY(rival, x - rival.x);
      var ay = allyY(ally, x, age);
      if (Math.abs(ry - ay) <= B.ALLY_HIT_DIST) return { x: x, y: (ry + ay) / 2 };
    }
    return null;
  }

  function allyCrossBoss(ally, boss, age) {
    var xStart = Math.max(ally.x0, boss.x);
    var xEnd = Math.min(ally.x1, boss.x + boss.len);
    if (xEnd <= xStart) return null;
    for (var i = 0; i <= 32; i++) {
      var x = xStart + (xEnd - xStart) * i / 32;
      var by = rivalY(boss, x - boss.x);
      var ay = allyY(ally, x, age);
      if (Math.abs(by - ay) <= B.ALLY_HIT_DIST) return { x: x, y: (by + ay) / 2 };
    }
    return null;
  }

  function pickupItems(state) {
    for (var i = state.items.length - 1; i >= 0; i--) {
      var item = state.items[i];
      var hit = null;
      for (var ti = 0; ti < state.trail.length; ti++) {
        var p = state.trail[ti];
        if (Math.abs(p.x - item.x) <= item.r + 10 && Math.abs(p.y - item.y) <= item.r + 10) {
          hit = p;
          break;
        }
      }
      if (!hit) continue;
      var event = { type: 'itemPickup', itemType: item.type, x: item.x, y: item.y };
      if (item.type === 'graph') {
        spawnAlly(state);
      } else if (item.type === 'life') {
        state.hp = Math.min(state.maxHp, state.hp + 1);
      } else {
        state.score += Math.round(B.ITEM_SCORE * (state.scoreMult || 1));
      }
      pushEvent(state, event);
      state.items.splice(i, 1);
    }
  }

  function checkAllies(state, dt) {
    for (var ai = state.allies.length - 1; ai >= 0; ai--) {
      var ally = state.allies[ai];
      ally.life -= dt;
      ally.age += dt;
      ally.cooldown = Math.max(0, ally.cooldown - dt);
      if (ally.life <= 0) {
        state.allies.splice(ai, 1);
        continue;
      }
      for (var ri = state.rivals.length - 1; ri >= 0; ri--) {
        var r = state.rivals[ri];
        var hit = allyCrossRival(ally, r, ally.age);
        if (hit) {
          state.rivals.splice(ri, 1);
          state.hits++;
          registerStageProgress(state);
          var gain = Math.round(B.ALLY_SCORE * (state.scoreMult || 1));
          state.score += gain;
          pushEvent(state, { type: 'allyHit', x: hit.x, y: hit.y, gain: gain });
        }
      }
      if (state.boss && ally.cooldown <= 0) {
        var bhit = allyCrossBoss(ally, state.boss, ally.age);
        if (bhit) {
          var boss = state.boss;
          boss.hp = Math.max(0, boss.hp - 1);
          state.hits++;
          boss.flash = 0.32;
          ally.cooldown = B.ALLY_BOSS_COOLDOWN;
          var bgain = Math.round(B.ALLY_SCORE * 1.5 * (state.scoreMult || 1));
          state.score += bgain;
          pushEvent(state, {
            type: 'allyBossHit',
            x: bhit.x,
            y: bhit.y,
            gain: bgain,
            bossHp: boss.hp,
            bossMaxHp: boss.maxHp
          });
          if (boss.hp <= 0) {
            clearStage(state, boss, bhit.x, bhit.y);
            return;
          }
        }
      }
    }
  }

  function checkHits(state) {
    var trail = state.trail;
    for (var ri = state.rivals.length - 1; ri >= 0; ri--) {
      var r = state.rivals[ri];
      if (r.hit) continue;
      for (var ti = trail.length - 1; ti >= 0; ti--) {
        var p = trail[ti];
        var local = p.x - r.x;
        if (local < 0 || local > r.len) continue;
        var ry = rivalY(r, local);
        if (Math.abs(p.y - ry) <= HIT_DIST + (state.hitBonus || 0)) {
          r.hit = true;
          state.hits++;
          registerStageProgress(state);
          state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
          state.comboTimer = state.comboWindow;
          if (state.combo > state.maxCombo) state.maxCombo = state.combo;
          var m = crossMetrics(state, trail, ti, r, local);
          var multi = registerMulti(state);
          var baseGain = 100 + (state.combo - 1) * 50;
          var gain = Math.round(baseGain * m.mult * m.weakMult * multi.mult * (state.scoreMult || 1));
          state.score += gain;
          var event = {
            type: 'hit',
            x: p.x,
            y: (p.y + ry) / 2,
            gain: gain,
            combo: state.combo,
            angle: Math.round(m.angle),
            mult: Math.round(m.mult * 10) / 10,
            perfect: m.angle >= 70,
            weak: m.weak,
            weakMult: m.weakMult,
            playerFamily: m.playerFamily,
            weakness: r.family,
            multi: multi.count,
            multiMult: Math.round(multi.mult * 100) / 100,
            label: r.label
          };
          if (state.combo > 0 && state.combo % HEAL_COMBO === 0 && state.hp < state.maxHp) {
            state.hp++;
            event.heal = true;
          }
          pushEvent(state, event);
          state.rivals.splice(ri, 1);
          break;
        }
      }
    }
  }

  function checkMisses(state) {
    for (var i = state.rivals.length - 1; i >= 0; i--) {
      var r = state.rivals[i];
      if (r.hit) {
        state.rivals.splice(i, 1);
        continue;
      }
      if (r.x + r.len < 0) {
        state.rivals.splice(i, 1);
        if (state.gameMode === 'stress') continue;
        state.misses++;
        state.combo = 0;
        state.comboTimer = 0;
        state.multi = 0;
        state.multiTimer = 0;
        state.hp--;
        pushEvent(state, {
          type: 'miss',
          x: 30,
          y: r.baseY,
          hp: state.hp,
          label: r.label
        });
        if (state.hp <= 0) {
          state.hp = 0;
          state.over = true;
          state.deathCause = 'miss';
          pushEvent(state, { type: 'over' });
          return;
        }
      }
    }
  }

  function update(state, dt) {
    if (!state || state.over || state.stageCleared) return state;
    dt = clamp(Number(dt) || 0, 0, MAX_DT);
    state.time += dt;
    state.speed = BASE_SPEED + Math.min(MAX_SPEED - BASE_SPEED, state.time * SPEED_RAMP);
    var dx = state.speed * dt;
    state.worldX += dx;

    state.modeTime += dt;
    if (state.mode === 'up') state.vy = -170;
    else if (state.mode === 'down') state.vy = 170;
    else if (state.mode === 'steepUp') state.vy = -320;
    else if (state.mode === 'steepDown') state.vy = 320;
    else if (state.mode === 'quad' || state.mode === 'quadDown') {
      var qp = state.deckParams[state.mode] || { a: 1, b: 0, p: 2 };
      var power = Math.max(2, Math.round(qp.p || 2));
      var powerTerm = 280 * (qp.a || 1) * power * Math.pow(state.modeTime, power - 1);
      var dir = state.mode === 'quadDown' ? 1 : -1;
      state.vy = clamp(dir * powerTerm + (qp.b || 0) * 120, -MAX_PLAYER_VY, MAX_PLAYER_VY);
    } else if (directMode(state.mode)) {
      state.y = state.waveBaseY + directOffset(state, state.mode, state.modeTime);
      state.vy = 0;
    } else state.vy = 0;

    state.y += state.vy * dt;
    var minY = state.top + PLAYER_HALF;
    var maxY = state.bottom - PLAYER_HALF;
    if (state.y < minY) { state.y = minY; state.vy = 0; }
    if (state.y > maxY) { state.y = maxY; state.vy = 0; }

    var i;
    for (i = 0; i < state.trail.length; i++) state.trail[i].x -= dx;
    while (state.trail.length && state.trail[0].x < -40) state.trail.shift();
    state.trail.push({ x: state.headX, y: state.y, mode: state.mode });

    for (i = 0; i < state.rivals.length; i++) state.rivals[i].x -= dx;
    for (i = state.items.length - 1; i >= 0; i--) {
      state.items[i].x -= dx;
      if (state.items[i].x < -30) state.items.splice(i, 1);
    }

    state.itemTimer -= dt;
    if (state.itemTimer <= 0) {
      spawnItem(state);
      state.itemTimer = state.gameMode === 'stress'
        ? 2.4 + rand(state.rng) * 2.0
        : B.ITEM_INTERVAL_MIN + rand(state.rng) * (B.ITEM_INTERVAL_MAX - B.ITEM_INTERVAL_MIN);
    }

    if (state.gameMode === 'stress') {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnRival(state);
        spawnRival(state);
        if (state.rng() < 0.45) spawnRival(state);
        state.spawnTimer = 0.32 + state.rng() * 0.28;
      }
    } else if (!state.boss && state.stageHits < state.stageTarget) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnRival(state);
        if (difficulty(state) > 0.35 && state.rng() < 0.30) spawnRival(state);
        state.spawnTimer = spawnInterval(state);
      }
    }

    if (state.gameMode !== 'stress' && !state.boss && state.stageHits >= state.stageTarget && !state.stageCleared) {
      state.bossCooldown -= dt;
      if (state.bossCooldown <= 0) spawnBoss(state);
    }

    if (state.boss) {
      var boss = state.boss;
      boss.invuln = Math.max(0, boss.invuln - dt);
      boss.flash = Math.max(0, boss.flash - dt);
      boss.x -= state.speed * 0.30 * dt;
      boss.baseY = boss.centerY + Math.sin(state.time * 1.2) * 26;
      if (boss.x + boss.len < -40) {
        state.boss = null;
        state.bossCooldown = 2.0;
        state.hp--;
        state.combo = 0;
        state.comboTimer = 0;
        state.multi = 0;
        state.multiTimer = 0;
        pushEvent(state, { type: 'bossEscape', hp: state.hp, stage: state.stage });
        if (state.hp <= 0) {
          state.hp = 0;
          state.over = true;
          state.deathCause = 'bossEscape';
          pushEvent(state, { type: 'over' });
          return state;
        }
      }
    }

    pickupItems(state);
    checkHits(state);
    checkMisses(state);
    if (state.over) return state;
    checkBossHits(state);
    if (state.over || state.stageCleared) return state;
    checkAllies(state, dt);
    if (state.over || state.stageCleared) return state;

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.comboTimer = 0;
        state.combo = 0;
      }
    }
    if (state.multiTimer > 0) {
      state.multiTimer -= dt;
      if (state.multiTimer <= 0) {
        state.multiTimer = 0;
        state.multi = 0;
      }
    }

    return state;
  }

  function rotateDeck(state) {
    if (!state || !state.deck.length) return null;
    var groups = {};
    for (var i = 0; i < state.deck.length; i++) {
      var key = state.deck[i];
      if (key === 'fusion') continue;
      var genre = MODES[key] ? MODES[key].genre : 'other';
      if (!groups[genre]) groups[genre] = { slots: [], candidates: [] };
      groups[genre].slots.push(i);
    }
    for (var m = 0; m < MODE_KEYS.length; m++) {
      var modeKey = MODE_KEYS[m];
      if (state.deck.indexOf(modeKey) >= 0) continue;
      var modeGenre = MODES[modeKey] ? MODES[modeKey].genre : 'other';
      if (groups[modeGenre]) groups[modeGenre].candidates.push(modeKey);
    }
    var genres = [];
    for (var g in groups) {
      if (Object.prototype.hasOwnProperty.call(groups, g) &&
        groups[g].slots.length > 0 && groups[g].candidates.length > 0) {
        genres.push(g);
      }
    }
    if (!genres.length) return null;
    var pickGenre = genres[Math.floor(rand(state.rng) * genres.length) % genres.length];
    var group = groups[pickGenre];
    var slot = group.slots[Math.floor(rand(state.rng) * group.slots.length) % group.slots.length];
    var oldKey = state.deck[slot];
    var newKey = group.candidates[Math.floor(rand(state.rng) * group.candidates.length) % group.candidates.length];
    state.deck[slot] = newKey;
    if (PARAM_SPECS[newKey]) {
      var all = normalizeParams(state.deckParams);
      state.deckParams[newKey] = all[newKey];
    }
    var swap = { oldKey: oldKey, newKey: newKey, slot: slot, genre: pickGenre };
    state.lastDeckSwap = swap;
    pushEvent(state, { type: 'deckSwap', oldKey: oldKey, newKey: newKey, slot: slot, genre: pickGenre });
    return swap;
  }

  function applyUpgrade(state, id) {
    if (!state || !state.stageCleared) return false;
    if (id === 'life') {
      if (state.maxHp >= B.UPGRADE_MAX_LIFE && state.hp >= state.maxHp) return false;
      state.maxHp = Math.min(B.UPGRADE_MAX_LIFE, state.maxHp + 1);
      state.hp = Math.min(state.maxHp, state.hp + 1);
    } else if (id === 'hit') {
      if (state.hitBonus >= B.UPGRADE_MAX_HIT_BONUS) return false;
      state.hitBonus = Math.min(B.UPGRADE_MAX_HIT_BONUS, state.hitBonus + B.UPGRADE_HIT_STEP);
    } else if (id === 'combo') {
      if (state.comboWindow >= B.UPGRADE_MAX_COMBO_WINDOW) return false;
      state.comboWindow = Math.min(B.UPGRADE_MAX_COMBO_WINDOW, Math.round((state.comboWindow + B.UPGRADE_COMBO_STEP) * 10) / 10);
    } else if (id === 'score') {
      if (state.scoreMult >= B.UPGRADE_MAX_SCORE_MULT) return false;
      state.scoreMult = Math.min(B.UPGRADE_MAX_SCORE_MULT, Math.round((state.scoreMult + B.UPGRADE_SCORE_STEP) * 10) / 10);
    } else if (id === 'boss') {
      if (state.bossHpReduction >= B.UPGRADE_MAX_BOSS_REDUCTION) return false;
      state.bossHpReduction = Math.min(B.UPGRADE_MAX_BOSS_REDUCTION, state.bossHpReduction + B.UPGRADE_BOSS_STEP);
    } else if (id === 'bonus') {
      state.score += Math.round(B.UPGRADE_BONUS_SCORE * (state.scoreMult || 1));
    } else if (id === 'slot') {
      if (state.deck.length >= 4 || state.deck.length >= MODE_KEYS.length) return false;
      var candidates = [];
      for (var i = 0; i < MODE_KEYS.length; i++) {
        if (state.deck.indexOf(MODE_KEYS[i]) < 0) candidates.push(MODE_KEYS[i]);
      }
      if (!candidates.length) return false;
      var key = candidates[Math.floor(rand(state.rng) * candidates.length) % candidates.length];
      state.deck.push(key);
      if (PARAM_SPECS[key]) {
        var all = normalizeParams(state.deckParams);
        state.deckParams[key] = all[key];
      }
    } else {
      return false;
    }
    state.upgrades[id] = (state.upgrades[id] || 0) + 1;
    return true;
  }

  function upgradeChoices(state) {
    var pool = [];
    if (state.maxHp < B.UPGRADE_MAX_LIFE || state.hp < state.maxHp) pool.push('life');
    if (state.hitBonus < B.UPGRADE_MAX_HIT_BONUS) pool.push('hit');
    if (state.comboWindow < B.UPGRADE_MAX_COMBO_WINDOW) pool.push('combo');
    if (state.scoreMult < B.UPGRADE_MAX_SCORE_MULT) pool.push('score');
    if (state.bossHpReduction < B.UPGRADE_MAX_BOSS_REDUCTION) pool.push('boss');
    if (state.deck.length < 4 && state.deck.length < MODE_KEYS.length) pool.push('slot');
    var picks = [];
    while (picks.length < 3 && pool.length) {
      var index = Math.floor(rand(state.rng) * pool.length) % pool.length;
      picks.push(pool.splice(index, 1)[0]);
    }
    if (!picks.length) picks.push('bonus');
    return picks;
  }

  function consumeEvents(state) {
    if (!state) return [];
    var events = state.events;
    state.events = [];
    return events;
  }

  function snapshot(state) {
    return {
      gameMode: state.gameMode,
      infiniteLives: state.gameMode === 'stress',
      score: state.score,
      combo: state.combo,
      maxCombo: state.maxCombo,
      hp: state.hp,
      maxHp: state.maxHp,
      mode: state.mode,
      modeLabel: MODES[state.mode].label,
      modeFamily: modeFamily(state.mode),
      modeFamilyLabel: FAMILY_LABELS[modeFamily(state.mode)],
      deck: state.deck.slice(),
      deckParams: JSON.parse(JSON.stringify(state.deckParams)),
      fusion: state.fusion ? { primary: state.fusion.primary, secondary: state.fusion.secondary } : null,
      x: Math.floor(state.worldX),
      time: state.time,
      over: state.over,
      deathCause: state.deathCause,
      hits: state.hits,
      misses: state.misses,
      rivals: state.rivals.length,
      trail: state.trail.length,
      stage: state.stage,
      stageHits: state.stageHits,
      stageTarget: state.stageTarget,
      stageCleared: state.stageCleared,
      stageClearBonus: state.stageClearBonus,
      multi: state.multi,
      multiTimer: state.multiTimer,
      allies: state.allies.length,
      items: state.items.length,
      hitBonus: state.hitBonus,
      comboWindow: state.comboWindow,
      scoreMult: state.scoreMult,
      bossHpReduction: state.bossHpReduction,
      upgrades: JSON.parse(JSON.stringify(state.upgrades)),
      lastDeckSwap: state.lastDeckSwap ? {
        oldKey: state.lastDeckSwap.oldKey,
        newKey: state.lastDeckSwap.newKey,
        slot: state.lastDeckSwap.slot
      } : null,
      boss: state.boss ? {
        hp: state.boss.hp,
        maxHp: state.boss.maxHp,
        family: state.boss.family,
        familyLabel: FAMILY_LABELS[state.boss.family],
        x: Math.round(state.boss.x)
      } : null
    };
  }

  return {
    MAX_HP: MAX_HP,
    MODES: MODES,
    MODE_KEYS: MODE_KEYS,
    DEFAULT_DECK: DEFAULT_DECK,
    FAMILY_LABELS: FAMILY_LABELS,
    WAVE_SHAPES: WAVE_SHAPES,
    waveShapeValue: waveShapeValue,
    allyY: allyY,
    PARAM_SPECS: PARAM_SPECS,
    normalizeParams: normalizeParams,
    normalizeDeckParams: normalizeDeckParams,
    modeFamily: modeFamily,
    COMBO_WINDOW: COMBO_WINDOW,
    HEAL_COMBO: HEAL_COMBO,
    createGame: createGame,
    resetRun: resetRun,
    resize: resize,
    setMode: setMode,
    update: update,
    nextStage: nextStage,
    applyUpgrade: applyUpgrade,
    upgradeChoices: upgradeChoices,
    rotateDeck: rotateDeck,
    stageTargetFor: stageTargetFor,
    consumeEvents: consumeEvents,
    snapshot: snapshot,
    rivalY: rivalY,
    difficulty: difficulty
  };
});
