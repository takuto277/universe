/* test-engine.js : DEBT のロジック検証（jsc で実行）
 *   cd projects/_labs/debt && jsc test-engine.js
 */
var E;
try {
  E = require('./engine.js');
} catch (e) {
  load('engine.js');
  E = DebtEngine;
}

var passed = 0;
function assert(cond, message) {
  if (!cond) throw new Error('assert failed: ' + message);
  passed++;
}

function newGame(seed) {
  var g = E.createGame({ seed: seed == null ? 20261125 : seed });
  E.start(g);
  return g;
}

function affordableOffer(g, minCost, maxCost) {
  for (var i = 0; i < g.offers.length; i++) {
    var o = g.offers[i];
    if (o.bought) continue;
    if (o.cost < (minCost || 0)) continue;
    if (maxCost != null && o.cost > maxCost) continue;
    if (E.paymentFor(g, o.cost).ok) return o;
  }
  return null;
}

/* 1) 初期化 */
var g = newGame(1);
assert(g.phase === 'playing', '開始後にplayingでない');
assert(g.day === 1 && g.days === 5, 'DAYが1/5でない');
assert(g.cash === 0 && g.debt === 0, '初期の現金/借金が0でない');
assert(g.offers.length === E.OFFERS_PER_DAY, 'オファーが4件でない');
assert(g.event.key === 'normal', '初日のイベントが平常でない');
var seen = {};
for (var i = 0; i < g.offers.length; i++) {
  assert(!seen[g.offers[i].key], '同じ日のオファーが重複している: ' + g.offers[i].key);
  seen[g.offers[i].key] = true;
}

/* 2) 現金0でも借りて買える */
var first = affordableOffer(g, 0, g.limit);
assert(!!first, '借りて買えるオファーがない');
var cost = first.cost;
assert(E.buy(g, first.id) === true, '購入できない');
assert(g.cash === 0, '全額借入のとき現金が減った');
assert(g.debt === cost, '購入額が借金にならない: ' + g.debt + ' / ' + cost);
assert(g.owned.length === 1, '資産が増えない');
assert(first.bought === true, 'オファーが購入済みにならない');
assert(E.buy(g, first.id) === false, '同じオファーを二度買える');

/* 3) 枠を超える購入はできない */
var g2 = newGame(2);
g2.cash = 0;
g2.debt = g2.limit;
var locked = null;
for (var j = 0; j < g2.offers.length; j++) {
  if (g2.offers[j].cost > 0) { locked = g2.offers[j]; break; }
}
assert(E.paymentFor(g2, locked.cost).ok === false, '枠上限でも買える判定になった');
assert(E.buy(g2, locked.id) === false, '枠上限で購入できてしまう');

/* 4) 現金と借金の分割払い */
var g3 = newGame(3);
g3.cash = 30;
g3.debt = 0;
var split = affordableOffer(g3, 31, g3.limit);
assert(!!split, '分割払いのオファーがない');
var splitCost = split.cost;
assert(E.buy(g3, split.id) === true, '分割購入できない');
assert(g3.cash === 0, '現金が使い切られていない');
assert(g3.debt === splitCost - 30, '借入額が正しくない: ' + g3.debt);

/* 5) 現金だけで買える */
var g4 = newGame(4);
g4.cash = 5000;
g4.debt = 0;
var cashOffer = affordableOffer(g4, 0, 5000);
assert(E.buy(g4, cashOffer.id) === true, '現金購入できない');
assert(g4.debt === 0, '現金購入で借金が増えた');
assert(g4.cash === 5000 - cashOffer.cost, '現金購入の残高が不正');

/* 6) 返済 */
var g5 = newGame(5);
g5.cash = 100;
g5.debt = 50;
assert(E.repay(g5, 30) === 30, '返済額が30でない');
assert(g5.cash === 70 && g5.debt === 20, '返済後の現金/借金が不正');
assert(E.repay(g5, 'all') === 20, 'ALL返済が20でない');
assert(g5.cash === 50 && g5.debt === 0, 'ALL返済後の状態が不正');
assert(E.repay(g5, 100) === 0, '借金0で返済できてしまう');

/* 7) 金利 */
assert(E.rateFor(0, 700) === 0, '借金0の金利が0でない');
assert(Math.abs(E.rateFor(350, 700) - 0.15) < 1e-9, '借金50%の金利が15%でない');
assert(Math.abs(E.rateFor(700, 700) - 0.20) < 1e-9, '枠上限の金利が20%でない');
assert(Math.abs(E.rateFor(900, 700) - 0.20) < 1e-9, '金利が20%を超えた');

