# Noor al-Quran — Project Notes

Quran reading site. Plain HTML/CSS/JS, no build step, no dependencies.
Split across three files in the same folder. Deploy = drag folder onto Netlify Drop.

## Paths
- `/Users/savvyprogrammers/Desktop/quran-website/index.html` — markup only; links `styles.css`, `manifest.webmanifest`, `icon.svg` in `<head>`; loads `app.js` with `defer` at end of body
- `/Users/savvyprogrammers/Desktop/quran-website/styles.css` — all styles (theme tokens, layout, components, responsive, new-component block appended at the bottom)
- `/Users/savvyprogrammers/Desktop/quran-website/app.js` — all app logic (IIFE, hash router, API + cache, audio, bookmarks, drawer, continue-reading, streak, share, verse-of-day, command palette, keyboard shortcuts)
- `/Users/savvyprogrammers/Desktop/quran-website/sw.js` — service worker (app-shell cache-first, API network-first w/ cache fallback, skips audio)
- `/Users/savvyprogrammers/Desktop/quran-website/manifest.webmanifest` — PWA manifest with shortcuts (Bookmarks, Al-Fatiha, Ayat al-Kursi)
- `/Users/savvyprogrammers/Desktop/quran-website/icon.svg` — single SVG icon used for favicon + apple-touch + PWA (green rounded-square with ق)

## Data Sources
- **Al-Quran Cloud API** (`https://api.alquran.cloud/v1`) — surah list, surahs w/ translations, juz, page
- **islamic.network CDN** (`https://cdn.islamic.network/quran/audio/128/{reciter}/{globalAyah}.mp3`) — audio

