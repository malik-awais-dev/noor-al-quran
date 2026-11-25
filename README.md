# Noor al-Quran

**Live: <https://read-al-furquan.vercel.app/>**

Read the Holy Quran online with beautiful Arabic text, Urdu translation (Fateh Muhammad Jalandhry), and world-class recitation (Mishary Rashid Alafasy). Plain HTML/CSS/JS — no framework, no build step.

## Features

- **114 surahs** with live filter (English / Arabic / meaning / number) + Meccan/Medinan chips
- **Urdu translation** (Fateh Muhammad Jalandhry) rendered in Jameel Noori Nastaleeq
- **Reciter fixed to Mishary Rashid Alafasy** with per-verse play, Play All, auto-advance, playback speed, verse highlight + auto-scroll, keyboard control
- **Juz** (1–30) and **Page** (1–604) views
- **Bookmarks** — heart-toggle per verse; dedicated `/bookmarks` page
- **Continue reading** — auto-tracks your position and offers to resume
- **Reset-on-completion** — finish a surah and it resets for a fresh re-read (✓ + "N×" badges; history never lost)
- **Urdu text size** — adjustable in Menu → Reading (30px desktop / 24px mobile defaults)
- **Color themes** — Green (default), Pink, Purple, Teal, Blue, Amber; each works in light and dark mode
- **App icon** — uploaded PNG used for favicon, iOS home screen, Android install, and header logo
- **Verse of the Day** — curated daily verse on the homepage
- **Reading streak** — consecutive days you've opened the app (+ 7-day dot calendar)
- **Share & Copy** — native share sheet on mobile; fallback to WhatsApp, X, copy text, copy link
- **Command palette** — `⌘K` / `Ctrl+K` for instant navigation
- **Keyboard shortcuts** — `j`/`k` verses, `n`/`p` surahs, `b` bookmark, `s` share, `d` dark mode, `/` search, `?` help
- **Dark mode** — follows system preference, override persisted
- **PWA** — installable on desktop and mobile; works offline for pages you've already visited
- **Responsive** — bottom nav on mobile, side drawer on all sizes
- **UX enhancements (`ux.js`)** — self-contained IIFE add-on (Rounds 1–4); observes DOM + localStorage, never touches app.js internals. Styles self-injected (`<style id="nqUxStyles">`, classes prefixed `nq-ux-`), re-decorates via MutationObserver + hashchange. Features:
  - **Per-surah progress** — piggybacks on `nq:lastRead`; mirrors into `nq:progress:{id}` = `{ v, best, done, at }`.
  - **Reset-on-completion** — reaching the final verse increments `done`, records `best`, resets `v` for a fresh re-read pass.
  - **Home card progress bars** — gold bar + "Read up to v.N of M" / "Completed ✓" / "Re-reading · v.N of M".
  - **Resume pill** — floating "Continue (re-reading) at verse N ↓" pill; dismissible per session.
  - **Streak mini-calendar** — 7-day dot row on `#heroStreak` / `#drawerStreak` from `nq:readDays`.
  - **Urdu webfont + size slider** — Jameel Noori Nastaleeq via jsDelivr; size via `--nq-urdu-size` (18–44px).
  - **Theme presets** — `--primary`/`--primary-2`/`--primary-soft`/`--accent` overrides with light+dark variants; `<meta theme-color>` sync.
  - **PNG icon** — runtime swap of favicon/apple-touch-icon/brand-mark; manifest lists it any+maskable 512×512.
- **Service worker** — `nq-v5`, precaches app shell including `ux.js`.

## Stack

Pure static files. No framework, no bundler, no dependencies.

- `index.html` — markup and DOM shells
- `styles.css` — all styles (theme tokens, layout, components, responsive)
- `app.js` — all app logic (hash router, API, cache, audio, features)
- `ux.js` — self-contained UX add-on (this project's enhancement layer)
- `sw.js` — service worker (offline app shell + API cache)
- `manifest.webmanifest` + `app fav icon.png` + `icon.svg` — PWA install

## Data

- **[Al-Quran Cloud API](https://alquran.cloud/api)** — surah list, surahs w/ translations, juz, page, single ayah
- **islamic.network CDN** — verse-by-verse audio (128 kbps MP3)

## Deploy

Static site — deploy anywhere. Current host: **Vercel** (auto-deploys on merge to `main`).

**Vercel from GitHub** — import the repo at <https://vercel.com/new>, no build command, output directory `.` (root). Every push to `main` deploys automatically.

## License

Quran text and translations are provided by Al-Quran Cloud under their terms. App code is free to use.
