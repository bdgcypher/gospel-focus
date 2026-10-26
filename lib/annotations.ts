"use client";

import { useSyncExternalStore } from "react";

/**
 * Marks and notes on words, the way Gospel Library keeps them.
 *
 * The anchor is deliberately not a character offset: it is a *word* range
 * inside one verse, one-indexed and inclusive, exactly the shape the Church's
 * Notes API stores (`startOffset` / `endOffset`). Two consequences follow, and
 * both are the reason for the choice:
 *
 * - a mark survives a rebuild of the library, because it counts words rather
 *   than bytes, and
 * - a mark exported from Gospel Library can be imported without guessing, and
 *   one of ours can be handed back in the same shape.
 *
 * A selection that crosses verses becomes one annotation per verse sharing a
 * `groupId`. That keeps rendering a per-verse job and still lets a note belong
 * to the whole sweep.
 *
 * Storage is IndexedDB rather than localStorage: an imported library can run to
 * tens of thousands of records with note bodies, which is past localStorage's
 * ceiling. Reads are synchronous from a cached array once hydration finishes,
 * because rendering a chapter asks for its marks on every paint.
 */

/** The Church's own palette, plus `clear` for a note with no visible mark. */
export const MARK_COLORS = [
  "yellow",
  "red",
  "green",
  "blue",
  "purple",
  "orange",
  "pink",
  "brown",
  "gray",
] as const;

export type MarkColor = (typeof MARK_COLORS)[number] | "clear";

export type MarkStyle = "fill" | "underline";

/** The palette the toolbar offers: the three standards first, then the rest. */
export const HIGHLIGHT_COLORS: MarkColor[] = ["yellow", "red", "green", "blue", "purple"];
export const UNDERLINE_COLORS: MarkColor[] = ["red", "blue", "green", "purple"];

/**
 * One way of marking: a colour in one of the two styles.
 *
 * The panel keeps the reader's last couple of these in front of the palette, so
 * the colour they keep reaching for is one tap in whatever mode they last used
 * it — Gospel Library's own bar leads with its recent marks the same way.
 */
export interface MarkChoice {
  color: MarkColor;
  style: MarkStyle;
}

/** How many of the reader's latest choices the panel shows before the palette. */
export const RECENT_LIMIT = 2;

const RECENT_KEY = "gospel-focus:mark-recents:v1";

let recents: MarkChoice[] | null = null;
const recentListeners = new Set<() => void>();
const NO_RECENTS: MarkChoice[] = [];

/**
 * The choices kept on this device, newest first.
 *
 * Read once and then held: the panel asks on every paint, and a synchronous
 * localStorage read per render would be a parse of the same string each time.
 * Anything that is not a colour from the palette in one of the two styles is
 * dropped rather than trusted.
 */
function readRecents(): MarkChoice[] {
  if (recents) return recents;
  if (typeof window === "undefined") return NO_RECENTS;

  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    recents = Array.isArray(stored)
      ? stored
          .filter((entry): entry is MarkChoice => {
            if (!entry || typeof entry !== "object") return false;
            const choice = entry as Partial<MarkChoice>;
            return (
              typeof choice.color === "string" &&
              (MARK_COLORS as readonly string[]).includes(choice.color) &&
              (choice.style === "fill" || choice.style === "underline")
            );
          })
          .slice(0, RECENT_LIMIT)
      : NO_RECENTS;
  } catch {
    recents = NO_RECENTS;
  }
  return recents;
}

/**
 * Remember a colour in the style it was used in.
 *
 * Newest first, without duplicates: using yellow again moves it to the front
 * rather than adding a second yellow, and only the last `RECENT_LIMIT` are kept
 * — a longer list would push the palette off a phone's screen to remember
 * choices nobody is making any more.
 */
