"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookmarkIcon } from "./bookmark-icon";
import { Glyph } from "./glyph";
import {
  addBookmark,
  bookmarkHref,
  moveBookmark,
  renameBookmark,
  removeBookmark,
  updateBookmarkPlace,
  useBookmarks,
  type Bookmark,
  type BookmarkPlace,
} from "@/lib/bookmarks";
import { RowMenu } from "./row-menu";
import { useReorder } from "./use-reorder";

/**
 * The reader's bookmarks: the places they set a ribbon in, each with a name.
 *
 * A sheet rather than a page, because a bookmark is used mid-chapter: the
 * reader lifts it from the bar, picks a place, and is back in the words. The
 * list is the app's own list pattern — name, then the reference underneath — and
 * a kebab on each row (components/row-menu.tsx) holds the three things that
 * can be done to a place: move it to where the reader is now, rename it, or
 * take it out.
 *
 * The gold button at the foot is the same button as the picker's: one press
 * puts a ribbon in the place the reader is standing in. Its name starts as the
 * reference the reader can see — "Jeremiah 2:6" — so saving without typing
 * anything still leaves a list that reads.
 */
export function BookmarksDialog({
  /** Where the reader is now: what a new bookmark saves, and Update moves to. */
  place,
  onClose,
  onNotice,
}: {
  place: BookmarkPlace;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const bookmarks = useBookmarks();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(place.reference);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const titleBox = useRef<HTMLInputElement>(null);
  /** The list is the reader's own order, so the grip moves the place itself. */
  const reorder = useReorder<HTMLUListElement>((from, to) => {
    const moving = bookmarks[from];
    if (moving) moveBookmark(moving.id, to);
  });

  // The field a composer opens on is the one thing in here a reader types in,
  // so it takes the caret as soon as it appears.
  useEffect(() => {
    if (!adding && !renaming) return;
    const id = window.setTimeout(() => titleBox.current?.select(), 80);
    return () => window.clearTimeout(id);
  }, [adding, renaming]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (adding) setAdding(false);
      else if (renaming) setRenaming(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding, renaming, onClose]);

  const startAdding = () => {
    setDraft(place.reference);
    setAdding(true);
    setRenaming(null);
  };

  const saveNew = () => {
    addBookmark(place, draft);
    setAdding(false);
    onNotice("Bookmark saved");
  };

  const startRenaming = (bookmark: Bookmark) => {
    setRenameDraft(bookmark.title);
    setRenaming(bookmark.id);
    setAdding(false);
  };

  const saveRename = (bookmark: Bookmark) => {
    renameBookmark(bookmark.id, renameDraft);
    setRenaming(null);
    onNotice("Bookmark renamed");
  };

  return (
    <div className="fixed inset-0 z-50 bg-background sm:flex sm:items-center sm:justify-center sm:bg-black/50 sm:p-6">
      {/* On a phone the sheet is the screen, so there is no outside to press;
          on a wide screen it is a card over the page, and the page behind it is
          the way out — the same move as every other sheet in the app. */}
      <button
        type="button"
        aria-label="Close bookmarks"
        onClick={onClose}
        className="absolute inset-0 hidden cursor-default sm:block"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bookmarks"
        className="relative z-10 flex h-full w-full flex-col bg-background sm:h-[min(78vh,40rem)] sm:max-w-lg sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border sm:shadow-2xl"
      >
        {/* Three columns so the heading sits on the sheet's centre line rather
            than wherever the back control happens to leave it. */}
        <header className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] sm:pt-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bookmarks"
            className="grid h-10 w-10 place-items-center justify-self-start rounded-full text-foreground transition-colors hover:bg-surface-2"
          >
            {/* A page's back arrow on a phone, where the list is the whole
                screen; a close cross on a wide screen, where the same press
                only puts a card away. */}
            <span className="sm:hidden">
              <Glyph name="arrow" className="h-5 w-5 rotate-180" />
            </span>
            <span className="hidden sm:block">
              <Glyph name="close" className="h-5 w-5" />
            </span>
          </button>
          <h2 className="min-w-0 truncate text-center font-serif text-2xl font-semibold text-foreground">
            Bookmarks
          </h2>
          <span aria-hidden="true" />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24">
          {adding ? (
            // The field opens in the middle of the sheet rather than at its top:
            // a name is one line, and a line at the very top of a tall page
            // reads as a list header instead of the thing being asked for.
            <div className="flex min-h-full flex-col justify-center py-8">
              <div className="rounded-2xl border border-accent/40 bg-surface p-3">
                <label htmlFor="bookmark-title" className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Bookmark title
                </label>
                <input
                  ref={titleBox}
                  id="bookmark-title"
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveNew();
                  }}
                  placeholder={place.reference}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="rounded-full border border-border bg-surface-2 px-4 py-1.5 text-sm font-medium text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveNew}
                    className="rounded-full bg-cta px-4 py-1.5 text-sm font-semibold text-cta-contrast"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="mt-10 px-4 text-center">
              <BookmarkIcon className="mx-auto h-10 w-10 text-accent/40" />
              <p className="mt-4 text-sm font-medium text-foreground">No bookmarks yet</p>
            </div>
          ) : (
            <ul {...reorder.containerProps} aria-label="Bookmarks">
              {bookmarks.map((bookmark, index) => {
                const editing = renaming === bookmark.id;
                return (
                  <li
                    key={bookmark.id}
                    className={`relative border-b border-border/60 last:border-0 ${
                      reorder.dragging === index ? "bg-surface-2" : ""
                    }`}
                  >
                    {editing ? (
                      <div className="py-3">
                        <div className="flex items-center gap-3 pl-1">
                          <BookmarkIcon className="h-5 w-5 shrink-0 text-accent-strong" />
                          <input
                            ref={titleBox}
                            type="text"
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") saveRename(bookmark);
                            }}
                            aria-label={`New name for ${bookmark.title}`}
                            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                          />
                        </div>
                        {bookmark.reference !== bookmark.title && (
                          <p className="mt-1 pl-9 text-xs text-muted">{bookmark.reference}</p>
                        )}
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setRenaming(null)}
                            className="rounded-full border border-border bg-surface-2 px-4 py-1.5 text-sm font-medium text-foreground"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveRename(bookmark)}
                            className="rounded-full bg-cta px-4 py-1.5 text-sm font-semibold text-cta-contrast"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {/* The grip leads the row, where a list's handle
                            belongs; the arrow keys move the place without a
                            pointer. */}
                        <button
                          type="button"
                          aria-label={`Reorder ${bookmark.title}`}
                          data-reorder-handle
                          onKeyDown={(event) => {
                            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                            event.preventDefault();
                            reorder.moveTo(index, index + (event.key === "ArrowUp" ? -1 : 1));
                          }}
                          className={`-ml-1.5 grid h-9 w-6 shrink-0 touch-none place-items-center text-muted transition-colors hover:text-foreground ${
                            reorder.dragging === index ? "cursor-grabbing text-foreground" : "cursor-grab"
                          }`}
                        >
                          <Glyph name="grip" className="h-4 w-4" />
                        </button>
                        <Link
                          href={bookmarkHref(bookmark)}
                          onClick={onClose}
                          className="flex min-w-0 flex-1 items-center gap-3 py-4 pr-2 transition-colors hover:text-accent-strong"
                        >
                          <BookmarkIcon className="h-5 w-5 shrink-0 text-accent-strong" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-serif text-lg font-medium text-foreground">
                              {bookmark.title}
                            </span>
                            {bookmark.reference !== bookmark.title && (
                              <span className="mt-0.5 block truncate text-xs text-muted">{bookmark.reference}</span>
                            )}
                          </span>
                        </Link>
                        <RowMenu
                          label={`Options for ${bookmark.title}`}
                          actions={[
                            {
                              label: "Update",
                              onSelect: () => {
                                updateBookmarkPlace(bookmark.id, place);
                                onNotice(`Bookmark moved to ${place.reference}`);
                              },
                            },
                            { label: "Rename", onSelect: () => startRenaming(bookmark) },
                            {
                              label: "Delete",
                              onSelect: () => {
                                removeBookmark(bookmark.id);
                                onNotice("Bookmark removed");
                              },
                            },
                          ]}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* The same gold button as the picker's: a round, lifted press in the
            corner. It is a plus while there is nothing to name and a cross
            while the field is open — the same control, so one press puts it
            away again instead of a second button for closing. */}
        <button
          type="button"
          onClick={() => (adding ? setAdding(false) : startAdding())}
          aria-label={adding ? "Close the new bookmark" : "Add a bookmark here"}
          aria-expanded={adding}
          className="absolute bottom-5 right-5 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-contrast shadow-lg transition-transform hover:scale-[1.03]"
        >
          <PlusIcon className={`h-6 w-6 transition-transform duration-200 ${adding ? "rotate-45" : ""}`} />
        </button>
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
