/* engine.js : ネオンスタックのコアロジック（UI非依存・描画非依存）
 *
 * ルール:
 *   - 左右に往復するブロックを落とし、下のブロックと重なった幅だけが残る
 *   - 中心付近で落とすと PERFECT。幅を維持し、コンボが伸びてボーナスが入る
 *   - 完全に外れたらゲームオーバー
 *   - 高さが増すほど移動速度が上がり、カメラが塔を追う
 *
 * 座標系はワールド座標。x は塔の中心が 0、y は地面が 0 で上向きに増える。
 * 画面への変換は game.js が cameraY を使って行う。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NeonStackEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BLOCK_WIDTH = 210;
  var BLOCK_HEIGHT = 28;
  var FIELD_HALF = 132;
  var BASE_SPEED = 205;
  var SPEED_RAMP = 9;
  var MAX_SPEED = 520;
  var PERFECT_RATIO = 0.035;
  var MIN_PERFECT = 3;
  var MIN_OVERLAP = 2.5;
  var MAX_DT = 0.05;
  var MAX_EVENTS = 80;
  var CAMERA_FOCUS = 0.42;

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function pushEvent(state, event) {
    if (state.events.length >= MAX_EVENTS) state.events.shift();
    state.events.push(event);
  }

  function blockHue(index) {
    return (196 + index * 7) % 360;
  }

  function perfectTolerance(width) {
    return Math.max(MIN_PERFECT, width * PERFECT_RATIO);
  }

  function spawnMoving(state) {
    var top = state.blocks[state.blocks.length - 1];
    var fromLeft = state.dropCount % 2 === 0;
    state.moving = {
      x: fromLeft ? -FIELD_HALF : FIELD_HALF,
      y: top.y + BLOCK_HEIGHT,
      w: top.w,
      hue: blockHue(state.blocks.length),
      dir: fromLeft ? 1 : -1
    };
    state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.height * SPEED_RAMP);
  }

  function reset(state) {
    state.blocks = [{
      x: 0,
      w: BLOCK_WIDTH,
      y: 0,
      hue: blockHue(0),
      perfect: false
    }];
    state.moving = null;
    state.debris = [];
    state.score = 0;
    state.height = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.perfects = 0;
    state.dropCount = 0;
    state.speed = BASE_SPEED;
    state.over = false;
    state.overReason = null;
    state.time = 0;
    state.cameraY = 0;
    state.events = [];
    state.lastDrop = null;
    spawnMoving(state);
    return state;
  }

  function createGame(options) {
    options = options || {};
    var state = {
      viewW: Math.max(240, Number(options.width) || 480),
      viewH: Math.max(240, Number(options.height) || 640)
    };
    reset(state);
    return state;
  }

  function resize(state, width, height) {
    if (!state) return state;
    state.viewW = Math.max(240, Number(width) || state.viewW);
    state.viewH = Math.max(240, Number(height) || state.viewH);
    return state;
  }

  function cameraTarget(state) {
    var focus = state.moving ? state.moving.y : (state.blocks[state.blocks.length - 1].y);
    return Math.max(0, focus - state.viewH * CAMERA_FOCUS);
  }

  function update(state, dt) {
    if (!state) return state;
    dt = clamp(Number(dt) || 0, 0, MAX_DT);
    state.time += dt;

    if (!state.over && state.moving) {
      state.moving.x += state.moving.dir * state.speed * dt;
      if (state.moving.x >= FIELD_HALF) {
        state.moving.x = FIELD_HALF;
        state.moving.dir = -1;
      } else if (state.moving.x <= -FIELD_HALF) {
        state.moving.x = -FIELD_HALF;
        state.moving.dir = 1;
      }
    }

    var target = cameraTarget(state);
    state.cameraY += (target - state.cameraY) * Math.min(1, dt * 7);

    for (var i = state.debris.length - 1; i >= 0; i--) {
      var d = state.debris[i];
      d.vy += 1500 * dt;
      d.y -= d.vy * dt;
      d.x += d.vx * dt;
      d.spin += d.spinV * dt;
      d.life -= dt;
      if (d.life <= 0 || d.y < state.cameraY - 260) state.debris.splice(i, 1);
    }

    return state;
  }

  function addDebris(state, x, y, w, vx, hue) {
    state.debris.push({
      x: x,
      y: y,
      w: w,
      h: BLOCK_HEIGHT,
      vx: vx,
      vy: 30,
      spin: 0,
      spinV: (vx >= 0 ? 1 : -1) * (1.2 + Math.random() * 1.6),
      hue: hue,
      life: 1.6
    });
  }

  /* ブロックを落とす。戻り値は判定結果で、state 自体も更新する。 */
  function drop(state) {
    if (!state || state.over || !state.moving) return null;

    var top = state.blocks[state.blocks.length - 1];
    var m = state.moving;
    var offset = m.x - top.x;
    var perfect = Math.abs(offset) <= perfectTolerance(top.w);
    var left = Math.max(m.x - m.w / 2, top.x - top.w / 2);
    var right = Math.min(m.x + m.w / 2, top.x + top.w / 2);
    var overlap = right - left;

    if (!perfect && overlap <= MIN_OVERLAP) {
      state.over = true;
      state.overReason = 'miss';
      state.moving = null;
      addDebris(state, m.x, m.y, m.w, offset >= 0 ? 90 : -90, blockHue(state.blocks.length));
      pushEvent(state, { type: 'miss', x: m.x, y: m.y, w: m.w, score: state.score });
      return {
        placed: false,
        perfect: false,
        over: true,
        gain: 0,
        combo: state.combo,
        width: 0,
        x: m.x
      };
    }

    var block;
    var gain;
    if (perfect) {
      block = {
        x: top.x,
        w: top.w,
        y: m.y,
        hue: blockHue(state.blocks.length),
        perfect: true
      };
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      state.perfects++;
      gain = 10 + 10 + state.combo * 5;
    } else {
      var width = overlap;
      var center = (left + right) / 2;
      block = {
        x: center,
        w: width,
        y: m.y,
        hue: blockHue(state.blocks.length),
        perfect: false
      };
      var cutWidth = m.w - width;
      if (cutWidth > 0.5) {
        var cutX = offset > 0 ? right + cutWidth / 2 : left - cutWidth / 2;
        addDebris(state, cutX, m.y, cutWidth, offset > 0 ? 70 : -70, block.hue);
      }
      state.combo = 0;
      gain = 10;
    }

    state.blocks.push(block);
    state.height = state.blocks.length - 1;
    state.score += gain;
    state.lastDrop = {
      perfect: perfect,
      gain: gain,
      combo: state.combo,
      width: block.w,
      offset: offset
    };
    pushEvent(state, {
      type: 'place',
      x: block.x,
      y: block.y,
      w: block.w,
      perfect: perfect,
      combo: state.combo,
      gain: gain
    });

    state.dropCount++;
    spawnMoving(state);

    return {
      placed: true,
      perfect: perfect,
      over: false,
      gain: gain,
      combo: state.combo,
      width: block.w,
      x: block.x
    };
  }

  function consumeEvents(state) {
    if (!state) return [];
    var events = state.events;
    state.events = [];
    return events;
  }

  function snapshot(state) {
    if (!state) return null;
    var top = state.blocks[state.blocks.length - 1];
    return {
      score: state.score,
      height: state.height,
      combo: state.combo,
      maxCombo: state.maxCombo,
      perfects: state.perfects,
      speed: Math.round(state.speed),
      over: state.over,
      overReason: state.overReason,
      time: state.time,
      dropCount: state.dropCount,
      cameraY: state.cameraY,
      viewW: state.viewW,
      viewH: state.viewH,
      blocks: state.blocks.length,
      debris: state.debris.length,
      top: { x: top.x, w: top.w, y: top.y },
      moving: state.moving ? {
        x: state.moving.x,
        y: state.moving.y,
        w: state.moving.w,
        dir: state.moving.dir
      } : null,
      lastDrop: state.lastDrop ? {
        perfect: state.lastDrop.perfect,
        gain: state.lastDrop.gain,
        combo: state.lastDrop.combo,
        width: state.lastDrop.width,
        offset: state.lastDrop.offset
      } : null
    };
  }

  return {
    BLOCK_WIDTH: BLOCK_WIDTH,
    BLOCK_HEIGHT: BLOCK_HEIGHT,
    FIELD_HALF: FIELD_HALF,
    BASE_SPEED: BASE_SPEED,
    MAX_SPEED: MAX_SPEED,
    MIN_OVERLAP: MIN_OVERLAP,
    createGame: createGame,
    reset: reset,
    resize: resize,
    update: update,
    drop: drop,
    consumeEvents: consumeEvents,
    snapshot: snapshot,
    perfectTolerance: perfectTolerance,
    cameraTarget: cameraTarget
  };
});
