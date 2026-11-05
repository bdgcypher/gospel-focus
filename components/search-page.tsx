"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FeaturePage } from "./feature-page";
import { FilterPanel } from "./filter-panel";
import { Glyph } from "./glyph";
import { loadManifest, loadPassageText, summarize } from "@/lib/picker";
import { setPreference, usePreferences } from "@/lib/preferences";
import {
  SearchUnsupportedError,
  allCommonWords,
  groupHitsByChapter,
  highlightMatches,
  loadSearchLibrary,
  previewFrom,
  searchLibrary,
  sectionId,
  type ChapterHit,
  type SearchHit,
  type SearchLibrary,
} from "@/lib/search";
import type { Filters, Manifest } from "@/lib/types";

/** How long the box waits for the reader to stop typing before it searches. */
const DEBOUNCE_MS = 250;

/**
 * How many verses are read out of the index to fill the page.
 *
 * The rows are places — a chapter or a talk — not verses, and one
 * well-answered query can put forty verses of the same chapter at the top of the
 * ranking. Reading a page of verses is what lets the list be ten places rather
 * than one place and nine neighbouring verses of it.
 */
const RESULT_LIMIT = 60;

/** How many places are offered at once. Past a couple of screens nobody scrolls. */
const GROUP_LIMIT = 10;

/**
 * How much of that page the talks are guaranteed when any of them matched.
 *
 * Not a ranking rule — the chapters are all above them, as they always were —
 * but a floor. The hit list already holds a slice back for talks; gathering
 * would quietly undo it, because forty verses can collapse into a handful of
 * chapters that fill the page on their own.
 */
const TALK_PLACES = 3;

/**
 * How many matched verses each place quotes.
 *
 * Every match in the place is named, but three lines is what a row can hold
 * before the list stops being a list of places; the rest are counted. A query
 * that matches a whole chapter — a citation like "alma 32" reaches every verse
 * of it — would otherwise fill the page with one chapter.
 */
const MATCH_QUOTES = 3;

/**
 * How many places get their matched verses read out of the passage data.
 *
 * A snippet has to be looked up rather than stored — see lib/search.ts — so each
 * one loads the volume it lives in. Ten is a screenful and a half on a phone, it
 * is enough to judge whether the search was any good, and it keeps a mixed set
 * of results from pulling the whole library in to draw a list. Verses of the
 * same chapter share that load.
 */
