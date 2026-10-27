/* game.js : 起動・シード・共通テスト用インターフェース */
(function (root) {
  'use strict';

  var E = root.LangEngine;
  if (!E) return;

  function seedFromUrl() {
    try {
      var query = (typeof location !== 'undefined' && location.search) ? location.search : '';
      var match = /[?&]seed=(\d+)/.exec(query);
      if (match) return (parseInt(match[1], 10) >>> 0);
    } catch (e) { /* URLが読めない環境ではランダム */ }
    return Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
  }

  var game = E.createGame({ seed: seedFromUrl() });
  if (root.LangUI && root.LangUI.create) {
    root.LangUI.create(game);
  }

  root.__GAME__ = {
    id: 'unknown-word-deal',
    title: '未知語de交渉',
    start: function () { game.start(); },
    autoPlayStep: function () { game.autoStep(); },
    isDone: function () { return game.state.phase === 'ending'; },
    getState: function () { return game.getState(); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
