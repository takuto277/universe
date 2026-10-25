/* ui.js : 未知語de交渉 v4 のスマホ向け画面 */
(function (root) {
  'use strict';

  var ICONS = {
    bread: '<svg viewBox="0 0 64 64"><path d="M12 30 C12 20 20 14 32 14 C44 14 52 20 52 30 L52 44 C52 49 48 52 43 52 L21 52 C16 52 12 49 12 44 Z" fill="#d9a45b"/><path d="M20 27 L20 45 M32 24 L32 48 M44 27 L44 45" stroke="#8a5a26" stroke-width="3" stroke-linecap="round" opacity="0.55"/></svg>',
    fish: '<svg viewBox="0 0 64 64"><path d="M10 32 C18 20 34 16 46 22 L54 14 L54 50 L46 42 C34 48 18 44 10 32 Z" fill="#6fb8d9"/><circle cx="24" cy="30" r="2.5" fill="#0c111c"/><path d="M18 36 Q26 40 34 36" stroke="#2c6d8a" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    gem: '<svg viewBox="0 0 64 64"><path d="M32 8 L52 24 L44 52 L20 52 L12 24 Z" fill="#a98bea"/><path d="M32 8 L38 24 L44 52 M32 8 L26 24 L20 52 M12 24 L52 24" stroke="#5f479e" stroke-width="2.5" fill="none" opacity="0.65"/></svg>'
  };

  var TUTORIAL = [
    {
      title: '品物は見えている',
      text: '読むのは、商人が誰に何をしてほしいか。差し出す / 受け取る / 断る の3つから選ぶ。'
    },
    {
      title: 'しぐさもヒント',
      text: 'わからない文法語は、しぐさと前後の語から推理。迷ったら2硬貨で意味を確認できる。'
    },
    {
      title: '最後は契約書',
      text: '契約の主語を読んで、署名するか断るか選ぶ。読み切れば+5硬貨。'
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
      var raw = root.localStorage.getItem('uwd-mobile-best');
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
      root.localStorage.setItem('uwd-mobile-best', String(score));
      return true;
    } catch (e) {
      return false;
    }
  }

  function create(game) {
    var els = {
      progress: $('progress'),
      coins: $('coins'),
      sceneLabel: $('scene-label'),
      merchantName: $('merchant-name'),
      merchantTitle: $('merchant-title'),
      portrait: $('portrait'),
      speechLine: $('speech-line'),
      gesture: $('gesture'),
      actionCard: $('action-card'),
      itemIcon: $('item-icon'),
      itemLabel: $('item-label'),
      itemWord: $('item-word'),
      prompt: $('prompt'),
      actionButtons: $('action-buttons'),
      btnConfirm: $('btn-confirm'),
      resultCard: $('result-card'),
      resultTitle: $('result-title'),
      resultDetail: $('result-detail'),
      resultMessage: $('result-message'),
      resultCoins: $('result-coins'),
      btnNext: $('btn-next'),
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
      contractOverlay: $('contract-overlay'),
      contractLine: $('contract-line'),
      contractMemo: $('contract-memo'),
      btnRefuse: $('btn-refuse'),
      btnSign: $('btn-sign'),
      endingOverlay: $('ending-overlay'),
      rank: $('rank'),
      endingTitle: $('ending-title'),
      endingText: $('ending-text'),
      endingStats: $('ending-stats'),
      endingReview: $('ending-review'),
      bestLabelEnd: $('best-label-end'),
      seedLabel: $('seed-label'),
      btnAgain: $('btn-again'),
      btnNew: $('btn-new'),
      btnStartOver: $('btn-start-over')
    };

    var tutorialOpen = false;
    var tutorialSlide = 0;
    var bestCacheKey = null;
    var bestCacheValue = null;
    var bestCacheNew = false;
    var bestCacheAvailable = true;

    function sfx(name) {
      if (root.LangAudio) root.LangAudio.play(name);
    }

    function snapshot() { return game.getState(); }

    function stat(label, value, wide) {
      var box = make('div', 'stat' + (wide ? ' wide' : ''));
      box.appendChild(make('div', 'k', label));
      box.appendChild(make('div', 'v', value));
      return box;
    }

    function renderHeader(s) {
      var progress = '1 / 3';
      if (s.phase === 'contract') progress = '契約';
      else if (s.phase === 'ending') progress = '結果';
      else if (s.phase === 'scene') progress = s.sceneNumber + ' / ' + s.sceneCount;
      setText(els.progress, progress);
      setText(els.coins, String(s.coins));
    }

    function renderMerchant(s) {
      if (!s.merchant) return;
      if (els.portrait) {
        els.portrait.classList.remove('accent-amber', 'accent-teal', 'accent-violet');
        els.portrait.classList.add('accent-' + s.merchant.accent);
      }
      setText(els.sceneLabel, '商人 ' + s.sceneNumber + ' / ' + s.sceneCount);
      setText(els.merchantName, s.merchant.name);
      setText(els.merchantTitle, s.merchant.title);
    }

    function renderSpeech(s) {
      clear(els.speechLine);
      for (var i = 0; i < s.line.length; i++) {
        var token = s.line[i];
        var chip = make('span', 'word-chip ' + (token.unknown ? 'unknown' : 'known'));
        chip.appendChild(make('span', 'word', token.word));
        chip.appendChild(make('span', 'gloss', token.unknown ? '?' : token.label));
        els.speechLine.appendChild(chip);
      }
      setText(els.gesture, s.gesture);
    }

    function renderItem(s) {
      if (!s.item) return;
      if (els.itemIcon) els.itemIcon.innerHTML = ICONS[s.item.id] || '';
      setText(els.itemLabel, s.item.label);
      setText(els.itemWord, '『' + s.item.word + '』');
    }

    function renderActions(s) {
      setText(els.prompt, s.prompt);
      clear(els.actionButtons);
      for (var i = 0; i < s.actions.length; i++) {
        (function (action) {
          var btn = button('', 'action-btn', function () {
            var ok = game.chooseAction(action.id);
            sfx(ok ? 'success' : 'fail');
          });
          btn.appendChild(make('span', 'label', action.label));
          btn.appendChild(make('span', 'sub', action.sub));
          btn.disabled = !s.canAct;
          els.actionButtons.appendChild(btn);
        })(s.actions[i]);
      }

      if (s.canConfirm) {
        isHidden(els.btnConfirm, false);
        setText(els.btnConfirm, '『' + s.unknownWord + '』の意味を確認（-' + s.confirmCost + '硬貨）');
        if (els.btnConfirm) els.btnConfirm.disabled = false;
      } else {
        isHidden(els.btnConfirm, true);
      }

      isHidden(els.actionCard, !s.canAct);
    }

    function renderResult(s) {
      var show = s.phase === 'scene' && s.scenePhase === 'result' && !!s.sceneResult;
      isHidden(els.resultCard, !show);
      if (!show) return;
      var result = s.sceneResult;
      setText(els.resultTitle, result.title);
      if (els.resultTitle) els.resultTitle.className = 'result-title' + (result.correct ? '' : ' ng');
      setText(els.resultDetail, result.detail);
      setText(els.resultMessage, result.message);
      setText(els.resultCoins, '+' + result.coinsDelta + '硬貨');
      setText(els.btnNext, s.nextLabel);
    }

    function renderStart(s) {
      var best = readBest();
      if (!best.available) {
        setText(els.bestLabel, s.phase === 'start' ? '自己ベスト: 保存できません' : '');
      } else {
        setText(els.bestLabel, s.phase === 'start' && best.value != null ? '自己ベスト: ' + best.value + '硬貨' : '');
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

    function renderContract(s) {
      if (s.phase !== 'contract' || !s.contract) return;
      clear(els.contractLine);
      for (var i = 0; i < s.contract.tokens.length; i++) {
        els.contractLine.appendChild(make('span', 'contract-token', s.contract.tokens[i]));
      }
      clear(els.contractMemo);
      for (var m = 0; m < s.contractMemo.length; m++) {
        var w = s.contractMemo[m];
        var chip = make('span', 'known-chip');
        chip.appendChild(make('b', '', w.word));
        chip.appendChild(make('span', '', w.label));
        els.contractMemo.appendChild(chip);
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
      setText(els.bestLabelEnd, (bestCacheNew ? '自己ベスト更新: ' : '自己ベスト: ') + bestCacheValue + '硬貨');
      toggleClass(els.bestLabelEnd, 'new', bestCacheNew);
    }

    function renderEnding(s) {
      if (s.phase !== 'ending') return;
      var ranks = {
        S: { title: '伝説の通訳者', text: '3人の商人を読み切った。' },
        A: { title: '腕利きの交渉人', text: '十分な利益を上げた。あと一歩で完璧だった。' },
        B: { title: '旅の見習い', text: 'いくつか読み違えたが、旅を続ける力はある。' },
        C: { title: 'ことばに飲まれた者', text: '次はしぐさと文法語を頼りにしよう。' }
      };
      var info = ranks[s.rank] || ranks.C;
      setText(els.rank, s.rank || 'C');
      setText(els.endingTitle, info.title);
      var review = s.review;
      var contractLine = review
        ? (review.optimal ? '契約の読みも正解だった。' : '契約の読みに甘さが残った。')
        : '';
      setText(els.endingText, info.text + ' ' + contractLine);

      clear(els.endingStats);
      var correct = 0;
      for (var i = 0; i < s.history.length; i++) if (s.history[i].correct) correct += 1;
      els.endingStats.appendChild(stat('商人の推理', correct + ' / ' + s.history.length));
      els.endingStats.appendChild(stat('最終硬貨', s.coins + '硬貨'));
      if (review) {
        els.endingStats.appendChild(stat('契約', review.signed ? '署名' : '拒否'));
        els.endingStats.appendChild(stat('契約の効果', review.signed
          ? ((review.effect > 0 ? '+' : '') + review.effect + '硬貨')
          : '適用なし'));
        var summary = s.history.map(function (h) {
          return h.sceneNumber + ':' + (h.correct ? '当' : '外') + ' +' + h.coinsDelta;
        }).join(' / ');
        els.endingStats.appendChild(stat('商人ごとの結果', summary, true));
      }

      updateBest(s);

      clear(els.endingReview);
      if (review) {
        var line = make('div', 'review-line ' + (review.optimal ? 'ok' : 'ng'));
        line.appendChild(make('span', 'rw', review.tokens.join(' ')));
        var ans = make('span', 'ra');
        ans.appendChild(make('span', '', '正解: '));
        ans.appendChild(make('b', '', review.meaning + '（' + (review.effect > 0 ? '+' : '') + review.effect + '硬貨）'));
        ans.appendChild(make('span', '', ' / 正解の選択: ' + review.correctChoice + ' / あなた: ' + review.playerChoice));
        line.appendChild(ans);
        els.endingReview.appendChild(line);
      }

      setText(els.seedLabel, '言語シード: ' + s.seed + ' ・ 同じことばで再挑戦できます');
    }

    function renderOverlays(s) {
      toggleClass(els.startOverlay, 'visible', s.phase === 'start' && !tutorialOpen);
      toggleClass(els.tutorialOverlay, 'visible', tutorialOpen);
      toggleClass(els.contractOverlay, 'visible', s.phase === 'contract');
      toggleClass(els.endingOverlay, 'visible', s.phase === 'ending');
    }

    function render(s) {
      renderHeader(s);
      renderMerchant(s);
      renderSpeech(s);
      renderItem(s);
      renderActions(s);
      renderResult(s);
      renderStart(s);
      renderTutorial();
      renderContract(s);
      renderEnding(s);
      renderOverlays(s);
    }

    function resetBestCache() {
      bestCacheKey = null;
      bestCacheValue = null;
      bestCacheNew = false;
      bestCacheAvailable = true;
    }

    function resetUiForNewRun() {
      tutorialOpen = false;
      tutorialSlide = 0;
      resetBestCache();
    }

    /* ---------- events ---------- */

    if (els.btnStart) els.btnStart.addEventListener('click', function () {
      tutorialOpen = false;
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

    if (els.btnConfirm) els.btnConfirm.addEventListener('click', function () {
      if (!snapshot().canConfirm) return;
      sfx('note');
      game.confirmWord();
    });

    if (els.btnNext) els.btnNext.addEventListener('click', function () {
      sfx('open');
      game.nextScene();
      if (root.scrollTo) root.scrollTo(0, 0);
    });

    if (els.btnSign) els.btnSign.addEventListener('click', function () {
      var ok = game.signContract();
      sfx(ok ? 'sign' : 'fail');
    });

    if (els.btnRefuse) els.btnRefuse.addEventListener('click', function () {
      var ok = game.refuseContract();
      sfx(ok ? 'click' : 'fail');
    });

    if (els.btnAgain) els.btnAgain.addEventListener('click', function () {
      var s = snapshot();
      resetBestCache();
      sfx('open');
      game.restart(s.seed);
      if (root.scrollTo) root.scrollTo(0, 0);
    });

    if (els.btnNew) els.btnNew.addEventListener('click', function () {
      resetBestCache();
      sfx('open');
      game.restart(null);
      if (root.scrollTo) root.scrollTo(0, 0);
    });

    if (els.btnStartOver) els.btnStartOver.addEventListener('click', function () {
      resetUiForNewRun();
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

  root.LangUI = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
