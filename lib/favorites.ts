"use client";

import { useSyncExternalStore } from "react";
import type { Passage } from "./types";

/** A starred passage, with everything the favorites page needs to render it. */
export interface Favorite {
  id: string;
  kind: Passage["kind"];
  reference: string;
  sourceLabel: string;
  text: string;
  url: string;
  urlLabel: string;
  expansionTitle: string;
  /** Citation parts, so a favorite can be exported and imported again. */
  book?: string;
  chapter?: string;
  section?: number;
  /**
   * The last verse (or paragraph) when this favorite was saved from a run of
   * them taken together. Absent on a single passage, and on a scattered pick
   * (which lists its own numbers in `sections` instead).
   */
  sectionEnd?: number;
  /**
   * Every verse (or paragraph) this favorite covers, in order, when it spans
   * more than one — a run or a scattered pick alike. Absent on a single passage.
   */
  sections?: number[];
  /**
   * The covered verses/paragraphs, each with its number, so the favorites page
   * can show them one by one without the library. Absent on a single passage.
   */
  parts?: { number: number; text: string }[];
  savedAt: number;
}

const KEY = "open-to-inspiration:favorites:v1";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: Favorite[] = [];

let cache: Favorite[] | null = null;
let listening = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): Favorite[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    return value.filter(
      (f): f is Favorite => !!f && typeof (f as Favorite).id === "string" && typeof (f as Favorite).reference === "string"
    );
  } catch {
    return EMPTY;
  }
}

function read(): Favorite[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  cache = parse(window.localStorage.getItem(KEY));
  return cache;
}

function write(next: Favorite[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota) — the session
    // still works, it just won't persist.
  }
  for (const listener of listeners) listener();
}

/** Keep another tab's stars in sync with this one. */
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
 * A stable id for the exact section that was drawn: the reference plus which
 * verse (or paragraph) landed. Starring a different verse of the same chapter
 * saves a separate favorite.
 */
export function favoriteId(passage: Passage): string {
  return `${passage.kind}:${passage.reference}:${passage.highlightVerse ?? 0}`;
}

/**
 * A canonical key for a set of verse (or paragraph) numbers: consecutive runs
 * are squeezed ("7-9") and anything else is listed apart ("3,7-9"), so a
 * scattered pick and a run each get one stable key. A contiguous run produces
 * the same key the earlier range-only save used, so old favorites still match.
 */
export function selectionKey(sections: number[]): string {
  const sorted = [...new Set(sections)].sort((a, b) => a - b);
  if (!sorted.length) return "";
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  return parts.join(",");
}

/**
 * A stable id for a set of verses saved together, distinct from the single
 * passage saved from the same chapter.
 */
export function favoriteSelectionId(passage: Passage, sections: number[]): string {
  return `${passage.kind}:${passage.reference}:${selectionKey(sections)}`;
}

/** How a saved selection is written short: "1 Nephi 3:3, 7-9" or "“Title” ¶3, 7-9". */
export function selectionReference(passage: Passage, sections: number[]): string {
  const key = selectionKey(sections).replace(/,/g, ", ");
  if (passage.kind === "conference") {
    return `\u201c${passage.chapter ?? passage.expansionTitle}\u201d \u00b6${key}`;
  }
  const book = passage.book ?? passage.reference.replace(/:.*$/, "");
  return `${book} ${passage.chapter ?? ""}:${key}`;
}

/**
 * The selection's verses as one block, each keeping its number, so the exact
 * boundaries of a multi-verse favorite stay visible once it is saved.
 */
export function selectionText(passage: Passage, sections: number[]): string {
  const wanted = new Set(sections);
  return passage.verses
    .filter((v) => wanted.has(v.number))
    .map((v) => `${v.number} ${v.text}`)
    .join(" ");
}

/** The selection's verses on their own, each with its number, for the favorites page. */
export function selectionParts(
  passage: Passage,
  sections: number[]
): { number: number; text: string }[] {
  const wanted = new Set(sections);
  return passage.verses.filter((v) => wanted.has(v.number)).map((v) => ({ number: v.number, text: v.text }));
}

/**
 * A favorite covering several verses (a run or a scattered pick), saved as one
 * card. The single range extent is kept only when the numbers really are in a
 * row; a scattered set carries its own list in `sections`.
 */
export function toSelectionFavorite(passage: Passage, sections: number[]): Favorite {
  const sorted = [...new Set(sections)].sort((a, b) => a - b);
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  const multiple = sorted.length > 1;
  return {
    id: favoriteSelectionId(passage, sorted),
    kind: passage.kind,
    reference: selectionReference(passage, sorted),
    sourceLabel: passage.sourceLabel,
    text: selectionText(passage, sorted),
    url: passage.url,
    urlLabel: passage.urlLabel,
    expansionTitle: passage.expansionTitle,
    book: passage.book,
    chapter: passage.chapter,
    section: from,
    sectionEnd: contiguous && to !== from ? to : undefined,
    sections: multiple ? sorted : undefined,
    parts: multiple ? selectionParts(passage, sorted) : undefined,
    savedAt: Date.now(),
  };
}

/** Whether this exact selection is already saved. */
export function isSelectionSaved(
  favorites: Favorite[],
  passage: Passage,
  sections: number[]
): boolean {
  const id = favoriteSelectionId(passage, sections);
  return favorites.some((f) => f.id === id);
}

/** Star or un-star a set of verses taken together. True when it is now saved. */
export function toggleSelectionFavorite(passage: Passage, sections: number[]): boolean {
  const id = favoriteSelectionId(passage, sections);
  const list = read();
  const saved = list.some((f) => f.id === id);
  write(saved ? list.filter((f) => f.id !== id) : [toSelectionFavorite(passage, sections), ...list]);
  return !saved;
}

export function toFavorite(passage: Passage): Favorite {
  return {
    id: favoriteId(passage),
    kind: passage.kind,
    reference: passage.reference,
    sourceLabel: passage.sourceLabel,
    text: passage.text,
    url: passage.url,
    urlLabel: passage.urlLabel,
    expansionTitle: passage.expansionTitle,
    book: passage.book,
    chapter: passage.chapter,
    section: passage.section,
    savedAt: Date.now(),
  };
}

/**
 * Merge favorites in (used by the importer), skipping ones already saved.
 * Returns how many were added and how many were already there.
 */
export function addFavorites(incoming: Favorite[]): { added: number; duplicates: number } {
  const existing = read();
  const ids = new Set(existing.map((f) => f.id));
  const fresh: Favorite[] = [];
  let duplicates = 0;

  for (const favorite of incoming) {
    if (ids.has(favorite.id)) {
      duplicates += 1;
      continue;
    }
    ids.add(favorite.id);
    fresh.push(favorite);
  }

  if (fresh.length) write([...fresh, ...existing]);
  return { added: fresh.length, duplicates };
}

/** Star or un-star a passage. Returns true when it is now saved. */
export function toggleFavorite(passage: Passage): boolean {
  const id = favoriteId(passage);
  const list = read();
  const saved = list.some((f) => f.id === id);
  write(saved ? list.filter((f) => f.id !== id) : [toFavorite(passage), ...list]);
  return !saved;
}

export function removeFavorite(id: string): void {
  write(read().filter((f) => f.id !== id));
}

/** Drop every saved passage. */
export function clearFavorites(): void {
  write([]);
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The saved passages, newest first. Empty during server rendering. */
export function useFavorites(): Favorite[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
