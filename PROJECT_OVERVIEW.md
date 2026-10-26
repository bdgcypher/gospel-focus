# Project Overview — Gospel Focus

What the app is, who it serves, how it looks, what is built, and what comes next.
`README.md` is the public description; `CONTRIBUTING.md` is build and setup;
`AGENTS.md` is how the work is done.

The **status of every destination mirrors `lib/features.ts`** — that catalog is
what the navigation, the home hub, and the section pages are rendered from, so a
page's `status` there and its row here are the same fact written twice, and the
catalog wins if they ever disagree. A **"planned" page renders
`components/feature-page.tsx`**, whose placeholder block lists the shape the
feature will take. Widgets is the last bare placeholder. "Planned" means the
door is on the wall, not that the room behind it is empty.

---

## What it is

Gospel Focus is an offline-first scripture study app for members of The Church of
Jesus Christ of Latter-day Saints. Its front door is the thing a paper copy does
best: a weighted random draw from the standard works and general conference, with
the pages riffling until one passage lands. Everything after the draw turns that
lucky dip into a daily habit — reading the whole chapter, starring what struck
you, writing it down, memorizing it, playing with it, and counting the minutes
until a streak forms.

- **Phone-first and offline.** A Next.js static export wrapped by Capacitor: the
  Android APK ships as a signed sideload, the iOS project builds for the
  simulator, and the web build is the same app.
- **No account, no backend, nothing to sync.** Every record — favorites, study
  minutes, the streak, notes, decks — lives on the device. Accounts and sync are
  a later milestone, and they will be optional.
- **The reading stays free.** Passage text, the picker, filters, chapter
  expansion, Gospel Library links, favorites, the journal, search, the streak,
  and the reminder are never gated.

**The reader it is designed for:** someone who wants to study daily, finds
*beginning* the hard part, and reads on a phone. Every screen is built to lower
activation energy: one tap to start, a visible reward, an obvious next step.

**What the product is:** a free daily-study app with an optional paid tier around
content packs and, later, cloud features. Nothing is for sale yet.

---

## Product goals

1. **The core stays free, forever.** The random picker, the riffle, filters,
   chapter expansion, and Gospel Library links are the soul of the app. They are
   never gated.
2. **The passage text stays free, forever** — scripture *and* general conference.
   Nothing the app can draw is ever paywalled.
3. **Monetize additions, never the reading experience.** Content packs, study
   tools with ongoing cost, and cloud features. The words themselves are always
   free.
4. **Offline-first.** The web build and the APK both run with no backend today;
   new features preserve that wherever possible. Accounts, sync, and AI are the
   explicit exceptions.
5. **ADHD-friendly by design.** One tap to begin, a visible reward, an obvious
   next step. No infinite feeds, no shame mechanics.
6. **Say what is true.** A page that is not built says so. A switch that cannot
   fire is not offered. No placeholder pretends to work.

---

## Brand & design tokens

Everything below lives in `app/globals.css` as CSS custom properties, consumed
through Tailwind's `@theme inline` names (`bg-surface`, `text-muted`,
`border-border`, `bg-cta`). **No component hard-codes a palette colour**; the only
raw values in the app's code are the two `theme-color` constants in
`app/layout.tsx`. A new colour means a new token in all four palettes.

### The four palettes

Two independent axes: **theme** (light / dark / follow the system) and **style**
(focused / playful). Every surface must hold in all four combinations.

