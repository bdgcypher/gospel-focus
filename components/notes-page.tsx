"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { BackLink } from "./back-link";
import { Glyph } from "./glyph";
import {
  marksWithNotes,
  noteText,
  searchMarks,
  tagKey,
  useAnnotations,
  type Annotation,
} from "@/lib/annotations";
import { readerHref } from "@/lib/reader";

/**
 * Every thought the reader has written on the words.
 *
 * The marks list inside the reader answers "what have I marked *here*"; this
 * answers the other question, the one that gets asked a week later — what have I
 * written anywhere. Notes are grouped by the chapter they sit on so a run of
 * them reads as the study it was, and the search box matches the note's words,
 * the reference, and the tags at once.
 *
 * The tags are pills under each note, and pressing one narrows the page to the
 * notes wearing it — a theme is followed by asking for it, not by reading until
 * it comes up again. Pressing the chosen pill, or its x, lets it go.
 *
 * A highlight without a note is deliberately absent: it is a place in the text,
 * and places are found by the reader itself. A note is the thing worth
 * collecting. Every row opens the reader at its verse, where the note can be
 * read in full and edited where it was written.
 */
export function NotesPage() {
  const annotations = useAnnotations();
  const [query, setQuery] = useState("");
  /** The tag the page is narrowed to; null shows every note. */
  const [tag, setTag] = useState<string | null>(null);

  const notes = useMemo(() => marksWithNotes(annotations), [annotations]);
  const found = useMemo(() => {
    const matches = searchMarks(notes, query);
    if (!tag) return matches;
    const key = tagKey(tag);
    return matches.filter((note) => note.tags.some((entry) => tagKey(entry) === key));
  }, [notes, query, tag]);

  const groups = useMemo(() => {
    const byDoc = new Map<string, Annotation[]>();
    for (const note of found) {
      const list = byDoc.get(note.doc);
      if (list) list.push(note);
      else byDoc.set(note.doc, [note]);
    }
    return [...byDoc.entries()]
      .map(([doc, list]) => ({
        doc,
        heading: list[0].book === "General Conference" ? `“${list[0].chapter}”` : `${list[0].book} ${list[0].chapter}`,
        notes: [...list].sort((a, b) => a.verse - b.verse || a.startWord - b.startWord),
      }))
      .sort((a, b) => a.heading.localeCompare(b.heading, "en", { numeric: true }));
  }, [found]);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* The arrow is drawn 10px left, the empty part of its own icon, so it
            lines up with the heading under it the way every page header in the
            app does (see components/feature-page.tsx). */}
        <div className="flex items-center justify-between gap-3">
          <BackLink className="-ml-2.5" />
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            <Glyph name="gear" className="h-4 w-4" />
            Import / export
          </Link>
        </div>

        <header className="mt-6">
          <h1 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">Marks &amp; Notes</h1>
          <p className="mt-1 text-sm text-muted">
            {notes.length === 0
              ? "Nothing written on the words yet."
              : `${notes.length} ${notes.length === 1 ? "note" : "notes"} across your reading.`}
          </p>
        </header>

        {notes.length > 0 && (
          <div className="relative mt-5">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
              <Glyph name="search" className="h-4 w-4" />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your notes, references, or tags"
              aria-label="Search your notes"
              className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {tag && notes.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <span>Tagged</span>
            <button
              type="button"
              onClick={() => setTag(null)}
              aria-label={`Stop showing only the notes tagged ${tag}`}
              className="inline-flex items-center gap-1 rounded-full bg-accent/15 py-1 pl-3 pr-1 text-xs font-semibold text-accent-strong transition-colors hover:bg-accent/25"
            >
              #{tag}
              <span className="grid h-6 w-6 place-items-center">
                <Glyph name="close" className="h-3 w-3" />
              </span>
            </button>
          </div>
        )}

        {notes.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-border px-6 py-14 text-center">
            <span className="mx-auto block text-accent/40">
              <Glyph name="journal" className="mx-auto h-10 w-10" />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">No notes yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Select words in the reader and add a note — every one you write shows up here.
            </p>
            <Link
              href="/read"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
            >
              <Glyph name="book" className="h-4 w-4" />
              Open the reader
            </Link>
          </div>
        ) : groups.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            {tag
              ? `No notes are tagged #${tag}${query ? ` and match “${query}”` : ""}.`
              : `No notes match “${query}”.`}
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {groups.map((group) => (
              <section key={group.doc}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{group.heading}</h2>
                <ul className="space-y-2">
                  {group.notes.map((note) => (
                    <li key={note.id}>
                      <NoteRow note={note} tag={tag} onTag={setTag} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted">
          Notes are kept on this device. Import or export them as a Gospel Library file in{" "}
          <Link href="/settings" className="text-accent-strong hover:underline">
            Settings
          </Link>
          .
        </p>
      </main>
    </AppShell>
  );
}

/**
 * One note: the words, where they sit, and a way back to them.
 *
 * The tags sit under the note as pills rather than in the reference line: they
 * are the reader's own names for a theme, and a name is a door. Pressing one
 * narrows the page to it, pressing it again lets it go.
 */
function NoteRow({
  note,
  tag,
  onTag,
}: {
  note: Annotation;
  /** The tag the page is narrowed to, if any. */
  tag: string | null;
  onTag: (tag: string | null) => void;
}) {
  const href =
    note.doc.startsWith("c/") && note.doc.split("/")[1]
      ? readerHref({
          kind: "conference",
          book: "General Conference",
          chapter: note.chapter,
          conferenceId: note.doc.split("/")[1],
          verse: note.verse,
        })
      : readerHref({ kind: "scripture", book: note.book, chapter: note.chapter, verse: note.verse });

  return (
    <div className="rounded-2xl border border-border bg-surface transition-colors hover:border-accent/60">
      <Link href={href} className="flex gap-3 p-3.5">
        <span
          aria-hidden="true"
          className="mt-1 h-4 w-4 shrink-0 rounded-full border border-border"
          style={
            note.style === "underline"
              ? {
                  borderBottomColor: `var(--mark-ink-${note.color === "clear" ? "gray" : note.color})`,
                  borderBottomWidth: 3,
                }
              : { backgroundColor: note.color === "clear" ? "transparent" : `var(--mark-${note.color})` }
          }
        />
        <span className="min-w-0 flex-1">
          <span className="block min-w-0 truncate text-xs font-semibold text-accent-strong">
            {note.book === "General Conference"
              ? `“${note.chapter}” ¶ ${note.verse}`
              : `${note.book} ${note.chapter}:${note.verse}`}
          </span>
          {note.title && (
            <span className="mt-1 block font-serif text-[0.98rem] font-semibold leading-snug text-foreground">
              {note.title}
            </span>
          )}
          <span className="mt-1 block line-clamp-3 font-serif text-sm leading-relaxed text-foreground/85">
            {noteText(note.note)}
          </span>
          {note.links?.length ? (
            <span className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted">
              <Glyph name="link" className="h-3 w-3 shrink-0" />
              <span className="truncate">{note.links.map((link) => link.label).join(" · ")}</span>
            </span>
          ) : null}
        </span>
        <Glyph name="arrow" className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" />
      </Link>

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-3.5 pl-[2.625rem]">
          {note.tags.map((entry) => {
            const active = tag ? tagKey(tag) === tagKey(entry) : false;
            return (
              <button
                key={tagKey(entry)}
                type="button"
                aria-pressed={active}
                onClick={() => onTag(active ? null : entry)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-accent/25 text-accent-strong ring-1 ring-accent/40"
                    : "bg-surface-2 text-muted hover:text-accent-strong"
                }`}
              >
                #{entry}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
