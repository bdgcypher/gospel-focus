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
   * The decks this card is in, at least one once it is saved.
   *
   * One passage is one card however many decks hold it: the words, the hiding
   * level and the recitations belong to the passage, not to the shelf, so a
   * card added to a second deck arrives with everything already learned about
   * it. A card with no deck is not kept — it would be a card with nowhere to be
   * found — so nothing writes one, and taking a card out of its last deck takes
   * the card with it.
   *
   * Ids live on the card rather than on the deck for the same reason as ever:
   * deleting a deck must leave no card pointing at one that isn't there.
   */
  deckIds: string[];
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
/**
 * The stored text `cache` was parsed from.
 *
 * A snapshot is only reused while storage still says what it said when it was
 * parsed. Reading is a single `getItem`, and the JSON is only parsed again when
 * that string has changed — which is what lets two copies of this module (a
 * route that was hot-reloaded, a page restored from suspension) agree: each one
 * compares against the store rather than trusting a cache it cannot see the
 * other side of.
 */
let cachedRaw: string | null = null;
let listening = false;
const listeners = new Set<() => void>();

/**
 * A stored card's decks, from either shape the store has kept them in: the
 * `deckIds` of today, or the single `deckId` a card had before one passage
 * could sit on several shelves. A card stored before decks existed at all comes
 * back with none — still readable, so nothing is thrown away, and the first deck
 * it is added to adopts it.
 */
function deckIdsOf(candidate: Partial<MemoryItem> & { deckId?: unknown }): string[] {
  if (Array.isArray(candidate.deckIds)) {
    return [...new Set(candidate.deckIds.filter((id): id is string => typeof id === "string" && !!id))];
  }
  return typeof candidate.deckId === "string" && candidate.deckId ? [candidate.deckId] : [];
}

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
    deckIds: deckIdsOf(candidate),
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
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (cache && raw === cachedRaw) return cache;
  cachedRaw = raw;
  cache = parse(raw);
  return cache;
}

