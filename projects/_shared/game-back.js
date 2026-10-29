/* game-back.js : 各ゲームの右上に共通メニューを追加する */
(function () {
  'use strict';
  if (document.querySelector('[data-game-menu]')) return;

  var script = document.currentScript;
  var hub = script ? new URL('../../index.html', script.src).href : '../../index.html';

  var wrap = document.createElement('div');
  wrap.setAttribute('data-game-menu', '');
  wrap.style.cssText = [
    'position:fixed',
    'top:calc(8px + env(safe-area-inset-top))',
    'right:calc(8px + env(safe-area-inset-right))',
    'z-index:2147483647',
    'font:700 12px/1.2 system-ui,-apple-system,sans-serif'
  ].join(';');

  var button = document.createElement('button');
  button.type = 'button';
  button.textContent = '⋯';
  button.title = 'メニュー';
  button.setAttribute('aria-label', 'メニューを開く');
  button.setAttribute('aria-expanded', 'false');
  button.style.cssText = [
    'width:34px',
    'height:34px',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'border-radius:10px',
    'border:1px solid rgba(255,255,255,.28)',
    'background:rgba(8,13,22,.78)',
    'color:#edf4ff',
    'font:700 20px/1 system-ui,-apple-system,sans-serif',
    'cursor:pointer',
    'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)',
    'box-shadow:0 4px 14px rgba(0,0,0,.35)',
    'touch-action:manipulation'
  ].join(';');

  var panel = document.createElement('div');
  panel.hidden = true;
  panel.style.cssText = [
    'position:absolute',
    'top:42px',
    'right:0',
    'min-width:150px',
    'padding:6px',
    'border-radius:12px',
    'border:1px solid rgba(255,255,255,.24)',
    'background:rgba(8,13,22,.94)',
    'box-shadow:0 14px 36px rgba(0,0,0,.5)',
    'backdrop-filter:blur(10px)',
    '-webkit-backdrop-filter:blur(10px)'
  ].join(';');

  var link = document.createElement('a');
  link.href = hub;
  link.textContent = 'ゲーム一覧へ';
  link.setAttribute('data-game-back', '');
  link.style.cssText = [
    'display:block',
    'padding:10px 12px',
    'border-radius:8px',
    'color:#edf4ff',
    'text-decoration:none',
    'white-space:nowrap'
  ].join(';');
  link.addEventListener('mouseenter', function () { link.style.background = 'rgba(87,246,255,.14)'; });
  link.addEventListener('mouseleave', function () { link.style.background = 'transparent'; });

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) link.focus();
  }

  button.addEventListener('click', function (event) {
    event.preventDefault();
    setOpen(panel.hidden);
  });
  link.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('pointerdown', function (event) {
    if (!panel.hidden && !wrap.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      button.focus();
    }
  });

  panel.appendChild(link);
  wrap.appendChild(button);
  wrap.appendChild(panel);
  document.body.appendChild(wrap);

  function overlaps(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function uiRects() {
    var rects = [];
    var elements = document.querySelectorAll(
      'header, #topbar, #hud, button, input, select, .panel, [role="button"], [class*="hud"]'
    );
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (wrap.contains(el)) continue;
      var style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
    return rects;
  }

  function place() {
    var topBottom = 8;
    var elements = document.querySelectorAll('header, #topbar, #hud, button, input, select, .panel, [role="button"], [class*="hud"]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (wrap.contains(el)) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.right < window.innerWidth - 260 || rect.top > 400) continue;
      if (rect.bottom > topBottom) topBottom = rect.bottom;
    }

    var width = 34;
    var height = 34;
    var candidates = [
      { top: Math.max(8, topBottom + 8), right: 8 },
      { top: Math.round(window.innerHeight / 2 - height / 2), right: 8 },
      { top: window.innerHeight - height - 18, right: 8 },
      { top: Math.max(8, topBottom + 8), left: 8 },
      { top: Math.round(window.innerHeight / 2 - height / 2), left: 8 }
    ];
    var occupied = uiRects();
    var chosen = null;
    for (var c = 0; c < candidates.length; c++) {
      var candidate = candidates[c];
      var left = candidate.left == null ? window.innerWidth - candidate.right - width : candidate.left;
      var box = { left: left, right: left + width, top: candidate.top, bottom: candidate.top + height };
      var hit = false;
      for (var r = 0; r < occupied.length; r++) {
        if (overlaps(box, occupied[r])) { hit = true; break; }
      }
      if (!hit) { chosen = candidate; break; }
    }
    chosen = chosen || candidates[2];
    wrap.style.top = 'calc(' + chosen.top + 'px + env(safe-area-inset-top))';
    wrap.style.right = chosen.right == null ? 'auto' : 'calc(' + chosen.right + 'px + env(safe-area-inset-right))';
    wrap.style.left = chosen.left == null ? 'auto' : 'calc(' + chosen.left + 'px + env(safe-area-inset-left))';
    var opensUp = chosen.top > window.innerHeight / 2;
    panel.style.top = opensUp ? 'auto' : '42px';
    panel.style.bottom = opensUp ? '42px' : 'auto';
  }

  place();
  window.addEventListener('resize', place);
  if (typeof setTimeout === 'function') setTimeout(place, 300);
})();