export function noteRecentChoice(color: MarkColor, style: MarkStyle): void {
  if (color === "clear") return;
  const next = [
    { color, style },
    ...readRecents().filter((choice) => choice.color !== color || choice.style !== style),
  ].slice(0, RECENT_LIMIT);

  recents = next;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable; the panel still leads with these this visit.
  }
  for (const listener of recentListeners) listener();
}

function subscribeRecents(onChange: () => void): () => void {
  recentListeners.add(onChange);
  return () => {
    recentListeners.delete(onChange);
  };
}

/** The reader's last two choices, newest first. Empty until they make one. */
export function useRecentChoices(): MarkChoice[] {
  return useSyncExternalStore(subscribeRecents, readRecents, () => NO_RECENTS);
}

/** The same list outside React, for anything that only needs it once. */
export function readRecentChoices(): MarkChoice[] {
  return readRecents();
}

export interface AnnotationLink {
  book: string;
  chapter: string;
  section: number;
  conferenceId?: string;
  label: string;
}

export interface Annotation {
  id: string;
  /** The document this mark sits on: `ot/jer/3`, or `c/2015-04/7` for a talk. */
  doc: string;
  /** Book name, kept for export and for the marks list without a lookup. */
  book: string;
  /** Chapter number as a string, or the talk's title. */
  chapter: string;
  verse: number;
  /** One-indexed, inclusive, over whitespace-separated words of the verse. */
  startWord: number;
  endWord: number;
  color: MarkColor;
  style: MarkStyle;
  /** What the reader wrote, as sanitized HTML (see lib/journal.ts). */
  note?: string;
  link?: AnnotationLink;
  tags: string[];
  /** Marks made in one gesture across several verses share this. */
  groupId?: string;
  createdAt: string;
  updatedAt: string;
  /** Where an imported mark came from, so re-imports can update instead of duplicate. */
  origin?: { annotationId: string; locale?: string; provider?: string };
}

const DB_NAME = "gospel-focus";
const DB_VERSION = 1;
const STORE = "annotations";
const CACHE_KEY = "gospel-focus:annotations:v1";

let cache: Annotation[] | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const EMPTY: Annotation[] = [];

function notify(): void {
  for (const listener of listeners) listener();
}

function parse(value: unknown): Annotation[] | null {
  if (!Array.isArray(value)) return null;
  const out: Annotation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const a = entry as Partial<Annotation>;
    if (typeof a.id !== "string" || typeof a.doc !== "string") continue;
    if (typeof a.verse !== "number" || typeof a.startWord !== "number" || typeof a.endWord !== "number") continue;
    if (a.color !== "clear" && !MARK_COLORS.includes(a.color as (typeof MARK_COLORS)[number])) continue;
    out.push({
      id: a.id,
      doc: a.doc,
      book: typeof a.book === "string" ? a.book : "",
      chapter: typeof a.chapter === "string" ? a.chapter : "",
      verse: a.verse,
      startWord: Math.max(1, Math.round(a.startWord)),
      endWord: Math.max(Math.max(1, Math.round(a.startWord)), Math.round(a.endWord)),
      color: a.color as MarkColor,
      style: a.style === "underline" ? "underline" : "fill",
      note: typeof a.note === "string" ? a.note : undefined,
      link: a.link && typeof a.link.book === "string" ? a.link : undefined,
      tags: Array.isArray(a.tags) ? a.tags.filter((t): t is string => typeof t === "string") : [],
      groupId: typeof a.groupId === "string" ? a.groupId : undefined,
      createdAt: typeof a.createdAt === "string" ? a.createdAt : new Date(0).toISOString(),
      updatedAt: typeof a.updatedAt === "string" ? a.updatedAt : new Date(0).toISOString(),
      origin: a.origin && typeof a.origin.annotationId === "string" ? a.origin : undefined,
    });
  }
  return out;
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("doc", "doc", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/**
 * Load every annotation once per visit.
 *
 * The whole set is kept in memory: a chapter asks for its own marks on every
 * render, and a single reader has no more annotations than a phone can hold.
 * The localStorage copy is a fallback for a WebView with IndexedDB disabled,
 * not a second source of truth.
 */
export function ensureAnnotations(): Promise<void> {
  if (cache) return Promise.resolve();
  if (loading) return loading;

  loading = (async () => {
    const db = await openDb();
    if (!db) {
      try {
        cache = parse(JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null")) ?? EMPTY;
      } catch {
        cache = EMPTY;
      }
      notify();
      return;
    }

    const loaded = await new Promise<Annotation[]>((resolve) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(parse(request.result) ?? EMPTY);
      request.onerror = () => resolve(EMPTY);
    });
    cache = loaded;
    notify();
  })();

  return loading;
}

async function persistPut(items: Annotation[]): Promise<void> {
  const db = await openDb();
  if (!db) {
    mirror();
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const item of items) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

async function persistDelete(ids: string[]): Promise<void> {
  const db = await openDb();
  if (!db) {
    mirror();
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** The fallback copy, written only when IndexedDB is unavailable. */
function mirror(): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache ?? []));
  } catch {
    // Storage can be full; the session still has the marks in memory.
  }
}

