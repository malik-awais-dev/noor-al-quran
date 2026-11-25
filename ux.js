// Noor al-Quran - UX enhancements (Rounds 1-3)
// Self-contained add-on. Observes DOM + localStorage; never touches app.js internals.
// Load with: <script src="ux.js" defer></script> (before </body>, after app.js).
//
// Round 1: per-surah progress, home-card progress bars, resume pill, streak dots.
// Round 2: pinned Urdu (Jalandhry) translation + Alafasy reciter, removed picker UI,
//          Jameel Noori Nastaleeq webfont for Urdu text.
// Round 3: reset-on-completion + Urdu text size control.
//   - Progress record per surah: { v: current pass position, best: furthest ever,
//     done: completion count }. On reaching the final verse, `done` increments,
//     `best` updates, and `v` resets to 0 - so re-reading starts fresh and the
//     resume pill tracks the re-read position. `best`/`done` never reset.
//   - Old { v, at } records migrate transparently on first read (v -> v+best, done 0).
//   - Urdu translation font size: 30px desktop / 24px mobile default, adjustable
//     via a "Urdu text size" slider injected next to the Arabic one in the drawer.

(function () {
  'use strict';

  // ---------- keys (match app.js conventions) ----------
  var PROG_PREFIX    = 'nq:progress:';       // + surahId -> { v, best, done, at }
  var LAST_READ_KEY  = 'nq:lastRead';        // written by app.js
  var READ_DAYS_KEY  = 'nq:readDays';        // written by app.js (ISO date strings)
  var DISMISS_PREFIX = 'nq:uxResumeHide:';   // sessionStorage, per-session
  var URDU_SIZE_KEY  = 'nq:urduSize';        // Round 3: plain number string, like app.js fontSize

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

  // ---------- Round 3: progress record helpers ----------
  // Normalizes any stored shape into { v, best, done, at }.
  // Old Round 1 shape was { v, at } -> migrates to { v: v, best: v, done: 0 }.
  function readProgress(key) {
    var p = safeGet(key);
    if (!p) return { v: 0, best: 0, done: 0, at: 0 };
    return {
      v:    Math.max(0, Number(p.v)    || 0),
      best: Math.max(0, Number(p.best)  || Number(p.v) || 0),  // old shape: best = v
      done: Math.max(0, Number(p.done) || 0),
      at:   Number(p.at) || 0
    };
  }
  function writeProgress(key, rec) { safeSet(key, rec); }

  // Furthest verse number currently rendered in the DOM (current surah view).
  // Used to detect completion without any API call or hardcoded surah lengths.
  function surahTotalFromDOM() {
    var verses = document.querySelectorAll('.verse[data-verse]');
    var max = 0;
    for (var i = 0; i < verses.length; i++) {
      var n = parseInt(verses[i].getAttribute('data-verse'), 10);
      if (n > max) max = n;
    }
    return max;
  }

  // ---------- styles (injected, classes prefixed nq-ux-) ----------
  var CSS = [
    // Round 1: progress box lives inside .surah-info column, bar capped at 220px
    '.nq-ux-prog { margin-top: 6px; width: 100%; }',
    '.nq-ux-prog-bar { height: 4px; max-width: 220px; border-radius: 99px; background: rgba(127,127,127,.25); overflow: hidden; }',
    '.nq-ux-prog-fill { height: 100%; border-radius: 99px; background: #b58a3b; }',
    '.nq-ux-prog-label { display: block; font-size: 11px; margin-top: 3px; opacity: .7; }',
    '.nq-ux-prog-done { color: #b58a3b; opacity: 1; font-weight: 600; }',
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
    // Round 3: font size via --nq-urdu-size (set by the drawer slider).
    // Defaults: 30px desktop, 24px mobile when the variable is unset.
    '.verse-translation[data-rtl="true"] {',
    '  font-family: "Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", serif;',
    '  font-size: var(--nq-urdu-size, 30px); line-height: 2.8;',
    '}',
    '@media (max-width: 700px) {',
    '  .verse-translation[data-rtl="true"] { font-size: var(--nq-urdu-size, 24px); }',
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
  var uiStripped = false;
  function stripSimplifiedUI() {
    if (uiStripped) return;
    var t = $('#translationSelect');
    if (t && t.closest('.drawer-section')) t.closest('.drawer-section').remove();
    else if (t && t.parentElement) {
      // fallback: hide the two fields if section lookup ever changes
      if (t.closest('label')) t.closest('label').style.display = 'none';
      var r0 = $('#reciterSelect');
      if (r0 && r0.closest('label')) r0.closest('label').style.display = 'none';
    }
    var rand = $('#drawerRandom');
    if (rand) rand.remove();
    var kbd = $('#drawerKbd');
    if (kbd) kbd.remove();
    uiStripped = true;
  }

  // ---------- Round 3: Urdu text size control ----------
  // Mirrors app.js's Arabic size slider: injected right after it in the
  // drawer "Reading" section. Defaults 30px desktop / 24px mobile; once the
  // user moves the slider, the stored value applies on all screens.
  var urduSliderAdded = false;
  function urduDefault() {
    return (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) ? 24 : 30;
  }
  function storedUrduSize() {
    try { var s = localStorage.getItem(URDU_SIZE_KEY); return s ? parseInt(s, 10) : null; }
    catch (e) { return null; }
  }
  function applyUrduSize(px) {
    try { document.documentElement.style.setProperty('--nq-urdu-size', px + 'px'); } catch (e) {}
  }
  function addUrduSizeControl() {
    if (urduSliderAdded) return;
    var arabic = $('#fontSizeSlider');
    if (!arabic || !arabic.closest) return;
    var host = arabic.closest('label');
    if (!host || !host.parentNode) return;
    var current = storedUrduSize() || urduDefault();
    current = Math.min(44, Math.max(18, current));
    var label = document.createElement('label');
    label.className = 'drawer-field';
    var span = document.createElement('span');
    span.innerHTML = 'Urdu text size — <em id="nqUrduSizeVal">' + current + '</em>px';
    var range = document.createElement('input');
    range.type = 'range';
    range.min = '18';
    range.max = '44';
    range.step = '1';
    range.id = 'nqUrduSizeSlider';
    range.className = 'drawer-range';
    range.setAttribute('aria-label', 'Urdu font size');
    range.value = String(current);
    range.addEventListener('input', function () {
      var val = Math.min(44, Math.max(18, parseInt(range.value, 10) || 30));
      applyUrduSize(val);
      var em = $('#nqUrduSizeVal');
      if (em) em.textContent = val;
      try { localStorage.setItem(URDU_SIZE_KEY, String(val)); } catch (e) {}
    });
    label.appendChild(span);
    label.appendChild(range);
    host.insertAdjacentElement('afterend', label);
    applyUrduSize(current);
    urduSliderAdded = true;
  }

  // ---------- routing ----------
  function currentSurahRoute() {
    var m = /^#\/surah\/(\d+)(?:\/verse\/(\d+))?$/.exec(location.hash || '');
    return m ? { id: m[1], verse: m[2] ? Number(m[2]) : null } : null;
  }

  // ---------- 1) per-surah progress (piggyback on app.js lastRead) ----------
  // Round 3: reaching the final verse of the current surah completes a pass:
  // done++, best updated, v reset to 0. Otherwise v = max(v, n) so the resume
  // pill tracks the furthest verse of the current (re-)read pass.
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
    var prev = readProgress(key);
    var rec = { v: prev.v, best: prev.best, done: prev.done, at: Date.now() };
    var total = surahTotalFromDOM();
    if (total && n >= total) {
      // Completed this pass. v resets so re-reading starts fresh; best/done persist.
      rec.best = Math.max(prev.best, total);
      rec.done = prev.done + 1;
      rec.v = 0;
    } else {
      rec.v = Math.max(prev.v, n);
      rec.best = Math.max(prev.best, rec.v);
    }
    if (rec.v !== prev.v || rec.best !== prev.best || rec.done !== prev.done) {
      writeProgress(key, rec);
    }
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
      var p = readProgress(PROG_PREFIX + m[1]);
      if (!p || (!p.v && !p.done)) return;
      var total = null;
      var mt = /(\d+)\s*verses/i.exec(a.textContent || '');
      if (mt) total = Number(mt[1]);
      // Bar reflects the current pass; a completed-not-rereading surah shows full.
      var pct = total ? Math.min(100, Math.round((p.v / total) * 100))
                      : (p.done && !p.v ? 100 : 0);
      if (p.done && !p.v) pct = total ? 100 : pct;
      var box = document.createElement('div');
      box.className = 'nq-ux-prog';
      var fill = document.createElement('div');
      fill.className = 'nq-ux-prog-fill';
      fill.style.width = pct + '%';
      var bar = document.createElement('div');
      bar.className = 'nq-ux-prog-bar';
      bar.appendChild(fill);
      var label = document.createElement('span');
      label.className = 'nq-ux-prog-label';
      var times = p.done > 1 ? ' · ' + p.done + '\u00d7' : '';
      if (p.done && !p.v) {
        label.className += ' nq-ux-prog-done';
        label.textContent = 'Completed \u2713' + times;
      } else if (p.done && p.v) {
        label.textContent = 'Re-reading · v.' + p.v + (total ? ' of ' + total : '') + times;
      } else {
        label.textContent = 'Read up to v.' + p.v + (total ? ' of ' + total : '');
      }
      box.appendChild(bar);
      box.appendChild(label);
      // Round 1 fix: nest inside .surah-info so the card flex row stays intact.
      (a.querySelector('.surah-info') || a).appendChild(box);
      a.setAttribute('data-ux-prog', '1');
    });
  }

  // ---------- 3) resume pill ----------
  // Round 3: offers the current pass position. A completed surah (v reset to 0)
  // shows no pill until a re-read pass reaches v.2 or beyond.
  function pillHidden(id) {
    try { return sessionStorage.getItem(DISMISS_PREFIX + id) === '1'; } catch (e) { return false; }
  }
  function hidePill(id) {
    try { sessionStorage.setItem(DISMISS_PREFIX + id, '1'); } catch (e) {}
  }
  function updateResumePill() {
    var old = $('#nqUxResume');
    var route = currentSurahRoute();
    var p = (route && !route.verse) ? readProgress(PROG_PREFIX + route.id) : null;
    var show = !!(p && Number(p.v) >= 2 && !pillHidden(route.id));
    if (!show) { if (old) old.remove(); return; }
    if (old) return;
    var pill = document.createElement('a');
    pill.id = 'nqUxResume';
    pill.className = 'nq-ux-resume';
    pill.href = '#/surah/' + route.id + '/verse/' + p.v;
    pill.setAttribute('aria-label', 'Continue at verse ' + p.v);
    var span = document.createElement('span');
    span.textContent = (p.done ? 'Continue re-reading at verse ' : 'Continue at verse ') + p.v + ' \u2193';
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
      addUrduSizeControl();
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
