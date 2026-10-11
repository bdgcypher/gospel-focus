"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { OpenBookLogo } from "./logo";
import { FilterPanel } from "./filter-panel";
import { RifflingPages } from "./riffling-pages";
import { PassageCard } from "./passage-card";
import {
  NoSourcesError,
  getTeaserPool,
  loadManifest,
  pickPassage,
  summarize,
} from "@/lib/picker";
import type { Filters, Manifest, Passage } from "@/lib/types";

/** How long the book's sheets turn before it lands on the draw. */
const RIFFLE_MS = 1900;
/** How long the landed spread rests before the page expands into the card. */
const LAND_MS = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [showFilters, setShowFilters] = useState(false);
  const [teasers, setTeasers] = useState<string[]>([]);
  const riflingRef = useRef(false);

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
    setTeasers(getTeaserPool());
    // Collapse the filters panel so the riffling book is fully visible.
    setShowFilters(false);

    const started = performance.now();
    try {
      const next = await pickPassage(manifest, filters);
      const untilLand = RIFFLE_MS - (performance.now() - started);
      if (untilLand > 0) await sleep(untilLand);
      // The book settles open on the drawn passage, rests there for a beat,
      // and then that page expands into the full card.
      setLandedPassage(next);
      setPassage(next);
      setDrawKey((k) => k + 1);
      await sleep(LAND_MS);
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
  }, [manifest, filters, passage]);

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
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {loadError ? (
          <div className="rounded-3xl border border-border bg-surface p-6 text-sm text-foreground">
            <p className="font-semibold">Couldn&apos;t load the passage library.</p>
            <p className="mt-2 text-muted">{loadError}</p>
            <p className="mt-2 text-muted">
              Try rebuilding the data with <code className="font-mono">npm run build:data</code>.
            </p>
          </div>
        ) : (
          <>
            <section className="text-center">
              <p className="mx-auto max-w-md font-serif text-sm italic text-muted">
                Find inspiration from the Lord&apos;s words.
              </p>

              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => void draw()}
                  disabled={!manifest || phase === "rifling" || nothingSelected}
                  // Full width on phones (where it is the primary action), back
                  // to hugging its label from sm upwards.
                  className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-accent px-7 py-3.5 text-base font-semibold text-accent-contrast shadow-lg shadow-accent/20 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <span className="text-accent-contrast">
                    <OpenBookLogo className="h-5 w-5" />
                  </span>
                  {phase === "rifling" ? "Opening…" : "New passage"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  aria-expanded={showFilters}
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent-strong"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M6 12h12M10 18h4" />
                  </svg>
                  {showFilters ? "Hide filters" : "Filters"}
                  {summary && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                      {new Intl.NumberFormat("en-US").format(summary.verses + summary.paragraphs)} passages
                    </span>
                  )}
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`}
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

              {nothingSelected && (
                <p className="mt-3 text-sm text-accent-strong">
                  Pick at least one book or conference below.
                </p>
              )}
            </section>

            <AnimatePresence initial={false}>
              {showFilters && manifest && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="pt-6">
                    <FilterPanel manifest={manifest} filters={filters} onChange={setFilters} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative mt-8">
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
                    <RifflingPages
                      durationMs={RIFFLE_MS}
                      teasers={teasers}
                      passage={landedPassage}
                    />
                  </motion.div>
                )}

                {phase === "result" && passage && (
                  <PassageCard key={drawKey} passage={passage} drawKey={drawKey} />
                )}
              </AnimatePresence>

              {phase === "idle" && !error && (
                <div className="mx-auto grid h-60 max-w-lg place-items-center rounded-2xl border border-dashed border-border text-center">
                  <div className="px-6">
                    <span className="mx-auto block text-accent/50">
                      <OpenBookLogo className="mx-auto h-10 w-10" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-muted">Open a passage</p>
                  </div>
                </div>
              )}
            </div>
          </>
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
