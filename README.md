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
- **Gospel Library deep link** for every passage, built from the official
  `churchofjesuschrist.org/study/...` URL scheme.
- **Light / Dark** themes that defaults to the device preference.
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

External passages open in the in-app browser (`@capacitor/browser`) on native and
in a new tab on the web — see `lib/external.ts`.

Add native app icons and splash screens with
[`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets) using
`app/icon.svg` as the source.

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
components/          UI: logo, theme toggle, filters, passage card, riffling animation
lib/picker.ts        manifest + random-draw engine, Gospel Library URL builder
lib/types.ts         shared types
scripts/build-data.mjs   dataset generator
public/data/         generated passage library
capacitor.config.ts  native shell configuration
```

## Licensing & attribution

Scripture text is public domain. Conference text is included for personal use;
review the source repository before redistributing. All passages link back to the
Church's official Gospel Library.