| Token | Focused light | Focused dark | Playful light | Playful dark |
| --- | --- | --- | --- | --- |
| `--background` | `#f7f2e7` parchment | `#111111` | `#fbf0da` | `#111111` |
| `--surface` | `#fffdf7` | `#1b1b1b` | `#fffdf7` | `#1b1b1b` |
| `--surface-2` | `#f1e9d7` | `#333333` | `#f6e7ca` | `#333333` |
| `--foreground` | `#2a2118` ink | `#f2f2f2` | `#3b2a16` | `#f2f2f2` |
| `--muted` | `#7a6b53` | `#b0b0b0` | `#7a6244` | `#b0b0b0` |
| `--border` | `#e2d6bd` | `#424242` | `#e8d2a8` | `#424242` |
| `--accent` | `#9a6b1f` gold | `#e0b45c` | `#f8ae35` orange | `#f8ae35` |
| `--accent-strong` | `#7c5514` | `#f0c877` | `#9a4a06` | `#ffc861` |
| `--accent-contrast` | `#fffdf7` | `#1a1a1a` | `#3a2205` | `#1a1a1a` |
| `--cta` | `#9a6b1f` (the accent) | `#e0b45c` (the accent) | `#1dadf1` blue | `#1dadf1` blue |
| `--cta-contrast` | `#fffdf7` | `#1a1a1a` | `#ffffff` | `#ffffff` |
| `--page` | `#fffefb` | `#1e1e1e` | `#fffdf7` | `#1e1e1e` |
| `--page-edge` | `#e8dcc3` | `#3a3a3a` | `#e8d2a8` | `#3a3a3a` |
| `--spine` | `#d9c9a6` | `#4b4b4b` | `#e3c99c` | `#4b4b4b` |
| `--frozen` | `#1dadf1` | `#1dadf1` | `#1dadf1` (the CTA blue) | `#1dadf1` |

The focused skin is paper and ink with one gold for the actions. The playful skin
is a bright cream by day and a lamp-lit charcoal by night, with gold kept for
supporting calls and highlights and **the blue reserved for the main action** —
the same blue on both themes, so a button never has to be relearned.

### Semantic tokens

| Meaning | Focused | Playful |
| --- | --- | --- |
| Right / complete | `--correct: #17873f` (type `#4caf72` at night) | completed-day green: `#4db508` on `#d0f8b0`; night `#76b532` on `#21362a` |
| Present / partial (word games) | `--present: #e4b009`, ink `#241b09` | the accent gold, with its dark ink |
| Wrong | `--wrong: #b3261e` (`#ff9a90` at night) | loss red `#f84a4c` on `#f4dbdb`; night `#e95453` on `#250202` |
| Day kept by a freeze | the blue above | the blue above |

`--goal-*` is the completed study card (face, border, track, ink, bar, button);
`--win-*` and `--loss-*` are the games' result cards; `--gem-ink` and
`--flame-ink` are the status tray's coloured readings. A win borrows the
completed day's card whole; nothing invents a second green.

### Type

| Role | Focused | Playful |
| --- | --- | --- |
| UI and body | Geist | Nunito |
| Display and passage | Source Serif 4 | Nunito — both roles, because a serif heading over a rounded body reads as two skins slid together |
| Numerals and columns | Geist Mono | Geist Mono |

All four load through `next/font/google` (self-hosted, no runtime request). The
playful skin overrides `--font-sans` and the `.font-serif` utility on
`html.playful` rather than every heading.

### Shape, elevation, motion

- Cards `rounded-3xl` on `--surface`; inner wells `rounded-2xl` on `--surface-2`;
  buttons, chips, and pills `rounded-full`.
- `--bottom-nav-height` (4.75rem) is one number shared by the nav, the room
  reserved under a page, and anything that must clear it, plus the safe-area
  inset.
- The playful skin is the only one with 3D: raised cards and buttons sit on
  `--card-edge` / `--control-edge` with a top highlight and a soft shadow; the
  primary button gets `--accent-top` / `--accent-edge`. Focused stays flat paper.
- Motion comes from `motion`: page transitions, the riffle, the tab mark crossing
  with a swipe, the games' result cards. **Every animation honours *Reduce
  motion***, and none exists to hold attention.
- The launcher icon is drawn from `app/icon.svg`; Android night icons and the
  Android 13+ monochrome layer are generated from it (`npm run icons:dark`).

### Voice

Plain, warm, second person, sentence case. Buttons name the job (`Refill`,
`Start studying`, `Play again`). One clear sentence beats a paragraph. No shame,
no countdown pressure, no dead end where a way onward would do.

---

## Built — through v3.0.1

62 components, 32 `lib` modules, 17 routes, one static export, one release-signed
APK. Nothing leaves the device: there is no backend, no account, and no network
call outside the passage library and the Gospel Library link.

### Reading — the core

