"use client";

import { useEffect, useState } from "react";
import { Sheet } from "./sheet";
import { Glyph } from "./glyph";
import { loadManifest } from "@/lib/picker";
import { browseIndex, type BrowseVolume } from "@/lib/reader";

/**
 * The library as a shelf you can walk: volume, then book, then chapter.
 *
 * Until now a chapter could only be opened by a citation — a search result, a
 * strapline, a saved passage — which is fine for following a thread and useless
 * for opening Genesis because you want to. This is the other way in: the same
 * manifest the picker draws from, laid out as the three choices it is.
 *
 * Three steps rather than a tree with everything open, because each step is a
 * screenful at phone width and a reader browsing for a chapter is usually
 * looking for one book they can already name. The volume row stays put so the
 * step back is always one tap, and picking a chapter hands the address to the
 * reader rather than loading anything here: the reader owns which chapter is
 * open, and two places deciding it would be one place too many.
 */
export function ChapterBrowser({
  onPick,
  onClose,
}: {
  onPick: (book: string, chapter: string) => void;
  onClose: () => void;
}) {
  const [volumes, setVolumes] = useState<BrowseVolume[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [volumeId, setVolumeId] = useState<string | null>(null);
  const [book, setBook] = useState<{ name: string; chapters: number } | null>(null);

  useEffect(() => {
    let live = true;
    loadManifest()
      .then((manifest) => {
        if (!live) return;
        const index = browseIndex(manifest);
        setVolumes(index);
        setVolumeId(index[0]?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : "The library couldn't be read.");
      });
    return () => {
      live = false;
    };
  }, []);

  const volume = volumes?.find((entry) => entry.id === volumeId) ?? volumes?.[0];

  return (
    <Sheet title={book ? book.name : "Browse"} onClose={onClose}>
      {error ? (
        <p className="pb-2 text-sm text-muted">The passage library didn&apos;t load. {error}</p>
      ) : !volumes ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : book ? (
        <>
          <button
            type="button"
            onClick={() => setBook(null)}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong hover:underline"
          >
            <span aria-hidden="true">←</span>
            All books
          </button>
          <p className="mb-2 text-xs text-muted">
            {volume?.title} · {book.chapters} {book.chapters === 1 ? "chapter" : "chapters"}
          </p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {Array.from({ length: book.chapters }, (_, index) => index + 1).map((chapter) => (
              <button
                key={chapter}
                type="button"
                onClick={() => onPick(book.name, String(chapter))}
                className="rounded-xl border border-border bg-surface px-2 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                {chapter}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* The volumes, as chips. A row rather than a dropdown: there are four
              of them, and the whole point of this sheet is that the shape of the
              library is visible. */}
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {volumes.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setVolumeId(entry.id)}
                aria-current={entry.id === volume?.id ? "true" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  entry.id === volume?.id
                    ? "border-accent/60 bg-accent/15 text-accent-strong"
                    : "border-border bg-surface text-muted hover:border-accent/60 hover:text-accent-strong"
                }`}
              >
                {entry.title}
              </button>
            ))}
          </div>

          {volume && (
            <>
              <p className="mb-2 text-xs text-muted">
                {volume.books.length} {volume.books.length === 1 ? "book" : "books"}
                {volume.subtitle ? ` · ${volume.subtitle}` : ""}
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {volume.books.map((entry) => (
                  <li key={entry.slug}>
                    <button
                      type="button"
                      onClick={() => setBook({ name: entry.name, chapters: entry.chapters })}
                      className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/60"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {entry.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">{entry.chapters}</span>
                      <Glyph name="arrow" className="h-3.5 w-3.5 shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
