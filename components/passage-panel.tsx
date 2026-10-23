"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "./glyph";
import type { Verse } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** What is open: a chapter ("1 Nephi 3"), or a talk's title. */
  title: string;
  /** The line under it: the volume and verse count, or the speaker and session. */
  subtitle?: string;
  /** The whole chapter or talk, or null until it arrives. */
  verses: Verse[] | null;
  /** The verse or paragraph the game was drawn from, marked where it sits. */
  highlight?: number | null;
  loading?: boolean;
  error?: string | null;
}

/**
 * The whole chapter (or talk) a game came from, in a panel from the right.
 *
 * A game's reference used to be a link away from the board, which cost a reader
 * their place mid-board to look one thing up. The panel keeps the board where it
 * was, scrolls the passage on its own so the page behind it never moves, and
 * marks the verse the draw landed on. It is the same text the reader holds —
 * every verse of the chapter — so a reader can look the answer up without
 * leaving the board.
 *
 * Full width on a phone, a 28rem column from the right on a wider screen;
 * Escape, the close button and a tap on the backdrop all put it away.
 */
export function PassagePanel({
  open,
  onClose,
  title,
  subtitle,
  verses,
  highlight = null,
  loading = false,
  error = null,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /** The verse the game was drawn from, if one is marked. */
  const marked = useRef<HTMLLIElement>(null);
  /**
   * The close handler in a ref, so Escape keeps working while the page
   * re-renders. Pages pass an inline function here; subscribing to it directly
   * tore the listener down and put it back on every render — and a listener
   * removed mid-dispatch (which is what a re-render during a key press does)
   * never hears the key it was there for.
   */
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();

    // The page behind stays where it is, so closing the panel returns the reader
    // to the board rather than to wherever a touch on the backdrop happened to
    // drag it. That is the stylesheet's doing, not this effect's: the panel is a
    // popup like any other and carries aria-modal, which is what holds the
    // document still while it is up (see "A popup holds the page still" in
    // globals.css).
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Open on the marked verse rather than at verse one.
   *
   * A reader opening a chapter from a game is looking for the place the draw
   * landed, which in a long chapter can be far below the fold. The panel scrolls
   * itself so that verse sits in the middle of the pane, and only when it opens:
   * once the reader scrolls away, a re-render leaves them where they are.
   */
  useEffect(() => {
    if (!open || !verses || highlight == null) return;
    const box = scroller.current;
    const item = marked.current;
    if (!box || !item) return;

    const boxRect = box.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    box.scrollTop +=
      itemRect.top - boxRect.top - box.clientHeight / 2 + itemRect.height / 2;
  }, [open, verses, highlight]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="passage-panel-title"
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="passage-panel-title"
              className="truncate font-serif text-xl font-semibold text-foreground"
            >
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the passage"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </header>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {error ? (
            <p className="text-sm text-muted">{error}</p>
          ) : loading || !verses ? (
            <p className="text-sm text-muted" role="status">
              Loading the chapter…
            </p>
          ) : (
            <ol className="space-y-5">
              {verses.map((verse) => {
                const current = highlight === verse.number;
                return (
                  <li
                    key={verse.number}
                    ref={current ? marked : undefined}
                    aria-current={current ? "true" : undefined}
                    className={
                      current
                        ? "-mx-3 flex gap-3 rounded-xl bg-accent/10 px-3 py-2"
                        : "flex gap-3"
                    }
                  >
                    <span className="shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted">
                      {verse.number}
                    </span>
                    <span
                      className={`text-sm leading-relaxed ${
                        current ? "text-foreground" : "text-foreground/85"
                      }`}
                    >
                      {verse.text}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
