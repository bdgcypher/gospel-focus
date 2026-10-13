# Open to Inspiration 📖

A random scripture finder for the _**Standard Works**_ and _**General Conference**_ of
The Church of Jesus Christ of Latter-day Saints.

## Introduction

Growing up, when I needed some inspiration or wanted to pray for guidance from the Lord I would open up my scriptures to a random page and scan through the verses. Many times I would find something that felt especially relevant to my situation. Moments like this would make me feel seen and known by my Savior.

Since then, mobile phones and the internet have widely replaced my use of physical books. The convenience of having any scripture or talk available wherever I go has been a huge blessing but I missed the novelty of the "open to a random page" approach.

_**Open to Inspiration**_ pulls in passages from all LDS standard works and general conference talks and rifles through virtual pages to land on a random passage. The user can then expand it to read a whole chapter (or talk) or jump straight to the passage in the Church's Gospel Library for annotation or further study.

> Not sponsored by or affiliated with The Church of Jesus Christ of Latter-day Saints.

## Features

- **Random passage picker** weighted across every selected source, so longer books
  and conferences show up in proportion to how much scripture they contain.
- **Filters** for each volume of scripture (with per-book toggles) and for each
  general conference, plus one-tap presets (*All* / *Bible* / *LDS Standard Works* /
  *LDS General Conference*).
- **Page rifle animation** as the passage is selected, to capture that feeling of opening a physical book.
- **Expand to the whole chapter** (or the full conference talk) with the selected
  verse highlighted and auto-scrolled into view.
- **Share what you pick** — tap verses (or paragraphs) in the expanded view to
  share just those. The drawn passage comes up already selected, so a quick pick
  can't quietly drop it, and a floating bar follows you down the page — collapse
  the chapter, open the passage in the Gospel Library, share the selection, or
  save a picked set to favorites — so a long chapter never has to be scrolled
  back through. It steps aside again whenever the chapter's own row of controls
  (the same jobs, at the foot of the chapter) comes into view.
- **Favorites, with a backup file.** Star the passage you're reading, or pick
  several verses (or paragraphs) in the expanded chapter — in a row or
  scattered — and save them as **one** favorite, from the card's own star, the
  chapter's row of controls or the floating bar. Its reference names what it
  holds (`1 Nephi 3:7-9`, or `1 Nephi 3:3, 7-9` when the pick is scattered),
  and the favorites page shows each verse on its own numbered line, folding
  past a few behind a *Show all* toggle. The backup CSV keeps the same shape in
  its `passage` cell (`7-9` or `3,7-9`), so a round trip through the file
  restores exactly what was saved. The menu's star fills in as soon as anything
  is saved.
- **Long selections come out as a set of images.** A card is paged up to about a
  screenful each (1080 × ≤2400 px), so a chapter's worth of verses stays
  readable instead of arriving as a 1:11 sliver. The share dialog previews each
  image, and the set can be shared or saved whole — the sheet takes every image
  in one go — or one image at a time.
- **Gospel Library deep link** for every passage, built from the official
  `churchofjesuschrist.org/study/...` URL scheme — on Android the link opens
  directly **in the Gospel Library app** when it's installed.
- **Light / Dark** themes that defaults to the device preference.
- **System bar safe areas** on Android — content is padded clear of the status
  bar (clock/icons) and gesture bar in both themes.
- **Dark-mode iconography** — night-qualified launcher icons plus the official
  Android 13+ themed (monochrome) icon layer.
- **Cross-platform ready** — a static Next.js build wrapped with Capacitor for
  iOS and Android (see below).

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

Other commands:

```bash
npm run build        # static export into ./out (Capacitor webDir)
npm run preview      # serve the exported ./out folder
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build:data   # re-download + rebuild public/data from the sources
```

## Cross-platform (iOS & Android)

The app is configured for **static export** (`output: "export"` in
`next.config.ts`), which is what Capacitor bundles into native shells. Everything
runs client-side, so there are no server actions or API routes to work around.