| Surface | What it does |
| --- | --- |
| **Random passage picker** (`/read`) | A weighted draw across every selected source, so a long book or a heavy conference year turns up in proportion to how much text it holds. Loads the manifest, filters, and picks — all client-side. |
| **Filters & presets** | Per-volume toggles with per-book switches inside them, a toggle per general conference, and one-tap presets (*All* / *Bible* / *LDS Standard Works* / *LDS General Conference*). Sidebar on wide screens, slide-in pane on phones. |
| **Page-riffle animation** | One continuous deceleration into the draw. Reduce-motion skips straight to the passage. |
| **Chapter & talk expansion** | The whole chapter (or full talk) with the drawn verse highlighted and scrolled into view. |
| **Selection & sharing** | Tap verses or paragraphs, in a row or scattered. A floating bar follows the page with collapse, Gospel Library, share, favorite, memorize, and note. Long selections share as a *set* of cards, each up to roughly a screenful (1080 × ≤2400 px). |
| **Favorites from any surface** | The drawn passage's star, the chapter's controls, and the floating bar save the same thing, including a scattered pick (`1 Nephi 3:3, 7-9`). |
| **Gospel Library deep links** | Official `churchofjesuschrist.org/study/...` URLs; on Android the link opens in the Gospel Library app when installed, falling back to the in-app browser. |

### The daily habit

| Surface | What it does |
| --- | --- |
| **Verse of the day** | `lib/daily.ts` seeds the pick from the local date, so the hub, the reminder, and the passage the app opens on agree — and the reminder is computable offline. |
| **Daily study goal & timer** | A goal of 5–30 minutes, started and stopped automatically while a studying page is open and in front. No visible stopwatch. Minutes are *stored*, not derived. |
| **Streak** (`/streak`) | Consecutive local days whose goal was *met*. The run as one large number, grey until today is done, then a paged strip of the days that counted, then the freezes. |
| **Streak freezes** | Up to two, one to start. A missed day spends one automatically; a frozen day is painted the buttons' blue. Refilled at 200 gems each, or 375 for the pair, from the streak page or the shop. |
| **Daily reminder** | Native local notifications, opted into in settings with a time of day, scheduled a window of days ahead so the verse quoted matches the app's own draw. |
| **Status tray** | Streak, minutes against today's goal, and the lock's state ride in the header as chips. |
| **Gems & shop** (`/shop`) | Gospel Focus Plus at the top, freezes at the streak sheet's prices, and gem packs priced in real money but inert until checkout exists. Reached from the menu and the streak sheet. |

### Study

| Surface | What it does |
| --- | --- |
| **Search** (`/search`) | All 51,083 passages, offline, from a MiniSearch index built at build time (11.9 MB JSON, 2.86 MB gzipped, loaded once per session). Phrases find verses; citations find chapters (`alma 32`, `1 nephi 3:7`). Scripture ranks above conference, with a reserved slice for talks. Within each stream, ranking is: more query words, meaningful words before glue, the query's order, then the whole query as one run. The index stores no text, so previews and highlights are read from the passage library by id. The page carries the reader's own source filters. |
| **Memorization** (`/memorize`) | Word hiding (from the top or scattered), two-sided flashcards, recall from citation or words with first letters as a hint, and a log of every recitation with its day. The page indexes **decks** — name, card count, edit, delete — plus the unnamed memory list. A card can be a run of verses. Decks are built and edited in one sheet from search, favorites, or the draw; nothing is stored until Save. **Buy Decks** is disabled until ready-made decks exist. |
| **Study timer** | Runs on every `ready` page in the read and study groups, so the time counted is time in the word rather than time in the app. |

### Your library

| Surface | What it does |
| --- | --- |
| **Favorites** (`/favorites`) | Every starred passage, newest first, each verse on its own numbered line with past a few folded behind *Show all*. CSV export/import round-trips exactly. On device the backup saves straight into **Downloads** and is read back through the native file picker. |
| **Journal & notes** (`/journal`) | Entries written by typing or dictation, with bold, italic, underline, lists, and links. An entry can point at a passage, a note on a starred passage, or another entry; the link picker searches all three. Notes are written from the reader (which stars the passage as it takes one) or from a favorite, with the same toolbar. |
| **Streak** (`/streak`) | The run, the paged day strip, and the freeze card with its refill sheet. Prices and shortfall link to the shop; nothing is charged until *Refill* is pressed. |
| **Shop** (`/shop`) | Gospel Focus Plus and its *Learn More* sheet (subscriptions are not on sale yet), freezes, and inert gem packs. |
| **Stats & progress** (`/stats`) | Current run, best run, every day counted, passages read, daily puzzles solved, flashcards recited, passages starred, minutes today against the goal, and days met. |
| **Settings** (`/settings`) | Study goal (its one home), streak readout, daily reminder and time, widget row, theme, style, reduce motion, and the favorites backup. |

