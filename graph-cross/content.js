/* content.js : 関数・係数・系統・強化の表示データ（UIとエンジンの唯一の定義元） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GraphContent = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MODES = {
    hold: { key: 'hold', label: 'y = 0', note: 'キープ', family: 'none' },
    up: { key: 'up', label: 'y = x/2', note: 'ゆるく上へ', family: 'linear' },
    down: { key: 'down', label: 'y = -x/2', note: 'ゆるく下へ', family: 'linear' },
    steepUp: { key: 'steepUp', label: 'y = 2x', note: '急上昇', family: 'linear' },
    steepDown: { key: 'steepDown', label: 'y = -2x', note: '急下降', family: 'linear' },
    quad: { key: 'quad', label: 'y = x²', note: '上カーブ', family: 'quad' },
    quadDown: { key: 'quadDown', label: 'y = -x²', note: '下カーブ', family: 'quad' },
    wave: { key: 'wave', label: 'y = sin x', note: 'ウェーブ', family: 'wave' }
  };
  var MODE_KEYS = ['hold', 'up', 'down', 'steepUp', 'steepDown', 'quad', 'quadDown', 'wave'];
  var DEFAULT_DECK = ['hold', 'up', 'down'];
  var DECK_SIZE = 3;

  var FAMILY_LABELS = { linear: '直線', quad: '累乗', wave: '波', none: '—' };
  var FAMILY_COLORS = { linear: '#5ff0ff', quad: '#ffd166', wave: '#ff7ad9', none: '#a8bad8' };

  var PARAM_SPECS = {
    quad: {
      a: { min: 0.4, max: 2.0, step: 0.2, default: 1 },
      b: { min: -1.5, max: 1.5, step: 0.1, default: 0 },
      p: { min: 2, max: 4, step: 1, default: 2 }
    },
    quadDown: {
      a: { min: 0.4, max: 2.0, step: 0.2, default: 1 },
      b: { min: -1.5, max: 1.5, step: 0.1, default: 0 },
      p: { min: 2, max: 4, step: 1, default: 2 }
    },
    wave: {
      a: { min: 0.4, max: 2.0, step: 0.2, default: 1 },
      b: { min: 0.5, max: 2.5, step: 0.25, default: 1 },
      c: { min: -3, max: 3, step: 0.2, default: 0 },
      shape: { min: 0, max: 4, step: 1, default: 0 }
    }
  };

  var WAVE_SHAPES = ['sin', 'cos', 'tri', 'soft', 'damp'];
  var WAVE_SHAPE_LABELS = ['サイン', 'コサイン', '三角波', '角丸スクエア', '減衰サイン'];
  var WAVE_SHAPE_DESCS = ['滑らかな上下', 'sinを位相ずらし', '折れ線で上下', '角を丸くした方形波', '時間とともに小さくなる'];

  var ITEM_INFO = {
    graph: { label: '非対称グラフ +1', short: 'G', color: '#b48cff' },
    life: { label: 'ライフ +1', short: '+', color: '#57e08a' },
    score: { label: 'スコア +500', short: 'S', color: '#ffd166' }
  };

  var UPGRADE_INFO = {
    life: { title: 'ライフ +1', desc: '最大ライフ+1 / 1回復' },
    hit: { title: '判定 +2', desc: '交差判定が広がる' },
    combo: { title: 'コンボ +0.8秒', desc: 'コンボが切れにくい' },
    score: { title: 'スコア +20%', desc: '獲得スコアアップ' },
    boss: { title: 'ボス HP -3', desc: '次のボスが弱体化' },
    slot: { title: '関数スロット +1', desc: '新しい関数を追加' },
    bonus: { title: 'スコア +3000', desc: '即時ボーナス' }
  };

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
      var fname = wshape === 4 ? 'damp·sin' : (WAVE_SHAPES[wshape] || 'sin');
      return 'y = ' + acoef + fname + '(' + inner + ')';
    }
    return MODES[key] ? MODES[key].label : '';
  }

  function modeColor(key) {
    var mode = MODES[key];
    return mode ? (FAMILY_COLORS[mode.family] || FAMILY_COLORS.none) : FAMILY_COLORS.none;
  }

  return {
    MODES: MODES,
    MODE_KEYS: MODE_KEYS,
    DEFAULT_DECK: DEFAULT_DECK,
    DECK_SIZE: DECK_SIZE,
    FAMILY_LABELS: FAMILY_LABELS,
    FAMILY_COLORS: FAMILY_COLORS,
    PARAM_SPECS: PARAM_SPECS,
    WAVE_SHAPES: WAVE_SHAPES,
    WAVE_SHAPE_LABELS: WAVE_SHAPE_LABELS,
    WAVE_SHAPE_DESCS: WAVE_SHAPE_DESCS,
    UPGRADE_INFO: UPGRADE_INFO,
    ITEM_INFO: ITEM_INFO,
    fmtNum: fmtNum,
    powLabel: powLabel,
    formatModeLabel: formatModeLabel,
    modeColor: modeColor
  };
});
