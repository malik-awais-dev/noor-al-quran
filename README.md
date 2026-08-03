# Noor al-Quran

Read the Holy Quran online with beautiful Arabic text, translations in your language, and world-class recitations. Plain HTML/CSS/JS — no framework, no build step.

## Features

- **114 surahs** with live filter (English / Arabic / meaning / number) + Meccan/Medinan chips
- **11 translations** grouped by language: English (Saheeh, Pickthall, Yusuf Ali), Urdu (Jalandhry, Junagarhi, Ahmed Ali), French, Turkish, Indonesian, Spanish, German
- **6 reciters** with per-verse play, Play All, auto-advance, playback speed, verse highlight + auto-scroll, keyboard control
- **Juz** (1–30) and **Page** (1–604) views
- **Bookmarks** — heart-toggle per verse; dedicated `/bookmarks` page
- **Continue reading** — auto-tracks your position and offers to resume
- **Verse of the Day** — curated daily verse on the homepage
- **Reading streak** — consecutive days you've opened the app
- **Random surah** — one click surprise
- **Share & Copy** — native share sheet on mobile; fallback to WhatsApp, X, copy text, copy link
- **Command palette** — `⌘K` / `Ctrl+K` for instant navigation
- **Keyboard shortcuts** — `j`/`k` verses, `n`/`p` surahs, `b` bookmark, `s` share, `d` dark mode, `/` search, `?` help
- **Dark mode** — follows system preference, override persisted
- **PWA** — installable on desktop and mobile; works offline for pages you've already visited
- **Responsive** — bottom nav on mobile, side drawer on all sizes

## Stack

Pure static files. No framework, no bundler, no dependencies.

- `index.html` — markup and DOM shells
- `styles.css` — all styles (theme tokens, layout, components, responsive)
- `app.js` — all app logic (hash router, API, cache, audio, features)
- `sw.js` — service worker (offline app shell + API cache)
- `manifest.webmanifest` + `icon.svg` — PWA install

## Data

- **[Al-Quran Cloud API](https://alquran.cloud/api)** — surah list, surahs w/ translations, juz, page, single ayah
- **islamic.network CDN** — verse-by-verse audio (128 kbps MP3)

## Deploy

Static site — deploy anywhere. Two easy paths:

**Netlify Drop** — drag the folder onto <https://app.netlify.com/drop>.

**Netlify from GitHub** — connect this repo, no build command, publish directory `.` (root).

## License

Quran text and translations are provided by Al-Quran Cloud under their terms. App code is free to use.
