"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FeaturePage } from "./feature-page";
import { FilterPanel } from "./filter-panel";
import { Glyph } from "./glyph";
import { loadManifest, resolveCitation, summarize } from "@/lib/picker";
import { setPreference, usePreferences } from "@/lib/preferences";
import {
  SearchUnsupportedError,
  allCommonWords,
  highlightMatches,
  loadSearchLibrary,
  previewFrom,
  searchLibrary,
  type SearchHit,
  type SearchLibrary,
} from "@/lib/search";
import type { Filters, Manifest } from "@/lib/types";

/** How long the box waits for the reader to stop typing before it searches. */
const DEBOUNCE_MS = 250;

/** How many hits are shown at once. Past a couple of screens nobody scrolls. */
const RESULT_LIMIT = 40;

/**
 * How many of those get their first line read out of the passage data.
 *
 * A snippet has to be looked up rather than stored — see lib/search.ts — so each
 * one loads the volume it lives in. Twelve is a screenful and a half on a phone,
 * it is enough to judge whether the search was any good, and it keeps a mixed set
 * of results from pulling the whole library in to draw a list.
 */
const SNIPPET_LIMIT = 12;

/** Searches worth trying, for the empty state. */
const EXAMPLES = ["still small voice", "alma 32", "repentance", "charity never faileth"];

/**
 * What a search came back with, tagged with the query *and* the sources it was
 * run against.
 *
 * The tag is the point: the box, the filters, and the library are three clocks —
 * the reader types and ticks boxes faster than the index answers — and holding
 * what the results belong to is what lets the page work out, while rendering,
 * whether what is on screen is current. Nothing has to be cleared or reset when
 * either changes; a result that doesn't match simply isn't shown.
 */
interface Outcome {
  kind: "ok" | "unsupported" | "error";
  key: string;
  hits: SearchHit[];
  message?: string;
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** Cumulative, and read by hit id, so a late snippet can never land on a newer result. */
  const [snippets, setSnippets] = useState<Record<string, string>>({});
  /** Set on the first search: it holds both the size and the word list. */
  const [library, setLibrary] = useState<SearchLibrary | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  /** Folded away to begin with: on a search page the query is the first thing. */
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The reader's own sources, and the same ones the passage page draws from: one
  // selection, edited from either page. Narrowing it here narrows the draw too,
  // and the panel says so.
  const prefs = usePreferences();
  const filters = prefs.filters;
  const setFilters = useCallback((next: Filters) => setPreference("filters", next), []);

  useEffect(() => {
    loadManifest()
      .then(setManifest)
      .catch(() => {
        // The search itself loads the manifest too, and reports what it can't do;
        // there is nothing useful to say twice.
      });
  }, []);

  const summary = useMemo(
    () => (manifest ? summarize(manifest, filters) : null),
    [manifest, filters]
  );
  const nothingSelected = summary ? !summary.hasScriptures && !summary.hasConference : false;

  const asked = query.trim();
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const key = `${asked}|${filtersKey}`;
  const settled = outcome && outcome.key === key ? outcome : null;
  const status: "idle" | "searching" | "ok" | "unsupported" | "error" =
    !asked || nothingSelected ? "idle" : settled ? settled.kind : "searching";
  // Memoized so the snippet pass below keys off the results themselves rather
  // than off a fresh empty array on every render.
  const hits = useMemo(() => settled?.hits ?? [], [settled]);