function commit(next: Annotation[]): void {
  cache = next;
  notify();
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface NewAnnotation {
  doc: string;
  book: string;
  chapter: string;
  verse: number;
  startWord: number;
  endWord: number;
  color?: MarkColor;
  style?: MarkStyle;
  note?: string;
  link?: AnnotationLink;
  tags?: string[];
  groupId?: string;
  origin?: Annotation["origin"];
}

/** Add marks, returning them as stored. */
export async function addAnnotations(items: NewAnnotation[]): Promise<Annotation[]> {
  await ensureAnnotations();
  const now = new Date().toISOString();
  const created: Annotation[] = items.map((item) => ({
    id: newId(),
    doc: item.doc,
    book: item.book,
    chapter: item.chapter,
    verse: item.verse,
    startWord: item.startWord,
    endWord: item.endWord,
    color: item.color ?? "yellow",
    style: item.style ?? "fill",
    note: item.note,
    link: item.link,
    tags: item.tags ?? [],
    groupId: item.groupId,
    createdAt: now,
    updatedAt: now,
    origin: item.origin,
  }));
  commit([...(cache ?? []), ...created]);
  void persistPut(created);
  return created;
}

export async function updateAnnotation(id: string, patch: Partial<Annotation>): Promise<void> {
  await ensureAnnotations();
  const current = (cache ?? []).find((a) => a.id === id);
  if (!current) return;
  const next: Annotation = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
  commit((cache ?? []).map((a) => (a.id === id ? next : a)));
  void persistPut([next]);
}

export async function removeAnnotations(ids: string[]): Promise<void> {
  await ensureAnnotations();
  const wanted = new Set(ids);
  commit((cache ?? []).filter((a) => !wanted.has(a.id)));
  void persistDelete(ids);
}

/**
 * Merge imported marks in, updating any that came from the same source record.
 *
 * Matching is by `origin.annotationId` first and plain id second, so importing
 * the same Gospel Library export twice refreshes the marks instead of doubling
 * them.
 */
export async function importAnnotations(items: Annotation[]): Promise<{ added: number; updated: number }> {
  await ensureAnnotations();
  const byOrigin = new Map<string, Annotation>();
  const byId = new Map<string, Annotation>();
  for (const a of cache ?? []) {
    byId.set(a.id, a);
    if (a.origin?.annotationId) byOrigin.set(a.origin.annotationId, a);
  }

  let added = 0;
  let updated = 0;
  const writes: Annotation[] = [];

  for (const item of items) {
    const existing = item.origin?.annotationId
      ? byOrigin.get(item.origin.annotationId)
      : byId.get(item.id);
    if (existing) {
      const next: Annotation = {
        ...item,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      byId.set(next.id, next);
      writes.push(next);
      updated += 1;
    } else {
      byId.set(item.id, item);
      writes.push(item);
      added += 1;
    }
  }

  commit([...byId.values()]);
  void persistPut(writes);
  return { added, updated };
}

export async function clearAnnotations(): Promise<void> {
  await ensureAnnotations();
  const ids = (cache ?? []).map((a) => a.id);
  commit([]);
  void persistDelete(ids);
}

/** Every annotation, newest first. Empty until hydration finishes. */
export function useAnnotations(): Annotation[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

function read(): Annotation[] {
  return cache ?? EMPTY;
}

let listening = false;

function subscribe(onChange: () => void): () => void {
  void ensureAnnotations();
  listeners.add(onChange);

  // Another tab writing the fallback copy is a whole-set change, so the cache
  // is replaced rather than merged.
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== CACHE_KEY) return;
      try {
        cache = parse(JSON.parse(event.newValue ?? "null")) ?? EMPTY;
        notify();
      } catch {
        // A half-written value is not a set of marks.
      }
    });
  }

  return () => {
    listeners.delete(onChange);
  };
}

