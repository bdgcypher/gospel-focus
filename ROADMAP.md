# Roadmap — Gospel Focus

Where the app stands, and what is left to build.

Two things worth saying about how this file is kept. First, the **status of every
destination mirrors `lib/features.ts`** — that catalog is what the navigation, the
home hub, and the section pages are rendered from, so a page's `status` there and
its row here are the same fact written twice, and the catalog wins if they ever
disagree. Second, a **"planned" page already exists**: it renders
`components/feature-page.tsx`, which says plainly that nothing is wired up and
lists the shape the feature will take. "Planned" here means *the door is on the
wall and the room behind it is empty* — not "unstarted".

---

## Guiding principles

1. **The core stays free, forever.** The random passage picker, the page-riffle
   animation, filters, chapter expansion, and Gospel Library links are the soul
   of the app. They are never gated.
2. **The passage text stays free, forever** — scripture *and* general conference.
   Nothing the app can draw is ever paywalled. Charging for sacred text is both
   bad optics and bad business.
3. **We monetize the *additional features*, never the reading experience** —
   games, study tools, focus tools, and AI enhancements. The words themselves are
   always free.
4. **Offline-first.** The web build and the sideloaded APK both run with no
   backend today; new features should preserve that wherever possible. Features
   that genuinely need a server (AI, sync) are the exception, and are called out.
5. **ADHD-friendly by design.** Every feature should lower activation energy:
   one tap to begin, a visible reward, an obvious next step. No infinite feeds,
   no shame mechanics.

---

## Paywall scope (decided)

**Free, forever — the entire reading experience:**

- The random passage picker, filters, presets, and the page-riffle animation.
- Passage text and chapter/talk expansion — scripture **and general conference**.
- Gospel Library links and the daily notification.
- Favorites/history, streaks, share-as-image, and notes. (Favorites, streaks,
  and share-as-image have shipped; history and notes arrive with the journal,
  below — and stay free when they do.)

**Paid — the additional features (extensions on top of the app, not the app):**

1. Mini games — word-search, crossword, shepherd search, fishing, endure-to-the-end trail
2. Scripture story coloring book
3. Modern-language verse conversion
4. Scripture story summarizer
5. Liken-the-scriptures generator
6. Flashcards for memorization
7. App/social-media lock until prayer or study is completed

Everything below is organized around this split.

---

## Built — v1.0.0

Thirty-nine components, twenty-six `lib` modules, eighteen routes, one static
export, one release-signed APK. Nothing leaves the device: there is no backend,
no account, and no network call outside the passage library and the Gospel
Library link.

### Reading — the core

| Surface | What it does |
| --- | --- |
| **Random passage picker** (`/read`) | A weighted draw across every selected source, so a long book or a heavy conference year turns up in proportion to how much text it holds. Loads the manifest, filters, and picks — all client-side. |
| **Filters & presets** | Per-volume toggles with per-book switches inside them, a toggle per general conference, and one-tap presets (*All* / *Bible* / *LDS Standard Works* / *LDS General Conference*). The filters are a sidebar on wide screens and a slide-in pane on phones. |
| **Page-riffle animation** | One continuous deceleration into the draw. Reduce-motion skips straight to the passage. |
| **Chapter & talk expansion** | The whole chapter (or the full conference talk) with the drawn verse highlighted and scrolled into view. |
| **Selection & sharing** | Tap verses or paragraphs — in a row or scattered — in the expanded view. A floating bar follows the page with collapse, Gospel Library, share, and favorite; it steps aside when the chapter's own row of controls comes into view. Long selections are shared as a *set* of images, each up to roughly a screenful (1080 × ≤2400 px), so a chapter's worth of verses stays readable. |
| **Favorites from any surface** | The drawn passage's own star, the chapter's row of controls, and the floating bar all save the same thing, including a scattered pick (`1 Nephi 3:3, 7-9`). |
| **Gospel Library deep links** | Built from the official `churchofjesuschrist.org/study/...` scheme; on Android the link opens in the Gospel Library app when it is installed, and falls back to the in-app browser. |

### The daily habit