## What's Implemented
- **Structure & styling** — hero, header, surah grid, verse cards, footer
- **Fonts** — Amiri Quran (Arabic), Noto Nastaliq Urdu (Urdu), Inter (Latin)
- **Homepage** — 114 surahs, live filter, Meccan/Medinan chips
- **Surah view** — Arabic + translation per verse; Bismillah shown once at top (stripped from ayah 1 for surahs 2–114 except 9 using a diacritic-agnostic regex)
- **Translations** — 11 grouped by language: EN (Saheeh Intl, Pickthall, Yusuf Ali), UR (Jalandhry, Junagarhi, Ahmed Ali), FR, TR, ID, ES, DE. Persisted.
- **Dark mode** — CSS var swap via `[data-theme="dark"]`, follows OS preference, persisted
- **Audio** — 6 reciters (Alafasy, Sudais, Shuraim, Hudhaify, Abdul Basit, Husary). Per-verse play, Play All, auto-advance, highlight + auto-scroll of current verse, fixed audio bar with prev/play/next/speed/close, spacebar toggles. Reciter + speed persisted.
- **Bookmarks** — heart-icon toggle on each verse; dedicated `/bookmarks` page grouped by surah; live count badge
- **Juz / Page views** — `/juz/{1–30}`, `/page/{1–604}`, verses grouped under surah section headings
- **Right-side drawer** — Language & Voice (translation + reciter), Read (Continue reading + Bookmarks), Jump to (Juz dropdown + Page input), Reading (font-size slider, autoplay toggle, reset)
- **Continue reading** — IntersectionObserver tracks the verse in the viewport's middle 40% band while reading a surah; saved to `localStorage`. Shows a card on homepage + drawer entry + mobile-nav "Resume" tab. Deep-link is `#/surah/{id}/verse/{n}`; smooth-scrolls and flashes gold on arrival.
- **Mobile bottom nav** (≤700px only) — Home · Bookmarks · Resume · Menu. Header hamburger auto-hides on mobile. Respects iOS safe-area.
- **Font-size setting** — 22–46px slider, applied to `--arabic-size` CSS variable.
- **Autoplay setting** — after first user audio interaction, opening a new surah auto-starts Play All.
- **Cache** — 7-day localStorage cache keyed `nq:s:{id}:{trans}`, `nq:j:{id}:{trans}`, `nq:p:{id}:{trans}`, `nq:surahs`, `nq:vod:{s}:{v}:{trans}`. All app storage prefixed with `nq:`.
- **PWA** — installable via `manifest.webmanifest` + `sw.js`. App shell (HTML/CSS/JS/icon/manifest) cache-first; API network-first with cache fallback (works offline for surahs you've viewed); Google Fonts cache-first; audio passes through to browser. Service worker registered on `window.load`.
- **Dynamic titles + meta** — every route sets `document.title`, `meta[name=description]`, `og:title`, `og:description` via `setDocumentMeta()`.
- **Verse of the Day** — curated list of ~40 well-known verses (`VerseOfDay.LIST` in app.js). Deterministic pick per calendar day (`Math.floor(Date.now() / 86400000) % LIST.length`). Fetched via `/ayah/{s}:{v}/editions/…`, cached. Renders as gradient card between continue-reading and toolbar. Has Open + Share buttons.
- **Reading streak** — `nq:readDays` stores ISO date strings (capped to last 400). `Streak.mark()` fires on every `render()`. Streak = consecutive days ending today or yesterday. Shown as gold badge in home hero + drawer.
- **Random surah** — `openRandomSurah()`; button in home toolbar (`.random-btn`) and drawer link (`#drawerRandom`).
- **Share & Copy** — every verse has a share button (also on the Verse-of-Day card). Popover (`#sharePop`) has: Copy verse text, Copy link, WhatsApp, Share on X, and native share (only if `navigator.share` is available). Share text is `arabic\n\ntranslation\n\n— Surah (s:v)\nurl`. Toast confirms copy.
- **Command palette** — `⌘K` / `Ctrl+K` opens `#cmdpal`. Fuzzy-searches all 114 surahs (english / arabic / translation / number). Also parses `juz N`, `page N`, plus commands `random`, `bookmarks`, `home`. Arrow keys navigate; Enter opens; Esc closes.
- **Keyboard shortcuts** — global, ignored in inputs. `⌘K`/`Ctrl+K` palette; `/` focus surah search; `n`/`p` next/prev surah; `j`/`k` next/prev verse (uses viewport-nearest verse); `b` bookmark visible verse; `s` share visible verse; `d` toggle theme; `Space` play/pause (existing); `g h` home; `g b` bookmarks; `?` help modal (`#kbdHelp`); `Esc` closes any open dialog.
- **Toast** — `#toast` fixed-bottom pill; `Toast.show(msg)` for transient confirmations (2.2s).

## Routes (hash-based)
- `#/` — homepage
- `#/surah/{id}` — surah view
- `#/surah/{id}/verse/{n}` — surah view + smooth-scroll + flash
- `#/juz/{id}` — Juz 1–30
- `#/page/{id}` — Page 1–604
- `#/bookmarks` — saved verses

## localStorage Keys
- `nq:translation`, `nq:reciter`, `nq:speed`, `nq:theme`
- `nq:fontSize`, `nq:autoplay`
- `nq:bookmarks` — JSON array
- `nq:lastRead` — { surahId, surahName, surahNameAr, numberInSurah, updatedAt }
- `nq:readDays` — JSON array of ISO date strings (streak log, capped to 400)
- `nq:s:*`, `nq:j:*`, `nq:p:*`, `nq:vod:*`, `nq:surahs` — API cache with `{ t, v }` shape

## Removed / Not Yet Built
- **Search** — was built (Phase 3) then removed at user's request. To re-add: use `GET /search/{keyword}/all/{edition}` on Al-Quran Cloud, render results with `<mark>` highlights, deep-link via `#/surah/{id}/verse/{n}` (route already supports it).
- Tafsir, word-by-word, PWA / offline, share buttons, print, verse-of-the-day — not built.
- Reading progress (marking surahs completed, stats) — not built. `nq:lastRead` is the only progress tracked.

## Design Decisions
- **Split into 3 files** (`index.html`, `styles.css`, `app.js`) — was single-file originally; split for editability. No build step; edit files directly.
- **All controls in drawer** (translation, reciter, jump, settings) — clean header at every width. Non-technical users expect "settings live in the menu".
- **Bottom nav on mobile only** — matches native app patterns.
- **Bismillah shown separately** for surahs 2–114 except 9. Stripping regex is diacritic-agnostic (matches base letters `ب س م …` and ignores marks between them) because Uthmani text has many variants (dagger alif ٰ, alef wasla ٱ, tatweel ـ, etc.).
- **No framework** — user explicitly rejected Next.js. Keep it that way.
- **Colors** — deep green primary (`#0f5132`), gold accent (`#b58a3b`), cream bg (`#faf7f0`). Dark theme uses `#0e1613` bg with `#35b47a` green.

## Known Limits
- Al-Quran Cloud search is exact-substring, not fuzzy (not currently used).
- Audio autoplay is browser-blocked until first user gesture — code correctly waits for `hadUserAudio`.
- Continue-reading tracker only runs in surah view (not Juz/Page/Bookmarks) — deliberate, to keep "where I was reading" unambiguous.

## Deploy
Drag the `quran-website` folder onto https://app.netlify.com/drop