/** The marks on one document, or on one verse of it. */
export function annotationsFor(annotations: Annotation[], doc: string, verse?: number): Annotation[] {
  return annotations.filter((a) => a.doc === doc && (verse === undefined || a.verse === verse));
}

/**
 * One mark's identity, across the verses it covers.
 *
 * A run of words that crosses a verse break is stored as one annotation per
 * verse, sharing a `groupId` (see the note at the top of this file). Everything
 * the reader does to *a mark* — open it, recolour it, convert it, remove it — is
 * therefore done to the group, not to the segment a finger happened to land on.
 */
export function markGroupId(annotation: Annotation): string {
  return annotation.groupId ?? annotation.id;
}

/** Every segment of the mark an annotation belongs to, in reading order. */
export function markGroup(annotations: Annotation[], annotation: Annotation): Annotation[] {
  const id = markGroupId(annotation);
  return annotations
    .filter((a) => a.doc === annotation.doc && markGroupId(a) === id)
    .sort((a, b) => a.verse - b.verse || a.startWord - b.startWord);
}

/**
 * The marks covering one word, each expanded to its whole group.
 *
 * This is what a tap on the words asks: not "which segment is under my finger"
 * but "which marks are here" — so a sweep across verses answers once, and two
 * marks on the same words answer twice, in the order they were made.
 */
export function marksAt(annotations: Annotation[], doc: string, verse: number, word: number): Annotation[][] {
  const here = annotations.filter(
    (a) => a.doc === doc && a.verse === verse && a.startWord <= word && word <= a.endWord
  );

  const seen = new Set<string>();
  const groups: Annotation[][] = [];
  for (const annotation of here) {
    const id = markGroupId(annotation);
    if (seen.has(id)) continue;
    seen.add(id);
    groups.push(markGroup(annotations, annotation));
  }

  return groups.sort((a, b) => (a[0].createdAt ?? "").localeCompare(b[0].createdAt ?? ""));
}

