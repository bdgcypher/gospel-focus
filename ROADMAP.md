# Roadmap — Open to Inspiration

A plan for growing the random-passage picker into a daily **study tool and focus
hub**, with a special eye on ADHD users: short sessions, immediate feedback,
visible progress, and a low barrier to just *start*.

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
- Favorites/history, streaks, share-as-image, and notes.

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

## Current state (v1.0.25)

| Area | Status |
| --- | --- |
| Random passage picker | ✅ Weighted, filterable by volume/book/conference, presets |
| Page-riffle animation | ✅ Single continuous deceleration into the draw |
| Chapter/talk expansion | ✅ Highlighted verse, auto-scrolled |
| Gospel Library deep links | ✅ Opens the Gospel Library app on Android |
| Data | 51,083 passages (41,995 public-domain scripture verses + 9,088 conference paragraphs, 2014–2018), 9.7 MB, lazily loaded |
| Platforms | Android APK (sideload, release-signed), iOS scaffolded, static web |
| Persistence | ❌ None — every session starts blank |
| Backend | ❌ None |

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

## Feature backlog

Effort estimates assume **one developer with AI assistance**, and are in working
days. "Free" / "Paid" marks the intended side of the paywall.

### Tier 0 — Foundations (do these first; unblock everything else)

These are quick, mostly free, and are the substrate the rest of the roadmap
depends on. Together they are roughly **one week**.

| Feature | Effort | Why it's first | Notes |
| --- | --- | --- | --- |
| **History & Favorites** | 2–3 d | The app currently forgets everything. Saves recent draws and starred passages; makes the app feel finished. | New `lib/storage.ts` over `@capacitor/preferences` (native) with a `localStorage` fallback (web). Store lightweight refs (volume id, book, chapter, verse) — never duplicate text. |
| **Daily streak tracker** | 1–2 d | Retention. A visible progress chain is one of the strongest ADHD-friendly nudges. | Pure local state: count consecutive days with an open. No account needed. Ties into notifications and the widget. |
| **Share-as-image** | 2–3 d | The growth loop. The riffle animation is share-worthy; a verse card is even more so. | Render the passage to a `<canvas>` (styled card: verse, reference, app name/QR), then `navigator.share()` with a file, falling back to a download link. Cheese it with the existing serif theme. |
| **Daily passage notification** | 2–3 d | The single biggest retention lever for a daily-use app. | `@capacitor/local-notifications`; the draw is computable offline, so schedule it locally — no server. Offer "notify me at [time]" in settings. |
| **Settings screen** | 1–2 d | Home for the above (notification time, streak display, clear data, restore purchases). | Simple route/sheet; no new architectural pattern. |

### Tier 1 — Study tools

These turn the picker into something worth keeping open. **~2 weeks total.**
Rows not on your paywall list are marked **your call**; the recommendation is to
keep them free (they strengthen the core and cost nothing to serve).

