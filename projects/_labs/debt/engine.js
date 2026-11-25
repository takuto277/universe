/* engine.js : DEBT のコアロジック（UI非依存）
 *
 * 5日間で借金を返す経済ゲーム。強化を借りて買い、日利10〜20%に耐える。
 * 最終日に現金が借金を上回れば勝ち。残金がスコア。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DebtEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAYS = 5;
  var START_CASH = 0;
  var LIMIT = 700;
  var BASE_RATE = 0.10;
  var EXTRA_RATE = 0.10;
  var OFFERS_PER_DAY = 4;

  var ASSETS = [
    { key: 'lemon', name: 'レモネード台', cat: 'food', cost: 40, income: 20 },
    { key: 'cart', name: '屋台', cat: 'food', cost: 110, income: 55 },
    { key: 'vending', name: '自販機', cat: 'street', cost: 180, income: 90 },
    { key: 'kiosk', name: 'キオスク', cat: 'street', cost: 300, income: 150 },
    { key: 'truck', name: 'キッチンカー', cat: 'food', cost: 460, income: 230 },
    { key: 'arcade', name: 'アーケード', cat: 'tech', cost: 700, income: 350 },
    { key: 'studio', name: '配信スタジオ', cat: 'tech', cost: 980, income: 490 }
  ];

  var CAT_LABEL = { food: 'FOOD', street: 'STREET', tech: 'TECH' };

  var EVENTS = [
    { key: 'normal', name: '平常運転', text: '市場は静か。', mult: { food: 1, street: 1, tech: 1 } },
    { key: 'gourmet', name: 'グルメブーム', text: 'FOODの売上が1.6倍。', mult: { food: 1.6, street: 1, tech: 1 } },
    { key: 'rain', name: '長雨', text: 'STREETの売上が0.6倍。', mult: { food: 1, street: 0.6, tech: 1 } },
    { key: 'tech', name: 'テック相場', text: 'TECHの売上が1.8倍。', mult: { food: 1, street: 1, tech: 1.8 } },
    { key: 'recession', name: '景気後退', text: '全カテゴリの売上が0.8倍。', mult: { food: 0.8, street: 0.8, tech: 0.8 } },
    { key: 'festival', name: '商店街の日', text: 'STREETの売上が1.5倍。', mult: { food: 1, street: 1.5, tech: 1 } },
    { key: 'inflation', name: '物価高', text: '全カテゴリの売上が0.9倍。', mult: { food: 0.9, street: 0.9, tech: 0.9 } }
  ];

  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function round5(n) {
    return Math.max(5, Math.round(n / 5) * 5);
  }

  function createGame(opts) {
    opts = opts || {};
    return {
      phase: 'idle',
      seed: opts.seed == null ? null : opts.seed,
      rng: opts.seed == null ? Math.random : makeRng(opts.seed),
      day: 1,
      days: DAYS,
      cash: START_CASH,
      debt: 0,
      limit: LIMIT,
      owned: [],
      offers: [],
      event: EVENTS[0],
      history: [],
      lastDay: null,
      score: 0,
      result: null,
      events: []
    };
  }

  function rollOffers(state) {
    var pool = ASSETS.slice();
    var offers = [];
    for (var i = 0; i < OFFERS_PER_DAY && pool.length; i++) {
      var pick = Math.floor(state.rng() * pool.length);
      var base = pool.splice(pick, 1)[0];
      var priceMul = 0.86 + state.rng() * 0.28;
      var incomeMul = 0.88 + state.rng() * 0.24;
      offers.push({
        id: state.day * 10 + i,
        key: base.key,
        name: base.name,
        cat: base.cat,
        cost: round5(base.cost * priceMul),
        income: Math.max(1, Math.round(base.income * incomeMul)),
        bought: false
      });
    }
    return offers;
  }

  function rollEvent(state) {
    if (state.day === 1) return EVENTS[0];
    var idx = Math.floor(state.rng() * EVENTS.length);
    var ev = EVENTS[idx];
    if (state.event && ev.key === state.event.key) {
      ev = EVENTS[(idx + 1) % EVENTS.length];
    }
    return ev;
  }

  function start(state) {
    if (!state) return false;
    state.phase = 'playing';
    state.day = 1;
    state.cash = START_CASH;
    state.debt = 0;
    state.owned = [];
    state.history = [];
    state.lastDay = null;
    state.score = 0;
    state.result = null;
    state.events = [];
    state.event = EVENTS[0];
    state.offers = rollOffers(state);
    return true;
  }

  function availableCredit(state) {
    return Math.max(0, state.limit - state.debt);
  }

  function rateFor(debt, limit) {
    if (!(debt > 0)) return 0;
    return BASE_RATE + EXTRA_RATE * clamp(debt / limit, 0, 1);
  }

  function currentRate(state) {
    return rateFor(state.debt, state.limit);
  }

  function requiredRoi(rate, daysLeft) {
    if (daysLeft <= 0) return Infinity;
    if (rate <= 0) return 1 / daysLeft;
    return rate / (1 - Math.pow(1 + rate, -daysLeft));
  }

  function incomeFor(state, event) {
    var ev = event || state.event;
    var total = 0;
    for (var i = 0; i < state.owned.length; i++) {
      var asset = state.owned[i];
      total += asset.income * (ev.mult[asset.cat] || 1);
    }
    return Math.round(total);
  }

  function forecast(state) {
    var income = incomeFor(state, state.event);
    var rate = currentRate(state);
    var interest = state.debt > 0 ? Math.ceil(state.debt * rate) : 0;
    var cashAfter = state.cash + income;
    var debtAfter = state.debt + interest;
    return {
      income: income,
      rate: rate,
      interest: interest,
      cashAfter: cashAfter,
      debtAfter: debtAfter,
      net: cashAfter - debtAfter,
      daysLeft: DAYS - state.day + 1,
      finalDay: state.day >= DAYS
    };
  }

  function paymentFor(state, cost) {
    var cashPart = Math.min(state.cash, cost);
    var debtPart = cost - cashPart;
    return {
      ok: debtPart <= availableCredit(state),
      cashPart: cashPart,
      debtPart: debtPart
    };
  }

  function findOffer(state, id) {
    for (var i = 0; i < state.offers.length; i++) {
      if (state.offers[i].id === id) return state.offers[i];
    }
    return null;
  }

  function buy(state, id) {
    if (!state || state.phase !== 'playing') return false;
    var offer = findOffer(state, id);
    if (!offer || offer.bought) return false;
    var pay = paymentFor(state, offer.cost);
    if (!pay.ok) return false;

    state.cash -= pay.cashPart;
    state.debt += pay.debtPart;
    state.owned.push({
      key: offer.key,
      name: offer.name,
      cat: offer.cat,
      income: offer.income,
      cost: offer.cost
    });
    offer.bought = true;
    state.events.push({
      type: 'buy',
      name: offer.name,
      cash: pay.cashPart,
      debt: pay.debtPart
    });
    return true;
  }

  function repay(state, amount) {
    if (!state || state.phase !== 'playing') return 0;
    var max = Math.min(state.cash, state.debt);
    var value = amount === 'all' ? max : Math.min(amount, max);
    value = Math.max(0, Math.round(value));
    if (value <= 0) return 0;
    state.cash -= value;
    state.debt -= value;
    state.events.push({ type: 'repay', amount: value });
    return value;
  }

  function endDay(state) {
    if (!state || state.phase !== 'playing') return false;
    var f = forecast(state);
    state.cash = f.cashAfter;
    state.debt = f.debtAfter;
    state.history.push({
      day: state.day,
      event: state.event.key,
      eventName: state.event.name,
      income: f.income,
      rate: f.rate,
      interest: f.interest,
      cash: state.cash,
      debt: state.debt
    });
    state.lastDay = f;
    state.events.push({
      type: 'dayEnd',
      day: state.day,
      income: f.income,
      interest: f.interest,
      cash: state.cash,
      debt: state.debt
    });

    if (state.day >= DAYS) {
      settle(state);
      return true;
    }

    state.day += 1;
    state.offers = rollOffers(state);
    state.event = rollEvent(state);
    state.events.push({ type: 'dayStart', day: state.day });
    return true;
  }

  function rankFor(score) {
    if (score >= 1000) return 'S';
    if (score >= 750) return 'A';
    if (score >= 550) return 'B';
    if (score >= 300) return 'C';
    return 'D';
  }

  function totalOf(state, key) {
    var sum = 0;
    for (var i = 0; i < state.history.length; i++) sum += state.history[i][key];
    return sum;
  }

  function settle(state) {
    var cash = state.cash;
    var debt = state.debt;
    var clear = cash >= debt;
    var score = clear ? cash - debt : 0;

    state.phase = 'over';
    state.score = score;
    state.result = {
      score: score,
      clear: clear,
      defaulted: !clear,
      rank: clear ? rankFor(score) : 'E',
      cash: clear ? cash - debt : cash,
      debt: clear ? 0 : debt,
      shortfall: clear ? 0 : debt - cash,
      assets: state.owned.length,
      totalIncome: totalOf(state, 'income'),
      totalInterest: totalOf(state, 'interest'),
      history: state.history.slice()
    };
    state.cash = state.result.cash;
    state.debt = state.result.debt;
    state.events.push({ type: clear ? 'clear' : 'default' });
  }

  function offerView(state, offer) {
    var pay = paymentFor(state, offer.cost);
    var mult = state.event.mult[offer.cat] || 1;
    var effective = offer.income * mult;
    var payback = effective > 0 ? Math.ceil(offer.cost / effective) : 99;
    var daysLeft = DAYS - state.day + 1;
    return {
      id: offer.id,
      name: offer.name,
      cat: offer.cat,
      catLabel: CAT_LABEL[offer.cat] || offer.cat,
      cost: offer.cost,
      income: offer.income,
      effectiveIncome: effective,
      roi: offer.cost > 0 ? offer.income / offer.cost : 0,
      payback: payback,
      daysLeft: daysLeft,
      bought: offer.bought,
      affordable: !offer.bought && pay.ok,
      cashPart: pay.cashPart,
      debtPart: pay.debtPart,
      bad: payback > daysLeft
    };
  }

  function autoStep(state) {
    if (!state || state.phase !== 'playing') return;

    if (state.day >= DAYS - 1) {
      if (state.cash > 0 && state.debt > 0) {
        repay(state, 'all');
        return;
      }
      endDay(state);
      return;
    }

    var daysLeft = DAYS - state.day + 1;
    var hurdle = requiredRoi(currentRate(state), daysLeft) + 0.03;
    var best = null;
    var bestRoi = 0;
    for (var i = 0; i < state.offers.length; i++) {
      var offer = state.offers[i];
      if (offer.bought) continue;
      var pay = paymentFor(state, offer.cost);
      if (!pay.ok) continue;
      var view = offerView(state, offer);
      if (view.payback > view.daysLeft) continue;
      var roi = offer.income / offer.cost;
      if (roi > bestRoi) {
        best = offer;
        bestRoi = roi;
      }
    }

    if (best && bestRoi >= hurdle && state.debt < state.limit * 0.92) {
      buy(state, best.id);
      return;
    }

    endDay(state);
  }

  function snapshot(state) {
    if (!state) return null;
    var f = forecast(state);
    var offers = [];
    for (var i = 0; i < state.offers.length; i++) {
      offers.push(offerView(state, state.offers[i]));
    }
    var owned = [];
    for (var j = 0; j < state.owned.length; j++) {
      var a = state.owned[j];
      owned.push({ key: a.key, name: a.name, cat: a.cat, catLabel: CAT_LABEL[a.cat], income: a.income, cost: a.cost });
    }
    return {
      phase: state.phase,
      day: state.day,
      days: state.days,
      cash: state.cash,
      debt: state.debt,
      limit: state.limit,
      credit: availableCredit(state),
      rate: f.rate,
      income: f.income,
      interest: f.interest,
      forecast: f,
      event: state.event,
      offers: offers,
      owned: owned,
      history: state.history.slice(),
      score: state.score,
      result: state.result
    };
  }

  return {
    DAYS: DAYS,
    START_CASH: START_CASH,
    LIMIT: LIMIT,
    BASE_RATE: BASE_RATE,
    EXTRA_RATE: EXTRA_RATE,
    OFFERS_PER_DAY: OFFERS_PER_DAY,
    ASSETS: ASSETS,
    EVENTS: EVENTS,
    CAT_LABEL: CAT_LABEL,
    createGame: createGame,
    start: start,
    buy: buy,
    repay: repay,
    endDay: endDay,
    autoStep: autoStep,
    forecast: forecast,
    rateFor: rateFor,
    requiredRoi: requiredRoi,
    incomeFor: incomeFor,
    availableCredit: availableCredit,
    paymentFor: paymentFor,
    offerView: offerView,
    snapshot: snapshot,
    rankFor: rankFor
  };
});
