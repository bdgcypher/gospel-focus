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
  /** The first verse (or paragraph) the link covers. */
  section: number;
  /**
   * Every verse the link covers, when it names a range or a scattered pick.
   *
   * Kept beside `section` rather than replacing it: `section` is what the older
   * links — and every exported one — already say, and a single-verse link is
   * still a single verse. A link made from the picker sets both.
   */
  sections?: number[];
  conferenceId?: string;
  label: string;
  /** When the link joined the mark's chain; older links fall back to the mark's own creation. */
  addedAt?: string;
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
  /**
   * An optional name for the note, shown as its heading in the lists. It stays
   * on the mark, so it travels with the words it belongs to.
   */
  title?: string;
  /**
   * The passages this mark points at, in the order they were added.
   *
   * A mark can carry a chain of them — the verse it was marked on and the talk
   * that quotes it, an old reading and a newer one — and the reader's one link
   * indicator lists them all. Older records carry a single `link` instead, which
   * `parseLink` lifts into this list as they are read.
   */
  links?: AnnotationLink[];
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

/**
 * A stored link, checked enough to trust: it needs a place to point at, and its
 * verse list — when it has one — comes back as the positive numbers it was
 * written with. A link saved before the list existed has none, and stays the
 * single verse its `section` names.
 */
function parseLink(value: Partial<AnnotationLink>): AnnotationLink | null {
  if (typeof value.book !== "string" || !value.book) return null;
  const section = Number(value.section);
  const sections = Array.isArray(value.sections)
    ? [
        ...new Set(
          value.sections
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n > 0)
        ),
      ].sort((a, b) => a - b)
    : [];
  return {
    book: value.book,
    chapter: typeof value.chapter === "string" ? value.chapter : "",
    section: Number.isInteger(section) && section > 0 ? section : (sections[0] ?? 1),
    sections: sections.length ? sections : undefined,
    conferenceId: typeof value.conferenceId === "string" ? value.conferenceId : undefined,
    label: typeof value.label === "string" && value.label ? value.label : value.book,
    addedAt: typeof value.addedAt === "string" && value.addedAt ? value.addedAt : undefined,
  };
}

function parse(value: unknown): Annotation[] | null {
  if (!Array.isArray(value)) return null;
  const out: Annotation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const a = entry as Partial<Annotation> & { link?: Partial<AnnotationLink> };
    // A record written before a mark could hold more than one link says so with
    // a single `link`; it becomes the first of the list, which is the one link
    // it had.
    const links = (Array.isArray(a.links) ? a.links : [])
      .map((item) => (item && typeof item === "object" ? parseLink(item) : null))
      .filter((item): item is AnnotationLink => item !== null);
    if (!links.length && a.link && typeof a.link.book === "string") {
      const legacy = parseLink(a.link);
      if (legacy) links.push(legacy);
    }
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
      title: typeof a.title === "string" && a.title.trim() ? a.title : undefined,
      links: links.length ? links : undefined,
      tags: Array.isArray(a.tags)
        ? [...new Set(a.tags.filter((t): t is string => typeof t === "string").map(cleanTag))].filter(
            (tag) => tag.length > 0
          )
        : [],
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
  title?: string;
  /** The passages the mark points at, in the order they were added. */
  links?: AnnotationLink[];
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
    title: item.title,
    links: item.links?.length ? item.links : undefined,
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

/** The place a link can name, told the way a document tells it about itself. */
export interface LinkPlace {
  kind: "scripture" | "conference";
  book: string;
  chapter: string;
  conferenceId?: string;
}

/** A mark elsewhere in the library whose link names a place in this one. */
export interface Backlink {
  /** The mark carrying the outward link. */
  mark: Annotation;
  /** That mark's own link — the one that points here. */
  link: AnnotationLink;
}

/**
 * A name as it is compared: case and spacing are the reader's business, not
 * the record's — "1 Nephi" and "1  nephi" are the same book.
 */
const sameName = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Whether a link names a place: its book and chapter, or a talk's session and
 * title.
 *
 * A link stores the library's own words for where it points rather than a
 * document id — that is what it was written with, and what an imported one
 * says — so matching it to the document on screen is a comparison of names.
 * Chapter and session ids are compared exactly; book names are compared the way
 * the reader reads them, since two records naming "1 Nephi" are the same book
 * however they were spaced.
 */
function linkNamesPlace(link: AnnotationLink, place: LinkPlace): boolean {
  if (link.conferenceId || place.kind === "conference") {
    return (
      place.kind === "conference" &&
      Boolean(link.conferenceId) &&
      link.conferenceId === place.conferenceId &&
      sameName(link.chapter, place.chapter)
    );
  }
  return (
    place.kind === "scripture" &&
    sameName(link.book, place.book) &&
    sameName(link.chapter, place.chapter)
  );
}

/**
 * The backlinks of a document, by verse: every mark somewhere else in the
 * library whose link names a verse of this one.
 *
 * A link is written once, on the mark it belongs to, and is read from both
 * ends: linking 1 Nephi 3:7 to D&C 6:36 means opening D&C 6:36 shows the way
 * back to 1 Nephi 3:7 without a second link ever being stored. Nothing has to
 * be kept in step, so removing the link removes the backlink with it, and an
 * imported mark brings its own backlinks along.
 *
 * A link that names a run of verses is a backlink on every verse of the run:
 * whichever one the reader opens, the passage they came from is there.
 */
export function backlinksForDoc(annotations: Annotation[], place: LinkPlace): Map<number, Backlink[]> {
  const found = new Map<number, Backlink[]>();

  for (const mark of annotations) {
    for (const link of mark.links ?? []) {
      if (!linkNamesPlace(link, place)) continue;
      const verses = new Set(link.sections?.length ? link.sections : [link.section]);
      for (const verse of verses) {
        const list = found.get(verse) ?? [];
        // The same record cannot be the way back twice, however many of its
        // links name this verse; one entry is what the reader reads.
        if (!list.some((entry) => entry.mark.id === mark.id)) list.push({ mark, link });
        found.set(verse, list);
      }
    }
  }

  return found;
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

/**
 * A tag as the app stores it: no hash, one space between words, and short.
 *
 * Tags are typed by the reader, so they arrive with stray spacing and the
 * hash a pill is drawn with. The hash is the pill's, not the tag's: it is
 * added when the tag is shown, so the same tag never exists twice. The length
 * is the one a pill can read without turning the tag row into a line of prose.
 */
export function cleanTag(value: string): string {
  return value.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

/** Two tags as one string, for comparing them in whatever case they were typed. */
export function tagKey(tag: string): string {
  return cleanTag(tag).toLowerCase();
}

/** Every tag used in the library once, alphabetically, in the reader's own casing. */
export function allTags(annotations: Annotation[]): string[] {
  const seen = new Map<string, string>();
  for (const annotation of annotations) {
    for (const raw of annotation.tags) {
      const tag = cleanTag(raw);
      const key = tag.toLowerCase();
      if (tag && !seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
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
    const title = (annotation.title ?? "").toLowerCase();
    const note = noteText(annotation.note).toLowerCase();
    const tags = annotation.tags.map((tag) => tag.toLowerCase());
    const tagged = tags.map((tag) => `#${tag}`).join(" ");
    const link = (annotation.links ?? [])
      .map((entry) => entry.label)
      .join(" ")
      .toLowerCase();

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
        title.includes(term) ||
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
