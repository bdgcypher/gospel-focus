"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "./glyph";
import { useJournal } from "@/lib/journal";
import {
  entryTarget,
  noteTarget,
  passageTarget,
  targetMatches,
  type LinkSource,
  type LinkTarget,
} from "@/lib/journal-links";
import { useNotes } from "@/lib/notes";
import type { SearchHit } from "@/lib/search";

interface Props {
  open: boolean;
  /** The words selected in the entry, which the link starts from. */
  selection: string;
  /** The entry being edited, left out of its own list of entries to link to. */
  currentEntryId: string | null;
  onInsert: (link: { href: string; text: string }) => void;
  /** Offered when the caret is already inside a link. */
  onRemove?: () => void;
  onClose: () => void;
}

/** How long the passage search waits after the last keystroke. */
const DEBOUNCE_MS = 250;

/**
 * How many candidates a source shows at once. The picker is for choosing one
 * thing, not for browsing a library — anything past a screenful is found by
 * typing more, which is the whole point of the search above it.
 */
const LIMIT = 8;

/** How many characters of passage search are worth running the index for. */
const MIN_QUERY = 2;

const SOURCES: { id: LinkSource; label: string; icon: "book" | "bookmark" | "journal" }[] = [
  { id: "passages", label: "Passages", icon: "book" },
  // Notes are written on saved passages, so the shelf's mark is theirs too.
  { id: "notes", label: "Notes", icon: "bookmark" },
  { id: "entries", label: "Journal", icon: "journal" },
];

/**
 * What the reader is linking to, and the words the link will wear.
 *
 * The search is three searches, and they are not alike. Notes and entries are
 * in memory already — they are the reader's own handful of things — so they are
 * filtered as the query is typed. Passages come out of the library's index,
 * which is a 3 MB snapshot fetched once per session; that one is searched only
 * from two characters up, on a debounce, and the index is *imported* rather than
 * bundled with the journal page, so an entry written without a link to scripture
 * never pays for it.
 *
 * Selecting a candidate fills the link text with the candidate's own name
 * (a citation, an entry's title) and leaves it editable: a link reading "Alma
 * 32:21" is right most of the time, and the reader can say "that verse about
 * faith" when it isn't.
 */
