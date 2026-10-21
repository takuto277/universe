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

  var MAX_HP = 3;
  var BASE_SPEED = 220;
  var MAX_SPEED = 380;
  var SPEED_RAMP = 2.2;
  var RAMP_TIME = 50;
  var PLAYER_HALF = 12;
  var HIT_DIST = 15;
  var COMBO_WINDOW = 2.6;
  var HEAL_COMBO = 5;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 120;

  var MODES = {
    hold: { key: 'hold', label: 'y = 0', note: 'キープ', color: '#a8bad8', family: 'none' },
    up: { key: 'up', label: 'y = x/2', note: 'ゆるく上へ', color: '#5ff0ff', family: 'linear' },
    down: { key: 'down', label: 'y = -x/2', note: 'ゆるく下へ', color: '#7ea9ff', family: 'linear' },
    steepUp: { key: 'steepUp', label: 'y = 2x', note: '急上昇', color: '#57e08a', family: 'linear' },
    steepDown: { key: 'steepDown', label: 'y = -2x', note: '急下降', color: '#ff9f6b', family: 'linear' },
    quad: { key: 'quad', label: 'y = x²', note: '上カーブ', color: '#ffd166', family: 'quad' },
    quadDown: { key: 'quadDown', label: 'y = -x²', note: '下カーブ', color: '#ff6b8a', family: 'quad' },
    wave: { key: 'wave', label: 'y = sin x', note: 'ウェーブ', color: '#ff7ad9', family: 'wave' }
  };
  var MODE_KEYS = ['hold', 'up', 'down', 'steepUp', 'steepDown', 'quad', 'quadDown', 'wave'];
  var DEFAULT_DECK = ['hold', 'up', 'down'];
  var DECK_SIZE = 3;
  var FAMILY_LABELS = { linear: '直線', quad: '2次', wave: '波', none: '—' };
  var PARAM_SPECS = {
    quad: { a: { min: 0.4, max: 2.0, step: 0.2, default: 1 } },
    quadDown: { a: { min: 0.4, max: 2.0, step: 0.2, default: 1 } },
    wave: {
      a: { min: 0.4, max: 2.0, step: 0.2, default: 1 },
      b: { min: 0.5, max: 2.5, step: 0.25, default: 1 }
    }
  };

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
    state.hp = MAX_HP;
    state.mode = state.deck[0];
    state.modeTime = 0;
    state.vy = 0;
    state.y = (state.top + state.bottom) / 2;
    state.trail = [];
    state.rivals = [];
    state.events = [];
    state.over = false;
    state.deathCause = null;
    state.spawnTimer = 0.9;
    state.hits = 0;
    state.misses = 0;

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

  function createGame(options) {
    options = options || {};
    var deck = normalizeDeck(options.deck);
    var state = {
      rng: options.rng || Math.random,
      deck: deck,
      deckParams: normalizeDeckParams(options.deckParams, deck),
      width: 0,
      height: 0,
      top: 0,
      bottom: 0,
      headX: 0,
      y: 0,
      vy: 0,
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
      trail: [],
      rivals: [],
      events: [],
      over: false,
      deathCause: null,
      spawnTimer: 0.9,
      hits: 0,
      misses: 0
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
    if (state.mode === key) return true;
    state.mode = key;
    state.modeTime = 0;
    if (key === 'up') state.vy = -170;
    else if (key === 'down') state.vy = 170;
    else if (key === 'steepUp') state.vy = -320;
    else if (key === 'steepDown') state.vy = 320;
    else state.vy = 0;
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
        if (Math.abs(p.y - ry) <= HIT_DIST) {
          r.hit = true;
          state.hits++;
          state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
          state.comboTimer = COMBO_WINDOW;
          if (state.combo > state.maxCombo) state.maxCombo = state.combo;
          var prev = trail[ti - 1] || trail[ti + 1];
          var playerSlope = 0;
          if (prev && Math.abs(p.x - prev.x) > 0.001) {
            playerSlope = (p.y - prev.y) / (p.x - prev.x);
          }
          var localA = Math.max(0, local - 3);
          var localB = Math.min(r.len, local + 3);
          var rivalSlope = (shapeOffset(r, localB) - shapeOffset(r, localA)) / Math.max(1, localB - localA);
          var angle = Math.atan(Math.abs((playerSlope - rivalSlope) / (1 + playerSlope * rivalSlope)));
          var angleDeg = angle * 180 / Math.PI;
          var mult = 1 + 0.8 * (angle / (Math.PI / 2));
          var playerMode = p.mode || state.mode;
          var playerFamily = modeFamily(playerMode);
          var weak = !!(r.family && r.family !== 'none' && playerFamily === r.family);
          var weakMult = weak ? 1.5 : 1;
          var baseGain = 100 + (state.combo - 1) * 50;
          var gain = Math.round(baseGain * mult * weakMult);
          state.score += gain;
          var event = {
            type: 'hit',
            x: p.x,
            y: (p.y + ry) / 2,
            gain: gain,
            combo: state.combo,
            angle: Math.round(angleDeg),
            mult: Math.round(mult * 10) / 10,
            perfect: angleDeg >= 70,
            weak: weak,
            weakMult: weakMult,
            playerFamily: playerFamily,
            weakness: r.family,
            label: r.label
          };
          if (state.combo > 0 && state.combo % HEAL_COMBO === 0 && state.hp < MAX_HP) {
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
        state.misses++;
        state.combo = 0;
        state.comboTimer = 0;
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
    if (!state || state.over) return state;
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
    else if (state.mode === 'quad') {
      var qa = (state.deckParams.quad && state.deckParams.quad.a) || 1;
      state.vy = clamp(state.vy - 560 * qa * dt, -420, 420);
    } else if (state.mode === 'quadDown') {
      var qda = (state.deckParams.quadDown && state.deckParams.quadDown.a) || 1;
      state.vy = clamp(state.vy + 560 * qda * dt, -420, 420);
    } else if (state.mode === 'wave') {
      var wp = state.deckParams.wave || { a: 1, b: 1 };
      state.vy = 285 * wp.a * Math.sin(state.modeTime * 4.2 * wp.b);
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

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnRival(state);
      if (difficulty(state) > 0.35 && state.rng() < 0.30) spawnRival(state);
      state.spawnTimer = spawnInterval(state);
    }

    checkHits(state);
    checkMisses(state);
    if (state.over) return state;

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.comboTimer = 0;
        state.combo = 0;
      }
    }

    return state;
  }

  function consumeEvents(state) {
    if (!state) return [];
    var events = state.events;
    state.events = [];
    return events;
  }

  function snapshot(state) {
    return {
      score: state.score,
      combo: state.combo,
      maxCombo: state.maxCombo,
      hp: state.hp,
      maxHp: MAX_HP,
      mode: state.mode,
      modeLabel: MODES[state.mode].label,
      modeFamily: modeFamily(state.mode),
      modeFamilyLabel: FAMILY_LABELS[modeFamily(state.mode)],
      deck: state.deck.slice(),
      deckParams: JSON.parse(JSON.stringify(state.deckParams)),
      x: Math.floor(state.worldX),
      time: state.time,
      over: state.over,
      deathCause: state.deathCause,
      hits: state.hits,
      misses: state.misses,
      rivals: state.rivals.length,
      trail: state.trail.length
    };
  }

  return {
    MAX_HP: MAX_HP,
    MODES: MODES,
    MODE_KEYS: MODE_KEYS,
    DEFAULT_DECK: DEFAULT_DECK,
    FAMILY_LABELS: FAMILY_LABELS,
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
    consumeEvents: consumeEvents,
    snapshot: snapshot,
    rivalY: rivalY,
    difficulty: difficulty
  };
});
