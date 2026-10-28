(function (root, factory) {
  'use strict';
  var api = factory(root.KEN_DATA);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.KenTsunagiEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DATA) {
  'use strict';

  if (!DATA || !DATA.prefectures) throw new Error('KEN_DATA is required');

  var TIME_LIMIT = 180;
  var MISS_PENALTY = 2;
  var HINT_COUNT = 3;
  var SNAP_TOLERANCE = 0.06;
  var TOTAL = DATA.prefectures.length;

  var PREFECTURES = DATA.prefectures.slice().sort(function (a, b) { return a.code - b.code; });
  var BY_CODE = {};
  var BY_REGION = {};
  var REGION_ORDER = DATA.regions.map(function (r) { return r.id; });
  var REGION_LABEL = {};
  var REGION_COLOR = {};

  for (var i = 0; i < PREFECTURES.length; i++) {
    var p = PREFECTURES[i];
    BY_CODE[p.code] = p;
    if (!BY_REGION[p.region]) BY_REGION[p.region] = [];
    BY_REGION[p.region].push(p.code);
  }
  for (i = 0; i < DATA.regions.length; i++) {
    REGION_LABEL[DATA.regions[i].id] = DATA.regions[i].label;
    REGION_COLOR[DATA.regions[i].id] = DATA.regions[i].color;
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function createRun() {
    return {
      phase: 'run',
      paused: false,
      timeLeft: TIME_LIMIT,
      elapsed: 0,
      finishTime: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      hints: HINT_COUNT,
      placed: {},
      placedCount: 0,
      selectedCode: null,
      regionFilter: REGION_ORDER[0],
      events: [],
      lastPlaced: null,
      clearBonus: 0,
      missCount: 0
    };
  }

  function event(s, type, data) {
    var ev = data || {};
    ev.type = type;
    s.events.push(ev);
    if (s.events.length > 120) s.events.shift();
  }

  function isPlaced(s, code) {
    return !!s.placed[code];
  }

  function regionCodes(region) {
    return BY_REGION[region] || [];
  }

  function regionRemaining(s, region) {
    var codes = regionCodes(region);
    var out = [];
    for (var i = 0; i < codes.length; i++) if (!s.placed[codes[i]]) out.push(codes[i]);
    return out;
  }

  function regionComplete(s, region) {
    return regionRemaining(s, region).length === 0;
  }

  function nextRegion(s, after) {
    var start = REGION_ORDER.indexOf(after);
    if (start < 0) start = -1;
    for (var n = 1; n <= REGION_ORDER.length; n++) {
      var r = REGION_ORDER[(start + n) % REGION_ORDER.length];
      if (regionRemaining(s, r).length > 0) return r;
    }
    return after;
  }

  function selectRegion(s, region) {
    if (!s) return false;
    if (REGION_ORDER.indexOf(region) < 0) return false;
    s.regionFilter = region;
    return true;
  }

  function selectPiece(s, code) {
    if (!s || s.phase !== 'run' || s.paused) return false;
    code = Number(code);
    if (!BY_CODE[code] || isPlaced(s, code)) return false;
    s.selectedCode = code;
    s.regionFilter = BY_CODE[code].region;
    return true;
  }

  function tray(s, region) {
    var r = region || s.regionFilter;
    var codes = regionRemaining(s, r);
    var out = [];
    for (var i = 0; i < codes.length; i++) out.push(BY_CODE[codes[i]]);
    return out;
  }

  function target(code) {
    var p = BY_CODE[Number(code)];
    if (!p) return null;
    return { x: p.center[0], y: p.center[1] };
  }

  function tryPlace(s, code, nx, ny) {
    if (!s || s.phase !== 'run' || s.paused) return { ok: false, reason: 'inactive' };
    code = Number(code);
    var p = BY_CODE[code];
    if (!p) return { ok: false, reason: 'unknown' };
    if (isPlaced(s, code)) return { ok: false, reason: 'placed' };

    var tx = p.center[0];
    var ty = p.center[1];
    var dx = Number(nx) - tx;
    var dy = Number(ny) - ty;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (!(nx != null) || !(ny != null) || dist > SNAP_TOLERANCE) {
      s.timeLeft = Math.max(0, s.timeLeft - MISS_PENALTY);
      s.combo = 0;
      s.missCount++;
      event(s, 'miss', { code: code, label: p.label, target: { x: tx, y: ty }, drop: { x: Number(nx), y: Number(ny) }, distance: dist });
      if (s.timeLeft <= 0) {
        s.timeLeft = 0;
        s.phase = 'over';
        s.finishTime = s.elapsed;
        s.selectedCode = null;
        event(s, 'timeout', {});
      }
      return {
        ok: false,
        reason: 'target',
        target: { x: tx, y: ty },
        distance: dist,
        timeLeft: s.timeLeft
      };
    }

    s.placed[code] = true;
    s.placedCount++;
    s.combo++;
    if (s.combo > s.bestCombo) s.bestCombo = s.combo;
    if (s.selectedCode === code) s.selectedCode = null;

    var neighbors = 0;
    for (var i = 0; i < p.neighbors.length; i++) {
      if (s.placed[p.neighbors[i]]) neighbors++;
    }
    var complete = regionComplete(s, p.region);
    var comboGain = Math.max(0, s.combo - 1) * 20;
    var neighborGain = neighbors * 40;
    var regionGain = complete ? 500 : 0;
    var gain = 100 + comboGain + neighborGain + regionGain;
    s.score += gain;

    var result = {
      ok: true,
      code: code,
      label: p.label,
      region: p.region,
      combo: s.combo,
      neighbors: neighbors,
      regionComplete: complete,
      regionGain: regionGain,
      gain: gain,
      score: s.score,
      target: { x: tx, y: ty }
    };
    s.lastPlaced = result;
    event(s, 'place', result);

    if (complete) event(s, 'region', { region: p.region, label: REGION_LABEL[p.region], gain: regionGain });

    if (regionRemaining(s, s.regionFilter).length === 0) {
      s.regionFilter = nextRegion(s, s.regionFilter);
    }

    if (s.placedCount >= TOTAL) {
      s.phase = 'clear';
      s.finishTime = s.elapsed;
      s.clearBonus = Math.ceil(s.timeLeft) * 20;
      s.score += s.clearBonus;
      s.selectedCode = null;
      event(s, 'clear', {
        score: s.score,
        time: s.finishTime,
        clearBonus: s.clearBonus
      });
    }
    return result;
  }

  function useHint(s) {
    if (!s || s.phase !== 'run' || s.paused || s.hints <= 0) return null;
    var code = s.selectedCode;
    if (!code || isPlaced(s, code)) {
      var pool = regionRemaining(s, s.regionFilter);
      if (!pool.length) {
        for (var r = 0; r < REGION_ORDER.length; r++) {
          pool = regionRemaining(s, REGION_ORDER[r]);
          if (pool.length) {
            s.regionFilter = REGION_ORDER[r];
            break;
          }
        }
      }
      if (!pool.length) return null;
      code = pool[0];
      s.selectedCode = code;
      s.regionFilter = BY_CODE[code].region;
    }
    s.hints--;
    var p = BY_CODE[code];
    var hint = {
      code: code,
      label: p.label,
      region: p.region,
      target: { x: p.center[0], y: p.center[1] }
    };
    event(s, 'hint', hint);
    return hint;
  }

  function tick(s, dt) {
    if (!s || s.phase !== 'run' || s.paused) return s;
    dt = clamp(Number(dt) || 0, 0, 0.1);
    s.elapsed += dt;
    s.timeLeft -= dt;
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      s.phase = 'over';
      s.finishTime = s.elapsed;
      s.selectedCode = null;
      event(s, 'timeout', { score: s.score });
    }
    return s;
  }

  function setPaused(s, paused) {
    if (!s || s.phase !== 'run') return;
    s.paused = !!paused;
  }

  function getState(s) {
    if (!s) return null;
    return {
      id: 'ken-tsunagi',
      phase: s.phase,
      paused: s.paused,
      timeLeft: s.timeLeft,
      elapsed: s.elapsed,
      finishTime: s.finishTime,
      score: s.score,
      combo: s.combo,
      bestCombo: s.bestCombo,
      hints: s.hints,
      placedCount: s.placedCount,
      total: TOTAL,
      selectedCode: s.selectedCode,
      regionFilter: s.regionFilter,
      clearBonus: s.clearBonus,
      missCount: s.missCount,
      lastPlaced: s.lastPlaced,
      cleared: s.phase === 'clear',
      over: s.phase === 'over'
    };
  }

  function consumeEvents(s) {
    if (!s) return [];
    return s.events.splice(0, s.events.length);
  }

  function firstRemaining(s) {
    for (var i = 0; i < PREFECTURES.length; i++) {
      if (!s.placed[PREFECTURES[i].code]) return PREFECTURES[i].code;
    }
    return null;
  }

  return {
    data: DATA,
    prefectures: PREFECTURES,
    regions: DATA.regions,
    regionOrder: REGION_ORDER,
    regionLabel: REGION_LABEL,
    regionColor: REGION_COLOR,
    byCode: BY_CODE,
    byRegion: BY_REGION,
    total: TOTAL,
    timeLimit: TIME_LIMIT,
    missPenalty: MISS_PENALTY,
    hintCount: HINT_COUNT,
    snapTolerance: SNAP_TOLERANCE,
    createRun: createRun,
    tick: tick,
    selectRegion: selectRegion,
    selectPiece: selectPiece,
    tray: tray,
    regionCodes: regionCodes,
    regionRemaining: regionRemaining,
    regionComplete: regionComplete,
    target: target,
    tryPlace: tryPlace,
    useHint: useHint,
    setPaused: setPaused,
    getState: getState,
    consumeEvents: consumeEvents,
    firstRemaining: firstRemaining
  };
});
