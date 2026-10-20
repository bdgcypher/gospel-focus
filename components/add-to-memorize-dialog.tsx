"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph } from "./glyph";
import { dayKey } from "@/lib/daily";
import { useFavorites } from "@/lib/favorites";
import {
  createDeck,
  itemFromFavorite,
  itemFromPassage,
  updateDeck,
  useMemory,
  type Deck,
  type MemoryItem,
} from "@/lib/memorize";
import {
  NoSourcesError,
  loadManifest,
  pickDailyPassage,
  pickPassage,
  resolveCitation,
} from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import {
  SearchUnsupportedError,
  searchLibrary,
  type SearchHit,
} from "@/lib/search";
import type { Filters, Passage } from "@/lib/types";

/**
 * The way cards get onto the memory page.
 *
 * One door, two rooms. The first asks what the reader is adding — a deck of
 * their own, or one of the ready-made decks that are still to come — and the
 * second is the deck builder: a name, then the passages that go in it.
 *
 * The builder does not store anything until Save. A reader who is choosing
 * passages is still deciding, and a half-built deck appearing on the page
 * behind the sheet — then staying there when they close it — is a deck they
 * never made. Draft cards are handed to `createDeck` in one go, which is also
 * what lets the deck have a name from the first card to the last.
 *
 * Passages come from three places, because those are the three the reader
 * already has: the library's search (the same index the search page reads), the
 * passages they have starred, and the draw — today's verse, or one at random.
 * A starred passage is added as it was saved, a run of verses at a time; a
 * search hit is read back out of the library before it can be a card.
 */

/** How long the box waits for the reader to stop typing before it searches. */
const DEBOUNCE_MS = 300;

/** How many hits the builder offers. A deck is chosen, not scrolled. */
const RESULT_LIMIT = 6;

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * The deck being changed, when this is an edit rather than a new deck. The
   * sheet opens straight onto the builder in that case: there is no second room
   * to choose from when the reader has already chosen the deck.
   */
  deck?: Deck;
  /** That deck's cards as they were when the sheet was opened. */
  deckItems?: MemoryItem[];
}

type Step = "menu" | "custom";

