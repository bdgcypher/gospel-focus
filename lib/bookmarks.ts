"use client";

import { useSyncExternalStore } from "react";
import { readerHref, type ReaderCitation } from "./reader";

/**
 * A place in the text the reader set a ribbon in, with a name of its own.
 *
 * A bookmark is not a favorite. A favorite is a passage: words the reader wants
 * to keep, with a note hanging off them. A bookmark is a *place* — the verse
 * they stopped at in a chapter they mean to finish — and it is named rather
 * than quoted, so the list reads like a table of contents the reader wrote.
 * That is why the two have their own shapes and their own icons.
 *
 * The place carries everything needed to open it again without the library:
 * which book and chapter, the verse that was at the top of the screen, and a
 * reference already spelled the way the reader will read it. `verse` is what
 * the reader is jumped back to; `reference` is what the list says.
 */
export interface BookmarkPlace {
  kind: "scripture" | "conference";
  /** The book's name, or "General Conference". */
  book: string;
  /** The chapter number as a string, or the talk's title. */
  chapter: string;
  /** The verse (or paragraph) that was at the top of the page. */
  verse: number;
  conferenceId?: string;
  /** The place as a citation: "Jeremiah 2:6", or "“Title” ¶4". */
  reference: string;
}

export interface Bookmark extends BookmarkPlace {
  id: string;
  /** The reader's name for the place, or the reference if they left it empty. */
  title: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = "gospel-focus:bookmarks:v1";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: Bookmark[] = [];

let cache: Bookmark[] | null = null;
let listening = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): Bookmark[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    return value.filter(
      (b): b is Bookmark =>
        !!b &&
        typeof (b as Bookmark).id === "string" &&
        typeof (b as Bookmark).title === "string" &&
        typeof (b as Bookmark).reference === "string" &&
        typeof (b as Bookmark).verse === "number"
    );
  } catch {
    return EMPTY;
  }
}

function read(): Bookmark[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  cache = parse(window.localStorage.getItem(KEY));
  return cache;
}

function write(next: Bookmark[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota) — the session
    // still works, it just won't persist.
  }
  for (const listener of listeners) listener();
}

/** Keep another tab's bookmarks in sync with this one. */
function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = parse(e.newValue);
    for (const listener of listeners) listener();
  });
}

/**
 * The reference a new bookmark starts with: the book and chapter, and the
 * verse the reader was looking at. It is also the name the place gets when the
 * reader saves without typing one.
 */
export function bookmarkReference(place: Omit<BookmarkPlace, "reference">): string {
  if (place.kind === "conference") {
    const title = place.chapter.trim();
    return `${title.startsWith("“") ? title : `“${title}”`} ¶${place.verse}`;
  }
  return `${place.book} ${place.chapter}:${place.verse}`;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Save the place, named. An empty name falls back to its reference. */
export function addBookmark(place: BookmarkPlace, title: string): Bookmark {
  const now = Date.now();
  const bookmark: Bookmark = {
    ...place,
    id: newId(),
    title: title.trim() || place.reference,
    createdAt: now,
    updatedAt: now,
  };
  write([bookmark, ...read()]);
  return bookmark;
}

/** Move a bookmark to where the reader is now, keeping its name. */
export function updateBookmarkPlace(id: string, place: BookmarkPlace): void {
  write(
    read().map((bookmark) =>
      bookmark.id === id ? { ...bookmark, ...place, updatedAt: Date.now() } : bookmark
    )
  );
}

/** Give a bookmark a different name. An empty name falls back to its reference. */
export function renameBookmark(id: string, title: string): void {
  write(
    read().map((bookmark) =>
      bookmark.id === id
        ? { ...bookmark, title: title.trim() || bookmark.reference, updatedAt: Date.now() }
        : bookmark
    )
  );
}

export function removeBookmark(id: string): void {
  write(read().filter((bookmark) => bookmark.id !== id));
}

/**
 * Put a bookmark in another place in the list.
 *
 * The list is the reader's order — newest first when a bookmark is saved, and
 * whatever they rearranged it to afterwards — so the array itself is the only
 * thing to keep: there is no rank to store beside it. The place is clamped
 * rather than refused, because a drag always names a row that exists.
 */
export function moveBookmark(id: string, to: number): void {
  const list = [...read()];
  const from = list.findIndex((bookmark) => bookmark.id === id);
  if (from < 0) return;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return;
  const [moved] = list.splice(from, 1);
  list.splice(target, 0, moved);
  write(list);
}

/** Where the bookmark opens: the reader at that chapter and verse. */
export function bookmarkHref(bookmark: Bookmark): string {
  const citation: ReaderCitation & { verse: number } = {
    kind: bookmark.kind,
    book: bookmark.book,
    chapter: bookmark.chapter,
    conferenceId: bookmark.conferenceId,
    verse: bookmark.verse,
  };
  return readerHref(citation);
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The reader's bookmarks, newest first. Empty during server rendering. */
export function useBookmarks(): Bookmark[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
