/* engine.js : 心理戦じゃんけん「手を読め!」のコアロジック（UI非依存）
 *
 * ルール:
 *   - 両者 HP 8 から開始。勝った側がダメージを与え、HP 0 で決着
 *   - 勝ち = 1ダメージ。連勝ボーナス(3連勝目以降)は 2ダメージ
 *   - あいこはノーカウント（連勝は維持、ダメージなし）
 *   - 見切りゲージは勝つと +1（最大3）。満タンで必殺「先読み」:
 *     CPU の手を見てから選べる。先読み中の勝ちは 3ダメージ
 *   - CPU には試合ごとのクセ(style)があり、加えてあなたの出しグセ
 *     (直前の手→次の手の遷移)を学習して読んでくる。出す手が偏るほど読まれる
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.JankenEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ROCK = 'rock';
  var SCISSORS = 'scissors';
  var PAPER = 'paper';
  var HANDS = [ROCK, SCISSORS, PAPER];

  var HAND_LABELS = { rock: 'グー', scissors: 'チョキ', paper: 'パー' };
  var HAND_MARKS = { rock: 'グ', scissors: 'チ', paper: 'パ' };

  /* key は value に勝つ */
  var BEATS = { rock: SCISSORS, scissors: PAPER, paper: ROCK };

  var MAX_HP = 8;
  var STREAK_BONUS_AT = 3;
  var STREAK_BONUS_DAMAGE = 2;
  var READ_BONUS_DAMAGE = 3;
  var READ_GAUGE_MAX = 3;

  var CYCLE = { rock: PAPER, paper: SCISSORS, scissors: ROCK };

  var CPU_READ_SLOPE = 1.2;
  var CPU_READ_MAX = 0.55;

  var STYLES = {
    rocky: {
      name: 'ぐうたろう',
      note: 'グーを出しやすい',
      weights: { rock: 0.5, scissors: 0.25, paper: 0.25 }
    },
    copycat: {
      name: 'まねっこ',
      note: 'あなたの前の手をまねする'
    },
    counter: {
      name: 'あとだし',
      note: 'あなたの前の手に勝つ手を出しやすい'
    },
    cycler: {
      name: 'ぐるぐる',
      note: 'グー→パー→チョキと順番に出す'
    }
  };
  var STYLE_KEYS = ['rocky', 'copycat', 'counter', 'cycler'];

  function rand(rng) { return (rng || Math.random)(); }

  function pickHand(rng) {
    var r = rand(rng);
    return HANDS[Math.floor(r * HANDS.length) % HANDS.length];
  }

  function weightedHand(weights, rng) {
    var r = rand(rng);
    var rock = weights.rock || 0;
    var scissors = weights.scissors || 0;
    if (r < rock) return ROCK;
    if (r < rock + scissors) return SCISSORS;
    return PAPER;
  }

  function isHand(hand) { return HANDS.indexOf(hand) >= 0; }

  function beats(a, b) { return BEATS[a] === b; }

  function counterOf(hand) {
    for (var i = 0; i < HANDS.length; i++) {
      if (BEATS[HANDS[i]] === hand) return HANDS[i];
    }
    return null;
  }

  /* プレイヤーから見た勝敗 */
  function judge(playerHand, cpuHand) {
    if (playerHand === cpuHand) return 'draw';
    return BEATS[playerHand] === cpuHand ? 'win' : 'lose';
  }

  function createGame(options) {
    options = options || {};
    var rng = options.rng;
    var style = options.style;
    if (!style) {
      style = STYLE_KEYS[Math.floor(rand(rng) * STYLE_KEYS.length) % STYLE_KEYS.length];
    }
    if (!STYLES[style]) throw new Error('unknown style: ' + style);
    var hp = options.hp || MAX_HP;
    return {
      hp: { player: hp, cpu: hp },
      maxHp: hp,
      round: 1,
      over: false,
      winner: null,
      cpuStyle: style,
      gauge: 0,
      playerStreak: 0,
      cpuStreak: 0,
      history: [],
      preview: null,
      lastPlayerHand: null,
      lastCpuHand: null,
      transitions: {}
    };
  }

  /* 直前の手ごとに、次に出す手の偏り(平滑化した最大確率)を返す */
  function predictability(state) {
    if (!state.lastPlayerHand) return 0;
    var counts = state.transitions[state.lastPlayerHand];
    if (!counts) return 0;
    var total = 0;
    var i;
    for (i = 0; i < HANDS.length; i++) total += counts[HANDS[i]] || 0;
    if (total === 0) return 0;
    var best = 0;
    for (i = 0; i < HANDS.length; i++) {
      var p = ((counts[HANDS[i]] || 0) + 0.5) / (total + 1.5);
      if (p > best) best = p;
    }
    return best;
  }

  /* 一様(1/3)より偏っている分だけ読み精度になる。上限 CPU_READ_MAX */
  function readAccuracy(state) {
    var acc = CPU_READ_SLOPE * (predictability(state) - 1 / 3);
    if (acc < 0) acc = 0;
    if (acc > CPU_READ_MAX) acc = CPU_READ_MAX;
    return acc;
  }

  function mostLikelyPlayerHand(state) {
    var counts = state.lastPlayerHand ? state.transitions[state.lastPlayerHand] : null;
    var best = HANDS[0];
    var bestP = -1;
    for (var i = 0; i < HANDS.length; i++) {
      var p = counts ? ((counts[HANDS[i]] || 0) + 0.5) / 1.5 : 0;
      if (p > bestP) { bestP = p; best = HANDS[i]; }
    }
    return best;
  }

  function chooseCpuHand(state, rng) {
    if (state.preview) return state.preview;

    if (state.lastPlayerHand) {
      var acc = readAccuracy(state);
      if (acc > 0 && rand(rng) < acc) {
        return counterOf(mostLikelyPlayerHand(state));
      }
    }

    var style = state.cpuStyle;
    if (style === 'rocky') {
      return weightedHand(STYLES.rocky.weights, rng);
    }
    if (style === 'copycat') {
      if (state.lastPlayerHand && rand(rng) < 0.55) return state.lastPlayerHand;
      return pickHand(rng);
    }
    if (style === 'counter') {
      if (state.lastPlayerHand && rand(rng) < 0.55) return counterOf(state.lastPlayerHand);
      return pickHand(rng);
    }
    if (state.lastCpuHand && rand(rng) < 0.7) {
      return CYCLE[state.lastCpuHand];
    }
    return pickHand(rng);
  }

  function canUseRead(state) {
    return !state.over && state.preview === null && state.gauge >= READ_GAUGE_MAX;
  }

  /* ゲージを消費して CPU の手を先に見る。次の resolveRound はこの手で確定する */
  function startRead(state, rng) {
    if (!canUseRead(state)) throw new Error('cannot use read');
    state.gauge = 0;
    state.preview = chooseCpuHand(state, rng);
    return state.preview;
  }

  function resolveRound(state, playerHand, rng) {
    if (state.over) throw new Error('game is over');
    if (!isHand(playerHand)) throw new Error('unknown hand: ' + playerHand);

    var usedRead = state.preview !== null;
    var cpuHand = usedRead ? state.preview : chooseCpuHand(state, rng);
    var result = judge(playerHand, cpuHand);
    var damage = 0;

    if (result === 'win') {
      state.playerStreak++;
      state.cpuStreak = 0;
      state.gauge = Math.min(READ_GAUGE_MAX, state.gauge + 1);
      if (usedRead) {
        damage = READ_BONUS_DAMAGE;
      } else {
        damage = state.playerStreak >= STREAK_BONUS_AT ? STREAK_BONUS_DAMAGE : 1;
      }
      state.hp.cpu = Math.max(0, state.hp.cpu - damage);
    } else if (result === 'lose') {
      state.cpuStreak++;
      state.playerStreak = 0;
      damage = state.cpuStreak >= STREAK_BONUS_AT ? STREAK_BONUS_DAMAGE : 1;
      state.hp.player = Math.max(0, state.hp.player - damage);
    }

    if (state.lastPlayerHand) {
      var from = state.transitions[state.lastPlayerHand] ||
        (state.transitions[state.lastPlayerHand] = {});
      from[playerHand] = (from[playerHand] || 0) + 1;
    }
    state.lastPlayerHand = playerHand;
    state.lastCpuHand = cpuHand;

    var entry = {
      round: state.round,
      player: playerHand,
      cpu: cpuHand,
      result: result,
      damage: damage,
      read: usedRead
    };
    state.history.push(entry);

    if (state.hp.cpu <= 0) {
      state.over = true;
      state.winner = 'player';
    } else if (state.hp.player <= 0) {
      state.over = true;
      state.winner = 'cpu';
    }

    state.preview = null;
    state.round++;

    return {
      playerHand: playerHand,
      cpuHand: cpuHand,
      result: result,
      damage: damage,
      usedRead: usedRead,
      playerStreak: state.playerStreak,
      cpuStreak: state.cpuStreak,
      gauge: state.gauge,
      hp: { player: state.hp.player, cpu: state.hp.cpu },
      over: state.over,
      winner: state.winner
    };
  }

  function styleInfo(key) {
    var style = STYLES[key];
    if (!style) throw new Error('unknown style: ' + key);
    return {
      key: key,
      name: style.name,
      note: style.note,
      weights: style.weights ? {
        rock: style.weights.rock,
        scissors: style.weights.scissors,
        paper: style.weights.paper
      } : null
    };
  }

  function snapshot(state) {
    return {
      hp: { player: state.hp.player, cpu: state.hp.cpu },
      maxHp: state.maxHp,
      round: state.round,
      over: state.over,
      winner: state.winner,
      style: state.cpuStyle,
      styleName: STYLES[state.cpuStyle].name,
      gauge: state.gauge,
      gaugeMax: READ_GAUGE_MAX,
      playerStreak: state.playerStreak,
      cpuStreak: state.cpuStreak,
      predictability: predictability(state),
      readAccuracy: readAccuracy(state),
      lastPlayerHand: state.lastPlayerHand,
      lastCpuHand: state.lastCpuHand,
      history: state.history.map(function (entry) {
        return {
          round: entry.round,
          player: entry.player,
          cpu: entry.cpu,
          result: entry.result,
          damage: entry.damage,
          read: entry.read
        };
      })
    };
  }

  return {
    HANDS: HANDS,
    HAND_LABELS: HAND_LABELS,
    HAND_MARKS: HAND_MARKS,
    MAX_HP: MAX_HP,
    READ_GAUGE_MAX: READ_GAUGE_MAX,
    STREAK_BONUS_AT: STREAK_BONUS_AT,
    STREAK_BONUS_DAMAGE: STREAK_BONUS_DAMAGE,
    READ_BONUS_DAMAGE: READ_BONUS_DAMAGE,
    STYLE_KEYS: STYLE_KEYS,
    isHand: isHand,
    beats: beats,
    counterOf: counterOf,
    judge: judge,
    createGame: createGame,
    canUseRead: canUseRead,
    startRead: startRead,
    chooseCpuHand: chooseCpuHand,
    resolveRound: resolveRound,
    predictability: predictability,
    readAccuracy: readAccuracy,
    styleInfo: styleInfo,
    snapshot: snapshot
  };
});
