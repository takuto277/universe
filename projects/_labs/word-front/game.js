/* game.js : WORD FRONT の描画・入力・画面遷移 */
(function (root) {
  'use strict';

  var E = root.WordFrontEngine;
  if (!E) return;

  var audio = root.WordFrontAudio;
  var canvas = document.getElementById('board');
  var ctx = canvas ? canvas.getContext('2d') : null;

  var LOGICAL = 720;
  var MARGIN = 26;
  var BOARD = E.BOARD;
  var INNER = LOGICAL - MARGIN * 2;
  var CELL = INNER / BOARD;

  var els = {
    start: document.getElementById('start-overlay'),
    end: document.getElementById('end-overlay'),
    time: document.getElementById('time'),
    timerFill: document.getElementById('timer-fill'),
    playerScore: document.getElementById('player-score'),
    cpuScore: document.getElementById('cpu-score'),
    turnLabel: document.getElementById('turn-label'),
    currentWord: document.getElementById('current-word'),
    cursorKana: document.getElementById('cursor-kana'),
    lastMove: document.getElementById('last-move'),
    boardBadge: document.getElementById('board-badge'),
    endEyebrow: document.getElementById('end-eyebrow'),
    endTitle: document.getElementById('end-title'),
    endSub: document.getElementById('end-sub'),
    endPlayer: document.getElementById('end-player'),
    endCpu: document.getElementById('end-cpu'),
    endMeta: document.getElementById('end-meta'),
    btnStart: document.getElementById('btn-start'),
    btnRetry: document.getElementById('btn-retry'),
    btnMute: document.getElementById('btn-mute'),
    btnUndo: document.getElementById('btn-undo'),
    btnHint: document.getElementById('btn-hint'),
    btnConfirm: document.getElementById('btn-confirm')
  };

  var game = E.createGame({ seed: makeSeed() });
  var seenEvents = 0;
  var lastPhase = null;
  var lastNow = null;
  var paperCanvas = null;
  var muted = false;
  var dpr = 1;

  function makeSeed() {
    var now = 0;
    try { now = Date.now ? Date.now() : new Date().getTime(); } catch (e) { now = 20261111; }
    return (now ^ 0x9e3779b9) >>> 0;
  }

  function text(el, value) {
    if (el) el.textContent = value == null ? '' : String(value);
  }

  function toggle(el, name, on) {
    if (el) el.classList.toggle(name, !!on);
  }

  function show(el, on) {
    if (el) el.classList.toggle('visible', !!on);
  }

  function setDisabled(el, on) {
    if (el) el.disabled = !!on;
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.ceil(seconds || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function roundRectPath(c, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }

  function cellCenter(index) {
    var cx = index % BOARD;
    var cy = Math.floor(index / BOARD);
    return {
      x: MARGIN + cx * CELL + CELL / 2,
      y: MARGIN + cy * CELL + CELL / 2
    };
  }

  function buildPaper() {
    var paper = document.createElement('canvas');
    paper.width = LOGICAL;
    paper.height = LOGICAL;
    var p = paper.getContext('2d');
    if (!p) return paper;

    var base = p.createLinearGradient(0, 0, LOGICAL, LOGICAL);
    base.addColorStop(0, '#f6eedf');
    base.addColorStop(0.46, '#ece1cd');
    base.addColorStop(1, '#e6d8c2');
    p.fillStyle = base;
    p.fillRect(0, 0, LOGICAL, LOGICAL);

    var rg = p.createRadialGradient(LOGICAL * 0.28, LOGICAL * 0.2, 60, LOGICAL * 0.5, LOGICAL * 0.5, LOGICAL * 0.82);
    rg.addColorStop(0, 'rgba(255,255,255,0.32)');
    rg.addColorStop(0.6, 'rgba(255,255,255,0.02)');
    rg.addColorStop(1, 'rgba(116,86,52,0.11)');
    p.fillStyle = rg;
    p.fillRect(0, 0, LOGICAL, LOGICAL);

    var seed = 918273645;
    function rnd() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    var i;
    for (i = 0; i < 190; i++) {
      var x = rnd() * LOGICAL;
      var y = rnd() * LOGICAL;
      var len = 14 + rnd() * 90;
      var bend = (rnd() - 0.5) * 10;
      p.strokeStyle = 'rgba(110,84,52,' + (0.018 + rnd() * 0.035).toFixed(3) + ')';
      p.lineWidth = 0.5 + rnd() * 1.1;
      p.beginPath();
      p.moveTo(x, y);
      p.quadraticCurveTo(x + len * 0.5, y + bend, x + len, y + bend * 0.4);
      p.stroke();
    }
    for (i = 0; i < 520; i++) {
      p.fillStyle = 'rgba(89,64,38,' + (0.012 + rnd() * 0.045).toFixed(3) + ')';
      p.beginPath();
      p.arc(rnd() * LOGICAL, rnd() * LOGICAL, 0.4 + rnd() * 1.2, 0, Math.PI * 2);
      p.fill();
    }

    p.strokeStyle = 'rgba(72,52,34,0.34)';
    p.lineWidth = 2;
    roundRectPath(p, 8, 8, LOGICAL - 16, LOGICAL - 16, 18);
    p.stroke();
    p.strokeStyle = 'rgba(201,74,53,0.25)';
    p.lineWidth = 1;
    roundRectPath(p, 12, 12, LOGICAL - 24, LOGICAL - 24, 15);
    p.stroke();
    return paper;
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    dpr = root.devicePixelRatio || 1;
    var px = Math.round(LOGICAL * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawPaper() {
    if (!ctx) return;
    if (paperCanvas) {
      ctx.drawImage(paperCanvas, 0, 0, LOGICAL, LOGICAL);
    } else {
      ctx.fillStyle = '#eee3d0';
      ctx.fillRect(0, 0, LOGICAL, LOGICAL);
    }
  }

  function drawTiles(state, t) {
    if (!ctx) return;
    var valid = {};
    var pathSet = {};
    var hintSet = {};
    var i;
    if (state.phase === 'playing' && state.turn === E.PLAYER && !state.cursor) {
      for (i = 0; i < state.validStarts.length; i++) valid[state.validStarts[i]] = true;
    }
    for (i = 0; i < state.path.length; i++) pathSet[state.path[i]] = true;
    if (state.hintPath) {
      for (i = 0; i < state.hintPath.length; i++) hintSet[state.hintPath[i]] = true;
    }

    for (var index = 0; index < E.CELLS; index++) {
      var cx = index % BOARD;
      var cy = Math.floor(index / BOARD);
      var x = MARGIN + cx * CELL;
      var y = MARGIN + cy * CELL;
      var owner = state.ownership[index];
      var inset = 1.5;

      roundRectPath(ctx, x + inset, y + inset, CELL - inset * 2, CELL - inset * 2, 9);
      if (owner === E.PLAYER) {
        ctx.fillStyle = 'rgba(201,74,53,0.155)';
      } else if (owner === E.CPU) {
        ctx.fillStyle = 'rgba(49,77,120,0.16)';
      } else if ((cx + cy) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,252,243,0.4)';
      } else {
        ctx.fillStyle = 'rgba(247,239,224,0.32)';
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(72,54,38,0.145)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (owner) {
        ctx.fillStyle = owner === E.PLAYER ? 'rgba(159,47,33,0.78)' : 'rgba(35,57,91,0.78)';
        ctx.beginPath();
        ctx.arc(x + CELL - 10, y + 10, 3.1, 0, Math.PI * 2);
        ctx.fill();
      }

      if (valid[index]) {
        var pulse = 0.5 + 0.5 * Math.sin(t * 3.2 + index * 0.7);
        ctx.strokeStyle = 'rgba(201,74,53,' + (0.14 + pulse * 0.22).toFixed(3) + ')';
        ctx.lineWidth = 2;
        roundRectPath(ctx, x + 4.5, y + 4.5, CELL - 9, CELL - 9, 7);
        ctx.stroke();
      }

      if (pathSet[index]) {
        ctx.fillStyle = hintSet[index] ? 'rgba(181,139,69,0.18)' : 'rgba(201,74,53,0.12)';
        roundRectPath(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 8);
        ctx.fill();
      }
    }
  }

  function traceSmooth(pts) {
    ctx.beginPath();
    if (!pts.length) return;
    if (pts.length === 1) {
      ctx.arc(pts[0].x, pts[0].y, 1.4, 0, Math.PI * 2);
      return;
    }
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2;
      var my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    var last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  function drawBrush(path, color, width, alpha) {
    if (!ctx || !path || !path.length) return;
    var pts = [];
    for (var i = 0; i < path.length; i++) pts.push(cellCenter(path[i]));
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(45,33,24,0.28)';
    ctx.lineWidth = width + 6;
    traceSmooth(pts);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    traceSmooth(pts);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,238,0.24)';
    ctx.lineWidth = Math.max(1.4, width * 0.2);
    traceSmooth(pts);
    ctx.stroke();
    ctx.restore();
  }

  function drawKana(state, t) {
    if (!ctx) return;
    var pathSet = {};
    var i;
    for (i = 0; i < state.path.length; i++) pathSet[state.path[i]] = true;

    for (var index = 0; index < E.CELLS; index++) {
      var ch = state.board[index];
      if (!ch) continue;
      var cx = index % BOARD;
      var cy = Math.floor(index / BOARD);
      var x = MARGIN + cx * CELL + CELL / 2;
      var y = MARGIN + cy * CELL + CELL / 2 + 2;
      var owner = state.ownership[index];
      var color = '#2d2621';
      if (owner === E.PLAYER) color = '#7f2d20';
      else if (owner === E.CPU) color = '#243c61';
      if (pathSet[index]) color = state.hintPath ? '#8b672c' : '#8f2a1c';

      ctx.save();
      ctx.font = '700 ' + Math.round(CELL * 0.47) + 'px "Hiragino Mincho ProN", "Yu Mincho", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,252,243,0.5)';
      ctx.shadowBlur = 2;
      ctx.fillStyle = color;
      ctx.fillText(ch, x, y);
      ctx.restore();
    }
  }

  function drawCursor(state, t) {
    if (!ctx || !state.cursor) return;
    var cx = state.cursor.x;
    var cy = state.cursor.y;
    var x = MARGIN + cx * CELL;
    var y = MARGIN + cy * CELL;
    var color = state.turn === E.CPU ? 'rgba(49,77,120,' : 'rgba(201,74,53,';
    var pulse = 0.5 + 0.5 * Math.sin(t * 4.2);

    ctx.save();
    ctx.strokeStyle = color + (0.55 + pulse * 0.35).toFixed(3) + ')';
    ctx.lineWidth = 3.6;
    roundRectPath(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 9);
    ctx.stroke();
    ctx.strokeStyle = color + '0.18)';
    ctx.lineWidth = 8 + pulse * 4;
    roundRectPath(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 10);
    ctx.stroke();
    ctx.fillStyle = color + '0.8)';
    ctx.beginPath();
    ctx.arc(x + CELL / 2, y + CELL - 9, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw(state, t) {
    if (!ctx) return;
    drawPaper();
    drawTiles(state, t);

    if (state.lastMove && state.lastMove.path && state.lastMove.path.length > 1) {
      var lastColor = state.lastMove.mover === 'player' ? 'rgba(159,47,33,0.13)' : 'rgba(35,57,91,0.13)';
      drawBrush(state.lastMove.path, lastColor, CELL * 0.19, 1);
    }
    if (state.path && state.path.length) {
      var pathColor = state.hintPath ? 'rgba(181,139,69,0.92)' : 'rgba(201,74,53,0.94)';
      drawBrush(state.path, pathColor, CELL * 0.22, 1);
    }

    drawKana(state, t);
    drawCursor(state, t);

    ctx.save();
    ctx.strokeStyle = 'rgba(58,43,30,0.25)';
    ctx.lineWidth = 1.2;
    roundRectPath(ctx, MARGIN - 7, MARGIN - 7, INNER + 14, INNER + 14, 16);
    ctx.stroke();
    ctx.restore();
  }

  function processEvents(state) {
    if (!audio || !state.events) return;
    for (var i = seenEvents; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev.type === 'begin' || ev.type === 'extend' || ev.type === 'undo') {
        if (audio.tap) audio.tap();
      } else if (ev.type === 'confirm') {
        if (ev.mover === 'player' && audio.confirm) audio.confirm();
      } else if (ev.type === 'steal') {
        if (audio.steal) audio.steal();
      } else if (ev.type === 'cpu') {
        if (audio.cpu) audio.cpu();
      } else if (ev.type === 'hint') {
        if (audio.hint) audio.hint();
      } else if (ev.type === 'finish') {
        if (ev.winner === 'player') { if (audio.win) audio.win(); }
        else if (ev.winner === 'cpu') { if (audio.lose) audio.lose(); }
        else if (audio.draw) audio.draw();
      }
    }
    seenEvents = state.events.length;
  }

  function updateHud(state) {
    text(els.time, formatTime(state.time));
    text(els.playerScore, state.scores.player);
    text(els.cpuScore, state.scores.cpu);

    var ratio = state.timeLimit ? state.time / state.timeLimit : 0;
    if (els.timerFill) els.timerFill.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
    toggle(els.timerFill, 'low', state.time <= 30 && state.phase === 'playing');

    if (state.phase === 'over') {
      text(els.turnLabel, '終局');
      toggle(els.turnLabel, 'cpu', false);
    } else if (state.turn === E.CPU) {
      text(els.turnLabel, 'CPUの番');
      toggle(els.turnLabel, 'cpu', true);
    } else {
      text(els.turnLabel, 'あなたの番');
      toggle(els.turnLabel, 'cpu', false);
    }

    var word = state.pathWord || '';
    text(els.currentWord, word || '—');
    toggle(els.currentWord, 'empty', !word);
    text(els.cursorKana, state.cursor ? state.cursor.kana : '自由');
    toggle(els.cursorKana, 'cpu', state.turn === E.CPU);

    var playing = state.phase === 'playing';
    var myTurn = playing && state.turn === E.PLAYER;
    setDisabled(els.btnUndo, !(myTurn && state.path.length > 0));
    setDisabled(els.btnHint, !myTurn);
    setDisabled(els.btnConfirm, !(myTurn && state.path.length >= E.MIN_WORD && E.inDictionary(word)));

    if (state.result) {
      text(els.lastMove, '対局終了 ・ あなた ' + state.result.playerScore + ' 対 CPU ' + state.result.cpuScore);
      toggle(els.lastMove, 'cpu', false);
    } else if (state.lastMove) {
      var label = state.lastMove.mover === 'player' ? 'あなた' : 'CPU';
      var line = label + '「' + state.lastMove.word + '」';
      if (state.lastMove.steals > 0) line += ' ・ ' + state.lastMove.steals + 'マス奪取';
      text(els.lastMove, line);
      toggle(els.lastMove, 'cpu', state.lastMove.mover === 'cpu');
    } else if (word) {
      text(els.lastMove, 'ことばを つなげています');
      toggle(els.lastMove, 'cpu', false);
    } else if (state.cursor) {
      text(els.lastMove, '「' + state.cursor.kana + '」から はじまる ことばを つくってください');
      toggle(els.lastMove, 'cpu', false);
    } else {
      text(els.lastMove, 'すきなマスから はじめの ことばを つくってください');
      toggle(els.lastMove, 'cpu', false);
    }

    if (els.boardBadge) {
      var badge = '';
      if (state.phase === 'over') badge = '';
      else if (state.turn === E.CPU) badge = 'CPUが かんがえています';
      else if (word.length >= E.MIN_WORD) badge = 'けってい で 陣地に';
      else if (state.cursor) badge = 'カーソルから はじめる';
      else badge = 'すきなマスから はじめる';
      text(els.boardBadge, badge);
      toggle(els.boardBadge, 'show', !!badge);
    }
  }

  function finishUI(state) {
    var result = state.result || { winner: 'draw', reason: 'time', playerScore: 0, cpuScore: 0, words: [] };
    var winner = result.winner;
    var title = winner === 'player' ? 'あなたの勝ち' : (winner === 'cpu' ? 'CPUの勝ち' : '引き分け');
    var eyebrow = result.reason === 'time' ? 'TIME UP' : (result.reason === 'no-moves' ? 'NO WORDS' : 'FINAL');
    var sub;

    if (winner === 'player') {
      sub = result.reason === 'no-moves' ? '相手がことばをつなげませんでした。' : '陣地を広げて勝利しました。';
    } else if (winner === 'cpu') {
      sub = result.reason === 'no-moves' ? 'あなたがことばをつなげませんでした。' : 'CPUに陣地を押し切られました。';
    } else {
      sub = '陣地の数は同じでした。';
    }

    text(els.endEyebrow, eyebrow);
    text(els.endTitle, title);
    text(els.endSub, sub);
    text(els.endPlayer, result.playerScore);
    text(els.endCpu, result.cpuScore);
    text(els.endMeta, 'ことば ' + (result.words ? result.words.length : 0) + '語 ・ のこり ' + formatTime(result.timeLeft));
    show(els.end, true);

    try {
      if (winner === 'player') {
        var wins = Number(root.localStorage && root.localStorage.getItem('wordfront-wins')) || 0;
        if (root.localStorage) root.localStorage.setItem('wordfront-wins', String(wins + 1));
      }
    } catch (e) { }
  }

  function syncOverlay(state) {
    if (state.phase === lastPhase) return;
    lastPhase = state.phase;
    if (state.phase === 'over') finishUI(state);
    else if (state.phase === 'playing') show(els.end, false);
  }

  function soundLabel() {
    var on = audio ? audio.isEnabled() : false;
    text(els.btnMute, on ? '音 ON' : '音 OFF');
  }

  function prepareRun(isRestart) {
    if (isRestart && game.restart) game.restart(makeSeed());
    else game.start();
    seenEvents = 0;
    lastPhase = null;
    lastNow = null;
    show(els.start, false);
    show(els.end, false);
    toggle(els.boardBadge, 'show', false);
    if (audio && audio.start) audio.start();
    soundLabel();
    var state = game.getState();
    updateHud(state);
    syncOverlay(state);
  }

  function makeMoveFromPointer(event) {
    if (!canvas || !canvas.getBoundingClientRect) return false;
    var rect = canvas.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return false;
    var size = Math.min(rect.width, rect.height);
    var left = rect.left + (rect.width - size) / 2;
    var top = rect.top + (rect.height - size) / 2;
    var px = (event.clientX - left) / size * LOGICAL;
    var py = (event.clientY - top) / size * LOGICAL;
    var gx = Math.floor((px - MARGIN) / CELL);
    var gy = Math.floor((py - MARGIN) / CELL);
    if (gx < 0 || gx >= BOARD || gy < 0 || gy >= BOARD) return false;

    var state = game.state;
    if (state.phase !== 'playing' || state.turn !== E.PLAYER) return false;

    if (state.path.length === 0) {
      var started = game.beginPath(gx, gy);
      if (!started) return false;
    } else {
      var index = gy * BOARD + gx;
      var at = state.path.indexOf(index);
      if (at >= 0 && at < state.path.length - 1) {
        while (state.path.length - 1 > at) game.undoPath();
      } else if (game.extendPath(gx, gy) === false) {
        return false;
      }
    }
    afterInput();
    return true;
  }

  function afterInput() {
    var state = game.getState();
    processEvents(state);
    updateHud(state);
    syncOverlay(state);
  }

  function confirmMove() {
    var state = game.state;
    if (state.phase !== 'playing' || state.turn !== E.PLAYER) return;
    if (game.confirmPath()) afterInput();
  }

  function undoMove() {
    if (game.undoPath()) afterInput();
  }

  function useHint() {
    var before = game.state.time;
    var path = game.hint();
    if (path || game.state.time < before || game.state.phase === 'over') {
      afterInput();
    }
  }

  function toggleMute() {
    if (!audio) return;
    audio.toggleMute();
    try {
      if (root.localStorage) root.localStorage.setItem('wordfront-muted', audio.isEnabled() ? '0' : '1');
    } catch (e) { }
    soundLabel();
  }

  if (els.btnStart) els.btnStart.addEventListener('click', function () { prepareRun(false); });
  if (els.btnRetry) els.btnRetry.addEventListener('click', function () { prepareRun(true); });
  if (els.btnMute) els.btnMute.addEventListener('click', toggleMute);
  if (els.btnUndo) els.btnUndo.addEventListener('click', undoMove);
  if (els.btnHint) els.btnHint.addEventListener('click', useHint);
  if (els.btnConfirm) els.btnConfirm.addEventListener('click', confirmMove);

  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', function (event) {
      if (event && event.preventDefault) event.preventDefault();
      if (event && event.clientX != null) makeMoveFromPointer(event);
    });
    canvas.addEventListener('contextmenu', function (event) {
      if (event && event.preventDefault) event.preventDefault();
    });
  }

  if (root.addEventListener) {
    root.addEventListener('keydown', function (event) {
      if (!event || !event.key) return;
      var key = event.key;
      if (key === 'Enter' || key === ' ') {
        if (event.preventDefault) event.preventDefault();
        confirmMove();
      } else if (key === 'u' || key === 'U' || key === 'Backspace') {
        if (event.preventDefault) event.preventDefault();
        undoMove();
      } else if (key === 'h' || key === 'H') {
        useHint();
      } else if (key === 'm' || key === 'M') {
        toggleMute();
      } else if (key === 'r' || key === 'R') {
        prepareRun(true);
      }
    });
    root.addEventListener('resize', resizeCanvas);
  }

  try {
    muted = root.localStorage && root.localStorage.getItem('wordfront-muted') === '1';
  } catch (e) { muted = false; }
  if (muted && audio && audio.isEnabled()) audio.toggleMute();
  soundLabel();

  paperCanvas = buildPaper();
  resizeCanvas();
  draw(game.getState(), 0);
  updateHud(game.getState());
  show(els.start, true);
  show(els.end, false);

  root.__GAME__ = {
    id: 'word-front',
    title: 'WORD FRONT',
    start: function () { prepareRun(false); },
    autoPlayStep: function () {
      var state = game.state;
      if (state.phase !== 'playing' || state.turn !== E.PLAYER) return;
      game.autoStep();
      afterInput();
    },
    isDone: function () { return game.state.phase === 'over'; },
    getState: function () { return game.getState(); }
  };

  function loop(now) {
    var dt = lastNow == null ? 1 / 60 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (game.state.phase === 'playing') game.update(dt);
    var state = game.getState();
    processEvents(state);
    updateHud(state);
    syncOverlay(state);
    draw(state, now / 1000);
    if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
  }

  if (root.requestAnimationFrame) root.requestAnimationFrame(loop);
})(typeof globalThis !== 'undefined' ? globalThis : this);
