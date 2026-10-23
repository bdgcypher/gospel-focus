# Contributing & building

Everything needed to run, build, package, and regenerate Gospel Focus. For what
the app is and where it is going, see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

## Setup

Node 22 is required (`.nvmrc`, `engines` in `package.json`).

```bash
npm run bootstrap    # JDK 21 + Android SDK + npm ci + web build + cap sync
npm run dev          # http://localhost:3000
```

`npm run bootstrap` provisions what git cannot carry:

- **JDK 21 and the Android SDK** (`platform-tools`, `platforms;android-36`,
  `build-tools;36.0.0`) into the gitignored `.toolchain/`, unless `JAVA_HOME` /
  `ANDROID_HOME` already point at usable ones.
- **npm packages** from `package-lock.json` (`npm ci`).
- **the release key**, if `ANDROID_KEYSTORE_B64` and its three companions are in
  the environment (see [signing](#building-a-sideloadable-apk)); without them the
  build is unsigned rather than broken.
- `android/local.properties` and `.toolchain/env.sh` (`.ps1` on Windows).

`npm run bootstrap -- --build` goes on to assemble the release APK (and the iOS
simulator build on macOS). `--toolchain <dir>` provisions elsewhere — export
`GOSPEL_FOCUS_TOOLCHAIN` to that path afterwards — and `--force-install` re-runs
`npm ci`. The directory is relocatable and deletable.

## Commands

```bash
npm run build        # static export into ./out (Capacitor webDir)
npm run preview      # serve the exported ./out folder
npm run typecheck    # next typegen + tsc --noEmit
npm run lint         # eslint
npm run build:data   # re-download + rebuild public/data from the sources
npm run build:search # rebuild just the search index from public/data on disk
npm run build:words  # rebuild just the daily puzzle's word list from public/data
npm run cap:sync     # build, then copy the web app into both native projects
npm run cap:android  # build, sync, and open Android Studio
npm run cap:ios      # build, sync, and open Xcode
npm run cap:apk      # build, sync, and assemble the release APK
npm run ios:build    # macOS: build the unsigned simulator .app
npm run icons:dark   # regenerate night and monochrome Android icons
npm run version:tag  # copy the newest git tag into package.json
```

## Verification

Every non-trivial change is checked at four levels:

1. **`npm run typecheck`, `npm run lint`, `npm run build`** — the baseline.
2. **Drive the real app.** Run the exported build (`npm run preview`) in Chromium
   and assert behavior through the DOM, including the Capacitor bridge where the
   feature depends on it. Do not rely on the build succeeding as proof the
   feature works.
3. **Committed tests.** There is no test suite yet. The first change that touches
   logic should add Vitest + React Testing Library, with tests beside the module
   or in `__tests__`, and `npm test` in `package.json`. Keep it green.
4. **Visual review.** For a visual change, capture the before and after at phone
   and desktop width, in focused and playful, light and dark, and check
   `prefers-reduced-motion`.

Never skip a check, weaken an assertion, or add a suppression to make a change
pass. If a check cannot run, say so.

## Project structure

```
app/                      routes — the hub, /read, /study, /search, /memorize,
                          /journal, /games, /focus, /widgets, /stats, /streak,
                          /shop, /favorites, /settings, layout + theme provider
components/               UI — hub, picker and riffling animation, passage card
                          and share dialog, memorization, games, stats, settings,
                          nav, header, status tray
lib/picker.ts             manifest + weighted draws, citation lookups
lib/search.ts             the search index: load, inflate, query, rank
lib/daily.ts              the local day shared by streak, goal, verse, reminder
lib/features.ts           the catalog every page, card, and nav is built from
lib/streak.ts             the run of days, its strip, and its freezes
lib/study.ts              the daily goal and the minutes behind it
lib/memorize.ts           decks and the recitation log
lib/wordle.ts             the daily puzzle: marking, word, board
lib/favorites.ts          starred passages (see also favorites-csv/io)
lib/journal.ts            journal entries and their links
lib/notes.ts              notes attached to passages
lib/focus.ts              the Focus lock's state, held apps, and timed bypass
lib/native-focus.ts       the Focus lock's Android half: permission, apps, sync
lib/reminders.ts          the daily study notification, scheduled ahead
lib/preferences.ts        theme, style, motion, reminder time, filters
lib/share-image.ts        drafting the share cards
lib/native-files.ts       native sharing, file picking, downloads (Capacitor)
lib/external.ts           Gospel Library URLs and the browser opener
lib/types.ts              shared types
scripts/bootstrap.mjs     provision JDK + SDK, install, build, sync — any OS
scripts/toolchain.mjs     find JAVA_HOME / ANDROID_HOME, or the .toolchain copy
scripts/gradle.mjs        cross-platform gradlew runner
scripts/ios-build.mjs     unsigned simulator build via xcodebuild (macOS only)
scripts/build-data.mjs    the dataset generator (and the search index with it)
scripts/search-index.mjs  the MiniSearch index, stopwords, and its self-check
scripts/build-search.mjs  rebuild just the index
scripts/build-words.mjs   the daily puzzle's word list
public/data/              the generated passage library, indexes, word list
android/                  the Capacitor Android project
ios/                      the Capacitor iOS project (Swift Package Manager)
capacitor.config.ts       native shell configuration
next.config.ts            static export configuration
```

Each `lib` store keeps its own versioned key in `localStorage` and reads it
through a validating parser, so a corrupted or hand-edited record falls back to
the default instead of breaking a page. Every key carries the same
`gospel-focus:` prefix: `preferences:v1`, `favorites:v1`, `study:v1`,
`streak:v2`, `focus:v1`, `memorize:v1`, `decks:v1`, `journal:v1`, `notes:v1`,
`coins:v1`, `wordle:v2`, `wordle:stats:v1`.

## Native shells

The app is a **static export** (`output: "export"`), which is what Capacitor
bundles. Everything runs client-side; there are no server actions or API routes.

**Android is the target that ships today.** The iOS project is committed too
(`ios/`, Swift Package Manager, no CocoaPods), and `npx cap sync ios` keeps it
current. Compiling it needs macOS with Xcode.

`npm run cap:add:android` / `npm run cap:add:ios` regenerate a native project
from scratch and are only needed if one is deleted.

Passage links open in the **Gospel Library app** on Android (its
`gospellibrary://content` scheme, falling back to the in-app browser), in the
in-app browser on iOS, and in a new tab on the web — see `lib/external.ts`.

### Files and sharing

A WebView has no download manager, no Web Share API, and no image clipboard, so
on device:

- A **share card** is written into the app cache (`@capacitor/filesystem`) and
  handed to the system share sheet (`@capacitor/share`). A long selection comes
  out as a set of cards, each up to roughly a screenful (1080 × ≤2400 px).
- A **favorites backup** saves into **Downloads** through MediaStore on Android
  10+, and as a file in the public Downloads folder on Android 9 and older, which
  asks for storage access once. A failed save falls back to the share sheet
  (`FileDownloadPlugin.java`).
- Backups are read back through the native file picker
  (`@capawesome/capacitor-file-picker`), which returns the file's own bytes rather
  than a `content://` URI.
- Copying a card uses a small local plugin (`ImageClipboardPlugin.java`) that puts
  the cached PNG on the clipboard as a `content://` URI.

All of it lives in `lib/native-files.ts`; browser paths are untouched.

### Focus Lock's gate

The Focus Lock's Android half is an `AccessibilityService`
(`FocusAccessibilityService.java`), declared in the manifest with
`BIND_ACCESSIBILITY_SERVICE` and narrowed by `res/xml/focus_lock_service.xml`.
It hears `TYPE_WINDOW_STATE_CHANGED`, compares the package in front with the
reader's list, and draws a `TYPE_ACCESSIBILITY_OVERLAY` gate over a match. One
permission is enough: an accessibility overlay needs no display-over-other-apps
grant, and `canRetrieveWindowContent` is false, so it never sees the screen. The
system starts the service itself, which is what carries the lock across a reboot.

`FocusLockPlugin.java` and `lib/native-focus.ts` are the bridge: they list the
launcher apps, report whether the service is enabled, open Android's
accessibility settings, and write `{ lockOn, earnedDay, relockedDay, bypassUntil,
packages }` into the `focus_lock` SharedPreferences file the service reads. The
web store stays authoritative — `lib/focus.ts` decides, `components/focus-sync.tsx`
publishes on every change — and the day keys let the gate re-arm itself at
midnight while the app is closed. Android's Settings app is never gated, since it
is where the permission is turned off again.

The gate wears the reader's own theme and skin rather than a fixed palette of its
own: `setAppearance` writes light/dark, focused/playful and whether the theme
follows the device into `gate_appearance` (`GateAppearance.java`), and
`components/gate-appearance-sync.tsx` keeps it current. A gate already on screen is
redrawn rather than waiting for the next window change.

The same service counts the minutes the reader spends in the Gospel Library
(`GospelStudy.java`, package `org.lds.ldssa`) and keeps today's total per local
day. `GospelStudyPlugin` hands that total to `components/gospel-library-sync.tsx`,
which credits it to the day's study goal as far as the goal still has room — so
reading in the Church's app counts, and no further than the bar.

Without the permission nothing is blocked, and `/focus` says so on its face. The
gate has been compiled and packaged; it still wants a pass on a real device. On
Android 13+, a sideloaded build may first need **Allow restricted settings** in
App info before the service can be switched on.

The **daily reminder** uses `@capacitor/local-notifications`: a browser cannot
deliver a notification while closed, so the settings page says so rather than
offering a switch that would never fire.

System bars and safe areas on Android are handled by the `SystemBars` plugin
(configured in `capacitor.config.ts`), which passes real insets through as
`env(safe-area-inset-*)`.

Native app icons and splash screens are generated from `app/icon.svg` with
[`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets):

```bash
npx @capacitor/assets generate android --assetPath app \
  --iconBackgroundColor "#f7f2e7" --splashBackgroundColor "#f7f2e7"
```

Then regenerate the night and monochrome variants:

```bash
npm run icons:dark
```

The asset generator also rewrites `public/manifest.webmanifest` with PWA icon
paths this project doesn't ship; revert that file with
`git checkout public/manifest.webmanifest`.

## Building a sideloadable APK

Prerequisites: Node 22, JDK 21, and the Android SDK with
`platforms;android-36` + `build-tools;36.0.0`. `npm run bootstrap` provisions
both, or uses ones already installed via `JAVA_HOME` / `ANDROID_HOME`.

```bash
npm run cap:apk
# output: android/app/build/outputs/apk/release/app-release.apk
```

Gradle runs through `scripts/gradle.mjs`, which sets `JAVA_HOME` and
`ANDROID_HOME` and picks `gradlew.bat` on Windows — the same command everywhere.

Without the release key the build still succeeds as
`app-release-unsigned.apk`: `android/app/build.gradle` signs only when both
`android/keystore.properties` and the keystore it names are present.

Signing setup:

- Keystore: `android/keystore/release.keystore` — **back it up**. Without it you
  can never update an installed app.
- Credentials: `android/keystore.properties` (both gitignored).
- `versionCode` and `versionName` in `android/app/build.gradle` are what a local
  build reports; tagged CI builds overwrite both from the tag.

`npm run bootstrap` restores both from the same secrets CI uses —
`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEYSTORE_KEY_ALIAS`, `ANDROID_KEYSTORE_KEY_PASSWORD` — so a new machine
does not need the files copied by hand. Those secrets are write-only on GitHub,
so the password-manager copy is the real one.

### Installing the APK

1. Get `app-release.apk` onto the device: the **Releases** page (no login), the
   **Actions** tab → latest run → *Artifacts* (GitHub login, zipped, 90 days), a
   USB cable, or `python3 -m http.server 8000` on the same Wi-Fi.
2. Open the file in the file manager or browser.
3. When Android blocks it, choose **Settings** → **Allow from this source**, then
   **Install**.
4. Ignore the generic "file can harm your device" warning. Play Protect may offer
   to scan; it is your own build.

**Updates:** CI signs with the same keystore, so a new APK installs over the old
one as long as `versionCode` does not go backwards (tagged builds stamp it from
the tag). Losing the keystore means uninstalling before any update.

### CI and releases

`.github/workflows/android-apk.yml` builds the signed APK on every push to
`main`; download it from the Actions tab. For a permanent link, push a version
tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

That publishes the APK on the Releases page and stamps the tag into the build
(`v1.2.3` → `versionName "1.2.3"`, `versionCode 10203`, `package.json` `"1.2.3"`).
The committed copy of `package.json` is not changed by CI; to move it too:

```bash
npm run version:tag           # newest tag
npm run version:tag v2.1.0    # or the tag about to be cut
```

That writes `package.json` and the two root version fields in
`package-lock.json`; dependency versions are untouched.

### iOS

```bash
npm run ios:build    # macOS only: unsigned simulator .app via xcodebuild
```

The script builds for the simulator with `CODE_SIGNING_ALLOWED=NO` and writes
`ios/App/build/Build/Products/Release-iphonesimulator/App.app`. It verifies the
web bundle, the Swift package, and all plugins fit together; it is not a
sideloadable IPA. A device build means opening `npm run cap:ios` and signing with
your own team. CI runs the same script on `macos-latest`
(`.github/workflows/ios-build.yml`).

## Data

The passage library is generated into `public/data` and shipped with the app so it
works offline:

| Source | Content | Provenance |
| --- | --- | --- |
| [`bcbooks/scriptures-json`](https://github.com/bcbooks/scriptures-json) | Book of Mormon, Doctrine & Covenants, Pearl of Great Price, Old & New Testament (verse-level) | Public domain, 2013 edition |
| [`johnmwood/LDS-Conference-Scraper`](https://github.com/johnmwood/LDS-Conference-Scraper) | General conference talks (split into paragraphs) | Scraped project with no declared license — **verify redistribution rights before publishing** |

**51,083 passages**: 41,995 scripture verses (Old Testament 23,145; New
Testament 7,957; Book of Mormon 6,604; Doctrine & Covenants 3,654; Pearl of Great
Price 635) and 9,088 conference paragraphs from ten conferences (2014–2018).
About **10 MB**, most of it fetched lazily.

`scripts/build-data.mjs` downloads and normalizes both into:

- `public/data/manifest.json` — lightweight index (~14 KB) for filtering and draws
- `public/data/scriptures/<volume>.json` — verse text, lazily loaded
- `public/data/conference/<year>-<month>.json` — talk paragraphs, lazily loaded
- `public/data/search.snapshot` — the MiniSearch index `/search` queries (gzipped;
  the name avoids `.gz` because Android's asset packer gunzips those)
- `public/data/words.json` — the vocabulary the daily puzzle builds from

All of it is **committed**: CI builds with `npm ci` and `cap:sync` and never
regenerates the data, so the repo is what ships. Re-run `npm run build:search`
after changing the index's shape and commit the file it writes.

Nothing depends on the network at runtime: the picker, filters, verse of the day,
reminder, and search all work offline.

### The search index

One document per verse or conference paragraph (51,083), with its citation for an
id, its text searchable, and almost nothing stored. Common function words are
kept out of the index — indexing them measured 19.09 MB JSON / 4.84 MB gzipped
against 11.89 / 2.86 — and are added back at query time from the passage text.
The result is **11.9 MB of JSON, 2.86 MB gzipped**, fetched and inflated once per
session, about 1.4 s to the first result on a desktop browser and ~0.1 s after.

The index carries no passage text. A result's line, and the ranking's reading of
the query, come from the passage library by id, through the same caches the reader
uses.

The build reads its own file back and searches it before finishing
(`verifySnapshot`), because the index and the page each own half of one contract:

```bash
npm run build:search
# 51,083 documents, 11.89 MB → 2.86 MB gzipped, ~13 s
# ok "nephi" → 2723 hits / ok "1 nephi 3" → 126 hits / ok common words → 0 hits
```
