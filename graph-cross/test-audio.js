/* test-audio.js : Web Audio のBGM/SFXが安全に鳴るか（jsc で実行）
 * 実行例:
 *   cd universe/graph-cross && jsc test-audio.js
 */
var A;
try {
  A = require('./audio.js');
} catch (e) {
  load('audio.js');
  A = GraphCrossAudio;
}

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}

/* AudioContext がない環境では create() が null */
assert(A.create() === null, 'AudioContextなしではnull');

var oscStarts = 0;
var createdOsc = 0;
var intervalFn = null;

function FakeParam() {
  this.value = 0;
  this.setValueAtTime = function () { };
  this.exponentialRampToValueAtTime = function () { };
  this.linearRampToValueAtTime = function () { };
  this.setTargetAtTime = function () { };
}
function FakeGain() {
  this.gain = new FakeParam();
  this.connect = function () { };
}
function FakeOsc() {
  this.type = 'sine';
  this.frequency = new FakeParam();
  this.connect = function () { };
  this.start = function () { oscStarts++; };
  this.stop = function () { };
}
function FakeContext() {
  this.currentTime = 0;
  this.state = 'running';
  this.destination = {};
  this.createGain = function () { return new FakeGain(); };
  this.createOscillator = function () { createdOsc++; return new FakeOsc(); };
  this.resume = function () { };
}
var fakeCtx = new FakeContext();
globalThis.AudioContext = function () { return fakeCtx; };
globalThis.setInterval = function (fn) { intervalFn = fn; return 1; };
globalThis.clearInterval = function () { intervalFn = null; };

var audio = A.create();
assert(audio !== null, 'AudioContextがあれば生成できる');
assert(audio.isMuted() === false, '初期状態はミュートなし');

/* 効果音 */
audio.play('hit', 4, true);
assert(createdOsc >= 3, 'ヒット音でオシレータが鳴る');

var before = oscStarts;
audio.play('miss');
assert(oscStarts > before, 'ミス音が鳴る');

var beamBefore = oscStarts;
audio.play('beam');
assert(oscStarts > beamBefore, 'ビーム音が鳴る');

var reviveBefore = oscStarts;
audio.play('revive');
assert(oscStarts > reviveBefore, 'リバイブ音が鳴る');

var warnBefore = oscStarts;
audio.play('warn');
assert(oscStarts > warnBefore, '警告音が鳴る');
audio.play('laser');
audio.play('shot');
audio.play('phase');
audio.play('armor');
audio.play('split');
audio.play('jam');

var guardBefore = oscStarts;
audio.play('guard');
assert(oscStarts > guardBefore, 'コンボガード音が鳴る');

/* BGM は先読みでスケジュールされる */
audio.startBgm();
assert(typeof intervalFn === 'function', 'BGMスケジューラが動く');
var bgmBefore = createdOsc;
fakeCtx.currentTime = 5;
intervalFn();
assert(createdOsc > bgmBefore, 'BGMのノートが追加される');

/* ミュート中は効果音を鳴らさない */
audio.setMuted(true);
assert(audio.isMuted() === true, 'ミュート状態');
var mutedBefore = createdOsc;
audio.play('hit', 1, false);
assert(createdOsc === mutedBefore, 'ミュート中は効果音なし');

/* 再開と停止 */
audio.setIntensity(3);
assert(audio.getIntensity() === 3, 'コンボ強度を設定できる');
audio.setIntensity(0);
assert(audio.getIntensity() === 0, '強度を戻せる');

audio.setMuted(false);
audio.stopBgm();
assert(intervalFn === null, 'BGMを止められる');

print('audio tests OK (' + passed + ' アサーション)');