### Games

| Surface | What it does |
| --- | --- |
| **What's That Verse?** (`/games/reference-quiz`) | A verse is printed and its reference entered through four searchable dropdowns. Three guesses; a wrong one marks the parts that are off and the third ends the round. Four hints — volume, book, chapter, verse — are bought with gems, from one for the volume to fifteen for the verse. Scripture only, under the reader's filters. |
| **Daily puzzle** (`/games/puzzle`) | Six guesses at a four-to-six-letter word hidden in the day's chapter. The same day-seeded draw as the hub and reminder; a day with no usable word draws one seed further along. Standard marking, on-screen and physical keyboard, pinned per local day. A result card ends the board with the verse and a practice **Play again**. |
| **Word-search** (`/games/word-search`) | The passage's own significant words hidden in a ten-by-ten grid in eight directions, fresh per passage. Drag, or focus a cell and press Enter to choose first and last letters. Finishing prints the verse and links into the chapter; the passage line opens the chapter in a side panel. |

### Focus — the lock and its app list

`/focus` holds the whole state, and Android's half reads it:

- setting the lock up in one step;
- a switch that reads the lock's own state rather than a stored flag;
- a picker built from the apps installed on the phone, so a choice is a package
  the lock can match rather than a name typed into a box;
- a hand bypass with a length — 15 minutes, 30 minutes, or the rest of today —
  that closes itself when the deadline passes;
- the lock opening itself once the day's goal is met, and a manual re-arm after
  that remembered for the rest of the day;
- today's minutes against the same goal the hub shows;
- the lock's state on the hub and in the status tray.

**The blocking is real on Android.** `FocusAccessibilityService` watches window
changes and, over a chosen app, draws a `TYPE_ACCESSIBILITY_OVERLAY` until the
day's study is done. The window fits the system-bar insets instead of covering
them, so the home button and the home gesture always reach Android — the gate can
be a nuisance over an app, never over the way out of the phone. Leaving it is one
thing whichever way the reader leaves: the Close button, Back, the home gesture
and another app taking the screen all record the app they left, because the gate
coming down hands that app its window back and the framework reports it as the
app arriving — the one signal that would otherwise draw the gate again over the
screen the reader went to. It enforces the
same bypass and the same earned day the page shows, because both halves read one
state. One permission is enough: an accessibility overlay needs no *display over
other apps* grant, and the service declares that it cannot retrieve window
content, so it learns which app is in front and nothing else. The system starts
and keeps the service, so the lock is armed again after a reboot with no
foreground service and no notification.

`FocusLockPlugin` lists the launcher apps, reports whether access is on, opens
Android's accessibility settings, and writes the lock's state — set up, the day
the goal was met, the day it was re-armed, the chosen packages, the bypass
deadline — to `SharedPreferences`; `components/focus-sync.tsx` keeps that copy in step with
the page. The day keys are what let the lock re-arm itself at midnight without the
app running. Without the permission nothing is blocked, and the page says so on
its face. iOS waits for Screen Time; the web build keeps the state and the list
but cannot block.

### Platform & plumbing

- **Static export + Capacitor**: `output: "export"`, three targets — web, the
  Android APK (shipping), and an iOS project under `ios/` that compiles for the
  simulator through Swift Package Manager. **iOS is not shipped**: no signed IPA,
  no App Store listing, and the Focus lock's Screen Time half is unstarted.
- **Release-signed APK**: `npm run cap:apk`, keystore in `android/keystore/`
  (gitignored, back it up), `minSdkVersion 24`, `targetSdkVersion 36`.
- **CI that ships it**: `.github/workflows/android-apk.yml` builds the signed APK
  on every push to `main` and publishes it on the Releases page for a version
  tag, stamping the version from the tag. `ios-build.yml` compiles the iOS target
  on `macos-latest`.
