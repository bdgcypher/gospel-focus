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
import { StreakBadge } from "./streak-badge";
import { dayKey } from "@/lib/daily";
import {
  NoSourcesError,
  citationHref,
  loadManifest,
  pickDailyPassage,
  pickPassage,
  resolveCitation,
  summarize,
} from "@/lib/picker";
import { setPreference, usePreferences } from "@/lib/preferences";
import { recordPassage } from "@/lib/study";
import type { SearchCitation as Citation } from "@/lib/search";
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
 * The passage named by a `?action=cite` URL, as the search page writes it.
 *
 * Returns null rather than a half-filled citation when the query string is
 * incomplete, so a malformed link lands on the ordinary idle page instead of an
 * error the reader can do nothing about.
 */
function readCitation(params: URLSearchParams): Citation | null {
  const kind = params.get("kind");
  const book = params.get("book");
  const chapter = params.get("chapter");
  const section = Number(params.get("section"));

  if (kind !== "scripture" && kind !== "conference") return null;
  if (!book || !chapter || !Number.isInteger(section) || section < 1) return null;

  return { kind, book, chapter, section, conferenceId: params.get("session") ?? undefined };
}

/**
 * The verse the page's strapline quotes, as a citation.
 *
 * One constant rather than two copies: the line's link and the passage the
 * link opens have to agree, and this is the only place that says which verse
 * the invitation on this page comes from.
 */
const STRAPLINE: Citation = {
  kind: "scripture",
  book: "Doctrine and Covenants",
  chapter: "42",
  section: 61,
};

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

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5V6m8-2.5V6" />
    </svg>
  );
}

export function InspirationApp() {
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
   * draw, the day's passage, or one named by a link. Before anything is drawn
   * the page is about to draw, so it reads as random.
   */
  const [origin, setOrigin] = useState<"random" | "daily" | "cited">("random");
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
   * may have asked for something else — a citation from the strapline link can
   * arrive while the book is still turning. The slow step then finds the count
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
      // Checked again on the far side of the turn, which is the long wait: a
      // citation asked for while the pages were still turning wins.
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

  /**
   * Show a passage that was named rather than drawn.
   *
   * No riffle: the reader already knows which verse they asked for, so turning
   * pages at them would be theatre. It is also not counted as a passage read —
   * that number on the stats page is of draws that landed (see `draw` above) —
   * though the time spent reading it counts like any other, because the study
   * timer follows the page rather than the draw.
   */
  const showCitation = useCallback(async (citation: Citation) => {
    // Takes over from anything already in flight — a draw the reader has
    // overtaken with this click, or an earlier citation still resolving.
    const token = ++shownRef.current;
    setError(null);
    try {
      const next = await resolveCitation(
        citation.kind,
        citation.book,
        citation.chapter,
        citation.section,
        citation.conferenceId
      );
      if (shownRef.current !== token) return;
      if (!next) {
        setError("That passage isn't in this build of the library.");
        return;
      }
      setOrigin("cited");
      setLandedPassage(next);
      setPassage(next);
      setDrawKey((k) => k + 1);
      setPhase("result");
    } catch (e: unknown) {
      if (shownRef.current !== token) return;
      setError(e instanceof Error ? e.message : "Something went wrong opening that passage.");
    }
  }, []);

  // The home-screen widgets open the app straight into a draw, with the action
  // in the URL (`?action=autoriffle` for a fresh draw, `?action=daily` for the
  // day's passage). Read from `window.location` rather than next/navigation's
  // hook: this is a static export, and the hook would drag the whole page out of
  // the prerender just to look at a query string once, on the client.
  useEffect(() => {
    if (!manifest || actionHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (action !== "autoriffle" && action !== "daily" && action !== "cite") return;
    // `?action=cite` names a passage instead of asking for one — it is how a
    // search result comes over, and how a shared citation would. The others
    // draw.
    const citation = action === "cite" ? readCitation(params) : null;
    if (action === "cite" && !citation) return;
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
      if (citation) void showCitation(citation);
      else void draw(action === "daily" ? dayKey() : undefined);
    }, 0);
    return () => window.clearTimeout(id);
  }, [manifest, draw, showCitation]);

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
                  {/* The heading says which passage is on the page — the dice
                      for a draw, the day's for the daily one — and the line
                      under it is left with the icon rather than centred, so it
                      reads as this page's title, not a label on the button. */}
                  {/* The back control rides the heading row, in line with the
                      title it belongs to — the same place every page built on
                      the shared frame puts it. */}
                  <div className="flex items-center gap-3 text-left">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-surface text-accent-strong">
                      <Glyph name="dice" className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* The back control shares the title's line rather than
                          the whole block's: with the tagline under it, a row
                          centred on the block leaves the arrow a little below
                          the heading it belongs to. */}
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-serif text-2xl font-semibold text-foreground">
                          {origin === "daily"
                            ? "Daily Scripture"
                            : origin === "cited"
                              ? "Scripture"
                              : "Random Scripture"}
                        </h2>
                        <BackLink />
                      </div>
                    </div>
                  </div>

                  {/* On its own line under the heading, not tucked beneath the
                      title: the heading row is the page's title bar, and this is
                      the line that introduces it.

                      A verse, set the way the app's other verse straplines are:
                      the words in the serif italic they are read in, the
                      citation after them and kept whole — and, like the ones on
                      the quiz and memorize pages, a way into the verse it
                      names rather than a label. The click is handled here as
                      well as by the URL: the effect above only reads the query
                      string when the page arrives, so a client navigation from
                      /read to /read would otherwise leave the card showing the
                      passage it already had. */}
                  <p className="mt-2 text-left text-sm text-muted">
                    <span className="font-serif italic text-foreground/85">
                      &ldquo;If thou shalt ask, thou shalt receive revelation upon revelation…&rdquo;
                    </span>{" "}
                    <span className="whitespace-nowrap font-semibold">
                      —{" "}
                      <Link
                        href={citationHref(STRAPLINE)}
                        onClick={(e) => {
                          // A modified click opens the passage in a new tab or
                          // window, which the URL already handles.
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                          // Handled here rather than by the URL: the effect above
                          // only reads the query string as the page arrives, so a
                          // client navigation from /read to /read would leave the
                          // card showing the passage it already had. The address
                          // bar still gets the citation, so the passage stays
                          // linkable — but the parameter is marked as handled, so
                          // the arrival effect never acts on it later and pulls
                          // the reader back to this verse.
                          e.preventDefault();
                          actionHandled.current = true;
                          const href = citationHref(STRAPLINE);
                          // This page's own path (trailing slash and all), with
                          // the citation's query string added: the address the
                          // navigation would have written.
                          window.history.replaceState(
                            null,
                            "",
                            `${window.location.pathname}${href.slice(href.indexOf("?"))}`
                          );
                          void showCitation(STRAPLINE);
                        }}
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
                      className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-accent px-7 py-3.5 text-base font-semibold text-accent-contrast shadow-lg shadow-accent/20 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-accent-contrast">
                        <OpenBookLogo className="h-5 w-5" />
                      </span>
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

                    {/* The daily habit, below the draw itself: the passage the
                        reminder pointed at, and how long the run has lasted. */}
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-start">
                      <button
                        type="button"
                        onClick={() => void draw(dayKey())}
                        disabled={!manifest || phase === "rifling" || loading || nothingSelected}
                        className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CalendarIcon />
                        Today&apos;s passage
                      </button>
                      <StreakBadge />
                    </div>
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
