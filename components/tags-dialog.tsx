"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "./glyph";
import { cleanTag, tagKey } from "@/lib/annotations";

/**
 * The sheet a mark's tags are written on.
 *
 * A tag is a short name for a theme — "faith", "covenants", "watchman" — and it
 * is typed rather than picked, so the field is the point of the sheet. Tags
 * already used in the library sit under it as suggestions: a reader who has
 * tagged one passage "faith" should not have to spell it again to find the
 * others, and two spellings of one theme would split the list they are meant to
 * gather. Nothing is saved until Save, as in the note sheet.
 */
export function TagsDialog({
  title,
  quote,
  initialTags,
  suggestions,
  onSave,
  onClose,
}: {
  /** The reference the words sit in, e.g. "Jeremiah 3:15". */
  title: string;
  /** The words the tags belong to, quoted under the heading. */
  quote: string;
  initialTags: string[];
  /** Every tag already used in the library, for one-tap reuse. */
  suggestions: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [tags, setTags] = useState<string[]>(() => initialTags.map(cleanTag).filter(Boolean));
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = (raw: string) => {
    const tag = cleanTag(raw);
    if (!tag) return;
    setTags((old) => (old.some((entry) => tagKey(entry) === tagKey(tag)) ? old : [...old, tag]));
    setDraft("");
  };

  const reuse = suggestions.filter(
    (tag) => !tags.some((entry) => tagKey(entry) === tagKey(tag))
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <motion.button
        type="button"
        aria-label="Close the tags"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Tags for ${title}`}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.8 }}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="inline-flex min-w-0 items-center gap-2 font-serif text-lg font-semibold text-accent-strong">
            <Glyph name="tag" className="h-4 w-4" />
            <span className="truncate">{title}</span>
          </p>
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

        <label htmlFor="tag-field" className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted">
          Tags
        </label>
        {tags.length > 0 && (
          <ul aria-label="Tags on these words" className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tagKey(tag)}>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 py-1 pl-3 pr-1 text-xs font-semibold text-accent-strong">
                  #{tag}
                  <button
                    type="button"
                    onClick={() => setTags((old) => old.filter((entry) => tagKey(entry) !== tagKey(tag)))}
                    aria-label={`Remove the tag ${tag}`}
                    className="grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-accent/20"
                  >
                    <Glyph name="close" className="h-3 w-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add(draft);
          }}
        >
          <input
            id="tag-field"
            ref={field}
            type="text"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "," ) {
                event.preventDefault();
                add(draft);
              }
            }}
            placeholder="Add a tag, like faith"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={!cleanTag(draft)}
            aria-label="Add the tag"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-accent-strong transition-colors hover:bg-accent/15 disabled:opacity-40"
          >
            <Glyph name="plus" className="h-4 w-4" />
          </button>
        </form>

        {reuse.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Used before</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {reuse.map((tag) => (
                <button
                  key={tagKey(tag)}
                  type="button"
                  onClick={() => add(tag)}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(tags)}
            className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
