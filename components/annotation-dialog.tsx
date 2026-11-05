"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "./glyph";
import { PassageLinkPicker } from "./passage-link-picker";
import { RowMenu } from "./row-menu";
import { useReorder } from "./use-reorder";
import { RichTextEditor } from "./rich-text-editor";
import type { AnnotationLink } from "@/lib/annotations";

interface Props {
  open: boolean;
  /** The reference the selection sits in, e.g. "Jeremiah 3:15". */
  title: string;
  /** The words selected, quoted under the heading. */
  quote: string;
  initialNote: string;
  /** The note's optional name, shown as its heading wherever it is listed. */
  initialTitle?: string;
  /** The passages the mark already points at, in the order they were added. */
  initialLinks: AnnotationLink[];
  /** Which field the sheet opens on — the panel's Note or its Link. */
  focus?: "note" | "link";
  onSave: (mark: { note: string; links: AnnotationLink[]; title: string }) => void;
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
 * Links are picked out of the library: the search finds a chapter by its words
 * or its reference, the chapter slides in from the right, and the reader taps
 * the verses the mark should point at (components/passage-link-picker.tsx). A
 * link is therefore always a place the library has, and it can name a range of
 * verses rather than a single one. A mark holds a chain of them — the one it was
 * made with and however many were added after — and the sheet lists the chain
 * while the search underneath stays ready for the next one.
 */
export function AnnotationDialog({
  open,
  title,
  quote,
  initialNote,
  initialTitle = "",
  initialLinks,
  focus = "note",
  onSave,
  onDelete,
  onClose,
}: Props) {
  const html = useRef(initialNote);
  const heading = useRef(initialTitle);
  const [links, setLinks] = useState<AnnotationLink[]>(initialLinks);
  /** The link of the chain the search is replacing, if any. */
  const [editing, setEditing] = useState<number | null>(null);
  /**
   * Put the link dragged from one place into another.
   *
   * The list is reordered as the drag passes each row, so what the reader sees
   * under the hand is the order that will be saved. A replacement in progress
   * is abandoned: its index would point at a different link afterwards.
   */
  const reorder = useReorder<HTMLUListElement>((from, to) => {
    setLinks((old) => {
      if (from === to || from < 0 || to < 0 || from >= old.length || to >= old.length) return old;
      const next = [...old];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setEditing(null);
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const save = () => {
    onSave({ note: html.current, links, title: heading.current.trim() });
    onClose();
  };

  /**
   * The search's answer, put where it belongs in the chain.
   *
   * Adding appends; editing replaces the link being changed in its own place,
   * so the order the reader arranged is kept. The same place twice is still one
   * link either way — a chain that names the same passage twice says nothing
   * more than one that names it once.
   */
  const chooseLink = (link: AnnotationLink) => {
    setLinks((old) => {
      const next =
        editing === null
          ? [...old, link]
          : old.map((entry, at) => (at === editing ? link : entry));
      return next.filter((entry, at) => next.findIndex((other) => other.label === entry.label) === at);
    });
    setEditing(null);
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
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
              >
                <Glyph name="close" className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 line-clamp-3 border-l-2 border-accent/40 pl-3 font-serif text-sm leading-relaxed text-foreground/75">
              {quote}
            </p>

            <label htmlFor="annotation-title" className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted">
              Title
            </label>
            <input
              id="annotation-title"
              type="text"
              defaultValue={initialTitle}
              onChange={(event) => {
                heading.current = event.target.value;
              }}
              placeholder={title}
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />

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

            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">
              {links.length ? "Linked passages" : "Link to a passage"}
            </p>
            {links.length > 0 && (
              <ul {...reorder.containerProps} aria-label="Linked passages" className="mt-1.5 space-y-1.5">
                {links.map((link, index) => {
                  const on = editing === index;
                  return (
                    // Keyed by the place, not by its position: a row that moves
                    // during a drag has to be the same row afterwards.
                    <li
                      key={`${link.book}/${link.chapter}/${link.section}/${link.label}`}
                      className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 ${
                        on ? "border-accent/60 bg-accent/10" : "border-border bg-surface"
                      } ${reorder.dragging === index ? "bg-surface-2" : ""}`}
                    >
                      {/* Drag the grip to put the link elsewhere in the chain;
                          the arrow keys do the same without a pointer. It sits
                          at the head of the row, where a list's handle belongs. */}
                      <button
                        type="button"
                        aria-label={`Reorder the link to ${link.label}`}
                        data-reorder-handle
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                          event.preventDefault();
                          reorder.moveTo(index, index + (event.key === "ArrowUp" ? -1 : 1));
                        }}
                        className={`-ml-1.5 grid h-7 w-6 shrink-0 touch-none place-items-center text-muted transition-colors hover:text-foreground ${
                          reorder.dragging === index ? "cursor-grabbing text-foreground" : "cursor-grab"
                        }`}
                      >
                        <Glyph name="grip" className="h-4 w-4" />
                      </button>
                      <Glyph name="link" className="h-4 w-4 shrink-0 text-accent-strong" />
                      <span className="min-w-0 flex-1 truncate pl-1 text-sm font-medium text-foreground">
                        {link.label}
                      </span>
                      {/* The same kebab as a bookmark's row: the link itself is
                          the row, and changing it or taking it out of the
                          chain is done from the menu. */}
                      <RowMenu
                        label={`Options for the link to ${link.label}`}
                        actions={[
                          {
                            label: on ? "Cancel" : "Edit",
                            onSelect: () => setEditing(on ? null : index),
                          },
                          {
                            label: "Delete",
                            onSelect: () => {
                              setLinks((old) => old.filter((_, at) => at !== index));
                              setEditing(null);
                            },
                          },
                        ]}
                      />
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-2 rounded-2xl border border-border bg-surface-2/60 p-3">
              <PassageLinkPicker
                // A fresh picker for each link being changed: it opens on the
                // place that link already names, rather than on the last search.
                key={editing === null ? "add" : `edit-${editing}`}
                initialQuery={editing !== null ? links[editing]?.label ?? "" : ""}
                autoFocus={editing !== null || (focus === "link" && !links.length)}
                onPick={(picked) => chooseLink(picked.link)}
              />
            </div>

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
