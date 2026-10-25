/* test-gacha.js : ローカル関数ガチャの抽選・天井・重複・解放（jsc） */
function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}

tryLoad(['content.js', 'graph-cross/content.js']);
tryLoad(['balance.js', 'graph-cross/balance.js']);
tryLoad(['gacha.js', 'graph-cross/gacha.js']);

var C = GraphContent;
var B = GraphBalance;
var G = GraphGacha;
var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}
function sequence(values) {
  var i = 0;
  return function () {
    var v = values[i % values.length];
    i++;
    return v;
  };
}

var s = G.createDefault();
assert(s.points === B.GACHA_START_POINTS, '初期ポイント');
assert(s.unlocked.length === 3 && s.unlocked.indexOf('hold') >= 0 && s.unlocked.indexOf('up') >= 0 && s.unlocked.indexOf('down') >= 0, 'スターター3種');

var normalized = G.normalize({ unlocked: ['wave', 'wave', 'up'], points: -5, pityRare: -2 });
assert(normalized.unlocked.indexOf('wave') >= 0 && normalized.unlocked.indexOf('hold') >= 0, '保存データを正規化');
assert(normalized.unlocked.filter(function (k, i, a) { return a.indexOf(k) === i; }).length === normalized.unlocked.length, '所持関数が重複しない');
assert(normalized.points === 0, '負のポイントを0に');

var all = G.createDefault();
all.unlocked = C.MODE_KEYS.slice();
all.points = 1000;
var complete = G.roll(all, sequence([0.1]));
assert(complete.ok === false && complete.reason === 'complete' && all.points === 1000, '全解放時は回せない');

var state = G.createDefault();
state.points = 1000;
var result = G.roll(state, sequence([0.99, 0.99]));
assert(result.ok === true && result.value.isNew === true, '新規関数を解放');
assert(result.value.rarity === 'epic' && result.value.key === 'gauss', '重み順でEPICを抽選');
assert(result.value.points === 900 && state.unlocked.indexOf('gauss') >= 0, 'ポイント消費と所持追加');

var dup = G.createDefault();
dup.points = 1000;
dup.unlocked = ['hold', 'up', 'down', 'sigmoid', 'gauss'];
dup.pityEpic = B.GACHA_EPIC_PITY - 1;
var dupResult = G.roll(dup, sequence([0.1]));
assert(dupResult.ok && dupResult.value.rarity === 'epic' && dupResult.value.isNew === false, '天井でEPIC重複');
assert(dupResult.value.duplicatePoints === C.RARITY_INFO.epic.duplicate, '重複ポイント');
assert(dup.points === 1000 - B.GACHA_COST + C.RARITY_INFO.epic.duplicate, '重複ポイントが加算');

var pity = G.createDefault();
pity.points = 1000;
pity.pityRare = B.GACHA_RARE_PITY - 1;
var pityResult = G.roll(pity, sequence([0.5, 0.5]));
assert(pityResult.ok && (pityResult.value.rarity === 'rare' || pityResult.value.rarity === 'epic'), 'レア天井');
assert(pity.pityRare === 0, 'レア天井カウンタのリセット');

var grant = G.grant(G.createDefault(), 80);
assert(grant === 80, 'ポイント付与');

print('gacha tests OK (' + passed + ' アサーション)');