/** Whitespace-separated words with their character offsets. */
export function wordsOf(text: string): { word: string; start: number; end: number }[] {
  const words: { word: string; start: number; end: number }[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    words.push({ word: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return words;
}

export interface SelectionRange {
  verse: number;
  startWord: number;
  endWord: number;
}

/**
 * The word ranges a DOM selection covers, one per verse.
 *
 * Rendered words carry `data-verse` and `data-word`, so the mapping from a
 * browser selection to the anchor format is a walk over the spans the selection
 * intersects. A selection that starts or ends mid-word snaps to whole words,
 * which is what a highlighter should do.
 */
export function rangesInSelection(root: HTMLElement): SelectionRange[] {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];

  const byVerse = new Map<number, { startWord: number; endWord: number }>();
  for (const element of root.querySelectorAll<HTMLElement>("[data-word]")) {
    if (!range.intersectsNode(element)) continue;
    const verse = Number(element.dataset.verse);
    const word = Number(element.dataset.word);
    if (!Number.isInteger(verse) || !Number.isInteger(word)) continue;
    const entry = byVerse.get(verse);
    if (!entry) byVerse.set(verse, { startWord: word, endWord: word });
    else {
      entry.startWord = Math.min(entry.startWord, word);
      entry.endWord = Math.max(entry.endWord, word);
    }
  }

  return [...byVerse.entries()]
    .map(([verse, entry]) => ({ verse, ...entry }))
    .sort((a, b) => a.verse - b.verse);
}

/**
 * The marks that carry words of the reader's own.
 *
 * A highlight with no note is a place in the text; a note is a thought about
 * it. The two are kept in one store — Gospel Library keeps them that way too —
 * so the view that collects thoughts asks this rather than reading a second
 * list.
 */
export function marksWithNotes(annotations: Annotation[]): Annotation[] {
  return annotations.filter((annotation) => noteText(annotation.note).length > 0);
}

/**
 * Marks matching a search, over what a reader can see: the note's words, the
 * reference it sits on, and its tags.
 *
 * Every term has to match, so "alma faith" finds the note on Alma that talks
 * about faith rather than every Alma mark. The marked words themselves are not
 * searched here: they live in the library, not in the mark, and a search box
 * that waited on a volume file for each keystroke would be worse than one that
 * answers from what is already in hand.
 *
 * A number is matched as a *number* — the chapter, the verse, a word in the
 * note, or a book's own number — never as part of a longer one. That is the difference between
 * "jeremiah 5" finding chapter five and finding chapter three, verse fifteen,
 * which is exactly what a substring search over "3:15" would do. A book's own
 * number is still a word ("1 Nephi"), so "1" matches the book that begins with
 * it.
 */
export function searchMarks(annotations: Annotation[], query: string): Annotation[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return annotations;

  return annotations.filter((annotation) => {
    const book = annotation.book.toLowerCase();
    const bookTerms = book.split(/\s+/);
    const chapter = annotation.chapter.toLowerCase();
    const verse = String(annotation.verse);
    const reference = `${book} ${chapter}:${verse}`;
    const note = noteText(annotation.note).toLowerCase();
    const tags = annotation.tags.map((tag) => tag.toLowerCase());
    const tagged = tags.map((tag) => `#${tag}`).join(" ");
    const link = (annotation.link?.label ?? "").toLowerCase();

    return terms.every((term) => {
      // A number: the chapter, the verse, the book's own number, or a word in
      // what the reader wrote. Never a digit inside a longer number.
      if (/^\d+$/.test(term)) {
        return (
          chapter === term ||
          verse === term ||
          bookTerms.includes(term) ||
          note.split(/\s+/).some((word) => word.replace(/[^0-9]/g, "") === term) ||
          tags.includes(term)
        );
      }

      return (
        book.includes(term) ||
        reference.includes(term) ||
        note.includes(term) ||
        tags.some((tag) => tag.includes(term)) ||
        tagged.includes(term) ||
        link.includes(term)
      );
    });
  });
}

/**
 * A note's body as one line of prose, for lists.
 *
 * Notes are HTML (lib/journal.ts sanitises them), and a marks list wants the
 * words, not the tags: this strips the markup and collapses the whitespace a
 * paragraph break leaves behind. It is a preview, never a sanitiser — the editor
 * and the sanitiser decide what a note is allowed to hold.
 */
export function noteText(html: string | undefined): string {
  if (!html) return "";
  return html
    // Block ends become a space — the words either side of them are separate —
    // while an inline tag is simply lifted out, so "<strong>both</strong>."
    // reads as "both." rather than "both ."
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|ul|ol)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words a range covers, as the reader sees them. */
export function rangeText(verseText: string, startWord: number, endWord: number): string {
  return wordsOf(verseText)
    .slice(Math.max(0, startWord - 1), endWord)
    .map((w) => w.word)
    .join(" ");
}