  useEffect(() => {
    if (!asked || nothingSelected) return;

    const id = window.setTimeout(() => {
      let live = true;
      void (async () => {
        try {
          const loaded = await loadSearchLibrary();
          const results = await searchLibrary(asked, { limit: RESULT_LIMIT, filters });
          if (!live) return;
          setLibrary(loaded);
          setOutcome({ kind: "ok", key, hits: results });
        } catch (e: unknown) {
          if (!live) return;
          setOutcome(
            e instanceof SearchUnsupportedError
              ? { kind: "unsupported", key, hits: [] }
              : {
                  kind: "error",
                  key,
                  hits: [],
                  message: e instanceof Error ? e.message : String(e),
                }
          );
        }
      })();
      return () => {
        live = false;
      };
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(id);
  }, [asked, key, filters, nothingSelected]);

  // The first line of each result, read from the passage data. Kept separate
  // from the search itself so results appear at once and fill in, rather than
  // waiting on a 3 MB volume to draw a list.
  useEffect(() => {
    const wanted = hits.slice(0, SNIPPET_LIMIT);
    if (!wanted.length) return;

    let live = true;
    void (async () => {
      const found: Record<string, string> = {};
      await Promise.all(
        wanted.map(async (hit) => {
          const passage = await resolveCitation(
            hit.citation.kind,
            hit.citation.book,
            hit.citation.chapter,
            hit.citation.section,
            hit.citation.conferenceId
          );
          if (passage) found[hit.id] = passage.text;
        })
      );
      if (live) setSnippets((current) => ({ ...current, ...found }));
    })();

    return () => {
      live = false;
    };
  }, [hits]);

  return (
    <FeaturePage featureId="search">
      <form
        role="search"
        onSubmit={(event) => {
          // The debounce has already run by the time anyone presses Enter;
          // submitting should not reload the page. It does put the filters
          // away, though: the reader has asked their question, and the results
          // are what they want to look at.
          event.preventDefault();
          setFiltersOpen(false);
        }}
        className="relative"
      >
        <label htmlFor="library-search" className="sr-only">
          Search the scriptures and general conference
        </label>
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
          <Glyph name="search" className="h-5 w-5" />
        </span>
        <input
          id="library-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="A word, a phrase, or a reference"
          className="h-12 w-full rounded-2xl border border-border bg-surface-2 pl-12 pr-12 text-base text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear the search"
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* The same control the passage page has, in the same place under the
          query: what is searched is part of what is being asked. The count is
          the app's own count of eligible passages, not this page's count of
          results, so it reads the same on both pages. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          disabled={!manifest}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
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
            <path d="M3 6h18M6 12h12M10 18h4" />
          </svg>
          {filtersOpen ? "Hide filters" : "Filters"}
        </button>

        {summary && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            {new Intl.NumberFormat("en-US").format(summary.verses + summary.paragraphs)} passages
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {filtersOpen && manifest && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3">
              <FilterPanel
                manifest={manifest}
                filters={filters}
                onChange={setFilters}
                subtitle="Select the sources to search — the same selection the app draws from."
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {nothingSelected ? (
        <p className="mt-6 text-sm text-accent-strong">
          Pick at least one book or conference in the filters above.
        </p>
      ) : (
        <>
          <StatusLine
            status={status}
            asked={asked}
            count={hits.length}
            documents={library?.documents ?? null}
            allCommon={status === "ok" && library ? allCommonWords(asked, library) : false}
          />

          {status === "idle" && <Idle onPick={setQuery} />}

          {status === "unsupported" && (
            <p className="mt-4 rounded-3xl border border-border bg-surface p-5 text-sm text-muted">
              This browser can&apos;t open the search index. Everything else in the app still works —
              search only needs a newer browser than this one.
            </p>
          )}

          {status === "error" && settled?.message && (
            <p className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-strong">
              {settled.message}
            </p>
          )}

          {hits.length > 0 && (
            <ul className="mt-4 space-y-2">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <ResultRow
                    hit={hit}
                    snippet={snippets[hit.id]}
                    query={asked}
                    library={library}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </FeaturePage>
  );
}

/**
 * What the search is doing, in one line: how big the library is before anything
 * is asked, how many passages answered, or which of the two kinds of nothing
 * came back.
 */
function StatusLine({
  status,
  asked,
  count,
  documents,
  allCommon,
}: {
  status: "idle" | "searching" | "ok" | "unsupported" | "error";
  asked: string;
  count: number;
  documents: number | null;
  allCommon: boolean;
}) {
  if (status === "idle") {
    // Nothing to count until a search has loaded the index; the empty state
    // below is the whole of what is said before then.
    if (!documents) return null;
    return (
      <p className="mt-3 text-sm text-muted">
        {`${documents.toLocaleString("en-US")} passages — every verse and conference paragraph.`}
      </p>
    );
  }
  if (status === "searching") {
    return (
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        Searching…
      </p>
    );
  }
  if (allCommon) {
    return (
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        Those are glue words — “the”, “of”, “unto”. They count beside a word the passage is
        about, but there is nothing to rank by on their own. Add one.
      </p>
    );
  }
  if (status === "ok" && count === 0) {
    return (
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        Nothing matches “{asked}” in the sources you have selected. Try fewer words, an older
        spelling of one, or a source you have filtered out.
      </p>
    );
  }
  if (status !== "ok") return null;
  return (
    <p className="mt-3 text-sm text-muted" aria-live="polite">
      {count === 1 ? "1 passage" : `${count} passages`} for “{asked}”
    </p>
  );
}

/**
 * One hit: where it is, what it is from, and its first line once it arrives.
 *
 * The query's own words are marked in both the reference and the line, since
 * both are reasons the result is here — a citation-shaped query shows itself in
 * the reference ("Alma 32:14") and a phrase shows itself in the words.
 */
function ResultRow({
  hit,
  snippet,
  query,
  library,
}: {
  hit: SearchHit;
  snippet?: string;
  query: string;
  library?: SearchLibrary | null;
}) {
  return (
    <Link
      href={readHref(hit)}
      className="block rounded-3xl border border-border bg-surface p-4 transition-colors hover:border-accent/60"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-serif text-base font-semibold text-accent-strong">
          <Highlighted text={hit.reference} query={query} library={library} />
        </p>
        <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted">
          {hit.citation.kind === "scripture" ? "Scripture" : "Conference"}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-muted">{hit.source}</p>

      {snippet ? (
        // Started where the query's words are, not at the passage's first word:
        // the two lines a card shows are all a reader sees of the mark.
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/85">
          <Highlighted
            text={previewFrom(snippet, query, { isContent: library?.isTerm })}
            query={query}
            library={library}
          />
        </p>
      ) : (
        // The shape the line will take, so the list does not jump as snippets
        // land in it one volume at a time.
        <div className="mt-3 space-y-1.5" aria-hidden="true">
          <div className="h-3 w-full animate-pulse rounded-full bg-surface-2" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-surface-2" />
        </div>
      )}
    </Link>
  );
}

/**
 * Text with the words the query asked for marked.
 *
 * A plain `<mark>`, tinted with the app's own accent rather than the browser's
 * yellow, and with no padding: the tint has to sit inside a run of words without
 * shifting the line around it, which would move the text as a snippet lands.
 */
function Highlighted({
  text,
  query,
  library,
}: {
  text: string;
  query: string;
  library?: SearchLibrary | null;
}) {
  const parts = highlightMatches(text, query, {
    isToken: library?.isToken,
    isTerm: library?.isTerm,
  });
  if (parts.length === 1 && !parts[0].match) return <>{text}</>;

  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-[3px] bg-accent/25 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  );
}

/** The empty state: what to search for, in the app's own examples. */
function Idle({ onPick }: { onPick: (query: string) => void }) {
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-border bg-surface/70 p-5">
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="rounded-full border border-border bg-surface-2 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Where a result opens.
 *
 * The reader, not this page: a passage belongs to /read, which already knows how
 * to show one, favorite it, share it, and count the time against the day's goal.
 * So a hit is carried over as a citation in the query string, and the reader
 * resolves it out of the same library this page searched (`?action=cite`).
 */
function readHref(hit: SearchHit): string {
  const params = new URLSearchParams({
    action: "cite",
    kind: hit.citation.kind,
    book: hit.citation.book,
    chapter: hit.citation.chapter,
    section: String(hit.citation.section),
  });
  if (hit.citation.conferenceId) params.set("session", hit.citation.conferenceId);
  return `/read?${params.toString()}`;
}
