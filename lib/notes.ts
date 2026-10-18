"use client";

import { useSyncExternalStore } from "react";
import type { Favorite } from "./favorites";

/**
 * The notes a reader writes on the passages they have kept.
 *
 * A note hangs off a favorite rather than off a passage: what is written is
 * about *this* saved thing — the verse the reader starred, the talk they set
 * aside — and a paragraph re-drawn from the library tomorrow is a different
 * card. Keying to the favorite's own id also means the two can never disagree
 * about what is being annotated: the note's key *is* the favorite, and deleting
 * the favorite's note is deleting one row.
 *
 * A note keeps a copy of the passage it is about (the reference, the source,
 * the words). That is what lets the notes be listed, searched, and linked to
 * from the journal without loading the library or the favorites list — the same
 * reason a favorite carries its own words.
 */

export interface Note {
  /** The favorite this note belongs to. One note per saved passage. */
  favoriteId: string;
  /** The passage's citation, e.g. "Alma 32:21". */
  reference: string;
  /** Where it comes from, e.g. "Book of Mormon". */
  sourceLabel: string;
  /** The passage itself, so a note reads on its own. */
  passage: string;
  /** What the reader wrote. */
  text: string;
  updatedAt: number;
}

const KEY = "gospel-focus:notes:v1";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: Note[] = [];

let cache: Note[] | null = null;
let listening = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): Note[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    return value.filter(
      (n): n is Note =>
        !!n &&
        typeof (n as Note).favoriteId === "string" &&
        typeof (n as Note).text === "string" &&
        (n as Note).text.trim().length > 0
    );
  } catch {
    return EMPTY;
  }
}

function read(): Note[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  cache = parse(window.localStorage.getItem(KEY));
  return cache;
}

function write(next: Note[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota) — the session
    // still works, it just won't persist.
  }
  for (const listener of listeners) listener();
}

/** Keep another tab's notes in sync with this one. */
function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = parse(e.newValue);
    for (const listener of listeners) listener();
  });
}

/** The note on a saved passage, or null. */
export function noteFor(notes: Note[], favoriteId: string): Note | null {
  return notes.find((note) => note.favoriteId === favoriteId) ?? null;
}

/**
 * Write (or rewrite) the note on a favorite. Whitespace-only text deletes the
 * note rather than storing an empty one, so "clear the field and save" behaves
 * the way the reader means it.
 */
export function saveNote(favorite: Favorite, text: string): void {
  const trimmed = text.trim();
  const rest = read().filter((note) => note.favoriteId !== favorite.id);
  if (!trimmed) {
    write(rest);
    return;
  }
  write([
    {
      favoriteId: favorite.id,
      reference: favorite.reference,
      sourceLabel: favorite.sourceLabel,
      passage: favorite.text,
      text: trimmed,
      updatedAt: Date.now(),
    },
    ...rest,
  ]);
}

export function removeNote(favoriteId: string): void {
  write(read().filter((note) => note.favoriteId !== favoriteId));
}

/** Every note, newest first. Empty during server rendering. */
export function useNotes(): Note[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** The notes as they stand, for the code that is not rendering. */
export function readNotes(): Note[] {
  return read();
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
