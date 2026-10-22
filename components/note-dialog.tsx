"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "./glyph";
import { RichTextEditor } from "./rich-text-editor";

interface Props {
  open: boolean;
  /** The passage's citation, shown so the reader knows what they are annotating. */
  title: string;
  /** Where the passage comes from, e.g. "Book of Mormon". */
  source: string;
  /** The passage itself, in brief, under the heading. */
  passage: string;
  /** What is already written, as HTML, or "" for a passage with no note yet. */
  initial: string;
  /**
   * Save the note. An empty body means "no note" — the caller decides whether
   * that deletes an old one or simply never writes a new one (see lib/notes.ts).
   */
  onSave: (text: string) => void;
  /** Offered only when there is a note to remove. */
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * The box a note is written in, wherever notes are written: on a saved passage
 * in the favorites list, or on the draw in the reader.
 *
 * It is deliberately a box rather than an inline field. A note is written about
 * a passage the reader is looking at, and on a phone the paragraph being written
 * about would scroll away behind a field that unfolded inside the card; a sheet
 * keeps both in view, and it is the same sheet from either page.
 *
 * The text is held here, not by the page: the body starts from whatever is
 * stored when it opens and the page is told once, on save. It is written with
 * the journal's own editor (components/rich-text-editor.tsx), so a note can be
 * bold, in a list, or linked back into the app exactly as an entry can. Escape
 * and the backdrop close it without saving, because a note half-written is not
 * a thing to persist by accident.
 */
export function NoteDialog({ open, title, source, passage, initial, onSave, onDelete, onClose }: Props) {
  // The caller gives this component a fresh key per opening (see the favorites
  // page and the passage card), so the draft starts from the stored note without
  // an effect to reset it: the note being edited is decided by what mounted.
  const html = useRef(initial);
  /** The link picker sits over this sheet, so it answers Escape before the sheet does. */
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !linking) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, linking, onClose]);

  if (typeof document === "undefined") return null;

  const save = () => {
    onSave(html.current);
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close the note"
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
            aria-label={initial ? "Edit the note" : "Write a note"}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.8 }}
            className="relative z-10 w-full max-w-lg rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-accent-strong">
                  <Glyph name="journal" className="h-4 w-4" />
                  {title}
                </p>
                <p className="mt-0.5 text-xs text-muted">{source}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 shrink-0 rounded-full border border-border bg-surface-2 p-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                <Glyph name="close" className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 line-clamp-2 border-l-2 border-accent/40 pl-3 font-serif text-sm leading-relaxed text-foreground/70">
              {passage}
            </p>

            <RichTextEditor
              initialHtml={initial}
              onChange={(next) => {
                html.current = next;
              }}
              autoFocus
              placeholder="What struck you about this passage?"
              ariaLabel="Your note"
              className="mt-4"
              bodyClassName="min-h-[9rem]"
              onLinkOpenChange={setLinking}
            />

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {initial && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    onClose();
                  }}
                  className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
                >
                  Delete note
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
                onClick={save}
                className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
              >
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
