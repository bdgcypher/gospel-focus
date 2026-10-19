# Gospel Focus 📖

A random scripture finder for the _**Standard Works**_ and _**General Conference**_ of
The Church of Jesus Christ of Latter-day Saints — and, once a passage is drawn, a
small daily study app built around it.

> Not sponsored by or affiliated with The Church of Jesus Christ of Latter-day Saints.

## Introduction

Growing up, when I needed some inspiration or wanted to pray for guidance from the Lord I would open up my scriptures to a random page and scan through the verses. Many times I would find something that felt especially relevant to my situation. Moments like this would make me feel seen and known by my Savior.

Since then, mobile phones and the internet have widely replaced my use of physical books. The convenience of having any scripture or talk available wherever I go has been a huge blessing but I missed the novelty of the "open to a random page" approach.

_**Gospel Focus**_ pulls in passages from all LDS standard works and general conference talks and rifles through virtual pages to land on a random passage. The user can then expand it to read a whole chapter (or talk), jump straight to the passage in the Church's Gospel Library for annotation, hide the words and recite them from memory, or star it for later — and the app counts the time spent doing it so a day's study becomes a streak.

## Features

### Reading

- **Random passage picker** weighted across every selected source, so longer books
  and conferences show up in proportion to how much scripture they contain.
- **Filters** for each volume of scripture (with per-book toggles) and for each
  general conference, plus one-tap presets (*All* / *Bible* / *LDS Standard Works* /
  *LDS General Conference*). On wide screens the filters are a sidebar; on a phone
  they slide in over the page.
- **Page riffle animation** as the passage is selected, to capture that feeling of
  opening a physical book. *Reduce motion* in settings skips straight to the draw.
- **Expand to the whole chapter** (or the full conference talk) with the selected
  verse highlighted and auto-scrolled into view.
- **Share what you pick** — tap verses (or paragraphs) in the expanded view to
  share just those. The drawn passage comes up already selected, so a quick pick
  can't quietly drop it, and a floating bar follows you down the page — collapse
  the chapter, open the passage in the Gospel Library, share the selection, or
  save a picked set to favorites — so a long chapter never has to be scrolled
  back through. It steps aside again whenever the chapter's own row of controls
  (the same jobs, at the foot of the chapter) comes into view.
- **Gospel Library deep link** for every passage, built from the official
  `churchofjesuschrist.org/study/...` URL scheme — on Android the link opens
  directly **in the Gospel Library app** when it's installed.

### The daily habit

- **Verse of the day** on the home screen, drawn from the day itself rather than at
  random (`lib/daily.ts`), so the app, the notification, and the reminder all quote
  the same passage — and the reminder can be worked out offline.
- **A daily study goal** you choose in minutes (5–30). The app starts and stops the
  session for you while a reading or study page is open and in front of you, and the
  hero on the home screen shows the minutes against the goal. There is deliberately
  no stopwatch to watch — the point is to lower the barrier to *beginning*.
- **A streak** of consecutive days whose goal was *met*. A day the app was merely
  opened does not count.
- **A daily reminder** — one verse a day at the hour you choose, as a native local
  notification. The next few days are scheduled ahead of time, so it works with the
  app closed and no server anywhere.
- **Status chips** in the header for today's minutes, the streak, and the Focus
  gate. Each one is a link: minutes open the study section, the streak opens stats,
  the gate opens its own page.

### Study

