"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FeaturePage } from "./feature-page";
import { Glyph } from "./glyph";
import { JournalEditor } from "./journal-editor";
import {
  displayTitle,
  excerpt,
  entryById,
  removeEntry,
  sanitizeBody,
  saveEntry,
  addEntry,
  useJournal,
  type JournalEntry,
} from "@/lib/journal";
import { isInternalHref } from "@/lib/journal-links";

/**
 * The journal page: the reader's entries, and the way into one.
 *
 * Three views share the page, and which one is up is decided by the URL and one
 * piece of state. The entry being looked at lives in the query string
 * (`/journal?entry=…`), because entries link to each other: a link inside an
 * entry is an ordinary link to this page, and following it has to open the entry
 * it names — the same way a link to a passage goes to the reader. Reading the
 * query by hand, rather than through `useSearchParams`, keeps the page's own
 * chrome in the prerendered HTML; writing or editing is state and not a URL,
 * since a half-written entry is not a place and should not be reachable by
 * going back.
 *
 * The body is rendered as HTML, which is safe by construction: it went through
 * `sanitizeBody` on the way in, and it goes through it again on the way out —
 * storage is a file the reader could edit by hand, and a body is not the place
 * to trust what was written there.
 *
 * Links inside a body are followed with the router when they point back into
 * the app, so stepping from entry to entry doesn't reload it and the back
 * button walks the trail. Links out are left to the browser.
 */
export function JournalPage() {
  const router = useRouter();
  const entries = useJournal();
  const [writing, setWriting] = useState<"new" | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entry = selectedId ? entryById(entries, selectedId) : null;

  /**
   * Put the current view in the address bar, and follow the address bar when
   * the reader goes back.
   *
   * The state object is Next's own, passed through untouched: the entry is the
   * same route as the list, so the router's idea of where it is stays true, and
   * a back or forward out of here lands on a URL that says which entry it wants
   * — which is also what makes an entry link work after a reload.
   */
  const showUrl = useCallback((url: string) => {
    window.history.pushState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    const fromUrl = () => {
      setSelectedId(new URLSearchParams(window.location.search).get("entry"));
      setWriting(null);
      setConfirmDelete(false);
    };
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    return () => window.removeEventListener("popstate", fromUrl);
  }, []);

  const openEntry = (id: string) => {
    setWriting(null);
    setSelectedId(id);
    showUrl(`/journal?entry=${encodeURIComponent(id)}`);
  };

  const closeEntry = () => {
    setWriting(null);
    setSelectedId(null);
    showUrl("/journal");
  };

  /**
   * Follow a link found inside an entry. A link to an entry is opened here
   * rather than by the router, because it points at this same page: the router
   * would re-render the journal without the view changing, and the entry the
   * reader asked for would not appear. Everything else in the app is a place of
   * its own and goes through the router as usual.
   */
  const followLink = (href: string) => {
    const url = new URL(href, window.location.origin);
    if (url.pathname !== "/journal" && url.pathname !== "/journal/") {
      router.push(href);
      return;
    }
    const id = url.searchParams.get("entry");
    if (id) openEntry(id);
    else closeEntry();
  };

  return (
    <FeaturePage featureId="journal" subtitle="">
      {writing === "new" ? (
        <JournalEditor
          entry={null}
          onCancel={() => setWriting(null)}
          onSave={(title, body) => {
            const created = addEntry(title, body);
            setWriting(null);
            openEntry(created.id);
          }}
        />
      ) : writing === "edit" && entry ? (
        <JournalEditor
          entry={entry}
          onCancel={() => setWriting(null)}
          onSave={(title, body) => {
            saveEntry(entry.id, title, body);
            setWriting(null);
          }}
          onDelete={() => {
            removeEntry(entry.id);
            setWriting(null);
            closeEntry();
          }}
        />
      ) : entry ? (
        <EntryView
          entry={entry}
          onBack={closeEntry}
          onEdit={() => setWriting("edit")}
          onFollow={followLink}
          onDelete={() => setConfirmDelete(true)}
          confirming={confirmDelete}
          onCancelDelete={() => setConfirmDelete(false)}
          onConfirmDelete={() => {
            removeEntry(entry.id);
            setConfirmDelete(false);
            closeEntry();
          }}
        />
      ) : (
        <EntryList
          entries={entries}
          missing={Boolean(selectedId) && !entry}
          onNew={() => setWriting("new")}
          onOpen={openEntry}
        />
      )}
    </FeaturePage>
  );
}

