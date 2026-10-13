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