- **Search** (`/search`) — every verse and conference paragraph, at once. A
  phrase finds the verse it came from, and a reference finds its chapter:
  `alma 32` puts Alma 32 in order at the top, `1 nephi 3:7` puts that verse
  first, and the other passages that merely share the words follow on. Scripture
  is ranked above general conference — every verse before any talk, whatever the
  scores say — with a slice of the page held back for talks so that a word like
  *faith* (1,700 verses) still shows the talks that discuss it rather than burying
  them under a wall of verses. Within those rules the page ranks by how well a
  passage answers the query: **more of its words first — the ones that mean
  something before the glue — then the query's own order, then the whole query as
  one unbroken run.** So `god … service` ranks below `service … god`, a passage
  holding `of` and `your` beats one that dropped them, and *still small voice*
  opens on the verse that says it.
  Results show the passage from where the query's words are — the first line is a
  window onto the text, marked where it matches, not always the passage's opening
  — and open in the reader, ready to expand, favorite, or share; the words that
  answered are marked in the reference and in that line, and submitting the
  search puts the filters away. Search honours **the same source
  filters as the passage page** — one selection, edited from either place, shown
  there as a count of the passages it covers. The index is built at build time and searched on the device, like
  everything else here — see [Data](#data) for what it costs. Very common words
  (`the`, `and`, `unto`) are not indexed, because they are most of what an index
  costs and say almost nothing; the page adds them back out of the passage text
  instead, marking them and counting them below the words that carry meaning.
- **Memorization** (`/memorize`) — **word hiding** steps a passage's words out of
  sight one at a time, from the top down or scattered; **flashcards** show the
  citation and the words on two faces and start on whichever you choose; recall the
  words from the citation, or the citation from the words, with the first letters as
  a hint. Every recitation is logged with the day it happened. The page is an index
  of **decks**: one card per group, with its name, its card count, and its own edit
  and delete, and the unnamed **memory list** sits alongside them as a deck that
  cannot be renamed. Opening a deck shows its cards, the **flashcards** run for
  that deck alone, and its own **edit** — the deck that turns out to be wrong is
  usually the one you have open. A card can be a run rather than a single verse:
  the sheet grows one a verse at a time beside each entry, and the verses picked
  out in the reader are taken as one card holding all of them. Decks are built —
  and later renamed and refilled — in one sheet from the library's own search,
  the reader's favorites, or the draw; ready-made decks are on the roadmap. The way in is a card on a screen with width and a round
  button in the corner on a phone, and the whole card is the button.
- **Study timer** — time counts on its own on any ready reading or study page, so
  the minutes are minutes spent in the word rather than minutes spent in the app.

### Your library

- **Favorites, with a backup file.** Star the passage you're reading, or pick
  several verses (or paragraphs) in the expanded chapter — in a row or scattered —
  and save them as **one** favorite, from the card's own star, the chapter's row of
  controls or the floating bar. Its reference names what it holds (`1 Nephi 3:7-9`,
  or `1 Nephi 3:3, 7-9` when the pick is scattered), and the favorites page shows
  each verse on its own numbered line, folding past a few behind a *Show all*
  toggle. The backup CSV keeps the same shape in its `passage` cell (`7-9` or
  `3,7-9`), so a round trip through the file restores exactly what was saved. The
  menu's star fills in as soon as anything is saved.
- **Stats** (`/stats`) — the current run of days, the best one, and every day
  counted; passages read; flashcards recited; passages starred; minutes studied
  today against the goal, and the days it was met. The goal itself is set in
  settings, which the stats page links straight to.
- **Settings** (`/settings`) — theme (light / dark / follow the system), reduce
  motion, the daily study goal, the streak's own readout, the daily reminder and its
  hour, and the favorites backup (export and import).

### Games

- **What's That Verse?** (`/games/reference-quiz`) — a verse is printed and the
  reader names its reference, built from four searchable dropdowns: volume,
  book, chapter and verse. A hint gives the next part away — volume, then book,
  then chapter, then the verse — and each one costs a quarter of the round's
  hundred points, so help is never free but is always available. A wrong guess
  marks only the parts that are off and costs nothing but the retry; the score
  says how much was given away, and the session total adds the rounds up.
  Scripture only, drawn under the reader's own filters.
- **Daily puzzle** (`/games/puzzle`) — six guesses at a four-to-six-letter
  word hiding somewhere in the day's chapter. The chapter is the same day-seeded
  draw as the verse of the day, so every device gets the same puzzle, and the
  board shows only its reference — which opens the whole chapter in a
  scrollable side panel, with the verse the word hides in marked, so checking
  the text never costs the reader their guesses. The word list is built from the
  library itself, so
  a guess has to be a word the scriptures use. Progress is kept for the day, the
  board survives a reload, and a finished game offers a result card with the
  verse and word marked, and a **Play again** round drawn from a random chapter.
  The first visit on a device opens a **How to play** card — one example of
  each colour, green, gold and grey — and a **How to play** link under the
  board brings it back, so the rules are taught once rather than every day.
  A new daily word arrives at the reader's own midnight.
- **Word-search** (`/games/word-search`) — the passage's own significant words
  hidden in a ten-by-ten letter grid, in eight directions. A passage is drawn
  with the reader's own filters, the words are read out of its text (longer words
  first, glue words left out), and the grid is built fresh around them. Drag
  across the letters on touch or with a mouse, or focus a cell and press Enter to
  choose a word's first and last letters. A line counts when it spells a listed
  word, so a word traced over a second set of cells still counts; found words are
  struck off the list, and finishing the board shows the verse. The passage line
  names the whole citation, verse included, and opens the chapter (or talk) in
  the same side panel the daily puzzle uses, scrolled to that verse with it
  marked; finishing the board links into the chapter as well. Nothing is
  stored — every passage drawn gets its own grid.