```bash
# one-time: generate the native projects
npm run cap:add:ios
npm run cap:add:android

# build the web app and copy it into the native projects
npm run cap:sync

# open in Xcode / Android Studio
npm run cap:ios        # needs macOS + Xcode
npm run cap:android    # needs Android Studio + SDK
```

Passage links open in the **Gospel Library app** on Android (via its official
`gospellibrary://content` custom scheme, falling back to the in-app browser
(`@capacitor/browser`) when the app isn't installed), in the in-app browser on
iOS, and in a new tab on the web — see `lib/external.ts`.

Files do not leave the app the way they do on the web. A WebView has no download
manager, no Web Share API and no image clipboard, so on device:

- A **share card** is written into the app cache (`@capacitor/filesystem`) and
  handed to the **system share sheet** (`@capacitor/share`).
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

Add native app icons and splash screens with
[`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) using
`app/icon.svg` as the source:

```bash
npx @capacitor/assets generate android --assetPath app \
  --iconBackgroundColor "#f7f2e7" --splashBackgroundColor "#f7f2e7"
```

### Building a sideloadable APK

Prerequisites: a JDK (17+, 21 recommended) and the Android SDK with
`platforms;android-36` + `build-tools;36.0.0`. Android Studio installs both, or
you can keep a portable toolchain in a gitignored directory (e.g. `.toolchain/`)
and point `android/local.properties` at it with `sdk.dir=...`.

```bash
npm run cap:apk      # = build + cap sync + gradlew assembleRelease
# output: android/app/build/outputs/apk/release/app-release.apk
```

(`gradlew.bat` instead of `./gradlew` on Windows.)

The APK is release-signed, targets API 36, and has `minSdkVersion 24`
(Android 7.0+). To sideload: copy it to the device, allow *Install unknown apps*
for your file manager or browser, open the file, and install.

Signing setup (already configured in `android/app/build.gradle`):

- Keystore: `android/keystore/release.keystore` — **back it up**; without it you
  can never push an update to an installed app.
- Credentials: `android/keystore.properties` (both are gitignored).
- Bump `versionCode` in `android/app/build.gradle` for every release.

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

## Data

The passage library is generated into `public/data` and shipped with the app so it
works offline (important for the native builds):

| Source | Content | Provenance |
| --- | --- | --- |
| [`bcbooks/scriptures-json`](https://github.com/bcbooks/scriptures-json) | Book of Mormon, Doctrine & Covenants, Pearl of Great Price, Old & New Testament (verse-level) | Public domain, 2013 edition |
| [`johnmwood/LDS-Conference-Scraper`](https://github.com/johnmwood/LDS-Conference-Scraper) | General conference talks (split into paragraphs) | Scraped project with no declared license — **verify redistribution rights before publishing** |

`scripts/build-data.mjs` downloads and normalizes both into a compact format and
writes:

- `public/data/manifest.json` — lightweight index used for filtering and weighted draws
- `public/data/scriptures/<volume>.json` — verse text, loaded lazily per volume
- `public/data/conference/<year>-<month>.json` — talk paragraphs, loaded lazily

Data is loaded lazily and cached, so the large volumes (Old Testament ≈ 3 MB) are
only fetched when a draw actually lands there.

## Project structure

```
app/                 layout, theme provider, home route
components/          UI: logo, filters, passage card, riffling animation, settings
lib/picker.ts        manifest + random-draw engine, Gospel Library URL builder
lib/native-files.ts  native sharing / file picking (Capacitor plugins)
lib/types.ts         shared types
scripts/build-data.mjs   dataset generator
public/data/         generated passage library
capacitor.config.ts  native shell configuration
```

## Licensing & attribution

Scripture text is public domain. Conference text is included for personal use;
review the source repository before redistributing. All passages link back to the
Church's official Gospel Library.
