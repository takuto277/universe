function tryLoad(paths) {
  for (var i = 0; i < paths.length; i++) {
    try { load(paths[i]); return true; } catch (e) { }
  }
  throw new Error('load failed: ' + paths.join(' / '));
}
tryLoad(['audio.js', 'projects/_labs/stick-soccer/audio.js']);
var A = globalThis.SoccerAudio;
var passed = 0;
function assert(cond, message) { if (!cond) throw new Error('assert failed: ' + message); passed++; }

assert(A && typeof A.start === 'function' && typeof A.toggle === 'function', 'SoccerAudio API is missing');

var createdOsc = 0;
var createdNoise = 0;
var intervalFn = null;
var stoppedNoise = 0;
function FakeParam() {
  this.value = 0;
  this.setValueAtTime = function () { };
  this.exponentialRampToValueAtTime = function () { };
}
function FakeGain() { this.gain = new FakeParam(); this.connect = function () { }; }
function FakeFilter() { this.type = ''; this.frequency = new FakeParam(); this.connect = function () { }; }
function FakeOsc() {
  this.type = 'sine';
  this.frequency = new FakeParam();
  this.connect = function () { };
  this.start = function () { createdOsc++; };
  this.stop = function () { };
}
function FakeBuffer() {
  this.getChannelData = function () { return new Float32Array(3200); };
}
function FakeSource() {
  this.buffer = null;
  this.loop = false;
  this.connect = function () { };
  this.start = function () { createdNoise++; };
  this.stop = function () { stoppedNoise++; };
}
function FakeContext() {
  this.currentTime = 0;
  this.state = 'running';
  this.sampleRate = 8000;
  this.destination = {};
  this.createGain = function () { return new FakeGain(); };
  this.createOscillator = function () { return new FakeOsc(); };
  this.createBuffer = function () { return new FakeBuffer(); };
  this.createBufferSource = function () { return new FakeSource(); };
  this.createBiquadFilter = function () { return new FakeFilter(); };
  this.resume = function () { };
}
var fakeCtx = new FakeContext();
globalThis.AudioContext = function () { return fakeCtx; };
globalThis.setInterval = function (fn) { intervalFn = fn; return 1; };
globalThis.clearInterval = function () { intervalFn = null; };

assert(A.isMuted() === false, 'initial audio should not be muted');
A.start();
assert(intervalFn !== null, 'BGM scheduler should start');
assert(createdOsc > 0 && createdNoise > 0, 'BGM should create instruments and crowd noise');

var before = createdOsc;
fakeCtx.currentTime = 5;
intervalFn();
assert(createdOsc > before, 'BGM scheduler should add notes');

A.setMuted(true);
assert(A.isMuted() === true && intervalFn === null, 'muting should stop the BGM scheduler');
var mutedBefore = createdOsc;
fakeCtx.currentTime = 9;
A.setMuted(false);
assert(A.isMuted() === false && intervalFn !== null, 'unmuting should restart the BGM');
assert(createdOsc > mutedBefore, 'unmuted BGM should schedule notes');
var toggleResult = A.toggle();
assert(toggleResult === true && A.isMuted() === true, 'toggle should mute');
A.stop();
assert(intervalFn === null, 'stop should clear the scheduler');
assert(stoppedNoise > 0, 'stop should release the crowd loop');

print('audio tests OK (' + passed + ' アサーション)');