### Focus

- **Focus Lock** (`/focus`) — set it up in one step, see at a glance whether it is
  holding, and keep a list of the apps you mean to hold back. Turning it off by hand
  asks first — 15 minutes, 30 minutes, or the rest of the day — and the gate closes
  itself again when that runs out. The page shows today's minutes against the same
  goal the home screen shows, because that is what the lock is waiting on.
- **Honest about the half that isn't built:** holding another app back needs
  Android's usage and accessibility APIs, and that native layer does not exist yet.
  Every state on the page is one you set and can see again, and the page says
  plainly that nothing is being blocked. See `ROADMAP.md`.

### Around the app

- **A home screen that leads with something to do** — the day's heading, the goal
  and its button, the verse of the day, and four tiles for everything else.
- **Section pages** for Study (`/study`) and Games (`/games`), each built from the
  same catalog of features as the navigation, so nothing can disagree about what
  exists or where it lives.
- **Two navigations from one list** — a bar across the top where there is room for
  it (desktop, landscape tablet) and a tab bar under the thumb everywhere else,
  where the last tab is the menu. The stylesheet picks between them, so a rotation
  causes no layout flash.
- **Light / dark themes** that default to the device preference.
- **A feature that isn't built yet says so.** Pages for planned features
  (widgets, reading plans, liken, the other games, the coloring book) render
  their own plan — what the feature will do — rather than pretending to work,
  and the catalog's status is the single switch that changes when one lands
  (`lib/features.ts`).
- **A journal that links back to its sources** (`/journal`) — entries written by
  typing or by dictation, formatted with bold, italic, underline, lists, and
  links, and pointing at a passage in the library, a note written on a starred
  passage, or another entry. Notes are written from the reader (which stars the
  passage as it takes one) or from a favorite in `/favorites`, and the journal's
  link picker searches all three kinds.

## Getting started

```bash
npm run bootstrap    # JDK 21 + Android SDK + npm ci + web build + cap sync
npm run dev          # http://localhost:3000
```

`npm run bootstrap` is the one command that makes a machine able to build the
app, and it is what makes this checkout portable. A clone already carries
everything that can travel through git — the source, the lockfile, the passage
library, the Gradle wrapper, and both native projects. What it cannot carry is
what is per-machine or secret, so the script provisions the rest:

- **Node 22** is expected (`.nvmrc`, and `engines` in `package.json`).
- **JDK 21 and the Android SDK** (`platform-tools`, `platforms;android-36`,
  `build-tools;36.0.0`) are downloaded for this OS and CPU from Adoptium and
  Google into the gitignored `.toolchain/` — unless `JAVA_HOME` /
  `ANDROID_HOME` already point at usable ones.
