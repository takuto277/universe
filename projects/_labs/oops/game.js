/* game.js : OOPS の描画・入力・画面遷移 */
(function (root) {
  'use strict';

  var E = root.OopsEngine;
  if (!E) return;

  var state = E.createGame();
  var audio = root.OopsAudio;
  var running = false;
  var lastNow = null;
  var lastReveal = null;
  var endShown = false;
  var best = 0;
  var els = {};
  var choiceEls = [];
  var choiceTextEls = [];

  function $(id) { return document.getElementById(id); }
  function text(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
  function show(el, on) { if (el) el.classList.toggle('visible', !!on); }
  function setClass(el, name, on) { if (el) el.classList.toggle(name, !!on); }

  function nowMs() {
    if (root.performance && root.performance.now) return root.performance.now();
    return Date.now();
  }

  function loadBest() {
    try {
      best = Number(root.localStorage && root.localStorage.getItem('oops-best')) || 0;
    } catch (e) { best = 0; }
  }

  function saveBest(score) {
    if (!(score > best)) return false;
    best = score;
    try {
      if (root.localStorage) root.localStorage.setItem('oops-best', String(best));
    } catch (e) { }
    return true;
  }

  function updateBestLabel() {
    var label = best > 0 ? 'BEST ' + best : 'BEST ---';
    text(els.bestStart, label);
    text(els.endBest, label);
  }

  function updateSoundLabel() {
    if (!audio || !els.btnSound) return;
    text(els.btnSound, audio.isEnabled() ? 'SOUND ON' : 'SOUND OFF');
  }

  function begin() {
    E.start(state);
    lastReveal = null;
    lastNow = null;
    endShown = false;
    show(els.startOverlay, false);
    show(els.endOverlay, false);
    setClass(els.feedback, 'is-correct', false);
    setClass(els.feedback, 'is-wrong', false);
    setClass(els.feedback, 'is-skip', false);
    setClass(els.clockCard, 'is-hit', false);
    if (audio) audio.start();
    render();
    if (!running) {
      running = true;
      root.requestAnimationFrame(loop);
    }
  }

  function backToTitle() {
    running = false;
    endShown = false;
    show(els.endOverlay, false);
    show(els.startOverlay, true);
    updateBestLabel();
    if (audio) audio.click();
  }

  function pick(index) {
    if (!state || state.phase !== 'question') return;
    if (E.answer(state, index) && audio) audio.click();
    render();
  }

  function doSkip() {
    if (!state || state.phase !== 'question') return;
    if (E.skip(state, false) && audio) audio.click();
    render();
  }

  function formatRank(state) {
    var r = state.result;
    if (!r) return '';
    if (r.clear) return '18問を読み切った。時間は、まだ残っている。';
    return '時間が尽きた。誤答が、時を進めた。';
  }

  function showEnd(s) {
    if (endShown || !s.result) return;
    endShown = true;
    var r = s.result;
    text(els.endEyebrow, r.clear ? 'RUN COMPLETE' : 'TIME UP');
    text(els.endTitle, r.clear ? 'CLEAR' : 'GAME OVER');
    text(els.endSub, formatRank(s));
    text(els.endRank, r.rank);
    setClass(els.endRank, 'rank-s', r.rank === 'S');
    setClass(els.endRank, 'rank-a', r.rank === 'A');
    setClass(els.endRank, 'rank-b', r.rank === 'B');
    text(els.endScore, r.score);
    text(els.endCorrect, r.correct);
    text(els.endWrong, r.wrong);
    text(els.endSkip, r.skipped);
    text(els.endCombo, 'x' + r.bestCombo);
    text(els.endBonus, '+' + r.timeBonus);
    if (saveBest(r.score)) updateBestLabel();
    show(els.endOverlay, true);
    if (audio) audio.finish(r.clear);
  }

  function render() {
    if (!state) return;
    var s = E.snapshot(state);
    var reveal = s.reveal;

    text(els.timeLeft, Math.max(0, Math.ceil(s.timeLeft)));
    if (els.timeBar && els.timeBar.style) {
      els.timeBar.style.width = Math.max(0, Math.min(100, (s.timeLeft / E.START_TIME) * 100)) + '%';
    }
    text(els.clockState, reveal && reveal.wrong ? 'TIME MOVING' : 'FROZEN');
    setClass(els.clockCard, 'is-hit', !!(reveal && reveal.wrong));

    if (reveal && reveal !== lastReveal) {
      lastReveal = reveal;
      if (audio) {
        if (reveal.wrong) audio.wrong();
        else if (reveal.skipped) audio.skip();
        else audio.correct(s.combo);
      }
    }
    if (!reveal) lastReveal = null;

    text(els.score, s.score);
    text(els.combo, 'x' + s.combo);
    var shown = s.phase === 'over' ? s.total : Math.min(s.index + 1, s.total);
    text(els.progress, shown + '/' + s.total);
    text(els.qIndex, 'Q ' + shown + ' / ' + s.total);

    if (s.current) {
      text(els.category, s.current.category);
      text(els.questionText, s.current.q);
      for (var i = 0; i < choiceTextEls.length; i++) {
        text(choiceTextEls[i], s.current.choices[i]);
      }
    }

    for (var c = 0; c < choiceEls.length; c++) {
      var btn = choiceEls[c];
      var isCorrect = !!(reveal && c === reveal.correctIndex);
      var isChosen = !!(reveal && c === reveal.chosen);
      setClass(btn, 'is-correct', isCorrect);
      setClass(btn, 'is-wrong', !!(reveal && reveal.wrong && isChosen));
      setClass(btn, 'is-dim', !!(reveal && !isCorrect && !isChosen));
      if (btn) btn.disabled = !!reveal || s.phase !== 'question';
    }

    if (els.btnSkip) els.btnSkip.disabled = !!reveal || s.phase !== 'question';

    if (reveal) {
      var label = reveal.wrong
        ? 'OOPS  −' + reveal.penalty + 's'
        : reveal.skipped
          ? (reveal.timedOut ? 'TIME OUT' : 'SKIP')
          : reveal.label + '  +' + reveal.gained;
      text(els.feedback, label);
      setClass(els.feedback, 'is-correct', !reveal.wrong && !reveal.skipped);
      setClass(els.feedback, 'is-wrong', !!reveal.wrong);
      setClass(els.feedback, 'is-skip', !!reveal.skipped);
      setClass(els.feedback, 'is-on', true);
      text(els.timeFloat, reveal.wrong ? '−' + reveal.penalty + 's' : '');
      setClass(els.timeFloat, 'is-on', !!reveal.wrong);
    } else {
      text(els.feedback, '');
      setClass(els.feedback, 'is-correct', false);
      setClass(els.feedback, 'is-wrong', false);
      setClass(els.feedback, 'is-skip', false);
      setClass(els.feedback, 'is-on', false);
      setClass(els.timeFloat, 'is-on', false);
    }

    if (s.phase === 'question') {
      var leftMs = Math.max(0, E.QUESTION_MS - s.elapsedMs);
      text(els.timerHint, (leftMs / 1000).toFixed(1) + 's');
      setClass(els.timerHint, 'is-urgent', leftMs < 2000);
    } else {
      text(els.timerHint, '—');
      setClass(els.timerHint, 'is-urgent', false);
    }

    if (s.phase === 'over') showEnd(s);
  }

  function loop(now) {
    if (!running) return;
    var t = (now == null) ? nowMs() : now;
    if (lastNow == null) lastNow = t;
    var dt = t - lastNow;
    lastNow = t;
    E.update(state, dt);
    render();
    if (state.phase === 'over') {
      running = false;
      return;
    }
    root.requestAnimationFrame(loop);
  }

  function autoPlayStep() {
    if (!state) return;
    if (state.phase !== 'question' || !state.current) return;
    E.answer(state, state.current.a);
    render();
  }

  function init() {
    els = {
      startOverlay: $('start-overlay'),
      endOverlay: $('end-overlay'),
      btnStart: $('btn-start'),
      btnAgain: $('btn-again'),
      btnTitle: $('btn-title'),
      btnSkip: $('btn-skip'),
      btnSound: $('btn-sound'),
      timeLeft: $('time-left'),
      timeBar: $('time-bar'),
      timeFloat: $('time-float'),
      clockCard: $('clock-card'),
      clockState: $('clock-state'),
      score: $('score'),
      combo: $('combo'),
      progress: $('progress'),
      category: $('category'),
      qIndex: $('q-index'),
      questionText: $('question-text'),
      feedback: $('feedback'),
      timerHint: $('timer-hint'),
      endEyebrow: $('end-eyebrow'),
      endTitle: $('end-title'),
      endSub: $('end-sub'),
      endRank: $('end-rank'),
      endScore: $('end-score'),
      endCorrect: $('end-correct'),
      endWrong: $('end-wrong'),
      endSkip: $('end-skip'),
      endCombo: $('end-combo'),
      endBonus: $('end-bonus'),
      bestStart: $('best-start'),
      endBest: $('end-best')
    };

    choiceEls = [$('choice-0'), $('choice-1'), $('choice-2'), $('choice-3')];
    choiceTextEls = [$('choice-text-0'), $('choice-text-1'), $('choice-text-2'), $('choice-text-3')];

    if (els.btnStart) els.btnStart.addEventListener('click', begin);
    if (els.btnAgain) els.btnAgain.addEventListener('click', begin);
    if (els.btnTitle) els.btnTitle.addEventListener('click', backToTitle);
    if (els.btnSkip) els.btnSkip.addEventListener('click', doSkip);
    if (els.btnSound) {
      els.btnSound.addEventListener('click', function () {
        if (!audio) return;
        audio.toggleMute();
        updateSoundLabel();
      });
    }
    for (var i = 0; i < choiceEls.length; i++) {
      (function (index) {
        if (choiceEls[index]) {
          choiceEls[index].addEventListener('click', function () { pick(index); });
        }
      })(i);
    }

    if (root.addEventListener) {
      root.addEventListener('keydown', function (e) {
        if (!e) return;
        var key = e.key;
        if (state.phase === 'idle') {
          if (key === 'Enter' || key === ' ') { if (e.preventDefault) e.preventDefault(); begin(); }
          return;
        }
        if (state.phase === 'over') {
          if (key === 'Enter' || key === ' ') { if (e.preventDefault) e.preventDefault(); begin(); }
          return;
        }
        if (key >= '1' && key <= '4') {
          if (e.preventDefault) e.preventDefault();
          pick(Number(key) - 1);
        } else if (key === 's' || key === 'S' || key === ' ' || key === 'Escape') {
          if (e.preventDefault) e.preventDefault();
          doSkip();
        }
      });
    }

    loadBest();
    updateBestLabel();
    updateSoundLabel();
    render();

    root.__GAME__ = {
      id: 'oops',
      title: 'OOPS',
      start: function () { begin(); },
      autoPlayStep: autoPlayStep,
      isDone: function () { return !!(state && state.phase === 'over'); },
      getState: function () { return E.snapshot(state); }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
