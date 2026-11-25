// Noor al-Quran - UX enhancements (Round 1)
// Self-contained add-on. Observes DOM + localStorage; never touches app.js internals.
// Load with: <script src="ux.js" defer></script> (before </body>, after app.js).

(function () {
  'use strict';

// ---------- keys (match app.js conventions) ----------
  var PROG_PREFIX    = 'nq:progress:';       // + surahId -> { v: maxVerse, at: ts }
  var LAST_READ_KEY  = 'nq:lastRead';        // written by app.js
  var READ_DAYS_KEY  = 'nq:readDays';        // written by app.js (ISO date strings)
  var DISMISS_PREFIX = 'nq:uxResumeHide:';   // sessionStorage, per-session

// ---------- tiny safe helpers ----------
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

// ---------- styles (injected, all classes prefixed nq-ux-) ----------
  var CSS = [
    // FIX: width 100% so the bar fills its parent column, not the flex card row
    '.nq-ux-prog { margin-top: 6px; width: 100%; }',
    // FIX: cap bar width so it stays compact inside .surah-info
    '.nq-ux-prog-bar { height: 4px; max-width: 220px; border-radius: 99px; background: rgba(127,127,127,.25); overflow: hidden; }',
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
    '@media (min-width: 701px) { .nq-ux-resume { bottom: 24px; } }',
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

// ---------- routing ----------
  function currentSurahRoute() {
    var m = /^#\/surah\/(\d+)(?:\/verse\/(\d+))?$/.exec(location.hash || '');
    return m ? { id: m[1], verse: m[2] ? Number(m[2]) : null } : null;
  }

// ---------- 1) per-surah progress (piggyback on app.js lastRead) ----------
  var lastSeenLastRead = null;
  function trackProgress() {
    var route = currentSurahRoute();
    if (!route || route.verse) return;             // only plain surah view
    var raw;
    try { raw = localStorage.getItem(LAST_READ_KEY); } catch (e) { return; }
    if (!raw || raw === lastSeenLastRead) return;  // unchanged
    lastSeenLastRead = raw;
    var lr = safeGet(LAST_READ_KEY);
    if (!lr || Number(lr.surahId) !== Number(route.id)) return;
    var n = Number(lr.numberInSurah);
    if (!n || n < 1) return;
    var key = PROG_PREFIX + route.id;
    var prev = safeGet(key);
    if (!prev || Number(prev.v) < n) safeSet(key, { v: n, at: Date.now() });
  }

// ---------- 2) progress bars on home surah cards ----------
  function decorateHomeCards() {
    var main = $('#main');
    if (!main) return;
    var links = main.querySelectorAll('a[href^="#/surah/"]');
    Array.prototype.forEach.call(links, function (a) {
      if (a.getAttribute('data-ux-prog')) return;
      var m = /^#\/surah\/(\d+)$/.exec(a.getAttribute('href') || '');
      if (!m) return;                               // skip deep-links (VoD, resume)
      var p = safeGet(PROG_PREFIX + m[1]);
      if (!p || !p.v) return;
      var total = null;
      var mt = /(\d+)\s*verses/i.exec(a.textContent || '');
      if (mt) total = Number(mt[1]);
      var box = document.createElement('div');
      box.className = 'nq-ux-prog';
      var fill = document.createElement('div');
      fill.className = 'nq-ux-prog-fill';
      if (total) fill.style.width = Math.min(100, Math.round((p.v / total) * 100)) + '%';
      var bar = document.createElement('div');
      bar.className = 'nq-ux-prog-bar';
      bar.appendChild(fill);
      var label = document.createElement('span');
      label.className = 'nq-ux-prog-label';
      label.textContent = 'Read up to v.' + p.v + (total ? ' of ' + total : '');
      box.appendChild(bar);
      box.appendChild(label);
      // FIX: append into .surah-info (the card's middle flex column) instead
      // of the card root. Appending to the root made the progress box a 4th
      // flex item in the surah-card row and disturbed the layout. Nesting it
      // here keeps the 3-column card intact and the bar flows under the meta
      // line. Falls back to the card root if .surah-info is ever missing.
      (a.querySelector('.surah-info') || a).appendChild(box);
      a.setAttribute('data-ux-prog', '1');
    });
  }

// ---------- 3) resume pill ----------
  function pillHidden(id) {
    try { return sessionStorage.getItem(DISMISS_PREFIX + id) === '1'; } catch (e) { return false; }
  }
  function hidePill(id) {
    try { sessionStorage.setItem(DISMISS_PREFIX + id, '1'); } catch (e) {}
  }
  function updateResumePill() {
    var old = $('#nqUxResume');
    var route = currentSurahRoute();
    var p = (route && !route.verse) ? safeGet(PROG_PREFIX + route.id) : null;
    var show = !!(p && Number(p.v) >= 2 && !pillHidden(route.id));
    if (!show) { if (old) old.remove(); return; }
    if (old) return;
    var pill = document.createElement('a');
    pill.id = 'nqUxResume';
    pill.className = 'nq-ux-resume';
    pill.href = '#/surah/' + route.id + '/verse/' + p.v;
    pill.setAttribute('aria-label', 'Continue at verse ' + p.v);
    var span = document.createElement('span');
    span.textContent = 'Continue at verse ' + p.v + ' \u2193';
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'nq-ux-resume-x';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '\u2715';
    x.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      hidePill(route.id);
      pill.remove();
    });
    pill.appendChild(span);
    pill.appendChild(x);
    document.body.appendChild(pill);
  }

// ---------- 4) streak mini-calendar ----------
  function decorateStreaks() {
    var days = safeGet(READ_DAYS_KEY);
    if (!days || !days.length) return;
    var seen = {};
    days.forEach(function (d) { if (typeof d === 'string') seen[d.slice(0, 10)] = true; });
    // Note: app.js stores UTC ISO dates; we mirror that convention here.
    var html = '';
    for (var i = 6; i >= 0; i--) {
      var iso = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      html += '<span class="nq-ux-dot' + (seen[iso] ? ' on' : '') + '"></span>';
    }
    ['#heroStreak', '#drawerStreak'].forEach(function (sel) {
      var host = $(sel);
      if (!host || host.querySelector('.nq-ux-dots')) return;
      var wrap = document.createElement('div');
      wrap.className = 'nq-ux-dots';
      wrap.setAttribute('title', 'Last 7 days reading');
      wrap.innerHTML = html;
      host.appendChild(wrap);
    });
  }

// ---------- orchestration ----------
  function refresh() {
    try {
      decorateHomeCards();
      decorateStreaks();
      updateResumePill();
      trackProgress();
    } catch (e) { /* never break the host app */ }
  }

function init() {
    injectStyles();
    refresh();
    var runSoon = debounce(refresh, 150);
    if (window.MutationObserver) {
      new MutationObserver(runSoon).observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('hashchange', runSoon);
    window.addEventListener('load', runSoon);
    setInterval(trackProgress, 2000);
  }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
