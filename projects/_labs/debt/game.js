/* game.js : DEBT の描画・入力・画面遷移 */
(function (root) {
  'use strict';

  var E = root.DebtEngine;
  if (!E) return;

  var state = E.createGame();
  var audio = root.DebtAudio;
  var els = {};
  var offers = [];
  var logLines = [];
  var seenEvents = 0;
  var endShown = false;
  var best = 0;

  function $(id) { return document.getElementById(id); }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function setClass(el, name, on) { if (el) el.classList.toggle(name, !!on); }

  function group(n) {
    var s = String(Math.abs(Math.round(n)));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var pos = s.length - i;
      out += s.charAt(i);
      if (pos > 1 && (pos - 1) % 3 === 0) out += ',';
    }
    return (n < 0 ? '-' : '') + out;
  }
  function yen(n) { return '¥' + group(n); }
  function signed(n) { return (n >= 0 ? '+' : '-') + yen(Math.abs(n)); }
  function pct(rate) { return (Math.round(rate * 1000) / 10) + '%'; }

  function loadBest() {
    try {
      best = Number(root.localStorage && root.localStorage.getItem('debt-best')) || 0;
    } catch (e) { best = 0; }
  }

  function saveBest(score) {
    if (!(score > best)) return false;
    best = score;
    try {
      if (root.localStorage) root.localStorage.setItem('debt-best', String(best));
    } catch (e) { }
    return true;
  }

  function updateBestLabel() {
    var label = best > 0 ? 'BEST ' + yen(best) : 'BEST ---';
    text(els.bestStart, label);
    text(els.endBest, label);
  }

  function updateSoundLabel() {
    if (!audio || !els.btnSound) return;
    text(els.btnSound, audio.isEnabled() ? 'SOUND ON' : 'SOUND OFF');
  }

  function pushLog(kind, message) {
    logLines.unshift({ kind: kind || '', message: message });
    if (logLines.length > 8) logLines.length = 8;
  }

  function processEvents() {
    if (!state.events) return;
    while (seenEvents < state.events.length) {
      var ev = state.events[seenEvents++];
      if (ev.type === 'buy') {
        var split = ev.debt > 0
          ? '（現金' + yen(ev.cash) + ' / 借入' + yen(ev.debt) + '）'
          : '（現金' + yen(ev.cash) + '）';
        pushLog('', ev.name + ' を購入' + split);
        if (audio) audio.buy();
      } else if (ev.type === 'repay') {
        pushLog('', yen(ev.amount) + ' を返済');
        if (audio) audio.repay();
      } else if (ev.type === 'dayEnd') {
        pushLog('day', 'DAY ' + ev.day + ' 終了：売上 +' + yen(ev.income) + ' / 利息 -' + yen(ev.interest));
        if (audio) audio.dayEnd(ev.interest);
      } else if (ev.type === 'dayStart') {
        pushLog('day', 'DAY ' + ev.day + ' 開始：' + (state.event ? state.event.name : ''));
      } else if (ev.type === 'clear') {
        pushLog('day', '決済完了：' + yen(state.result.score) + ' が残った');
        if (audio) audio.clear();
      } else if (ev.type === 'default') {
        pushLog('debt', 'デフォルト：' + yen(state.result.shortfall) + ' 不足');
        if (audio) audio.fail();
      }
    }
  }

  function renderMults() {
    var host = els.eventMults;
    if (!host) return;
    host.textContent = '';
    var cats = ['food', 'street', 'tech'];
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var mult = state.event.mult[cat] || 1;
      var tag = document.createElement('span');
      tag.className = 'mult' + (mult > 1 ? ' is-up' : (mult < 1 ? ' is-down' : ''));
      tag.textContent = (E.CAT_LABEL[cat] || cat) + ' x' + mult.toFixed(1);
      host.appendChild(tag);
    }
  }

  function renderAssets(s) {
    var host = els.assetList;
    if (!host) return;
    host.textContent = '';
    if (!s.owned.length) {
      var empty = document.createElement('li');
      empty.className = 'asset-empty';
      empty.textContent = 'まだ資産がない。オファーを借りて買う。';
      host.appendChild(empty);
      return;
    }
    var map = {};
    var order = [];
    for (var i = 0; i < s.owned.length; i++) {
      var a = s.owned[i];
      if (!map[a.key]) {
        map[a.key] = { name: a.name, cat: a.cat, count: 0, income: a.income };
        order.push(a.key);
      }
      map[a.key].count++;
    }
    for (var k = 0; k < order.length; k++) {
      var item = map[order[k]];
      var row = document.createElement('li');
      row.className = 'asset-row';
      var dot = document.createElement('span');
      dot.className = 'asset-dot cat-' + item.cat;
      var name = document.createElement('span');
      name.className = 'asset-name';
      name.textContent = item.name;
      var count = document.createElement('span');
      count.className = 'asset-count';
      count.textContent = item.count > 1 ? 'x' + item.count : '';
      var income = document.createElement('span');
      income.className = 'asset-income';
      income.textContent = '+' + yen(item.income * item.count) + '/日';
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(count);
      row.appendChild(income);
      host.appendChild(row);
    }
  }

  function renderOffers(s) {
    for (var i = 0; i < offers.length; i++) {
      var ref = offers[i];
      var o = s.offers[i];
      if (!ref.btn) continue;
      if (!o) {
        ref.btn.style.display = 'none';
        continue;
      }
      ref.btn.style.display = '';
      setClass(ref.btn, 'cat-food', o.cat === 'food');
      setClass(ref.btn, 'cat-street', o.cat === 'street');
      setClass(ref.btn, 'cat-tech', o.cat === 'tech');
      setClass(ref.btn, 'is-bought', !!o.bought);
      setClass(ref.btn, 'is-locked', !o.bought && !o.affordable);
      setClass(ref.btn, 'is-bad', !!o.bad && !o.bought);
      text(ref.cat, o.catLabel);
      text(ref.roi, 'ROI ' + Math.round(o.roi * 100) + '%');
      text(ref.name, o.name);
      text(ref.price, yen(o.cost));
      text(ref.income, '+' + yen(o.effectiveIncome) + '/日');
      var payback = '回収 ' + o.payback + '日';
      if (o.bad) payback += '（残り' + o.daysLeft + '日）';
      text(ref.payback, payback);
      setClass(ref.payback, 'is-bad', !!o.bad);

      var buy;
      if (o.bought) buy = '購入済み';
      else if (!o.affordable) buy = '枠が足りない';
      else if (o.debtPart === 0) buy = '買う（現金）';
      else buy = '買う（借入 ' + yen(o.debtPart) + '）';
      text(ref.buy, buy);
      ref.btn.disabled = !!o.bought || !o.affordable;
    }
  }

  function renderForecast(s) {
    var f = s.forecast;
    text(els.fcIncome, '+' + yen(f.income));
    text(els.fcRate, pct(f.rate));
    text(els.fcInterest, '-' + yen(f.interest));
    text(els.fcCash, yen(f.cashAfter));
    text(els.fcDebt, yen(f.debtAfter));
    text(els.forecastDays, '残り' + f.daysLeft + '日');

    var note;
    var danger = false;
    if (f.finalDay) {
      if (f.cashAfter >= f.debtAfter) {
        note = '決済で ' + yen(f.net) + ' が残る見込み。';
      } else {
        note = '決済で ' + yen(f.debtAfter - f.cashAfter) + ' 不足。返済か売上で埋める。';
        danger = true;
      }
    } else {
      note = '差引 ' + signed(f.net) + '（現金 − 借金）。返済は利息を減らす。';
      danger = f.net < 0;
    }
    text(els.fcNote, note);
    setClass(els.fcNote, 'is-danger', danger);
    setClass(els.fcNote, 'is-good', !danger);
  }

  function renderHud(s) {
    text(els.day, s.day + '/' + s.days);
    text(els.cash, yen(s.cash));
    text(els.debt, yen(s.debt));
    text(els.rate, pct(s.rate));
    text(els.credit, '借入 ' + yen(s.debt) + ' / 枠 ' + yen(s.limit));
    if (els.creditBar && els.creditBar.style) {
      els.creditBar.style.width = Math.max(0, Math.min(100, (s.debt / s.limit) * 100)) + '%';
    }
    text(els.assetIncome, '+' + yen(s.income) + '/日');
    text(els.eventName, s.event.name);
    text(els.eventText, s.event.text);
    text(els.shopDaysLeft, '残り' + s.forecast.daysLeft + '日');
  }

  function renderLog() {
    var host = els.log;
    if (!host) return;
    host.textContent = '';
    for (var i = 0; i < logLines.length; i++) {
      var line = document.createElement('li');
      line.className = logLines[i].kind ? 'log-' + logLines[i].kind : '';
      line.textContent = logLines[i].message;
      host.appendChild(line);
    }
    text(els.logCount, logLines.length ? '' : 'まだ記録がない');
  }

  function renderActions(s) {
    var finalDay = s.day >= s.days;
    text(els.btnEnd, s.phase === 'over'
      ? '終了'
      : (finalDay ? '決済する（DAY ' + s.day + ' 終了）' : 'DAY ' + s.day + ' を終える'));
    if (els.btnEnd) els.btnEnd.disabled = s.phase !== 'playing';
    var canRepay = s.phase === 'playing' && s.cash > 0 && s.debt > 0;
    if (els.repay50) els.repay50.disabled = !canRepay;
    if (els.repay200) els.repay200.disabled = !canRepay;
    if (els.repayAll) els.repayAll.disabled = !canRepay;
  }

  function renderHistory(rows) {
    var host = els.history;
    if (!host) return;
    host.textContent = '';
    var head = document.createElement('div');
    head.className = 'history-row is-head';
    var labels = ['DAY', 'MARKET', '売上', '利息', '借金'];
    for (var i = 0; i < labels.length; i++) {
      var cell = document.createElement('span');
      cell.textContent = labels[i];
      head.appendChild(cell);
    }
    host.appendChild(head);

    for (var r = 0; r < rows.length; r++) {
      var h = rows[r];
      var row = document.createElement('div');
      row.className = 'history-row';
      var values = [
        'D' + h.day,
        h.eventName,
        '+' + yen(h.income),
        '-' + yen(h.interest),
        yen(h.debt)
      ];
      for (var v = 0; v < values.length; v++) {
        var span = document.createElement('span');
        span.textContent = values[v];
        row.appendChild(span);
      }
      host.appendChild(row);
    }
  }

  function showEnd(s) {
    if (endShown || !s.result) return;
    endShown = true;
    var r = s.result;
    text(els.endEyebrow, 'SETTLEMENT');
    text(els.endTitle, r.clear ? 'CLEARED' : 'DEFAULT');
    text(els.endSub, r.clear
      ? '借金を返し切った。残金がスコアになった。'
      : '現金が借金に届かなかった。' + yen(r.shortfall) + ' 不足。');
    text(els.endRank, r.rank);
    setClass(els.endRank, 'rank-s', r.rank === 'S');
    setClass(els.endRank, 'rank-a', r.rank === 'A');
    setClass(els.endRank, 'rank-b', r.rank === 'B');
    setClass(els.endRank, 'rank-e', r.rank === 'E');
    text(els.endScore, yen(r.score));
    text(els.endAssets, r.assets);
    text(els.endIncome, yen(r.totalIncome));
    text(els.endInterest, '-' + yen(r.totalInterest));
    text(els.endCash, yen(r.cash));
    text(els.endShortfall, r.clear ? yen(0) : yen(r.shortfall));
    renderHistory(r.history || []);
    if (saveBest(r.score)) updateBestLabel();
    show(els.endOverlay, true);
  }

  function render() {
    if (!state) return;
    processEvents();
    var s = E.snapshot(state);
    renderHud(s);
    renderMults();
    renderForecast(s);
    renderAssets(s);
    renderOffers(s);
    renderActions(s);
    renderLog();
    if (s.phase === 'over') showEnd(s);
  }

  function begin() {
    E.start(state);
    seenEvents = 0;
    logLines = [];
    endShown = false;
    show(els.startOverlay, false);
    show(els.endOverlay, false);
    if (audio) audio.start();
    render();
  }

  function backToTitle() {
    endShown = false;
    show(els.endOverlay, false);
    show(els.startOverlay, true);
    updateBestLabel();
    if (audio) audio.click();
  }

  function buyOffer(index) {
    if (!state || state.phase !== 'playing') return;
    var offer = state.offers[index];
    if (!offer) return;
    if (E.buy(state, offer.id)) render();
  }

  function repayAmount(amount) {
    if (!state || state.phase !== 'playing') return;
    if (E.repay(state, amount) > 0) render();
  }

  function finishDay() {
    if (!state || state.phase !== 'playing') return;
    E.endDay(state);
    render();
  }

  function autoPlayStep() {
    if (!state || state.phase !== 'playing') return;
    E.autoStep(state);
    render();
  }

  function init() {
    els = {
      startOverlay: $('start-overlay'),
      endOverlay: $('end-overlay'),
      btnStart: $('btn-start'),
      btnAgain: $('btn-again'),
      btnTitle: $('btn-title'),
      btnSound: $('btn-sound'),
      btnEnd: $('btn-end'),
      repay50: $('repay-50'),
      repay200: $('repay-200'),
      repayAll: $('repay-all'),
      day: $('day'),
      cash: $('cash'),
      debt: $('debt'),
      rate: $('rate'),
      credit: $('credit'),
      creditBar: $('credit-bar'),
      assetIncome: $('asset-income'),
      assetList: $('asset-list'),
      eventName: $('event-name'),
      eventText: $('event-text'),
      eventMults: $('event-mults'),
      forecastDays: $('forecast-days'),
      fcIncome: $('fc-income'),
      fcRate: $('fc-rate'),
      fcInterest: $('fc-interest'),
      fcCash: $('fc-cash'),
      fcDebt: $('fc-debt'),
      fcNote: $('fc-note'),
      shopDaysLeft: $('shop-daysleft'),
      log: $('log'),
      logCount: $('log-count'),
      endEyebrow: $('end-eyebrow'),
      endTitle: $('end-title'),
      endSub: $('end-sub'),
      endRank: $('end-rank'),
      endScore: $('end-score'),
      endAssets: $('end-assets'),
      endIncome: $('end-income'),
      endInterest: $('end-interest'),
      endCash: $('end-cash'),
      endShortfall: $('end-shortfall'),
      history: $('history'),
      bestStart: $('best-start'),
      endBest: $('end-best')
    };

    offers = [];
    for (var i = 0; i < 4; i++) {
      offers.push({
        btn: $('offer-' + i),
        cat: $('offer-cat-' + i),
        roi: $('offer-roi-' + i),
        name: $('offer-name-' + i),
        price: $('offer-price-' + i),
        income: $('offer-income-' + i),
        payback: $('offer-payback-' + i),
        buy: $('offer-buy-' + i)
      });
    }

    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnAgain) els.btnAgain.addEventListener('click', begin);
    if (els.btnTitle) els.btnTitle.addEventListener('click', backToTitle);
    if (els.btnEnd) els.btnEnd.addEventListener('click', finishDay);
    if (els.repay50) els.repay50.addEventListener('click', function () { repayAmount(50); });
    if (els.repay200) els.repay200.addEventListener('click', function () { repayAmount(200); });
    if (els.repayAll) els.repayAll.addEventListener('click', function () { repayAmount('all'); });
    if (els.btnSound) {
      els.btnSound.addEventListener('click', function () {
        if (!audio) return;
        audio.toggleMute();
        updateSoundLabel();
      });
    }
    for (var k = 0; k < offers.length; k++) {
      (function (index) {
        if (offers[index].btn) {
          offers[index].btn.addEventListener('click', function () { buyOffer(index); });
        }
      })(k);
    }

    if (root.addEventListener) {
      root.addEventListener('keydown', function (e) {
        if (!e) return;
        var key = e.key;
        if (state.phase === 'idle' || state.phase === 'over') {
          if (key === 'Enter' || key === ' ') {
            if (e.preventDefault) e.preventDefault();
            begin();
          }
          return;
        }
        if (state.phase !== 'playing') return;
        if (key >= '1' && key <= '4') {
          if (e.preventDefault) e.preventDefault();
          buyOffer(Number(key) - 1);
        } else if (key === 'e' || key === 'E' || key === 'Enter') {
          if (e.preventDefault) e.preventDefault();
          finishDay();
        } else if (key === 'r' || key === 'R') {
          repayAmount('all');
        }
      });
    }

    loadBest();
    updateBestLabel();
    updateSoundLabel();
    render();

    root.__GAME__ = {
      id: 'debt',
      title: 'DEBT',
      start: function () { begin(); },
      autoPlayStep: autoPlayStep,
      isDone: function () { return !!(state && state.phase === 'over'); },
      getState: function () { return E.snapshot(state); }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
