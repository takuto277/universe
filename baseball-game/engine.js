/* engine.js : 9球種ベースボールゲームのコアロジック（UI非依存） */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.BaseballEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STRAIGHT = 'straight';
  var CURVE = 'curve';
  var TOTAL_INNINGS = 3;
  var STRIKES_PER_INNING = 3;
  var BALLS_PER_WALK = 4;

  var PITCH_ORDER = [
    'straight', 'curve', 'slider', 'cutter', 'fork',
    'changeup', 'shoot', 'sinker', 'knuckle'
  ];

  var PITCH_LABELS = {
    straight: 'ストレート',
    curve: 'カーブ',
    slider: 'スライダー',
    cutter: 'カットボール',
    fork: 'フォーク',
    changeup: 'チェンジアップ',
    shoot: 'シュート',
    sinker: 'シンカー',
    knuckle: 'ナックル'
  };

  /* 球種ごとのストライクゾーン率（見逃したときストライクになる確率） */
  var ZONE_RATES = {
    straight: 0.70,
    cutter: 0.68,
    slider: 0.55,
    curve: 0.48,
    shoot: 0.55,
    fork: 0.40,
    sinker: 0.45,
    changeup: 0.62,
    knuckle: 0.50
  };

  /* CPUピッチャーの配球スタイル（ゲーム開始時にランダムで1つ選ばれる）
   * arsenal = 持ち球（この5球種しか投げない。打者は最初から知っている）
   * good = 得意球（ゾーンに入りやすい）、bad = 苦手球（ボールになりやすい）
   * primary = 看板球（初球と1ストライク時に多くなる。得意球の1番手と一致させる） */
  var PITCH_STYLES = {
    power: {
      name: '剛球派',
      primary: 'straight',
      arsenal: ['straight', 'cutter', 'slider', 'fork', 'sinker'],
      weights: { straight: 34, cutter: 14, slider: 12, curve: 6, fork: 10, changeup: 6, shoot: 6, sinker: 8, knuckle: 4 },
      finish: { straight: 1.9, slider: 1.4 },
      good: ['straight', 'cutter'],
      bad: ['slider', 'fork']
    },
    breaking: {
      name: '変化球派',
      primary: 'slider',
      arsenal: ['straight', 'cutter', 'slider', 'curve', 'changeup'],
      weights: { straight: 16, cutter: 8, slider: 24, curve: 18, fork: 8, changeup: 10, shoot: 6, sinker: 6, knuckle: 4 },
      finish: { slider: 2.0, curve: 1.6 },
      good: ['slider', 'curve'],
      bad: ['straight', 'changeup']
    },
    vertical: {
      name: '縦変化派',
      primary: 'fork',
      arsenal: ['straight', 'slider', 'fork', 'changeup', 'sinker'],
      weights: { straight: 18, cutter: 8, slider: 8, curve: 8, fork: 22, changeup: 16, shoot: 4, sinker: 12, knuckle: 4 },
      finish: { fork: 2.1, changeup: 1.5, sinker: 1.3 },
      good: ['fork', 'sinker'],
      bad: ['slider', 'changeup']
    },
    tricky: {
      name: '技巧派',
      primary: 'changeup',
      arsenal: ['straight', 'slider', 'changeup', 'shoot', 'knuckle'],
      weights: { straight: 14, cutter: 10, slider: 10, curve: 10, fork: 8, changeup: 20, shoot: 10, sinker: 9, knuckle: 10 },
      finish: { changeup: 2.0, knuckle: 2.1, shoot: 1.4 },
      good: ['changeup', 'knuckle'],
      bad: ['straight', 'shoot']
    }
  };

  /* ゾーン率の補正: 得意球は×1.3、苦手球は×0.5（見逃しでボールを稼げる） */
  var ZONE_GOOD_MULT = 1.3;
  var ZONE_BAD_MULT = 0.5;

  function zoneRateFor(styleKey, pitch) {
    var style = PITCH_STYLES[styleKey] || PITCH_STYLES.power;
    var rate = ZONE_RATES[pitch] || 0.5;
    if (style.good.indexOf(pitch) >= 0) rate *= ZONE_GOOD_MULT;
    if (style.bad.indexOf(pitch) >= 0) rate *= ZONE_BAD_MULT;
    if (rate > 0.92) rate = 0.92;
    if (rate < 0.12) rate = 0.12;
    return rate;
  }

  /* CPU打者の読み: 頻度・連投・交互パターンで精度が上がる */
  var CPU_READ_BASE = 0.40;
  var CPU_READ_BONUS = 0.28;
  var CPU_READ_WINDOW = 10;
  var CPU_STREAK_BONUS = 0.03;
  var CPU_STREAK_CAP = 0.09;
  var CPU_PATTERN_BONUS = 0.12;
  var CPU_READ_MAX = 0.9;

  /* CPU打者のボール球スイング率: 基本/追い込まれたら保護/ボール先行なら慎重
   * 明らかなボール球には手を出さない（基本はMLB平均並みの28%） */
  var CPU_CHASE_BASE = 0.28;
  var CPU_CHASE_PROTECT = 0.5;
  var CPU_CHASE_PATIENT = 0.08;

  /* タイミング判定のしきい値（中央からのズレ%） */
  var TIMING_BANDS = { hr: 10, double: 24 };

  function pitchLabel(pitch) { return PITCH_LABELS[pitch] || String(pitch); }

  function weightedPick(weights, rng) {
    rng = rng || Math.random;
    var total = 0, k;
    for (k in weights) {
      if (Object.prototype.hasOwnProperty.call(weights, k)) total += weights[k];
    }
    var r = rng() * total;
    for (var i = 0; i < PITCH_ORDER.length; i++) {
      k = PITCH_ORDER[i];
      if (weights[k] == null) continue;
      r -= weights[k];
      if (r <= 0) return k;
    }
    return PITCH_ORDER[0];
  }

  function randomPitch(rng) {
    rng = rng || Math.random;
    return PITCH_ORDER[Math.floor(rng() * PITCH_ORDER.length) % PITCH_ORDER.length];
  }

  function randomPitchExcept(key, rng) {
    rng = rng || Math.random;
    var k = randomPitch(rng);
    var guard = 0;
    while (k === key && guard < 50) { k = randomPitch(rng); guard++; }
    return k;
  }

  /* 現在のカウント・スタイルから球種の重みを計算（配球のクセ）
   * 0-0は看板球、1ストライクは看板球を多め、2ストライクは決め球、
   * ボール先行はストレートで取り返しに来る */
  function tendencyWeights(state) {
    var style = PITCH_STYLES[state.pitcherStyle] || PITCH_STYLES.power;
    var w = {};
    var i, k;
    for (i = 0; i < PITCH_ORDER.length; i++) {
      k = PITCH_ORDER[i];
      w[k] = style.arsenal.indexOf(k) >= 0 ? (style.weights[k] || 1) : 0;
    }
    if (state.balls === 0 && state.strikes === 0) {
      w[style.primary] *= 1.6;
    }
    if (state.balls >= 1 && state.strikes !== 2) {
      w.straight *= 1.8;
      w.cutter *= 1.3;
    }
    if (state.strikes === 1 && state.balls <= 1) {
      w[style.primary] *= 1.5;
    }
    if (state.strikes === 2) {
      for (k in style.finish) {
        if (Object.prototype.hasOwnProperty.call(style.finish, k)) w[k] *= style.finish[k];
      }
    }
    return w;
  }

  /* CPUピッチャーが1球投げる（配球のクセに従う）。state.pitcherHistory に記録する。 */
  function pitcherPitch(state, rng) {
    rng = rng || Math.random;
    var actual = weightedPick(tendencyWeights(state), rng);
    var zone = rng() < zoneRateFor(state.pitcherStyle, actual);
    state.pitcherHistory.push({ pitch: actual, balls: state.balls, strikes: state.strikes, zone: zone });
    return { actual: actual, zone: zone };
  }

  /* 配球メモ: ストライク数ごとの球種集計（ゾーン率つき） */
  function pitchTendencies(state) {
    var style = PITCH_STYLES[state.pitcherStyle] || PITCH_STYLES.power;
    var rows = [];
    for (var s = 0; s < STRIKES_PER_INNING; s++) {
      var counts = {};
      var zones = {};
      var total = 0;
      for (var i = 0; i < state.pitcherHistory.length; i++) {
        var h = state.pitcherHistory[i];
        if (h.strikes !== s) continue;
        counts[h.pitch] = (counts[h.pitch] || 0) + 1;
        if (h.zone) zones[h.pitch] = (zones[h.pitch] || 0) + 1;
        total++;
      }
      var items = [];
      for (var k in counts) {
        if (counts.hasOwnProperty(k)) {
          items.push({
            pitch: k,
            count: counts[k],
            pct: counts[k] / total,
            zoneCount: zones[k] || 0
          });
        }
      }
      items.sort(function (a, b) { return b.count - a.count; });
      rows.push({ strikes: s, total: total, items: items });
    }
    return {
      style: state.pitcherStyle,
      styleName: style.name,
      arsenal: style.arsenal,
      good: style.good,
      bad: style.bad,
      primary: style.primary,
      rows: rows
    };
  }

  /* CPU打者の見送り/食い付きの確率: カウントで変わる */
  function cpuChaseRate(state) {
    if (state.strikes === 2) return CPU_CHASE_PROTECT;
    if (state.balls >= 3) return CPU_CHASE_PATIENT;
    return CPU_CHASE_BASE;
  }

  /* 守備側（プレイヤーの投球）の1球を処理する。
   * ゾーン判定 → CPUが見送り(ボール/四球) or スイング(予想勝負)をまとめて行う。
   * 戻り値: { zone, swung, chased, take, dec, pitch, hit } */
  function resolveCpuAtBat(state, chosen, rng, chaseRate) {
    rng = rng || Math.random;
    var zone = rng() < (ZONE_RATES[chosen] || 0.5);
    var swung = zone || rng() < (chaseRate == null ? cpuChaseRate(state) : chaseRate);
    if (!swung) {
      var hist = state.playerHistory || [];
      hist.push(chosen);
      if (hist.length > 30) hist.shift();
      state.playerHistory = hist;
      var tev = resolveTake(state, false);
      return { zone: zone, swung: false, chased: false, take: tev, dec: null, pitch: null, hit: null };
    }
    var dec = cpuBatterDecision(state, chosen, rng);
    var ev = resolvePitch(state, dec.guess, chosen);
    var hev = null;
    if (ev.correct) hev = resolveHit(state, rng() < 0.15 ? 'double' : 'single');
    return { zone: zone, swung: true, chased: !zone, take: null, dec: dec, pitch: ev, hit: hev };
  }

  /* タイミングのズレ(%)から打球結果を決める */
  function timingResult(offset) {
    var a = Math.abs(offset);
    if (a <= TIMING_BANDS.hr) return 'hr';
    if (a <= TIMING_BANDS.double) return 'double';
    return 'single';
  }

  /* 現在の投球履歴から、その球種へのCPUの読み精度を計算する（副作用なし）。
   * streak = その球種の連投数、pattern = 交互リズム検出 */
  function readAccuracy(state, chosenPitch) {
    var hist = state.playerHistory || [];
    var count = 0;
    for (var i = Math.max(0, hist.length - CPU_READ_WINDOW); i < hist.length; i++) {
      if (hist[i] === chosenPitch) count++;
    }
    var streak = 0;
    for (var s = hist.length - 1; s >= 0 && hist[s] === chosenPitch; s--) streak++;
    var pattern = false;
    if (hist.length >= 4) {
      var a = hist[hist.length - 4], b = hist[hist.length - 3];
      var c = hist[hist.length - 2], d = hist[hist.length - 1];
      if (a === c && b === d && a !== b) pattern = true;
    }
    var accuracy = CPU_READ_BASE +
      CPU_READ_BONUS * Math.min(1, count / 5) +
      Math.min(CPU_STREAK_CAP, CPU_STREAK_BONUS * streak) +
      (pattern ? CPU_PATTERN_BONUS : 0);
    if (accuracy > CPU_READ_MAX) accuracy = CPU_READ_MAX;
    return { accuracy: accuracy, streak: streak, pattern: pattern, count: count };
  }

  /* CPU打者の予想を決める（プレイヤーの投球履歴を読む）。
   * state.playerHistory に投球を記録する副作用あり。 */
  function cpuBatterDecision(state, chosenPitch, rng) {
    rng = rng || Math.random;
    var read = readAccuracy(state, chosenPitch);
    var hist = state.playerHistory || [];
    var correct = rng() < read.accuracy;
    hist.push(chosenPitch);
    if (hist.length > 30) hist.shift();
    state.playerHistory = hist;
    return {
      guess: correct ? chosenPitch : randomPitchExcept(chosenPitch, rng),
      correct: correct,
      accuracy: read.accuracy,
      streak: read.streak,
      pattern: read.pattern
    };
  }

  function createGame(styleKey) {
    var linescore = { away: [], home: [] };
    for (var i = 0; i < TOTAL_INNINGS; i++) {
      linescore.away.push(null);
      linescore.home.push(null);
    }
    var styleKeys = [];
    for (var sk in PITCH_STYLES) {
      if (Object.prototype.hasOwnProperty.call(PITCH_STYLES, sk)) styleKeys.push(sk);
    }
    var style = styleKey || styleKeys[Math.floor(Math.random() * styleKeys.length) % styleKeys.length];
    return {
      totalInnings: TOTAL_INNINGS,
      strikesPerInning: STRIKES_PER_INNING,
      ballsPerWalk: BALLS_PER_WALK,
      inning: 1,
      half: 'top',
      strikes: 0,
      balls: 0,
      runners: [false, false, false],
      score: { away: 0, home: 0 },
      hits: { away: 0, home: 0 },
      linescore: linescore,
      pitcherStyle: style,
      pitcherHistory: [],
      playerHistory: [],
      over: false,
      result: null
    };
  }

  function battingTeam(state) { return state.half === 'top' ? 'away' : 'home'; }

  function fieldingTeam(state) { return state.half === 'top' ? 'home' : 'away'; }

  function halfLabel(state) {
    return state.inning + '回' + (state.half === 'top' ? '表' : '裏');
  }

  function addInningRun(state, team) {
    var idx = state.inning - 1;
    if (state.linescore[team][idx] === null) state.linescore[team][idx] = 0;
    state.linescore[team][idx] += 1;
    state.score[team] += 1;
  }

  function finishGame(state, result) {
    state.over = true;
    state.result = result;
  }

  function checkWalkoff(state, ev) {
    if (state.half === 'bottom' && state.inning === state.totalInnings &&
      state.score.home > state.score.away) {
      ev.walkoff = true;
      ev.gameEnded = true;
      ev.result = 'home';
      finishGame(state, 'home');
    }
  }

  function endHalf(state) {
    var batting = battingTeam(state);
    if (state.linescore[batting][state.inning - 1] === null) {
      state.linescore[batting][state.inning - 1] = 0;
    }
    state.strikes = 0;
    state.balls = 0;
    state.runners = [false, false, false];

    if (state.half === 'top') {
      if (state.inning === state.totalInnings && state.score.home > state.score.away) {
        finishGame(state, 'home');
        return { gameEnded: true, result: 'home' };
      }
      state.half = 'bottom';
    } else {
      if (state.inning === state.totalInnings) {
        var r = state.score.home > state.score.away ? 'home' :
          (state.score.home < state.score.away ? 'away' : 'draw');
        finishGame(state, r);
        return { gameEnded: true, result: r };
      }
      state.inning += 1;
      state.half = 'top';
    }
    return { gameEnded: false, result: null };
  }

  /* 空振り/見逃し以外の判定: 予想が当たったかだけを返す（進塁は resolveHit で行う） */
  function resolvePitch(state, batterGuess, actualPitch) {
    if (state.over) throw new Error('game is already over');
    var ev = {
      guess: batterGuess,
      actual: actualPitch,
      correct: batterGuess === actualPitch,
      strikeout: false,
      inningEnded: false,
      gameEnded: false,
      result: null
    };
    if (!ev.correct) {
      state.strikes += 1;
      if (state.strikes >= STRIKES_PER_INNING) {
        ev.strikeout = true;
        ev.inningEnded = true;
        var ended = endHalf(state);
        ev.gameEnded = ended.gameEnded;
        ev.result = ended.result;
      }
    }
    return ev;
  }

  /* 見逃し: zone=true なら見逃しストライク、false ならボール（4球で四球） */
  function resolveTake(state, inZone) {
    if (state.over) throw new Error('game is already over');
    var ev = {
      took: true,
      inZone: !!inZone,
      walk: false,
      calledStrike: false,
      runs: 0,
      strikeout: false,
      inningEnded: false,
      walkoff: false,
      gameEnded: false,
      result: null
    };
    if (inZone) {
      state.strikes += 1;
      ev.calledStrike = true;
      if (state.strikes >= STRIKES_PER_INNING) {
        ev.strikeout = true;
        ev.inningEnded = true;
        var ended = endHalf(state);
        ev.gameEnded = ended.gameEnded;
        ev.result = ended.result;
      }
      return ev;
    }
    state.balls += 1;
    if (state.balls >= BALLS_PER_WALK) {
      var batting = battingTeam(state);
      if (state.runners[2]) {
        addInningRun(state, batting);
        ev.runs = 1;
      }
      state.runners = [true, state.runners[0], state.runners[1]];
      state.balls = 0;
      ev.walk = true;
      checkWalkoff(state, ev);
    }
    return ev;
  }

  /* 打者のスイング: 予想が当たればヒット判定へ（進塁は resolveHit が担当）。
   * 予想を外したとき、明らかなボール球（ゾーン率50%以下）は空振りにせずボール扱い。
   * 際どいボール球やゾーン球を外すと空振りストライク。
   * 際どい球まで見逃すと「常に振る」が最適になり、見逃しが死ぬための線引き。 */
  function resolvePlayerSwing(state, batterGuess, actualPitch, inZone) {
    if (state.over) throw new Error('game is already over');
    var ev = {
      guess: batterGuess,
      actual: actualPitch,
      inZone: !!inZone,
      correct: batterGuess === actualPitch,
      ball: false,
      whiff: false,
      take: null,
      strikeout: false,
      inningEnded: false,
      walkoff: false,
      gameEnded: false,
      result: null
    };
    if (ev.correct) return ev;
    if (!inZone && zoneRateFor(state.pitcherStyle, actualPitch) <= 0.5) {
      var tev = resolveTake(state, false);
      ev.ball = true;
      ev.take = tev;
      ev.strikeout = tev.strikeout;
      ev.inningEnded = tev.inningEnded;
      ev.walkoff = tev.walkoff;
      ev.gameEnded = tev.gameEnded;
      ev.result = tev.result;
      return ev;
    }
    ev.whiff = true;
    var pev = resolvePitch(state, batterGuess, actualPitch);
    ev.strikeout = pev.strikeout;
    ev.inningEnded = pev.inningEnded;
    ev.gameEnded = pev.gameEnded;
    ev.result = pev.result;
    return ev;
  }

  /* 打球結果: 'single' | 'double' | 'hr' で進塁・得点を適用 */
  function resolveHit(state, kind) {
    if (state.over) throw new Error('game is already over');
    var batting = battingTeam(state);
    var ev = {
      kind: kind,
      runs: 0,
      walkoff: false,
      gameEnded: false,
      result: null
    };
    if (kind === 'hr') {
      for (var i = 0; i < 3; i++) {
        if (state.runners[i]) { addInningRun(state, batting); ev.runs++; }
      }
      addInningRun(state, batting);
      ev.runs++;
      state.runners = [false, false, false];
    } else {
      var bases = kind === 'double' ? 2 : 1;
      var before = state.runners;
      var after = [false, false, false];
      for (var j = 2; j >= 0; j--) {
        if (!before[j]) continue;
        var dest = j + bases;
        if (dest >= 3) { addInningRun(state, batting); ev.runs++; }
        else after[dest] = true;
      }
      after[bases - 1] = true;
      state.runners = after;
    }
    state.hits[batting] += 1;
    state.balls = 0;
    checkWalkoff(state, ev);
    return ev;
  }

  return {
    STRAIGHT: STRAIGHT,
    CURVE: CURVE,
    TOTAL_INNINGS: TOTAL_INNINGS,
    STRIKES_PER_INNING: STRIKES_PER_INNING,
    BALLS_PER_WALK: BALLS_PER_WALK,
    PITCH_ORDER: PITCH_ORDER,
    PITCH_LABELS: PITCH_LABELS,
    PITCH_STYLES: PITCH_STYLES,
    ZONE_RATES: ZONE_RATES,
    zoneRateFor: zoneRateFor,
    CPU_READ_BASE: CPU_READ_BASE,
    CPU_READ_BONUS: CPU_READ_BONUS,
    CPU_PATTERN_BONUS: CPU_PATTERN_BONUS,
    CPU_CHASE_BASE: CPU_CHASE_BASE,
    CPU_CHASE_PROTECT: CPU_CHASE_PROTECT,
    CPU_CHASE_PATIENT: CPU_CHASE_PATIENT,
    cpuChaseRate: cpuChaseRate,
    resolveCpuAtBat: resolveCpuAtBat,
    TIMING_BANDS: TIMING_BANDS,
    pitchLabel: pitchLabel,
    weightedPick: weightedPick,
    randomPitch: randomPitch,
    randomPitchExcept: randomPitchExcept,
    tendencyWeights: tendencyWeights,
    pitcherPitch: pitcherPitch,
    pitchTendencies: pitchTendencies,
    timingResult: timingResult,
    cpuBatterDecision: cpuBatterDecision,
    readAccuracy: readAccuracy,
    createGame: createGame,
    battingTeam: battingTeam,
    fieldingTeam: fieldingTeam,
    halfLabel: halfLabel,
    resolvePitch: resolvePitch,
    resolveTake: resolveTake,
    resolvePlayerSwing: resolvePlayerSwing,
    resolveHit: resolveHit
  };
});
