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

  function playerVy(state) {
    var key = state.mode;
    if (key === 'up') return -170;
    if (key === 'down') return 170;
    if (key === 'steepUp') return -320;
    if (key === 'steepDown') return 320;
    if (key === 'quad' || key === 'quadDown') {
      var q = state.deckParams[key] || { a: 1, b: 0, p: 2 };
      var power = Math.max(2, Math.round(q.p || 2));
      var dir = key === 'quadDown' ? 1 : -1;
      var powerTerm = 280 * (q.a || 1) * power * Math.pow(state.modeTime, power - 1);
      return clamp(dir * powerTerm + (q.b || 0) * 120, -MAX_PLAYER_VY, MAX_PLAYER_VY);
    }
    return 0;
  }

  function waveShapeValue(shape, theta, t) {
    if (shape === 1) return Math.cos(theta);
    if (shape === 2) return (2 / Math.PI) * Math.asin(Math.sin(theta));
    if (shape === 3) return Math.tanh(2.6 * Math.sin(theta));
    if (shape === 4) return Math.exp(-1.1 * Math.max(0, t)) * Math.sin(theta);
    if (shape === 5) return (2 / Math.PI) * Math.atan(Math.tan(theta / 2));
    if (shape === 6) return Math.sin(theta) >= 0 ? 1 : -1;
    if (shape === 7) return Math.sign(Math.sin(theta)) * Math.pow(Math.abs(Math.sin(theta)), 0.35);
    return Math.sin(theta);
  }

  function waveOffset(state, t) {
    var wp = state.deckParams.wave || { a: 1, b: 1, c: 0, shape: 0 };
    var shape = Math.max(0, Math.min(7, Math.round(wp.shape || 0)));
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

  function modePreview(key, params, fusion, count, maxT) {
    var n = Math.max(2, Math.round(count || 36));
    var span = maxT || 1.4;
    var temp = {
      top: 0,
      bottom: 520,
      deckParams: normalizeParams(params),
      fusion: normalizeFusion(fusion)
    };
    var points = [];
    for (var i = 0; i < n; i++) {
      var t = span * i / (n - 1);
      points.push({ x: i / (n - 1), y: modeOffset(temp, key, t) });
    }
    return points;
  }

  function normalizeUnlocked(unlocked) {
    var out = [];
    if (Array.isArray(unlocked)) {
      for (var i = 0; i < unlocked.length; i++) {
        var key = unlocked[i];
        if (MODES[key] && key !== 'fusion' && out.indexOf(key) < 0) out.push(key);
      }
    }
    if (!out.length) {
      for (var j = 0; j < MODE_KEYS.length; j++) out.push(MODE_KEYS[j]);
    }
    return out;
  }

  function normalizeDeck(deck, unlocked) {
    if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return DEFAULT_DECK.slice();
    var allowed = normalizeUnlocked(unlocked);
    var out = [];
    var seen = {};
    for (var i = 0; i < deck.length; i++) {
      var key = deck[i];
      if (!MODES[key] || seen[key]) return DEFAULT_DECK.slice();
      if (key !== 'fusion' && allowed.indexOf(key) < 0) return DEFAULT_DECK.slice();
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function rand(rng) { return (rng || Math.random)(); }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function stagePressure(state) {
    var stage = state.stage || 1;
    return Math.min(B.STAGE_DIFFICULTY_MAX, Math.max(0, stage - 1) * B.STAGE_DIFFICULTY_STEP);
  }

  function difficulty(state) {
    return clamp(state.time / RAMP_TIME + stagePressure(state), 0, 1);
  }

  function speedFor(state) {
    var stage = state.stage || 1;
    var stageSpeed = Math.min(B.STAGE_SPEED_MAX, Math.max(0, stage - 1) * B.STAGE_SPEED_STEP);
    return BASE_SPEED + Math.min(MAX_SPEED - BASE_SPEED, state.time * SPEED_RAMP + stageSpeed);
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

  function resetStageState(state, stage, options) {
    options = options || {};
    state.stage = stage;
    state.stageHits = 0;
    if (!options.keepStageTarget) state.stageTarget = stageTargetFor(stage);
    state.stageCleared = false;
    state.stageClearBonus = 0;
    state.lastDeckSwap = null;
    state.pendingDeckSwap = null;
    state.boss = null;
    state.bossCooldown = 0;
    state.rivals = [];
    state.trail = [];
    state.items = [];
    state.allies = [];
    state.itemTimer = state.gameMode === 'stress' ? 2.0 : B.ITEM_FIRST_DELAY;
    state.multi = 0;
    state.multiTimer = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.beamCooldown = 0;
    state.guardUsed = false;
    state.playerInvuln = 0;
    state.bossShots = [];
    state.jamTimers = [0, 0, 0, 0];
    state.y = (state.top + state.bottom) / 2;
    state.mode = state.deck[0];
    state.modeTime = 0;
    state.vy = playerVy(state);
    state.waveBaseY = state.y;
    if (directMode(state.mode)) setModeBase(state);
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
    state.events = [];
    state.over = false;
    state.deathCause = null;
    state.reviveUsed = false;
    state.spawnTimer = 0.9;
    state.hits = 0;
    state.misses = 0;
    resetStageState(state, 1, { keepStageTarget: state.gameMode === 'stress' });
    if (state.gameMode === 'stress') {
      state.spawnTimer = 0.12;
      return;
    }

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
    var unlocked = normalizeUnlocked(options.unlocked);
    var deck = normalizeDeck(options.deck, unlocked);
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
      unlocked: unlocked,
      width: 0,
      height: 0,
      top: 0,
      bottom: 0,
      headX: 0,
      stageTarget: 0
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
    var slot = state.deck.indexOf(key);
    if (state.jamTimers && state.jamTimers[slot] > 0) return false;
    if (state.mode === key) return true;
    state.mode = key;
    state.modeTime = 0;
    state.vy = playerVy(state);
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
      hit: false,
      hp: 1,
      maxHp: 1,
      invuln: 0,
      armor: false,
      splitter: false,
      jammer: false
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

    if (state.stage >= 2) {
      var specialChance = Math.min(
        B.ENEMY_SPECIAL_MAX,
        B.ENEMY_SPECIAL_BASE + (state.stage - 1) * B.ENEMY_SPECIAL_PER_STAGE
      );
      if (rng() < specialChance) {
        var pick = rng();
        if (pick < 0.4) {
          r.armor = true;
          r.hp = B.ARMOR_HP;
        } else if (pick < 0.72) {
          r.splitter = true;
        } else {
          r.jammer = true;
        }
      }
    }
    r.maxHp = r.hp;

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

  function spawnTutorialTarget(state) {
    if (!state) return null;
    var r = {
      x: state.headX - 120,
      len: 260,
      shape: 'line',
      family: 'linear',
      baseY: state.top + 70,
      amp: 0,
      waves: 1,
      phase: 0,
      slope: 0,
      dir: 1,
      label: 'y = x/2',
      hit: false,
      tutorial: true
    };
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
      hits: 0,
      phase: 1,
      attackTimer: B.BOSS_ATTACK_FIRST,
      attackIndex: 0,
      warning: null,
      beamTimer: 0,
      beamY: 0
    };
    applyBossShape(boss, family, state.stage);
    state.boss = boss;
    state.rivals = [];
    state.bossShots = [];
    state.playerInvuln = 0;
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
    state.bossShots = [];
    state.playerInvuln = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multi = 0;
    state.multiTimer = 0;
    if (state.hp < state.maxHp) state.hp++;
    state.lastDeckSwap = null;
    makeDeckSwapOffer(state);
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

  function bossPhaseFor(boss) {
    var ratio = boss && boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    if (ratio > 0.66) return 1;
    if (ratio > 0.33) return 2;
    return 3;
  }

  function bossCooldownFor(phase) {
    if (phase >= 3) return B.BOSS_COOLDOWN_P3;
    if (phase === 2) return B.BOSS_COOLDOWN_P2;
    return B.BOSS_COOLDOWN_P1;
  }

  function damagePlayer(state, x, y, cause) {
    if (!state || state.over || state.stageCleared) return false;
    if ((state.playerInvuln || 0) > 0) return false;
    state.hp--;
    state.playerInvuln = B.BOSS_PLAYER_INVULN;
    state.combo = 0;
    state.comboTimer = 0;
    state.multi = 0;
    state.multiTimer = 0;
    pushEvent(state, { type: 'playerHit', x: x, y: y, hp: state.hp, cause: cause });
    if (state.hp <= 0) {
      if (tryRevive(state, x, y)) return true;
      state.hp = 0;
      state.over = true;
      state.deathCause = 'bossAttack';
      pushEvent(state, { type: 'over' });
    }
    return true;
  }

  function startBossAttack(state, boss) {
    var phase = boss.phase || 1;
    var sequence = phase === 1 ? ['laser'] : (phase === 2 ? ['laser', 'shots'] : ['laser', 'shots', 'fan']);
    var kind = sequence[boss.attackIndex % sequence.length];
    boss.attackIndex++;
    boss.warning = {
      kind: kind,
      y: clamp(state.y, state.top + 10, state.bottom - 10),
      timer: B.BOSS_WARNING
    };
    pushEvent(state, {
      type: 'bossWarning',
      kind: kind,
      x: boss.x,
      y: boss.warning.y,
      phase: phase
    });
  }

  function executeBossAttack(state, boss) {
    var warning = boss.warning;
    if (!warning) return;
    boss.warning = null;
    if (warning.kind === 'laser') {
      boss.beamTimer = B.BOSS_LASER_TIME;
      boss.beamY = warning.y;
      pushEvent(state, { type: 'bossLaser', x: boss.x, y: warning.y });
      if (Math.abs(state.y - warning.y) <= B.BOSS_LASER_HALF) {
        damagePlayer(state, state.headX, warning.y, 'bossLaser');
      }
    } else {
      var dx = state.headX - boss.x;
      var dy = state.y - boss.baseY;
      var base = Math.atan2(dy, dx);
      var offsets = warning.kind === 'fan' ? [-0.22, 0, 0.22] : [-0.1, 0.1];
      var speed = B.BOSS_SHOT_SPEED + Math.max(0, state.stage - 1) * 6;
      for (var i = 0; i < offsets.length; i++) {
        var angle = base + offsets[i];
        state.bossShots.push({
          x: boss.x,
          y: boss.baseY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: B.BOSS_SHOT_LIFE,
          r: B.BOSS_SHOT_RADIUS,
          kind: warning.kind
        });
      }
      pushEvent(state, { type: 'bossShots', kind: warning.kind, x: boss.x, y: boss.baseY, count: offsets.length });
    }
    boss.attackTimer = bossCooldownFor(boss.phase || 1);
  }

  function updateBossShots(state, dt) {
    if (!state.bossShots) return;
    for (var i = state.bossShots.length - 1; i >= 0; i--) {
      var shot = state.bossShots[i];
      shot.life -= dt;
      if (shot.life <= 0) {
        state.bossShots.splice(i, 1);
        continue;
      }
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (shot.x < -40 || shot.x > state.width + 80 || shot.y < -50 || shot.y > state.height + 50) {
        state.bossShots.splice(i, 1);
        continue;
      }
      var hx = shot.x - state.headX;
      var hy = shot.y - state.y;
      var reach = shot.r + PLAYER_HALF;
      if (hx * hx + hy * hy <= reach * reach) {
        state.bossShots.splice(i, 1);
        damagePlayer(state, shot.x, shot.y, 'bossShot');
        if (state.over) return;
        continue;
      }
      var blocked = false;
      for (var ti = 0; ti < state.trail.length; ti++) {
        var p = state.trail[ti];
        var sx = shot.x - p.x;
        var sy = shot.y - p.y;
        var blockReach = shot.r + 7;
        if (sx * sx + sy * sy <= blockReach * blockReach) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        state.bossShots.splice(i, 1);
        var gain = Math.round(40 * (state.scoreMult || 1));
        state.score += gain;
        pushEvent(state, { type: 'shotBlocked', x: shot.x, y: shot.y, gain: gain });
      }
    }
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
      var damage = 1 + (m.angle >= 50 ? 1 : 0) + (m.weak ? 1 : 0) + (state.upgrades.bossBreaker ? 1 : 0);
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
      if (boss.hp > 0) {
        var nextPhase = bossPhaseFor(boss);
        if (nextPhase > boss.phase) {
          boss.phase = nextPhase;
          boss.invuln = Math.max(boss.invuln, B.BOSS_PHASE_INVULN);
          boss.warning = null;
          boss.beamTimer = 0;
          boss.attackTimer = 1.2;
          state.bossShots = [];
          boss.flash = 0.6;
          pushEvent(state, {
            type: 'bossPhase',
            phase: nextPhase,
            x: p.x,
            y: (p.y + by) / 2,
            hp: boss.hp,
            maxHp: boss.maxHp
          });
        }
      }
      if (boss.hp <= 0) clearStage(state, boss, p.x, (p.y + by) / 2);
      return true;
    }
    return false;
  }

  function nextStage(state) {
    if (!state || !state.stageCleared) return false;
    resetStageState(state, state.stage + 1);
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

  function pullItems(state, dt) {
    if (!state.upgrades || !state.upgrades.magnet || !state.items.length || !state.trail.length) return;
    var reach = B.MAGNET_RADIUS;
    for (var i = 0; i < state.items.length; i++) {
      var item = state.items[i];
      var best = null;
      var bestDist = Infinity;
      for (var ti = 0; ti < state.trail.length; ti++) {
        var p = state.trail[ti];
        var dx = item.x - p.x;
        var dy = item.y - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
      if (!best || bestDist > reach) continue;
      var move = Math.min(bestDist, B.MAGNET_SPEED * dt);
      if (bestDist > 0.001) {
        item.x += (best.x - item.x) / bestDist * move;
        item.y += (best.y - item.y) / bestDist * move;
      }
    }
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

  function spawnSplitChildren(state, r, x, y) {
    for (var i = 0; i < 2; i++) {
      var child = {
        x: x + (i === 0 ? -16 : 16),
        len: r.len * B.SPLIT_CHILD_SCALE,
        shape: r.shape,
        family: r.family,
        baseY: clamp(y + (i === 0 ? -26 : 26), state.top + 30, state.bottom - 30),
        amp: r.amp * 0.7,
        waves: r.waves,
        phase: r.phase + i * 0.9,
        slope: r.slope,
        dir: r.dir,
        label: r.label,
        hit: false,
        hp: 1,
        maxHp: 1,
        invuln: 0.2,
        armor: false,
        splitter: false,
        jammer: false
      };
      state.rivals.push(child);
    }
    pushEvent(state, { type: 'split', x: x, y: y, count: 2 });
  }

  function jamSlot(state, x, y) {
    if (!state.jamTimers) state.jamTimers = [0, 0, 0, 0];
    var candidates = [];
    for (var i = 0; i < state.deck.length; i++) {
      if (state.deck[i] !== state.mode) candidates.push(i);
    }
    if (!candidates.length) {
      for (i = 0; i < state.deck.length; i++) candidates.push(i);
    }
    var slot = candidates[Math.floor(rand(state.rng) * candidates.length) % candidates.length];
    state.jamTimers[slot] = B.JAM_TIME;
    pushEvent(state, {
      type: 'jam',
      x: x,
      y: y,
      slot: slot,
      key: state.deck[slot],
      time: B.JAM_TIME
    });
  }

  function checkHits(state) {
    var trail = state.trail;
    var beam = null;
    for (var ri = state.rivals.length - 1; ri >= 0; ri--) {
      var r = state.rivals[ri];
      if (r.hit || (r.invuln || 0) > 0) continue;
      for (var ti = trail.length - 1; ti >= 0; ti--) {
        var p = trail[ti];
        var local = p.x - r.x;
        if (local < 0 || local > r.len) continue;
        var ry = rivalY(r, local);
        if (Math.abs(p.y - ry) > HIT_DIST + (state.hitBonus || 0)) continue;

        var m = crossMetrics(state, trail, ti, r, local);
        var hp = typeof r.hp === 'number' ? r.hp : 1;
        var damage = 1 + (m.weak ? 1 : 0);
        if (r.armor && hp > damage) {
          r.hp = hp - damage;
          r.invuln = B.ARMOR_INVULN;
          pushEvent(state, {
            type: 'armorHit',
            x: p.x,
            y: (p.y + ry) / 2,
            hp: r.hp,
            maxHp: r.maxHp || B.ARMOR_HP
          });
          return true;
        }
        r.hit = true;
        state.hits++;
        registerStageProgress(state);
        state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
        state.comboTimer = state.comboWindow;
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;
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
          label: r.label,
          armor: !!r.armor,
          splitter: !!r.splitter,
          jammer: !!r.jammer
        };
        if (state.combo > 0 && state.combo % HEAL_COMBO === 0 && state.hp < state.maxHp) {
          state.hp++;
          event.heal = true;
        }
        pushEvent(state, event);
        if (r.splitter) spawnSplitChildren(state, r, p.x, (p.y + ry) / 2);
        if (r.jammer) jamSlot(state, p.x, (p.y + ry) / 2);
        state.rivals.splice(ri, 1);
        if (!beam && state.upgrades && state.upgrades.beam && (state.beamCooldown || 0) <= 0) {
          beam = { x: p.x, y: (p.y + ry) / 2 };
        }
        break;
      }
    }
    return beam;
  }

  function fireBeam(state, x, y) {
    if (!state.upgrades || !state.upgrades.beam || (state.beamCooldown || 0) > 0) return false;
    state.beamCooldown = B.BEAM_COOLDOWN;
    var kills = [];
    var gainTotal = 0;
    for (var i = state.rivals.length - 1; i >= 0; i--) {
      var r = state.rivals[i];
      if (r.hit) continue;
      if (x < r.x - 8 || x > r.x + r.len + 8) continue;
      state.rivals.splice(i, 1);
      state.hits++;
      registerStageProgress(state);
      var gain = Math.round(B.BEAM_SCORE * (state.scoreMult || 1));
      state.score += gain;
      gainTotal += gain;
      kills.push({ x: x, y: rivalY(r, clamp(x - r.x, 0, r.len)), gain: gain });
    }
    pushEvent(state, { type: 'beam', x: x, y: y, kills: kills, gain: gainTotal });
    return true;
  }

  function tryRevive(state, x, y) {
    if (!state.upgrades || !state.upgrades.revive || state.reviveUsed) return false;
    state.reviveUsed = true;
    state.hp = 1;
    state.combo = 0;
    state.comboTimer = 0;
    state.multi = 0;
    state.multiTimer = 0;
    state.rivals = [];
    state.bossShots = [];
    state.playerInvuln = 0;
    if (state.boss) {
      state.boss.warning = null;
      state.boss.attackTimer = Math.max(1.0, state.boss.attackTimer || 0);
    }
    pushEvent(state, { type: 'revive', x: x, y: y, hp: 1 });
    return true;
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
        var guarded = !!(state.upgrades.comboGuard && !state.guardUsed && state.combo > 0);
        if (guarded) {
          state.guardUsed = true;
          state.comboTimer = state.comboWindow;
          pushEvent(state, { type: 'guard', x: 30, y: r.baseY });
        } else {
          state.combo = 0;
          state.comboTimer = 0;
        }
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
          if (tryRevive(state, 30, r.baseY)) return;
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
    state.playerInvuln = Math.max(0, (state.playerInvuln || 0) - dt);
    if (state.jamTimers) {
      for (var ji = 0; ji < state.jamTimers.length; ji++) {
        if (state.jamTimers[ji] > 0) {
          state.jamTimers[ji] = Math.max(0, state.jamTimers[ji] - dt);
          if (state.jamTimers[ji] === 0) pushEvent(state, { type: 'jamEnd', slot: ji });
        }
      }
    }
    state.speed = speedFor(state);
    var dx = state.speed * dt;
    state.worldX += dx;

    state.modeTime += dt;
    if (directMode(state.mode)) {
      state.y = state.waveBaseY + directOffset(state, state.mode, state.modeTime);
      state.vy = 0;
    } else {
      state.vy = playerVy(state);
    }

    state.y += state.vy * dt;
    var minY = state.top + PLAYER_HALF;
    var maxY = state.bottom - PLAYER_HALF;
    if (state.y < minY) { state.y = minY; state.vy = 0; }
    if (state.y > maxY) { state.y = maxY; state.vy = 0; }

    var i;
    for (i = 0; i < state.trail.length; i++) state.trail[i].x -= dx;
    while (state.trail.length && state.trail[0].x < -40) state.trail.shift();
    state.trail.push({ x: state.headX, y: state.y, mode: state.mode });

    for (i = 0; i < state.rivals.length; i++) {
      if (!state.rivals[i].tutorial) state.rivals[i].x -= dx;
      if (state.rivals[i].invuln > 0) state.rivals[i].invuln = Math.max(0, state.rivals[i].invuln - dt);
    }
    for (i = state.items.length - 1; i >= 0; i--) {
      if (!state.items[i].stationary) {
        state.items[i].x -= dx;
        if (state.items[i].x < -30) state.items.splice(i, 1);
      }
    }
    pullItems(state, dt);

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
      boss.beamTimer = Math.max(0, (boss.beamTimer || 0) - dt);
      boss.x -= state.speed * B.BOSS_MOVE_RATE * dt;
      boss.baseY = boss.centerY + Math.sin(state.time * 1.2) * 26;
      if (boss.warning) {
        boss.warning.timer -= dt;
        if (boss.warning.timer <= 0) {
          executeBossAttack(state, boss);
          if (state.over) return state;
        }
      } else {
        boss.attackTimer -= dt;
        if (boss.attackTimer <= 0) startBossAttack(state, boss);
      }
      if (boss.x + boss.len < -40) {
        state.boss = null;
        state.bossShots = [];
        state.bossCooldown = 2.0;
        state.playerInvuln = 0;
        state.hp--;
        state.combo = 0;
        state.comboTimer = 0;
        state.multi = 0;
        state.multiTimer = 0;
        pushEvent(state, { type: 'bossEscape', hp: state.hp, stage: state.stage });
        if (state.hp <= 0) {
          if (tryRevive(state, state.width * 0.5, state.height * 0.5)) return state;
          state.hp = 0;
          state.over = true;
          state.deathCause = 'bossEscape';
          pushEvent(state, { type: 'over' });
          return state;
        }
      }
    }
    updateBossShots(state, dt);
    if (state.over) return state;

    state.beamCooldown = Math.max(0, (state.beamCooldown || 0) - dt);
    pickupItems(state);
    var beam = checkHits(state);
    if (beam) fireBeam(state, beam.x, beam.y);
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

  function deckSwapPlan(state, preferThree) {
    if (!state || !state.deck.length) return null;
    var groups = {};
    for (var i = 0; i < state.deck.length; i++) {
      var key = state.deck[i];
      if (key === 'fusion') continue;
      var genre = MODES[key] ? MODES[key].genre : 'other';
      if (!groups[genre]) groups[genre] = { slots: [], candidates: [] };
      groups[genre].slots.push(i);
    }
    var unlocked = normalizeUnlocked(state.unlocked);
    for (var m = 0; m < unlocked.length; m++) {
      var modeKey = unlocked[m];
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
    var eligible = genres;
    if (preferThree) {
      var rich = [];
      for (var r = 0; r < genres.length; r++) {
        if (groups[genres[r]].candidates.length >= 3) rich.push(genres[r]);
      }
      if (rich.length) eligible = rich;
    }
    var pickGenre = eligible[Math.floor(rand(state.rng) * eligible.length) % eligible.length];
    var group = groups[pickGenre];
    var slot = group.slots[Math.floor(rand(state.rng) * group.slots.length) % group.slots.length];
    return {
      genre: pickGenre,
      slot: slot,
      oldKey: state.deck[slot],
      candidates: group.candidates.slice()
    };
  }

  function commitDeckSwap(state, plan, newKey) {
    state.deck[plan.slot] = newKey;
    if (PARAM_SPECS[newKey]) {
      var all = normalizeParams(state.deckParams);
      state.deckParams[newKey] = all[newKey];
    }
    var swap = { oldKey: plan.oldKey, newKey: newKey, slot: plan.slot, genre: plan.genre };
    state.lastDeckSwap = swap;
    state.pendingDeckSwap = null;
    pushEvent(state, { type: 'deckSwap', oldKey: swap.oldKey, newKey: newKey, slot: swap.slot, genre: swap.genre });
    return swap;
  }

  function rotateDeck(state) {
    var plan = deckSwapPlan(state);
    if (!plan) return null;
    var index = Math.floor(rand(state.rng) * plan.candidates.length) % plan.candidates.length;
    return commitDeckSwap(state, plan, plan.candidates[index]);
  }

  function makeDeckSwapOffer(state) {
    var plan = deckSwapPlan(state, true);
    if (!plan) {
      state.pendingDeckSwap = null;
      return null;
    }
    var pool = plan.candidates.slice();
    var choices = [];
    while (choices.length < 3 && pool.length) {
      var index = Math.floor(rand(state.rng) * pool.length) % pool.length;
      choices.push(pool.splice(index, 1)[0]);
    }
    var offer = { slot: plan.slot, oldKey: plan.oldKey, genre: plan.genre, choices: choices };
    state.pendingDeckSwap = offer;
    return offer;
  }

  function applyDeckSwap(state, newKey) {
    var offer = state && state.pendingDeckSwap;
    if (!offer || offer.choices.indexOf(newKey) < 0) return null;
    return commitDeckSwap(state, offer, newKey);
  }

  function slotCandidates(state) {
    var out = [];
    if (!state || state.deck.length >= 4 || state.deck.length >= MODE_KEYS.length) return out;
    var unlocked = normalizeUnlocked(state.unlocked);
    for (var i = 0; i < unlocked.length; i++) {
      if (state.deck.indexOf(unlocked[i]) < 0) out.push(unlocked[i]);
    }
    return out;
  }

  function slotChoices(state) {
    var pool = slotCandidates(state);
    var picks = [];
    while (picks.length < 3 && pool.length) {
      var index = Math.floor(rand(state.rng) * pool.length) % pool.length;
      picks.push(pool.splice(index, 1)[0]);
    }
    return picks;
  }

  function applyUpgrade(state, id, choice) {
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
    } else if (id === 'beam') {
      if (state.upgrades.beam) return false;
    } else if (id === 'magnet') {
      if (state.upgrades.magnet) return false;
    } else if (id === 'revive') {
      if (state.upgrades.revive) return false;
    } else if (id === 'comboGuard') {
      if (state.upgrades.comboGuard) return false;
    } else if (id === 'bossBreaker') {
      if (state.upgrades.bossBreaker) return false;
    } else if (id === 'slot') {
      var candidates = slotCandidates(state);
      if (!candidates.length) return false;
      var key = choice && candidates.indexOf(choice) >= 0
        ? choice
        : candidates[Math.floor(rand(state.rng) * candidates.length) % candidates.length];
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
    if (!state.upgrades.beam) pool.push('beam');
    if (!state.upgrades.magnet) pool.push('magnet');
    if (!state.upgrades.revive) pool.push('revive');
    if (!state.upgrades.comboGuard) pool.push('comboGuard');
    if (!state.upgrades.bossBreaker) pool.push('bossBreaker');
    if (state.deck.length < 4 && slotCandidates(state).length > 0) pool.push('slot');
    var picks = [];
    while (picks.length < 3 && pool.length) {
      var index = Math.floor(rand(state.rng) * pool.length) % pool.length;
      picks.push(pool.splice(index, 1)[0]);
    }
    if (!picks.length) picks.push('bonus');
    return picks;
  }

  function makeCheckpoint(state) {
    if (!state) return null;
    return {
      gameMode: state.gameMode,
      unlocked: state.unlocked.slice(),
      deck: state.deck.slice(),
      deckParams: clone(state.deckParams),
      fusion: state.fusion ? { primary: state.fusion.primary, secondary: state.fusion.secondary } : null,
      stage: state.stage,
      stageTarget: state.stageTarget,
      score: state.score,
      hp: state.hp,
      maxHp: state.maxHp,
      hitBonus: state.hitBonus,
      comboWindow: state.comboWindow,
      scoreMult: state.scoreMult,
      bossHpReduction: state.bossHpReduction,
      upgrades: clone(state.upgrades),
      maxCombo: state.maxCombo,
      hits: state.hits,
      misses: state.misses,
      reviveUsed: !!state.reviveUsed,
      time: state.time,
      worldX: state.worldX
    };
  }

  function restoreCheckpoint(checkpoint, options) {
    if (!checkpoint) return null;
    options = options || {};
    var g = createGame({
      width: options.width || 960,
      height: options.height || 560,
      unlocked: checkpoint.unlocked,
      deck: checkpoint.deck,
      deckParams: checkpoint.deckParams,
      fusion: checkpoint.fusion,
      mode: checkpoint.gameMode,
      rng: options.rng
    });
    g.deck = checkpoint.deck.slice();
    g.deckParams = normalizeParams(checkpoint.deckParams || {});
    g.fusion = normalizeFusion(checkpoint.fusion);
    resetStageState(g, checkpoint.stage || 1);
    g.stageTarget = checkpoint.stageTarget || stageTargetFor(g.stage);
    g.score = checkpoint.score || 0;
    g.maxHp = checkpoint.maxHp || MAX_HP;
    g.hp = Math.max(1, Math.min(g.maxHp, checkpoint.hp == null ? g.maxHp : checkpoint.hp));
    g.hitBonus = checkpoint.hitBonus || 0;
    g.comboWindow = checkpoint.comboWindow || COMBO_WINDOW;
    g.scoreMult = checkpoint.scoreMult || 1;
    g.bossHpReduction = checkpoint.bossHpReduction || 0;
    g.upgrades = clone(checkpoint.upgrades || {});
    g.maxCombo = checkpoint.maxCombo || 0;
    g.hits = checkpoint.hits || 0;
    g.misses = checkpoint.misses || 0;
    g.reviveUsed = !!checkpoint.reviveUsed;
    g.time = checkpoint.time || 0;
    g.worldX = checkpoint.worldX || 0;
    g.speed = speedFor(g);
    g.events = [];
    g.over = false;
    g.deathCause = null;
    g.spawnTimer = 1.0;
    return g;
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
      deckParams: clone(state.deckParams),
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
      jamTimers: (state.jamTimers || []).slice(),
      hitBonus: state.hitBonus,
      comboWindow: state.comboWindow,
      scoreMult: state.scoreMult,
      bossHpReduction: state.bossHpReduction,
      upgrades: clone(state.upgrades),
      lastDeckSwap: state.lastDeckSwap ? {
        oldKey: state.lastDeckSwap.oldKey,
        newKey: state.lastDeckSwap.newKey,
        slot: state.lastDeckSwap.slot
      } : null,
      deckSwapOffer: state.pendingDeckSwap ? {
        oldKey: state.pendingDeckSwap.oldKey,
        genre: state.pendingDeckSwap.genre,
        slot: state.pendingDeckSwap.slot,
        choices: state.pendingDeckSwap.choices.slice()
      } : null,
      boss: state.boss ? {
        hp: state.boss.hp,
        maxHp: state.boss.maxHp,
        phase: state.boss.phase || 1,
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
    modePreview: modePreview,
    allyY: allyY,
    PARAM_SPECS: PARAM_SPECS,
    normalizeParams: normalizeParams,
    normalizeDeckParams: normalizeDeckParams,
    modeFamily: modeFamily,
    COMBO_WINDOW: COMBO_WINDOW,
    HEAL_COMBO: HEAL_COMBO,
    createGame: createGame,
    spawnTutorialTarget: spawnTutorialTarget,
    resetRun: resetRun,
    resize: resize,
    setMode: setMode,
    update: update,
    nextStage: nextStage,
    makeCheckpoint: makeCheckpoint,
    restoreCheckpoint: restoreCheckpoint,
    applyUpgrade: applyUpgrade,
    upgradeChoices: upgradeChoices,
    slotChoices: slotChoices,
    rotateDeck: rotateDeck,
    applyDeckSwap: applyDeckSwap,
    stageTargetFor: stageTargetFor,
    consumeEvents: consumeEvents,
    snapshot: snapshot,
    rivalY: rivalY,
    difficulty: difficulty
  };
});
