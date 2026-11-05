"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "./glyph";
import type { AnnotationLink } from "@/lib/annotations";
import {
  docCitation,
  formatVerseList,
  openReaderDoc,
  readerHref as readerUrl,
  type ReaderDoc,
} from "@/lib/reader";
// Types only, so mounting a picker still doesn't pull the index in: the module
// itself is imported on the keystroke that needs it, as it is below.
import type { ChapterHit, HighlightPart, SearchHit, SearchLibrary } from "@/lib/search";

interface Props {
  /** What the search box starts on — the words the link was opened for. */
  initialQuery?: string;
  /** A passage and the verses picked out of it, ready to be linked. */
  onPick: (picked: PickedPassage) => void;
  autoFocus?: boolean;
}

/** The passage a reader picked, and where its verses live in the reader. */
export interface PickedPassage {
  /** The library's own words for the pick: "Alma 32:21-23". */
  label: string;
  /** A live reader address for those verses. */
  href: string;
  /** The same place as a mark's stored link. */
  link: AnnotationLink;
}

/** How long the search waits after the last keystroke. */
const DEBOUNCE_MS = 250;

/**
 * How many verses are read out of the index to fill the page.
 *
 * The rows are chapters, not verses, and one well-answered query can put forty
 * verses of the same chapter at the top of the ranking. Reading a page of them
 * is what lets the list be eight *places* rather than one place and seven
 * neighbouring verses of it.
 */
const RESULT_LIMIT = 40;

/** How many chapters are offered at once. Past a few screens nobody scrolls. */
const GROUP_LIMIT = 8;

/** How many characters before the index is worth opening. */
const MIN_QUERY = 2;

/**
 * The library's name for one passage and the verses picked out of it.
 *
 * A verse set is written the way a citation writes one (`21-23`, `21,23`), and a
 * talk's paragraphs get the paragraph mark the rest of the app uses, because a
 * conference talk has no chapter of its own to hang a verse on.
 */
export function passageLabel(doc: ReaderDoc, verses: number[]): string {
  const list = [...verses].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  if (!list.length) return doc.title;
  return doc.kind === "conference"
    ? `“${doc.chapter}” ¶ ${formatVerseList(list)}`
    : `${doc.book} ${doc.chapter}:${formatVerseList(list)}`;
}


/**
 * A place to look for something to link to, and to read it before choosing.
 *
 * The search is the library's own: words, a phrase, or a reference. What comes
 * back is *places* — a chapter or a talk, with the verses in it that answered
 * gathered under it — because a link is made by reading and choosing, not by
 * picking one result off a list. Opening a place brings the whole chapter in a
 * panel from the right, the verse that answered scrolled into view and the
 * reader's own words marked in the text, and the verses the link should cover
 * are tapped out of it there.
 *
 * One picker serves the reader's marks and the journal's links, so a link means
 * the same thing wherever it is made. The library index is imported only when
 * there is something to search for, and the picker is only mounted when it is
 * open, so an entry written without a link never pays for either.
 */