| Surface | What it does |
| --- | --- |
| **Verse of the day** | The day does the choosing: `lib/daily.ts` seeds the pick from the local date, so the hub, the reminder, and the passage the app opens on all agree — and the reminder is computable offline. |
| **Daily study goal & timer** | The reader picks a goal (5–30 minutes) and the app starts and stops the session for them while a studying page is open and in front. No visible stopwatch, by design. Minutes are *stored*, not derived, so a second source (time spent in Gospel Library) can add to the same number later. |
| **Streak** (`/streak`, `ready`) | Consecutive local days whose goal was *met* — a day the app was merely opened does not count. No account required. The page leads with the run as one large number, grey until today's goal is met, then a horizontal strip of which days counted — paged with arrows or a swipe — then the freezes. |
| **Streak freezes** (🧊) | Up to two, one at the start. A day missed by midnight spends one automatically and the run keeps its number; a frozen day is painted the buttons' blue in the strip. They are refilled at 200 gems each, or 375 for the pair, from the streak page or the shop (`/shop`), as many as the wallet will hold. |
| **Daily reminder** | Native local notifications (`@capacitor/local-notifications`), opted into in settings with an hour choice, scheduled a window of days ahead so the verse quoted always matches the app's own draw. |
| **Status tray** | Streak, minutes against today's goal, and the lock's state ride in the header as chips, so they are visible everywhere rather than only on the hub. |

### The hub, the sections, and the map

- **Home hub** (`/`): the focus banner (only while there is a gate to arm), the
  day's heading, the goal hero (the one thing to *do*), the verse of the day, and
  four tiles for everything else. The order is deliberate: something to do before
  anything to choose, and the scripture above the fold.
- **Section hubs**: `/study` and `/games`, each rendered from the catalog, each
  listing its own features so a hub and its cards cannot drift apart.
- **Two navigations, one list**: a top bar on wide screens and a bottom tab bar
  under the thumb on phones, with the menu only in the bottom bar. Which is shown
  is decided in CSS, so there is no layout flash and no hydration mismatch.
- **The catalog as the source of truth** (`lib/features.ts`, 16 entries): every
  destination's title, blurb, icon, capabilities, and status live in one place,
  and the nav, the hubs, the cards, and the page metadata are all rendered from
  it. Adding a feature is one entry, not five edits.
- **Placeholder pages that admit they are placeholders**: a "planned" page says so,
  then lists the capabilities the catalog promises. There is one case where the
  catalog's `planned` label understates what is on screen — Focus Lock — and it is
  called out under **Focus** below.

### Study

| Surface | What it does |
| --- | --- |
| **Search** (`/search`, `ready`) | Every verse and conference paragraph searched at once, offline, from a MiniSearch index built by `scripts/search-index.mjs` at build time (11.9 MB of JSON, 2.86 MB gzipped, fetched and inflated once per session). A phrase finds its verse; a citation finds its chapter — `alma 32` lifts Alma 32's own verses to the top in order and `1 nephi 3:7` puts that verse first — with the chapters that merely share the words following on. Within each stream the rows are then ranked by how well a passage answers the query — **more of its words first — the ones that mean something before the glue — then the query's own order, then the whole query as one unbroken run** — because the index matches with AND, so what separates candidates is the words the reader actually typed and their order. The index carries only the words that mean something; the glue (`of`, `still`, `the`) is read back out of the passage text and counted exactly, never above a word with meaning. The index keeps no positions and stores no text, so the candidates are read out of the passage library by id (`loadPassageText`, `lib/search.ts`) in the order they are already ranked, stopping as soon as the page's rows are full of the whole query as one run; a one-word query reads nothing. The page then ranks **scripture above conference** — every verse before any talk, and a reserved slice of ten rows for talks so a word like *faith* still shows the talks that mention it. Results show a window of the passage starting a few words before the query's first match (`previewFrom`), so the highlight is on screen rather than below the two lines a card shows, and open in the reader through `?action=cite`; the words the query matched are marked in the reference and in that window (`highlightMatches` in `lib/search.ts`, by whole word, prefix for a word with meaning and exact for the glue, which is marked too), and submitting the search folds the filters away so the results are what is left on screen. It carries **the passage page's own source filters** (`FilterPanel`, over the same stored selection, with the eligible-passage count beside the toggle), applied before ranking and cutting so narrowing to a volume gives a page of that volume rather than a page with the rest sieved out of it. Common function words are not indexed — indexing them measured 19.09 MB of JSON / 4.84 MB gzipped against 11.89 / 2.86 — but they are counted and marked beside a word that means something, and the page says what they are when a query is nothing but them. |
| **Scripture memorization** (`/memorize`, `ready`) | Word hiding that steps a passage's words out of sight one at a time (from the top or scattered), two-sided flashcards started on whichever face you choose, recall from the citation or from the words with first letters as the hint, and a log of every recitation with its day. The page is an index of **decks** — one card per group with its name, card count, and its own edit and delete (the unnamed memory list sits alongside and can only be emptied) — and opening one shows its cards, starts that deck's flashcard run, and carries its own edit — the deck that turns out to be wrong is usually the one the reader has open. A card can be a run rather than a single verse: the sheet grows one a verse at a time beside each entry, and a selection picked out in the reader becomes one card holding all of it. Decks are created and later edited in one sheet: name, then passages from the library's search, the reader's favorites, or the draw, with nothing stored until Save; an edit renames the deck, adds cards, and drops the ones removed, leaving the rest — and every other deck — exactly as they were — while a card that stayed keeps its recitations and its hiding, since the words can change without the card becoming a different one. The way in is a card in the flow on a screen with width — the whole card is the button — and a round floating button over the corner on a phone, above the tab bar; **Buy Decks** is listed and disabled until ready-made decks exist. |
| **Study timer** | Runs on its own on every `ready` page in the read and study groups (`isStudyPath`), so the time counted is time spent in the word rather than time in the app. |

