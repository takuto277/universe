/* game-back.js : 各ゲームの右端中央に一覧へ戻るタブを追加する */
(function () {
  'use strict';
  if (document.querySelector('[data-game-back]')) return;

  var script = document.currentScript;
  var hub = script ? new URL('../../index.html', script.src).href : '../../index.html';
  var link = document.createElement('a');
  link.href = hub;
  link.textContent = '一覧へ';
  link.title = 'ゲーム一覧へ戻る';
  link.setAttribute('data-game-back', '');
  link.setAttribute('aria-label', 'ゲーム一覧へ戻る');
  link.style.cssText = [
    'position:fixed',
    'top:50%',
    'right:0',
    'transform:translateY(-50%)',
    'z-index:2147483647',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'padding:10px 7px',
    'border-radius:999px 0 0 999px',
    'background:rgba(8,13,22,.78)',
    'color:#edf4ff',
    'border:1px solid rgba(255,255,255,.28)',
    'border-right:0',
    'font:700 12px/1.2 system-ui,-apple-system,sans-serif',
    'letter-spacing:1px',
    'writing-mode:vertical-rl',
    'text-orientation:mixed',
    'text-decoration:none',
    'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)',
    'box-shadow:0 4px 14px rgba(0,0,0,.35)',
    'touch-action:manipulation'
  ].join(';');
  document.body.appendChild(link);
})();