export function PassageLinkPicker({ initialQuery = "", onPick, autoFocus = false }: Props) {
  const [query, setQuery] = useState(initialQuery.trim());
  /** The library's answer, tagged with the query it belongs to. */
  const [answer, setAnswer] = useState<{ query: string; results: ChapterHit[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** The index itself, kept for the words that mean something in a preview. */
  const [library, setLibrary] = useState<SearchLibrary | null>(null);
  /**
   * The matching words of each chapter's preview, read out of the passage data.
   *
   * Keyed by the query as well as the chapter, because the window a preview opens
   * on depends on what was searched: the same chapter answers two queries at two
   * different places in itself.
   */
  const [snippets, setSnippets] = useState<Record<string, HighlightPart[]>>({});
  /** The chapter opened for reading, and the verses of it that matched. */
  const [open, setOpen] = useState<{ doc: ReaderDoc; matches: number[] } | null>(null);
  /** The result whose chapter is still being read out of the library. */
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const asked = query.trim();

  useEffect(() => {
    if (asked.length < MIN_QUERY) return;

    let live = true;
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const { groupHitsByChapter, loadSearchLibrary, searchLibrary } = await import("@/lib/search");
          const loaded = await loadSearchLibrary();
          const hits: SearchHit[] = await searchLibrary(asked, { limit: RESULT_LIMIT });
          if (!live) return;
          setAnswer({ query: asked, results: groupHitsByChapter(hits, GROUP_LIMIT) });
          setLibrary(loaded);
          setFailure(null);
        } catch {
          if (live) setFailure("The library search isn't available here.");
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [asked]);

  const results = useMemo(
    () => (answer && answer.query === asked ? answer.results : []),
    [answer, asked]
  );
  /** Waiting on the library for the words now in the box. */
  const searching = asked.length >= MIN_QUERY && !(answer && answer.query === asked) && !failure;

  // The words of each chapter, so a row says what the search answered with and
  // not only where it is: the verse that reached the chapter, opened a few words
  // before the match, with the reader's own words marked — the same window the
  // search page's cards draw (see `previewFrom` in lib/search.ts).
  useEffect(() => {
    if (!results.length) return;

    let live = true;
    void (async () => {
      try {
        const [{ previewFrom, highlightMatches }, { loadPassageText }] = await Promise.all([
          import("@/lib/search"),
          import("@/lib/picker"),
        ]);
        const found: Record<string, HighlightPart[]> = {};
        await Promise.all(
          results.map(async (result) => {
            const text = await loadPassageText(result.previewId);
            if (!text) return;
            found[`${asked}|${result.key}`] = highlightMatches(
              previewFrom(text, asked, { isContent: library?.isTerm }),
              asked,
              { isToken: library?.isToken, isTerm: library?.isTerm }
            );
          })
        );
        if (live) setSnippets((current) => ({ ...current, ...found }));
      } catch {
        // A volume that won't load costs the preview, not the result: the row
        // still says what it is and can be opened.
      }
    })();

    return () => {
      live = false;
    };
  }, [results, asked, library]);

  const read = async (result: ChapterHit) => {
    setOpening(result.key);
    setOpenError(null);
    try {
      const doc = await openReaderDoc({
        kind: result.citation.kind,
        book: result.citation.book,
        chapter: result.citation.chapter,
        conferenceId: result.citation.conferenceId,
      });
      if (!doc) {
        setOpenError("That passage isn't in this build of the library.");
        return;
      }
      setOpen({ doc, matches: result.matches });
    } catch {
      setOpenError("That passage couldn't be opened.");
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <label htmlFor="passage-link-search" className="sr-only">
        Search the library
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
          <Glyph name="search" className="h-4 w-4" plain />
        </span>
        <input
          id="passage-link-search"
          type="search"
          value={query}
          autoComplete="off"
          autoFocus={autoFocus}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpenError(null);
          }}
          placeholder="Search for a passage to link"
          className="h-11 w-full rounded-2xl border border-border bg-surface-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
        />
      </div>

      <div className="mt-2.5 min-h-0">
        {failure && <p className="pb-2 text-sm text-muted">{failure}</p>}
        {openError && <p className="pb-2 text-sm text-accent-strong">{openError}</p>}

        {searching && (
          <p className="pb-2 text-sm text-muted" aria-live="polite">
            Searching the library…
          </p>
        )}

        {!failure && !searching && asked.length >= MIN_QUERY && results.length === 0 && (
          <p className="pb-2 text-sm text-muted">Nothing in the library matches that.</p>
        )}

        <ul className="space-y-1.5">
          {results.map((result) => {
            const snippet = snippets[`${asked}|${result.key}`];
            return (
              <li key={result.key}>
                <button
                  type="button"
                  onClick={() => void read(result)}
                  disabled={opening === result.key}
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/40 disabled:opacity-60"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-serif text-sm font-semibold text-foreground">
                      {result.reference}
                    </span>
                    <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted">
                      {opening === result.key
                        ? "Opening…"
                        : result.kind === "scripture"
                          ? "Scripture"
                          : "Conference"}
                    </span>
                  </span>
                  {/* `line-clamp-2` draws the box itself, so no `block` here — it
                      would win the display and the clamp would never cut. */}
                  <span className="mt-1 line-clamp-2 font-serif text-xs leading-relaxed text-foreground/70">
                    {snippet ? (
                      <Marked parts={snippet} />
                    ) : (
                      `${result.matches.length} ${result.matches.length === 1 ? "verse matches" : "verses match"}`
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <AnimatePresence>
        {open && (
          <ChapterPanel
            key="chapter"
            doc={open.doc}
            matches={open.matches}
            query={asked}
            library={library}
            onClose={() => setOpen(null)}
            onPick={(picked) => {
              setOpen(null);
              // The search was asked for this link, and the sheet above now
              // names it: empty the box so the next passage starts from a
              // clean field rather than from words that already have their
              // answer.
              setQuery("");
              onPick(picked);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The chapter a result opened, read beside the sheet that asked for it.
 *
 * A search result is a place, so choosing one is not a click and done: the
 * chapter comes in from the right with the verse that answered the search
 * scrolled into view and the reader's words marked in it, and the verses the
 * link should cover are tapped out of the text they are reading. The panel is
 * the same gesture as a mark's own note — a reading surface over the page, not
 * another box in the list.
 */
function ChapterPanel({
  doc,
  matches,
  query,
  library,
  onClose,
  onPick,
}: {
  doc: ReaderDoc;
  /** The verses of the chapter the search matched, in reading order. */
  matches: number[];
  query: string;
  library: SearchLibrary | null;
  onClose: () => void;
  onPick: (picked: PickedPassage) => void;
}) {
  /**
   * The verse the search answered with is the one the reader meant; the rest of
   * the chapter is here to widen or narrow that.
   */
  const [selected, setSelected] = useState<number[]>(() => (matches.length ? [matches[0]] : []));
  /** The chapter's words, with the query marked in them. */
  const [marked, setMarked] = useState<Record<number, HighlightPart[]>>({});
  const list = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<number, HTMLButtonElement>());

  const verses = useMemo(
    () =>
      selected
        .filter((n) => doc.verses.some((verse) => verse.number === n))
        .sort((a, b) => a - b),
    [doc, selected]
  );
  const label = passageLabel(doc, verses);

  // The query is marked in the verses the search answered with, and only there:
  // the rest of the chapter is context, and a word like *me* sits in half the
  // verses of it — marking those too would turn the page into a field of
  // stripes that says nothing about the search. The rule is the search's own
  // (see `highlightMatches`), imported on the keystroke the panel opened from.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { highlightMatches } = await import("@/lib/search");
        const found: Record<number, HighlightPart[]> = {};
        for (const verse of doc.verses) {
          found[verse.number] = matches.includes(verse.number)
            ? highlightMatches(verse.text, query, {
                isToken: library?.isToken,
                isTerm: library?.isTerm,
              })
            : [{ text: verse.text, match: false }];
        }
        if (live) setMarked(found);
      } catch {
        // Unmarked text is still readable text.
      }
    })();
    return () => {
      live = false;
    };
  }, [doc, query, library, matches]);

  // The verse that answered is in sight when the panel arrives, not somewhere
  // below the fold of a long chapter.
  useEffect(() => {
    const node = rows.current.get(matches[0] ?? doc.verses[0]?.number);
    const host = list.current;
    if (!node || !host) return;
    const box = node.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    host.scrollTop += box.top - frame.top - frame.height / 2 + box.height / 2;
  }, [doc, matches]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture, and stop it here: the sheet that opened this panel is listening
      // for Escape too, and back should close the chapter, not the whole sheet.
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const toggle = (number: number) => {
    setSelected((old) =>
      old.includes(number) ? old.filter((n) => n !== number) : [...old, number]
    );
  };

  const pick = () => {
    if (!verses.length) return;
    onPick({
      label,
      href: readerUrl({ ...docCitation(doc), verses }),
      link: {
        book: doc.kind === "conference" ? "General Conference" : doc.book,
        chapter: doc.chapter,
        section: verses[0],
        sections: verses,
        conferenceId: doc.conferenceId,
        label,
      },
    });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <motion.button
        type="button"
        aria-label="Close the passage"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/35"
      />

      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`Verses in ${doc.title}`}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.8 }}
        className="absolute inset-y-0 right-0 flex w-[min(30rem,calc(100%-2rem))] flex-col border-l border-border bg-background shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-border/70 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-base font-semibold text-foreground">{doc.title}</p>
            {doc.subtitle && <p className="truncate text-xs text-muted">{doc.subtitle}</p>}
          </div>
          <span className="mt-0.5 shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent-strong">
            {verses.length ? `${verses.length} picked` : "Pick a verse"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </header>

        <div
          ref={list}
          role="listbox"
          aria-label="Verses in this passage"
          aria-multiselectable="true"
          className="relative min-h-0 flex-1 overflow-y-auto px-2 py-2"
        >
          {doc.verses.map((verse) => {
            const on = selected.includes(verse.number);
            const matched = matches.includes(verse.number);
            return (
              <button
                key={verse.number}
                ref={(node) => {
                  if (node) rows.current.set(verse.number, node);
                  else rows.current.delete(verse.number);
                }}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(verse.number)}                  // Square, with the gold rule on the left, the way the reader
                  // itself marks the verse being read: a rounded box around the
                  // words reads as a card floating on the page rather than as
                  // the edge of a verse (see the focused verse in
                  // components/chapter-reader.tsx).
                  className={`mb-1 flex w-full items-start gap-2.5 border-l-2 px-2.5 py-2 text-left transition-colors ${
                    on
                      ? "border-accent bg-accent/10"
                      : matched
                        ? "border-accent/35 hover:bg-surface-2"
                        : "border-transparent hover:bg-surface-2"
                  }`}
              >
                <span
                  className={`mt-0.5 w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                    on || matched ? "text-accent-strong" : "text-muted"
                  }`}
                >
                  {verse.number}
                </span>
                <span className="min-w-0 font-serif text-sm leading-relaxed text-foreground/85">
                  <Marked parts={marked[verse.number] ?? [{ text: verse.text, match: false }]} />
                </span>
              </button>
            );
          })}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={pick}
            disabled={!verses.length}
            className="inline-flex items-center rounded-full bg-cta px-4 py-2 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Link {label}
          </button>
        </footer>
      </motion.aside>
    </div>,
    document.body
  );
}

/** Text with the words the search asked for marked. */
function Marked({ parts }: { parts: HighlightPart[] }) {
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
