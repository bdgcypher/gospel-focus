"use client";

import { useSyncExternalStore } from "react";
import type { Favorite } from "./favorites";
import { wordCount, type HideOrder } from "./memorize-text";
import type { Passage } from "./types";

/**
 * The passages a reader is working on, and how far they have got with each.
 *
 * Two things are real here: the list itself, and the record of how it is going.
 * A passage is added from a draw or from a favorite, the hiding level is kept
 * where the reader left it, and every recitation is logged with the day it
 * happened.
 *
 * What is *not* here is scheduling — nothing decides when a passage should come
 * back. That is spaced repetition, and the page says so rather than pretending.
 * Logging the recitations now is what gives it something to schedule from
 * later.
 *
 * The deck keeps its own copy of the words rather than a reference back into
 * the library: a passage has to work offline, in a list that outlives the
 * chapter it was drawn from.
 */

/** One verse (or paragraph) of a passage being memorized. */
export interface MemoryPart {
  /** The verse or paragraph number; 0 when the source didn't know one. */
  number: number;
  text: string;
}

export interface MemoryItem {
  /** Stable across a re-add, so one passage is one card. */
  id: string;
  /**
   * The custom deck this card belongs to, or nothing for the main list.
   *
   * A passage lives in exactly one place: the list is the passage, and a deck
   * is one way of naming a group of them. That is why this is a field on the
   * card rather than a set of ids on the deck — deleting a deck takes its cards
   * with it, and no card can be left pointing at a deck that isn't there.
   */
  deckId?: string;
  kind: Passage["kind"];
  reference: string;
  sourceLabel: string;
  /**
   * Where the verses live in the library: the book ("Alma") and the chapter
   * ("32"), or a talk's own title. Kept so a card can be stretched — the deck
   * builder reads the chapter back out of the library to offer the next verse
   * (see `itemFromPassage`).
   */
  book?: string;
  chapter?: string;
  /** The words to learn, verse by verse — a talk's paragraph is one part. */
  parts: MemoryPart[];
  url: string;
  urlLabel: string;
  addedAt: number;
  /** How many times it has been recited whole from memory. */
  reviews: number;
  /** When that last happened, or null if never. */
  lastReviewed: number | null;
  /** How many of its words are currently out of sight. */
  hiddenLevel: number;
  /** Which of them come out first. */
  hideOrder: HideOrder;
}

const KEY = "gospel-focus:memorize:v1";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: MemoryItem[] = [];

let cache: MemoryItem[] | null = null;
let listening = false;
const listeners = new Set<() => void>();

/**
 * A stored row, checked enough to trust: it needs a name and at least one
 * verse's worth of words, because a card with nothing to hide is not a card.
 * Everything else falls back rather than being believed.
 */
function parseItem(value: unknown): MemoryItem | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MemoryItem>;
  if (typeof candidate.id !== "string" || !candidate.id) return null;
  if (typeof candidate.reference !== "string" || !candidate.reference) return null;

  const raw: unknown[] = Array.isArray(candidate.parts) ? candidate.parts : [];
  const parts: MemoryPart[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const part = entry as Partial<MemoryPart>;
    if (typeof part.text !== "string" || !part.text.trim()) continue;
    parts.push({ number: Number.isInteger(part.number) ? Number(part.number) : 0, text: part.text });
  }
  if (!parts.length) return null;

  const reviews = Number(candidate.reviews);
  const lastReviewed = Number(candidate.lastReviewed);

  return {
    id: candidate.id,
    deckId:
      typeof candidate.deckId === "string" && candidate.deckId ? candidate.deckId : undefined,
    kind: candidate.kind === "conference" ? "conference" : "scripture",
    reference: candidate.reference,
    sourceLabel: typeof candidate.sourceLabel === "string" ? candidate.sourceLabel : "",
    book: typeof candidate.book === "string" && candidate.book ? candidate.book : undefined,
    chapter:
      typeof candidate.chapter === "string" && candidate.chapter ? candidate.chapter : undefined,
    parts,
    url: typeof candidate.url === "string" ? candidate.url : "",
    urlLabel:
      typeof candidate.urlLabel === "string" && candidate.urlLabel
        ? candidate.urlLabel
        : "Open in Gospel Library",
    addedAt: Number.isFinite(Number(candidate.addedAt)) ? Number(candidate.addedAt) : Date.now(),
    reviews: Number.isInteger(reviews) && reviews > 0 ? reviews : 0,
    lastReviewed: Number.isFinite(lastReviewed) && lastReviewed > 0 ? lastReviewed : null,
    hiddenLevel:
      Number.isInteger(candidate.hiddenLevel) && Number(candidate.hiddenLevel) > 0
        ? Number(candidate.hiddenLevel)
        : 0,
    hideOrder: candidate.hideOrder === "scattered" ? "scattered" : "start",
  };
}

