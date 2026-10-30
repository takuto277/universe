/* test-engine.js : ONE CARD DUNGEON */
var E;
try { E = require('./engine.js'); } catch (e) { load('engine.js'); E = OneCardEngine; }
var passed = 0;
function assert(cond, msg) { if (!cond) throw new Error('assert failed: ' + msg); passed++; }
function log(msg) { print(msg); }

var g = E.createGame({ rng: E.mulberry32(1) });
assert(g.phase === 'idle' && g.player.hp === 60, '開始前は待機');
assert(E.start(g) === true && g.phase === 'run', '開始できる');
assert(g.floor === 1 && g.hand.length === 3 && g.enemy, '1Fの手札3枚と敵');
var hp0 = g.enemy.hp;
E.playCard(g, 0);
assert(g.hand.length === 3 && g.enemy.hp <= hp0, 'カードを1枚使って敵にダメージ、手札補充');
assert(g.turns === 1, '敵の行動後にターンが進む');

g = E.createGame({ rng: E.mulberry32(2) });
E.start(g);
g.hand = [{ uid: 99, id: 'guard', name: 'ガード', icon: '🛡', color: '#6db7ff', desc: '7ブロック' }];
g.enemy.intentIndex = 0;
g.enemy.attack = 5;
E.playCard(g, 0);
assert(g.player.shield === 0 && g.player.hp === 60, 'ガードで敵の攻撃を防ぐ');

g = E.createGame({ rng: E.mulberry32(3) });
E.start(g);
g.enemy.hp = 1;
g.hand = [{ uid: 99, id: 'strike', name: 'ストライク', icon: '⚔', color: '#ff6b6b', desc: '7ダメージ' }];
E.playCard(g, 0);
assert(g.phase === 'reward' && g.rewardChoices.length === 3, '敵を倒すとカード選択');
var reward = g.rewardChoices[0];
E.chooseReward(g, 0);
assert(g.floor === 2 && g.phase === 'run' && g.deck.length === 9, '報酬を選んで次の階へ');

g = E.createGame({ rng: E.mulberry32(9) });
E.start(g);
g.floor = 2;
g.phase = 'reward';
g.rewardChoices = ['strike'];
E.chooseReward(g, 0);
assert(g.phase === 'relic' && g.relicChoices.length === 3, '2階クリア後にレリック選択');
var relicId = g.relicChoices[0];
E.chooseRelic(g, 0);
assert(g.floor === 3 && g.phase === 'run' && g.relics[0] === relicId, 'レリックを取得して3階へ');

g = E.createGame({ rng: E.mulberry32(10) });
E.start(g);
g.floor = 1;
g.phase = 'reward';
g.rewardChoices = ['strike'];
g.player.hp = 50;
E.skipReward(g);
assert(g.phase === 'run' && g.floor === 2 && g.player.hp === 60 && g.deck.length === 8, '休憩で回復して次の階へ');

g = E.createGame({ rng: E.mulberry32(11) });
E.start(g);
g.relics = ['whetstone'];
g.hand = [{ uid: 99, id: 'strike', name: 'ストライク', icon: '⚔', color: '#ff6b6b', desc: '8ダメージ' }];
g.enemy.hp = 30;
E.playCard(g, 0);
assert(g.enemy.hp === 20, '砥石で攻撃+2');

g = E.createGame({ rng: E.mulberry32(4) });
E.autoStep(g);
for (var i = 0; i < 500 && !g.over; i++) E.autoStep(g);
assert(g.over && g.result, '自動操作で決着');
assert(g.result.floor >= 1, '結果に到達階層');

log('engine tests OK (' + passed + ' assertions)');
