"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Glyph } from "./glyph";
import { OpenBookLogo } from "./logo";
import { FilterPanel } from "./filter-panel";
import { RifflingPages } from "./riffling-pages";
import { PassageCard } from "./passage-card";
import { AppShell } from "./app-shell";
import { BackLink } from "./back-link";
import { dayKey } from "@/lib/daily";
import {
  NoSourcesError,
  citationHref,
  loadManifest,
  pickDailyPassage,
  pickPassage,
  summarize,
} from "@/lib/picker";
import { setPreference, usePreferences } from "@/lib/preferences";
import { recordPassage } from "@/lib/study";
import type { Filters, Manifest, Passage } from "@/lib/types";

/** How long the book's sheets turn before it lands on the draw. */
const RIFFLE_MS = 2800;
/**
 * How long the final page takes to turn slowly onto the draw. The slowest
 * turn of the whole sequence — the riffle's last flips stay quicker, so the
 * reveal reads as the book coming to rest.
 */
const SETTLE_MS = 1800;
/** How long the settled page rests before the card rises into its place. */
const LAND_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The verse the page's strapline quotes, as the reader's address for it.
 *
 * One constant rather than two copies: the line's words and its link have to
 * agree, and this is the only place that says which verse the invitation on
 * this page comes from.
 */
const STRAPLINE = {
  kind: "scripture",
  book: "Doctrine and Covenants",
  chapter: "42",
  section: 61,
} as const;

/**
 * The widths that get the sidebar layout, matching Tailwind's `md`. A sidebar
 * needs the room: below this the filter panel stays inline above the book.
 */