/** The list of everything written, newest first. */
function EntryList({
  entries,
  missing,
  onNew,
  onOpen,
}: {
  entries: JournalEntry[];
  /** A link pointed at an id that isn't here — deleted, or from another device. */
  missing: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {entries.length > 0 && (
          <p className="text-sm text-muted">
            {`${entries.length} ${entries.length === 1 ? "entry" : "entries"} — newest first.`}
          </p>
        )}
        <button
          type="button"
          onClick={onNew}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 sm:w-auto"
        >
          <Glyph name="plus" className="h-4 w-4" />
          New entry
        </button>
      </div>

      {missing && (
        <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted">
          That entry isn&apos;t here any more.
        </p>
      )}

      {entries.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted">No entries yet...</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onOpen(entry.id)}
                className="w-full rounded-3xl border border-border bg-surface p-5 text-left transition-colors hover:border-accent/60"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 font-serif text-lg font-semibold text-foreground">
                    {displayTitle(entry)}
                  </p>
                  <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted">
                    {when(entry.updatedAt)}
                  </span>
                </div>
                {excerpt(entry) && (
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{excerpt(entry)}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One entry, as the reader wrote it. */
function EntryView({
  entry,
  onBack,
  onEdit,
  onFollow,
  onDelete,
  confirming,
  onCancelDelete,
  onConfirmDelete,
}: {
  entry: JournalEntry;
  onBack: () => void;
  onEdit: () => void;
  /** Follow an in-app link written into the entry. */
  onFollow: (href: string) => void;
  onDelete: () => void;
  confirming: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  // Sanitized on the way out as well as on the way in: what is in storage is
  // data, and data is not trusted with the page's DOM.
  const html = useMemo(() => sanitizeBody(entry.body), [entry.body]);

  return (
    <article>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
        >
          <Glyph name="arrow" className="h-4 w-4 rotate-180" />
          All entries
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            <PencilIcon />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            Delete
          </button>
        </div>
      </div>

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3">
          <p className="text-sm text-foreground">Delete this entry? It can&apos;t be brought back.</p>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="rounded-full bg-cta px-4 py-2 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="text-sm font-medium text-muted hover:text-accent-strong"
          >
            Keep it
          </button>
        </div>
      )}

      <h3 className="mt-5 font-serif text-2xl font-semibold text-foreground">{displayTitle(entry)}</h3>
      <p className="mt-1 text-xs uppercase tracking-wider text-muted">
        {when(entry.createdAt)}
        {entry.updatedAt !== entry.createdAt && ` · edited ${when(entry.updatedAt)}`}
      </p>

      <div
        className="journal-body mt-4 rounded-3xl border border-border bg-surface p-5 text-sm leading-relaxed text-foreground sm:p-6"
        onClick={(event) => {
          const anchor = (event.target as Element | null)?.closest?.("a");
          if (!anchor) return;
          const href = anchor.getAttribute("href") ?? "";
          if (!isInternalHref(href)) return;
          // An app link is a place in the app, so it is followed the app's way:
          // no page load, and the back button returns to the entry.
          event.preventDefault();
          onFollow(href);
        }}
        // Safe by construction — see the file's own note, and lib/journal.ts.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

/** A short date: "12 Mar 2026". */
function when(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5ZM4 20l1-4" />
    </svg>
  );
}