| Feature | Effort | Paywall | Notes |
| --- | --- | --- | --- |
| **Flashcards for memorization** | 3–5 d | **Paid** (#6) | Generate cards from verses at build time (front: first letters / cloze; back: full verse + reference). Spaced-repetition scheduling (SM-2 is ~30 lines) on top of the existing favorites/history storage. Excellent ADHD fit — short, rewarding sessions. |
| **Search** | 4–6 d | Your call — recommend free | Build a compact [MiniSearch](https://github.com/lucaong/minisearch) index at build time via `scripts/build-data.mjs` (~1–2 MB); a raw index over 9.7 MB of text is too heavy for the APK. Search across all volumes + conference. Nothing else in this niche searches well — strong differentiator. |
| **Reading plans** | 3–5 d | Your call — recommend free | "30 days through the Book of Mormon", topical plans, etc. Pure build-time JSON; `lib/picker.ts` already supports scoped weighted draws, so this is mostly content + a plan-tracking UI. |
| **Highlights & notes** | 2–3 d | Free | Store per-verse notes locally; relates to favorites. Small effort, big "study tool" feel. |

### Tier 2 — AI features (differentiators; need a small proxy)

These are the "wow" features and the clearest reason a subscription could exist.
All three share one LLM integration, so build the plumbing once. All three are
**paid** (your list #3–#5).

| Feature | Effort | Paywall | Notes |
| --- | --- | --- | --- |
| **Liken the scriptures generator** | 3–4 d (+1–2 d shared plumbing) | **Paid** (#5) | Takes the current passage and suggests ways it could apply to modern life. On-demand (one short request), cached per passage. Most on-brand feature in the whole list. |
| **Convert verses to modern language** | 3–5 d | **Paid** (#3) | Plain-language paraphrase. Either on-demand (proxy) or pre-generate a curated set at build time. Include the original text alongside — never replace it. |
| **Scripture story summarizer** | 3–4 d | **Paid** (#4) | Summarize a chapter/talk into a few sentences. Build-time generation is feasible for popular chapters; on-demand otherwise. Story segmentation (stories vs. verses) is the tricky part. |

**Plumbing note:** the app is a *static export*, so there are no API routes to
hold a key. Options, in order of preference: (1) a tiny edge function
(Cloudflare Worker / Vercel function) that holds the key and rate-limits —
adds a small server, but it's ~50 lines; (2) build-time generation so runtime
needs no key at all; (3) bring-your-own-key, as a last resort. Gate A applies:
do **not** run conference text through a third-party LLM without rights.

### Tier 3 — Games (engagement; bigger swings)

Games are the most speculative items — great for ADHD engagement, but they are
products in their own right, and none of them are "quick adds". Sequence from
cheapest to most expensive. All **paid** (your list #1), best sold as a one-time
"game pack".

| Feature | Effort | Notes |
| --- | --- | --- |
| **Word-search** | 4–6 d | Generated at build time from a passage's significant words (stopword list + verse vocabulary). Pure canvas/DOM grid; no new dependencies. The natural first game. |
| **Crossword** | 8–12 d | Much harder: clue quality is the whole game. Verse-reference clues ("Nephi's father") can be auto-drafted but need curation. Ship after word-search proves the pattern. |
| **Fishing for scriptures** | 5–8 d | Light arcade loop (cast, catch a reference, reveal the verse). Needs simple art and a game loop; consider a tiny canvas engine. |
| **Shepherd search / grow the fold** | 6–10 d | Hidden-object or collection-collector. Value is mostly in the metaphor + art. |
| **Endure to the end trail** | 15–25 d | A Subway-Surfer-style endless runner is a real game: physics, art, level design, tuning, mobile perf. Only attempt if games prove to be a retention driver. |

Games should award streaks/points that feed the streak tracker, not replace it.

### Tier 4 — Platform & focus features

| Feature | Effort | Notes |
| --- | --- | --- |
| **Android home-screen widget** | 5–8 d | **Free.** Native Kotlin in the existing `android/` project (there is precedent: the `OpenUrlPlugin.java` bridge). Shows the daily verse; tapping opens the app. **Highest daily visibility of anything on this list.** One widget beats ten features. |
| **Scripture story coloring book** | 10–20 d | **Paid** (#2). The bottleneck is **art, not code**: you need licensed/commissioned line-art of scripture stories. Code (canvas fill, undo, save/share) is ~4–6 days once the illustrations exist. |
| **Lock apps / social media until prayer or study is done** | 10–20 d | **Paid** (#7), and the strongest ADHD differentiator — likely the headline of the paid tier. Android: `UsageStatsManager` + an accessibility service or overlay to block chosen apps; only unlockable after a completed prayer/study session. iOS: the Screen Time / FamilyControls APIs (entitlement request; significant friction). **Android-first.** Sensitive permissions raise store-review risk — a strong argument for the web+Stripe / sideload path over Play for this one. |

---

## Monetization plan

Three tiers: **free**, a **premium** tier that includes every paid feature, and
**one-time packs** for buying individual features a la carte.

### The three tiers

| Tier | Billing | What's inside |
| --- | --- | --- |
| **Free** | none | The whole reading experience (picker, riffle, filters, expansion, links, **all passage text incl. conference**), the daily habit (favorites/history, notes, streaks, daily notification, share-as-image), the Android widget, and small taste samples of paid features. |
| **Premium ("Inspiration Plus")** | subscription (annual + monthly) | Every paid feature — games, coloring, flashcards, the Focus app-lock, and a fair monthly AI allowance. The "everything, and future releases" tier. |
| **One-time packs** | single purchase each | Game pack, coloring packs, memorization pack, Focus unlock, and AI credit packs. |

### Where each feature lands, and why

| Feature | Cost to serve | Standalone appeal | Placement | Rationale |
| --- | --- | --- | --- | --- |
| Mini games (all 5) | None | High | **Game pack** (one-time) + Premium | No ongoing cost, so there's no honest reason to rent it; games are a natural buy-once. Bundling them still makes Premium look rich. |
| Coloring book | None after art | High (content packs) | **Coloring packs** (one-time) + Premium | New art sets are ideal a-la-carte content — sell themed packs. |
| Flashcards | None | Medium | **Memorization pack** (one-time) + Premium | Offline and self-contained; a clean one-time purchase. |
| App/social lock | None (native) | **Highest** | **Focus unlock** (one-time, premium-priced) + Premium headline | The highest-intent single feature — many ADHD users want *only* this. Forcing a subscription loses those sales; price the standalone high enough that Premium still wins on value. |
| Liken generator | **Per use** | High | Premium (monthly allowance) + **AI credit packs** | Recurring cost → never unlimited one-time. Credits are the honest a-la-carte path. |
| Modern-language conversion | **Per use** | Medium | Premium + AI credits | Same. |
| Scripture summarizer | **Per use** | Medium | Premium + AI credits | Same. |
| Search | None | Medium | **Free** | Strengthens the core and costs nothing — a growth lever, not a paywall. |
| Reading plans | None | Medium | **Free** | Same; also showcases the picker. |
| Highlights & notes | None | Low | **Free** | Small, expected, keeps notes beside favorites. |

This fully honors your list: features #1–#7 are all monetized somewhere — in a
pack, in Premium, or both — and nothing else is added to the paid set.

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
one-line pitch in the relevant surface — never a dead end.

### Entitlements to model

This mixes subscriptions and one-time purchases, so track **owned packs** (game,
coloring, memorization, Focus) separately from **Premium active**, and have
"restore" re-verify both. Mechanically that's a small local entitlement record:
Stripe checkout on the web issues a license key and the app verifies it locally —
the fastest path to revenue, and it sidesteps Gate B until you publish to Google
Play.

---

## Recommended build order

1. **Foundations** (Tier 0) — history/favorites, streaks, share-as-image, daily
   notification, settings. *~1 week. Free. Unblocks everything.*
2. **Widget** — highest visibility per hour of work. *5–8 d, native.*
3. **Stripe unlock + entitlement plumbing** — so paid work has somewhere to land.
   *3–4 d.*
4. **Study tools** — flashcards first (pure offline, high ADHD value), then
   search and reading plans (recommended free). *~2 weeks.*
5. **Shared LLM plumbing + Liken generator** — the flagship AI feature; ship it
   alone and see if people pay for it. *~1 week.*
6. **Remaining AI** — modern language, summarizer. *~1.5 weeks.*
7. **Games** — word-search first; stop if retention doesn't move. *4–6 d each.*
8. **Coloring book, app lock** — largest, most speculative; do them once paying
   users exist to justify the art and native work.

---

## What you do **not** need yet

- A server (excepting the optional ~50-line LLM proxy).
- A designer — the existing serif/paper aesthetic is strong and consistent.
- A data-pipeline rewrite — `scripts/build-data.mjs` extends cleanly for search
  indexes, plans, and flashcard decks.
- Accounts or sync — local-only is sufficient for every Tier 0–2 feature.

## Resources to line up (when the time comes)

| Resource | When | Rough cost |
| --- | --- | --- |
| Stripe account | Phase 1 unlock | Free until revenue |
| Play Console account | Only if going to Play | $25 one-time |
| Privacy policy page | Required by Play; good practice anyway | Free to write |
| LLM API key + edge proxy | Tier 2 AI features | Usage-based; small at low volume |
| Line art for coloring book | Tier 4 | Commission or license — the real cost |
| Apple Developer account | Only if iOS ships (esp. app lock) | $99/yr |

## Open risks

- **Licensing (Gate A)** — must be resolved before anything paid or on Play.
- **LLM output quality** — AI paraphrases/application suggestions need a clear
  "AI-generated, not doctrine" disclaimer and a report/feedback path.
- **Games scope creep** — the endless runner especially; treat games as
  experiments with a kill criterion (retention delta), not commitments.
- **Store permissions** — the app lock feature is the most likely to draw review
  scrutiny; plan for it to be sideload/web-first.