const WIDE_QUERY = "(min-width: 768px)";
const subscribeToViewport = (onChange: () => void) => {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const getIsWide = () => window.matchMedia(WIDE_QUERY).matches;
/** Phones are what get prerendered, so that is the server's answer. */
const getIsWideOnServer = () => false;

export function PassagePicker() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The filters are remembered between visits, not just for the session: the
  // daily reminder draws from whatever is chosen here, so a fresh launch has to
  // restore the same set or the reminder and the app would disagree.
  const prefs = usePreferences();
  const filters = prefs.filters;
  const setFilters = useCallback((next: Filters) => setPreference("filters", next), []);
  const [phase, setPhase] = useState<"idle" | "rifling" | "result">("idle");
  /**
   * Where the passage on the page came from, which the heading names: a random
   * draw, or the day's passage. Before anything is drawn the page is about to
   * draw, so it reads as random.
   */
  const [origin, setOrigin] = useState<"random" | "daily">("random");
  const [passage, setPassage] = useState<Passage | null>(null);
  /** The passage the book has landed on, shown on the page before it opens up. */
  const [landedPassage, setLandedPassage] = useState<Passage | null>(null);
  const [drawKey, setDrawKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** null until the Filters button is used: until then the layout decides. */
  const [showFilters, setShowFilters] = useState<boolean | null>(null);
  /** Feeding back that a reduced-motion draw is in flight, without the book. */
  const [loading, setLoading] = useState(false);
  const riflingRef = useRef(false);
  /**
   * Which passage is the current one, as a number that goes up every time one
   * is asked for. A draw takes seconds, so by the time it resolves the reader
   * may have asked for something else. The slow step then finds the count
   * moved and drops its own passage instead of landing on top of the new one.
   */
  const shownRef = useRef(0);
  /** The launcher deep link is handled once per visit, never on every render. */
  const actionHandled = useRef(false);

  // On tablets and desktops the filters are a sidebar beside the book, open by
  // default; on narrower screens they stay behind the Filters button, so they
  // start shut.
  const wide = useSyncExternalStore(subscribeToViewport, getIsWide, getIsWideOnServer);
  const filtersOpen = showFilters ?? wide;

  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const summary = useMemo(
    () => (manifest ? summarize(manifest, filters) : null),
    [manifest, filters]
  );
  const nothingSelected = summary ? !summary.hasScriptures && !summary.hasConference : false;

  /**
   * Draw a passage. Given a day, it draws that day's passage — the one the
   * reminder quoted — instead of a random one.
   */
  const draw = useCallback(async (day?: string) => {
    if (!manifest || riflingRef.current) return;
    riflingRef.current = true;
    // With reduced motion the book is never mounted at all — not even for the
    // moment the draw takes to resolve.
    const skipRiffle = prefs.reduceMotion;
    setError(null);
    // On a phone the filter panel sits above the book, so close it to give the
    // riffle the full width; the sidebar leaves the book alone.
    if (!wide) setShowFilters(false);

    if (skipRiffle) {
      setLoading(true);
    } else {
      setPhase("rifling");
      setLandedPassage(null);
    }

    const started = performance.now();
    const token = ++shownRef.current;
    try {
      const next = day
        ? await pickDailyPassage(manifest, filters, day)
        : await pickPassage(manifest, filters);
      if (skipRiffle) {
        // Superseded while the library was opening: this draw is no longer what
        // the reader is looking at, so it does not land and is not counted.
        if (shownRef.current !== token) return;
        // A draw is a passage read, whether it was chosen at random or pinned
        // to the day — the count on the stats page is of draws that landed.
        recordPassage();
        setOrigin(day ? "daily" : "random");
        // Straight onto the passage: no riffle, no settle, no landing page.
        setLandedPassage(next);
        setPassage(next);
        setDrawKey((k) => k + 1);
        setPhase("result");
        return;
      }
      const untilLand = RIFFLE_MS - (performance.now() - started);
      if (untilLand > 0) await sleep(untilLand);
      // Checked again on the far side of the turn, which is the long wait.
      if (shownRef.current !== token) return;
      recordPassage();
      setOrigin(day ? "daily" : "random");
      setLandedPassage(next);
      setPassage(next);
      setDrawKey((k) => k + 1);
      // Let the last page turn onto the draw and settle before it opens up.
      await sleep(SETTLE_MS + LAND_MS);
      setPhase("result");
    } catch (e: unknown) {
      if (shownRef.current !== token) return;
      const message =
        e instanceof NoSourcesError
          ? "Pick at least one book or conference to draw from."
          : e instanceof Error
            ? e.message
            : "Something went wrong opening the book.";
      setError(message);
      setPhase(passage ? "result" : "idle");
    } finally {
      if (skipRiffle) setLoading(false);
      riflingRef.current = false;
    }
  }, [manifest, filters, passage, wide, prefs.reduceMotion]);

  // The home-screen widgets open the app straight into a draw, with the action
  // in the URL (`?action=autoriffle` for a fresh draw, `?action=daily` for the
  // day's passage). Read from `window.location` rather than next/navigation's
  // hook: this is a static export, and the hook would drag the whole page out of
  // the prerender just to look at a query string once, on the client.
  useEffect(() => {
    if (!manifest || actionHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (action !== "autoriffle" && action !== "daily") return;
    // Drop the parameter, so reloading — or coming back to the tab — doesn't
    // throw another draw at the reader.
    window.history.replaceState(null, "", window.location.pathname);
    // Deferred by a tick rather than called here: a draw sets state the moment
    // it starts, and doing that from an effect body cascades straight into the
    // first render. The reader sees the settled idle page for one frame, then
    // the book opens. The flag moves in here with it, so if this run is
    // superseded before the tick, the next one still picks the action up.
    const id = window.setTimeout(() => {
      actionHandled.current = true;
      void draw(action === "daily" ? dayKey() : undefined);
    }, 0);
    return () => window.clearTimeout(id);
  }, [manifest, draw]);

  // Space / Enter draws another passage when the app is focused on the page body.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "BUTTON", "A"].includes(el.tagName)) return;
      e.preventDefault();
      void draw();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draw]);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:max-w-5xl sm:px-6 sm:py-10">
        {loadError ? (
          <div className="rounded-3xl border border-border bg-surface p-6 text-sm text-foreground">
            <p className="font-semibold">Couldn&apos;t load the passage library.</p>
            <p className="mt-2 text-muted">{loadError}</p>
            <p className="mt-2 text-muted">
              Try rebuilding the data with <code className="font-mono">npm run build:data</code>.
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row">
            {/* No gap here: the sidebar's spacing rides its animated margin, so
                nothing snaps when the element finally unmounts. */}
            {/* items-stretch (the default) lets the main column grow to the
                sidebar's height, so the idle placeholder can fill it. */}
            {/* Filters as a sidebar from tablet width up, beside the book. The
                Filters row below is the only way to pack it away — and it slides
                the sidebar open and closed rather than popping it in and out. */}
            {/* The sidebar stays mounted once it has been shown, collapsing to
                zero width instead of unmounting — so the row (and the idle
                placeholder below it) holds its height and nothing snaps
                vertically when the filters are packed away. */}
            {manifest && (
              <motion.aside
                key="filters-sidebar"
                initial={false}
                animate={
                  filtersOpen
                    ? { width: "auto", opacity: 1, marginRight: 32, visibility: "visible" }
                    : { width: 0, opacity: 0, marginRight: 0, visibility: "hidden" }
                }
                transition={{
                  duration: 0.3,
                  ease: [0.22, 1, 0.36, 1],
                  // Visibility is not interpolable: flip it only once the slide
                  // has finished (or at once when opening), so the panel is
                  // never focusable while invisible.
                  visibility: { delay: filtersOpen ? 0 : 0.3, duration: 0 },
                }}
                className="hidden shrink-0 md:sticky md:top-24 md:block md:max-h-[calc(100vh-8rem)] md:overflow-x-hidden md:overflow-y-auto"
              >
                {/* Holds the panel's real width (and the scrollbar clearance),
                    so the slide never reflows the panel's own content. */}
                <div className="w-80 pr-4 lg:w-96">
                  <FilterPanel manifest={manifest} filters={filters} onChange={setFilters} />
                </div>
              </motion.aside>
            )}

            <div className="min-w-0 flex-1 md:flex md:flex-col">
              <section className="text-center sm:text-left">
                {/* The full column width, so the draw button below spans it. */}
                <div className="mx-auto w-full">
                  {/* The heading says which passage is on the page, and the way
                      back is the line above it — the shape every page header in
                      the app takes, as components/feature-page.tsx sets it out.
                      The drawn tile that used to open the row was a second mark
                      for the page the heading already names.

                      This section centres itself on a phone, so the heading
                      asks for the left edge by name; without it the stacked
                      title would drift to the middle of the column while the
                      arrow stayed left. The arrow's box is drawn 10px left and
                      8px up so its drawing, not its invisible edge, is what sits
                      at the top left corner, with 24px of air between it and
                      the heading. */}
                  <div className="-ml-2.5 -mt-2 flex justify-start">
                    <BackLink />
                  </div>
                  <h2 className="mt-6 text-left font-serif text-2xl font-semibold text-foreground">
                    {origin === "daily" ? "Daily Scripture" : "Random Scripture"}
                  </h2>

                  {/* On its own line under the heading, not tucked beneath the
                      title: the heading row is the page's title bar, and this is
                      the line that introduces it.

                      A verse, set the way the app's other verse straplines are:
                      the words in the serif italic they are read in, the
                      citation after them and kept whole — and, like the ones on
                      the study hub and the memorize page, a way into the verse
                      it names rather than a label. It goes to the reader, which is
                      where a passage is read: the citation rides in the query
                      string and /read resolves it, opening the chapter at the
                      verse instead of drawing it here. */}
                  <p className="mt-2 text-left text-sm text-muted">
                    <span className="font-serif italic text-foreground/85">
                      &ldquo;If thou shalt ask, thou shalt receive revelation upon revelation…&rdquo;
                    </span>{" "}
                    <span className="whitespace-nowrap font-semibold">
                      —{" "}
                      <Link
                        href={citationHref(STRAPLINE)}
                        className="text-accent-strong hover:underline"
                      >
                        Doctrine and Covenants 42:61
                      </Link>
                    </span>
                  </p>

                  <div className="mt-6 flex flex-col items-center gap-3 sm:items-start">
                    <button
                      type="button"
                      onClick={() => void draw()}
                      disabled={!manifest || phase === "rifling" || loading || nothingSelected}
                      // Full width at every size.
                      className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-cta px-7 py-3.5 text-base font-semibold text-cta-contrast shadow-lg shadow-cta/20 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {/* The app's own mark belongs in the header: on the one
                          button whose job is to open another passage, the
                          standard open-book glyph says what the press does
                          rather than whose app it is. It takes the button's own
                          ink rather than a wrapper's — the mark and the label
                          are one control, so they have to be one colour (on the
                          playful skin's blue they are white, on the paper
                          skin's gold they are the deep accent ink) — and it sits
                          in the row as a flex item, so the two share a midline
                          instead of the glyph riding a line box of its own. */}
                      <Glyph name="book" className="h-5 w-5" />
                      {phase === "rifling" || loading ? "Opening…" : "New passage"}
                    </button>

                    {/* Stays put whatever the layout: it carries the passage
                        count, opens and closes the filters, and says which way
                        the chevron is pointing. */}
                    <button
                      type="button"
                      onClick={() => setShowFilters(!filtersOpen)}
                      aria-expanded={filtersOpen}
                      className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent-strong"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M6 12h12M10 18h4" />
                      </svg>
                      {filtersOpen ? "Hide filters" : "Filters"}
                      {summary && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                          {new Intl.NumberFormat("en-US").format(summary.verses + summary.paragraphs)} passages
                        </span>
                      )}
                      {/* On a phone this row folds the inline panel, so the caret
                          flips up and down. Beside the sidebar it slides left and
                          right instead: towards the panel while it is open. */}
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-3.5 w-3.5 transition-transform md:hidden ${filtersOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                      <svg
                        viewBox="0 0 24 24"
                        className={`hidden h-3.5 w-3.5 transition-transform md:inline-block ${filtersOpen ? "rotate-90" : "-rotate-90"}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>
                </div>

                {nothingSelected && (
                  <p className="mt-3 text-sm text-accent-strong">
                    Pick at least one book or conference below.
                  </p>
                )}
              </section>

              {/* Below md only: the sidebar stands in from there upwards. */}
              <AnimatePresence initial={false}>
                {filtersOpen && manifest && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden md:hidden"
                  >
                    <div className="pt-6">
                      <FilterPanel manifest={manifest} filters={filters} onChange={setFilters} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative mt-8 md:flex md:flex-1 md:flex-col">
                {error && phase !== "rifling" && (
                  <p className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-strong">
                    {error}
                  </p>
                )}

                {/* The book stays mounted (popped out of the layout) while the
                    landed page settles away and the card rises into its place. */}
                <AnimatePresence initial={false} mode="popLayout">
                  {phase === "rifling" && (
                    <motion.div
                      key="opening-book"
                      // Nothing in the book is interactive, and while it fades out
                      // it is popped out of the layout over the incoming card —
                      // so keep it from swallowing taps meant for the card.
                      className="pointer-events-none"
                      exit={{ opacity: 0, transition: { duration: 0.32, delay: 0.08 } }}
                    >
                      <RifflingPages durationMs={RIFFLE_MS} settleMs={SETTLE_MS} passage={landedPassage} />
                    </motion.div>
                  )}

                  {phase === "result" && passage && (
                    <PassageCard key={drawKey} passage={passage} drawKey={drawKey} />
                  )}
                </AnimatePresence>

                {phase === "idle" && !error && (
                  <div className="grid h-60 w-full place-items-center rounded-2xl border border-dashed border-border text-center md:h-auto md:min-h-60 md:flex-1">
                    <div className="px-6">
                      <span className="mx-auto block text-accent/50">
                        <OpenBookLogo className="mx-auto h-10 w-10" />
                      </span>
                      <p className="mt-3 text-sm font-medium text-muted">Open a passage</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