function parse(raw: string | null): MemoryItem[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    const items: MemoryItem[] = [];
    for (const entry of value) {
      const item = parseItem(entry);
      if (item) items.push(item);
    }
    return items;
  } catch {
    return EMPTY;
  }
}

function read(): MemoryItem[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  cache = parse(window.localStorage.getItem(KEY));
  return cache;
}

function write(next: MemoryItem[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota) — the session still
    // works, it just won't persist.
  }
  for (const listener of listeners) listener();
}

/** Keep another tab's list in sync with this one. */
function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== DECKS_KEY && e.key !== null) return;
    cache = parse(window.localStorage.getItem(KEY));
    deckCache = parseDecks(window.localStorage.getItem(DECKS_KEY));
    for (const listener of listeners) listener();
    for (const listener of deckListeners) listener();
  });
}

function update(id: string, patch: (item: MemoryItem) => MemoryItem): void {
  const list = read();
  let changed = false;
  const next = list.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return patch(item);
  });
  if (changed) write(next);
}

/** One passage is one card: the verse the book landed on. */
export function memoryId(passage: Passage): string {
  return `${passage.kind}:${passage.reference}:${passage.highlightVerse ?? 0}`;
}

function upsert(item: MemoryItem): { item: MemoryItem; added: boolean } {
  const list = read();
  const existing = list.find((entry) => entry.id === item.id);
  if (existing) return { item: existing, added: false };
  write([item, ...list]);
  return { item, added: true };
}

/**
 * The passage, as a card — before anything is stored.
 *
 * Separate from `addPassage` because a custom deck is built before it is saved:
 * the reader is choosing passages, and nothing should be on the list until they
 * say so. The builder keeps these, and `createDeck` stores them in one go.
 *
 * `verses` names the verses (or paragraphs) the card should hold, when the
 * reader is taking a run rather than the one verse that was drawn: the parts
 * come back in the chapter's own order, so a scattered pick reads the way the
 * passage does. Left out, the card is the drawn verse and nothing else.
 *
 * However long the run, the card is named for the verse it starts at — the
 * length belongs to the card, not to its label, which is what the list is
 * scanned by. That also fixes the card's identity: the first verse decides the
 * id, so stretching a card by a verse is still the same card.
 */
export function itemFromPassage(
  passage: Passage,
  deckId?: string,
  verses?: number[]
): MemoryItem {
  const drawn = passage.section ?? passage.highlightVerse ?? 0;
  const numbers = verses?.length ? [...new Set(verses)].sort((a, b) => a - b) : null;
  const wanted = new Set(numbers ?? [drawn]);
  const parts: MemoryPart[] = numbers
    ? passage.verses.filter((v) => wanted.has(v.number)).map((v) => ({ number: v.number, text: v.text }))
    : [{ number: drawn, text: passage.text }];
  // A run the passage can't supply (a citation for a verse the library doesn't
  // hold with the chapter it came from) falls back to the verse itself rather
  // than becoming a card with nothing to learn.
  if (!parts.length) parts.push({ number: drawn, text: passage.text });

  const first = parts[0].number;
  const reference =
    passage.kind === "scripture" && passage.book && passage.chapter && first > 0
      ? `${passage.book} ${passage.chapter}:${first}`
      : passage.reference;

  return {
    id: `${passage.kind}:${reference}:${first}`,
    deckId,
    kind: passage.kind,
    reference,
    sourceLabel: passage.sourceLabel,
    book: passage.book,
    chapter: passage.chapter,
    parts,
    url: passage.url,
    urlLabel: passage.urlLabel,
    addedAt: Date.now(),
    reviews: 0,
    lastReviewed: null,
    hiddenLevel: 0,
    hideOrder: "start",
  };
}

