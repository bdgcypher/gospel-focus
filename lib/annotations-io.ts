"use client";

import {
  MARK_COLORS,
  wordsOf,
  type Annotation,
  type AnnotationLink,
  type MarkColor,
  type MarkStyle,
  newId,
  importAnnotations,
} from "./annotations";
import { loadConferenceData } from "./picker";
import { openReaderDoc, type ReaderDoc } from "./reader";

/**
 * Marks in and out of Gospel Library's own shape.
 *
 * The Church publishes a reader's annotations as a JSON file — the export behind
 * "Download your data" — and this module writes one with the same envelope, the
 * same record fields, and the same anchors, and reads that file back. There is
 * no third-party API to sync against: the Notes service sits behind an OAuth
 * client the Church registers, so a file is the honest way in and out (see
 * components/gospel-library-sync.tsx for what the app says about that).
 *
 * The anchor is the interesting part, and it is why lib/annotations.ts counts
 * words at all. Gospel Library locates a mark by three things together:
 *
 *   docId        "ot/jer/3" — volume, book, chapter, exactly our document id
 *   uri          the chapter's URL, with `id=p15` naming the verse
 *   offsets      the character span inside that verse
 *
 * Our storage is the first two and a *word* range instead of a character span.
 * Converting between them needs the verse's text, which is why both directions
 * look the chapter up in the library first: a character offset means nothing
 * without the words it counts through. The result round-trips — export then
 * import returns the same words — and a mark made in Gospel Library lands on the
 * words it was drawn over rather than on a guess.
 *
 * Everything about the file is treated as provisional: an export from another
 * version of the Church's app can spell a field differently or leave it out, so
 * the reader below accepts the aliases it has seen and skips a record it cannot
 * place instead of failing the whole import.
 */

/** The file's name, in the Church's own style. */
export const ANNOTATIONS_FILE_NAME = "annotations.json";

/** What Android should match when the file comes back through the picker. */
export const ANNOTATIONS_FILE_TYPES = ["application/json", "text/json", "text/plain", "application/octet-stream"];

/** The envelope's version. Anything newer is read on a best-effort basis. */
const FORMAT_VERSION = 3;

export interface GospelLibraryRecord {
  id: string;
  type: "highlight" | "note";
  subtype: "highlight" | "underline";
  color: Exclude<MarkColor, "clear">;
  uri: string;
  docId: string;
  source: string;
  startOffset: number;
  endOffset: number;
  tags: string[];
  created: string;
  lastModified: string;
  note?: string;
  links?: string[];
}

export interface GospelLibraryExport {
  metadata: {
    version: number;
    generator: string;
    exported: string;
    count: number;
  };
  annotations: GospelLibraryRecord[];
}