export function JournalLinkDialog({ open, selection, currentEntryId, onInsert, onRemove, onClose }: Props) {
  // The caller keys this component per opening, so what the reader had selected
  // when Ctrl+K was pressed is what the fields start from, without an effect
  // that would reset them after the first paint.
  const [source, setSource] = useState<LinkSource>("passages");
  const [query, setQuery] = useState(selection.trim());
  /** The library's answer, tagged with the query it belongs to. */
  const [answer, setAnswer] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [chosen, setChosen] = useState<LinkTarget | null>(null);
  const [text, setText] = useState(selection.trim());
  const field = useRef<HTMLInputElement | null>(null);

  const notes = useNotes();
  const entries = useJournal();

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => field.current?.select(), 120);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const asked = query.trim();

  // The library half: only while the passages tab is up, and only once there is
  // something to ask. No state is cleared here — the answer carries the query it
  // belongs to, so an older one simply isn't the answer to what is in the box,
  // and a late reply can never land under a newer query.
  useEffect(() => {
    if (!open || source !== "passages" || asked.length < MIN_QUERY) return;

    let live = true;
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const { loadSearchLibrary, searchLibrary } = await import("@/lib/search");
          await loadSearchLibrary();
          const results = await searchLibrary(asked, { limit: LIMIT });
          if (!live) return;
          setAnswer({ query: asked, hits: results });
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
  }, [open, source, asked]);

  const hits = useMemo(() => (answer && answer.query === asked ? answer.hits : []), [answer, asked]);
  /** Waiting on the library: the box has asked for something and no answer
   *  matching it has come back yet. */
  const searching = source === "passages" && asked.length >= MIN_QUERY && !(answer && answer.query === asked) && !failure;

  const candidates = useMemo<LinkTarget[]>(() => {
    if (source === "passages") {
      if (asked.length < MIN_QUERY) return [];
      return hits.slice(0, LIMIT).map(passageTarget);
    }
    if (source === "notes") {
      return notes
        .map(noteTarget)
        .filter((target) => targetMatches(target, asked))
        .slice(0, LIMIT);
    }
    return entries
      .filter((entry) => entry.id !== currentEntryId)
      .map(entryTarget)
      .filter((target) => targetMatches(target, asked))
      .slice(0, LIMIT);
  }, [source, hits, asked, notes, entries, currentEntryId]);

  if (typeof document === "undefined") return null;

  const insert = () => {
    if (!chosen) return;
    const words = text.trim() || chosen.text;
    onInsert({ href: chosen.href, text: words });
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close the link picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Insert a link"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.8 }}
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-3xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
              <h2 className="font-serif text-lg font-semibold text-foreground">Link To</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full border border-border bg-surface-2 p-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                <Glyph name="close" className="h-4 w-4" />
              </button>
            </header>

            <div className="flex gap-1.5 px-5 pt-4" role="tablist" aria-label="What to link to">
              {SOURCES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={source === option.id}
                  onClick={() => {
                    setSource(option.id);
                    setChosen(null);
                  }}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                    source === option.id
                      ? "border-accent/40 bg-accent/15 text-accent-strong"
                      : "border-border bg-surface-2 text-muted hover:border-accent/60 hover:text-accent-strong"
                  }`}
                >
                  <Glyph name={option.icon} className="h-4 w-4" />
                  {option.label}
                </button>
              ))}
            </div>

            <div className="px-5 pt-3">
              <label htmlFor="journal-link-search" className="sr-only">
                {source === "passages" ? "Search the library" : `Search your ${source}`}
              </label>
              <div className="relative">
                {/* Drawn in both styles, like the /search box: a mark inside
                    the field labels what is being typed, and the playful
                    emoji is for the signposts (tabs, cards) rather than for
                    the inside of an input. */}
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                  <Glyph name="search" className="h-4 w-4" plain />
                </span>
                <input
                  id="journal-link-search"
                  ref={field}
                  type="search"
                  value={query}
                  autoComplete="off"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setChosen(null);
                  }}
                  placeholder={
                    source === "passages"
                      ? "A word, a phrase, or a reference"
                      : source === "notes"
                        ? "What your note says"
                        : "An entry's title or words"
                  }
                  className="h-11 w-full rounded-2xl border border-border bg-surface-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5">
              {source === "passages" && asked.length < MIN_QUERY && (
                <p className="pb-4 text-sm text-muted">
                  Type a word, a phrase, or a reference like “alma 32” to find a passage.
                </p>
              )}

              {failure && <p className="pb-4 text-sm text-muted">{failure}</p>}

              {searching && source === "passages" && (
                <p className="pb-4 text-sm text-muted" aria-live="polite">
                  Searching the library…
                </p>
              )}

              {!failure && candidates.length === 0 && asked.length >= MIN_QUERY && !searching && (
                <p className="pb-4 text-sm text-muted">
                  {source === "notes"
                    ? notes.length === 0
                      ? "No notes yet — add one from a favorite or from a passage you draw."
                      : "No note matches that."
                    : source === "entries"
                      ? "No other entry matches that."
                      : "Nothing in the library matches that."}
                </p>
              )}

              <ul className="space-y-2 pb-4">
                {candidates.map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setChosen(target);
                        // The words the link wears start from the candidate's own
                        // name, or from what the reader had selected.
                        setText(selection.trim() || target.text);
                      }}
                      aria-pressed={chosen?.id === target.id}
                      className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                        chosen?.id === target.id
                          ? "border-accent/60 bg-accent/15"
                          : "border-border bg-surface hover:border-accent/40"
                      }`}
                    >
                      <span className="block font-serif text-sm font-semibold text-foreground">
                        {target.text}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{target.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <footer className="border-t border-border/70 px-5 py-4">
              <label htmlFor="journal-link-text" className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Link text
              </label>
              <input
                id="journal-link-text"
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Words the link shows"
                className="mt-1.5 h-11 w-full rounded-2xl border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
              />

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => {
                      onRemove();
                      onClose();
                    }}
                    className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
                  >
                    Remove link
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={insert}
                  disabled={!chosen}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Insert link
                </button>
              </div>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
