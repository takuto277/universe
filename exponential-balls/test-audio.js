/* test-audio.js : WebAudioのスケジューラが安全に鳴るか（jsc で実行）
 * 実行例:
 *   cd exponential-balls && jsc test-audio.js
 */
load('audio.js');

var passed = 0;
function assert(cond, m) {
  if (!cond) throw new Error('assert failed: ' + m);
  passed++;
}

/* AudioContext がない環境では開始できない */
assert(ExpAudio.start() === false, 'AudioContextなしで開始できてしまう');
assert(ExpAudio.ready() === false, 'AudioContextなしでreadyになる');
ExpAudio.tick(1);
ExpAudio.capture(1, 130.81);
ExpAudio.impact();
ExpAudio.tap();
assert(ExpAudio.toggleMute() === true, 'ミュートにできない');
assert(ExpAudio.toggleMute() === false, 'ミュート解除できない');

var oscStarts = 0;
var createdOsc = 0;
var noiseSources = 0;

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
  this.start = function () { oscStarts += 1; };
  this.stop = function () { };
}
function FakeFilter() {
  this.type = 'lowpass';
  this.frequency = new FakeParam();
  this.Q = new FakeParam();
  this.connect = function () { };
}
function FakeSource() {
  this.buffer = null;
  this.connect = function () { };
  this.start = function () { noiseSources += 1; };
  this.stop = function () { };
}
function FakeDelay() {
  this.delayTime = new FakeParam();
  this.connect = function () { };
}
function FakeContext() {
  this.currentTime = 0;
  this.state = 'running';
  this.sampleRate = 44100;
  this.destination = {};
  this.createGain = function () { return new FakeGain(); };
  this.createOscillator = function () { createdOsc += 1; return new FakeOsc(); };
  this.createBiquadFilter = function () { return new FakeFilter(); };
  this.createBufferSource = function () { return new FakeSource(); };
  this.createDelay = function () { return new FakeDelay(); };
  this.createDynamicsCompressor = function () {
    return {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
      connect: function () { }
    };
  };
  this.createBuffer = function (channels, length) {
    var data = new Float32Array(length);
    return { getChannelData: function () { return data; } };
  };
  this.resume = function () { this.state = 'running'; };
  this.suspend = function () { this.state = 'suspended'; };
}
var fakeCtx = new FakeContext();
globalThis.AudioContext = function () { return fakeCtx; };

assert(ExpAudio.start() === true, 'AudioContextありで開始できない');
assert(ExpAudio.ready() === true, '開始後にreadyでない');

ExpAudio.tick(0);
assert(createdOsc > 0 && oscStarts > 0, '最初のステップで音が鳴らない');
var before = oscStarts;
ExpAudio.tick(10);
assert(oscStarts > before, '10秒時点で音が増えない');
ExpAudio.tick(22);
assert(oscStarts > before, 'ピーク付近で音が増えない');

var beforeGap = createdOsc;
ExpAudio.tick(60);
assert(createdOsc - beforeGap < 50, '長時間の不在後に音が一気に生成される: ' + (createdOsc - beforeGap));

fakeCtx.state = 'suspended';
var beforeSuspend = createdOsc;
ExpAudio.tick(61);
assert(createdOsc === beforeSuspend, '停止中に音が生成される');
fakeCtx.state = 'running';
var beforeResume = createdOsc;
ExpAudio.tick(61.1);
assert(createdOsc > beforeResume, '復帰後に音が再開しない');
assert(createdOsc - beforeResume < 50, '復帰時に音が一気に生成される: ' + (createdOsc - beforeResume));

before = oscStarts;
ExpAudio.capture(62.3, 130.81);
assert(oscStarts > before, 'キャプチャ音が鳴らない');
before = oscStarts;
ExpAudio.impact();
assert(oscStarts > before, 'インパクト音が鳴らない');
before = oscStarts;
ExpAudio.tap();
assert(oscStarts > before, 'タップ音が鳴らない');

before = oscStarts;
assert(ExpAudio.toggleMute() === true, 'ミュートにできない');
ExpAudio.tick(62);
assert(oscStarts === before, 'ミュート中に音が鳴っている');
assert(ExpAudio.toggleMute() === false, 'ミュート解除できない');
ExpAudio.tick(62.2);
assert(oscStarts > before, 'ミュート解除後に音が鳴らない');

assert(noiseSources > 0, 'ノイズ系の音が鳴っていない');

ExpAudio.stop();
assert(ExpAudio.ready() === false, '停止後もreadyのまま');
assert(ExpAudio.start() === true, '停止後に再開できない');
assert(ExpAudio.ready() === true, '再開後にreadyでない');
var beforeRestart = createdOsc;
ExpAudio.tick(0);
assert(createdOsc > beforeRestart, '再開後の最初のステップで音が鳴らない');

print('audio tests OK (' + passed + ' assertions, ' + createdOsc + ' oscillators, ' + noiseSources + ' noise sources)');