### Your library

| Surface | What it does |
| --- | --- |
| **Favorites** (`/favorites`, `ready`) | Every starred passage, newest first, each verse on its own numbered line with past a few folded behind *Show all*. Export and import a CSV that keeps the same shape the references use, so a round trip restores exactly what was saved. On device the backup lands in **Downloads** with no sheet to click through (MediaStore on Android 10+; storage permission once on 9 and older), and is read back through the native file picker. |
| **Streak** (`/streak`, `ready`) | The run and a horizontal strip of the days that counted (gold) and the days a freeze kept (the buttons' blue) in one card, with the number and flame above it; the strip is paged with arrows or a swipe, today is the square outlined in the streak's own gold, the freeze card below it leads with the cubes and a `1/2 Freezes` badge, and its *Refill* button — shown only while a slot is empty — opens the refill sheet — “Keep your streak safe!”, or “You are protected!” when both are in hand — with a stepper choosing how many at 200 each or 375 for the pair, a shortfall line that links to the shop, and nothing charged until *Refill* is pressed. In the playful style the card catches a slow orange reflection while today is in. |
| **Shop** (`/shop`, `ready`) | Gospel Focus Plus at the top — every feature unlocked and 400 gems a month, with *Learn More* opening a sheet that says what it includes and that subscriptions are not on sale yet — then the freezes at the streak sheet's own prices (200, or 375 for the pair) bought straight from a row, and gem packs at $1.99/$4.99/$9.99 (the larger two showing their old price struck through) until checkout exists. Reached from the streak sheet's shortfall line and from the menu. |
| **Stats & progress** (`/stats`, `ready`) | The current run of days, the best one, and every day counted; passages read; daily word puzzles solved; flashcards recited; passages starred; minutes studied today against the goal, and the days it was met. The streak tile opens `/streak`, where the run's strip now lives. |
| **Settings** (`/settings`, `ready`) | Daily: the study goal (its one home — the stats page links here), the streak's own readout, the daily reminder and its hour, and the widget row that says the widget is not built. Then theme (light / dark / follow the system) and, separately, style (focused / playful — the playful style swaps the illustrative glyphs for emoji, keeps the menu, arrows, return/backspace keys and close cross drawn, and gives cards and buttons a raised 3D look), reduce motion (which skips the riffle), and the favorites backup. |

### Games

| Surface | What it does |
| --- | --- |
| **Scripture word-search** (`/games/word-search`, `ready`) | The passage's own significant words — read out of the drawn text, longest first, glue words left out — hidden in a ten-by-ten grid in all eight directions, with a fresh grid for every passage. Drag across the letters on touch or with a mouse, or focus a cell and press Enter to choose a word's first and last letters. A line counts when it spells a listed word, so tracing a word over a second set of cells still counts; found words are struck off the list and their cells are kept highlighted. Finishing the board prints the verse and links into the chapter, and the passage line opens the whole chapter or talk in a side panel (`components/passage-panel.tsx`). The whole game is pure rules in `lib/word-search.ts` — no storage and no new dependencies. |
| **Daily puzzle** (`/games/puzzle`, `ready`) | Six guesses at a four-to-six-letter word hidden anywhere in the day's chapter. The chapter is the same day-seeded draw the hub and the reminder use, under the reader's own filters; the board prints only the reference, and the reference opens the whole chapter in a scrollable side panel (`components/passage-panel.tsx`) rather than leaving the board. A day that draws a chapter with no usable word draws again one seed further along (`#2`, `#3`), so every device agrees on the puzzle. Tiles size themselves to the answer, so a four-letter board is four wide and a six-letter one six. Marking is the standard rule, including duplicate letters. Both an on-screen keyboard and a physical one feed the same guess, and the daily board is pinned per local day in `gospel-focus:wordle:v2`. When the board ends, a result card says **Congratulations!** or **Not quite!**, prints the verse with the answer marked, and offers **Play again** — a practice board from a random chapter, kept in memory so it never disturbs the day's score. The vocabulary is built from the library itself (`scripts/build-words.mjs` → `public/data/words.json`: 8,316 words of four to six letters, 5,638 usable as answers, 113 KB) rather than downloaded, so a guess is a word these scriptures use, and nothing extra is licensed or fetched. |

### Focus — the honest half of the lock

`/focus` is a **real page** (`components/focus-page.tsx`) even though its catalog
entry still says `planned`, and the reason is the split between state and
enforcement:

- **Built**: setting the lock up in one step; a switch that reads the lock's own
  state rather than a stored flag; the list of apps the reader means to hold back;
  a hand bypass with a length on it — 15 minutes, 30 minutes, or the rest of today
  — that closes itself when the deadline passes; the lock opening itself once the
  day's goal is met, and a manual re-arm after that remembered for the rest of the
  day rather than until the next render; today's minutes shown against the same
  goal the hub shows; and the lock's state on the hub and in the status tray.
- **Not built**: the blocking itself. Holding another app back needs Android's
  `UsageStatsManager` plus an accessibility service, and `android/app/src/main/java/app/gospelfocus/app/`
  holds only `MainActivity`, `OpenUrlPlugin`, `ImageClipboardPlugin`,
  `FileDownloadPlugin`, and `DownloadNames` — there is no blocking or widget code
  in the native project. The page says so on its face rather than showing a switch
  that does nothing, which is why the catalog keeps it `planned`.

The state model was built first on purpose: the status, the bypass, and the moment
it runs out are the parts a reader sees, and they can be right before anything is
blocked.

### Platform & plumbing

- **Static export + Capacitor**: `output: "export"`, two targets built — the web
  and Android (shipping). **iOS is not added yet**: the `@capacitor/ios` package is
  installed but there is no `ios/` project, so `npm run cap:add:ios` is step one
  for anyone going there, and everything Apple-side (including the Focus lock) is
  unstarted.
- **Release-signed APK**: `npm run cap:apk`, keystore in `android/keystore/`
  (gitignored, back it up), `versionCode`/`versionName` in
  `android/app/build.gradle`, `minSdkVersion 24` (Android 7.0+) and
  `targetSdkVersion 36`.
- **CI that ships it**: `.github/workflows/android-apk.yml` builds the signed APK
  on every push to `main` and publishes it on the Releases page for a version tag,
  stamping `versionName` from the tag. Secrets hold the keystore, so an update
  installs straight over the old version.
- **Native bridges**, all local plugins living beside `MainActivity`:
  `OpenUrlPlugin` (open a URL outside the WebView, so Gospel Library links work),
  `ImageClipboardPlugin` (put a cached PNG on the clipboard as a `content://`
  URI), `FileDownloadPlugin` (save a file straight to Downloads through
  MediaStore, with a share-sheet fallback), plus the native file picker for
  reading a backup back in.
- **Icons & system chrome**: night-qualified launcher icons, the Android 13+
  themed monochrome layer (both generated from `app/icon.svg`), and safe-area
  padding that keeps content clear of the status bar and gesture bar in both
  themes.
- **Local persistence**: one versioned key per concern in `localStorage` —
  `preferences:v1`, `favorites:v1`, `study:v1`, `streak:v2`, `focus:v1`,
  `memorize:v1`, `decks:v1` — each read through a validated parser over
  `useSyncExternalStore`, so a corrupted or hand-edited record degrades to the
  default instead of crashing a page. This is what the app ships with; a move to
  `@capacitor/preferences` (the plan the original roadmap carried) is *not* done,
  and the WebView's `localStorage` is what survives a restart today.
- **No backend, no account**: nothing to sign into, nothing to sync, nothing
  to pay for to keep the app running.

### Data

- **51,083 passages**, one manifest: **41,995 scripture verses** across five
  volumes (Old Testament 23,145; New Testament 7,957; Book of Mormon 6,604;
  Doctrine & Covenants 3,654; Pearl of Great Price 635) and **9,088 general
  conference paragraphs** from ten conferences (2014–2018). **9.7 MB** total.
- **A search index on top of it**: one MiniSearch document per verse and
  paragraph, 11.9 MB of JSON and 2.86 MB gzipped, built by
  `scripts/search-index.mjs` (part of `npm run build:data`, or
  `npm run build:search` on its own). Fetched and inflated only when a reader
  opens `/search`. The build reloads what it wrote and searches it before
  finishing, so the page and the index can't disagree about how a query becomes
  terms.
- **Lazy and cached**: `public/data/manifest.json` is a 7.8 KB index used for
  filtering and weighted draws; each volume's text is fetched only when a draw
  actually lands there, so the Old Testament's ~3 MB is never paid for up front.
- **Generated, not hand-kept**: `npm run build:data` (`scripts/build-data.mjs`)
  downloads and normalizes both sources. It is the seam the remaining study
  features extend — search index, plan content, flashcard decks all come out of
  the same script.

---

## Planned

Everything in this section is unfinished. Where a catalog entry exists, the route
is live and renders the placeholder; where a feature is marked **not yet in the
catalog**, it has no route yet and needs one before it has a page.

Effort estimates assume **one developer with AI assistance**, in working days.
"Free" / "Paid" marks the intended side of the paywall.

### Reading & platform

| Feature | Route | Effort | Paywall | Notes |
| --- | --- | --- | --- | --- |
| **Home-screen widgets** | `/widgets` | 5–8 d | **Free** | Catalogued as *Home-screen widgets*: the verse of the day, the active recitation, and the streak, plus a launcher button that opens straight into the riffle. Native Android and iOS widgets over the Capacitor bridge, with `OpenUrlPlugin.java` as the precedent. **Highest daily visibility of anything on this list.** One widget beats ten features. **Half the invitation is already built**: `components/widget-prompt.tsx` offers the widget exactly once, the moment the day's goal is reached, and a settings row and a menu entry both lead to `/widgets` — all three honest about the widget itself not existing. Android first; the iOS widget depends on the iOS project that does not exist yet. |

### Study

| Feature | Route | Effort | Paywall | Notes |
| --- | --- | --- | --- | --- |
| **Summaries & reading plans** | `/plans` | 3–5 d | **Free** (recommended) | Catalogued as *Summaries & reading plans*: a few sentences on what a chapter or talk is about, structured plans such as "30 Days in Alma" tracked day by day, and topic-based paths across volumes, all pre-built offline. `lib/picker.ts` already supports scoped weighted draws, so the work is mostly content plus a plan-tracking UI over the existing daily/streak day keys. |
| **Context & likening** | `/liken` | 3–4 d + 1–2 d shared plumbing | **Paid** (#5) | Catalogued as *Context & likening*: historical and cultural background for the passage in hand, and suggestions for how the words could apply in ordinary life, asked for on demand and cached locally one passage at a time. The flagship AI feature, and the most on-brand item on the whole list — ship it alone and see if people pay for it. |
| **Journal & notes** | `/journal` | 3–5 d | **Free** | Catalogued as *Journal & notes*: notes and highlights attached to any verse or paragraph, a filterable history of everything written and read, search across the reader's own entries, and import/export so the record belongs to them. This absorbs the standalone *highlights & notes* item the backlog used to carry, and it is where a **draw history** lands too — today the app keeps starred passages and a count, but not a list of what was drawn. |

### Games

The `/games` hub is live. The word-search, the daily word puzzle and What's
That Verse? have shipped (above); the coloring book is still a placeholder.

| Feature | Route | Effort | Paywall | Notes |
| --- | --- | --- | --- | --- |
| **What's That Verse?** | `/games/reference-quiz` | shipped | **Paid** (#1) | Built (`components/reference-quiz-page.tsx`): a verse is printed and the reference entered through four searchable dropdowns. Four hint stages — volume, then book, then chapter, then the verse itself — each costing a quarter of the round's 100 points, with retries free and wrong parts marked. Scripture only, drawn under the reader's filters; the entitlement gate is still to come. |
| **Crossword** | *not yet in the catalog* | 8–12 d | **Paid** (#1) | Much harder than it looks: clue quality is the whole game. Verse-reference clues ("Nephi's father") can be auto-drafted from the manifest but need curation. Ship after word-search proves the pattern. |
| **Fishing for scriptures** | *not yet in the catalog* | 5–8 d | **Paid** (#1) | A light arcade loop: cast, catch a reference, reveal the verse. Needs simple art and a real game loop; consider a tiny canvas engine. |
| **Shepherd search / grow the fold** | *not yet in the catalog* | 6–10 d | **Paid** (#1) | Hidden-object or collection-collector. The value is mostly in the metaphor and the art. |
| **Endure to the end trail** | *not yet in the catalog* | 15–25 d | **Paid** (#1) | A Subway-Surfer-style endless runner is a real game: physics, art, level design, tuning, mobile performance. Only attempt it if games prove to be a retention driver. |

Games should award streaks and points that feed the existing streak tracker, not
replace it. Neither the daily puzzle nor the word-search records anything yet
beyond its own board — wiring a solve into the streak and the study minutes is
the next game-shaped job.

### Focus

| Feature | Route | Effort | Paywall | Notes |
| --- | --- | --- | --- | --- |
| **Focus Lock — the enforcement half** (catalog id `focus-lock`) | `/focus` | 10–20 d | **Paid** (#7) | Everything the reader *sees* is built (see **Focus** above); what is missing is the blocking. Android: `UsageStatsManager` plus an accessibility service or overlay to hold the chosen apps back until the day's study releases them. iOS later, through Screen Time / FamilyControls (entitlement request, significant friction). **Android-first.** The strongest ADHD differentiator — likely the headline of the paid tier. Sensitive permissions raise store-review risk, which is a strong argument for the web + Stripe / sideload path over Play for this one. |

### Paid platform

| Feature | Route | Effort | Paywall | Notes |
| --- | --- | --- | --- | --- |
| **Scripture coloring book** | `/coloring` | 4–6 d of code, plus art | **Paid** (#2) | Catalogued as *Scripture coloring book*: line art of scripture scenes bundled with the app, tap a shape to fill it from the chosen palette, undo, and save or share the finished page. **The bottleneck is art, not code** — licensed or commissioned line art is the real cost, and the code is a short job once the illustrations exist. |

### AI features — the rest

All three need one small proxy. They share a single LLM integration, so build the
plumbing once; **Context & likening** above is the first one to ship.

| Feature | Effort | Paywall | Notes |
| --- | --- | --- | --- |
| **Convert verses to modern language** | 3–5 d | **Paid** (#3) | Plain-language paraphrase, on demand through the proxy or pre-generated for a curated set at build time. **Always show the original text alongside — never replace it.** |
| **Scripture story summarizer** | 3–4 d | **Paid** (#4) | A chapter or talk reduced to a few sentences. Build-time generation is feasible for popular chapters, on demand otherwise. Story segmentation (stories vs. verses) is the tricky part — note it overlaps with the *Summaries* half of `/plans`. |

**Plumbing note:** the app is a *static export*, so there are no API routes to
hold a key. Options, in order of preference: (1) a tiny edge function
(Cloudflare Worker / Vercel function) that holds the key and rate-limits — a small
server, but ~50 lines; (2) build-time generation, so runtime needs no key at all;
(3) bring-your-own-key, as a last resort. Gate A applies: do **not** run
conference text through a third-party LLM without rights.

---

## Two gates that shape everything

**Gate A — Conference-text licensing.** Scripture text is public domain
(per `public/data/manifest.json`). General conference text is **Church-copyrighted**;
the manifest itself carries the note *"Scraped; verify redistribution rights
before publishing."* The paywall does not change this — conference content stays
free either way — but redistributing it at all, and especially shipping it in a
store listing, still wants a written answer from Intellectual Reserve. Note the
sharper edge: **any AI feature that transforms conference text** (summarizer,
modern-language conversion, or the liken generator applied to a talk) **creates a
derivative work** — confirm rights on those separately, independent of price.

**Gate B — Distribution.** A sideloaded APK cannot use Google Play Billing. So
either (a) ship the web build with a Stripe one-time unlock / license key, or
(b) publish to Google Play ($25 one-time, review, and Gate A applies hardest),
or (c) both. The web + Stripe path is the fastest honest way to take money and
requires no gatekeeper.

---

## Monetization plan

Three tiers: **free**, a **premium** tier that includes every paid feature, and
**one-time packs** for buying individual features a la carte.

### The three tiers

| Tier | Billing | What's inside |
| --- | --- | --- |
| **Free** | none | The whole reading experience (picker, riffle, filters, expansion, links, **all passage text incl. conference**), the daily habit (favorites, the daily goal and streak, the reminder, share-as-image), the whole Focus state model, search, reading plans, the journal, the Android widget, and small taste samples of paid features. |
| **Premium ("Inspiration Plus")** | subscription (annual + monthly) | Every paid feature — games, coloring, the Focus app-lock's enforcement, and a fair monthly AI allowance. The "everything, and future releases" tier. |
| **One-time packs** | single purchase each | Game pack, coloring packs, Focus unlock, and AI credit packs. |

### Where each feature lands, and why

| Feature | Cost to serve | Standalone appeal | Placement | Rationale |
| --- | --- | --- | --- | --- |
| Mini games (all of them) | None | High | **Game pack** (one-time) + Premium | No ongoing cost, so there is no honest reason to rent it; games are a natural buy-once. Bundling them still makes Premium look rich. |
| Coloring book | None after art | High (content packs) | **Coloring packs** (one-time) + Premium | New art sets are ideal a-la-carte content — sell themed packs. |
| Focus app/social lock | None (native) | **Highest** | **Focus unlock** (one-time, premium-priced) + Premium headline | The highest-intent single feature — many ADHD users want *only* this. Forcing a subscription loses those sales; price the standalone high enough that Premium still wins on value. |
| Liken / Context generator | **Per use** | High | Premium (monthly allowance) + **AI credit packs** | Recurring cost → never unlimited one-time. Credits are the honest a-la-carte path. |
| Modern-language conversion | **Per use** | Medium | Premium + AI credits | Same. |
| Scripture summarizer | **Per use** | Medium | Premium + AI credits | Same. |
| Search | None | Medium | **Free** | Strengthens the core and costs nothing — a growth lever, not a paywall. |
| Reading plans | None | Medium | **Free** | Same; also showcases the picker. |
| Journal, notes & highlights | None | Low | **Free** | Small, expected, keeps notes beside favorites. |
| Memorization | None | Medium | **Free** | ⚠️ *Decided differently from the original plan.* Flashcards are on the paid list (#6), but they shipped as part of `/memorize` and are live in a free build. Either leave them free — they cost nothing to serve and they are the strongest ADHD fit in the study tier — or gate a *future* expansion (spaced repetition, decks, review scheduling) rather than taking away what people already have. |

This honors your list as far as what ships allows: features #1–#7 are all
monetized somewhere — in a pack, in Premium, or both — with the one deviation
flagged above (memorization, already live and free) and nothing else added to the
paid set.

### Pricing guardrails

1. **Never sell recurring cost as unlimited one-time.** AI is subscription or
   credits, never a "buy once, use forever" promise.
2. **Price packs so Premium still wins.** Roughly 2–3 packs should cost about a
   year of Premium; credit recent pack purchases toward an upgrade window so
   buying a pack never feels like a mistake.
3. **Keep the daily habit free.** Notifications, streaks, favorites, and the
   widget are acquisition and retention — paywalling them suppresses the very
   behavior that makes people upgrade later.
4. **Premium means "everything, plus what ships next."** Its job is to make the
   individual packs feel like partial answers.
5. **If you offer a lifetime unlock, cap or exclude the AI allowance in it.**
   A lifetime price against per-use cost is the one way to lose money on your
   best customers.

### Free-to-paid conversion

Give every free user a taste: a few AI generations a month, one playable game
level, one coloring page, one sample flashcard deck. Show a locked card with a
one-line pitch in the relevant surface — never a dead end. The placeholder pages
already carry a pitch and a way onward; a locked one adds the price to it.

### Entitlements to model

This mixes subscriptions and one-time purchases, so track **owned packs** (game,
coloring, Focus) separately from **Premium active**, and have "restore" verify
both. Mechanically that is a small local entitlement record: Stripe checkout on
the web issues a license key and the app verifies it locally — the fastest path to
revenue, and it sidesteps Gate B until you publish to Google Play.

---

## Recommended build order

The foundations are done — persistence, streaks, share-as-image, the reminder,
settings, the hub, the study timer, and memorization all shipped (see **Built**
above). What is left, cheapest first, free work ahead of paid:

**Search is done** and shipped with the study tier (see **Built** above) — it was
step one of this plan, and the index came in at 2.86 MB gzipped rather than the
1–2 MB estimated. What is left, cheapest first, free work ahead of paid:

1. **Reading plans & summaries** — *3–5 d, free.* Content work mostly, and it
   makes the picker the front door of something larger.
2. **Journal & notes (+ draw history)** — *3–5 d, free.* Finishes the study tier
   and gives the app a memory of what the reader has actually read.
3. **Home-screen widgets** — *5–8 d, native.* Highest visibility per hour of work
   of anything remaining, and it drives the daily habit the app now has.
4. **Stripe unlock + entitlement plumbing** — *3–4 d.* So paid work has somewhere
   to land; do this before the first paid feature, not after.
5. **Shared LLM plumbing + Context & likening** — *~1 week, paid.* The flagship AI
   feature; ship it alone and see if people pay for it.
6. **Games** — the word-search and the daily puzzle have shipped; the reference
   quiz is next. *3–5 d, paid.* Stop if retention does not move; treat each as an
   experiment with a kill criterion.
7. **Coloring book, then the Focus enforcement layer** — *largest and most
   speculative, paid.* Do them once paying users exist to justify the art and the
   native permissions work.
8. **Remaining AI** — modern language, then the summarizer. *~1.5 weeks, paid.*

---

## What you do **not** need yet

- A server (excepting the optional ~50-line LLM proxy).
- A designer — the existing serif/paper aesthetic is strong and consistent.
- A data-pipeline rewrite — `scripts/build-data.mjs` extends cleanly for search
  indexes, plans, and puzzle content.
- Accounts or sync — local-only is sufficient for everything planned here, and it
  is what shipped.

## Resources to line up (when the time comes)

| Resource | When | Rough cost |
| --- | --- | --- |
| Stripe account | Step 5 unlock | Free until revenue |
| Play Console account | Only if going to Play | $25 one-time |
| Privacy policy page | Required by Play; good practice anyway | Free to write |
| LLM API key + edge proxy | First AI feature | Usage-based; small at low volume |
| Line art for coloring book | Coloring book | Commission or license — the real cost |
| Apple Developer account | Only if iOS ships (esp. the Focus lock) | $99/yr |

## Open risks

- **Licensing (Gate A)** — must be resolved before anything paid or on Play.
- **LLM output quality** — AI paraphrases and application suggestions need a clear
  "AI-generated, not doctrine" disclaimer and a report/feedback path.
- **Games scope creep** — the endless runner especially; treat games as
  experiments with a kill criterion (retention delta), not commitments.
- **Store permissions** — the Focus lock is the most likely feature to draw review
  scrutiny; plan for it to be sideload/web-first.
- **Placeholders that overpromise** — every planned page promises its capabilities
  in the reader's own words. As those pages age, the catalog's lists are the
  promise being made, so they have to be revised as features actually land rather
  than left to read as a wish list.
- **A free feature that was meant to be paid** — memorization and flashcards are on
  the paid list but are live and unpaywalled. Decide deliberately (see the
  monetization table) rather than discovering it when the paywall is built.
