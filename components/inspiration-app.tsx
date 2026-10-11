"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ThemeToggle } from "./theme-toggle";
import { OpenBookLogo } from "./logo";
import { FilterPanel } from "./filter-panel";
import { RifflingPages } from "./riffling-pages";
import { PassageCard } from "./passage-card";
import { NoSourcesError, loadManifest, pickPassage, summarize } from "@/lib/picker";
import type { Filters, Manifest, Passage } from "@/lib/types";

/** How long the book's sheets turn before it lands on the draw. */
const RIFFLE_MS = 2400;
/** How long the final page takes to turn slowly onto the draw. */
const SETTLE_MS = 900;
/** How long the settled page rests before the card rises into its place. */
const LAND_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

export function InspirationApp() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ volumes: {}, books: {}, conferences: {}, conferenceMaster: true });
  const [phase, setPhase] = useState<"idle" | "rifling" | "result">("idle");
  const [passage, setPassage] = useState<Passage | null>(null);
  /** The passage the book has landed on, shown on the page before it opens up. */
  const [landedPassage, setLandedPassage] = useState<Passage | null>(null);
  const [drawKey, setDrawKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** null until the Filters button is used: until then the layout decides. */
  const [showFilters, setShowFilters] = useState<boolean | null>(null);
  const riflingRef = useRef(false);

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

  const draw = useCallback(async () => {
    if (!manifest || riflingRef.current) return;
    riflingRef.current = true;
    setPhase("rifling");
    setLandedPassage(null);
    setError(null);
    // On a phone the filter panel sits above the book, so close it to give the
    // riffle the full width; the sidebar leaves the book alone.
    if (!wide) setShowFilters(false);

    const started = performance.now();
    try {
      const next = await pickPassage(manifest, filters);
      const untilLand = RIFFLE_MS - (performance.now() - started);
      if (untilLand > 0) await sleep(untilLand);
      setLandedPassage(next);
      setPassage(next);
      setDrawKey((k) => k + 1);
      // Let the last page turn onto the draw and settle before it opens up.
      await sleep(SETTLE_MS + LAND_MS);
      setPhase("result");
    } catch (e: unknown) {
      const message =
        e instanceof NoSourcesError
          ? "Pick at least one book or conference to draw from."
          : e instanceof Error
            ? e.message
            : "Something went wrong opening the book.";
      setError(message);
      setPhase(passage ? "result" : "idle");
    } finally {
      riflingRef.current = false;
    }
  }, [manifest, filters, passage, wide]);

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
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:max-w-5xl sm:px-6">
          <span className="text-accent-strong">
            <OpenBookLogo className="h-8 w-8" />
          </span>
          <div className="flex-1">
            <h1 className="font-serif text-lg font-semibold leading-tight text-foreground sm:text-xl">
              Open to Inspiration
            </h1>
            <p className="hidden text-xs text-muted sm:block">
              Random passages from the Scriptures &amp; General Conference
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

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
                {/* Shrink-wrapped to the line above, so the button below can
                    match its width exactly. */}
                <div className="mx-auto w-full sm:mx-0 sm:w-fit">
                  <p className="font-serif text-sm italic text-muted">
                    Find inspiration from the Lord&apos;s words.
                  </p>

                  <div className="mt-6 flex flex-col items-center gap-3 sm:items-start">
                    <button
                      type="button"
                      onClick={() => void draw()}
                      disabled={!manifest || phase === "rifling" || nothingSelected}
                      // Full width on phones, and from there on as wide as the
                      // line above it.
                      className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-accent px-7 py-3.5 text-base font-semibold text-accent-contrast shadow-lg shadow-accent/20 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-accent-contrast">
                        <OpenBookLogo className="h-5 w-5" />
                      </span>
                      {phase === "rifling" ? "Opening…" : "New passage"}
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

      <footer className="border-t border-border/70 px-4 py-5 text-center text-xs text-muted sm:px-6">
        <p>
          Scripture text is public domain; passages link to the Church&apos;s Gospel Library. This app is not
          sponsored by or affiliated with The Church of Jesus Christ of Latter-day Saints.
        </p>
      </footer>
    </div>
  );
}
