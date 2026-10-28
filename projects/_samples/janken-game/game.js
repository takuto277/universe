/* game.js : 画面・入力・進行。ルールは engine.js、3D は renderer.js に任せる */
(function () {
  'use strict';

  var E = (typeof window !== 'undefined' && window.JankenEngine) ? window.JankenEngine : null;
  var R = (typeof window !== 'undefined' && window.JankenRenderer) ? window.JankenRenderer : null;

  var state = null;
  var renderer = null;
  var canvas = null;
  var stageObserver = null;
  var els = {};
  var revealTimers = [];

  /* 結果画面に出す履歴の件数。HUD の履歴(12件)とは別に、振り返りやすさを優先する */
  var END_HISTORY_LIMIT = 5;

  /* phase: idle -> select <-> preview -> reveal -> select / over */
  var view = {
    phase: 'idle',
    playerShown: 'rock',
    cpuShown: 'rock',
    result: null,
    revealAt: 0,
    hit: null
  };

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function $(id) { return document.getElementById(id); }

  /* 試合を開始し直したときに、前の試合のリビール用タイマーが残らないようにする */
  function clearRevealTimers() {
    for (var i = 0; i < revealTimers.length; i++) clearTimeout(revealTimers[i]);
    revealTimers = [];
  }

  /* ===== 表示更新 ===== */
  function setMessage(text, cls) {
    if (!els.message) return;
    els.message.textContent = text;
    els.message.className = 'message' + (cls ? ' ' + cls : '');
  }

  function setHint(text) {
    if (els.hint) els.hint.textContent = text;
  }

  function setDisabled(btn, disabled) {
    if (!btn) return;
    btn.disabled = disabled;
    btn.classList.toggle('disabled', disabled);
  }

  function resultMessage(result) {
    var label = E.HAND_LABELS;
    if (result.result === 'win') {
      var extra = result.usedRead ? ' 先読み必殺!' : (result.damage >= 2 ? ' 連勝ボーナス!' : '');
      return 'win! 「' + label[result.playerHand] + '」が「' + label[result.cpuHand] +
        '」に勝ち +' + result.damage + 'ダメージ' + extra;
    }
    if (result.result === 'lose') {
      return 'lose… 「' + label[result.playerHand] + '」は「' + label[result.cpuHand] +
        '」に負け ' + result.damage + 'ダメージ';
    }
    return 'あいこ 「' + label[result.playerHand] + '」どうしでノーカウント';
  }

  function renderMemo(history) {
    if (!els.memo) return;
    var parts = [];
    var start = Math.max(0, history.length - 12);
    for (var i = start; i < history.length; i++) {
      var e = history[i];
      var cls = e.result === 'win' ? 'win' : e.result === 'lose' ? 'lose' : 'draw';
      var text = E.HAND_MARKS[e.player] + '&gt;' + E.HAND_MARKS[e.cpu];
      if (e.damage > 0) text += '&nbsp;+' + e.damage;
      if (e.read) text = '★' + text;
      parts.push('<span class="mi ' + cls + '" title="' +
        E.HAND_LABELS[e.player] + ' vs ' + E.HAND_LABELS[e.cpu] + '">' + text + '</span>');
    }
    els.memo.innerHTML = parts.join('');
  }

  function renderEndHistory(history) {
    if (!els.endHistory) return;
    if (!history || history.length === 0) {
      els.endHistory.innerHTML = '';
      return;
    }
    var start = Math.max(0, history.length - END_HISTORY_LIMIT);
    var rows = [];
    for (var i = start; i < history.length; i++) {
      var e = history[i];
      var cls = e.result === 'win' ? 'win' : e.result === 'lose' ? 'lose' : 'draw';
      var resultLabel = e.result === 'win' ? '勝ち' : e.result === 'lose' ? '負け' : 'あいこ';
      rows.push('<li class="eh-row ' + cls + '" data-round="' + e.round + '">' +
        '<span class="eh-round">R' + e.round + '</span>' +
        '<span class="eh-hand">' + E.HAND_MARKS[e.player] + '</span>' +
        '<span class="eh-vs">vs</span>' +
        '<span class="eh-hand">' + E.HAND_MARKS[e.cpu] + '</span>' +
        '<span class="eh-result">' + resultLabel + '</span>' +
        '</li>');
    }
    els.endHistory.innerHTML =
      '<div class="eh-title">直近の手 <span>あなた vs CPU</span></div>' +
      '<ul class="eh-list">' + rows.join('') + '</ul>';
  }

  function updateUI() {
    if (!state) return;
    var snap = E.snapshot(state);

    els.hpPlayer.style.width = (snap.hp.player / snap.maxHp * 100) + '%';
    els.hpCpu.style.width = (snap.hp.cpu / snap.maxHp * 100) + '%';
    els.hpPlayer.classList.toggle('low', snap.hp.player <= 2);
    els.hpCpu.classList.toggle('low', snap.hp.cpu <= 2);
    els.roundLabel.textContent = snap.over ? '決着' : 'Round ' + snap.round;
    els.styleChip.textContent = snap.styleName;
    els.styleNote.textContent = E.styleInfo(state.cpuStyle).note;

    var accPct = Math.round(snap.readAccuracy * 100);
    els.readPct.textContent = accPct + '%';
    els.readPct.classList.toggle('hot', accPct >= 40);
    els.readFill.style.width = Math.round(Math.min(1, snap.readAccuracy / 0.55) * 100) + '%';

    var dots = '';
    for (var g = 0; g < snap.gaugeMax; g++) dots += g < snap.gauge ? '●' : '○';
    els.gaugeDots.textContent = dots;
    els.gaugeDots.classList.toggle('full', snap.gauge >= snap.gaugeMax);

    renderMemo(snap.history);

    var interactive = view.phase === 'select' || view.phase === 'preview';
    setDisabled(els.btnRock, !interactive);
    setDisabled(els.btnScissors, !interactive);
    setDisabled(els.btnPaper, !interactive);
    var readOn = view.phase === 'select' && E.canUseRead(state);
    setDisabled(els.btnRead, !readOn);
    els.btnRead.classList.toggle('ready', readOn);
  }

  /* ===== 進行 ===== */
  function beginMatch() {
    clearRevealTimers();
    state = E.createGame({});
    view.phase = 'select';
    view.playerShown = 'rock';
    view.cpuShown = 'rock';
    view.result = null;
    view.revealAt = 0;
    view.hit = null;
    els.screenStart.classList.remove('visible');
    els.screenEnd.classList.remove('visible');
    renderEndHistory([]);
    setMessage('手を選べ! グー / チョキ / パー', null);
    setHint('1〜3 で選択・ゲージ満タンなら 4 で先読み (CPUの手を見てから選べる)');
    updateUI();
  }

  function playHand(hand) {
    if (!state || state.over) return;
    if (view.phase !== 'select' && view.phase !== 'preview') return;
    var result;
    try {
      result = E.resolveRound(state, hand, Math.random);
    } catch (err) {
      return;
    }
    view.result = result;
    view.phase = 'reveal';
    view.revealAt = nowMs();
    view.playerShown = hand;
    view.cpuShown = 'rock';
    setMessage('せーの…', null);
    setHint('');
    revealTimers.push(setTimeout(function () { view.cpuShown = result.cpuHand; }, 480));
    revealTimers.push(setTimeout(finishReveal, 1050));
    updateUI();
  }

  function useRead() {
    if (!state || view.phase !== 'select' || !E.canUseRead(state)) return;
    var hand = E.startRead(state, Math.random);
    view.phase = 'preview';
    setMessage('先読み! CPUは「' + E.HAND_LABELS[hand] + '」を出してくる…', 'gold');
    setHint('勝てる手を選べ! 先読み中の勝ちは3ダメージ');
    updateUI();
  }

  function finishReveal() {
    clearRevealTimers();
    var result = view.result;
    view.result = null;
    if (result) {
      var loser = result.result === 'win' ? 'cpu' : (result.result === 'lose' ? 'player' : null);
      view.hit = { loser: loser, at: nowMs() };
      setMessage(resultMessage(result),
        result.result === 'win' ? 'gold' : (result.result === 'lose' ? 'red' : null));
    }
    if (state.over) {
      view.phase = 'over';
      showEnd();
    } else {
      view.phase = 'select';
      setHint('1〜3 で選択・ゲージ満タンなら 4 で先読み');
    }
    updateUI();
  }

  function showEnd() {
    var snap = E.snapshot(state);
    els.endTitle.textContent = snap.winner === 'player' ? 'あなたの勝ち!' : 'CPUの勝ち…';
    els.endTitle.className = 'end-title ' + (snap.winner === 'player' ? 'win' : 'lose');
    els.endDetail.textContent = 'あなた HP ' + snap.hp.player + ' / CPU HP ' + snap.hp.cpu +
      '・' + snap.history.length + 'ラウンド・CPUのクセ: ' + snap.styleName;
    renderEndHistory(snap.history);
    els.screenEnd.classList.add('visible');
  }

  /* ===== 描画 ===== */
  function drawArena(ts) {
    if (!renderer) return;
    var cpuSpin = 0;
    var playerSpin = 0;
    var cpuShake = 0;
    var playerShake = 0;
    var cpuScale = 1;
    var playerScale = 1;

    if (view.phase === 'reveal') {
      var el = (ts - view.revealAt) / 1000;
      playerSpin = el * 6;
      cpuSpin = el * 9;
      cpuScale = 1 + Math.min(0.16, el * 0.5);
    }

    if (view.hit) {
      var age = ts - view.hit.at;
      if (age > 700) {
        view.hit = null;
      } else if (age >= 0) {
        var k = 1 - age / 700;
        if (view.hit.loser === 'cpu') { cpuShake = k; cpuScale = 1 + 0.3 * k; }
        if (view.hit.loser === 'player') { playerShake = k; playerScale = 1 + 0.3 * k; }
      }
    }

    renderer.draw({
      t: ts,
      cpuHand: view.cpuShown,
      playerHand: view.playerShown,
      cpuSpin: cpuSpin,
      playerSpin: playerSpin,
      cpuShake: cpuShake,
      playerShake: playerShake,
      cpuScale: cpuScale,
      playerScale: playerScale,
      cpuHighlight: !!(view.hit && view.hit.loser === 'cpu'),
      playerHighlight: !!(view.hit && view.hit.loser === 'player')
    });
  }

  function resizeCanvas() {
    if (!canvas) return;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
    var w = canvas.clientWidth || (els.stage && els.stage.clientWidth) || 800;
    var h = canvas.clientHeight || (els.stage && els.stage.clientHeight) || 600;
    if (w <= 0) w = 800;
    if (h <= 0) h = 600;
    if (renderer) renderer.resize(w, h, dpr);
  }

  function watchStageSize() {
    if (typeof ResizeObserver === 'undefined' || !els.stage) return;
    if (!stageObserver) {
      stageObserver = new ResizeObserver(function () { resizeCanvas(); });
    }
    stageObserver.observe(els.stage);
  }

  function startLoop() {
    function frame(ts) {
      if (ts == null) ts = nowMs();
      drawArena(ts);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ===== 入力 ===== */
  function onKey(e) {
    var k = (e && e.key) || '';
    if (!k) return;
    var startVisible = els.screenStart.classList.contains('visible');
    var endVisible = els.screenEnd.classList.contains('visible');
    if (startVisible || endVisible) {
      if (k === 'Enter' || k === ' ') {
        if (e.preventDefault) e.preventDefault();
        beginMatch();
      }
      return;
    }
    if (k === '1') { playHand('rock'); }
    else if (k === '2') { playHand('scissors'); }
    else if (k === '3') { playHand('paper'); }
    else if (k === '4' || k === '0') { useRead(); }
  }

  /* ===== 初期化 ===== */
  function init() {
    canvas = $('arena');
    els.stage = $('stage');
    els.message = $('message');
    els.hint = $('hint');
    els.hpCpu = $('hp-cpu');
    els.hpPlayer = $('hp-player');
    els.roundLabel = $('round-label');
    els.styleChip = $('style-chip');
    els.styleNote = $('style-note');
    els.memo = $('memo');
    els.readPct = $('read-pct');
    els.readFill = $('read-fill');
    els.gaugeDots = $('gauge-dots');
    els.btnRock = $('btn-rock');
    els.btnScissors = $('btn-scissors');
    els.btnPaper = $('btn-paper');
    els.btnRead = $('btn-read');
    els.btnStart = $('btn-start');
    els.btnAgain = $('btn-again');
    els.screenStart = $('screen-start');
    els.screenEnd = $('screen-end');
    els.endTitle = $('end-title');
    els.endDetail = $('end-detail');
    els.endHistory = $('end-history');

    if (R && R.create) renderer = R.create(canvas);

    els.btnRock.addEventListener('click', function () { playHand('rock'); });
    els.btnScissors.addEventListener('click', function () { playHand('scissors'); });
    els.btnPaper.addEventListener('click', function () { playHand('paper'); });
    els.btnRead.addEventListener('click', useRead);
    els.btnStart.addEventListener('click', beginMatch);
    els.btnAgain.addEventListener('click', beginMatch);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', resizeCanvas);

    resizeCanvas();
    watchStageSize();
    startLoop();
    setMessage('「はじめる」を押して勝負!', null);
    setHint('1〜3 で手を選ぶ・4 で先読み');

    if (typeof window !== 'undefined') {
      window.__GAME__ = {
        id: 'janken-game',
        title: '手を読め! 心理戦じゃんけん',
        start: function () { beginMatch(); },
        autoPlayStep: function () {
          if (!state || state.over) return;
          if (view.phase === 'select') {
            if (E.canUseRead(state) && Math.random() < 0.3) { useRead(); return; }
            playHand(E.HANDS[Math.floor(Math.random() * E.HANDS.length)]);
          } else if (view.phase === 'preview') {
            playHand(E.HANDS[Math.floor(Math.random() * E.HANDS.length)]);
          }
        },
        isDone: function () { return !!(state && state.over && view.phase === 'over'); },
        getState: function () {
          if (!state) return { phase: view.phase, over: false };
          var snap = E.snapshot(state);
          snap.phase = view.phase;
          snap.preview = state.preview;
          return snap;
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
