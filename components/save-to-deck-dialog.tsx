"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Glyph } from "./glyph";
import {
  addCardToDeck,
  createDeck,
  removeFromDeck,
  useDecks,
  useMemory,
  type MemoryItem,
} from "@/lib/memorize";

/**
 * Where a card goes: which of the reader's decks it belongs in.
 *
 * There is no default shelf. A memorized passage lives in a deck — a group the
 * reader named, or one they will be handed later — and a card that belonged to
 * nothing would be a card with nowhere to be found. So the sheet lists decks and
 * nothing else, and where there are none it offers to make the first one on the
 * spot rather than filing the card somewhere unnamed.
 *
 * One passage is one card, and one card can sit in several decks: the words,
 * the hiding level and the recitations belong to the passage, not to the shelf.
 * So each row is a switch rather than a destination — a plus means the card is
 * not in that deck yet, a tick means it is, and pressing it changes that. Taking
 * a card out of its last deck is what deletes it, which is why there is no
 * separate remove control to hunt for.
 *
 * The draft it is handed is the card as it would be saved (`itemFromPassage`,
 * `itemFromFavorite`), which is what lets the same sheet serve a drawn passage,
 * a favorited one and a run of verses from the reader.
 */
export function SaveToDeckDialog({
  open,
  onClose,
  draft,
}: {
  open: boolean;
  onClose: () => void;
  /** The card this would become, built the way the caller's save builds it. */
  draft: MemoryItem;
}) {
  const decks = useDecks();
  const memory = useMemory();
  /** The card as it is stored, when it is already in a deck. */
  const existing = memory.find((item) => item.id === draft.id);
  const inDeck = (deckId: string) => existing?.deckIds.includes(deckId) ?? false;

  /** Whether the sheet is asking for a new deck's name rather than listing them. */
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  // Shutting the sheet also puts the naming step away, so the next opening
  // starts on the list rather than halfway through making a deck.
  const close = useCallback(() => {
    setNaming(false);
    setName("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // The sheet stays open while the reader moves the card between decks: putting
  // it in two of them is one visit, not two.
  const toggle = (deckId: string) => {
    if (inDeck(deckId)) removeFromDeck(draft.id, deckId);
    else addCardToDeck(draft, deckId);
  };

  /**
   * Make the deck with the card already in it: one new shelf holding this one
   * passage, ready to be added to from the memorize page. This is a save, so
   * the sheet closes on it.
   */
  const makeDeck = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createDeck(trimmed, [draft]);
    close();
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
            aria-labelledby="save-memorize-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl"
          >
            <header className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2
                  id="save-memorize-title"
                  className="font-serif text-lg font-semibold text-foreground"
                >
                  Memorize
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
              >
                <Glyph name="close" className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {naming ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    makeDeck();
                  }}
                >
                  <label
                    htmlFor="new-deck-name"
                    className="text-xs font-semibold uppercase tracking-wider text-muted"
                  >
                    Deck name
                  </label>
                  <input
                    id="new-deck-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Temptation killers"
                    // Focused on opening, since the reader came here to type.
                    autoFocus
                    className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent/60 focus:outline-none"
                  />
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNaming(false);
                        setName("");
                      }}
                      className="inline-flex items-center rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={!name.trim()}
                      className="inline-flex items-center rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {decks.map((deck) => (
                      <li key={deck.id}>
                        <DestinationRow
                          title={deck.name}
                          count={memory.filter((item) => item.deckIds.includes(deck.id)).length}
                          inDeck={inDeck(deck.id)}
                          onClick={() => toggle(deck.id)}
                        />
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => setNaming(true)}
                    className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-left text-sm font-medium text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {decks.length === 0 ? "Make your first deck" : "New deck"}
                    </span>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current">
                      <Glyph name="plus" className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * One deck: a name, what it is, how much is there, and whether this card is in
 * it. The state is the control — a plus to put the card here, a tick to take it
 * back out.
 */
function DestinationRow({
  title,
  count,
  inDeck,
  onClick,
}: {
  title: string;
  count: number;
  inDeck: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={inDeck}
      aria-label={inDeck ? `Take the card out of ${title}` : `Put the card in ${title}`}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
        inDeck
          ? "border-accent/60 bg-accent/5 hover:border-accent"
          : "border-border bg-surface hover:border-accent/50 hover:bg-accent/5"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {count} {count === 1 ? "card" : "cards"}
        </span>
      </span>
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
          inDeck ? "border-accent bg-accent text-accent-contrast" : "border-border text-muted"
        }`}
      >
        <Glyph name={inDeck ? "check" : "plus"} className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
