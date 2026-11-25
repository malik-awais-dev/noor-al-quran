// Noor al-Quran - UX Round 1 (loader, part 1/2)
// Per-surah reading progress, home-card progress bars, resume pill, streak dots.
// Self-contained; observes DOM + localStorage; never touches app.js internals.
// Part 2 (ux-p2.js) is appended below by this loader.

(function () {
  'use strict';

  // ---------- shared helpers ----------
  function $(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function safeGet(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms || 150); };
  }

  // ---------- keys (match app.js conventions) ----------
  var PROG_PREFIX   = 'nq:progress:';      // + surahId -> { v: maxVerse, at: ts }
  var LAST_READ_KEY = 'nq:lastRead';       // written by app.js
  var READ_DAYS_KEY = 'nq:readDays';       // written by app.js

  // ---------- styles ----------
  var CSS = [
    '.nq-ux-prog { margin-top: 8px; }',
    '.nq-ux-prog-bar { height: 4px; border-radius: 99px; background: rgba(127,127,127,.25); overflow: hidden; }',
    '.nq-ux-prog-fill { height: 100%; border-radius: 99px; background: #b58a3b; }',
    '.nq-ux-prog-label { display: block; font-size: 11px; margin-top: 3px; opacity: .7; }',
    '.nq-ux-resume { position: fixed; left: 50%; transform: translateX(-50%);',
    '  bottom: calc(88px + env(safe-area-inset-bottom, 0px)); z-index: 60;',
    '  display: flex; align-items: center; gap: 10px;',
    '  background: #0f5132; color: #fff; border-radius: 999px; padding: 10px 16px;',
    '  box-shadow: 0 6px 24px rgba(0,0,0,.25); font-size: 14px; font-weight: 600;',
    '  text-decoration: none; }',
    '.nq-ux-resume:hover, .nq-ux-resume:focus-visible { text-decoration: none; filter: brightness(1.1); }',
    '.nq-ux-resume-x { background: none; border: 0; color: inherit; cursor: pointer;',
    '  display: inline-flex; padding: 2px; opacity: .7; font-size: 15px; line-height: 1; }',
    '.nq-ux-resume-x:hover { opacity: 1; }',
    '@media (min-width: 701px) { .nq-ux-resume { bottom: 4px; } }',
    '.nq-ux-dots { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; vertical-align: middle; }',
    '.nq-ux-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .18; }',
    '.nq-ux-dot.on { background: #b58a3b; opacity: 1; }'
  ].join('\n');

  function injectStyles() {
    if ($('#nqUxStyles')) return;
    var s = document.createElement('style');
    s.id = 'nqUxStyles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // export shared namespace for part 2
  window.NqUx = {
    $: $, safeGet: safeGet, safeSet: safeSet, debounce: debounce,
    PROG_PREFIX: PROG_PREFIX, LAST_READ_KEY: LAST_READ_KEY, READ_DAYS_KEY: READ_DAYS_KEY
  };

  // load part 2
  var s2 = document.createElement('script');
  s2.src = 'ux-p2.js';
  s2.async = false;
  document.head.appendChild(s2);
})();