const SNIPPET_LIMIT = GROUP_LIMIT;

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
  /**
   * One line per matched verse, keyed by query, place and verse: cumulative,
   * and read by all three, so a late snippet can never land on a newer result —
   * the same chapter answers two queries at two different places in itself.
   */
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
  /**
   * The verses, gathered into the places they belong to (see lib/search.ts).
   *
   * Gathered in two streams rather than one, because gathering can quietly undo
   * the rank the search itself keeps: scripture above conference. Forty verses
   * become a handful of chapters, and those alone would fill the list even when
   * talks answered too — so a few rows are held back for talks when there are
   * any, and whatever the chapters don't use goes back to them.
   */
  const places = useMemo(() => {
    const chapters = groupHitsByChapter(
      hits.filter((hit) => hit.citation.kind === "scripture"),
      GROUP_LIMIT
    );
    const talks = groupHitsByChapter(
      hits.filter((hit) => hit.citation.kind === "conference"),
      GROUP_LIMIT
    );
    const reserved = Math.min(TALK_PLACES, talks.length);
    const chaptersShown = chapters.slice(0, GROUP_LIMIT - reserved);
    return [...chaptersShown, ...talks.slice(0, Math.max(reserved, GROUP_LIMIT - chaptersShown.length))];
  }, [hits]);

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

  // A line for each matched verse, read from the passage data: opened a few
  // words before the match in it and with the reader's own words marked — the
  // same window the link picker draws. Kept separate from the search itself so
  // places appear at once and fill in, rather than waiting on a 3 MB volume to
  // draw a list.
  useEffect(() => {
    const wanted = places.slice(0, SNIPPET_LIMIT);
    if (!wanted.length) return;

    let live = true;
    void (async () => {
      const found: Record<string, string> = {};
      await Promise.all(
        wanted.flatMap((place) =>
          place.matches.slice(0, MATCH_QUOTES).map(async (section) => {
            const text = await loadPassageText(sectionId(place, section));
            if (!text) return;
            found[`${asked}|${place.key}|${section}`] = previewFrom(text, asked, {
              isContent: library?.isTerm,
            });
          })
        )
      );
      if (live) setSnippets((current) => ({ ...current, ...found }));
    })();

    return () => {
      live = false;
    };
  }, [places, asked, library]);

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
        {/* Drawn, not the playful styles' emoji: this mark sits inside the
            field it labels, where the page's own emoji already appears at the
            top — a picture in the box reads as decoration inside the reader's
            typing, and the drawn lens is quieter beside it. */}
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
          <Glyph name="search" className="h-5 w-5" plain />
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
            count={places.length}
            label={placesLabel(places)}
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

          {places.length > 0 && (
            <ul className="mt-4 space-y-2">
              {places.map((place) => (
                <li key={place.key}>
                  <PlaceRow place={place} snippets={snippets} query={asked} library={library} />
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
 * is asked, how many places answered, or which of the two kinds of nothing came
 * back.
 */
function StatusLine({
  status,
  asked,
  count,
  label,
  documents,
  allCommon,
}: {
  status: "idle" | "searching" | "ok" | "unsupported" | "error";
  asked: string;
  /** How many places answered — the list's own length. */
  count: number;
  /** Those places, named: "8 chapters", "2 talks", "5 chapters and talks". */
  label: string;
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
      {label} for “{asked}”
    </p>
  );
}

/**
 * How many places answered, named for what they are.
 *
 * A page of verses is a page of chapters; a page of talks is a page of talks;
 * and a mixed one says both, because calling four talks "chapters" over a list
 * that holds them would be a small lie.
 */
function placesLabel(places: ChapterHit[]): string {
  const total = places.length;
  const scripture = places.filter((place) => place.kind === "scripture").length;
  const plural = total === 1 ? "" : "s";
  if (scripture === total) return `${total} chapter${plural}`;
  if (!scripture) return `${total} talk${plural}`;
  return `${total} chapter${plural} and talk${plural}`;
}

/**
 * One place: where it is, what it is from, and the verses in it that answered.
 *
 * The row is a chapter or a talk rather than a single verse, because that is
 * what a reader is looking for when they search — somewhere to read — and forty
 * verses of one chapter are one answer said forty times. But a chapter that
 * answered in four places is four reasons to open it, so the matches are listed
 * under the reference with their own numbers, up to a few; the rest are counted.
 * The query's own words are marked in the reference and in every line, since
 * both are reasons the place is here: a citation-shaped query shows itself in
 * the reference ("Alma 32") and a phrase shows itself in the words.
 */
function PlaceRow({
  place,
  snippets,
  query,
  library,
}: {
  place: ChapterHit;
  /** Every line read so far, keyed by query, place and verse. */
  snippets: Record<string, string>;
  query: string;
  library?: SearchLibrary | null;
}) {
  const quoted = place.matches.slice(0, MATCH_QUOTES);
  const lines = quoted.map((section) => ({
    section,
    text: snippets[`${query}|${place.key}|${section}`],
  }));
  const rest = place.matches.length - quoted.length;
  const noun = place.kind === "scripture" ? "verse" : "paragraph";
  return (
    <Link
      href={readHref(place)}
      className="block rounded-3xl border border-border bg-surface p-4 transition-colors hover:border-accent/60"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-serif text-base font-semibold text-accent-strong">
          <Highlighted text={place.reference} query={query} library={library} />
        </p>
        <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted">
          {place.kind === "scripture" ? "Scripture" : "Conference"}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-muted">{place.source}</p>

      {lines.some((line) => line.text) ? (
        <ul className="mt-2 space-y-1">
          {lines.map((line) => (
            <li key={line.section} className="flex gap-2">
              {/* The place names the chapter or the talk; the number is what
                  tells the verses apart, so it is set as a citation margin. */}
              <span className="mt-0.5 w-8 shrink-0 text-right text-[11px] font-medium tabular-nums text-muted">
                {place.kind === "scripture" ? line.section : `¶${line.section}`}{" "}
              </span>
              {/* Started where the query's words are in that verse, not at its
                  first word: the two lines a card shows are all a reader sees
                  of the mark. */}
              <span className="line-clamp-2 text-sm leading-relaxed text-foreground/85">
                {line.text ? (
                  <Highlighted text={line.text} query={query} library={library} />
                ) : (
                  "…"
                )}
              </span>
            </li>
          ))}
          {rest > 0 && (
            <li className="pl-10 text-[11px] text-muted">
              {`and ${rest} more ${noun}${rest === 1 ? "" : "s"} in this ${
                place.kind === "scripture" ? "chapter" : "talk"
              }`}
            </li>
          )}
        </ul>
      ) : (
        // What the place holds until its lines land, so the list says why the
        // row is here instead of jumping as snippets arrive a volume at a time.
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
          {`${place.matches.length} ${noun}${place.matches.length === 1 ? " matches" : "s match"}`}
        </p>
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
 * Where a place opens.
 *
 * The reader, not this page: a passage belongs to /read, which already knows how
 * to show one, favorite it, share it, and count the time against the day's goal.
 * So the place is carried over as a citation in the query string — the whole
 * chapter or talk, and the verse in it that answered — and the reader resolves
 * it out of the same library this page searched (`?action=cite`).
 */
function readHref(place: ChapterHit): string {
  const params = new URLSearchParams({
    action: "cite",
    kind: place.citation.kind,
    book: place.citation.book,
    chapter: place.citation.chapter,
    section: String(place.section),
  });
  if (place.citation.conferenceId) params.set("session", place.citation.conferenceId);
  return `/read?${params.toString()}`;
}