export interface AnnotationImportReport {
  imported: number;
  updated: number;
  skipped: { uri: string; reason: string }[];
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/* ------------------------------------------------------------------------- *
 * Our documents back to addresses
 * ------------------------------------------------------------------------- */

const docCache = new Map<string, ReaderDoc | null>();

/** A document id (`ot/jer/3`, `c/2015-04/7`) opened in the library. */
async function openDoc(docId: string): Promise<ReaderDoc | null> {
  const cached = docCache.get(docId);
  if (cached !== undefined) return cached;

  let opened: ReaderDoc | null = null;
  const conference = /^c\/([^/]+)\/(\d+)$/.exec(docId);
  if (conference) {
    const [, id, index] = conference;
    const data = await loadConferenceData(id);
    const talk = data.talks[Number(index)];
    if (talk) {
      opened = await openReaderDoc({
        kind: "conference",
        book: "General Conference",
        chapter: talk.title,
        conferenceId: id,
      });
    }
  } else {
    const scripture = /^([^/]+)\/([^/]+)\/([^/]+)$/.exec(docId);
    if (scripture) {
      const [, , slug, chapter] = scripture;
      opened = await openReaderDoc({ kind: "scripture", book: slug, chapter });
    }
  }

  docCache.set(docId, opened);
  return opened;
}

/** The chapter's URL at one verse, in the form Gospel Library writes it. */
function verseUri(doc: ReaderDoc, verse: number): string {
  const base = doc.url.split("?")[0];
  return `${base}?lang=eng&id=p${verse}#p${verse}`;
}

/** A mark's link target as a URL, when the library holds it. */
async function linkUri(link: AnnotationLink): Promise<string | null> {
  const doc = await openReaderDoc({ kind: "scripture", book: link.book, chapter: link.chapter });
  if (!doc) return null;
  return verseUri(doc, link.section);
}

/* ------------------------------------------------------------------------- *
 * Out
 * ------------------------------------------------------------------------- */

/**
 * The whole library as a Gospel Library export.
 *
 * `type` follows the Church's split: a mark with words of the reader's own is a
 * `note` (and carries the highlight through `color`/`subtype`), a bare mark is a
 * `highlight`. A link is a `links` entry on the record it belongs to.
 */
export async function toGospelLibrary(annotations: Annotation[]): Promise<GospelLibraryExport> {
  const records: GospelLibraryRecord[] = [];
  const linkCache = new Map<string, string | null>();

  for (const annotation of annotations.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const doc = await openDoc(annotation.doc);
    const verse = doc?.verses.find((v) => v.number === annotation.verse);
    // A mark on a chapter this build no longer holds still exports, on the id
    // alone: Gospel Library keeps its own copy of the words, and dropping the
    // mark would lose it for good.
    const words = verse ? wordsOf(verse.text) : [];
    const startWord = words.length ? clamp(annotation.startWord, 1, words.length) : annotation.startWord;
    const endWord = words.length ? clamp(Math.max(startWord, annotation.endWord), 1, words.length) : annotation.endWord;

    const note = annotation.note?.trim() ? annotation.note : undefined;
    const links: string[] = [];
    if (annotation.link) {
      const key = `${annotation.link.book}/${annotation.link.chapter}/${annotation.link.section}`;
      if (!linkCache.has(key)) linkCache.set(key, await linkUri(annotation.link));
      const uri = linkCache.get(key);
      if (uri) links.push(uri);
    }

    records.push({
      id: annotation.id,
      type: note ? "note" : "highlight",
      subtype: annotation.style === "underline" ? "underline" : "highlight",
      // `clear` is a note with no visible mark; Gospel Library has no such
      // colour, so it is written as the yellow it would have been drawn in.
      color: (annotation.color === "clear" ? "yellow" : annotation.color) as Exclude<MarkColor, "clear">,
      uri: doc ? verseUri(doc, annotation.verse) : "",
      docId: annotation.doc,
      source: annotation.doc.startsWith("c/") ? "general-conference" : "scriptures",
      startOffset: words[startWord - 1]?.start ?? 0,
      endOffset: words[endWord - 1]?.end ?? 0,
      tags: annotation.tags,
      created: annotation.createdAt,
      lastModified: annotation.updatedAt,
      ...(note ? { note } : {}),
      ...(links.length ? { links } : {}),
    });
  }

  return {
    metadata: {
      version: FORMAT_VERSION,
      generator: "Gospel Focus",
      exported: new Date().toISOString(),
      count: records.length,
    },
    annotations: records,
  };
}

/** The file's contents, ready to download or share. */
export async function exportAnnotationsFile(
  annotations: Annotation[]
): Promise<{ name: string; text: string; mime: string; count: number }> {
  const payload = await toGospelLibrary(annotations);
  return {
    name: ANNOTATIONS_FILE_NAME,
    text: `${JSON.stringify(payload, null, 2)}\n`,
    mime: "application/json;charset=utf-8",
    count: payload.annotations.length,
  };
}

/* ------------------------------------------------------------------------- *
 * In
 * ------------------------------------------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const number = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
};

/** The first of several spellings a field may arrive under. */
function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** The array of records inside whatever envelope the file arrived in. */
export function recordsFromExport(json: unknown): { records: Record<string, unknown>[]; version?: number } {
  if (Array.isArray(json)) {
    return { records: json.filter(isRecord) };
  }
  if (!isRecord(json)) return { records: [] };

  for (const key of ["annotations", "data", "items", "records", "results"]) {
    const value = json[key];
    if (Array.isArray(value)) {
      const metadata = isRecord(json.metadata) ? json.metadata : isRecord(json.meta) ? json.meta : undefined;
      return {
        records: value.filter(isRecord),
        version: number(metadata?.version) ?? number(json.version),
      };
    }
  }
  return { records: [] };
}

/** The nine colours, by the hex values an export may carry instead of a name. */
const COLOR_HEX: Record<Exclude<MarkColor, "clear">, string> = {
  yellow: "#ffe082",
  red: "#ef9a9a",
  green: "#a5d6a7",
  blue: "#90caf9",
  purple: "#ce93d8",
  orange: "#ffcc80",
  pink: "#f48fb1",
  brown: "#bcaaa4",
  gray: "#bdbdbd",
};

function rgb(hex: string): [number, number, number] | null {
  const value = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

/** A colour name, a hex value, or nothing — always one of the nine. */
export function normaliseColor(value: unknown): Exclude<MarkColor, "clear"> | null {
  const name = text(value)?.toLowerCase();
  if (!name) return null;
  if ((MARK_COLORS as readonly string[]).includes(name)) {
    return name === "clear" ? null : (name as Exclude<MarkColor, "clear">);
  }

  const found = rgb(name);
  if (!found) return null;
  let best: Exclude<MarkColor, "clear"> = "yellow";
  let distance = Number.POSITIVE_INFINITY;
  for (const [colour, hex] of Object.entries(COLOR_HEX) as [Exclude<MarkColor, "clear">, string][]) {
    const target = rgb(hex);
    if (!target) continue;
    const next = (found[0] - target[0]) ** 2 + (found[1] - target[1]) ** 2 + (found[2] - target[2]) ** 2;
    if (next < distance) {
      distance = next;
      best = colour;
    }
  }
  return best;
}

/** Where a record's `uri` points, before the library has been asked about it. */
interface Anchor {
  kind: "scripture" | "conference";
  /** A book slug for scripture, or the conference talk's slug for a talk. */
  slug: string;
  chapter: string;
  conferenceId?: string;
  verse: number;
}

function verseFromQuery(uri: string): number {
  const match = /[?&#]id=p(\d+)/.exec(uri) ?? /[?&#](?:verse|v)=(\d+)/.exec(uri);
  return match ? Number(match[1]) : 1;
}

export function anchorFromUri(uri: string): Anchor | null {
  const scripture = /\/scriptures\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/.exec(uri);
  if (scripture) {
    return {
      kind: "scripture",
      slug: scripture[2],
      chapter: scripture[3],
      verse: verseFromQuery(uri),
    };
  }

  const talk = /\/general-conference\/(\d{4})\/(\d{1,2})\/([^/?#]+)/.exec(uri);
  if (talk) {
    return {
      kind: "conference",
      slug: talk[3],
      chapter: talk[3],
      conferenceId: `${talk[1]}-${talk[2].padStart(2, "0")}`,
      verse: verseFromQuery(uri),
    };
  }

  return null;
}

/** Our document id, read without the library: `ot/jer/3` or `c/2015-04/7`. */
function anchorFromDocId(docId: string): Anchor | null {
  const conference = /^c\/([^/]+)\/(\d+)$/.exec(docId);
  if (conference) {
    return { kind: "conference", slug: "", chapter: "", conferenceId: conference[1], verse: 1 };
  }
  const scripture = /^([^/]+)\/([^/]+)\/([^/]+)$/.exec(docId);
  if (scripture) {
    return { kind: "scripture", slug: scripture[2], chapter: scripture[3], verse: 1 };
  }
  return null;
}

/** The talk whose URL ends in this slug, for a conference citation. */
async function talkTitle(conferenceId: string, slug: string): Promise<string | null> {
  const data = await loadConferenceData(conferenceId);
  const wanted = slug.toLowerCase();
  const talk = data.talks.find((entry) => entry.url.toLowerCase().includes(`/${wanted}?`) || entry.url.toLowerCase().endsWith(`/${wanted}`));
  return talk?.title ?? null;
}

/**
 * The words a character span covers.
 *
 * The offsets count characters through the verse, so a span that starts or ends
 * mid-word snaps outward to the whole word — a highlighter marks words, not
 * letters. When a file carries no usable offsets but does carry the text that
 * was marked, the text is found in the verse instead, which keeps an older
 * export (or one from a build whose offsets differ) landing in the right place.
 */
export function wordRange(
  verseText: string,
  startOffset: number | undefined,
  endOffset: number | undefined,
  quote: string | undefined
): { startWord: number; endWord: number } {
  const words = wordsOf(verseText);
  if (!words.length) return { startWord: 1, endWord: 1 };

  if (startOffset !== undefined) {
    const start = clamp(startOffset, 0, verseText.length);
    const end = clamp(endOffset ?? start + 1, start + 1, verseText.length);
    const covered = words
      .map((word, index) => ({ ...word, index: index + 1 }))
      .filter((word) => word.start < end && word.end > start);
    if (covered.length) {
      return { startWord: covered[0].index, endWord: covered[covered.length - 1].index };
    }
  }

  if (quote) {
    const needle = quote.trim().toLowerCase();
    const at = verseText.toLowerCase().indexOf(needle);
    if (at >= 0 && needle) {
      const covered = words
        .map((word, index) => ({ ...word, index: index + 1 }))
        .filter((word) => word.start < at + needle.length && word.end > at);
      if (covered.length) {
        return { startWord: covered[0].index, endWord: covered[covered.length - 1].index };
      }
    }
  }

  return { startWord: 1, endWord: 1 };
}

/** The note body, whether it arrived as HTML, plain text, or nested. */
function noteOf(record: Record<string, unknown>): string | undefined {
  const raw = pick(record, ["note", "content", "noteContent", "annotation", "body"]);
  if (typeof raw === "string") return raw.trim() || undefined;
  if (isRecord(raw)) {
    const inner = pick(raw, ["content", "text", "html"]);
    if (typeof inner === "string") return inner.trim() || undefined;
  }
  return undefined;
}

/** The links on a record, as `{ book, chapter, section }` targets we can open. */
async function linksOf(record: Record<string, unknown>): Promise<AnnotationLink[]> {
  const raw = pick(record, ["links", "relatedLinks", "references"]);
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: AnnotationLink[] = [];

  for (const entry of list) {
    const uri = typeof entry === "string" ? entry : isRecord(entry) ? text(pick(entry, ["uri", "url", "href"])) : undefined;
    if (!uri) continue;
    const anchor = anchorFromUri(uri);
    if (!anchor || anchor.kind !== "scripture") continue;
    const doc = await openReaderDoc({ kind: "scripture", book: anchor.slug, chapter: anchor.chapter });
    if (!doc) continue;
    out.push({
      book: doc.book,
      chapter: doc.chapter,
      section: clamp(Number(anchor.verse) || 1, 1, doc.verses.length),
      label: `${doc.book} ${doc.chapter}:${clamp(Number(anchor.verse) || 1, 1, doc.verses.length)}`,
    });
  }

  return out;
}

/**
 * Import a Gospel Library annotations file.
 *
 * Every record is placed against the bundled library before it is written, so a
 * mark whose verse is not in this build is reported rather than stored against
 * the wrong words. Marks that arrive with an id already in the library are
 * updated instead of duplicated, which makes a repeated import safe.
 */
export async function importAnnotationsText(source: string): Promise<AnnotationImportReport> {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    throw new Error("that file isn't JSON — Gospel Library exports annotations as a .json file");
  }

  const { records } = recordsFromExport(json);
  const skipped: AnnotationImportReport["skipped"] = [];
  const incoming: Annotation[] = [];
  const now = new Date().toISOString();

  for (const record of records) {
    const uri = text(pick(record, ["uri", "url", "link", "sourceUri"])) ?? "";
    const docId = text(pick(record, ["docId", "doc", "documentId"]));
    const anchor = anchorFromUri(uri) ?? (docId ? anchorFromDocId(docId) : null);
    if (!anchor) {
      skipped.push({ uri, reason: "no chapter address on the record" });
      continue;
    }

    let doc: ReaderDoc | null = null;
    if (anchor.kind === "conference" && anchor.conferenceId && anchor.slug) {
      const title = await talkTitle(anchor.conferenceId, anchor.slug);
      if (title) {
        doc = await openReaderDoc({
          kind: "conference",
          book: "General Conference",
          chapter: title,
          conferenceId: anchor.conferenceId,
        });
      }
    } else if (anchor.kind === "scripture" && anchor.slug) {
      doc = await openReaderDoc({ kind: "scripture", book: anchor.slug, chapter: anchor.chapter });
    }
    if (!doc) {
      skipped.push({ uri, reason: "that chapter isn't in this build of the library" });
      continue;
    }

    const verseNumber = clamp(anchor.verse, 1, doc.verses.length);
    const verse = doc.verses[verseNumber - 1];
    const offsets = isRecord(record.range) ? record.range : undefined;
    const startOffset =
      number(pick(record, ["startOffset", "start", "offsetStart", "charStart"])) ??
      (offsets ? number(offsets.start) : undefined);
    const endOffset =
      number(pick(record, ["endOffset", "end", "offsetEnd", "charEnd"])) ??
      (offsets ? number(offsets.end) : undefined);

    const { startWord, endWord } = wordRange(
      verse.text,
      startOffset,
      endOffset,
      text(pick(record, ["quote", "text", "highlight", "selectedText"]))
    );

    const note = noteOf(record);
    const links = await linksOf(record);
    // `subtype` is the one that says how the mark is drawn; `type` says what it
    // holds (a highlight, or a note). Read both, because a record exported as a
    // note *about* an underlined phrase carries `type: "note"` and
    // `subtype: "underline"`, and reading only the first would redraw it as a
    // highlighter wash.
    const subtype = `${text(record.subtype) ?? ""}`.toLowerCase();
    const typeName = `${text(pick(record, ["type", "annotationType"])) ?? ""}`.toLowerCase();
    const style: MarkStyle = (subtype || typeName).includes("underline") ? "underline" : "fill";
    const color = normaliseColor(pick(record, ["color", "colour", "highlightColor"])) ?? (note ? "clear" : "yellow");

    const recordId = text(pick(record, ["id", "uuid", "annotationId", "_id"]));
    incoming.push({
      id: recordId ?? newId(),
      doc: doc.doc,
      book: doc.book,
      chapter: doc.chapter,
      verse: verseNumber,
      startWord,
      endWord,
      color,
      style,
      note,
      link: links[0],
      tags: (() => {
        const tags = pick(record, ["tags", "labels"]);
        return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
      })(),
      createdAt: text(pick(record, ["created", "createdAt", "dateCreated"])) ?? now,
      updatedAt: text(pick(record, ["lastModified", "updated", "updatedAt"])) ?? now,
    });
  }

  const { added, updated } = await importAnnotations(incoming);
  return { imported: added, updated, skipped };
}
