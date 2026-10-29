/* game-back.js : 各ゲームの最上部に共通ナビゲーションバーを追加する */
(function () {
  'use strict';
  if (document.querySelector('[data-game-menu]')) return;

  var script = document.currentScript;
  var hub = script ? new URL('../../index.html', script.src).href : '../../index.html';
  var navHeight = '44px';

  var style = document.createElement('style');
  style.textContent = [
    ':root { --universe-nav-h: calc(' + navHeight + ' + env(safe-area-inset-top)); }',
    'body { padding-top: var(--universe-nav-h) !important; box-sizing: border-box !important; }',
    '#app { height: calc(100dvh - var(--universe-nav-h)) !important; min-height: 0 !important; margin-top: 0 !important; box-sizing: border-box; }',
    '#game-frame { max-height: calc(100dvh - var(--universe-nav-h) - 16px) !important; width: min(calc(100vw - 16px), calc((100dvh - var(--universe-nav-h) - 16px) * 0.6), 520px) !important; }',
    '@supports not (height: 100dvh) { #app { height: calc(100vh - var(--universe-nav-h)) !important; } }'
  ].join('\n');
  document.head.appendChild(style);

  var nav = document.createElement('nav');
  nav.setAttribute('data-game-menu', '');
  nav.setAttribute('aria-label', 'ゲーム共通ナビゲーション');
  nav.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'right:0',
    'z-index:2147483647',
    'height:var(--universe-nav-h)',
    'padding:env(safe-area-inset-top) max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left))',
    'box-sizing:border-box',
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:12px',
    'background:rgba(8,13,22,.92)',
    'border-bottom:1px solid rgba(255,255,255,.18)',
    'backdrop-filter:blur(10px)',
    '-webkit-backdrop-filter:blur(10px)',
    'font:700 12px/1 system-ui,-apple-system,sans-serif',
    'color:#93a5c2'
  ].join(';');

  var brand = document.createElement('span');
  brand.textContent = 'universe';
  brand.style.cssText = 'letter-spacing:2px;color:#57f6ff;font-size:11px;';

  var link = document.createElement('a');
  link.href = hub;
  link.textContent = 'ゲーム一覧へ';
  link.setAttribute('data-game-back', '');
  link.setAttribute('aria-label', 'ゲーム一覧へ戻る');
  link.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'min-height:30px',
    'padding:0 12px',
    'border-radius:8px',
    'border:1px solid rgba(255,255,255,.24)',
    'background:rgba(255,255,255,.06)',
    'color:#edf4ff',
    'text-decoration:none',
    'white-space:nowrap',
    'touch-action:manipulation'
  ].join(';');

  nav.appendChild(brand);
  nav.appendChild(link);
  document.body.appendChild(nav);
})();
