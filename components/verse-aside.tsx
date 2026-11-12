"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Glyph } from "./glyph";
import { RowMenu } from "./row-menu";
import {
  markGroup,
  markGroupId,
  noteText,
  rangeText,
  tagKey,
  type Annotation,
  type AnnotationLink,
  type Backlink,
} from "@/lib/annotations";
import { openExternal } from "@/lib/external";
import { sanitizeBody } from "@/lib/journal";
import { isInternalHref } from "@/lib/journal-links";
import { openReaderDoc, readerHref, versePassage, type ReaderDoc } from "@/lib/reader";
import type { Passage } from "@/lib/types";

/**
 * What a mark carries beyond its ink: the note written on it, the passages it
 * points at, and the tags that say what the words are about — shown beside the
 * words rather than over them.
 *
 * The reader marks a verse in the margin with one small mark, and that mark is
 * what opens this: a panel that slides in from the right edge, over the page but
 * not covering it entirely, so the words being annotated stay in sight behind
 * it. It is a reading surface, not an editor: the note opens to be read, and
 * Edit is what takes it to the sheet that writes on it.
 *
 * Notes and links are two sections of one collection of marks, because a verse
 * can carry both — a thought and the passage that prompted it — and the reader
 * should see everything the verse says about itself in one place. Each entry
 * names when it was made, and the tags heading gathers the verse's themes into
 * pills; a pill narrows the panel to every mark in the library wearing that tag,
 * which is how a theme becomes a thread through the whole book.
 */
