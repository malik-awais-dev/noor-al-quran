(function(){
  'use strict';

  // ==========================================================
  // CONFIG
  // ==========================================================
  const CONFIG = {
    API_BASE: 'https://api.alquran.cloud/v1',
    AUDIO_CDN: 'https://cdn.islamic.network/quran/audio/128',   // + /{reciter}/{globalAyah}.mp3
    ARABIC_EDITION: 'quran-uthmani',
    CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days
    CACHE_PREFIX: 'nq:',
    DEFAULT_TRANSLATION: 'ur.junagarhi',
    DEFAULT_RECITER: 'ar.alafasy',
    JUZ_COUNT:  30,
    PAGE_COUNT: 604,
    DEFAULT_ARABIC_SIZE: 32,

    // Reciter editions on islamic.network CDN
    RECITERS: [
      { id:'ar.alafasy',            name:'Mishary Rashid Alafasy' },
      { id:'ar.abdurrahmaansudais', name:'Abdur-Rahman As-Sudais' },
      { id:'ar.saoodshuraym',       name:'Saud Al-Shuraim' },
      { id:'ar.hudhaify',           name:'Ali Al-Hudhaify' },
      { id:'ar.abdulbasitmurattal', name:'Abdul Basit (Murattal)' },
      { id:'ar.husary',             name:'Mahmoud Khalil Al-Husary' },
    ],

    // Curated translation list. `rtl:true` = language written right-to-left.
    TRANSLATIONS: [
      { id:'en.sahih',      name:'English — Saheeh International',        lang:'English' },
      { id:'en.pickthall',  name:'English — Pickthall',                   lang:'English' },
      { id:'en.yusufali',   name:'English — Yusuf Ali',                   lang:'English' },
      { id:'ur.jalandhry',  name:'Urdu — Fateh Muhammad Jalandhry',       lang:'Urdu',    rtl:true },
      { id:'ur.junagarhi',  name:'Urdu — Muhammad Junagarhi',             lang:'Urdu',    rtl:true },
      { id:'ur.ahmedali',   name:'Urdu — Ahmed Ali',                      lang:'Urdu',    rtl:true },
      { id:'fr.hamidullah', name:'French — Muhammad Hamidullah',          lang:'French' },
      { id:'tr.diyanet',    name:'Turkish — Diyanet İşleri',              lang:'Turkish' },
      { id:'id.indonesian', name:'Indonesian — Kementerian Agama',        lang:'Indonesian' },
      { id:'es.cortes',     name:'Spanish — Julio Cortés',                lang:'Spanish' },
      { id:'de.bubenheim',  name:'German — Bubenheim & Elyas',            lang:'German' },
    ],
  };

  // ==========================================================
  // STATE
  // ==========================================================
  const state = {
    translation: localStorage.getItem('nq:translation') || CONFIG.DEFAULT_TRANSLATION,
    reciter:     localStorage.getItem('nq:reciter')     || CONFIG.DEFAULT_RECITER,
    speed:       parseFloat(localStorage.getItem('nq:speed')) || 1,
    surahs: null,          // cached list of 114 surahs (metadata only)
    currentSurah: null,    // { id, ayahs } — set when a surah view renders (used by audio)
    filterText: '',
    filterType: 'all',     // 'all' | 'meccan' | 'medinan'
    autoplay:      localStorage.getItem('nq:autoplay') === 'true',
    fontSize:      parseInt(localStorage.getItem('nq:fontSize'), 10) || CONFIG.DEFAULT_ARABIC_SIZE,
    hadUserAudio:  false,  // true after user manually plays anything (needed for autoplay policy)
  };

  // ==========================================================
  // UTILITIES
  // ==========================================================
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs={}, ...children) => {
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)){
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children){
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
  const debounce = (fn, ms) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
  };
  const translationById = (id) => CONFIG.TRANSLATIONS.find(t => t.id === id) || CONFIG.TRANSLATIONS[0];
  const reciterById     = (id) => CONFIG.RECITERS.find(r => r.id === id)     || CONFIG.RECITERS[0];

  // Small icon set used inside dynamically-created buttons
  const ICONS = {
    play:  '<svg class="play-icon"  xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg>',
    pause: '<svg class="pause-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    playFilled: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg>',
  };

  // Strip the Bismillah phrase from the start of an ayah.
  // For surahs 2-114 (except 9) the Uthmani edition prepends "بسم الله الرحمن الرحيم"
  // to ayah 1's text. We display Bismillah separately, so we strip it here.
  //
  // The Uthmani edition uses many diacritic variations (dagger alif ٰ, alef wasla ٱ,
  // tatweel ـ, sukun, shadda, etc.). To be robust we match by base letters and allow
  // ANY Arabic diacritic mark between them.
  const BISMILLAH_RE = (() => {
    // Character class for any Arabic diacritic / mark / tatweel
    const M = '[\\u064B-\\u065F\\u0670\\u0640\\u06D6-\\u06ED\\u0610-\\u061A]*';
    // Bismillah base letters (alef can appear as ا or ٱ — Alef Wasla)
    const pattern =
      '^\\s*' +
      'ب' + M + 'س' + M + 'م' + M + '\\s*' +
      '[اٱ]?' + M + 'ل' + M + 'ل' + M + 'ه' + M + '\\s*' +
      '[اٱ]?' + M + 'ل' + M + 'ر' + M + 'ح' + M + 'م' + M + 'ن' + M + '\\s*' +
      '[اٱ]?' + M + 'ل' + M + 'ر' + M + 'ح' + M + 'ي' + M + 'م' + M +
      '\\s*';
    return new RegExp(pattern);
  })();
  function stripBismillah(text){ return text.replace(BISMILLAH_RE, ''); }

  // Update <title> + meta description + og:* for the current view.
  // Called from every renderX() so tabs, history, search results, and shares are meaningful.
  function setDocumentMeta(title, description){
    document.title = title;
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (el && val != null) el.setAttribute('content', val);
    };
    if (description) set('meta[name="description"]', description);
    set('meta[property="og:title"]', title);
    if (description) set('meta[property="og:description"]', description);
  }

  // Absolute deep link to a specific verse — used by Share.
  function verseUrl(surahId, numberInSurah){
    return location.origin + location.pathname + '#/surah/' + surahId + '/verse/' + numberInSurah;
  }

  // ==========================================================
  // TOAST  (transient bottom message: "Verse copied", etc.)
  // ==========================================================
  const Toast = {
    _t: null,
    show(msg){
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('show'));
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => { el.hidden = true; }, 250);
      }, 2200);
    },
  };

  // ==========================================================
  // CACHE (localStorage with TTL)
  // ==========================================================
  const Cache = {
    get(key){
      try{
        const raw = localStorage.getItem(CONFIG.CACHE_PREFIX + key);
        if (!raw) return null;
        const { t, v } = JSON.parse(raw);
        if (Date.now() - t > CONFIG.CACHE_TTL_MS) return null;
        return v;
      } catch(e){ return null; }
    },
    set(key, value){
      try{
        localStorage.setItem(CONFIG.CACHE_PREFIX + key, JSON.stringify({ t:Date.now(), v:value }));
      } catch(e){
        // Storage full — clear our stuff and retry once.
        Cache.purge();
        try{ localStorage.setItem(CONFIG.CACHE_PREFIX + key, JSON.stringify({ t:Date.now(), v:value })); } catch(_){}
      }
    },
    purge(){
      Object.keys(localStorage).forEach(k => { if (k.startsWith(CONFIG.CACHE_PREFIX)) localStorage.removeItem(k); });
    }
  };

  // ==========================================================
  // API
  // ==========================================================
  const Api = {
    async _fetch(path, cacheKey){
      if (cacheKey){
        const cached = Cache.get(cacheKey);
        if (cached) return cached;
      }
      const res = await fetch(CONFIG.API_BASE + path);
      if (!res.ok) throw new Error('Network error (' + res.status + ')');
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.status || 'API error');
      if (cacheKey) Cache.set(cacheKey, json.data);
      return json.data;
    },
    async listSurahs(){
      return this._fetch('/surah', 'surahs');
    },
    async surahWithTranslation(id, translationId){
      // Returns array with 2 editions: [uthmani, translation]
      const path = `/surah/${id}/editions/${CONFIG.ARABIC_EDITION},${translationId}`;
      const key  = `s:${id}:${translationId}`;
      return this._fetch(path, key);
    },
    async juz(id, translationId){
      const path = `/juz/${id}/editions/${CONFIG.ARABIC_EDITION},${translationId}`;
      const key  = `j:${id}:${translationId}`;
      return this._fetch(path, key);
    },
    async page(id, translationId){
      const path = `/page/${id}/editions/${CONFIG.ARABIC_EDITION},${translationId}`;
      const key  = `p:${id}:${translationId}`;
      return this._fetch(path, key);
    },
  };

  // ==========================================================
  // BOOKMARKS  (localStorage-backed)
  // ==========================================================
  const Bookmarks = {
    KEY: 'nq:bookmarks',
    _cache: null,

    all(){
      if (this._cache) return this._cache;
      try{ this._cache = JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
      catch(_){ this._cache = []; }
      return this._cache;
    },
    _save(){
      localStorage.setItem(this.KEY, JSON.stringify(this._cache));
    },
    has(globalNumber){
      return this.all().some(b => b.globalNumber === globalNumber);
    },
    add(entry){
      // entry: { globalNumber, surahId, surahName, surahNameAr, numberInSurah, arabic }
      if (this.has(entry.globalNumber)) return;
      this._cache = [{ ...entry, addedAt: Date.now() }, ...this.all()];
      this._save();
      updateBookmarkCount();
    },
    remove(globalNumber){
      this._cache = this.all().filter(b => b.globalNumber !== globalNumber);
      this._save();
      updateBookmarkCount();
    },
    toggle(entry){
      if (this.has(entry.globalNumber)) this.remove(entry.globalNumber);
      else this.add(entry);
    },
    count(){ return this.all().length; },
  };

  // ==========================================================
  // SHARE  (native share + fallback popover: copy text/link, WA, X)
  //   entry: { arabic, translation, surahName, surahId, numberInSurah }
  // ==========================================================
  const Share = {
    formatText(entry){
      const parts = [entry.arabic];
      if (entry.translation) parts.push('', entry.translation);
      parts.push('', `— ${entry.surahName} (${entry.surahId}:${entry.numberInSurah})`, verseUrl(entry.surahId, entry.numberInSurah));
      return parts.join('\n');
    },
    async native(entry){
      try{
        await navigator.share({
          title: `${entry.surahName} ${entry.surahId}:${entry.numberInSurah}`,
          text:  this.formatText(entry),
          url:   verseUrl(entry.surahId, entry.numberInSurah),
        });
      } catch(_){ /* user cancelled — ignore */ }
    },
    async copyText(entry){
      try{ await navigator.clipboard.writeText(this.formatText(entry)); Toast.show('Verse copied'); }
      catch(_){ Toast.show('Copy failed'); }
    },
    async copyLink(entry){
      try{ await navigator.clipboard.writeText(verseUrl(entry.surahId, entry.numberInSurah)); Toast.show('Link copied'); }
      catch(_){ Toast.show('Copy failed'); }
    },
    whatsapp(entry){
      window.open('https://wa.me/?text=' + encodeURIComponent(this.formatText(entry)), '_blank', 'noopener');
    },
    twitter(entry){
      window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(this.formatText(entry)), '_blank', 'noopener');
    },

    _offClick: null,
    openMenu(button, entry){
      const pop = document.getElementById('sharePop');
      if (!pop) return;
      // Show/hide the native "Share…" row based on browser support
      const nativeItem = pop.querySelector('[data-share="native"]');
      if (nativeItem) nativeItem.hidden = !navigator.share;

      // Wire each item to this specific entry
      pop.querySelectorAll('.sharepop-item').forEach(item => {
        item.onclick = () => {
          const action = item.getAttribute('data-share');
          if      (action === 'native')     this.native(entry);
          else if (action === 'copy-text')  this.copyText(entry);
          else if (action === 'copy-link')  this.copyLink(entry);
          else if (action === 'whatsapp')   this.whatsapp(entry);
          else if (action === 'twitter')    this.twitter(entry);
          this.closeMenu();
        };
      });

      pop.hidden = false;
      // Measure and position (fixed) below+right-aligned to the button; keep on-screen
      const rect = button.getBoundingClientRect();
      const pr = pop.getBoundingClientRect();
      let top  = rect.bottom + 8;
      let left = rect.right - pr.width;
      if (left < 8) left = 8;
      if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
      if (top  + pr.height > window.innerHeight - 8) top = rect.top - pr.height - 8;
      pop.style.top  = top  + 'px';
      pop.style.left = left + 'px';

      // Click-outside to close
      setTimeout(() => {
        this._offClick = (e) => {
          if (button.contains(e.target) || pop.contains(e.target)) return;
          this.closeMenu();
        };
        document.addEventListener('click', this._offClick);
      }, 0);
    },
    closeMenu(){
      const pop = document.getElementById('sharePop');
      if (pop) pop.hidden = true;
      if (this._offClick){ document.removeEventListener('click', this._offClick); this._offClick = null; }
    },
  };

  function updateBookmarkCount(){
    const n = Bookmarks.count();
    const el = $('#bookmarkCount');
    if (el) el.textContent = String(n);
    // Bottom nav badge
    const bn = $('#bnBmCount');
    if (bn){
      bn.textContent = String(n);
      bn.hidden = n === 0;
    }
  }

  function updateContinueDrawer(){
    const link  = $('#drawerContinue');
    const label = $('#drawerContinueLabel');
    const last = LastRead.get();
    if (link){
      if (!last){ link.hidden = true; }
      else {
        link.hidden = false;
        link.href = `#/surah/${last.surahId}/verse/${last.numberInSurah}`;
        label.textContent = `Continue: ${last.surahName} · v${last.numberInSurah}`;
      }
    }
    // Bottom-nav Resume entry
    const bn = $('#bnContinue');
    if (bn){
      if (!last){ bn.hidden = true; }
      else{
        bn.hidden = false;
        bn.href = `#/surah/${last.surahId}/verse/${last.numberInSurah}`;
      }
    }
  }

  // Highlight the active tab in the bottom nav based on the current route
  function updateBottomNavActive(){
    const route = Router.parse();
    let active = 'home';
    if (route.name === 'bookmarks') active = 'bookmarks';
    // "Resume" tab isn't a route — it's only "active" when we're on a surah that matches lastRead
    const last = LastRead.get();
    if (route.name === 'surah' && last && route.id === last.surahId){
      active = 'continue';
    }
    $$('.bn-item').forEach(el => el.classList.toggle('active', el.getAttribute('data-nav') === active));
  }

  // ==========================================================
  // LAST-READ POSITION  (auto "continue reading")
  // ==========================================================
  const LastRead = {
    KEY: 'nq:lastRead',
    get(){
      try{ return JSON.parse(localStorage.getItem(this.KEY) || 'null'); }
      catch(_){ return null; }
    },
    set(entry){
      // { surahId, surahName, surahNameAr, numberInSurah, updatedAt }
      localStorage.setItem(this.KEY, JSON.stringify({ ...entry, updatedAt: Date.now() }));
      updateContinueDrawer();
    },
    clear(){
      localStorage.removeItem(this.KEY);
      updateContinueDrawer();
    },
  };

  // ==========================================================
  // READING STREAK
  //   Tracks each ISO date the user opened any reading view.
  //   Current streak = consecutive days ending today (or yesterday
  //   if today isn't marked yet — that day is still "active").
  // ==========================================================
  const Streak = {
    KEY: 'nq:readDays',
    _iso(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); },
    _all(){
      try{ return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
      catch(_){ return []; }
    },
    mark(){
      const days = this._all();
      const today = this._iso(new Date());
      if (days[days.length - 1] === today) return;   // already marked today
      days.push(today);
      // Cap at 400 days so the log can't grow forever
      localStorage.setItem(this.KEY, JSON.stringify(days.slice(-400)));
      updateStreakUI();
    },
    current(){
      const days = new Set(this._all());
      if (!days.size) return 0;
      const cursor = new Date();
      if (!days.has(this._iso(cursor))) cursor.setDate(cursor.getDate() - 1);
      let n = 0;
      while (days.has(this._iso(cursor))){
        n++;
        cursor.setDate(cursor.getDate() - 1);
      }
      return n;
    },
    total(){ return this._all().length; },
  };

  function updateStreakUI(){
    const n = Streak.current();
    // Drawer entry
    const drawer = $('#drawerStreak');
    const label  = $('#drawerStreakN');
    if (drawer && label){
      if (n === 0){ drawer.hidden = true; }
      else{
        drawer.hidden = false;
        label.textContent = `${n}-day streak`;
      }
    }
    // Homepage hero badge (may or may not exist depending on route)
    const heroN = $('#heroStreakN');
    const hero  = $('#heroStreak');
    if (hero && heroN){
      if (n === 0){ hero.hidden = true; }
      else{ hero.hidden = false; heroN.textContent = String(n); }
    }
  }

  // ==========================================================
  // VERSE OF THE DAY
  //   Curated verse list; deterministic pick per day.
  //   Fetches on demand, caches (per date + translation).
  // ==========================================================
  const VerseOfDay = {
    // (surahId, verseInSurah). Curated well-known / beloved verses.
    LIST: [
      { s:1, v:1 }, { s:1, v:5 },
      { s:2, v:255 }, { s:2, v:286 },
      { s:3, v:8 }, { s:3, v:26 }, { s:3, v:190 },
      { s:6, v:59 },
      { s:9, v:129 },
      { s:13, v:28 },
      { s:14, v:7 },
      { s:16, v:97 },
      { s:17, v:80 },
      { s:18, v:10 },
      { s:20, v:114 },
      { s:24, v:35 },
      { s:25, v:74 },
      { s:29, v:69 },
      { s:33, v:56 },
      { s:36, v:82 },
      { s:39, v:53 },
      { s:40, v:60 },
      { s:41, v:33 },
      { s:42, v:23 },
      { s:49, v:13 },
      { s:50, v:16 },
      { s:55, v:13 },
      { s:57, v:20 },
      { s:59, v:22 }, { s:59, v:23 },
      { s:65, v:2 }, { s:65, v:3 },
      { s:67, v:2 },
      { s:94, v:5 }, { s:94, v:6 },
      { s:103, v:1 },
      { s:112, v:1 }, { s:112, v:4 },
      { s:113, v:1 },
      { s:114, v:1 },
    ],
    _dayIndex(){
      const day = Math.floor(Date.now() / 86400000);
      return day % this.LIST.length;
    },
    pickToday(){ return this.LIST[this._dayIndex()]; },
    // Returns [arabic, translation] from Al-Quran Cloud
    async fetch(pick, translationId){
      const path = `/ayah/${pick.s}:${pick.v}/editions/${CONFIG.ARABIC_EDITION},${translationId}`;
      const key  = `vod:${pick.s}:${pick.v}:${translationId}`;
      const cached = Cache.get(key);
      if (cached) return cached;
      const res = await fetch(CONFIG.API_BASE + path);
      if (!res.ok) throw new Error('Network error');
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.status);
      Cache.set(key, json.data);
      return json.data;
    },
  };

  // Track the verse currently in the middle of the viewport while reading a surah.
  // Uses IntersectionObserver with an inset root margin — a verse is "current"
  // when it's inside the middle 40% band of the viewport.
  let _readObserver = null;
  function trackReadingProgress(surahMeta){
    if (_readObserver) _readObserver.disconnect();

    const save = debounce((verseNum) => {
      LastRead.set({
        surahId: surahMeta.number,
        surahName: surahMeta.englishName,
        surahNameAr: surahMeta.name,
        numberInSurah: verseNum,
      });
    }, 500);

    _readObserver = new IntersectionObserver((entries) => {
      // Pick whichever intersecting verse has the highest ratio inside the band
      const best = entries.filter(e => e.isIntersecting)
                          .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best){
        const v = parseInt(best.target.getAttribute('data-verse'), 10);
        if (v) save(v);
      }
    }, {
      root:null,
      // Shrink the viewport to a middle horizontal band so we track what the
      // reader is actually looking at, not what's about to enter the screen.
      rootMargin: '-40% 0px -40% 0px',
      threshold: [0, 0.5, 1],
    });

    document.querySelectorAll('.verse[data-verse]').forEach(el => _readObserver.observe(el));
  }

  // ==========================================================
  // AUDIO PLAYER
  //   Holds a single HTMLAudioElement and drives:
  //   - per-verse play buttons
  //   - fixed audio bar at bottom
  //   - highlight + auto-scroll of the currently-playing verse
  //   Playlist = array of ayahs (each with .number global, .numberInSurah, .surahId, etc.)
  // ==========================================================
  const Player = {
    audio: new Audio(),
    playlist: null,    // array of ayah objects from current surah
    index: -1,         // position in playlist
    surahId: null,     // surah currently loaded in the player
    surahName: null,   // english name for display
    isPlaying: false,
    isLoading: false,

    urlFor(globalNumber){
      return `${CONFIG.AUDIO_CDN}/${state.reciter}/${globalNumber}.mp3`;
    },

    // Load a surah's ayah list into the player and jump to a specific index
    setSurah(surahId, surahName, ayahs, startIndex=0){
      this.surahId = surahId;
      this.surahName = surahName;
      this.playlist = ayahs;
      this.index = startIndex;
    },

    playIndex(i){
      if (!this.playlist || i < 0 || i >= this.playlist.length){
        return this.stop();
      }
      this.index = i;
      const ayah = this.playlist[i];
      this.isLoading = true;
      this.audio.src = this.urlFor(ayah.number);
      this.audio.playbackRate = state.speed;
      const promise = this.audio.play();
      if (promise && promise.catch) promise.catch(() => { /* user gesture likely blocked; ignore */ });
      this._render();
      this._scrollTo(ayah.numberInSurah);
    },

    toggle(){
      if (!this.playlist) return;
      if (this.audio.paused){ this.audio.play(); }
      else                  { this.audio.pause(); }
    },

    next(){ if (this.playlist) this.playIndex(this.index + 1); },
    prev(){ if (this.playlist) this.playIndex(Math.max(0, this.index - 1)); },

    stop(){
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.playlist = null; this.index = -1;
      this.surahId = null; this.surahName = null;
      this.isPlaying = false; this.isLoading = false;
      this._render();
    },

    setSpeed(s){
      state.speed = parseFloat(s) || 1;
      localStorage.setItem('nq:speed', String(state.speed));
      this.audio.playbackRate = state.speed;
    },

    // Called when the user changes the reciter mid-playback
    reloadCurrentIfPlaying(){
      if (this.playlist && this.index >= 0){
        const wasPlaying = !this.audio.paused;
        const t = this.audio.currentTime;
        this.audio.src = this.urlFor(this.playlist[this.index].number);
        this.audio.playbackRate = state.speed;
        this.audio.currentTime = t;
        if (wasPlaying) this.audio.play().catch(()=>{});
      }
    },

    // Given a verse (in the currently-displayed surah), start playing from it
    playVerseInCurrentSurah(numberInSurah){
      if (!state.currentSurah) return;
      const ayahs = state.currentSurah.ayahs;
      const englishName = state.currentSurah.englishName;
      const i = ayahs.findIndex(a => a.numberInSurah === numberInSurah);
      if (i < 0) return;
      // If already loaded to this surah and this exact verse, just toggle
      if (this.surahId === state.currentSurah.id && this.index === i){
        this.toggle();
        return;
      }
      this.setSurah(state.currentSurah.id, englishName, ayahs, i);
      this.playIndex(i);
    },

    playAllForCurrentSurah(){
      if (!state.currentSurah) return;
      this.setSurah(state.currentSurah.id, state.currentSurah.englishName, state.currentSurah.ayahs, 0);
      this.playIndex(0);
    },

    _scrollTo(numberInSurah){
      const el = document.querySelector(`.verse[data-verse="${numberInSurah}"][data-surah="${this.surahId}"]`);
      if (el){
        el.scrollIntoView({ block:'center', behavior:'smooth' });
      }
    },

    // Sync all UI (audio bar + verse highlights + button icons)
    _render(){
      const bar = $('#audioBar');
      const active = !!this.playlist;
      bar.hidden = !active;
      document.body.classList.toggle('audio-open', active);

      // Update play/pause state on the bar
      bar.setAttribute('data-playing', String(this.isPlaying));

      // Prev/Next disabled at ends
      const prevBtn = $('#abPrev'), nextBtn = $('#abNext');
      if (active){
        prevBtn.disabled = this.index <= 0;
        nextBtn.disabled = this.index >= this.playlist.length - 1;
      }

      // Title + subtitle
      if (active){
        const ayah = this.playlist[this.index];
        $('#abTitle').textContent = `${this.surahName} · Verse ${ayah.numberInSurah}`;
        $('#abSub').textContent   = reciterById(state.reciter).name;
      }

      // Verse highlights — clear all, then mark current if visible
      $$('.verse.playing').forEach(el => el.classList.remove('playing'));
      $$('.verse.loading').forEach(el => el.classList.remove('loading'));
      if (active){
        const ayah = this.playlist[this.index];
        const vEl = document.querySelector(`.verse[data-verse="${ayah.numberInSurah}"][data-surah="${this.surahId}"]`);
        if (vEl){
          vEl.classList.add(this.isLoading ? 'loading' : 'playing');
        }
      }
    },

    init(){
      // Audio element events
      this.audio.addEventListener('play',    () => { this.isPlaying = true;  this.isLoading = false; this._render(); });
      this.audio.addEventListener('pause',   () => { this.isPlaying = false;                          this._render(); });
      this.audio.addEventListener('waiting', () => { this.isLoading = true;                           this._render(); });
      this.audio.addEventListener('playing', () => { this.isLoading = false;                          this._render(); });
      this.audio.addEventListener('ended',   () => { this.next(); });
      this.audio.addEventListener('error',   () => {
        this.isPlaying = false; this.isLoading = false;
        console.warn('Audio error for', this.audio.src);
        this._render();
      });

      // Audio bar controls
      $('#abPlay').addEventListener('click',  () => this.toggle());
      $('#abNext').addEventListener('click',  () => this.next());
      $('#abPrev').addEventListener('click',  () => this.prev());
      $('#abClose').addEventListener('click', () => this.stop());

      const speedSel = $('#abSpeed');
      speedSel.value = String(state.speed);
      speedSel.addEventListener('change', (e) => this.setSpeed(e.target.value));

      // Keyboard: space toggles when bar is active and focus isn't in an input
      document.addEventListener('keydown', (e) => {
        if (e.key !== ' ' || !this.playlist) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        this.toggle();
      });
    },
  };

  // ==========================================================
  // ROUTER (hash-based)
  //   #/                 → home
  //   #/surah/{id}       → surah detail
  // ==========================================================
  const Router = {
    parse(){
      const raw = (location.hash || '#/').replace(/^#/, '');
      const parts = raw.split('/').filter(Boolean);
      if (parts.length === 0) return { name:'home' };
      if (parts[0] === 'surah'     && parts[1]){
        const id = parseInt(parts[1], 10);
        if (parts[2] === 'verse' && parts[3]) return { name:'surah', id, verse: parseInt(parts[3], 10) };
        return { name:'surah', id };
      }
      if (parts[0] === 'juz'       && parts[1]) return { name:'juz',   id: parseInt(parts[1], 10) };
      if (parts[0] === 'page'      && parts[1]) return { name:'page',  id: parseInt(parts[1], 10) };
      if (parts[0] === 'bookmarks')             return { name:'bookmarks' };
      return { name:'home' };
    },
    navigate(hash){ location.hash = hash; },
    init(){
      window.addEventListener('hashchange', render);
    }
  };

  // ==========================================================
  // VIEWS
  // ==========================================================
  const main = $('#main');

  function showSpinner(message='Loading…'){
    main.innerHTML = '';
    main.appendChild(el('div', { class:'state' },
      el('div', { class:'spinner', role:'status', 'aria-label':'Loading' }),
      el('p', { style:'margin-top:16px' }, message),
    ));
  }
  function showError(err, retryFn){
    main.innerHTML = '';
    const box = el('div', { class:'state' },
      el('h2', {}, 'Something went wrong'),
      el('p', {}, err && err.message ? err.message : 'Please try again.'),
    );
    if (retryFn){
      box.appendChild(el('button', { class:'btn', onclick:retryFn }, 'Try again'));
    }
    main.appendChild(box);
  }

  // -----  HOME  -----
  async function renderHome(){
    setDocumentMeta(
      'Noor al-Quran — Read the Holy Quran',
      'Read the Holy Quran online with beautiful Arabic text, translations in your language, and world-class recitations.'
    );

    // Hero
    main.innerHTML = '';
    const hero = el('section', { class:'hero' },
      el('div', { class:'bismillah' }, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'),
      el('h1', {}, 'The Holy Quran'),
      el('p', { class:'tagline' }, 'Read Allah’s final revelation with beautiful Arabic text and translations in your language.'),
    );
    // Streak badge (hidden when streak == 0). id lets updateStreakUI() find it live.
    const sN = Streak.current();
    const streakBadge = el('span', { class:'streak-badge', id:'heroStreak' });
    streakBadge.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2s3 4 3 8a3 3 0 0 1-6 0c0-1 .5-2 1-3 0 3 2 4 2 4s-2-6 0-9z"/>' +
      '<path d="M8 14a4 4 0 1 0 8 0c0-2-2-3-2-6 0 3-6 2-6 6z"/></svg>' +
      '<span><strong id="heroStreakN">' + sN + '</strong>-day reading streak</span>';
    if (sN === 0) streakBadge.hidden = true;
    hero.appendChild(streakBadge);
    main.appendChild(hero);

    const wrap = el('div', { class:'container' });
    main.appendChild(wrap);

    // "Continue reading" card (only if we have a saved position)
    const last = LastRead.get();
    if (last){
      wrap.appendChild(continueCard(last));
    }

    // Verse of the Day — async; skeleton first, then real card
    const vodSlot = el('div', {});
    vodSlot.appendChild(el('div', { class:'vod-skeleton' }));
    wrap.appendChild(vodSlot);
    renderVerseOfDay(vodSlot);   // fire and forget

    // Toolbar
    const toolbar = el('div', { class:'toolbar' });
    const searchInput = el('input', {
      type:'search', class:'search-input', id:'surahSearchInput',
      placeholder:'Search surahs by name or number…',
      'aria-label':'Search surahs',
      value: state.filterText,
    });
    const chips = el('div', { class:'filter-chips', role:'tablist', 'aria-label':'Filter by revelation type' });
    const chipDefs = [
      { key:'all',     label:'All' },
      { key:'meccan',  label:'Meccan' },
      { key:'medinan', label:'Medinan' },
    ];
    const chipEls = chipDefs.map(({key,label}) => {
      const b = el('button', { class:'chip' + (state.filterType===key?' active':''), role:'tab' }, label);
      b.addEventListener('click', () => {
        state.filterType = key;
        chipEls.forEach(x => x.classList.toggle('active', x.textContent === label));
        renderGrid();
      });
      return b;
    });
    chipEls.forEach(c => chips.appendChild(c));

    const randomBtn = el('button', { class:'random-btn', type:'button', title:'Open a random surah' });
    randomBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>' +
      '<polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>' +
      '<line x1="4" y1="4" x2="9" y2="9"/></svg><span>Random</span>';
    randomBtn.addEventListener('click', () => openRandomSurah());

    toolbar.append(searchInput, chips, randomBtn);
    wrap.appendChild(toolbar);

    const gridHost = el('div', {});
    wrap.appendChild(gridHost);

    // Fetch surahs
    if (!state.surahs){
      gridHost.appendChild(renderSkeletonGrid());
      try{
        state.surahs = await Api.listSurahs();
      } catch(err){
        gridHost.innerHTML = '';
        gridHost.appendChild(el('div', { class:'state' },
          el('h2', {}, 'Couldn’t load the surah list'),
          el('p', {}, err.message || 'Please check your connection.'),
          el('button', { class:'btn', onclick: () => renderHome() }, 'Try again'),
        ));
        return;
      }
    }

    // Grid renderer (called on filter change too)
    function renderGrid(){
      gridHost.innerHTML = '';
      const grid = el('div', { class:'surah-grid' });
      const q = state.filterText.trim().toLowerCase();
      const filtered = state.surahs.filter(s => {
        if (state.filterType === 'meccan'  && s.revelationType !== 'Meccan') return false;
        if (state.filterType === 'medinan' && s.revelationType !== 'Medinan') return false;
        if (!q) return true;
        return (
          String(s.number).includes(q) ||
          s.englishName.toLowerCase().includes(q) ||
          s.englishNameTranslation.toLowerCase().includes(q) ||
          s.name.includes(q)
        );
      });
      if (filtered.length === 0){
        gridHost.appendChild(el('div', { class:'state' },
          el('h2', {}, 'No surahs match'),
          el('p', {}, 'Try a different search.'),
        ));
        return;
      }
      filtered.forEach(s => grid.appendChild(surahCard(s)));
      gridHost.appendChild(grid);
    }

    // Live filter
    searchInput.addEventListener('input', debounce((e) => {
      state.filterText = e.target.value;
      renderGrid();
    }, 120));

    renderGrid();
  }

  function surahCard(s){
    return el('a', { class:'surah-card', href:`#/surah/${s.number}`, 'aria-label':`Surah ${s.englishName}` },
      el('div', { class:'surah-num' }, el('span', {}, String(s.number))),
      el('div', { class:'surah-info' },
        el('p', { class:'surah-name-en' }, s.englishName),
        el('p', { class:'surah-meta' }, `${s.englishNameTranslation} · ${s.numberOfAyahs} verses · ${s.revelationType}`),
      ),
      el('div', { class:'surah-name-ar' }, s.name),
    );
  }

  function continueCard(last){
    const card = el('div', { class:'continue-card', role:'region', 'aria-label':'Continue reading' });
    card.innerHTML =
      '<div class="cr-icon" aria-hidden="true">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"' +
        ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M2 12h20"/><polyline points="15 5 22 12 15 19"/></svg>' +
      '</div>';
    const body = el('div', { class:'cr-body' },
      el('small', {}, 'Continue reading'),
      el('strong', {}, `${last.surahName} — verse ${last.numberInSurah}`),
    );
    const actions = el('div', { class:'cr-actions' },
      el('a', { class:'btn-inline', href:`#/surah/${last.surahId}/verse/${last.numberInSurah}` }, 'Resume'),
    );
    const dismiss = el('button', { class:'cr-dismiss', type:'button', 'aria-label':'Clear continue reading' });
    dismiss.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    dismiss.addEventListener('click', () => {
      LastRead.clear();
      card.remove();
    });
    actions.appendChild(dismiss);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
  }

  // Navigate to a randomly-selected surah (1..114). Loads the list if needed.
  async function openRandomSurah(){
    if (!state.surahs){
      try{ state.surahs = await Api.listSurahs(); } catch(_){}
    }
    const n = Math.floor(Math.random() * 114) + 1;
    Router.navigate('#/surah/' + n);
  }

  // Async: fetch today's verse and swap the skeleton for a real card.
  async function renderVerseOfDay(slot){
    const pick = VerseOfDay.pickToday();
    let data;
    try{ data = await VerseOfDay.fetch(pick, state.translation); }
    catch(_){ slot.innerHTML = ''; return; }   // Silently drop VOD if it fails

    const arabic = data.find(e => e.edition.identifier === CONFIG.ARABIC_EDITION);
    const trans  = data.find(e => e.edition.identifier !== CONFIG.ARABIC_EDITION);
    if (!arabic) { slot.innerHTML = ''; return; }

    let arText = arabic.text;
    if (arabic.numberInSurah === 1 && arabic.surah.number !== 1 && arabic.surah.number !== 9){
      arText = stripBismillah(arText);
    }
    const surahName = arabic.surah.englishName;
    const surahId   = arabic.surah.number;
    const vNum      = arabic.numberInSurah;

    const card = el('article', { class:'vod-card', 'aria-label':'Verse of the day' });
    card.innerHTML =
      '<span class="vod-label">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"' +
        ' fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.8 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg>' +
        'Verse of the Day' +
      '</span>' +
      '<p class="vod-arabic" lang="ar" dir="rtl">' + escapeHtml(arText) + '</p>' +
      (trans ? '<p class="vod-translation">' + escapeHtml(trans.text) + '</p>' : '');
    const foot = el('div', { class:'vod-foot' },
      el('div', { class:'vod-ref' }, el('strong', {}, surahName), ` · ${surahId}:${vNum}`),
    );
    const actions = el('div', { class:'vod-actions' });
    const openLink = el('a', { class:'vod-btn primary', href:`#/surah/${surahId}/verse/${vNum}` }, 'Open verse');
    const shareBtn = el('button', { class:'vod-btn', type:'button', 'aria-label':'Share this verse' });
    shareBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
      '<line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>Share';
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Share.openMenu(shareBtn, {
        arabic: arText,
        translation: trans ? trans.text : '',
        surahName, surahId, numberInSurah: vNum,
      });
    });
    actions.append(openLink, shareBtn);
    foot.appendChild(actions);
    card.appendChild(foot);

    slot.innerHTML = '';
    slot.appendChild(card);
  }

  function renderSkeletonGrid(){
    const grid = el('div', { class:'surah-grid' });
    for (let i=0; i<12; i++) grid.appendChild(el('div', { class:'skeleton skel-card' }));
    return grid;
  }

  // -----  SURAH DETAIL  -----
  async function renderSurah(id, verseAnchor){
    if (!Number.isInteger(id) || id < 1 || id > 114){
      showError({ message: 'Invalid surah number.' }, () => Router.navigate('#/'));
      return;
    }
    showSpinner('Loading Surah…');

    let editions;
    try{
      editions = await Api.surahWithTranslation(id, state.translation);
    } catch(err){
      showError(err, () => renderSurah(id));
      return;
    }

    const arabic = editions.find(e => e.edition.identifier === CONFIG.ARABIC_EDITION);
    const trans  = editions.find(e => e.edition.identifier !== CONFIG.ARABIC_EDITION);
    const surahMeta = arabic; // both editions share surah metadata
    const trInfo = translationById(state.translation);
    const isRTL = !!trInfo.rtl;

    setDocumentMeta(
      `${surahMeta.englishName} (${surahMeta.name}) · Surah ${surahMeta.number} — Noor al-Quran`,
      `Read Surah ${surahMeta.englishName} — ${surahMeta.englishNameTranslation}. ${surahMeta.numberOfAyahs} verses. ${surahMeta.revelationType}. Arabic text with translation and recitation.`
    );

    // Ensure surah list is loaded (for prev/next names)
    if (!state.surahs){
      try{ state.surahs = await Api.listSurahs(); } catch(_){}
    }

    // Build page
    main.innerHTML = '';
    const wrap = el('div', { class:'container' });
    main.appendChild(wrap);

    // Breadcrumb
    wrap.appendChild(el('nav', { class:'breadcrumb', 'aria-label':'Breadcrumb' },
      el('a', { href:'#/' }, '← All Surahs'),
    ));

    // Save this surah for the audio player
    state.currentSurah = {
      id: surahMeta.number,
      englishName: surahMeta.englishName,
      ayahs: arabic.ayahs,   // each ayah has: number (global 1-6236), numberInSurah, text
    };

    // Surah header (with "Play all" button)
    const playAllBtn = el('button', { class:'play-all-btn', type:'button', 'aria-label':'Play all verses' });
    playAllBtn.innerHTML = ICONS.playFilled + '<span>Play all</span>';
    playAllBtn.addEventListener('click', () => {
      state.hadUserAudio = true;
      Player.playAllForCurrentSurah();
    });

    wrap.appendChild(el('header', { class:'surah-header' },
      el('div', { class:'name-ar' }, surahMeta.name),
      el('h1', {}, `${surahMeta.englishName} — ${surahMeta.englishNameTranslation}`),
      el('p', { class:'meta' },
        el('span', {}, `Surah ${surahMeta.number}`),
        el('span', { class:'dot' }),
        el('span', {}, `${surahMeta.numberOfAyahs} verses`),
        el('span', { class:'dot' }),
        el('span', {}, surahMeta.revelationType),
      ),
      playAllBtn,
    ));

    // Bismillah block (all surahs except Al-Fatiha (1) and At-Tawbah (9))
    if (id !== 1 && id !== 9){
      wrap.appendChild(el('div', { class:'bismillah-block' }, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'));
    }

    // Verses
    const list = el('div', { class:'verse-list' });
    for (let i=0; i<arabic.ayahs.length; i++){
      const a = arabic.ayahs[i];
      const t = trans && trans.ayahs[i];
      // For surahs 2-114 (except 9) the Uthmani edition prepends Bismillah to ayah 1.
      // We show Bismillah separately above, so strip it from the first ayah's text.
      let arText = a.text;
      if (id !== 1 && id !== 9 && a.numberInSurah === 1){
        arText = stripBismillah(arText);
      }
      list.appendChild(verseCard(a, arText, t, trInfo, isRTL, id, surahMeta.englishName, surahMeta.name));
    }
    wrap.appendChild(list);

    // Re-apply audio highlight if the player is on this surah
    if (Player.surahId === id) Player._render();

    // Prev/Next navigation
    const prevId = id > 1   ? id - 1 : null;
    const nextId = id < 114 ? id + 1 : null;
    const prev = state.surahs ? state.surahs.find(s => s.number === prevId) : null;
    const next = state.surahs ? state.surahs.find(s => s.number === nextId) : null;

    const nav = el('nav', { class:'surah-nav', 'aria-label':'Surah navigation' });
    if (prev){
      nav.appendChild(el('a', { class:'nav-btn', href:`#/surah/${prev.number}` },
        el('span', {}, '←'),
        el('div', {}, el('small', {}, 'Previous'), el('strong', {}, prev.englishName)),
      ));
    } else {
      nav.appendChild(el('div', { class:'nav-btn disabled' }, el('span',{},'—'), el('div',{}, el('small',{},'Start'), el('strong',{},''))));
    }
    if (next){
      nav.appendChild(el('a', { class:'nav-btn next', href:`#/surah/${next.number}` },
        el('div', {}, el('small', {}, 'Next'), el('strong', {}, next.englishName)),
        el('span', {}, '→'),
      ));
    }
    wrap.appendChild(nav);

    // If arriving via #/surah/{id}/verse/{n} — scroll to that verse and flash it.
    // Otherwise scroll to top.
    if (verseAnchor){
      requestAnimationFrame(() => {
        const target = wrap.querySelector(`.verse[data-verse="${verseAnchor}"]`);
        if (target){
          target.scrollIntoView({ block:'center', behavior:'smooth' });
          target.classList.add('verse-flash');
          setTimeout(() => target.classList.remove('verse-flash'), 2500);
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    // Start tracking scroll position so we can offer "Continue reading" later
    trackReadingProgress(surahMeta);

    // Autoplay if enabled AND the user has already interacted with audio this session
    // (browsers block autoplay without a prior user gesture).
    if (state.autoplay && state.hadUserAudio && Player.surahId !== id){
      setTimeout(() => Player.playAllForCurrentSurah(), 60);
    }
  }

  function verseCard(ayah, arText, trAyah, trInfo, isRTL, surahId, surahName, surahNameAr){
    // Per-verse play button (SVG icons swap based on `.playing` class on the card)
    const playBtn = el('button', {
      class:'verse-play-btn', type:'button',
      'aria-label':`Play verse ${ayah.numberInSurah}`,
      title:'Play verse',
    });
    playBtn.innerHTML = ICONS.play + ICONS.pause;
    playBtn.addEventListener('click', () => {
      state.hadUserAudio = true;
      Player.playVerseInCurrentSurah(ayah.numberInSurah);
    });

    // Bookmark button
    const isMarked = Bookmarks.has(ayah.number);
    const bmBtn = el('button', {
      class:'bookmark-btn', type:'button',
      'aria-label': isMarked ? 'Remove bookmark' : 'Bookmark this verse',
      'aria-pressed': String(isMarked),
      'data-on': String(isMarked),
      title: isMarked ? 'Remove bookmark' : 'Bookmark',
    });
    bmBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    bmBtn.addEventListener('click', () => {
      Bookmarks.toggle({
        globalNumber: ayah.number,
        surahId, surahName, surahNameAr,
        numberInSurah: ayah.numberInSurah,
        arabic: arText,
      });
      const on = Bookmarks.has(ayah.number);
      bmBtn.setAttribute('data-on', String(on));
      bmBtn.setAttribute('aria-pressed', String(on));
      bmBtn.setAttribute('aria-label', on ? 'Remove bookmark' : 'Bookmark this verse');
    });

    // Share button — opens the popover with copy/link/WhatsApp/X/native
    const shareBtn = el('button', {
      class:'verse-share-btn', type:'button',
      'aria-label':`Share verse ${ayah.numberInSurah}`, title:'Share verse',
    });
    shareBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
      '<line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>';
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Share.openMenu(shareBtn, {
        arabic: arText,
        translation: trAyah ? trAyah.text : '',
        surahName, surahId, numberInSurah: ayah.numberInSurah,
      });
    });

    const card = el('article', {
      class:'verse',
      'data-verse': ayah.numberInSurah,
      'data-surah': surahId,
      'aria-label':`Verse ${ayah.numberInSurah}`,
    },
      el('div', { class:'verse-head' },
        el('div', { class:'verse-badge', 'aria-hidden':'true' }, String(ayah.numberInSurah)),
        el('div', { class:'verse-actions' }, playBtn, bmBtn, shareBtn),
      ),
      el('p', { class:'verse-arabic', lang:'ar', dir:'rtl' }, arText),
    );
    if (trAyah){
      const p = el('p', {
        class:'verse-translation',
        'data-rtl': String(isRTL),
        lang: trInfo.id.split('.')[0],
        dir: isRTL ? 'rtl' : 'ltr',
      }, trAyah.text);
      p.appendChild(el('small', { class:'verse-translator' }, `— ${trInfo.name}`));
      card.appendChild(p);
    }
    return card;
  }

  // -----  BOOKMARKS  -----
  function renderBookmarks(){
    setDocumentMeta('Bookmarks — Noor al-Quran', 'Your saved verses from the Holy Quran.');
    main.innerHTML = '';
    const wrap = el('div', { class:'container' });
    main.appendChild(wrap);

    wrap.appendChild(el('nav', { class:'breadcrumb', 'aria-label':'Breadcrumb' },
      el('a', { href:'#/' }, '← All Surahs'),
    ));

    wrap.appendChild(el('h1', { class:'page-title' }, 'Bookmarks'));
    const items = Bookmarks.all();
    wrap.appendChild(el('p', { class:'page-lead' },
      items.length ? `${items.length} saved verse${items.length === 1 ? '' : 's'}` : 'Verses you bookmark appear here.',
    ));

    if (items.length === 0){
      const empty = el('div', { class:'empty-state' });
      empty.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24"' +
        ' fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
      empty.appendChild(el('h2', {}, 'No bookmarks yet'));
      empty.appendChild(el('p', {}, 'Open any surah and tap the bookmark icon on a verse to save it.'));
      wrap.appendChild(empty);
      return;
    }

    // Group by surah
    const grouped = {};
    items.forEach(b => { (grouped[b.surahId] = grouped[b.surahId] || []).push(b); });

    Object.keys(grouped).sort((a,b) => parseInt(a)-parseInt(b)).forEach(surahId => {
      const first = grouped[surahId][0];
      wrap.appendChild(el('div', { class:'section-heading' },
        el('span', {}, `${first.surahName} · Surah ${surahId}`),
        el('span', { class:'name-ar' }, first.surahNameAr || ''),
      ));

      const list = el('div', { class:'verse-list' });
      grouped[surahId].forEach(b => {
        const card = el('article', { class:'verse' },
          el('span', { class:'verse-ref-inline' }, `Verse ${b.numberInSurah}`),
          el('p', { class:'verse-arabic', lang:'ar', dir:'rtl' }, b.arabic),
        );
        const actions = el('div', { style:'display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;' },
          el('a', { class:'btn-inline', href:`#/surah/${surahId}` }, 'Open surah'),
          el('button', { class:'btn-secondary', type:'button' }, 'Remove'),
        );
        actions.lastChild.addEventListener('click', () => {
          Bookmarks.remove(b.globalNumber);
          renderBookmarks();
        });
        card.appendChild(actions);
        list.appendChild(card);
      });
      wrap.appendChild(list);
    });

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // -----  JUZ / PAGE (shared renderer)  -----
  async function renderJuz(id){  return _renderRange('juz',  id); }
  async function renderPage(id){ return _renderRange('page', id); }

  async function _renderRange(kind, id){
    const max = kind === 'juz' ? CONFIG.JUZ_COUNT : CONFIG.PAGE_COUNT;
    if (!Number.isInteger(id) || id < 1 || id > max){
      showError({ message:`Invalid ${kind} number.` }, () => Router.navigate('#/'));
      return;
    }
    const label = kind === 'juz' ? `Juz ${id}` : `Page ${id}`;
    setDocumentMeta(`${label} — Noor al-Quran`, `Read ${label} of the Holy Quran with Arabic text and translation.`);
    showSpinner(`Loading ${kind === 'juz' ? 'Juz' : 'Page'}…`);

    let editions;
    try{
      editions = kind === 'juz'
        ? await Api.juz(id,  state.translation)
        : await Api.page(id, state.translation);
    } catch(err){
      showError(err, () => _renderRange(kind, id));
      return;
    }

    // Response shape: array of two edition objects; each has `ayahs` where each ayah has .surah metadata
    const arabic = editions.find(e => e.edition.identifier === CONFIG.ARABIC_EDITION);
    const trans  = editions.find(e => e.edition.identifier !== CONFIG.ARABIC_EDITION);
    const trInfo = translationById(state.translation);
    const isRTL  = !!trInfo.rtl;

    main.innerHTML = '';
    const wrap = el('div', { class:'container' });
    main.appendChild(wrap);

    wrap.appendChild(el('nav', { class:'breadcrumb', 'aria-label':'Breadcrumb' },
      el('a', { href:'#/' }, '← All Surahs'),
    ));

    wrap.appendChild(el('h1', { class:'page-title' }, label));
    wrap.appendChild(el('p', { class:'page-lead' }, `${arabic.ayahs.length} verses`));

    // Group ayahs by surah
    const groups = new Map();
    arabic.ayahs.forEach((a, i) => {
      const sId = a.surah.number;
      if (!groups.has(sId)) groups.set(sId, { meta: a.surah, ayahs: [], transAyahs: [] });
      groups.get(sId).ayahs.push(a);
      if (trans && trans.ayahs[i]) groups.get(sId).transAyahs.push(trans.ayahs[i]);
    });

    groups.forEach((group) => {
      wrap.appendChild(el('div', { class:'section-heading' },
        el('span', {}, `${group.meta.englishName} · Surah ${group.meta.number}`),
        el('span', { class:'name-ar' }, group.meta.name),
      ));
      const list = el('div', { class:'verse-list' });
      for (let i=0; i<group.ayahs.length; i++){
        const a = group.ayahs[i];
        let arText = a.text;
        // Strip Bismillah prefix if this is verse 1 of any surah other than 1 or 9
        if (a.numberInSurah === 1 && group.meta.number !== 1 && group.meta.number !== 9){
          arText = stripBismillah(arText);
        }
        const t = group.transAyahs[i];
        list.appendChild(verseCard(a, arText, t, trInfo, isRTL, group.meta.number, group.meta.englishName, group.meta.name));
      }
      wrap.appendChild(list);
    });

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // ==========================================================
  // RENDER (top-level dispatcher)
  // ==========================================================
  async function render(){
    // Always close the drawer + share popover on navigation
    Drawer.close();
    Share.closeMenu();
    updateBottomNavActive();
    // Any navigation counts as a "reading day" for streak purposes
    Streak.mark();
    const route = Router.parse();
    if (route.name === 'home')      return renderHome();
    if (route.name === 'surah')     return renderSurah(route.id, route.verse);
    if (route.name === 'juz')       return renderJuz(route.id);
    if (route.name === 'page')      return renderPage(route.id);
    if (route.name === 'bookmarks') return renderBookmarks();
    return renderHome();
  }

  // ==========================================================
  // THEME (light / dark)
  //   Priority: saved choice → system preference → light default
  // ==========================================================
  const Theme = {
    KEY: 'nq:theme',
    apply(mode){
      document.documentElement.setAttribute('data-theme', mode);
      const btn = $('#themeToggle');
      if (btn){
        const isDark = mode === 'dark';
        btn.setAttribute('aria-pressed', String(isDark));
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      }
      // Update browser chrome color to match the theme
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', mode === 'dark' ? '#0e1613' : '#0f5132');
    },
    current(){ return document.documentElement.getAttribute('data-theme') || 'light'; },
    toggle(){
      const next = this.current() === 'dark' ? 'light' : 'dark';
      localStorage.setItem(this.KEY, next);
      this.apply(next);
    },
    init(){
      const saved = localStorage.getItem(this.KEY);
      const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.apply(saved || (systemDark ? 'dark' : 'light'));

      const btn = $('#themeToggle');
      if (btn) btn.addEventListener('click', () => this.toggle());

      // Follow system changes only if user hasn't chosen manually
      if (window.matchMedia){
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (!localStorage.getItem(this.KEY)) this.apply(e.matches ? 'dark' : 'light');
        });
      }
    },
  };

  // ==========================================================
  // RECITER SELECTOR
  // ==========================================================
  function initReciterSelector(){
    const sel = $('#reciterSelect');
    CONFIG.RECITERS.forEach(r => {
      const opt = el('option', { value: r.id }, r.name);
      if (r.id === state.reciter) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', (e) => {
      state.reciter = e.target.value;
      localStorage.setItem('nq:reciter', state.reciter);
      Player.reloadCurrentIfPlaying();
      // Update the reciter shown in the audio bar (if visible)
      Player._render();
    });
  }

  // ==========================================================
  // DRAWER (right-side menu)
  // ==========================================================
  const Drawer = {
    open(){
      $('#drawer').hidden = false;
      $('#drawerOverlay').hidden = false;
      $('#menuBtn').setAttribute('aria-expanded', 'true');
      updateBookmarkCount();
      updateContinueDrawer();
      // Move focus into the drawer for keyboard users
      setTimeout(() => $('#drawer').focus(), 10);
    },
    close(){
      $('#drawer').hidden = true;
      $('#drawerOverlay').hidden = true;
      $('#menuBtn').setAttribute('aria-expanded', 'false');
    },
    init(){
      $('#menuBtn').addEventListener('click',        () => this.open());
      $('#bnMenuBtn').addEventListener('click',      () => this.open());
      $('#drawerClose').addEventListener('click',    () => this.close());
      $('#drawerOverlay').addEventListener('click',  () => this.close());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('#drawer').hidden) this.close();
      });

      // Populate Juz dropdown
      const juzSel = $('#jumpJuz');
      juzSel.appendChild(el('option', { value:'' }, 'Choose Juz…'));
      for (let i=1; i<=CONFIG.JUZ_COUNT; i++){
        juzSel.appendChild(el('option', { value:String(i) }, `Juz ${i}`));
      }
      juzSel.addEventListener('change', (e) => {
        if (e.target.value){
          Router.navigate(`#/juz/${e.target.value}`);
          e.target.value = '';
        }
      });

      // Page: input + Go button
      const pageInput = $('#jumpPage');
      const goToPage = () => {
        const n = parseInt(pageInput.value, 10);
        if (n >= 1 && n <= CONFIG.PAGE_COUNT){
          Router.navigate(`#/page/${n}`);
          pageInput.value = '';
        }
      };
      $('#jumpPageGo').addEventListener('click', goToPage);
      pageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') goToPage(); });
    },
  };

  // ==========================================================
  // SETTINGS  (font size, autoplay)
  // ==========================================================
  const Settings = {
    applyFontSize(px){
      document.documentElement.style.setProperty('--arabic-size', px + 'px');
      const label = $('#fontSizeVal');
      if (label) label.textContent = String(px);
      const slider = $('#fontSizeSlider');
      if (slider) slider.value = String(px);
    },
    init(){
      // Initial values from state
      this.applyFontSize(state.fontSize);
      $('#autoplayToggle').checked = state.autoplay;

      $('#fontSizeSlider').addEventListener('input', (e) => {
        const px = parseInt(e.target.value, 10);
        state.fontSize = px;
        localStorage.setItem('nq:fontSize', String(px));
        this.applyFontSize(px);
      });
      $('#autoplayToggle').addEventListener('change', (e) => {
        state.autoplay = !!e.target.checked;
        localStorage.setItem('nq:autoplay', String(state.autoplay));
      });
      $('#resetSettings').addEventListener('click', () => {
        state.fontSize = CONFIG.DEFAULT_ARABIC_SIZE;
        state.autoplay = false;
        localStorage.removeItem('nq:fontSize');
        localStorage.removeItem('nq:autoplay');
        this.applyFontSize(state.fontSize);
        $('#autoplayToggle').checked = false;
      });
    },
  };

  // ==========================================================
  // TRANSLATION SELECTOR
  // ==========================================================
  function initTranslationSelector(){
    const sel = $('#translationSelect');
    // Group by language for a tidy dropdown
    const groups = {};
    CONFIG.TRANSLATIONS.forEach(t => {
      (groups[t.lang] = groups[t.lang] || []).push(t);
    });
    Object.entries(groups).forEach(([lang, items]) => {
      const og = el('optgroup', { label: lang });
      items.forEach(t => {
        const opt = el('option', { value: t.id }, t.name);
        if (t.id === state.translation) opt.selected = true;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    sel.addEventListener('change', (e) => {
      state.translation = e.target.value;
      localStorage.setItem('nq:translation', state.translation);
      updateOfflineBadge();   // offline cache is per-translation
      // Re-render current view to show new translation
      render();
    });
  }

  // ==========================================================
  // COMMAND PALETTE  (Cmd/Ctrl + K)
  //   Fuzzy-searches all 114 surahs, plus quick actions like
  //   "juz 5", "page 42", "random", "bookmarks", "home".
  // ==========================================================
  const CommandPalette = {
    _open: false,
    _items: [],       // current result set: { title, sub, ar, href, cp }
    _index: 0,        // selected result

    async _ensureSurahs(){
      if (!state.surahs){
        try{ state.surahs = await Api.listSurahs(); } catch(_){ state.surahs = []; }
      }
    },

    _buildResults(q){
      q = (q || '').trim().toLowerCase();
      const out = [];

      // Quick range commands: "juz N", "page N"
      const juzMatch  = q.match(/^juz\s*(\d+)$/i);
      const pageMatch = q.match(/^page\s*(\d+)$/i);
      if (juzMatch){
        const n = Math.min(CONFIG.JUZ_COUNT, Math.max(1, parseInt(juzMatch[1], 10)));
        out.push({ title:`Juz ${n}`, sub:'Open Juz', href:`#/juz/${n}`, cp:'J' });
      }
      if (pageMatch){
        const n = Math.min(CONFIG.PAGE_COUNT, Math.max(1, parseInt(pageMatch[1], 10)));
        out.push({ title:`Page ${n}`, sub:'Open page', href:`#/page/${n}`, cp:'P' });
      }

      // Static commands (always at bottom, matched by keyword)
      const commands = [
        { key:'random',    title:'Random surah',    sub:'Open a surah at random',    action:'random',    cp:'⚂' },
        { key:'bookmarks', title:'Bookmarks',       sub:'View your saved verses',    href:'#/bookmarks', cp:'★' },
        { key:'home',      title:'Home',            sub:'Return to the surah grid',  href:'#/',          cp:'⌂' },
      ];

      // Surahs — english name / arabic / translation / number
      (state.surahs || []).forEach(s => {
        if (!q ||
            String(s.number).includes(q) ||
            s.englishName.toLowerCase().includes(q) ||
            s.englishNameTranslation.toLowerCase().includes(q) ||
            s.name.includes(q)){
          out.push({
            title: s.englishName,
            sub:   `${s.englishNameTranslation} · ${s.numberOfAyahs} verses · ${s.revelationType}`,
            ar:    s.name,
            href:  `#/surah/${s.number}`,
            cp:    String(s.number),
          });
        }
      });

      // Append matching static commands
      commands.forEach(c => {
        if (!q || c.key.startsWith(q) || c.title.toLowerCase().includes(q)) out.push(c);
      });

      return out.slice(0, 60);   // cap for perf + readability
    },

    _renderList(){
      const list = $('#cmdpalList');
      list.innerHTML = '';
      if (this._items.length === 0){
        list.innerHTML = '<li class="cmdpal-empty">No matches. Try a surah name, or "juz 5", or "page 42".</li>';
        return;
      }
      this._items.forEach((it, i) => {
        const li = el('li', {
          class:'cmdpal-item', role:'option',
          'aria-selected': String(i === this._index),
          'data-i': String(i),
        });
        li.innerHTML =
          '<span class="cp-num">' + escapeHtml(it.cp || '·') + '</span>' +
          '<div class="cp-main"><div class="cp-title">' + escapeHtml(it.title) + '</div>' +
          (it.sub ? '<div class="cp-sub">' + escapeHtml(it.sub) + '</div>' : '') + '</div>' +
          (it.ar ? '<div class="cp-ar" lang="ar" dir="rtl">' + escapeHtml(it.ar) + '</div>' : '');
        li.addEventListener('click', () => this._activate(i));
        li.addEventListener('mousemove', () => {
          if (this._index !== i){ this._index = i; this._syncSelection(); }
        });
        list.appendChild(li);
      });
    },

    _syncSelection(){
      const items = $$('.cmdpal-item', $('#cmdpalList'));
      items.forEach((el, i) => el.setAttribute('aria-selected', String(i === this._index)));
      const sel = items[this._index];
      if (sel) sel.scrollIntoView({ block:'nearest' });
    },

    _activate(i){
      const it = this._items[i];
      if (!it) return;
      this.close();
      if (it.action === 'random') { openRandomSurah(); return; }
      if (it.href) Router.navigate(it.href);
    },

    async open(){
      await this._ensureSurahs();
      this._open = true;
      $('#cmdpalOverlay').hidden = false;
      $('#cmdpal').hidden = false;
      const input = $('#cmdpalInput');
      input.value = '';
      this._items = this._buildResults('');
      this._index = 0;
      this._renderList();
      setTimeout(() => input.focus(), 20);
    },

    close(){
      this._open = false;
      $('#cmdpalOverlay').hidden = true;
      $('#cmdpal').hidden = true;
    },

    init(){
      const input = $('#cmdpalInput');
      const overlay = $('#cmdpalOverlay');
      overlay.addEventListener('click', () => this.close());
      input.addEventListener('input', debounce((e) => {
        this._items = this._buildResults(e.target.value);
        this._index = 0;
        this._renderList();
      }, 60));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown'){ e.preventDefault(); this._index = Math.min(this._items.length - 1, this._index + 1); this._syncSelection(); }
        else if (e.key === 'ArrowUp'){ e.preventDefault(); this._index = Math.max(0, this._index - 1); this._syncSelection(); }
        else if (e.key === 'Enter'){ e.preventDefault(); this._activate(this._index); }
        else if (e.key === 'Escape'){ e.preventDefault(); this.close(); }
      });
    },
  };

  // ==========================================================
  // KEYBOARD SHORTCUTS + HELP MODAL
  // ==========================================================
  const KbdHelp = {
    open(){ $('#kbdOverlay').hidden = false; $('#kbdHelp').hidden = false; },
    close(){ $('#kbdOverlay').hidden = true; $('#kbdHelp').hidden = true; },
    init(){
      $('#kbdHelpClose').addEventListener('click', () => this.close());
      $('#kbdOverlay').addEventListener('click', () => this.close());
    },
  };

  const Shortcuts = {
    _gTimer: null,      // g-prefix combos ("g h", "g b")
    _visibleVerse(){
      // Return the .verse element nearest the middle of the viewport, or null
      const verses = $$('.verse[data-verse]');
      if (verses.length === 0) return null;
      const midY = window.innerHeight / 2;
      let best = null, bestDist = Infinity;
      for (const v of verses){
        const r = v.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - midY);
        if (d < bestDist){ bestDist = d; best = v; }
      }
      return best;
    },
    _scrollToVerse(delta){
      const cur = this._visibleVerse();
      if (!cur) return;
      const num = parseInt(cur.getAttribute('data-verse'), 10);
      const surah = cur.getAttribute('data-surah');
      const target = document.querySelector(`.verse[data-verse="${num + delta}"][data-surah="${surah}"]`);
      if (target) target.scrollIntoView({ block:'center', behavior:'smooth' });
    },
    _bookmarkVisible(){
      const v = this._visibleVerse();
      if (!v) return;
      const btn = v.querySelector('.bookmark-btn');
      if (btn) btn.click();
    },
    _shareVisible(){
      const v = this._visibleVerse();
      if (!v) return;
      const btn = v.querySelector('.verse-share-btn');
      if (btn) btn.click();
    },
    _navSurah(delta){
      const route = Router.parse();
      if (route.name !== 'surah') return;
      const next = route.id + delta;
      if (next >= 1 && next <= 114) Router.navigate('#/surah/' + next);
    },
    init(){
      document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl+K opens command palette from anywhere (also in inputs)
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){
          e.preventDefault();
          if (CommandPalette._open) CommandPalette.close();
          else                      CommandPalette.open();
          return;
        }
        // Escape closes any modal, popover, or the drawer
        if (e.key === 'Escape'){
          if (CommandPalette._open){ CommandPalette.close(); return; }
          if (!$('#kbdHelp').hidden){ KbdHelp.close(); return; }
          if (!$('#sharePop').hidden){ Share.closeMenu(); return; }
          if (!$('#drawer').hidden){ Drawer.close(); return; }
          return;
        }

        // Skip other shortcuts while typing in an input
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        const k = e.key;

        // g-prefix combos: g h → home, g b → bookmarks
        if (this._gTimer){
          clearTimeout(this._gTimer); this._gTimer = null;
          if (k === 'h'){ e.preventDefault(); Router.navigate('#/'); return; }
          if (k === 'b'){ e.preventDefault(); Router.navigate('#/bookmarks'); return; }
        }
        if (k === 'g'){ this._gTimer = setTimeout(() => { this._gTimer = null; }, 900); return; }

        // Single-key shortcuts
        if (k === '?'){ e.preventDefault(); KbdHelp.open(); }
        else if (k === '/'){
          const s = $('#surahSearchInput');
          if (s){ e.preventDefault(); s.focus(); s.select(); }
        }
        else if (k === 'j'){ e.preventDefault(); this._scrollToVerse(+1); }
        else if (k === 'k'){ e.preventDefault(); this._scrollToVerse(-1); }
        else if (k === 'n'){ e.preventDefault(); this._navSurah(+1); }
        else if (k === 'p'){ e.preventDefault(); this._navSurah(-1); }
        else if (k === 'b'){ e.preventDefault(); this._bookmarkVisible(); }
        else if (k === 's'){ e.preventDefault(); this._shareVisible(); }
        else if (k === 'd'){ e.preventDefault(); Theme.toggle(); }
      });
    },
  };

  // ==========================================================
  // INSTALL PROMPT (PWA add-to-home-screen banner)
  // ==========================================================
  const Install = {
    DISMISS_KEY: 'nq:installDismissed',   // ISO date user last dismissed
    DISMISS_DAYS: 14,                     // hide banner this long after dismiss
    _deferred: null,

    init(){
      // iOS Safari doesn't fire beforeinstallprompt. Show a manual prompt there.
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
      if (isStandalone) return;   // already installed — no banner ever

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this._deferred = e;
        if (this._recentlyDismissed()) return;
        this._showBanner(/*ios*/ false);
      });

      window.addEventListener('appinstalled', () => {
        this._hideBanner();
        Toast.show('Installed! Downloading for offline…');
        // Trigger a full offline download so the installed app works with no network.
        OfflineDownloader.run({ silent: false });
      });

      // iOS Safari fallback — show a "Add to Home Screen" hint after 3s if not dismissed.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isIOS && isSafari && !this._recentlyDismissed()){
        setTimeout(() => this._showBanner(/*ios*/ true), 3000);
      }
    },

    _recentlyDismissed(){
      const raw = localStorage.getItem(this.DISMISS_KEY);
      if (!raw) return false;
      const ago = (Date.now() - parseInt(raw, 10)) / (24 * 60 * 60 * 1000);
      return ago < this.DISMISS_DAYS;
    },

    _showBanner(ios){
      const banner = document.getElementById('installBanner');
      if (!banner) return;
      if (ios){
        const text = banner.querySelector('.install-banner-text');
        if (text){
          text.innerHTML = '<strong>Install Noor al-Quran</strong>' +
            '<small>Tap Share → Add to Home Screen</small>';
        }
        const accept = document.getElementById('installAccept');
        if (accept) accept.hidden = true;   // no programmatic install on iOS
      }
      banner.hidden = false;
      requestAnimationFrame(() => {
        banner.classList.add('show');
        document.body.classList.add('install-banner-open');
      });
      const accept  = document.getElementById('installAccept');
      const dismiss = document.getElementById('installDismiss');
      if (accept && !accept.__wired){
        accept.__wired = true;
        accept.addEventListener('click', () => this._accept());
      }
      if (dismiss && !dismiss.__wired){
        dismiss.__wired = true;
        dismiss.addEventListener('click', () => this._dismiss());
      }
    },

    _hideBanner(){
      const banner = document.getElementById('installBanner');
      if (!banner) return;
      banner.classList.remove('show');
      document.body.classList.remove('install-banner-open');
      setTimeout(() => { banner.hidden = true; }, 300);
    },

    async _accept(){
      if (!this._deferred){
        this._hideBanner();
        return;
      }
      this._deferred.prompt();
      try{
        const choice = await this._deferred.userChoice;
        this._deferred = null;
        if (choice && choice.outcome === 'accepted'){
          this._hideBanner();
        } else {
          this._dismiss();
        }
      } catch(_){ this._hideBanner(); }
    },

    _dismiss(){
      localStorage.setItem(this.DISMISS_KEY, String(Date.now()));
      this._hideBanner();
    },
  };

  // ==========================================================
  // OFFLINE DOWNLOADER
  // Pre-fetches all 114 surahs in the current translation so the whole
  // app works with zero network. Writes to both localStorage (via Cache)
  // and the service-worker runtime cache (via a normal fetch that SW intercepts).
  // ==========================================================
  const OfflineDownloader = {
    DONE_KEY: 'nq:offlineDone',   // stores the translation id that was fully cached

    isDone(translationId){
      return localStorage.getItem(this.DONE_KEY) === (translationId || state.translation);
    },

    async run({ silent = false } = {}){
      const translationId = state.translation;
      const total = 114;
      const ui = silent ? null : this._openUI(total);

      let done = 0, failed = 0;
      const CONCURRENCY = 4;
      const queue = Array.from({ length: total }, (_, i) => i + 1);

      const worker = async () => {
        while (queue.length){
          const id = queue.shift();
          if (id == null) return;
          try{
            // If already in localStorage cache we skip network; else fetch.
            // Api.surahWithTranslation already handles the caching for us.
            await Api.surahWithTranslation(id, translationId);
          } catch(_){
            failed++;
          }
          done++;
          if (ui) ui.update(done, total);
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      if (ui) ui.finish(failed);

      if (failed === 0){
        localStorage.setItem(this.DONE_KEY, translationId);
        updateOfflineBadge();
        if (!silent) Toast.show('Ready to read offline — all 114 surahs saved.');
      } else if (!silent){
        Toast.show(`Downloaded ${total - failed} of ${total}. Try again on better connection.`);
      }
    },

    _openUI(total){
      const box   = document.getElementById('offlineProgress');
      const label = document.getElementById('offlineProgressLabel');
      const pct   = document.getElementById('offlineProgressPct');
      const fill  = document.getElementById('offlineProgressFill');
      if (!box) return null;
      box.hidden = false;
      label.textContent = 'Downloading for offline…';
      pct.textContent = '0%';
      fill.style.width = '0%';
      return {
        update(done, total){
          const p = Math.round((done / total) * 100);
          pct.textContent = p + '%';
          fill.style.width = p + '%';
          label.textContent = `Downloading ${done} / ${total} surahs…`;
        },
        finish(failed){
          label.textContent = failed === 0 ? 'All surahs saved for offline ✓' :
                                             `Saved with ${failed} error(s)`;
          setTimeout(() => { box.hidden = true; }, 2500);
        },
      };
    },
  };

  function updateOfflineBadge(){
    const badge = document.getElementById('drawerOfflineBadge');
    const label = document.getElementById('drawerOfflineLabel');
    if (!badge || !label) return;
    if (OfflineDownloader.isDone()){
      badge.hidden = false;
      label.textContent = 'Saved for offline';
    } else {
      badge.hidden = true;
      label.textContent = 'Download for offline';
    }
  }

  // ==========================================================
  // BOOTSTRAP
  // ==========================================================
  Theme.init();
  initTranslationSelector();
  initReciterSelector();
  Drawer.init();
  Settings.init();
  Player.init();
  CommandPalette.init();
  KbdHelp.init();
  Shortcuts.init();
  updateBookmarkCount();
  updateContinueDrawer();
  updateStreakUI();

  // Wire the drawer's new tool buttons (Random, Cmd+K, Shortcuts)
  const drawerRandom = document.getElementById('drawerRandom');
  if (drawerRandom) drawerRandom.addEventListener('click', () => { Drawer.close(); openRandomSurah(); });
  const drawerCmdK = document.getElementById('drawerCmdK');
  if (drawerCmdK) drawerCmdK.addEventListener('click', () => { Drawer.close(); CommandPalette.open(); });
  const drawerKbd = document.getElementById('drawerKbd');
  if (drawerKbd) drawerKbd.addEventListener('click', () => { Drawer.close(); KbdHelp.open(); });
  const drawerOffline = document.getElementById('drawerOffline');
  if (drawerOffline) drawerOffline.addEventListener('click', () => {
    Drawer.close();
    if (OfflineDownloader.isDone()){
      Toast.show('Already saved offline. Re-download will refresh.');
    }
    OfflineDownloader.run({ silent: false });
  });
  Install.init();
  updateOfflineBadge();

  Router.init();
  render();

  // Register the service worker for offline + installable PWA (silent if it fails)
  if ('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

})();
