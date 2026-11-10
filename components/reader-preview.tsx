"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { annotationsFor, useAnnotations } from "@/lib/annotations";
import { previewReaderDoc, type ReaderDoc } from "@/lib/reader";
import { BackLink } from "./back-link";
import { ReaderPlaceButton } from "./reader-nav";
import { VerseRow } from "./verse-row";

/**
 * The chapter on the other side of a swipe, already drawn.
 *
 * A finger turning to the next chapter expects to see the next chapter — its
 * own name in the bar, its own first verses — not a blank edge that becomes a
 * page once the thumb lifts. So the neighbour is fetched and mounted while the
 * drag is still happening, in a panel just off the side of the screen, and the
 * stylesheet slides it in behind the chapter that is leaving (see "Sweeping
 * between sections" in globals.css, the same rules the section pages use).
 *
 * It is not a sketch of the page: the bar's own title, the same verse rows, the
 * same marks. The reader is looking at the chapter they are about to open, so
 * it has to be the words they will find there and their own highlights among
 * them.
 *
 * Two things are deliberately missing. The rail down the side is not drawn —
 * a swipe is a phone's gesture, and on a phone the rail is off the page anyway.
 * And the reader's next chapter is fetched through `previewReaderDoc`, which
 * keeps what it has already loaded: a reader turning back and forth must not
 * re-read the same chapter off the volume on every pass.
 *
 * The panel is decoration and nothing else: it is `inert`, hidden from
 * assistive technology, and the pointer passes through it untouched. The reader
 * is looking at the chapter, not operating it — the operation happens when the
 * chapter arrives.
 */

/**
 * No verse row in here is operable, so every gesture a row offers is answered
 * with nothing. One shared function rather than a new arrow on each row: the
 * panel is redrawn on every move of the thumb.
 */
const ignore = () => {};

export function ReaderPreview({
  kind,
  book,
  chapter,
  conferenceId,
}: {
  /** The citation, spread across its fields: the load is keyed on what it says,
   *  not on the object a parent happens to build on every render. */
  kind: "scripture" | "conference";
  book: string;
  chapter: string;
  conferenceId?: string;
}) {
  const [doc, setDoc] = useState<ReaderDoc | null>(null);
  const annotations = useAnnotations();

  useEffect(() => {
    let live = true;
    previewReaderDoc({ kind, book, chapter, conferenceId })
      .then((opened) => {
        if (live) setDoc(opened);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [kind, book, chapter, conferenceId]);

  if (typeof document === "undefined") return null;

  const marks = doc ? annotationsFor(annotations, doc.doc) : [];

  return createPortal(
    <div data-nav-preview="" data-reader-preview="" aria-hidden="true" inert>
      {/* The reader's own sheet, the lighter cream the words sit on, filling
          the panel so no part of it shows the section page's paper. */}
      <div className="flex h-full flex-col bg-reader-page">
        <div className="mx-auto flex w-full max-w-[80rem] flex-1 justify-center gap-10 px-5 pb-16 pt-4 sm:px-8 sm:pt-6">
          <main className="min-w-0 w-full max-w-[46rem] flex-1">
            {/* The bar as the arriving chapter will have it: the way back, and
                the chapter's name over the volume it belongs to. The controls
                beside them are left out — the panel is inert, and a bookmark
                button drawn here would be a promise the preview cannot keep. */}
            <div
              data-reader-bar
              className="relative flex items-center gap-2 border-b border-border/60 bg-reader-page px-1 py-2 -mx-1"
            >
              <BackLink fallbackHref="/passage" />
              <div className="min-w-0 flex-1">
                {doc ? (
                  <ReaderPlaceButton
                    doc={doc}
                    fromDaily={false}
                    open={false}
                    onToggle={ignore}
                  />
                ) : (
                  <div className="h-7 w-40 animate-pulse rounded-full bg-surface-2" aria-hidden="true" />
                )}
              </div>
            </div>

            <article className="relative -mx-3 mt-6 font-serif text-[1.12rem] leading-[1.75] text-foreground/90 sm:mx-0 sm:mt-8 sm:text-[1.18rem] sm:leading-[1.8]">
              {doc
                ? doc.verses.map((verse) => (
                    <VerseRow
                      key={verse.number}
                      doc={doc}
                      verse={verse}
                      annotations={marks}
                      preview={null}
                      selected={null}
                      focused={false}
                      onVerse={ignore}
                      onAside={ignore}
                      onWords={ignore}
                    />
                  ))
                : Array.from({ length: 9 }, (_, index) => (
                    <div
                      key={index}
                      className="mb-4 h-4 animate-pulse rounded-full bg-surface-2"
                      aria-hidden="true"
                    />
                  ))}
            </article>
          </main>
        </div>
      </div>
    </div>,
    document.body
  );
}
