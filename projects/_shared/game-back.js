/* game-back.js : 各ゲームの左上に一覧へ戻るボタンを追加する */
(function () {
  'use strict';
  if (document.querySelector('[data-game-back]')) return;

  var script = document.currentScript;
  var hub = script ? new URL('../../index.html', script.src).href : '../../index.html';
  var link = document.createElement('a');
  link.href = hub;
  link.textContent = '← 一覧';
  link.setAttribute('data-game-back', '');
  link.setAttribute('aria-label', 'ゲーム一覧へ戻る');
  link.style.cssText = [
    'position:fixed',
    'top:calc(8px + env(safe-area-inset-top))',
    'left:calc(8px + env(safe-area-inset-left))',
    'z-index:2147483647',
    'display:inline-flex',
    'align-items:center',
    'gap:4px',
    'padding:6px 10px',
    'border-radius:999px',
    'background:rgba(8,13,22,.78)',
    'color:#edf4ff',
    'border:1px solid rgba(255,255,255,.28)',
    'font:700 12px/1.2 system-ui,-apple-system,sans-serif',
    'text-decoration:none',
    'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)',
    'box-shadow:0 4px 14px rgba(0,0,0,.35)',
    'touch-action:manipulation'
  ].join(';');
  document.body.appendChild(link);
})();