function write(next: MemoryItem[]): void {
  const raw = JSON.stringify(next);
  cache = next;
  cachedRaw = raw;
  try {
    window.localStorage.setItem(KEY, raw);
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
    // Dropped rather than re-read here: the next snapshot reads the store
    // itself (see `read`), which is the one place that knows how.
    cache = null;
    cachedRaw = null;
    deckCache = null;
    cachedDecksRaw = null;
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

/**
 * Put a card on the shelf, in a deck.
 *
 * A passage already known to the app is not rebuilt: adding it to another deck
 * adds the deck to the card and keeps everything learned about it. That is what
 * makes one passage one card across the decks that hold it, and what lets a
 * card be taken out of one deck without losing what another deck knows.
 *
 * Public because the deck picker has the card already built (`itemFromPassage`,
 * `itemFromFavorite`) and only needs to file it: building it again would throw
 * away nothing, but it would also mean the picker knew how every kind of card
 * is made.
 */
export function addCardToDeck(
  draft: MemoryItem,
  deckId?: string
): { item: MemoryItem; added: boolean } {
  const list = read();
  const existing = list.find((entry) => entry.id === draft.id);
  if (!existing) {
    const item = deckId ? { ...draft, deckIds: [deckId] } : draft;
    write([item, ...list]);
    return { item, added: true };
  }
  if (!deckId || existing.deckIds.includes(deckId)) return { item: existing, added: false };
  const item = { ...existing, deckIds: [...existing.deckIds, deckId] };
  write(list.map((entry) => (entry.id === item.id ? item : entry)));
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
    deckIds: deckId ? [deckId] : [],
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
  return addCardToDeck(itemFromPassage(passage, deckId, verses), deckId);
}

/**
 * A favorited passage, taken on as it was saved: a run of verses stays a run,
 * one part per verse, so the hiding works across the whole thing. As with the
 * draw, this hands back the card rather than storing it — the deck builder
 * saves a whole deck's worth at once.
 */
export function itemFromFavorite(favorite: Favorite, deckId?: string): MemoryItem {
  return {
    id: favorite.id,
    deckIds: deckId ? [deckId] : [],
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
  return addCardToDeck(itemFromFavorite(favorite, deckId), deckId);
}

/**
 * Take a card out of one deck, keeping it everywhere else it lives.
 *
 * The last deck is the difference between a card and a ghost: with nowhere left
 * to be seen, the card goes, along with what had been learned about it. A card
 * that leaves one deck while another still holds it keeps its words and its
 * recitations exactly as they were.
 */
export function removeFromDeck(cardId: string, deckId: string): void {
  const list = read();
  const card = list.find((item) => item.id === cardId);
  if (!card) return;
  const deckIds = card.deckIds.filter((id) => id !== deckId);
  write(
    deckIds.length
      ? list.map((item) => (item.id === cardId ? { ...item, deckIds } : item))
      : list.filter((item) => item.id !== cardId)
  );
}

export function removeMemory(id: string): void {
  write(read().filter((item) => item.id !== id));
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
/** The stored text `deckCache` was parsed from. See `cachedRaw`. */
let cachedDecksRaw: string | null = null;
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
  if (typeof window === "undefined") return NO_DECKS;
  const raw = window.localStorage.getItem(DECKS_KEY);
  if (deckCache && raw === cachedDecksRaw) return deckCache;
  cachedDecksRaw = raw;
  deckCache = parseDecks(raw);
  return deckCache;
}

function writeDecks(next: Deck[]): void {
  const raw = JSON.stringify(next);
  deckCache = next;
  cachedDecksRaw = raw;
  try {
    window.localStorage.setItem(DECKS_KEY, raw);
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
 * deck's id here, at the one moment the deck exists. A card already on the
 * shelf is not rebuilt — it joins this deck as well, keeping everything learned
 * about it, because one passage is one card wherever it is kept.
 */
export function createDeck(name: string, items: MemoryItem[]): Deck {
  const deck: Deck = { id: deckId(), name: name.trim(), createdAt: Date.now() };
  const list = read();
  const drafts = new Map(items.map((item) => [item.id, item]));
  let changed = false;
  const joined = list.map((item) => {
    if (!drafts.has(item.id) || item.deckIds.includes(deck.id)) return item;
    changed = true;
    return { ...item, deckIds: [...item.deckIds, deck.id] };
  });
  const present = new Set(list.map((item) => item.id));
  const added = items
    .filter((item) => !present.has(item.id))
    .map((item) => ({ ...item, deckIds: [...new Set([...item.deckIds, deck.id])] }));

  writeDecks([deck, ...readDecks()]);
  if (added.length || changed) write([...added, ...joined]);
  return deck;
}

/**
 * Change a deck: its name, and which cards are in it.
 *
 * The cards that stayed keep their own record — a recitation logged this
 * morning is not lost because the deck was renamed this afternoon — while the
 * words themselves are taken from the draft, which is how a card can be
 * stretched to cover the verses next to it. A card taken out of this deck stays
 * if another deck still holds it, and goes if this was its only one. A card
 * already in another deck is welcome here too: adding it must not quietly pull
 * the passage out of that one.
 */
export function updateDeck(id: string, name: string, items: MemoryItem[]): void {
  const all = read();
  const drafts = new Map(items.map((item) => [item.id, item]));
  const next: MemoryItem[] = [];

  for (const item of all) {
    const draft = drafts.get(item.id);
    const here = item.deckIds.includes(id);

    if (here && draft) {
      // The words come from the draft — a run of verses can be stretched or
      // trimmed while the deck is open — while everything learned about the
      // card (its recitations, the hiding level, the day it was added) stays as
      // it was. A morning's recitation is not lost because the card grew a
      // verse in the afternoon.
      next.push({
        ...item,
        reference: draft.reference,
        book: draft.book,
        chapter: draft.chapter,
        parts: draft.parts,
      });
      continue;
    }

    if (here) {
      // Left this deck: still a card if another one holds it.
      const deckIds = item.deckIds.filter((deckId) => deckId !== id);
      if (deckIds.length) next.push({ ...item, deckIds });
      continue;
    }

    next.push(draft ? { ...item, deckIds: [...item.deckIds, id] } : item);
  }

  const present = new Set(all.map((item) => item.id));
  const added = items
    .filter((item) => !present.has(item.id))
    .map((item) => ({ ...item, deckIds: [...new Set([...item.deckIds, id])] }));

  writeDecks(readDecks().map((deck) => (deck.id === id ? { ...deck, name: name.trim() } : deck)));
  write([...added, ...next]);
}

/**
 * Remove a deck. Its cards leave with it, unless another deck still holds them.
 */
export function removeDeck(id: string): void {
  writeDecks(readDecks().filter((deck) => deck.id !== id));
  const next: MemoryItem[] = [];
  for (const item of read()) {
    if (!item.deckIds.includes(id)) {
      next.push(item);
      continue;
    }
    const deckIds = item.deckIds.filter((deckId) => deckId !== id);
    if (deckIds.length) next.push({ ...item, deckIds });
  }
  write(next);
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

/** Every card, newest first. Empty during server rendering. */
export function useMemory(): MemoryItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