export function VerseAside({
  doc,
  verse,
  marks,
  annotations,
  backlinks,
  onClose,
  onEdit,
  onRemoveLink,
  onRemoveNote,
  onAddTags,
  onRemoveTag,
}: {
  doc: ReaderDoc;
  /** The verse whose margin was pressed. */
  verse: number;
  /** The marks of this verse that hold a note, a link, or a tag, oldest first. */
  marks: Annotation[];
  /** Every mark in the library, for the list a tag opens. */
  annotations: Annotation[];
  /**
   * The marks elsewhere in the library whose links name this verse: the ways
   * back to the passages this one was linked from. They live on those marks,
   * not here, so they are read and opened rather than edited or removed —
   * taking the link off the mark that holds it is what takes the backlink away.
   */
  backlinks?: Backlink[];
  onClose: () => void;
  /** Hand a mark back to the reader to be written on. */
  onEdit: (mark: Annotation, mode: "note" | "link") => void;
  /** Take one link out of a mark's chain, without opening the sheet. */
  onRemoveLink: (mark: Annotation, link: AnnotationLink) => void;
  /** Take the note off a mark, leaving whatever else it carries. */
  onRemoveNote: (mark: Annotation) => void;
  /** Open the sheet that writes the tags on this verse's marks. */
  onAddTags: () => void;
  /** Take a tag off every mark of this verse that wears it. */
  onRemoveTag: (tag: string) => void;
}) {
  /** The tag whose list is open; null while the verse's own entries are shown. */
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (tag) setTag(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, tag]);

  /**
   * Put the panel away when the entry deleted from inside it was the last one.
   *
   * The panel lists what the verse carries, so removing the final note or link
   * leaves nothing to read — the words behind it are where the reader wants to
   * be then, not a column standing open on an empty line. It only closes on a
   * list that has emptied, never on one that arrives empty, so a panel that
   * opens does not immediately shut again over a store that is still settling.
   * A tag's list is a view of the whole library, so it is left alone.
   */
  /**
   * The ways back, minus any the verse already shows as a link of its own.
   *
   * Two passages linked to each other explicitly would otherwise name the same
   * passage twice — once as this verse's link, once as the way back to it — and
   * one line says it. One-directional links, which are the common case, keep
   * their backlink and gain nothing else.
   */
  const linkedFrom = useMemo(() => {
    /** Whether a link already on this verse names the place a way back comes from. */
    const names = (link: AnnotationLink, mark: Annotation) =>
      link.book.trim().toLowerCase() === mark.book.trim().toLowerCase() &&
      link.chapter.trim().toLowerCase() === mark.chapter.trim().toLowerCase() &&
      (link.sections?.length ? link.sections : [link.section]).includes(mark.verse);
    const own = marks.flatMap((mark) => mark.links ?? []);
    return (backlinks ?? []).filter((entry) => !own.some((link) => names(link, entry.mark)));
  }, [backlinks, marks]);

  const hadMarks = useRef(false);
  useEffect(() => {
    if (marks.length || linkedFrom.length) {
      hadMarks.current = true;
      return;
    }
    if (hadMarks.current && !tag) onClose();
  }, [marks.length, linkedFrom.length, onClose, tag]);

  const reference =
    doc.kind === "conference" ? `“${doc.chapter}” ¶ ${verse}` : `${doc.book} ${doc.chapter}:${verse}`;

  /** The tags on this verse's marks, each once, in the case it was first typed. */
  const tags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const mark of marks) {
      for (const entry of mark.tags) {
        const key = tagKey(entry);
        if (key && !seen.has(key)) seen.set(key, entry);
      }
    }
    return [...seen.values()];
  }, [marks]);

  const notes = marks.filter((mark) => noteText(mark.note).length > 0);
  const linked = marks.filter((mark) => mark.links?.length);

  /** The marks wearing the open tag, one entry per mark rather than per verse. */
  const tagged = useMemo(() => {
    if (!tag) return [];
    const key = tagKey(tag);
    const seen = new Set<string>();
    const groups: Annotation[][] = [];
    for (const annotation of annotations) {
      if (!annotation.tags.some((entry) => tagKey(entry) === key)) continue;
      const id = markGroupId(annotation);
      if (seen.has(id)) continue;
      seen.add(id);
      groups.push(markGroup(annotations, annotation));
    }
    return groups.sort((a, b) => {
      const at = a.map((mark) => mark.createdAt).sort().at(-1) ?? "";
      const bt = b.map((mark) => mark.createdAt).sort().at(-1) ?? "";
      return bt.localeCompare(at);
    });
  }, [annotations, tag]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50">
        <motion.button
          type="button"
          aria-label={tag ? "Close the tagged passages" : "Close the notes and links"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-black/35"
        />

        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-label={tag ? `Tagged #${tag}` : `Notes and links on ${reference}`}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.8 }}
          className="absolute inset-y-0 right-0 flex w-[min(26rem,calc(100%-2.5rem))] flex-col border-l border-border bg-background shadow-2xl"
        >
          <header className="flex items-start gap-2.5 border-b border-border/70 px-4 py-3.5">
            {tag ? (
              <button
                type="button"
                onClick={() => setTag(null)}
                aria-label="Back to this verse"
                className="-ml-1 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
              >
                <Glyph name="arrow" className="h-4 w-4 rotate-180" />
              </button>
            ) : (
              <span className="ml-0.5 mt-0.5 text-accent-strong">
                {/* Drawn rather than the playful styles' picture: this is a label
                    on a reading surface, not a signpost on a card. */}
                <Glyph name="annotations" plain className="h-4 w-4" />
              </span>
            )}
            <p className="min-w-0 flex-1 truncate pt-0.5 font-serif text-base font-semibold text-foreground">
              {tag ? `#${tag}` : reference}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
            >
              <Glyph name="close" className="h-4 w-4" />
            </button>
          </header>

          <div className="verse-aside-body min-h-0 flex-1 overflow-y-auto px-4 pt-4">
            {tag ? (
              <div aria-label={`Marks tagged ${tag}`}>
                {tagged.length === 0 ? (
                  <p className="text-sm text-muted">No markings wear this tag any more.</p>
                ) : (
                  <ul className="space-y-3">
                    {tagged.map((group) => (
                      <li key={markGroupId(group[0])}>
                        <TaggedMark group={group} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <>
                <section aria-label="Tags" className="border-b border-border/70 pb-4">
                  <ul className="flex flex-wrap items-center gap-1.5">
                    {tags.map((entry) => (
                      <li
                        key={tagKey(entry)}
                        className="inline-flex items-center rounded-full bg-accent/15 py-1 pl-3 pr-1 text-xs font-semibold text-accent-strong"
                      >
                        <button type="button" onClick={() => setTag(entry)} className="transition-opacity hover:opacity-75">
                          #{entry}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveTag(entry)}
                          aria-label={`Remove the tag ${entry}`}
                          className="ml-1 grid h-6 w-6 place-items-center rounded-full transition-colors hover:bg-accent/20"
                        >
                          <Glyph name="close" className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        onClick={onAddTags}
                        aria-label={tags.length ? "Add a tag" : "Add tags"}
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs font-semibold text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
                      >
                        <Glyph name="plus" className="h-3 w-3" />
                        {tags.length ? null : "Tags"}
                      </button>
                    </li>
                  </ul>
                </section>

                {marks.length === 0 && linkedFrom.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">Nothing here any more.</p>
                ) : (
                  <>
                    {notes.length > 0 && (
                      <section aria-labelledby="aside-notes" className="mt-4">
                        <h3 id="aside-notes" className="text-xs font-semibold uppercase tracking-wider text-muted">
                          Notes
                        </h3>
                        <ul className="mt-2.5 space-y-5">
                          {notes.map((mark) => (
                            <li key={mark.id}>
                              <NoteRead
                                mark={mark}
                                doc={doc}
                                reference={reference}
                                onEdit={() => onEdit(mark, "note")}
                                onRemove={() => onRemoveNote(mark)}
                              />
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {(linked.length > 0 || linkedFrom.length > 0) && (
                      <section aria-labelledby="aside-links" className="mt-5">
                        <h3 id="aside-links" className="text-xs font-semibold uppercase tracking-wider text-muted">
                          Links
                        </h3>
                        <ul className="mt-2.5 space-y-5">
                          {linked.map((mark) => (
                            <li key={mark.id}>
                              <ul className="space-y-4">
                                {mark.links?.map((link, index) => (
                                  <li key={`${link.book}/${link.chapter}/${link.label}/${index}`}>
                                    <Stamp at={link.addedAt ?? mark.createdAt} />
                                    <LinkedPassage
                                      link={link}
                                      onEdit={() => onEdit(mark, "link")}
                                      onRemove={() => onRemoveLink(mark, link)}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}

                          {/* The other half of every link: the passages whose
                              marks point here. They are read after the verse's
                              own links because that is the order the reader met
                              them, and drawn as link entries because that is
                              what they are — a passage, quoted from the library,
                              with the way into it. They carry no kebab: the link
                              belongs to the other mark, and it is taken off
                              there. */}
                          {linkedFrom.map((entry) => (
                            <li key={`${entry.mark.id}/${entry.link.label}`}>
                              <Stamp at={entry.link.addedAt ?? entry.mark.createdAt} />
                              <LinkedPassage link={linkToMark(entry.mark)} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}

/**
 * When an entry was made, under a drawn calendar.
 *
 * A record imported without a date — or with an epoch — has nothing true to say
 * here, so it says nothing rather than a date in 1970. The time is the reader's
 * own: the clock on this device, in the shape this device writes dates.
 */
function Stamp({ at }: { at: string }) {
  const date = new Date(at);
  if (!at || Number.isNaN(date.getTime()) || date.getFullYear() < 1980) return null;
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted">
      <Glyph name="calendar" plain className="h-3.5 w-3.5" />
      <time dateTime={at}>{when}</time>
    </p>
  );
}

/** The words a mark covers of its own verse, as prose. */
function quoteOf(doc: ReaderDoc, mark: Annotation): string {
  const text = doc.verses.find((entry) => entry.number === mark.verse)?.text ?? "";
  return rangeText(text, mark.startWord, mark.endWord);
}

/** A mark's place, named the way the reader knows it. */
function referenceOf(group: Annotation[]): string {
  const first = group[0];
  const last = group[group.length - 1];
  const span = first.verse === last.verse ? `${first.verse}` : `${first.verse}–${last.verse}`;
  return first.book === "General Conference"
    ? `${first.chapter} · ¶ ${span}`
    : `${first.book} ${first.chapter}:${span}`;
}

/**
 * A mark, read as the passage a link names.
 *
 * A way back into this verse is stored on the other end as a link to *this*
 * verse, so the passage to show is the mark's own — the verse the link was
 * written on. Written as a link, it is read by the same entry as every other
 * link, and quoted from the library rather than from the panel's chapter.
 */
function linkToMark(mark: Annotation): AnnotationLink {
  return {
    book: mark.book,
    chapter: mark.chapter,
    section: mark.verse,
    conferenceId: conferenceIdOf(mark),
    label: referenceOf([mark]),
  };
}

/** The session a mark's talk belongs to, or nothing for a scripture chapter. */
function conferenceIdOf(mark: Annotation): string | undefined {
  return mark.doc.startsWith("c/") ? mark.doc.split("/")[1] : undefined;
}

/** The reader's address for a mark, wherever it is in the library. */
function hrefOf(group: Annotation[]): string {
  const first = group[0];
  return readerHref({
    kind: conferenceIdOf(first) ? "conference" : "scripture",
    book: first.book,
    chapter: first.chapter,
    conferenceId: conferenceIdOf(first),
    verse: first.verse,
  });
}

/** One marking in a tag's list: where it is, when it was made, and what it holds. */
function TaggedMark({ group }: { group: Annotation[] }) {
  const holder = group.find((mark) => noteText(mark.note).length > 0 || mark.links?.length) ?? group[0];
  const note = noteText(holder.note);
  const links = group.flatMap((mark) => mark.links ?? []);
  return (
    <Link
      href={hrefOf(group)}
      className="block rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-accent/60"
    >
      <Stamp at={holder.createdAt} />
      <p className="flex items-center gap-1.5 font-serif text-sm font-semibold text-accent-strong">
        <Glyph
          name={note ? "journal" : links.length ? "link" : "tag"}
          plain
          className="h-3.5 w-3.5 shrink-0"
        />
        <span className="truncate">{referenceOf(group)}</span>
      </p>
      {note && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground/85">{note}</p>}
      {links.length > 0 && (
        <p className="mt-1.5 text-xs text-muted">{links.map((link) => link.label).join(" · ")}</p>
      )}
    </Link>
  );
}

/**
 * One note, read: when it was written, the words it sits on, and what was said.
 *
 * The note's own heading — its title, or the words it quotes when it has none —
 * carries the kebab that writes it again or takes it off the mark: the same
 * control as a bookmark's row and a link's heading, so a note is dealt with the
 * same way as everything else listed in a sheet.
 */
function NoteRead({
  mark,
  doc,
  reference,
  onEdit,
  onRemove,
}: {
  mark: Annotation;
  doc: ReaderDoc;
  /** The verse the note sits on, as the panel's header names it. */
  reference: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  return (
    <article>
      <Stamp at={mark.createdAt} />
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-accent-strong">
          <Glyph name="journal" plain className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {mark.title && (
            <h3 className="font-serif text-base font-semibold leading-snug text-foreground">{mark.title}</h3>
          )}
          <blockquote
            className={`${mark.title ? "mt-1 " : ""}border-l-2 border-accent/40 pl-3 font-serif text-sm leading-relaxed text-foreground/70`}
          >
            {quoteOf(doc, mark)}
          </blockquote>
        </div>
        <RowMenu
          label={`Options for the note on ${reference}`}
          actions={[
            { label: "Edit", onSelect: onEdit },
            { label: "Delete", onSelect: onRemove },
          ]}
        />
      </div>
      {/* Sanitized on the way in and again on the way out: storage is data, and
          data is not trusted with the page's DOM (as components/favorites-page.tsx). */}
      <div
        className="journal-body mt-2.5 text-sm leading-relaxed text-foreground/90"
        onClick={(event) => {
          // The note is stored as HTML, so a link in it is a plain anchor: a
          // click would load the whole document, and the packaged app answers
          // a path it does not route with the home page. An in-app link is
          // followed by the router instead, which is also what keeps the way
          // back on the verse the note is written on.
          const anchor = (event.target as Element | null)?.closest?.("a");
          if (!anchor) return;
          const href = anchor.getAttribute("href") ?? "";
          if (!isInternalHref(href)) return;
          event.preventDefault();
          router.push(href);
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeBody(mark.note ?? "") }}
      />
    </article>
  );
}

/**
 * One link of a mark's chain, read: the passage it names, quoted from the
 * library, and the way into it.
 *
 * The text is fetched rather than stored on the mark: a link is a reference,
 * and the library is what knows the words a reference holds. Until the file
 * arrives the entry shows the reference alone, so the panel never implies a
 * passage it hasn't read.
 *
 * The entry is folded to its reference by default. A verse can hold several
 * links and sit in several others' chains, and quoting every passage at once
 * turns the panel into a wall of text the reader never asked to read — the
 * reference is what a link is, and the words behind it are there to be opened
 * when the reader wants them. The chevron does that; the reference itself still
 * leads into the passage, because opening it is the other thing a link is for.
 */
function LinkedPassage({
  link,
  onEdit,
  onRemove,
}: {
  link: AnnotationLink;
  /** Open the sheet that writes the mark's links. A way back has none. */
  onEdit?: () => void;
  /** Take this link out of the mark's chain. A way back has none. */
  onRemove?: () => void;
}) {
  const [passage, setPassage] = useState<Passage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  /** Whether the passage's words are unfolded under the reference. */
  const [open, setOpen] = useState(false);
  /** Names the folded body for the chevron's `aria-controls`. */
  const bodyId = `aside-link-${useId()}`;

  // A link names one verse or a run of them. The reader always reads the
  // chapter, then keeps the verses the link actually covers — a range reads as
  // the passage it is, rather than as its first verse alone.
  const verses = link.sections?.length
    ? [...new Set(link.sections)].sort((a, b) => a - b)
    : [link.section];
  /** The list as one string, so the effect depends on what it says rather than
   *  on a fresh array every render. */
  const verseKey = verses.join(",");

  useEffect(() => {
    let live = true;
    void (async () => {
      const doc = await openReaderDoc({
        kind: link.conferenceId ? "conference" : "scripture",
        book: link.conferenceId ? "General Conference" : link.book,
        chapter: link.chapter,
        conferenceId: link.conferenceId,
      });
      if (!live) return;
      const wanted = verseKey.split(",").map(Number);
      const found = doc?.verses.filter((verse) => wanted.includes(verse.number)) ?? [];
      if (!doc || !found.length) {
        setPassage(null);
        setState("missing");
        return;
      }
      const first = versePassage(doc, found[0].number);
      setPassage({
        ...first,
        reference: link.label,
        text: found.map((verse) => verse.text).join(" "),
        verses: found.map((verse) => ({ number: verse.number, text: verse.text })),
        highlightVerse: found[0].number,
      });
      setState("ready");
    })();
    return () => {
      live = false;
    };
    // The verse list is what the panel reads, so it belongs in the dependency
    // list as much as the link's place does.
  }, [link, verseKey]);

  const href = readerHref({
    kind: link.conferenceId ? "conference" : "scripture",
    book: link.conferenceId ? "General Conference" : link.book,
    chapter: link.chapter,
    conferenceId: link.conferenceId,
    verses,
  });

  return (
    <article>
      {/* The reference is the way into the passage; the chevron beside it
          unfolds the words it holds; the kebab holds everything else that can
          be done with the link — the same control as a bookmark's row. */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-accent-strong">
          <Glyph name="link" plain className="h-4 w-4" />
        </span>
        <Link
          href={href}
          className="min-w-0 flex-1 truncate font-serif text-base font-semibold text-accent-strong hover:underline"
        >
          {link.label}
        </Link>
        {/* The passage's words, behind the label until they are asked for. */}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? "Hide" : "Show"} the text of ${link.label}`}
          title={open ? "Hide the verse text" : "Show the verse text"}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent-strong"
        >
          <Glyph
            name="chevron"
            plain
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {onEdit && onRemove && (
          <RowMenu
            label={`Options for the link to ${link.label}`}
            actions={[
              { label: "Edit", onSelect: onEdit },
              { label: "Delete", onSelect: onRemove },
            ]}
          />
        )}
      </div>

      {open && (
        <div id={bodyId}>
          {state === "loading" && (
            <p className="mt-2 animate-pulse text-sm text-muted">Reading the passage…</p>
          )}
          {state === "missing" && (
            <p className="mt-2 text-sm text-muted">That passage isn’t in this build of the library.</p>
          )}
          {passage && (
            <>
              <p className="mt-2 max-h-64 overflow-y-auto border-l-2 border-accent/40 pl-3 font-serif text-sm leading-relaxed text-foreground/85">
                {passage.text}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">{passage.sourceLabel}</p>
              <button
                type="button"
                onClick={() => void openExternal(passage.url)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent-strong"
              >
                <Glyph name="arrow" className="h-3.5 w-3.5" />
                Gospel Library
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
