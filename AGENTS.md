<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Gospel Focus

Gospel Focus is an offline-first scripture study app: a Next.js static export
wrapped by Capacitor, shipping as a signed Android APK. Read
[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) before starting. `README.md` is the
public page; `CONTRIBUTING.md` covers setup, builds, and data. `lib/features.ts`
is the catalog every destination and its status come from.

## Scope

- **Build only what was asked.** The current milestone is validating the Focus
  Lock on a real device, then Android home-screen widgets. Everything else in
  PROJECT_OVERVIEW under *Potential features* is not scheduled: do not start one,
  scaffold it, or add a placeholder page for it.
- **No backend, accounts, sync, telemetry, analytics, or third-party runtime
  network calls** until the accounts milestone is explicitly requested. The only
  thing that leaves the app is a Gospel Library link the reader taps.
- **The free boundary is fixed.** Reading, the daily habit, Focus Lock, widgets,
  and every game already shipped are free forever. Never gate, remove, or
  degrade an existing free feature. Paid means content packs (ready-made decks,
  study quizzes, coloring) and, later, AI.
- **Don't refactor, rename, or "modernise" beyond the task.** Leave the Next.js,
  React, and Capacitor versions alone unless the task is an upgrade.

## Ask first

- Any change to colour, icons, emoji, type, spacing, motion, layout, or another
  design choice beyond what the task strictly requires.
- Adding haptics to a new interaction — ask when it is relevant.
- Rewriting user-facing copy beyond simple, plain wording. Short copy is welcome;
  do not add a paragraph, an extra subheading, or an explanation where a sentence
  will do.
- Any change that would gate something currently free.

## Style

- Match the file you are in. Function components, Tailwind utilities, and tokens
  from `app/globals.css`. **No raw hex values in components**; a new colour needs a token in all
  four palettes (focused/playful × light/dark), and every surface must work in
  all four.
- Comments explain *why*, in a sentence or two. Do not narrate the code, add
  section banners, or write an essay above a small function.
- Copy is plain, warm, second person, sentence case. No hype, no shame, no dead
  ends.
- Accessibility is part of done: semantic controls, labels, visible focus,
  reduced-motion paths, and touch targets around 44px.
- Keep stores versioned and validated (`lib/*`), and preserve existing records.
  Add a key or a migration rather than changing what a stored value means.
- Prefer the existing dependency set. Add a package only when it removes more
  code than it adds, and never for something the platform or an existing module
  already does.

## Verification

A change is done when all four hold, in proportion to its risk:

1. `npm run typecheck`, `npm run lint`, `npm run build`.
2. The behavior is exercised in the built app — serve `out/` and drive it in
   Chromium, including the Capacitor bridge for native paths. A green build is
   not proof a feature works.
3. Logic you touch has committed tests. **There is no test suite yet**: set up
   Vitest + React Testing Library with the first change that needs it, wire
   `npm test`, and keep it green.
4. Visual changes are checked at phone and desktop width, in focused and playful,
   light and dark, with reduced motion.

Never skip a check, weaken an assertion, add a lint/type suppression, or report an
unrun check as passing. Fix the cause.

## Native

Android ships; iOS compiles for the simulator only.

- For native work, build the APK and give Benjamin exact steps to check on his
  phone, **and** test what you can on an Android emulator yourself.
- Add only the permissions the feature actually uses, declare them in the
  manifest, and explain them in the app before requesting them.
- Do not change `applicationId`, signing config, or the keystore.
- Keep `npx cap sync ios` and `npm run ios:build` working (the latter on macOS).

## Docs

- `lib/features.ts` and PROJECT_OVERVIEW.md change with any feature.
- README.md changes when a reader would notice. CONTRIBUTING.md changes when a
  script, prerequisite, or build step does.
- Remove a catalog entry when a feature is not offered; do not leave a dead
  destination in the nav or a placeholder for something unscheduled.
- Keep README quiet about pricing and the paid tier until checkout exists. A
  single line that everything is free today is enough; the plan belongs in
  PROJECT_OVERVIEW.md.

## Git and releases

- **Commit, tag, or publish only when asked.** Leave the tree clean and the work
  verified otherwise.
- Author every commit as **Benjamin Goddard**. No agent attribution, no
  `Co-Authored-By`, no "Generated with" footer.
- Never force-push, rewrite history, or commit secrets (`android/keystore/`,
  `android/keystore.properties`, `android/local.properties`, `.env*`).
- Never bump the version by hand: tagged builds stamp it, and `npm run
  version:tag` moves the committed copy.
- A release is an explicit request. Don't tag or publish on your own.