- **Native bridges**, all local plugins beside `MainActivity`: `OpenUrlPlugin`,
  `ImageClipboardPlugin`, `FileDownloadPlugin`, `FocusLockPlugin`, plus the native
  file picker for reading a backup back in. `FocusAccessibilityService`, declared
  beside them, draws the Focus Lock's lock screen.
- **Updates without a store**: `UpdateCheckWorker` (WorkManager) asks GitHub for
  the newest release at launch and every eight hours, and `UpdateCheck` announces
  one whose tag-derived version code is above the installed app's. The tap runs
  `UpdateActivity`, which downloads the APK into the app's files, then hands it
  to Android's installer through the existing FileProvider — no store, no
  account, and nothing downloaded until the reader taps. Settings → **Version**
  reports the installed and newest version from those same notes, checks on
  demand (`UpdateCheckPlugin`), and can take the update from there.
- **Icons & system chrome**: night-qualified launcher icons, the Android 13+
  themed monochrome layer, and safe-area padding in both themes.
- **Local persistence**: one versioned key per concern, each read through a
  validating parser over `useSyncExternalStore`. Every key carries the
  `gospel-focus:` prefix: `preferences:v1`, `favorites:v1`, `study:v1`,
  `streak:v2`, `focus:v1`, `memorize:v1`, `decks:v1`, `journal:v1`, `notes:v1`,
  `coins:v1`, `wordle:v2`, `wordle:stats:v1`. A corrupted record degrades to the
  default instead of breaking a page.
- **No backend, no account**: nothing to sign into, nothing to sync, nothing to
  pay for to keep the app running.

### Data

- **51,083 passages**: 41,995 scripture verses (Old Testament 23,145; New
  Testament 7,957; Book of Mormon 6,604; Doctrine & Covenants 3,654; Pearl of
  Great Price 635) and 9,088 conference paragraphs from ten conferences
  (2014–2018). About **10 MB**.
- **A search index on top**: one MiniSearch document per verse and paragraph,
  11.9 MB JSON, 2.86 MB gzipped, built by `scripts/search-index.mjs`.
- **The daily puzzle's vocabulary**: 8,316 words of four to six letters, 5,638 of
  them usable as answers, built from the library itself (113 KB).
- **Lazy and cached**: the 14 KB manifest drives filtering and draws; each
  volume's text is fetched only when a draw lands there.
- **Generated and committed**: `npm run build:data` downloads and normalizes the
  sources; the output is in the repo because CI never regenerates it.

---

## First release

The work before accounts and payments. Both features are free.

### Focus Lock — enforcement

Shipped for Android. This is the headline ADHD feature, so it ships free.

**The approach is the accessibility service**, chosen over UsageStatsManager plus
an overlay because it needs one permission rather than two and hears about a
window change as it happens rather than polling for it. An accessibility overlay
is drawn by the service itself, so *display over other apps* is not asked for,
and the service declares `canRetrieveWindowContent="false"`, so the platform does
not hand it the screen. The cost is the permission's reputation: the settings
screen reads as a broad grant, which is why the service's own description and the
page's permission row both say plainly what is and is not seen.

What is built and checked by the requirements above:

- Blocking only while the lock is armed and the day's goal is unmet; a bypass or
  an earned day disarms it, a manual re-arm arms it again for the rest of the day.
- The bypass rules stay authoritative, and the service takes the lock screen down
  at the deadline even if the reader is sitting in a disabled app when it passes.
- Nothing is blocked while the permission is missing; `/focus` reports the
  permission from the device and offers Android's settings screen.
- The list is the reader's, built from the device's launcher apps — no preset.
- The system starts the service itself, so the lock survives reboot and process
  death without a foreground service.
- No blocking on iOS until Screen Time work exists.

What is left before calling it finished:

- **On-device validation.** The lock screen compiles and packages into the APK; it has
  not yet been run against a real phone's launcher, keyboard, permission screens,
  Doze, or a reboot. Do that first.
- **The permission conversation.** Watch a first-time reader go through Android's
  accessibility screen. The page explains, but only a reader can say whether it
  explains enough. On Android 13+, a sideloaded build may also need *Allow
  restricted settings* in App info before the service can be switched on at all;
  the page mentions it where access is off.
