"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "./glyph";
import { RichTextEditor } from "./rich-text-editor";
import type { AnnotationLink } from "@/lib/annotations";
import { resolveReference } from "@/lib/reader";

interface Props {
  open: boolean;
  /** The reference the selection sits in, e.g. "Jeremiah 3:15". */
  title: string;
  /** The words selected, quoted under the heading. */
  quote: string;
  initialNote: string;
  initialLink: AnnotationLink | null;
  /** Which field the sheet opens on — the panel's Note or its Link. */
  focus?: "note" | "link";
  onSave: (mark: { note: string; link: AnnotationLink | null }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * The sheet a mark's words are written on.
 *
 * One sheet for both halves of an annotation, because Gospel Library treats
 * them as one thing: the note says what the reader thought, the link says what
 * it points at, and the highlight is how the two are found again. The note uses
 * the journal's own editor (components/rich-text-editor.tsx) so a mark can hold
 * the same bold, lists and in-app links an entry can.
 *
 * The link is typed as a citation — "Alma 32:21" — and checked against the
 * library before it is saved, so a link either opens something or isn't kept.
 */
export function AnnotationDialog({
  open,
  title,
  quote,
  initialNote,
  initialLink,
  focus = "note",
  onSave,
  onDelete,
  onClose,
}: Props) {
  const html = useRef(initialNote);
  const linkBox = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState(initialLink?.label ?? "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Opened for its link, the sheet should be ready to type a reference — not
  // with the caret in a note the reader did not ask to write.
  useEffect(() => {
    if (!open || focus !== "link") return;
    const id = window.setTimeout(() => linkBox.current?.focus(), 140);
    return () => window.clearTimeout(id);
  }, [open, focus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const save = async () => {
    setSaving(true);
    setLinkError(null);
    try {
      const typed = reference.trim();
      let link: AnnotationLink | null = null;
      if (typed && typed !== initialLink?.label) {
        link = await resolveReference(typed);
        if (!link) {
          setLinkError("That reference isn't in this library. Try “Alma 32:21”.");
          setSaving(false);
          return;
        }
      } else if (typed) {
        link = initialLink;
      }
      onSave({ note: html.current, link });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close the annotation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={initialNote ? "Edit the annotation" : "Annotate the selection"}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.8 }}
            className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-accent-strong">
                  <Glyph name="journal" className="h-4 w-4" />
                  {title}
                </p>
                <p className="mt-0.5 text-xs text-muted">Annotate these words</p>
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

            <p className="mt-2 line-clamp-3 border-l-2 border-accent/40 pl-3 font-serif text-sm leading-relaxed text-foreground/75">
              {quote}
            </p>

            <RichTextEditor
              initialHtml={initialNote}
              onChange={(next) => {
                html.current = next;
              }}
              autoFocus={focus === "note"}
              placeholder="What struck you about these words?"
              ariaLabel="Your note"
              className="mt-4"
              bodyClassName="min-h-[8rem]"
            />

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="annotation-link">
              Link to a passage
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-muted">
                <Glyph name="link" className="h-4 w-4" />
              </span>
              <input
                ref={linkBox}
                id="annotation-link"
                type="text"
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value);
                  setLinkError(null);
                }}
                placeholder="e.g. Alma 32:21"
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            {linkError && <p className="mt-1.5 text-xs text-accent-strong">{linkError}</p>}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    onClose();
                  }}
                  className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
                >
                  Delete
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
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