/**
 * Take the passage in hand, as one verse to learn — or as the run of verses
 * named by `verses`, which is how a selection is carried over from the reader.
 */
export function addPassage(
  passage: Passage,
  deckId?: string,
  verses?: number[]
): { item: MemoryItem; added: boolean } {
  return upsert(itemFromPassage(passage, deckId, verses));
}

/**
 * A starred passage, taken on as it was saved: a run of verses stays a run,
 * one part per verse, so the hiding works across the whole thing. As with the
 * draw, this hands back the card rather than storing it — the deck builder
 * saves a whole deck's worth at once.
 */
export function itemFromFavorite(favorite: Favorite, deckId?: string): MemoryItem {
  return {
    id: favorite.id,
    deckId,
    kind: favorite.kind,
    reference: favorite.reference,
    sourceLabel: favorite.sourceLabel,
    book: favorite.book,
    chapter: favorite.chapter,
    parts:
      favorite.parts && favorite.parts.length
        ? favorite.parts.map((part) => ({ number: part.number, text: part.text }))
        : [{ number: favorite.section ?? 0, text: favorite.text }],
    url: favorite.url,
    urlLabel: favorite.urlLabel,
    addedAt: Date.now(),
    reviews: 0,
    lastReviewed: null,
    hiddenLevel: 0,
    hideOrder: "start",
  };
}

export function addFavoriteToMemory(
  favorite: Favorite,
  deckId?: string
): { item: MemoryItem; added: boolean } {
  return upsert(itemFromFavorite(favorite, deckId));
}

export function removeMemory(id: string): void {
  write(read().filter((item) => item.id !== id));
}

/**
 * Drop the main list — the passages and everything learned about them.
 *
 * A custom deck is its own shelf, so clearing the list leaves the decks alone:
 * "clear the whole list" is a promise about the list, not about every card the
 * reader has named a group around. The list is the unnamed cards — the ones
 * with no deck — so those are the ones that go; everything the reader grouped
 * stays where it was put.
 */
export function clearMemory(): void {
  write(read().filter((item) => Boolean(item.deckId)));
}

/** Log one recitation, from memory and whole. */
export function recordReview(id: string, at: number = Date.now()): void {
  update(id, (item) => ({ ...item, reviews: item.reviews + 1, lastReviewed: at }));
}

/** Move the hiding along. The level can't pass the end of the passage. */
export function setHiddenLevel(id: string, level: number): void {
  update(id, (item) => {
    const total = itemWordCount(item);
    return { ...item, hiddenLevel: Math.max(0, Math.min(Math.trunc(level) || 0, total)) };
  });
}

export function setHideOrder(id: string, order: HideOrder): void {
  update(id, (item) => (item.hideOrder === order ? item : { ...item, hideOrder: order }));
}

export function isInMemory(items: MemoryItem[], id: string): boolean {
  return items.some((item) => item.id === id);
}

/** The passage as one run of text: every part's words, in order. */
export function itemText(item: MemoryItem): string {
  return item.parts.map((part) => part.text).join(" ");
}

/** How many words there are to hide. */
export function itemWordCount(item: MemoryItem): number {
  return item.parts.reduce((total, part) => total + wordCount(part.text), 0);
}

/** A named group of cards: what the app calls a deck. */
export interface Deck {
  id: string;
  name: string;
  createdAt: number;
}

const DECKS_KEY = "gospel-focus:decks:v1";

const NO_DECKS: Deck[] = [];

let deckCache: Deck[] | null = null;
const deckListeners = new Set<() => void>();