/* 8) 必要ROI */
var need5 = E.requiredRoi(0.15, 5);
var need2 = E.requiredRoi(0.15, 2);
assert(need5 > 0.29 && need5 < 0.31, '5日・15%の必要ROIが想定外: ' + need5);
assert(need2 > 0.6, '2日・15%の必要ROIが低すぎる: ' + need2);
assert(Math.abs(E.requiredRoi(0, 5) - 0.2) < 1e-9, '金利0の必要ROIが1/5でない');
assert(E.requiredRoi(0.15, 0) === Infinity, '残り0日の必要ROIがInfinityでない');

/* 9) 見込み計算 */
var g6 = newGame(6);
g6.event = E.EVENTS[0];
g6.owned = [{ key: 'x', name: 'x', cat: 'food', income: 100, cost: 100 }];
g6.cash = 50;
g6.debt = 100;
var f = E.forecast(g6);
assert(f.income === 100, '売上見込みが100でない');
assert(Math.abs(f.rate - (0.10 + 0.10 * (100 / 700))) < 1e-9, '見込み金利が不正');
assert(f.interest === 12, '利息が12でない: ' + f.interest);
assert(f.cashAfter === 150 && f.debtAfter === 112, '終了時の現金/借金が不正');
assert(f.net === 38, '差引が38でない');

/* 10) イベント倍率 */
var g7 = newGame(7);
g7.event = E.EVENTS[3];
g7.owned = [{ key: 't', name: 't', cat: 'tech', income: 100, cost: 100 }];
assert(g7.event.key === 'tech', 'テック相場イベントがない');
assert(E.incomeFor(g7, g7.event) === 180, 'テック倍率が売上に効かない');

/* 11) 日を終える */
var g8 = newGame(8);
var dayBefore = g8.day;
E.endDay(g8);
assert(g8.day === dayBefore + 1, '日が進まない');
assert(g8.history.length === 1, '履歴が1件でない');
assert(g8.offers.length === E.OFFERS_PER_DAY, '翌日のオファーが4件でない');
assert(g8.offers[0].bought !== true, '翌日のオファーが購入済みになっている');

/* 12) 最終日の決済（クリア） */
var g9 = newGame(9);
g9.day = 5;
g9.cash = 2000;
g9.debt = 200;
g9.owned = [];
g9.event = E.EVENTS[0];
E.endDay(g9);
assert(g9.phase === 'over', '最終日で終了しない');
assert(g9.result.clear === true, 'クリアにならない');
assert(g9.result.defaulted === false, 'クリアなのにdefaulted');
assert(g9.result.score === 1774, 'クリアスコアが1774でない: ' + g9.result.score);
assert(g9.result.rank === 'S', 'クリアのランクがSでない: ' + g9.result.rank);

/* 13) 最終日の決済（デフォルト） */
var g10 = newGame(10);
g10.day = 5;
g10.cash = 100;
g10.debt = 500;
g10.owned = [];
g10.event = E.EVENTS[0];
E.endDay(g10);
assert(g10.phase === 'over', 'デフォルトで終了しない');
assert(g10.result.clear === false, 'デフォルトなのにclear');
assert(g10.result.defaulted === true, 'defaultedフラグが立たない');
assert(g10.result.score === 0, 'デフォルトのスコアが0でない');
assert(g10.result.rank === 'E', 'デフォルトのランクがEでない');
assert(g10.result.shortfall === 486, '不足額が486でない: ' + g10.result.shortfall);

/* 14) ランク閾値 */
assert(E.rankFor(1000) === 'S', '1000がSでない');
assert(E.rankFor(999) === 'A', '999がAでない');
assert(E.rankFor(750) === 'A', '750がAでない');
assert(E.rankFor(549) === 'C', '549がCでない');
assert(E.rankFor(0) === 'D', '0がDでない');

/* 15) 同じシードの再現性 */
var a = newGame(123);
var b = newGame(123);
assert(a.event.key === b.event.key, '同じシードでイベントが違う');
for (var k = 0; k < a.offers.length; k++) {
  assert(a.offers[k].key === b.offers[k].key, '同じシードでオファーが違う');
  assert(a.offers[k].cost === b.offers[k].cost, '同じシードで価格が違う');
  assert(a.offers[k].income === b.offers[k].income, '同じシードで売上が違う');
}

/* 16) autoStepで完走できる */
var g11 = newGame(777);
var guard = 0;
while (g11.phase !== 'over' && guard < 200) {
  E.autoStep(g11);
  guard++;
}
assert(g11.phase === 'over', 'autoStepで終了しない');
assert(g11.result && typeof g11.result.score === 'number', 'autoStepの結果がない');
assert(g11.history.length === E.DAYS, '履歴が5日分でない: ' + g11.history.length);

print('engine tests OK (' + passed + ' assertions)');
