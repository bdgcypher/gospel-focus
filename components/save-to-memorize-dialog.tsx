"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo } from "react";
import { Glyph } from "./glyph";
import { addPassage, itemFromPassage, useDecks, useMemory } from "@/lib/memorize";
import type { Passage } from "@/lib/types";

/**
 * Where a run of verses from the reader goes.
 *
 * The reading card can take a passage to heart one verse at a time by starring
 * it, and a starred passage can be brought into memorization from the favorites
 * page — but the run the reader has actually picked out on the card has nowhere
 * to go from there. This is that way in: the verses that are selected become one
 * card, and the reader says which shelf it belongs on.
 *
 * A card is one passage wherever it lives (see lib/memorize.ts), so a verse
 * already on a card is not offered a second home: the dialog says where it is
 * instead of quietly doing nothing. Moving a card between shelves is not a thing
 * the app does yet, and pretending otherwise here would be a lie.
 */
export function SaveToMemorizeDialog({
  open,
  onClose,
  passage,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  passage: Passage;
  /** The verses (or paragraphs) to save as one card, in any order. */
  sections: number[];
}) {
  const decks = useDecks();
  const memory = useMemory();

  // The card this would become, built the same way the save builds it, so the
  // id the dialog checks against the list is the id the save would write.
  const draft = useMemo(
    () => itemFromPassage(passage, undefined, sections),
    [passage, sections]
  );
  const existing = memory.find((item) => item.id === draft.id);
  const savedTo = existing
    ? existing.deckId
      ? (decks.find((deck) => deck.id === existing.deckId)?.name ?? "a deck")
      : "your memory list"
    : null;

  const unit = passage.kind === "scripture" ? "verse" : "paragraph";
  const count = draft.parts.length;
  const where = count === 1 ? `1 ${unit}` : `${count} ${unit}s`;

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Writing the card is a synchronous write to the store (lib/memorize.ts), so
  // the sheet closes on the same tap that saves — no waiting state to manage.
  const save = (deckId?: string) => {
    addPassage(passage, deckId, sections);
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
                  Memorize {where}
                </h2>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {draft.reference} · {passage.sourceLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="shrink-0 rounded-full border border-border bg-surface-2 p-1.5 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                <Glyph name="close" className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {savedTo ? (
                <p className="rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-muted">
                  Already saved to <span className="font-semibold text-foreground">{savedTo}</span>.
                  It is one card wherever it lives, so it is not saved twice.
                </p>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Put this card in
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    <li>
                      <DestinationRow
                        title="Memory list"
                        hint="The cards you are working on, without a deck of their own."
                        count={memory.filter((item) => !item.deckId).length}
                        onClick={() => save(undefined)}
                      />
                    </li>
                    {decks.map((deck) => (
                      <li key={deck.id}>
                        <DestinationRow
                          title={deck.name}
                          hint="A deck of yours."
                          count={memory.filter((item) => item.deckId === deck.id).length}
                          onClick={() => save(deck.id)}
                        />
                      </li>
                    ))}
                  </ul>

                  {decks.length === 0 && (
                    <p className="mt-3 text-xs text-muted">
                      Decks are made on the memorize page; this card will wait on the list until
                      then.
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** One place the card could live: a name, what it is, and how much is there. */
function DestinationRow({
  title,
  hint,
  count,
  onClick,
}: {
  title: string;
  hint: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/5"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {count} {count === 1 ? "card" : "cards"} · {hint}
        </span>
      </span>
      <span className="shrink-0 text-muted">
        <Glyph name="arrow" className="h-4 w-4" />
      </span>
    </button>
  );
}
