"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Glyph } from "./glyph";
import { RowMenu } from "./row-menu";
import { rangeText, type Annotation, type AnnotationLink } from "@/lib/annotations";
import { openExternal } from "@/lib/external";
import { sanitizeBody } from "@/lib/journal";
import { openReaderDoc, readerHref, versePassage, type ReaderDoc } from "@/lib/reader";
import type { Passage } from "@/lib/types";

/**
 * What a mark carries beyond its ink: the note written on it, or the passage it
 * points at — shown beside the words rather than over them.
 *
 * The reader marks a verse in the margin with a small note or link, and the mark
 * is what opens this: a panel that slides in from the right edge, over the page
 * but not covering it entirely, so the words being annotated stay in sight
 * behind it. It is a reading surface, not an editor: the note opens to be read,
 * and Edit is what takes it to the sheet that writes on it.
 *
 * The note and the link are two views of the same collection of marks, which is
 * why one panel serves both. A verse can carry more than one of either — two
 * highlights with two thoughts, a chain of references — so the panel is a list
 * rather than a single item, each entry quoting the words it belongs to. And a
 * mark's links are a chain in their own right: the one it was made with and
 * whatever was added after it read under that mark, in the order they were
 * added, behind the verse's single link indicator.
 */
export function VerseAside({
  doc,
  verse,
  mode,
  marks,
  onClose,
  onEdit,
  onRemoveLink,
  onRemoveNote,
}: {
  doc: ReaderDoc;
  /** The verse whose margin was pressed. */
  verse: number;
  mode: "note" | "link";
  /** The marks of this verse that hold what the panel shows, oldest first. */
  marks: Annotation[];
  onClose: () => void;
  /** Hand a mark back to the reader to be written on. */
  onEdit: (mark: Annotation, mode: "note" | "link") => void;
  /** Take one link out of a mark's chain, without opening the sheet. */
  onRemoveLink: (mark: Annotation, link: AnnotationLink) => void;
  /** Take the note off a mark, leaving whatever else it carries. */
  onRemoveNote: (mark: Annotation) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Put the panel away when the entry deleted from inside it was the last one.
   *
   * The panel lists what the verse carries of the kind it was opened for, so
   * removing the final note or link leaves nothing to read — the sheet behind
   * the words is where the reader wants to be then, not a column standing open
   * on an empty line. It only closes on a list that has emptied, never on one
   * that arrives empty, so a panel that opens does not immediately shut again
   * over a store that is still settling.
   */
  const hadMarks = useRef(false);
  useEffect(() => {
    if (marks.length) {
      hadMarks.current = true;
      return;
    }
    if (hadMarks.current) onClose();
  }, [marks.length, onClose]);

  const reference =
    doc.kind === "conference" ? `“${doc.chapter}” ¶ ${verse}` : `${doc.book} ${doc.chapter}:${verse}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50">
        <motion.button
          type="button"
          aria-label={mode === "note" ? "Close the note" : "Close the linked passage"}
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
          aria-label={mode === "note" ? `Note on ${reference}` : `Linked passage on ${reference}`}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34, mass: 0.8 }}
          className="absolute inset-y-0 right-0 flex w-[min(26rem,calc(100%-2.5rem))] flex-col border-l border-border bg-background shadow-2xl"
        >
          <header className="flex items-start gap-3 border-b border-border/70 px-4 py-3.5">
            <span className="mt-0.5 text-accent-strong">
              {/* Drawn rather than the playful styles' picture: this is a label
                  on a reading surface, not a signpost on a card. */}
              <Glyph name={mode === "note" ? "journal" : "link"} plain className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 truncate pt-0.5 font-serif text-base font-semibold text-foreground">
              {reference}
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

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {marks.length === 0 ? (
              <p className="text-sm text-muted">Nothing here any more.</p>
            ) : mode === "note" ? (
              <ul className="space-y-5">
                {marks.map((mark) => (
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
            ) : (
              <ul className="space-y-5">
                {marks.map((mark) => {
                  const links = mark.links ?? [];
                  if (!links.length) return null;
                  return (
                    <li key={mark.id}>
                      <ul className="space-y-4">
                        {links.map((link, index) => (
                          <li key={`${link.book}/${link.chapter}/${link.label}/${index}`}>
                            <LinkedPassage
                              link={link}
                              onEdit={() => onEdit(mark, "link")}
                              onRemove={() => onRemoveLink(mark, link)}
                            />
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}

/** The words a mark covers of its own verse, as prose. */
function quoteOf(doc: ReaderDoc, mark: Annotation): string {
  const text = doc.verses.find((entry) => entry.number === mark.verse)?.text ?? "";
  return rangeText(text, mark.startWord, mark.endWord);
}

/**
 * One note, read: its name, the words it sits on, and what was written.
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
  return (
    <article>
      <div className="flex items-start gap-2">
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
 */
function LinkedPassage({
  link,
  onEdit,
  onRemove,
}: {
  link: AnnotationLink;
  /** Open the sheet that writes the mark's links. */
  onEdit: () => void;
  /** Take this link out of the mark's chain. */
  onRemove: () => void;
}) {
  const [passage, setPassage] = useState<Passage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

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
      {/* The reference is the way into the passage; the kebab beside it holds
          everything else that can be done with the link — the same control as
          a bookmark's row. */}
      <div className="flex items-center gap-2">
        <Link
          href={href}
          className="min-w-0 flex-1 truncate font-serif text-base font-semibold text-accent-strong hover:underline"
        >
          {link.label}
        </Link>
        <RowMenu
          label={`Options for the link to ${link.label}`}
          actions={[
            { label: "Edit", onSelect: onEdit },
            { label: "Delete", onSelect: onRemove },
          ]}
        />
      </div>

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
        </>
      )}

      {passage && (
        <button
          type="button"
          onClick={() => void openExternal(passage.url)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent-strong"
        >
          <Glyph name="arrow" className="h-3.5 w-3.5" />
          Gospel Library
        </button>
      )}
    </article>
  );
}
