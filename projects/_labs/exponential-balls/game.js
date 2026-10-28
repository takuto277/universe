/* game.js : 起動・モード別描画ループ・共通テスト用インターフェース */
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
  var lastFx = -10;

  if (root.ExponentialRenderer && canvas) {
    renderer = root.ExponentialRenderer.create(canvas);
  }
  if (root.ExponentialUI) {
    ui = root.ExponentialUI.create(game, renderer);
  }

  function loop(now) {
    var state = game.state;
    if (state.phase === 'playing') {
      if (perfStart == null) {
        perfStart = now;
        lastFx = -10;
      }
      var t = (now - perfStart) / 1000;
      if (!isFinite(t) || t < 0) t = 0;
      var dt = lastNow == null ? 1 / 60 : Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      var frame;
      var audio = root.ExpAudio;
      if (state.mode === 'race' || state.mode === 'race3d') {
        frame = state.mode === 'race3d' ? game.updateRace3D(t, dt) : game.updateRace(t, dt);
        if (audio && audio.tick) audio.tick(t);
        var run = state.mode === 'race3d' ? frame.race3d : frame.race;
        if (audio && run && run.events) {
          for (var e = 0; e < run.events.length; e++) {
            var event = run.events[e];
            if (event.type === 'eliminate' && audio.capture) audio.capture(t, frame.root.freq);
            if (event.type === 'winner' && audio.impact) audio.impact();
            if ((event.type === 'bumper' || event.type === 'spinner' || event.type === 'boost') &&
                audio.tap && t - lastFx > 0.06) {
              audio.tap();
              lastFx = t;
            }
          }
        }
        if (renderer) {
          renderer.update(dt, frame);
          if (state.mode === 'race3d') renderer.drawRace3D(frame, t);
          else renderer.drawRace(frame, t);
        }
        if (ui) {
          if (frame.phase === 'finished') ui.render(frame);
          else ui.update(frame);
        }
      } else {
        frame = state.mode === 'frame' ? game.updateFrame(t, dt) : game.update(t);
        if (audio && audio.tick) audio.tick(t);
        if (state.mode === 'frame') {
          if (audio && audio.capture) {
            for (var c = 0; c < frame.captureEvents.length; c++) {
              var cap = frame.captureEvents[c];
              if (cap.reset) {
                if (audio.impact) audio.impact();
              } else {
                audio.capture(t, frame.root.freq);
              }
            }
          }
          if (renderer) {
            renderer.update(dt, frame);
            renderer.drawFrame(frame, t);
          }
        } else if (renderer) {
          renderer.sync(frame);
          renderer.update(dt, frame);
          renderer.draw(frame, t);
        }
        if (ui) ui.update(frame);
      }
    } else {
      perfStart = null;
      lastNow = null;
    }
    lastNow = now;
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  root.__GAME__ = {
    id: 'exponential-balls',
    title: 'BLOOM',
    start: function (mode) { game.start(mode); },
    startFrame: function () { game.start('frame'); },
    startRace: function () { game.start('race'); },
    startRace3D: function () { game.start('race3d'); },
    autoPlayStep: function () {
      if (game.state.phase === 'start') game.autoStep();
    },
    isDone: function () {
      var s = game.getState();
      if (s.mode === 'race' || s.mode === 'race3d') return s.phase === 'finished';
      return s.phase === 'playing' && (s.mode === 'frame' ? s.captures >= 4 : s.cycle >= 2);
    },
    getState: function () { return game.getState(); }
  };

  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
