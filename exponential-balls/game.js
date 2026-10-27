/* game.js : 起動・描画ループ・共通テスト用インターフェース */
(function (root) {
  'use strict';

  var E = root.ExponentialEngine;
  if (!E) return;

  var canvas = document.getElementById('canvas');
  var game = E.createGame();
  var renderer = null;
  var ui = null;
  var perfStart = null;
  var lastNow = null;

  if (root.ExponentialRenderer && canvas) {
    renderer = root.ExponentialRenderer.create(canvas);
  }
  if (root.ExponentialUI) {
    ui = root.ExponentialUI.create(game, renderer);
  }

  function loop(now) {
    var state = game.state;
    if (state.phase === 'playing') {
      if (perfStart == null) perfStart = now;
      var t = (now - perfStart) / 1000;
      if (!isFinite(t) || t < 0) t = 0;
      var frame = game.update(t);
      var audio = root.ExpAudio;
      if (audio && audio.tick) audio.tick(t);
      if (renderer) {
        renderer.sync(frame);
        var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        renderer.update(dt, frame);
        renderer.draw(frame, t);
      }
      if (ui) ui.update(frame);
    } else {
      perfStart = null;
    }
    lastNow = now;
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  root.__GAME__ = {
    id: 'exponential-balls',
    title: '倍々',
    start: function () { game.start(); },
    autoPlayStep: function () { game.autoStep(); },
    isDone: function () { return game.state.phase === 'playing' && game.state.cycle >= 2; },
    getState: function () { return game.getState(); }
  };

  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
