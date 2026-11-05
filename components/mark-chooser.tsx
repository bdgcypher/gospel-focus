"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { Glyph } from "./glyph";
import { noteText, rangeText, type Annotation } from "@/lib/annotations";

interface Props {
  /** Each entry is one mark: every verse segment it covers, in reading order. */
  groups: Annotation[][];
  /** The verse's words, so a segment can be shown as the reader sees it. */
  verseText: (verse: number) => string;
  onPick: (group: Annotation[]) => void;
  onClose: () => void;
}

/**
 * The marks under one patch of words, when there is more than one.
 *
 * A chapter can hold a highlight, an underline and a note on the same words —
 * Gospel Library's own marks arrive that way — and a tap cannot choose between
 * them on the reader's behalf. So the marks are laid out as they sit on the page,
 * each drawn in its own colour and style: the fill is a fill, the underline is an
 * underline, and the words themselves say which is which before the reader picks
 * one.
 *
 * It wears the page's own colours rather than the marking tool's dark coat. The
 * panel is a tool held over the words and is dark so its swatches always read as
 * the colours they will paint; this is a list of the reader's own marks, so it is
 * a surface of the page, and in daylight it is the page's paper.
 *
 * Long marks are trimmed to a few lines each. Whole verses were listed in full,
 * which turned two marks into a sheet a page tall; the reader is choosing between
 * them, and four lines are enough to know which. The sheet scrolls if even that
 * is taller than the screen.
 *
 * Picking a row hands that mark back to the marking panel rather than opening a
 * note: the reader asked to see this mark, not to write on it.
 */
export function MarkChooser({ groups, verseText, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <motion.button
          type="button"
          aria-label="Close"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-black/50"
        />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a mark"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
          className="relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-border bg-background text-foreground shadow-2xl sm:max-h-[80dvh] sm:rounded-[1.75rem]"
        >
          <h2 className="shrink-0 px-5 pt-5 font-serif text-xl font-semibold text-foreground">Choose Item</h2>

          <ul className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5">
            {groups.map((group) => {
              const head = group[0];
              const note = noteText(group.find((segment) => segment.note)?.note);
              const words = group
                .map((segment) => rangeText(verseText(segment.verse), segment.startWord, segment.endWord))
                .join(" ");
              return (
                <li key={head.groupId ?? head.id}>
                  <button
                    type="button"
                    onClick={() => onPick(group)}
                    className="flex w-full items-start gap-3 rounded-xl text-left transition-colors hover:bg-surface-2"
                  >
                    <Glyph name="pencil" className="mt-0.5 h-6 w-6 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block line-clamp-4 font-serif text-[1.02rem] leading-[1.45]"
                        style={
                          head.style === "underline" && head.color !== "clear"
                            ? {
                                textDecoration: "underline",
                                // The page's own ink, not the pale face: a wash
                                // painted on as a line is a wash you cannot see.
                                textDecorationColor: `var(--mark-ink-${head.color})`,
                                textDecorationThickness: "2px",
                                textUnderlineOffset: "3px",
                              }
                            : head.color !== "clear"
                              ? {
                                  backgroundColor: `var(--mark-${head.color})`,
                                  // The page's own ink, not the mark's: the ink
                                  // token is tuned for a 2px line, and this is
                                  // type on the pastel.
                                  color: "var(--foreground)",
                                  // The same rounded band the page draws.
                                  borderRadius: "0.22rem",
                                }
                              : undefined
                        }
                      >
                        {words}
                      </span>
                      {note && <span className="mt-1 block line-clamp-2 text-xs text-muted">{note}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex shrink-0 justify-end px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:pb-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-accent-strong transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