export function AddToMemorizeDialog({ open, onClose, deck, deckItems }: Props) {
  const favorites = useFavorites();
  const memory = useMemory();
  const prefs = usePreferences();

  const [step, setStep] = useState<Step>(deck ? "custom" : "menu");
  const [name, setName] = useState(deck?.name ?? "");
  /** The cards picked so far, in the order they were picked. */
  const [draft, setDraft] = useState<MemoryItem[]>(deckItems ?? []);
  /**
   * The chapter or talk behind each draft card, by card id.
   *
   * A card holds verses, and the builder can add the one next to them — but the
   * words of that verse are the library's, not the builder's, so the passage a
   * card was added from is kept here while the deck is open. Six hits is six
   * cached volumes at most (see lib/picker.ts), and the reader can then stretch
   * any card on the list without waiting for another fetch.
   */
  const [chapters, setChapters] = useState<Record<string, Passage>>({});

  const [query, setQuery] = useState("");
  /**
   * What the last search came back with, tagged with the query it answered.
   *
   * Tagged rather than replaced in place: the box and the index are two clocks,
   * and holding the query with the results is what lets a late answer be
   * recognized as stale while rendering, without a state reset of its own.
   */
  const [outcome, setOutcome] = useState<{
    key: string;
    hits: SearchHit[];
    error?: string;
  } | null>(null);
  const [busy, setBusy] = useState<"daily" | "draw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoritesOpen, setFavoritesOpen] = useState(false);

  const nameInput = useRef<HTMLInputElement | null>(null);
  const close = useCallback(() => onClose(), [onClose]);

  // Every opening starts at the beginning: the page remounts this sheet when it
  // opens (a fresh key each time, see MemorizePage), so a name from the last
  // deck cannot come back with it.

  // The keyboard lands on the first thing to answer from, and Escape closes the
  // sheet like any other. On the builder the name is where a reader starts.
  useEffect(() => {
    if (!open) return;
    if (step === "custom") nameInput.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, close]);

  // Everything the reader already has, so the builder offers only what would be
  // new. A passage is one card wherever it lives, so a verse on the main list is
  // not on offer for a deck either — except for the cards this deck already
  // holds: those are the draft, and a card taken back out of it has to become
  // available again.
  const taken = new Set([
    ...memory.filter((item) => !deck || item.deckId !== deck.id).map((item) => item.id),
    ...draft.map((item) => item.id),
  ]);
  const availableFavorites = favorites.filter((favorite) => !taken.has(favorite.id));

  const addItem = (item: MemoryItem, chapter?: Passage) => {
    setDraft((previous) => (previous.some((entry) => entry.id === item.id) ? previous : [...previous, item]));
    if (chapter) setChapters((previous) => ({ ...previous, [item.id]: chapter }));
    setError(null);
  };

  /**
   * A starred passage, brought in with its chapter read back out of the library.
   *
   * The card itself is the favorite's own words; the chapter is only for the
   * verses either side of it, so a favorite whose chapter no longer resolves
   * (an older build's talk, say) is still added — it simply cannot be stretched.
   */
  const addFavorite = async (id: string) => {
    const favorite = favorites.find((entry) => entry.id === id);
    if (!favorite) return;
    const item = itemFromFavorite(favorite);
    let chapter: Passage | null = null;
    if (favorite.book && favorite.chapter) {
      chapter = await resolveCitation(
        favorite.kind,
        favorite.book,
        favorite.chapter,
        favorite.section ?? item.parts[0]?.number ?? 1
      ).catch(() => null);
    }
    addItem(item, chapter ?? undefined);
  };

  /**
   * The cards an edit opens with were picked in an earlier session, so their
   * chapters are read back here — one lookup per card, skipped once it has one.
   * A card with nothing to look it up by (no book and chapter recorded) simply
   * stays a single verse.
   *
   * A card is noted only once its lookup has settled, never when it is started:
   * an effect that is run twice before the first answer comes back (React does
   * this in development) would otherwise leave the second run with nothing to do
   * and the first run's answer thrown away, so the card could never be stretched.
   */
  const lookedUp = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    let live = true;
    for (const item of draft) {
      if (chapters[item.id] || lookedUp.current.has(item.id)) continue;
      if (!item.book || !item.chapter) continue;
      const verse = item.parts[0]?.number ?? 1;
      void resolveCitation(item.kind, item.book, item.chapter, verse)
        .then((passage) => {
          lookedUp.current.add(item.id);
          if (live && passage) setChapters((previous) => ({ ...previous, [item.id]: passage }));
        })
        .catch(() => {
          // No chapter, so this card cannot be stretched — nothing to report.
          lookedUp.current.add(item.id);
        });
    }
    return () => {
      live = false;
    };
  }, [open, draft, chapters]);

  /**
   * Stretch or trim a card: the same card, holding the verses named.
   *
   * The id is carried over from the card on the list rather than taken from the
   * new run, so extending a passage stays the card it was — the same identity a
   * recitation is logged against.
   */
  const setRun = (item: MemoryItem, chapter: Passage, numbers: number[]) => {
    const rebuilt = itemFromPassage(chapter, item.deckId, numbers);
    setDraft((previous) => previous.map((entry) => (entry.id === item.id ? { ...rebuilt, id: entry.id } : entry)));
  };

  const draw = async (kind: "daily" | "draw") => {
    setBusy(kind);
    setError(null);
    try {
      const manifest = await loadManifest();
      const passage =
        kind === "daily"
          ? await pickDailyPassage(manifest, prefs.filters, dayKey())
          : await pickPassage(manifest, prefs.filters);
      addItem(itemFromPassage(passage), passage);
    } catch (e) {
      setError(
        e instanceof NoSourcesError
          ? "Every source is switched off, so there is nothing to draw. Turn one back on in Settings."
          : "The passage library didn’t load. Check the connection and try again."
      );
    } finally {
      setBusy(null);
    }
  };

  // The search page's own engine, held to a handful of results: a deck is built
  // from passages the reader has in mind, not from a page of everything. The
  // answer is stored with the query it belongs to, so a slow one that lands
  // after the reader has typed on is simply not shown.
  const asked = query.trim();
  const filtersKey = JSON.stringify(prefs.filters);
  const searchKey = `${asked}|${filtersKey}`;

  useEffect(() => {
    if (!asked) return;

    let live = true;
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const results = await searchLibrary(asked, {
            limit: RESULT_LIMIT,
            filters: JSON.parse(filtersKey) as Filters,
          });
          if (live) setOutcome({ key: searchKey, hits: results });
        } catch (e: unknown) {
          if (!live) return;
          setOutcome({
            key: searchKey,
            hits: [],
            error:
              e instanceof SearchUnsupportedError
                ? "This browser can’t search the library."
                : "The search index didn’t load. Check the connection and try again.",
          });
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [asked, filtersKey, searchKey]);

  const settled = asked && outcome?.key === searchKey ? outcome : null;
  const searching = !!asked && !settled;

  const addHit = async (hit: SearchHit) => {
    setError(null);
    const passage: Passage | null = await resolveCitation(
      hit.citation.kind,
      hit.citation.book,
      hit.citation.chapter,
      hit.citation.section,
      hit.citation.conferenceId
    );
    if (!passage) {
      setError("That passage isn’t in the library this build ships.");
      return;
    }
    addItem(itemFromPassage(passage), passage);
  };

  const save = () => {
    if (!name.trim() || draft.length === 0) return;
    if (deck) updateDeck(deck.id, name, draft);
    else createDeck(name, draft);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-memorize-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
          >
            <header className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
              {step === "custom" && !deck && (
                <button
                  type="button"
                  onClick={() => setStep("menu")}
                  aria-label="Back"
                  className="-ml-1 rounded-full border border-border bg-surface-2 p-1.5 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
                >
                  <Glyph name="arrow" className="h-4 w-4 rotate-180" />
                </button>
              )}
              <h2
                id="add-memorize-title"
                className="min-w-0 flex-1 font-serif text-lg font-semibold text-foreground"
              >
                {deck ? "Edit Deck" : step === "custom" ? "Custom Deck" : "Add to Memorize"}
              </h2>
              {/* A plain cross rather than a raised control: it is the sheet's
                  way out, not one of the things the sheet is for, and a 3D
                  button beside the title made closing look like a step in the
                  builder. White space and the drawn mark carry it. */}
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Glyph name="close" className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {step === "menu" ? (
                <div className="space-y-2.5">
                  <ChoiceRow
                    icon="cards"
                    title="Custom Deck"
                    hint="Name a deck, then choose the passages in it."
                    onClick={() => setStep("custom")}
                  />
                  {/* Not built yet, so it says so rather than opening an empty
                      shelf. Disabled rather than hidden: the second way to get
                      decks is worth knowing about before it exists. */}
                  <ChoiceRow
                    icon="star"
                    title="Buy Decks"
                    hint="Ready-made decks of passages to memorize."
                    badge="Soon"
                    disabled
                  />
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label
                      htmlFor="deck-name"
                      className="text-xs font-semibold uppercase tracking-wider text-muted"
                    >
                      Deck name
                    </label>
                    <input
                      id="deck-name"
                      ref={nameInput}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="e.g. Temptation killers"
                      maxLength={60}
                      className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
                    />
                  </div>

                  {/* The three ways a passage gets in, in the order the old
                      card offered them — with search leading, since the reader
                      building a deck usually has a passage in mind. */}
                  <section>
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                      <Glyph name="plus" className="h-3.5 w-3.5" />
                      Add a passage
                    </p>

                    <div className="relative mt-2">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                        <Glyph name="search" className="h-4 w-4" />
                      </span>
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search the scriptures and talks"
                        aria-label="Search passages to add"
                        className="w-full rounded-2xl border border-border bg-surface-2 py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
                      />
                    </div>

                    {asked && (
                      <div className="mt-2">
                        {searching ? (
                          <p className="px-1 py-2 text-sm text-muted">Searching…</p>
                        ) : settled?.error ? (
                          <p className="px-1 py-2 text-sm text-muted">{settled.error}</p>
                        ) : settled && settled.hits.length === 0 ? (
                          <p className="px-1 py-2 text-sm text-muted">
                            Nothing found for “{asked}”.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {(settled?.hits ?? []).map((hit) => {
                              // A hit's id is the search index's (s/… or c/…),
                              // while a card's id is its citation; the citation
                              // is what both sides can say.
                              const added = taken.has(
                                `${hit.citation.kind}:${hit.reference}:${hit.citation.section}`
                              );
                              return (
                                <li key={hit.id}>
                                  <button
                                    type="button"
                                    disabled={added}
                                    onClick={() => void addHit(hit)}
                                    className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                                      added
                                        ? "border-border/60 bg-surface-2/60 opacity-60"
                                        : "border-border bg-surface-2 hover:border-accent/40"
                                    }`}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate font-serif text-sm font-semibold text-accent-strong">
                                        {hit.reference}
                                      </span>
                                      <span className="block truncate text-xs text-muted">{hit.source}</span>
                                    </span>
                                    <span className="shrink-0 text-muted">
                                      <Glyph name={added ? "check" : "plus"} className="h-4 w-4" />
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void draw("draw")}
                        className={QUIET}
                      >
                        <Glyph name="book" className="h-4 w-4" />
                        {busy === "draw" ? "Drawing…" : "Draw one"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void draw("daily")}
                        className={QUIET}
                      >
                        <Glyph name="calendar" className="h-4 w-4" />
                        {busy === "daily" ? "Drawing…" : "Today’s verse"}
                      </button>
                      <button
                        type="button"
                        aria-expanded={favoritesOpen}
                        onClick={() => setFavoritesOpen((open) => !open)}
                        className={QUIET}
                      >
                        <Glyph name="star" className="h-4 w-4" />
                        From favorites
                        {availableFavorites.length > 0 && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-strong">
                            {availableFavorites.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {favoritesOpen && (
                      <div className="mt-3 border-t border-border/70 pt-3">
                        {favorites.length === 0 ? (
                          <p className="text-sm text-muted">
                            You haven’t starred anything yet. Tap the star on a passage while you are
                            reading and it will wait here.
                          </p>
                        ) : availableFavorites.length === 0 ? (
                          <p className="text-sm text-muted">
                            Every passage you have starred is already on a card.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {availableFavorites.map((favorite) => (
                              <li key={favorite.id}>
                                <button
                                  type="button"
                                  onClick={() => void addFavorite(favorite.id)}
                                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 px-3.5 py-2.5 text-left transition-colors hover:border-accent/40"
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-serif text-sm font-semibold text-accent-strong">
                                      {favorite.reference}
                                    </span>
                                    <span className="block truncate text-xs text-muted">
                                      {favorite.text}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-muted">
                                    <Glyph name="plus" className="h-4 w-4" />
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {error && <p className="mt-2.5 text-sm text-muted">{error}</p>}
                  </section>

                  {/* The deck so far. Not a preview — each row is where a
                      passage is taken back out again. */}
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      In this deck
                      <span className="ml-2 font-semibold tabular-nums text-accent-strong">
                        {draft.length}
                      </span>
                    </p>
                    {draft.length === 0 ? (
                      <p className="mt-2 rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted">
                        No passages yet. Search, draw one, or take one from your favorites.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {draft.map((item) => {
                          const chapter = chapters[item.id];
                          const last = item.parts[item.parts.length - 1]?.number ?? 0;
                          const next = chapter?.verses.find((verse) => verse.number === last + 1) ?? null;
                          const unit = item.kind === "scripture" ? "verse" : "paragraph";
                          return (
                            <li
                              key={item.id}
                              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-2.5"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-serif text-sm font-semibold text-accent-strong">
                                  {item.reference}
                                </span>
                                <span className="block truncate text-xs text-muted">
                                  {item.sourceLabel}
                                  {item.parts.length > 1 && ` · ${item.parts.length} ${unit}s`}
                                </span>
                              </span>

                              {/* One card can hold several verses, and this is
                                  where the run grows: the verse after the last
                                  one is added or taken back a tap at a time.
                                  Offered once the chapter is in hand, which is
                                  the point at which the app can name the verse
                                  it would be adding. */}
                              {chapter && (
                                <span className="flex shrink-0 items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRun(
                                        item,
                                        chapter,
                                        item.parts.slice(0, -1).map((part) => part.number)
                                      )
                                    }
                                    disabled={item.parts.length < 2}
                                    aria-label={`Take the last ${unit} back off ${item.reference}`}
                                    title={`One fewer ${unit}`}
                                    className={STEP}
                                  >
                                    <Glyph name="minus" className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="w-5 text-center text-xs font-semibold tabular-nums text-muted">
                                    {item.parts.length}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      next &&
                                      setRun(item, chapter, [
                                        ...item.parts.map((part) => part.number),
                                        next.number,
                                      ])
                                    }
                                    disabled={!next}
                                    aria-label={`Add the next ${unit} to ${item.reference}`}
                                    title={next ? `Add ${unit} ${next.number}` : `No more ${unit}s here`}
                                    className={STEP}
                                  >
                                    <Glyph name="plus" className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setDraft((previous) => previous.filter((entry) => entry.id !== item.id))
                                }
                                aria-label={`Remove ${item.reference} from this deck`}
                                className="shrink-0 rounded-full border border-border bg-surface-2 p-1.5 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
                              >
                                <Glyph name="close" className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              )}
            </div>

            {step === "custom" && (
              <footer className="border-t border-border/70 px-5 py-3.5">
                <button
                  type="button"
                  onClick={save}
                  disabled={!name.trim() || draft.length === 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Glyph name="check" className="h-4 w-4" />
                  {deck ? "Save changes" : "Save deck"}
                </button>
                {(!name.trim() || draft.length === 0) && (
                  <p className="mt-2 text-center text-xs text-muted">
                    {!name.trim()
                      ? "Give the deck a name to save it."
                      : "Add at least one passage to save it."}
                  </p>
                )}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const QUIET =
  "inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50";

/** One tap of the verse stepper on a card in the deck being built. */
const STEP =
  "rounded-full border border-border bg-surface-2 p-1.5 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-40";

/**
 * One room in the first step: what it is called, what it is for, and where it
 * goes. Disabled rather than absent when it is still to come, so the reader
 * knows the shelf is planned.
 */
function ChoiceRow({
  icon,
  title,
  hint,
  onClick,
  disabled = false,
  badge,
}: {
  icon: "cards" | "star";
  title: string;
  hint: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left transition-colors enabled:hover:border-accent/50 enabled:hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-accent-strong">
        <Glyph name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-serif text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-strong">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
      <span className="shrink-0 text-muted">
        <Glyph name="arrow" className="h-4 w-4" />
      </span>
    </button>
  );
}
