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
    hold: { key: 'hold', label: 'y = 0', note: 'キープ', noteEn: 'Keep', family: 'none', rarity: 'common', genre: 'other' },
    up: { key: 'up', label: 'y = x/2', note: 'ゆるく上へ', noteEn: 'Drift Up', family: 'linear', rarity: 'common', genre: 'up' },
    down: { key: 'down', label: 'y = -x/2', note: 'ゆるく下へ', noteEn: 'Drift Down', family: 'linear', rarity: 'common', genre: 'down' },
    steepUp: { key: 'steepUp', label: 'y = 2x', note: '急上昇', noteEn: 'Fast Up', family: 'linear', rarity: 'uncommon', genre: 'up' },
    steepDown: { key: 'steepDown', label: 'y = -2x', note: '急下降', noteEn: 'Fast Down', family: 'linear', rarity: 'uncommon', genre: 'down' },
    quad: { key: 'quad', label: 'y = x²', note: '上カーブ', noteEn: 'Curve Up', family: 'quad', rarity: 'uncommon', genre: 'up' },
    quadDown: { key: 'quadDown', label: 'y = -x²', note: '下カーブ', noteEn: 'Curve Down', family: 'quad', rarity: 'uncommon', genre: 'down' },
    wave: { key: 'wave', label: 'y = sin x', note: 'ウェーブ', noteEn: 'Wave', family: 'wave', rarity: 'rare', genre: 'other' },
    expo: { key: 'expo', label: 'y = e^x - 1', note: '指数カーブ', noteEn: 'Exponential', family: 'quad', rarity: 'rare', genre: 'up' },
    log: { key: 'log', label: 'y = ln(x+1)', note: '対数カーブ', noteEn: 'Logarithm', family: 'quad', rarity: 'rare', genre: 'up' },
    sigmoid: { key: 'sigmoid', label: 'y = sigmoid(x)', note: 'Sカーブ', noteEn: 'S-Curve', family: 'wave', rarity: 'epic', genre: 'up' },
    gauss: { key: 'gauss', label: 'y = e^{-x²}', note: '山カーブ', noteEn: 'Peak', family: 'wave', rarity: 'epic', genre: 'other' },
    easeDown: { key: 'easeDown', label: 'y = -1 + e^{-x}', note: '減速下降', noteEn: 'Ease Down', family: 'quad', rarity: 'rare', genre: 'down' },
    fusion: { key: 'fusion', label: 'y = fusion', note: '2関数の合成', noteEn: 'Fusion', family: 'none', rarity: 'legendary', genre: 'other', color: '#b48cff' }
  };
  var MODE_KEYS = ['hold', 'up', 'down', 'steepUp', 'steepDown', 'quad', 'quadDown', 'wave', 'expo', 'log', 'sigmoid', 'gauss', 'easeDown'];
  var DEFAULT_DECK = ['hold', 'up', 'down'];
  var DECK_SIZE = 3;

  var FAMILY_LABELS = { linear: '直線', quad: '累乗', wave: '波', none: '—' };
  var FAMILY_LABELS_EN = { linear: 'LINEAR', quad: 'QUAD', wave: 'WAVE', none: '—' };
  var GENRE_LABELS = { up: '上昇', down: '下降', other: 'その他' };
  var GENRE_LABELS_EN = { up: 'UP', down: 'DOWN', other: 'OTHER' };
  var FAMILY_COLORS = { linear: '#5ff0ff', quad: '#ffd166', wave: '#ff7ad9', none: '#a8bad8' };

  var STARTER_FUNCTIONS = ['hold', 'up', 'down', 'quad'];
  var RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  var RARITY_INFO = {
    common: { label: 'COMMON', color: '#8fa1bd', weight: 55, duplicate: 20 },
    uncommon: { label: 'UNCOMMON', color: '#57e08a', weight: 30, duplicate: 45 },
    rare: { label: 'RARE', color: '#ffd166', weight: 12, duplicate: 100 },
    epic: { label: 'EPIC', color: '#ff7ad9', weight: 3, duplicate: 220 },
    legendary: { label: 'LEGENDARY', color: '#b48cff', weight: 0, duplicate: 0 }
  };

  var PARAM_SPECS = {
    quad: {
      a: { min: 0.4, max: 2.0, step: 0.2, default: 1 },
      b: { min: -1.5, max: 1.5, step: 0.1, default: 0 },
      p: { min: 2, max: 6, step: 1, default: 2 }
    },
    quadDown: {
      a: { min: 0.4, max: 2.0, step: 0.2, default: 1 },
      b: { min: -1.5, max: 1.5, step: 0.1, default: 0 },
      p: { min: 2, max: 6, step: 1, default: 2 }
    },
    wave: {
      a: { min: 0.4, max: 2.0, step: 0.2, default: 1 },
      b: { min: 0.5, max: 2.5, step: 0.25, default: 1 },
      c: { min: -3, max: 3, step: 0.2, default: 0 },
      shape: { min: 0, max: 7, step: 1, default: 0 }
    }
  };

  var WAVE_SHAPES = ['sin', 'cos', 'tri', 'soft', 'damp', 'saw', 'square', 'spike'];
  var WAVE_SHAPE_LABELS = ['サイン', 'コサイン', '三角波', '角丸スクエア', '減衰サイン', 'のこぎり波', '矩形波', 'スパイク'];
  var WAVE_SHAPE_DESCS = ['滑らかな上下', 'sinを位相ずらし', '折れ線で上下', '角を丸くした方形波', '時間とともに小さくなる', 'のこぎり状の往復', '矩形のオンオフ', '尖った山の連続'];

  var ITEM_INFO = {
    graph: { label: '非対称グラフ +1', labelEn: 'ALLY GRAPH +1', short: 'G', color: '#b48cff' },
    life: { label: 'ライフ +1', labelEn: 'LIFE +1', short: '+', color: '#57e08a' },
    score: { label: 'スコア +500', labelEn: 'SCORE +500', short: 'S', color: '#ffd166' }
  };

  var UPGRADE_INFO = {
    life: { title: 'ライフ +1', desc: '最大ライフ+1 / 1回復' },
    hit: { title: '判定 +2', desc: '交差判定が広がる' },
    combo: { title: 'コンボ +0.8秒', desc: 'コンボが切れにくい' },
    score: { title: 'スコア +20%', desc: '獲得スコアアップ' },
    boss: { title: 'ボス HP -3', desc: '次のボスが弱体化' },
    slot: { title: '関数スロット +1', desc: '追加する関数を3択から選ぶ' },
    beam: { title: 'プリズムクロス', desc: '敵撃破時、縦ビームで敵を撃ち抜く' },
    magnet: { title: 'アイテム磁石', desc: '近くのアイテムを曲線へ引き寄せる' },
    revive: { title: 'リバイブ', desc: '1ラン1回、ライフ0から復活' },
    comboGuard: { title: 'コンボガード', desc: '1ステージ1回、ミスしてもコンボ維持' },
    bossBreaker: { title: 'ボスブレイカー', desc: 'ボスへのダメージ+1' },
    bonus: { title: 'スコア +3000', desc: '即時ボーナス' }
  };

  var TUTORIAL_STEPS = [
    {
      title: '関数を切り替えよう',
      desc: '1・2・3 か画面下のボタンで、これから描く曲線の形が変わる。まずは「2」を押してみよう。',
      tip: '曲線の色と動きが変わればOK'
    },
    {
      title: '敵に交差させよう',
      desc: '敵の曲線に自分の曲線を重ねると大爆発。敵はその場に留まるので、高さを合わせよう。',
      tip: '当たるまで同じ敵が表示される'
    },
    {
      title: 'アイテムを拾おう',
      desc: '下の方にアイテムを出したよ。曲線を動かして触れてみよう。拾うまで消えない。',
      tip: 'G: 追加グラフ / +: ライフ / S: スコア'
    }
  ];
  var TUTORIAL_COMPLETE = {
    title: '準備完了',
    desc: 'あとはステージを進んでボスを倒すだけ。クリアしたら強化を選んで、自分だけのビルドを作ろう。',
    tip: 'ゲームオーバーになっても、ステージ開始時点からやり直せる'
  };

  var UPGRADE_INFO_EN = {
    life: { title: 'LIFE +1', desc: 'Max HP +1 / heal 1' },
    hit: { title: 'HITBOX +2', desc: 'Wider crossing hitbox' },
    combo: { title: 'COMBO +0.8s', desc: 'Longer combo window' },
    score: { title: 'SCORE +20%', desc: 'More score from hits' },
    boss: { title: 'BOSS HP -3', desc: 'Weakens future bosses' },
    slot: { title: 'FUNCTION SLOT +1', desc: 'Choose a new function' },
    beam: { title: 'PRISM CROSS', desc: 'Defeat enemies with a vertical beam' },
    magnet: { title: 'ITEM MAGNET', desc: 'Pull nearby items to your curve' },
    revive: { title: 'REVIVE', desc: 'Once per run, revive at 1 HP' },
    comboGuard: { title: 'COMBO GUARD', desc: 'Once per stage, keep combo on a miss' },
    bossBreaker: { title: 'BOSS BREAKER', desc: 'Boss damage +1' },
    bonus: { title: 'SCORE +3000', desc: 'Instant score bonus' }
  };

  function fmtNum(value) {
    var rounded = Math.round(value * 100) / 100;
    return String(rounded).replace(/\.0+$/, '');
  }

  function powLabel(power) {
    var marks = { 2: '²', 3: '³', 4: '⁴', 5: '⁵' };
    return marks[power] || ('^' + power);
  }

  function formatModeLabel(key, params, fusion) {
    if (key === 'fusion') {
      if (!fusion || !MODES[fusion.primary] || !MODES[fusion.secondary]) return 'y = fusion';
      var left = formatModeLabel(fusion.primary, params);
      var right = formatModeLabel(fusion.secondary, params);
      return 'y = ' + left.replace(/^y = /, '') + ' + ' + right.replace(/^y = /, '');
    }
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
      var wshape = Math.max(0, Math.min(7, Math.round(wp.shape || 0)));
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
    return mode ? (mode.color || FAMILY_COLORS[mode.family] || FAMILY_COLORS.none) : FAMILY_COLORS.none;
  }

  return {
    MODES: MODES,
    MODE_KEYS: MODE_KEYS,
    DEFAULT_DECK: DEFAULT_DECK,
    DECK_SIZE: DECK_SIZE,
    FAMILY_LABELS: FAMILY_LABELS,
    FAMILY_LABELS_EN: FAMILY_LABELS_EN,
    GENRE_LABELS: GENRE_LABELS,
    GENRE_LABELS_EN: GENRE_LABELS_EN,
    STARTER_FUNCTIONS: STARTER_FUNCTIONS,
    RARITY_ORDER: RARITY_ORDER,
    RARITY_INFO: RARITY_INFO,
    FAMILY_COLORS: FAMILY_COLORS,
    PARAM_SPECS: PARAM_SPECS,
    WAVE_SHAPES: WAVE_SHAPES,
    WAVE_SHAPE_LABELS: WAVE_SHAPE_LABELS,
    WAVE_SHAPE_DESCS: WAVE_SHAPE_DESCS,
    UPGRADE_INFO: UPGRADE_INFO,
    UPGRADE_INFO_EN: UPGRADE_INFO_EN,
    TUTORIAL_STEPS: TUTORIAL_STEPS,
    TUTORIAL_COMPLETE: TUTORIAL_COMPLETE,
    ITEM_INFO: ITEM_INFO,
    fmtNum: fmtNum,
    powLabel: powLabel,
    formatModeLabel: formatModeLabel,
    modeColor: modeColor
  };
});
