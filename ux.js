// Noor al-Quran - UX enhancements (Rounds 1-4)
// Self-contained add-on. Observes DOM + localStorage; never touches app.js internals.
// Load with: <script src="ux.js" defer></script> (before </body>, after app.js).
//
// Round 1: per-surah progress, home-card progress bars, resume pill, streak dots.
// Round 2: pinned Urdu (Jalandhry) translation + Alafasy reciter, removed picker UI,
//          Jameel Noori Nastaleeq webfont for Urdu text.
// Round 3: reset-on-completion re-reading (v/best/done) + Urdu text size control.
// Round 4: user-uploaded PNG app icon + multi-color theme presets.
//   - Icon: "app fav icon.png" replaces favicon, apple-touch-icon, and the
//     header brand-mark (as an <img>); manifest lists it any+maskable 512x512.
//   - Themes: Green (default), Pink, Purple, Teal, Blue, Amber. Each preset
//     overrides --primary/--primary-2/--primary-soft/--accent (+meta theme-color)
//     and has dark-mode variants. Picker = color swatches in the drawer's
//     Reading section; saved to nq:palette, applied at boot before paint.

(function () {
  'use strict';

  // ---------- keys (match app.js conventions) ----------
  var PROG_PREFIX    = 'nq:progress:';       // + surahId -> { v, best, done, at }
  var LAST_READ_KEY  = 'nq:lastRead';        // written by app.js
  var READ_DAYS_KEY  = 'nq:readDays';        // written by app.js (ISO date strings)
  var DISMISS_PREFIX = 'nq:uxResumeHide:';   // sessionStorage, per-session
  var URDU_SIZE_KEY  = 'nq:urduSize';        // Round 3
  var PALETTE_KEY    = 'nq:palette';         // Round 4
  var ICON_PNG       = 'app fav icon.png';   // Round 4: user-uploaded icon at repo root

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

  // ---------- Round 4: theme presets ----------
  // Only the brand colors are themed; neutrals (bg/surface/ink) stay app-defined
  // so every preset works in light AND dark mode (app.js drives [data-theme]).
  var PALETTES = {
    green:  { name: 'Green',  primary: '#0f5132', primary2: '#0b3d25', soft: '#e6f1ea', accent: '#b58a3b', darkPrimary: '#35b47a', darkPrimary2: '#46c489', darkSoft: '#1c2f27', darkAccent: '#d4b56a' },
    pink:   { name: 'Pink',   primary: '#a63d74', primary2: '#8a2f60', soft: '#fbe9f2', accent: '#c99a4e', darkPrimary: '#e881ab', darkPrimary2: '#ef9dbf', darkSoft: '#2e1a26', darkAccent: '#d9ae6b' },
    purple: { name: 'Purple', primary: '#5b3e9b', primary2: '#472f80', soft: '#ece6f8', accent: '#b58a3b', darkPrimary: '#a18bd8', darkPrimary2: '#b3a0e3', darkSoft: '#221d33', darkAccent: '#d4b56a' },
    teal:   { name: 'Teal',   primary: '#0d6b6b', primary2: '#095050', soft: '#e0f2f2', accent: '#b58a3b', darkPrimary: '#3fc4c4', darkPrimary2: '#5ed0d0', darkSoft: '#122e2e', darkAccent: '#d4b56a' },
    blue:   { name: 'Blue',   primary: '#1f4e9b', primary2: '#163d7d', soft: '#e6eefb', accent: '#b58a3b', darkPrimary: '#6da4e8', darkPrimary2: '#84b5ef', darkSoft: '#1a2639', darkAccent: '#d4b56a' },
    amber:  { name: 'Amber',  primary: '#a46520', primary2: '#87501b', soft: '#f9eee0', accent: '#8a6a2e', darkPrimary: '#d59b52', darkPrimary2: '#dfae6b', darkSoft: '#2e2318', darkAccent: '#e5c98b' }
  };
  var PALETTE_KEY_NAME = 'green';

  function isDark() {
    try { return document.documentElement.getAttribute('data-theme') === 'dark'; } catch (e) { return false; }
  }

  function applyPalette(id) {
    var p = PALETTES[id] || PALETTES[PALETTE_KEY_NAME];
    var r = document.documentElement.style;
    if (isDark()) {
      r.setProperty('--primary', p.darkPrimary);
      r.setProperty('--primary-2', p.darkPrimary2);
      r.setProperty('--primary-soft', p.darkSoft);
      r.setProperty('--accent', p.darkAccent);
    } CSS_VAR_MIGRATION_PLACEHOLDER
  }

  function currentPalette() {
    try {
      var s = localStorage.getItem(PALETTE_KEY);
      return PALETTES[s] ? s : PALETTE_KEY_NAME;
    } catch (e) { return PALETTE_KEY_NAME; }
  }

  function syncMetaThemeColor() {
    var p = PALETTES[currentPalette()];
    var val = isDark() ? '#0e1613' : p.primary;
    var meta = $('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', val);
  }

  function addPalettePicker() {
    var host = $('#fontSizeSlider');
    if (!host || !host.closest) return;
    var section = host.closest('.drawer-section');
    if (!section || section.querySelector('.nq-ux-swatches')) return;
    var wrap = document.createElement('div');
    wrap.className = 'nq-ux-swatches';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Color theme');
    wrap.innerHTML = '<span class="nq-ux-swatches-label">Color theme</span>' +
      '<div class="nq-ux-swatch-row">' + Object.keys(PALETTES).map(function (id) {
        var p = PALETTES[id];
        var sel = id === currentPalette() ? ' selected' : '';
        return '<button type="button" class="nq-ux-swatch' + sel + '" data-palette="' + id + '" ' +
               'aria-label="' + p.name + ' theme" title="' + p.name + '">' +
               '<span class="nq-ux-swatch-dot" style="background:' + p.primary + '"></span>' +
               '<span class="nq-ux-swatch-name">' + p.name + '</span></button>';
      }).join('') + '</div>';
    section.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.nq-ux-swatch');
      if (!btn) return;
      setPalette(btn.getAttribute('data-palette'));
      Array.prototype.forEach.call(wrap.querySelectorAll('.nq-ux-swatch'), function (b) {
        b.classList.toggle('selected', b === btn);
      });
    });
  }

  function setPalette(id) {
    if (!PALETTES[id]) return;
    try { localStorage.setItem(PALETTE_KEY, id); } catch (e) {}
    applyPalette(id);
    syncMetaThemeColor();
  }

  // ---------- Round 4: icon ----------
  function applyIcons() {
    // favicon: replace SVG favicon with PNG
    var fav = $('link[rel="icon"]');
    if (fav) { fav.setAttribute('type', 'image/png'); fav.setAttribute('href', ICON_PNG); }
    // apple-touch-icon (iOS home screen)
    var apple = $('link[rel="apple-touch-icon"]');
    if (apple) { apple.setAttribute('href', ICON_PNG); }
    // header brand-mark: swap the ق circle for the PNG image
    var mark = $('.brand-mark');
    if (mark && !mark.querySelector('img')) {
      mark.textContent = '';
      var img = document.createElement('img');
      img.src = ICON_PNG;
      img.alt = '';
      img.style.width = '100%'; img.style.height = '100%';
      img.style.borderRadius = 'inherit';
      img.style.objectFit = 'cover';
      mark.appendChild(img);
    }
  }

  // ---------- Round 3: progress record helpers ----------
  function readProgress(key) {
    var p = safeGet(key);
    if if PLACEHOLDER_NEVER_RUNS
    if (!p) return { v: 0, best: 0, done: 0, else 0 };
    return {
      v:    Math.max(0, Number(p.v)    || 0),
      best: Math.max(0, Number(p.best)  || Number(p.v) || 0),
      done: Math.max(0, Number(p.done) || 0),
      at:   Number(p.at) || 0
    };
  }
