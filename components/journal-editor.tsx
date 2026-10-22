"use client";

import { useRef, useState } from "react";
import { RichTextEditor } from "./rich-text-editor";
import type { JournalEntry } from "@/lib/journal";

interface Props {
  /** The entry being edited, or null for one that has not been written yet. */
  entry: JournalEntry | null;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

/**
 * The journal's editor: a title, a body, and the controls that write it.
 *
 * The body itself — the toolbar, the shortcuts, the link picker, dictation —
 * lives in components/rich-text-editor.tsx, because a note on a passage writes
 * the same kind of text and should not have a second editor to drift from this
 * one. What is left here is the one thing an entry has that a note doesn't: a
 * title, and the entry's own save and delete.
 *
 * The body is held as HTML in a ref rather than in state: the editor is
 * uncontrolled (see its own note), and the page only needs the words when the
 * reader saves — writing them into state on every keystroke would re-render the
 * page under the caret to no purpose.
 */
export function JournalEditor(props: Props) {
  // A different entry is a different document, and the editor starts from
  // whatever it holds — so the form is remounted per entry rather than reset by
  // an effect that would write over the title while it is being typed in.
  return <EditorForm key={props.entry?.id ?? "new"} {...props} />;
}

function EditorForm({ entry, onSave, onCancel, onDelete }: Props) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const html = useRef(entry?.body ?? "");

  const save = () => {
    onSave(title, html.current);
  };

  return (
    <div className="rounded-3xl border border-border bg-surface p-4 sm:p-6">
      <label htmlFor="journal-title" className="sr-only">
        Entry title
      </label>
      <input
        id="journal-title"
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        className="w-full border-0 bg-transparent font-serif text-xl font-semibold text-foreground placeholder:text-muted focus:outline-none sm:text-2xl"
      />

      <RichTextEditor
        initialHtml={entry?.body ?? ""}
        onChange={(next) => {
          html.current = next;
        }}
        currentEntryId={entry?.id ?? null}
        placeholder="Note down thoughts or impressions..."
        ariaLabel="Entry body"
        className="mt-4"
        bodyClassName="min-h-[16rem]"
      />

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mr-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            <TrashIcon />
            Delete entry
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
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
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m1.5 0-.6 12.1A1.5 1.5 0 0 1 14.4 20.5H9.6a1.5 1.5 0 0 1-1.5-1.4L7.5 7" />
    </svg>
  );
}
