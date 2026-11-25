// Noor al-Quran - UX enhancements (Round 1 + Round 2 simplification)
// Self-contained add-on. Observes DOM + localStorage; never touches app.js internals.
// Load with: <script src="ux.js" defer></script> (before </body>, after app.js).
//
// Round 1: per-surah progress, home-card progress bars, resume pill, streak dots.
//
// Round 2 (simplification, per user request):
//   - Pin translation to "Urdu - Fateh Muhammad Jalandhry" (ur.jalandhry) only.
//   - Pin reciter to "Mishary Rashid Alafasy" (ar.alafasy) only.
//   - Remove from the drawer menu: the Language & Voice section
//     (translation + reciter dropdowns), the Random surah button,
//     and the Keyboard shortcuts button.
//   - Urdu translation text renders in "Jameel Noori Nastaleeq" webfont.

(function () {
  'use strict';

  // ---------- keys (match app.js conventions) ----------
  var PROG_PREFIX    = 'nq:progress:';       // + surahId -> { v: maxVerse, at: ts }
  var LAST_READ_KEY  = 'nq:lastRead';        // written by app.js
  var READ_DAYS_KEY  = 'nq:readDays';        // written by app.js (ISO date strings)
  var DISMISS_PREFIX = 'nq:uxResumeHide:';   // sessionStorage, per-session

  // ---------- Round 2: pinned values ----------
  var PIN_TRANSLATION = 'ur.jalandhry';      // Urdu - Fateh Muhammad Jalandhry
  var PIN_RECITER     = 'ar.alafasy';        // Mishary Rashid Alafasy
  var PIN_RELOADED    = 'nq:uxPinReloaded';  // sessionStorage guard: reload once max

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

  // ---------- styles (injected, classes prefixed nq-ux-) ----------
  var CSS = [
    // Round 1: progress box lives inside .surah-info column, bar capped at 220px
    '.nq-ux-prog { margin-top: 6px; width: 100%; }',
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
    '.nq-ux-dots { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; vertical-align: middle; pointer-events: none; }',
    '.nq-ux-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .18; }',
    '.nq-ux-dot.on { background: #b58a3b; opacity: 1; }',
    // Round 2: Jameel Noori Nastaleeq for Urdu translation text.
    // Source: jsDelivr mirror of tariq-abdullah/urdu-web-font-CDN.
    '@font-face {',
    '  font-family: "Jameel Noori Nastaleeq";',
    '  src: url("https://cdn.jsdelivr.net/gh/tariq-abdullah/urdu-web-font-CDN@main/JameelNooriNastaleeq.woff") format("woff");',
    '  font-display: swap;',
    '}',
    '.verse-translation[data-rtl="true"] {',
    '  font-family: "Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", serif;',
    '  font-size: 21px; line-height: 2.8;',
    '}'
  ].join('\n');

  function injectStyles() {
    if ($('#nqUxStyles')) return;
    var s = document.createElement('style');
    s.id = 'nqUxStyles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- Round 2: pin translation + reciter ----------
  // app.js reads nq:translation / nq:reciter into its state at startup, before
  // this file runs. So: write the pinned values now; if anything changed and
  // we have not reloaded yet this session, reload once so app.js picks them up.
  function pinSettings() {
    var changed = false;
    try {
      if (localStorage.getItem('nq:translation') !== PIN_TRANSLATION) {
        localStorage.setItem('nq:translation', PIN_TRANSLATION);
        changed = true;
      }
      if (localStorage.getItem('nq:reciter') !== PIN_RECITER) {
        localStorage.setItem('nq:reciter', PIN_RECITER);
        changed = true;
      }
    } catch (e) { return; }
    if (changed) {
      try {
        if (sessionStorage.getItem(PIN_RELOADED) !== '1') {
          sessionStorage.setItem(PIN_RELOADED, '1');
          location.reload();
        }
      } catch (e) { /* storage blocked: values apply from next visit */ }
    }
  }

  // ---------- Round 2: remove simplified-away UI ----------
  // app.js inits the drawer selects before we run, so removing the elements
  // afterwards is safe (their listeners die with the nodes; app.js reads
  // state.translation / state.reciter at use-time, not the selects).
  var uiStripped = false;
  function stripSimplifiedUI() {
    if (uiStripped) return;
    var t = $('#translationSelect');
    if (t && t.closest('.drawer-section')) t.closest('.drawer-section').remove();
    else if (t && t.parentElement) {
      // fallback: hide the two fields if section lookup ever changes
      t.closest('label').style.display = 'none';
      var r0 = $('#reciterSelect');
      if (r0 && r0.closest('label')) r0.closest('label').style.display = 'none';
    }
    var rand = $('#drawerRandom');
    if (rand) rand.remove();
    var kbd = $('#drawerKbd');
    if (kbd) kbd.remove();
    uiStripped = true;
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
      // Round 1 fix: nest inside .surah-info so the card flex row stays intact.
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
      stripSimplifiedUI();
    } catch (e) { /* never break the host app */ }
  }

  function init() {
    pinSettings();
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