- **iOS**, if iOS ships.

### Home-screen widgets

Android widgets, free. The widget is the app's most visible surface, so it has to
be right.

- **Verse of the day** — the same day-seeded passage the app and reminder use.
- **Streak** — the run, and whether today's goal is met.
- **One-tap draw** — a launcher-style button that opens straight into the riffle.

The widget cannot render the web app, so it is native: a small Kotlin
`AppWidgetProvider` plus a data bridge. The day's verse is computable from the
date, but the widget must not disagree with the app, so the app writes the day's
passage, minutes, and streak to `SharedPreferences` on change; the widget also
refreshes at local midnight. Tapping opens `/read`, `/streak`, or `/read?draw=1`
(a deep link the reader must support). iOS widgets wait for the iOS milestone.

---

## Potential features

Not scheduled, not in the catalog, and not offered as destinations in the app.
Each needs a deliberate decision before work starts; most need content or assets
before code.

| Feature | What it would be | Why it waits |
| --- | --- | --- |
| **Reading plans & summaries** | A few sentences on a chapter or talk, and structured plans ("30 Days in Alma") tracked over the existing day keys. | Content production is the bulk; the picker already supports scoped draws. |
| **Study quizzes** | Multiple-choice quizzes on study topics, verses, the day's Come Follow Me passage, and the reader's decks. Pre-made packs first; AI-generated later. | The first paid feature after payments exist. Needs question content and an authoring path. |
| **Crossword** | Scripture crossword with verse-reference clues. | Clue quality is the whole game and needs curation. |
| **Fishing for scriptures** | Cast, catch a reference, reveal the verse. | Needs art and a real loop; validate after the quiz. |
| **Shepherd search** | Hidden-object / collection game. | Mostly art and metaphor; speculative. |
| **Endure-to-the-end trail** | Subway-Surfer-style endless runner. | A full game: physics, art, levels, tuning, performance. Only if games prove retention. |
| **Coloring book** | Line-art scenes with tap-to-fill, undo, save, share. | Licensed or commissioned art is the real cost. |
| **Modern-language verses** | Plain-language paraphrase shown beside the original. | Cloud cost and doctrine review; never replaces the text. |
| **Story summarizer** | A chapter or talk reduced to a few sentences. | Overlaps with reading plans and AI plumbing. |
| **Context & likening** | Historical background and application suggestions for the passage in hand. | The flagship AI feature, and the first cloud feature once accounts and payments are validated. |

---

## Paywall scope (decided)

**Free, forever — everything built today:**

- The random picker, filters, presets, and page-riffle.
- All passage text and chapter/talk expansion — scripture **and** conference.
- Gospel Library links, the daily reminder, and the home-screen widgets.
- Favorites, history, streaks and freezes, notes, journal, and share-as-image.
- Search, memorization (including decks the reader builds), stats, and settings.
- **Focus Lock in full, including the Android lock screen.**
- Every game already shipped.

**Paid — Gospel Focus Plus and its content packs:**

1. **Ready-made memory decks** — curated decks, as opposed to the reader's own.
2. **Study quiz packs** — multiple-choice quizzes on topics, verses, Come Follow
   Me passages, and decks. Pre-made at first, AI-generated later.
3. **Coloring packs** — the coloring feature is free; themed art packs are paid.
4. **AI features** — Context & Likening first, then modern-language verses and the
   summarizer, sold through Plus or credit packs.

**Never paid:** passage text, the reading experience, the daily habit, Focus
Lock, or widgets.

---

## Monetization plan

Two ways to pay, and nothing is for sale today.

| Tier | Billing | What it is |
| --- | --- | --- |
| **Free** | none | The whole app as it stands: reading, daily habit, study, library, games, Focus Lock, widgets. |
| **Gospel Focus Plus** | subscription (monthly + annual) | Every paid content pack, plus a monthly AI allowance when AI ships. |
| **Packs / credits** | one-time | Individual deck packs, quiz packs, coloring packs, and AI credit packs. |

**Guardrails**