- **npm packages** come from `package-lock.json` (`npm ci`);
- **the release key**, if `ANDROID_KEYSTORE_B64` and its three companions are in
  the environment, is written exactly as CI does (see
  [signing](#building-a-sideloadable-apk)); with none set the build is unsigned
  rather than broken.
- `android/local.properties` and `.toolchain/env.sh` (`.ps1` on Windows) are
  written for Android Studio and for shells that build without npm.

`npm run bootstrap -- --build` goes on to assemble the release APK (and the iOS
simulator build on macOS). `--toolchain <dir>` provisions somewhere other than
`.toolchain/` — export `GOSPEL_FOCUS_TOOLCHAIN` to that path afterwards so the
other npm scripts find it — and `--force-install` re-runs `npm ci`. The
directory is relocatable and deletable: copy it to another machine of the same
OS and CPU, or delete it and run the script again.

Other commands:

```bash
npm run build        # static export into ./out (Capacitor webDir)
npm run preview      # serve the exported ./out folder
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build:data   # re-download + rebuild public/data from the sources
npm run build:search # rebuild just the search index from public/data on disk
npm run build:words  # rebuild just the daily puzzle's word list from public/data
```

## Cross-platform (web, Android & iOS)

The app is configured for **static export** (`output: "export"` in
`next.config.ts`), which is what Capacitor bundles into native shells. Everything
runs client-side, so there are no server actions or API routes to work around.

**Android is the target that ships today.** The iOS project is committed as well
(`ios/`, using Swift Package Manager — no CocoaPods, so it syncs on any OS), and
`npx cap sync ios` keeps it current. Compiling it needs macOS with Xcode:
`npm run ios:build` produces an unsigned simulator `.app`, a check that the web
bundle and plugins fit together rather than something to sideload. A device
build is Xcode's job, with a signing team.

```bash
# build the web app and copy it into both native projects
npm run cap:sync

# open the Android project in Android Studio (Xcode for iOS: npm run cap:ios)
npm run cap:android
```

`npm run cap:add:android` / `npm run cap:add:ios` regenerate a native project
from scratch and are only needed if one is ever deleted.

Passage links open in the **Gospel Library app** on Android (via its official
`gospellibrary://content` custom scheme, falling back to the in-app browser
(`@capacitor/browser`) when the app isn't installed), in the in-app browser on
iOS, and in a new tab on the web — see `lib/external.ts`.

Files do not leave the app the way they do on the web. A WebView has no download
manager, no Web Share API and no image clipboard, so on device:

- A **share card** is written into the app cache (`@capacitor/filesystem`) and
  handed to the **system share sheet** (`@capacitor/share`). A long selection comes
  out as a *set* of cards — each up to about a screenful (1080 × ≤2400 px) — so a
  chapter's worth of verses stays readable instead of arriving as a 1:11 sliver.
- A **favorites backup** is saved straight into **Downloads**, with no sheet to
  click through — on Android 10+ through MediaStore, which needs no permission,
  and on Android 9 and older as a file in the public Downloads folder, which
  asks for storage access once. Either way the file lands in the user's own
  storage and shows up in the Files app. Should the save fail, the app falls
  back to the share sheet so the backup can still get out
  (`FileDownloadPlugin.java`).
- Backups are read back through the native file picker
  (`@capawesome/capacitor-file-picker`), which returns the file's own bytes
  rather than depending on a `content://` URI reaching a file input.

Copying a card to the clipboard uses a small local plugin
(`ImageClipboardPlugin.java`) that puts the cached PNG on the clipboard as a
`content://` URI. All of it lives in `lib/native-files.ts`, with the browser
paths left untouched.

The **daily reminder** is native too (`@capacitor/local-notifications`): a browser
can't deliver a notification while it is closed, so the settings page says so
rather than offering a switch that would never fire.

System bars and safe areas are handled on Android by the `SystemBars` plugin
(configured in `capacitor.config.ts`), which passes the real status/navigation bar
insets through to the WebView as `env(safe-area-inset-*)` for the CSS to pad
against.

Add native app icons and splash screens with
[`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) using
`app/icon.svg` as the source:

```bash
npx @capacitor/assets generate android --assetPath app \
  --iconBackgroundColor "#f7f2e7" --splashBackgroundColor "#f7f2e7"
```

### Building a sideloadable APK

Prerequisites: Node 22 and a JDK 21 plus the Android SDK with
`platforms;android-36` + `build-tools;36.0.0`. `npm run bootstrap` provisions
both into the gitignored `.toolchain/` for this OS and CPU — or uses ones already
installed via `JAVA_HOME` / `ANDROID_HOME`.

```bash
npm run cap:apk      # = build + cap sync + gradle assembleRelease
# output: android/app/build/outputs/apk/release/app-release.apk
```

The Gradle step runs through `scripts/gradle.mjs`, which sets `JAVA_HOME` and
`ANDROID_HOME` from that toolchain and picks `gradlew.bat` on Windows — the same
npm command on every OS.

Without the release key the build still succeeds, as
`app-release-unsigned.apk`: `android/app/build.gradle` signs only when both
`android/keystore.properties` and the keystore it names are present. Signing is
the one piece a clone cannot supply; restore it from a password manager (or set
the four `ANDROID_KEYSTORE_*` variables and re-run `npm run bootstrap`).

The APK is release-signed when the key is present, targets API 36, and has
`minSdkVersion 24` (Android 7.0+). To sideload: copy it to the device, allow *Install unknown apps*
for your file manager or browser, open the file, and install.

Signing setup (already configured in `android/app/build.gradle`):

- Keystore: `android/keystore/release.keystore` — **back it up**; without it
  you can never push an update to an installed app.
- Credentials: `android/keystore.properties` (both are gitignored).
- Bump `versionCode` in `android/app/build.gradle` for every release.

`npm run bootstrap` restores both from the same secrets CI uses —
`ANDROID_KEYSTORE_B64` (the base64 of the keystore), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEYSTORE_KEY_ALIAS`, `ANDROID_KEYSTORE_KEY_PASSWORD` — so a new machine
does not need the files copied by hand. Those secrets are write-only on GitHub,
so the password-manager copy is the real one.

Dark/night icon variants and the Android 13+ monochrome themed-icon layer are
generated from `app/icon.svg` as well:

```bash
npm run icons:dark
```

Re-run it after regenerating the light assets with `@capacitor/assets` (the
generator overwrites the adaptive icon XMLs).

> Note: the asset generator also rewrites `public/manifest.webmanifest` with PWA
> icon paths (`../icons/...`) this project doesn't ship — revert it with
> `git checkout public/manifest.webmanifest` unless you want those PWA icons.

### Installing the APK on your phone

1. **Get `app-release.apk` onto the device** — any of:
   - From GitHub: the **Releases** page (permanent link, no login) or the
     **Actions** tab → latest run → *Artifacts* (needs a GitHub login; zipped,
     expires after 90 days).
   - From your computer: USB cable, Google Drive/email it to yourself, or — on
     the same Wi-Fi — `python3 -m http.server 8000` and download it from
     `http://<computer-ip>:8000/android/app/build/outputs/apk/release/app-release.apk`.
2. Open the downloaded `app-release.apk` in the file manager or browser.
3. When Android blocks the install, choose **Settings** and enable
   **Allow from this source** for that app (one-time per source), then go back
   and tap **Install**.
4. Ignore the generic “file can harm your device” warning (shown for every APK
   not from Play Store). Play Protect may ask to scan — it's your own build.

**Updates:** CI signs with the same keystore, so new APKs install straight over
the old version as long as `versionCode` doesn't go backwards (tagged builds
stamp it from the tag). If you ever lose the keystore, an update requires
uninstalling the installed app first — back up `android/keystore/`.

### Getting the APK from GitHub (no local build)

CI (`.github/workflows/android-apk.yml`) builds the signed APK on every push to
`main` — download it from the repo's **Actions** tab → latest run → *Artifacts*
(needs a GitHub login; artifacts expire after 90 days).

For a permanent, no-login download link, push a version tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

That publishes the APK on the **Releases** page and stamps `versionName` from
the tag (`v1.2.3` → versionName `1.2.3`, versionCode `10203`), so you normally
don't need to bump versions by hand for tagged builds. CI signs with the same
keystore as local builds via repo secrets:
`ANDROID_KEYSTORE_B64` (base64-encoded keystore), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEYSTORE_KEY_ALIAS`, `ANDROID_KEYSTORE_KEY_PASSWORD` — set with
`gh secret set <name>`.

### Building the iOS app

```bash
npm run ios:build    # macOS only: unsigned simulator .app via xcodebuild
```

The iOS project syncs anywhere (`npx cap sync ios`), but the Swift compile needs
macOS with Xcode — the one part of this setup that is not portable. The script
builds for the simulator with `CODE_SIGNING_ALLOWED=NO` and writes
`ios/App/build/Build/Products/Release-iphonesimulator/App.app`; that verifies the
web bundle, the Swift package and all seven plugins fit together, but it is not a
sideloadable IPA. A device build means opening `npm run cap:ios` and signing with
your own team.

CI runs the same script on `macos-latest`
(`.github/workflows/ios-build.yml`), so a broken iOS project shows up on push.

## Data

The passage library is generated into `public/data` and shipped with the app so it
works offline (important for the native builds):

| Source | Content | Provenance |
| --- | --- | --- |
| [`bcbooks/scriptures-json`](https://github.com/bcbooks/scriptures-json) | Book of Mormon, Doctrine & Covenants, Pearl of Great Price, Old & New Testament (verse-level) | Public domain, 2013 edition |
| [`johnmwood/LDS-Conference-Scraper`](https://github.com/johnmwood/LDS-Conference-Scraper) | General conference talks (split into paragraphs) | Scraped project with no declared license — **verify redistribution rights before publishing** |

In all, **51,083 passages**: 41,995 scripture verses across the five volumes (Old
Testament 23,145; New Testament 7,957; Book of Mormon 6,604; Doctrine & Covenants
3,654; Pearl of Great Price 635) and 9,088 conference paragraphs from ten
conferences (2014–2018). About **9.7 MB**, most of it fetched lazily.

`scripts/build-data.mjs` downloads and normalizes both into a compact format and
writes:

- `public/data/manifest.json` — lightweight index (~8 KB) used for filtering and weighted draws
- `public/data/scriptures/<volume>.json` — verse text, loaded lazily per volume
- `public/data/conference/<year>-<month>.json` — talk paragraphs, loaded lazily
- `public/data/search.json.gz` — the MiniSearch index `/search` queries
- `public/data/words.json` — the six-letter vocabulary the daily puzzle builds
  from (`scripts/build-words.mjs`), so guessing is checked against the library

All of it is **committed**, like the passage data itself: CI builds the APK with
`npm ci` and `cap:sync` and never regenerates the data, so what is in the repo is
what ships. Re-run `npm run build:search` after a change to the index's shape and
commit the file it writes.

Nothing here depends on the network at runtime: the files are part of the build, so
the picker, the filters, the verse of the day, the reminder, and the search all
work with the device offline.

### The search index

One document per verse or conference paragraph (51,083 of them), with its citation
for an id, its text searchable, and almost nothing stored — a search result's
first line is read out of the passage data rather than kept twice. Words that
glue a sentence together are not indexed at all, which is most of the saving: the
441 most common terms are ~1.1 M of the corpus's ~1.6 M term/document pairs, but a
plain frequency cut would also take *lord*, *god*, and *nephi* with them, so the
list is a kept one rather than a threshold. Indexing them too was measured at
**19.09 MB of JSON, 4.84 MB gzipped** against 11.89 / 2.86, which is why they are
added back at query time instead: the page counts and marks them out of the
passage's own text, worth less than a word that means something. The result is **11.9 MB of JSON, 2.86 MB
gzipped**, fetched and inflated once per session on the page that needs it, and
about 1.4 s to the first result on a desktop browser (a quarter of that the
box's own debounce); every later search is ~0.1 s.

It carries no passage text. A result's line, and the ranking's reading of how much
of the query a passage carries and in what order — glue included, by prefix for a
word with meaning and exactly for the glue — take the text out of the passage
library instead: by id, through the same caches, the same files the reader opens.
So the index stays as it is and the reading happens only where it is needed: a
one-word search reads nothing extra, and the worst multi-word query measured — 14
of the 15 files, 3.09 MB on the wire — reached its first result in 2.09 s.

The build reads its own file back and searches it before finishing
(`verifySnapshot`), because the index and the page each own half of one contract
and a stopword list on one side only fails silently, as an empty result set:

```bash
npm run build:search
# 51,083 documents, 11.89 MB → 2.86 MB gzipped, ~13 s
# ok "nephi" → 2723 hits / ok "1 nephi 3" → 126 hits / ok common words → 0 hits
```

## Project structure

```
app/                      routes — home hub, /read, /study, /search, /memorize,
                          /games, /focus, /stats, /favorites, /settings, the
                          planned pages, layout + theme provider
components/               UI — the hub, the picker and riffling animation, the
                          passage card and share dialog, memorization, the
                          daily puzzle, stats, settings, the focus page, nav,
                          header, status tray
lib/picker.ts             manifest + weighted random-draw engine, and citation
                          lookups (how a search result or an imported favorite
                          becomes a passage)
lib/search.ts             the search index: load, inflate, query, rank by
                          citation
lib/daily.ts              the local day, shared by the streak, the goal, the
                          verse of the day, and the reminder
lib/features.ts           the catalog every page, card, and nav is built from
lib/streak.ts             the run of days the goal was met
lib/study.ts              the daily goal and the minutes behind it
lib/memorize.ts           the memory deck and its recitation log
lib/wordle.ts             the daily puzzle: marking, the day's word, the board
lib/favorites.ts          starred passages (see also favorites-csv/io)
lib/focus.ts              the Focus lock's own state and its timed bypass
lib/reminders.ts          the daily passage notification, scheduled in advance
lib/preferences.ts        theme, motion, reminder hour, and the filters
lib/share-image.ts        drafting the share cards
lib/native-files.ts       native sharing / file picking / downloads (Capacitor)
lib/external.ts           the Gospel Library URL builder and browser opener
lib/types.ts              shared types
scripts/bootstrap.mjs     provision JDK + SDK, install, build, sync — any OS
scripts/toolchain.mjs     find JAVA_HOME / ANDROID_HOME, or the .toolchain copy
scripts/gradle.mjs        cross-platform gradlew runner for the npm scripts
scripts/ios-build.mjs     unsigned simulator build via xcodebuild (macOS only)
scripts/build-data.mjs    the dataset generator (and the search index with it)
scripts/search-index.mjs  the MiniSearch index: its shape, its stopwords, and
                          the check that the page can still read it
scripts/build-search.mjs  rebuild just the index, from public/data on disk
scripts/build-words.mjs   the daily puzzle's six-letter list, from public/data
public/data/              the generated passage library, indexes, and word list
android/                  the Capacitor Android project (signed release builds)
ios/                      the Capacitor iOS project (Swift Package Manager)
capacitor.config.ts       native shell configuration
next.config.ts            static export configuration
```

Each `lib` store keeps its own versioned key (`preferences:v1`, `favorites:v1`,
`study:v1`, `streak:v2`, `focus:v1`, `memorize:v1`, `decks:v1`) in `localStorage` and reads it
through a validating parser, so a corrupted or hand-edited record falls back to the
default instead of breaking a page.

## Roadmap

`ROADMAP.md` is the plan: what ships today, what is left, what each unfinished
feature will do, and where each one sits against the paywall. The status of every
destination in the app comes from `lib/features.ts`, and a page whose entry is
`planned` renders the shape of the feature rather than a dead end.

## Licensing & attribution

Scripture text is public domain. Conference text is included for personal use;
review the source repository before redistributing. All passages link back to the
Church's official Gospel Library.
