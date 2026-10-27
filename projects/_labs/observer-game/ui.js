/* ui.js : 観測者（Observer）の画面描画と入力 */
(function (root) {
  'use strict';

  var ARROWS = ['↑', '→', '↓', '←'];
  var TUTORIAL = [
    {
      title: '動きを観測',
      text: '敵は隠れた規則で1マスずつ動く。まずは「観測する」で動きのクセを読む。'
    },
    {
      title: '次の一手を予測',
      text: '光る隣のタイルをタップ。当たれば+10。外すとライフ-1、ルールが変わる。'
    },
    {
      title: '灯と候補メモ',
      text: '灯を動かすと「灯へ/灯から」を試せる。6つの候補を消去法で絞る。'
    }
  ];

  function $(id) { return document.getElementById(id); }

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function button(label, className, onClick) {
    var el = make('button', className, label);
    el.type = 'button';
    if (onClick) el.addEventListener('click', onClick);
    return el;
  }

  function clear(node) { if (node) node.innerHTML = ''; }
  function setText(node, text) { if (node) node.textContent = text == null ? '' : text; }
  function toggleClass(node, name, on) { if (node) node.classList.toggle(name, !!on); }
  function isHidden(node, hidden) { toggleClass(node, 'is-hidden', hidden); }

  function readBest() {
    try {
      if (!root.localStorage) return { available: false, value: null };
      var raw = root.localStorage.getItem('observer-best');
      if (raw == null) return { available: true, value: null };
      var value = parseInt(raw, 10);
      return { available: true, value: isNaN(value) ? null : value };
    } catch (e) {
      return { available: false, value: null };
    }
  }

  function writeBest(score) {
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem('observer-best', String(score));
      return true;
    } catch (e) {
      return false;
    }
  }

  function create(game) {
    var els = {
      turn: $('turn'),
      correct: $('correct'),
      lives: $('lives'),
      probes: $('probes'),
      feedback: $('feedback'),
      board: $('board'),
      boardHint: $('board-hint'),
      btnObserve: $('btn-observe'),
      btnProbe: $('btn-probe'),
      btnProbeCancel: $('btn-probe-cancel'),
      btnMemo: $('btn-memo'),
      startOverlay: $('start-overlay'),
      btnStart: $('btn-start'),
      btnTutorial: $('btn-tutorial'),
      bestLabel: $('best-label'),
      tutorialOverlay: $('tutorial-overlay'),
      tutorialDots: $('tutorial-dots'),
      tutVisual1: $('tut-visual-1'),
      tutVisual2: $('tut-visual-2'),
      tutVisual3: $('tut-visual-3'),
      tutorialTitle: $('tutorial-title'),
      tutorialText: $('tutorial-text'),
      btnTutorialBack: $('btn-tutorial-back'),
      btnTutorialNext: $('btn-tutorial-next'),
      memoOverlay: $('memo-overlay'),
      memoList: $('memo-list'),
      btnMemoClose: $('btn-memo-close'),
      btnMemoReset: $('btn-memo-reset'),
      endingOverlay: $('ending-overlay'),
      rank: $('rank'),
      endingTitle: $('ending-title'),
      endingText: $('ending-text'),
      endingStats: $('ending-stats'),
      endingRules: $('ending-rules'),
      bestLabelEnd: $('best-label-end'),
      seedLabel: $('seed-label'),
      btnAgain: $('btn-again'),
      btnNew: $('btn-new'),
      btnStartOver: $('btn-start-over')
    };

    var tutorialOpen = false;
    var tutorialSlide = 0;
    var memoOpen = false;
    var probeMode = false;
    var eliminated = {};
    var lastRuleVersion = null;
    var bestCacheKey = null;
    var bestCacheValue = null;
    var bestCacheNew = false;
    var bestCacheAvailable = true;

    function sfx(name) {
      if (root.ObserverAudio) root.ObserverAudio.play(name);
    }

    function snapshot() { return game.getState(); }

    function stat(label, value, wide) {
      var box = make('div', 'stat' + (wide ? ' wide' : ''));
      box.appendChild(make('div', 'k', label));
      box.appendChild(make('div', 'v', value));
      return box;
    }

    function renderHeader(s) {
      setText(els.turn, s.phase === 'ending' ? '終了' : Math.min(s.turn, s.maxTurns) + ' / ' + s.maxTurns);
      setText(els.correct, String(s.correct));
    }

    function renderStatus(s) {
      clear(els.lives);
      for (var i = 0; i < s.maxLives; i++) {
        els.lives.appendChild(make('span', 'pip life' + (i < s.lives ? ' on' : '')));
      }
      clear(els.probes);
      for (var p = 0; p < s.maxProbes; p++) {
        els.probes.appendChild(make('span', 'pip' + (p < s.probesLeft ? ' on' : '')));
      }
      setText(els.feedback, s.feedback);
      if (els.feedback) els.feedback.className = 'feedback ' + (s.feedbackType || 'info');
    }

    function renderBoard(s) {
      clear(els.board);
      var trailMap = {};
      for (var t = 0; t < s.trail.length - 1; t++) {
        trailMap[s.trail[t].x + ',' + s.trail[t].y] = true;
      }
      var optionMap = {};
      for (var o = 0; o < s.options.length; o++) {
        optionMap[s.options[o].x + ',' + s.options[o].y] = true;
      }

      for (var y = 0; y < s.size; y++) {
        for (var x = 0; x < s.size; x++) {
          (function (cx, cy) {
            var key = cx + ',' + cy;
            var isEnemy = s.enemy.x === cx && s.enemy.y === cy;
            var isBeacon = s.beacon.x === cx && s.beacon.y === cy;
            var isOption = !!optionMap[key] && s.phase === 'playing';
            var isProbeTarget = probeMode && !isEnemy;
            var cls = 'tile' + (((cx + cy) % 2) ? ' alt' : '');
            if (isOption) cls += ' option';
            if (isProbeTarget) cls += ' probe-target';
            var cell = button('', cls, function () {
              if (probeMode) {
                if (isEnemy) return;
                if (game.moveBeacon(cx, cy)) {
                  probeMode = false;
                  sfx('note');
                  render(snapshot());
                }
                return;
              }
              if (isOption) {
                var ok = game.predict(cx, cy);
                sfx(ok ? 'success' : 'fail');
              }
            });
            if (trailMap[key] && !isEnemy && !isBeacon) {
              cell.appendChild(make('span', 'trail-dot'));
            }
            if (isBeacon) cell.appendChild(make('span', 'beacon'));
            if (isEnemy) {
              cell.appendChild(make('span', 'orb'));
              cell.appendChild(make('span', 'dir-arrow', ARROWS[s.enemy.dir] || ''));
            }
            els.board.appendChild(cell);
          })(x, y);
        }
      }

      var hint = '';
      if (probeMode) hint = '灯を置くタイルをタップ';
      else if (s.phase === 'playing') hint = '光る隣のタイルをタップして予測。観測で動きを見る。';
      setText(els.boardHint, hint);
    }

    function renderActions(s) {
      if (els.btnObserve) {
        els.btnObserve.disabled = !s.canObserve || probeMode;
      }
      if (els.btnProbe) {
        isHidden(els.btnProbe, probeMode);
        setText(els.btnProbe, '灯を動かす（残り' + s.probesLeft + '）');
        els.btnProbe.disabled = !s.canProbe;
      }
      isHidden(els.btnProbeCancel, !probeMode);
      if (els.btnMemo) els.btnMemo.disabled = s.phase !== 'playing';
    }

    function renderStart(s) {
      var best = readBest();
      if (!best.available) {
        setText(els.bestLabel, s.phase === 'start' ? '自己ベスト: 保存できません' : '');
      } else {
        setText(els.bestLabel, s.phase === 'start' && best.value != null ? '自己ベスト: ' + best.value : '');
      }
    }

    function renderTutorial() {
      if (!tutorialOpen) return;
      var slide = TUTORIAL[tutorialSlide];
      setText(els.tutorialTitle, slide.title);
      setText(els.tutorialText, slide.text);
      var visuals = [els.tutVisual1, els.tutVisual2, els.tutVisual3];
      for (var i = 0; i < visuals.length; i++) toggleClass(visuals[i], 'active', i === tutorialSlide);
      clear(els.tutorialDots);
      for (var d = 0; d < TUTORIAL.length; d++) {
        els.tutorialDots.appendChild(make('span', 'dot' + (d === tutorialSlide ? ' active' : (d < tutorialSlide ? ' done' : ''))));
      }
      setText(els.btnTutorialBack, tutorialSlide === 0 ? '閉じる' : '戻る');
      setText(els.btnTutorialNext, tutorialSlide === TUTORIAL.length - 1 ? 'あそぶ' : '次へ');
    }

    function renderMemo(s) {
      if (!memoOpen) return;
      clear(els.memoList);
      for (var i = 0; i < s.ruleCatalog.length; i++) {
        (function (rule) {
          var card = button('', 'memo-rule' + (eliminated[rule.id] ? ' eliminated' : ''), function () {
            if (eliminated[rule.id]) delete eliminated[rule.id];
            else eliminated[rule.id] = true;
            sfx('click');
            renderMemo(snapshot());
          });
          card.appendChild(make('strong', '', rule.label));
          card.appendChild(make('span', '', rule.desc));
          els.memoList.appendChild(card);
        })(s.ruleCatalog[i]);
      }
    }

    function updateBest(s) {
      var key = s.seed + ':' + s.score + ':' + s.endedAt;
      if (bestCacheKey !== key) {
        var best = readBest();
        var isNew = false;
        if (best.available) {
          isNew = best.value == null || s.score > best.value;
          if (isNew) isNew = writeBest(s.score);
        }
        bestCacheKey = key;
        bestCacheValue = isNew ? s.score : best.value;
        bestCacheNew = isNew;
        bestCacheAvailable = best.available;
      }
      if (!bestCacheAvailable) {
        setText(els.bestLabelEnd, '自己ベスト: 保存できません');
        toggleClass(els.bestLabelEnd, 'new', false);
        return;
      }
      setText(els.bestLabelEnd, (bestCacheNew ? '自己ベスト更新: ' : '自己ベスト: ') + bestCacheValue);
      toggleClass(els.bestLabelEnd, 'new', bestCacheNew);
    }

    function renderEnding(s) {
      if (s.phase !== 'ending') return;
      var ranks = {
        S: { title: '観測の達人', text: '動きの規則を読み切り、次の一手を当て続けた。' },
        A: { title: '鋭い観測者', text: '十分に読めた。あと一歩で達人。' },
        B: { title: '見習い観測者', text: '規則は見え始めた。次はもっと絞れる。' },
        C: { title: 'まだ動きが見えない', text: '次は観測を増やし、灯も試そう。' }
      };
      var info = ranks[s.rank] || ranks.C;
      setText(els.rank, s.rank || 'C');
      setText(els.endingTitle, info.title);
      setText(els.endingText, info.text + ' ' + (s.endedReason || ''));

      clear(els.endingStats);
      els.endingStats.appendChild(stat('正解', String(s.correct)));
      els.endingStats.appendChild(stat('観測', String(s.observations)));
      els.endingStats.appendChild(stat('ミス', String(s.misses)));
      els.endingStats.appendChild(stat('スコア', String(s.score)));
      els.endingStats.appendChild(stat('ターン', String(Math.max(0, s.turn - 1))));
      els.endingStats.appendChild(stat('使った灯', String(s.maxProbes - s.probesLeft)));

      clear(els.endingRules);
      if (s.rulesEncountered && s.rulesEncountered.length) {
        els.endingRules.appendChild(make('h3', '', '出会ったルール'));
        for (var i = 0; i < s.rulesEncountered.length; i++) {
          var rule = s.rulesEncountered[i];
          var chip = make('div', 'rule-chip');
          chip.appendChild(make('b', '', rule.label));
          chip.appendChild(make('span', '', rule.desc));
          els.endingRules.appendChild(chip);
        }
      }

      updateBest(s);
      setText(els.seedLabel, '盤面シード: ' + s.seed + ' ・ 同じ盤面で再挑戦できます');
    }

    function renderOverlays(s) {
      toggleClass(els.startOverlay, 'visible', s.phase === 'start' && !tutorialOpen);
      toggleClass(els.tutorialOverlay, 'visible', tutorialOpen);
      toggleClass(els.memoOverlay, 'visible', memoOpen && s.phase === 'playing');
      toggleClass(els.endingOverlay, 'visible', s.phase === 'ending');
    }

    function render(s) {
      if (s.phase !== 'playing') {
        probeMode = false;
        memoOpen = false;
      }
      if (s.ruleVersion !== lastRuleVersion) {
        eliminated = {};
        lastRuleVersion = s.ruleVersion;
      }
      renderHeader(s);
      renderStatus(s);
      renderBoard(s);
      renderActions(s);
      renderStart(s);
      renderTutorial();
      renderMemo(s);
      renderEnding(s);
      renderOverlays(s);
    }

    function resetUi() {
      tutorialOpen = false;
      tutorialSlide = 0;
      memoOpen = false;
      probeMode = false;
      eliminated = {};
      lastRuleVersion = null;
      bestCacheKey = null;
      bestCacheValue = null;
      bestCacheNew = false;
      bestCacheAvailable = true;
    }

    /* ---------- events ---------- */

    if (els.btnStart) els.btnStart.addEventListener('click', function () {
      tutorialOpen = false;
      memoOpen = false;
      probeMode = false;
      eliminated = {};
      lastRuleVersion = null;
      sfx('open');
      game.start();
      if (root.scrollTo) root.scrollTo(0, 0);
    });

    if (els.btnTutorial) els.btnTutorial.addEventListener('click', function () {
      tutorialOpen = true;
      tutorialSlide = 0;
      sfx('click');
      render(snapshot());
    });

    if (els.btnTutorialNext) els.btnTutorialNext.addEventListener('click', function () {
      if (tutorialSlide < TUTORIAL.length - 1) {
        tutorialSlide += 1;
        sfx('click');
        render(snapshot());
        return;
      }
      tutorialOpen = false;
      sfx('open');
      game.start();
      if (root.scrollTo) root.scrollTo(0, 0);
    });

    if (els.btnTutorialBack) els.btnTutorialBack.addEventListener('click', function () {
      if (tutorialSlide > 0) {
        tutorialSlide -= 1;
        sfx('click');
        render(snapshot());
        return;
      }
      tutorialOpen = false;
      sfx('click');
      render(snapshot());
    });

    if (els.btnObserve) els.btnObserve.addEventListener('click', function () {
      probeMode = false;
      sfx('click');
      game.observe();
    });

    if (els.btnProbe) els.btnProbe.addEventListener('click', function () {
      if (!snapshot().canProbe) return;
      probeMode = true;
      sfx('click');
      render(snapshot());
    });

    if (els.btnProbeCancel) els.btnProbeCancel.addEventListener('click', function () {
      probeMode = false;
      sfx('click');
      render(snapshot());
    });

    if (els.btnMemo) els.btnMemo.addEventListener('click', function () {
      if (snapshot().phase !== 'playing') return;
      memoOpen = true;
      sfx('click');
      render(snapshot());
    });

    if (els.btnMemoClose) els.btnMemoClose.addEventListener('click', function () {
      memoOpen = false;
      sfx('click');
      render(snapshot());
    });

    if (els.btnMemoReset) els.btnMemoReset.addEventListener('click', function () {
      eliminated = {};
      sfx('click');
      render(snapshot());
    });

    if (els.btnAgain) els.btnAgain.addEventListener('click', function () {
      var s = snapshot();
      resetUi();
      sfx('open');
      game.restart(s.seed);
      if (root.scrollTo) root.scrollTo(0, 0);
    });

    if (els.btnNew) els.btnNew.addEventListener('click', function () {
      resetUi();
      sfx('open');
      game.restart(null);
      if (root.scrollTo) root.scrollTo(0, 0);
    });

    if (els.btnStartOver) els.btnStartOver.addEventListener('click', function () {
      resetUi();
      sfx('click');
      game.backToStart();
      if (root.scrollTo) root.scrollTo(0, 0);
    });

    game.onChange(render);
    render(game.getState());

    return {
      render: function () { render(snapshot()); }
    };
  }

  root.ObserverUI = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