function parseDecks(raw: string | null): Deck[] {
  if (!raw) return NO_DECKS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return NO_DECKS;
    const decks: Deck[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Partial<Deck>;
      if (typeof candidate.id !== "string" || !candidate.id) continue;
      if (typeof candidate.name !== "string" || !candidate.name.trim()) continue;
      decks.push({
        id: candidate.id,
        name: candidate.name,
        createdAt: Number.isFinite(Number(candidate.createdAt))
          ? Number(candidate.createdAt)
          : Date.now(),
      });
    }
    return decks;
  } catch {
    return NO_DECKS;
  }
}

function readDecks(): Deck[] {
  if (deckCache) return deckCache;
  if (typeof window === "undefined") return NO_DECKS;
  deckCache = parseDecks(window.localStorage.getItem(DECKS_KEY));
  return deckCache;
}

function writeDecks(next: Deck[]): void {
  deckCache = next;
  try {
    window.localStorage.setItem(DECKS_KEY, JSON.stringify(next));
  } catch {
    // As with the cards: the session still works, it just won't persist.
  }
  for (const listener of deckListeners) listener();
}

/** A deck's own id. `randomUUID` is not everywhere, so the fallback is one too. */
function deckId(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function") return `d:${cryptoObj.randomUUID()}`;
  return `d:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Name a group of cards and put it on the shelf.
 *
 * The cards arrive as drafts (see `itemFromPassage`) and are stamped with the
 * deck's id here, at the one moment the deck exists. A card already on the list
 * is skipped rather than moved: a passage is one card, and saving the deck must
 * not quietly take it away from wherever it already was.
 */
export function createDeck(name: string, items: MemoryItem[]): Deck {
  const deck: Deck = { id: deckId(), name: name.trim(), createdAt: Date.now() };
  const list = read();
  const taken = new Set(list.map((item) => item.id));
  const cards = items
    .filter((item) => !taken.has(item.id))
    .map((item) => ({ ...item, deckId: deck.id }));
  writeDecks([deck, ...readDecks()]);
  if (cards.length) write([...cards, ...list]);
  return deck;
}

/**
 * Change a deck: its name, and which cards are in it.
 *
 * The cards that stayed keep their own record — a recitation logged this
 * morning is not lost because the deck was renamed this afternoon — while the
 * words themselves are taken from the draft, which is how a card can be
 * stretched to cover the verses next to it. Only the cards that left are
 * dropped from the store. A card that is already somewhere else is not taken:
 * saving the deck must not quietly pull a passage out of another deck or off
 * the main list.
 */
export function updateDeck(id: string, name: string, items: MemoryItem[]): void {
  const all = read();
  const wanted = new Set(items.map((item) => item.id));
  const draftById = new Map(items.map((item) => [item.id, item]));
  const kept = all
    .filter((item) => item.deckId !== id || wanted.has(item.id))
    .map((item) => {
      const draft = draftById.get(item.id);
      if (!draft) return item;
      // The words come from the draft — a run of verses can be stretched or
      // trimmed while the deck is open — while everything learned about the
      // card (its recitations, the hiding level, the day it was added) stays as
      // it was. A morning's recitation is not lost because the card grew a
      // verse in the afternoon.
      return {
        ...item,
        reference: draft.reference,
        book: draft.book,
        chapter: draft.chapter,
        parts: draft.parts,
      };
    });
  const present = new Set(all.map((item) => item.id));
  const added = items
    .filter((item) => !present.has(item.id))
    .map((item) => ({ ...item, deckId: id }));

  writeDecks(readDecks().map((deck) => (deck.id === id ? { ...deck, name: name.trim() } : deck)));
  write([...added, ...kept]);
}

/** Remove a deck and the cards it held — they were only ever on that shelf. */
export function removeDeck(id: string): void {
  writeDecks(readDecks().filter((deck) => deck.id !== id));
  write(read().filter((item) => item.deckId !== id));
}

function subscribeDecks(onChange: () => void): () => void {
  ensureStorageListener();
  deckListeners.add(onChange);
  return () => {
    deckListeners.delete(onChange);
  };
}

/** The custom decks, newest first. Empty during server rendering. */
export function useDecks(): Deck[] {
  return useSyncExternalStore(subscribeDecks, readDecks, () => NO_DECKS);
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The memory list, newest first. Empty during server rendering. */
export function useMemory(): MemoryItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
