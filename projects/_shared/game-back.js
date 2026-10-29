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
    'top:calc(96px + env(safe-area-inset-top))',
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
})();