1. **Never sell a recurring cost as unlimited one-time.** AI is Plus or credits.
2. **Price packs so Plus still wins** — roughly 2–3 packs ≈ a year of Plus — and
   credit recent pack purchases toward an upgrade window.
3. **Keep the daily habit free.** It is acquisition and retention; paywalling it
   suppresses the behaviour that leads to upgrade.
4. **Plus means "every content pack, plus future ones."** It does not mean
   "every feature", because the app's existing features are free.
5. **If a lifetime unlock is ever offered, cap or exclude the AI allowance.**

**Entitlements:** owned packs and Plus are separate claims. Purchases are made on
the web through Stripe (and through Play Billing if the app is ever listed),
stored with the account, and restored on any device. Until accounts ship, there
is no entitlement system and no checkout.

---

## Roadmap

Order, not dates. Licensing runs in the background from day one.

1. **Licensing answer** — conference-text redistribution and the target channel.
   Not code, but it gates any store listing.
2. **Focus Lock enforcement** — shipped for Android; on-device validation next.
   Free.
3. **Home-screen widgets** — Android first. Free.
4. **Accounts, database, and sync** — Supabase auth, optional account, local-first
   with a merge-safe first sign-in. This is the first backend work.
5. **Payments and entitlements** — Stripe checkout on the web, Plus and packs,
   restore across devices. Web hosting lands here because checkout needs it.
6. **Paid content** — ready-made memory decks, then study quizzes.
7. **AI** — Context & Likening first, scripture only, through a small proxy with
   per-account limits. Modern-language and summarizer after.
8. **Potential features** — reading plans, the other games, coloring, as content
   and appetite allow.

---

## Two gates that shape everything

**Gate A — Conference-text licensing.** Scripture text is public domain (per
`public/data/manifest.json`). General conference text is Church-copyrighted; the
manifest itself says *"Scraped; verify redistribution rights before publishing."*
The paywall does not change this — conference stays free either way — but
redistributing it at all, and especially shipping it in a store listing, wants a
written answer from Intellectual Reserve. **Any AI feature that transforms
conference text creates a derivative work**; confirm that separately. Until the
answer arrives: no store listing, and no conference text through an LLM.

**Gate B — Distribution.** A sideloaded APK cannot use Google Play Billing. The
fastest honest path to revenue is the web build with Stripe, which needs no
gatekeeper and works on iPhone; Play ($25, review, and Gate A at its strictest)
is a later, optional channel. The web build is not hosted yet.

---

## What you do not need yet

- A server, until accounts and checkout (then only a small one, plus the LLM
  proxy).
- A designer — the token set above is the design system.
- A data-pipeline rewrite — `scripts/build-data.mjs` extends cleanly.
- Sync for correctness — local-only is sufficient for everything built today.

## Resources to line up

| Resource | When | Rough cost |
| --- | --- | --- |
| Supabase project | Accounts milestone | Free tier is enough to start |
| Stripe account | Payments milestone | Free until revenue |
| Web host | Payments milestone | Free tier is enough to start |
| Privacy policy + terms | Before accounts | Free to write |
| Play Console account | Only if going to Play | $25 one-time |
| LLM API key + proxy | First AI feature | Usage-based; small at low volume |
| Line art / coloring packs | Coloring feature | Commission or license — the real cost |
| Apple Developer account | Only if iOS ships | $99/yr |

## Open risks

- **Licensing (Gate A)** — unresolved; blocks a store listing and any AI work on
  conference text.
- **Native permissions** — the Focus Lock needs accessibility access, which is
  the most likely store-review friction; widgets will need their own host
  permissions. Sideload and web remain the safe channels.
- **Widget staleness** — a widget that disagrees with the app is worse than none.
  The data bridge and midnight refresh are part of the feature, not polish.
- **AI output quality** — paraphrases and application suggestions need a clear
  "AI-generated, not doctrine" disclaimer and a report path.
- **Content cost** — decks, quiz questions, and coloring art are the real work in
  the paid tier, not the code.
- **Accounts change the privacy story** — "no account, no backend" is a promise
  today. Sync must stay optional, and local data must survive signing out.
- **Games scope creep** — the endless runner especially; treat games as
  experiments with a kill criterion.
- **Placeholders that overpromise** — the catalog's capability lists are promises
  in the reader's own words; revise them as features land.
