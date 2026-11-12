/**
 * The chapter reader's side of the library: a whole chapter (or talk), its
 * neighbours, and the address that opens it.
 *
 * The picker draws *a passage*; the reader opens *a place* and lets the reader
 * go on from there — so this needs the chapter list, the previous and next
 * chapters across book boundaries, and a stable document id for annotations.
 *
 * Nothing here fetches anything new: it reads the same manifest and volume files
 * the picker already caches (`loadVolumeData`), so opening a chapter from a
 * search result costs no more than the search result itself did.
 */
import { loadConferenceData, loadManifest, loadVolumeData } from "./picker";
import type { Manifest, Passage } from "./types";

export interface ReaderVerse {
  number: number;
  text: string;
}

/** Where a chapter's previous or next chapter is. */
export interface ReaderNeighbour {
  /** What the control says: "Jeremiah 2", or "“The Title”". */
  label: string;
  book: string;
  chapter: string;
  conferenceId?: string;
}

export interface ReaderDoc {
  kind: "scripture" | "conference";
  /**
   * The stable id annotations are anchored to: `ot/jer/3` for a chapter, or
   * `c/2015-04/7` for a talk. It is the same id the search index uses for a
   * verse, without the verse, so an annotation can be found by document alone.
   */
  doc: string;
  title: string;
  /** The book's name, or "General Conference". */
  book: string;
  /** The chapter number as a string, or the talk's title. */
  chapter: string;
  bookSlug?: string;
  volumeId?: string;
  conferenceId?: string;
  sourceLabel: string;
  subtitle?: string;
  verses: ReaderVerse[];
  url: string;
  prev: ReaderNeighbour | null;
  next: ReaderNeighbour | null;
  /** Every chapter in the book, for the chapter grid. */
  chapters?: { number: number; verses: number }[];
}

export interface ReaderCitation {
  kind: "scripture" | "conference";
  book: string;
  chapter: string;
  conferenceId?: string;
}

/**
 * Where the reader last stood, kept on the device.
 *
 * The reader and the scroll are two ways of reading the same place, so they
 * share the one record: opening a chapter in either, then opening the other
 * with no address of its own, carries on from the verse last read rather than
 * starting over. The older reader wrote this same key with this same shape, so
 * a device that has already read a chapter keeps its place.
 */
export const LAST_PLACE_KEY = "gospel-focus:reader:v1";

export interface LastPlace extends ReaderCitation {
  /** The verse the reader opened, when the address named one. */
  verse?: number;
}

export function readLastPlace(): LastPlace | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(LAST_PLACE_KEY) ?? "null") as Partial<LastPlace> | null;
    if (!value || typeof value.book !== "string" || typeof value.chapter !== "string") return null;
    return {
      kind: value.kind === "conference" ? "conference" : "scripture",
      book: value.book,
      chapter: value.chapter,
      conferenceId: typeof value.conferenceId === "string" ? value.conferenceId : undefined,
      verse: typeof value.verse === "number" ? value.verse : undefined,
    };
  } catch {
    return null;
  }
}

export function writeLastPlace(place: ReaderCitation & { verse?: number }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(place));
  } catch {
    // Storage can be unavailable; the page still reads for this visit.
  }
}

const normalise = (value: string) => value.trim().toLowerCase();

/**
 * The verses (or paragraphs) named by one value: `15`, `3-4`, or a run of them
 * — `3-4; 6`, `3, 4, 6`, `3–4 6`. Sorted, de-duplicated, and empty when the
 * value names nothing the reader can open.
 *
 * The same grammar a citation is written in, so a link can carry a whole study
 * range rather than one verse of it. A backwards range (`6-3`) reads as the
 * range it obviously means, and an absurd one is dropped rather than walked.
 */
export function parseVerseList(value: string | null | undefined): number[] {
  if (!value) return [];
  const found = new Set<number>();

  for (const token of value.split(/[,;\s]+/)) {
    if (!token) continue;
    const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(token);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to < 1) continue;
      // A chapter runs to about a hundred verses; anything past this is a typo.
      if (Math.abs(to - from) > 999) continue;
      for (let n = Math.min(from, to); n <= Math.max(from, to); n += 1) found.add(n);
      continue;
    }
    if (/^\d+$/.test(token)) {
      const number = Number(token);
      if (number > 0) found.add(number);
    }
  }

  return [...found].sort((a, b) => a - b);
}

/**
 * A verse list written back the way `parseVerseList` reads it: consecutive
 * numbers squeezed into a range, the rest listed apart (`3-4,6`).
 */
export function formatVerseList(verses: number[]): string {
  const sorted = [...new Set(verses.filter((n) => Number.isInteger(n) && n > 0))].sort(
    (a, b) => a - b
  );
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let end = i;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    const from = sorted[i];
    const to = sorted[end];
    parts.push(from === to ? String(from) : `${from}-${to}`);
    i = end + 1;
  }
  return parts.join(",");
}

/**
 * A place in the library, as the address of the page that shows it.
 *
 * The reader and the scroll take the same address; only the page it opens
 * differs. So the query is built once and the path is the one thing a caller
 * chooses.
 *
 * `verses` names a series to open and mark (a range, a scattered pick); `verse`
 * is the single place every shorter link writes, and the two are not meant to
 * be given together — a list wins.
 */
function placeHref(
  path: string,
  citation: ReaderCitation & { verse?: number; verses?: number[]; last?: boolean }
): string {
  const params = new URLSearchParams();
  if (citation.kind === "conference") {
    params.set("kind", "conference");
    params.set("session", citation.conferenceId ?? "");
  }
  params.set("book", citation.book);
  params.set("chapter", citation.chapter);

  const list = citation.verses?.length
    ? citation.verses
    : citation.verse && citation.verse > 0
      ? [citation.verse]
      : [];
  // `last` is the foot of the chapter without knowing how many verses it holds:
  // a gesture that turns back a chapter opens it at its end, and the page that
  // opens resolves the word once it has the chapter in hand.
  if (citation.last) params.set("verse", "last");
  else if (list.length) params.set("verse", formatVerseList(list));
  return `${path}?${params.toString()}`;
}

/** The reader's address for a place in the library. */
export function readerHref(
  citation: ReaderCitation & { verse?: number; verses?: number[]; last?: boolean }
): string {
  return placeHref("/read", citation);
}

/** The scroll's address for the same place: one verse a screen, swiped through. */
export function scrollHref(
  citation: ReaderCitation & { verse?: number; verses?: number[]; last?: boolean }
): string {
  return placeHref("/scroll", citation);
}

/** The conference a talk's Gospel Library address belongs to, as `2015-04`. */
function sessionOf(url: string): string | undefined {
  const match = /\/general-conference\/(\d{4})\/(\d{1,2})\//.exec(url);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}` : undefined;
}

/**
 * The reader's address for a passage the app has already stored — a favorite or
 * a memory card — built from what that record keeps rather than from a live
 * draw.
 *
 * It holds the book and chapter (or the talk's title), the verses (or
 * paragraphs) it covers, and the Gospel Library page it was saved from: a
 * conference talk's session is only written in that URL, and two conferences can
 * print the same title. A record with no place to open — an imported favorite
 * whose row named no chapter — gets null, and its card stays a card.
 */
export function storedPassageHref(stored: {
  kind: ReaderCitation["kind"];
  book?: string;
  chapter?: string;
  /** Every verse, or paragraph, the record covers. */
  verses?: number[];
  /** The single verse, or paragraph, it opens at — when there is only one. */
  verse?: number;
  /** The Gospel Library page the passage was saved from. */
  url?: string;
}): string | null {
  if (!stored.book || !stored.chapter) return null;
  return readerHref({
    kind: stored.kind,
    book: stored.book,
    chapter: stored.chapter,
    conferenceId: stored.kind === "conference" ? sessionOf(stored.url ?? "") : undefined,
    verses: stored.verses,
    verse: stored.verse,
  });
}

/**
 * The chapter before or after this one within the volume, crossing into the
 * neighbouring book at either end. `null` at the volume's own ends.
 */
function neighbour(
  books: { name: string; slug: string; chapters: { n: number; verses: string[] }[] }[],
  bookIndex: number,
  chapterIndex: number,
  step: -1 | 1
): ReaderNeighbour | null {
  const book = books[bookIndex];
  const target = book.chapters[chapterIndex + step];
  if (target) {
    return { label: `${book.name} ${target.n}`, book: book.name, chapter: String(target.n) };
  }

  const adjacent = books[bookIndex + step];
  if (!adjacent || !adjacent.chapters.length) return null;
  const last = step === -1 ? adjacent.chapters[adjacent.chapters.length - 1] : adjacent.chapters[0];
  return { label: `${adjacent.name} ${last.n}`, book: adjacent.name, chapter: String(last.n) };
}

async function scriptureDoc(bookName: string, chapter: string): Promise<ReaderDoc | null> {
  const chapterNumber = Number.parseInt(chapter, 10);
  if (!Number.isInteger(chapterNumber)) return null;

  const manifest = await loadManifest();
  const wanted = normalise(bookName);

  for (const volume of manifest.volumes) {
    const listed = volume.books.find(
      (b) => normalise(b.name) === wanted || normalise(b.slug) === wanted
    );
    if (!listed) continue;

    const data = await loadVolumeData(volume.id);
    const index = data.books.findIndex((b) => b.slug === listed.slug);
    const book = data.books[index];
    const chapterIndex = book?.chapters.findIndex((c) => c.n === chapterNumber) ?? -1;
    if (!book || chapterIndex < 0) continue;

    const current = book.chapters[chapterIndex];
    return {
      kind: "scripture",
      doc: `${volume.id}/${book.slug}/${current.n}`,
      title: `${book.name} ${current.n}`,
      book: book.name,
      chapter: String(current.n),
      bookSlug: book.slug,
      volumeId: volume.id,
      sourceLabel: volume.title,
      subtitle: `${volume.title} · ${current.verses.length} verses`,
      verses: current.verses.map((text, i) => ({ number: i + 1, text })),
      url: `https://www.churchofjesuschrist.org/study/scriptures/${book.path}/${current.n}?lang=eng`,
      prev: neighbour(data.books, index, chapterIndex, -1),
      next: neighbour(data.books, index, chapterIndex, 1),
      chapters: book.chapters.map((c) => ({ number: c.n, verses: c.verses.length })),
    };
  }

  return null;
}

async function conferenceDoc(title: string, conferenceId?: string): Promise<ReaderDoc | null> {
  if (!title.trim()) return null;

  const manifest = await loadManifest();
  const wanted = normalise(title);
  const candidates = conferenceId
    ? manifest.conferences.filter((c) => c.id === conferenceId)
    : manifest.conferences;

  for (const conference of candidates) {
    const data = await loadConferenceData(conference.id);
    const index = data.talks.findIndex((talk) => normalise(talk.title) === wanted);
    if (index < 0) continue;

    const talk = data.talks[index];
    const neighbourTalk = (step: -1 | 1): ReaderNeighbour | null => {
      const adjacent = data.talks[index + step];
      return adjacent
        ? { label: `“${adjacent.title}”`, book: "General Conference", chapter: adjacent.title, conferenceId: conference.id }
        : null;
    };

    return {
      kind: "conference",
      doc: `c/${conference.id}/${index}`,
      title: `“${talk.title}”`,
      book: "General Conference",
      chapter: talk.title,
      conferenceId: conference.id,
      sourceLabel: "General Conference",
      subtitle: [talk.speaker, talk.calling, conference.label].filter(Boolean).join(" · "),
      verses: talk.paragraphs.map((text, i) => ({ number: i + 1, text })),
      url: talk.url,
      prev: neighbourTalk(-1),
      next: neighbourTalk(1),
    };
  }

  return null;
}

/**
 * Chapters already opened to be drawn ahead of the reader, by what they say.
 *
 * A swipe previews a chapter before it is opened, and then the page opens it
 * for real — one read of the library, kept for the next pass of the thumb. The
 * cache belongs to the preview only: the reader's own open is deliberately
 * uncached, because a chapter re-opened from the same citation has to be a new
 * document, not the one that was already scrolled through.
 */
const previewed = new Map<string, Promise<ReaderDoc | null>>();

const citationKey = (citation: ReaderCitation) =>
  `${citation.kind}:${citation.book}:${citation.chapter}:${citation.conferenceId ?? ""}`;

/** Open a chapter to show it before the reader has chosen it. */
export function previewReaderDoc(citation: ReaderCitation): Promise<ReaderDoc | null> {
  const key = citationKey(citation);
  let pending = previewed.get(key);
  if (!pending) {
    pending = openReaderDoc(citation);
    previewed.set(key, pending);
  }
  return pending;
}

/** Open a chapter or talk, or null when this library doesn't hold it. */
export async function openReaderDoc(citation: ReaderCitation): Promise<ReaderDoc | null> {
  if (citation.kind === "conference") {
    return conferenceDoc(citation.chapter, citation.conferenceId);
  }
  // A citation whose kind was not recognised can still be a talk: the picker's
  // links to talks carry "General Conference" as the book.
  const scripture = await scriptureDoc(citation.book, citation.chapter);
  if (scripture) return scripture;
  return conferenceDoc(citation.chapter, citation.conferenceId);
}

/** One book in the browse index, with the chapters it holds. */
export interface BrowseBook {
  name: string;
  slug: string;
  chapters: number;
}

/** One volume, ready to be browsed: its books and their chapter counts. */
export interface BrowseVolume {
  id: string;
  title: string;
  subtitle?: string;
  books: BrowseBook[];
}

/**
 * The standard works, in the order the app presents them: the Bible first, in
 * its two testaments, then the restored scriptures in the order the Church
 * publishes them. The manifest is keyed by volume name rather than in reading
 * order, so every list sorts through this — the reader's menus and rail, the
 * filters, the picker.
 */
export const VOLUME_ORDER = ["ot", "nt", "bom", "dc", "pgp"] as const;

/** Where a volume sits in that order; unknown volumes go last. */
export function volumeRank(id: string): number {
  const index = VOLUME_ORDER.indexOf(id as (typeof VOLUME_ORDER)[number]);
  return index < 0 ? VOLUME_ORDER.length : index;
}

/**
 * The standard works as a browsing tree.
 *
 * Built from the manifest alone, because the manifest already carries what the
 * reader's menus need — every volume, every book, and how many chapters each
 * book holds. Opening a chapter is what loads the chapter itself
 * (`openReaderDoc`), so the index costs no fetch of its own and works before a
 * single verse has been read. A volume with no books in this build is dropped
 * rather than shown empty, and the rest are put in the app's reading order
 * (see `VOLUME_ORDER`) whatever order the manifest arrives in.
 */
export function browseIndex(manifest: Manifest): BrowseVolume[] {
  return manifest.volumes
    .filter((volume) => volume.books.length > 0)
    .sort((a, b) => volumeRank(a.id) - volumeRank(b.id))
    .map((volume) => ({
      id: volume.id,
      title: volume.title,
      subtitle: volume.subtitle,
      books: volume.books.map((book) => ({
        name: book.name,
        slug: book.slug,
        chapters: book.chapters,
      })),
    }));
}

/**
 * One verse of the open document as a `Passage`, so the reader's verse menu can
 * favorite it, share it, memorize it and open it in Gospel Library with the same
 * code the picker's card uses.
 */
export function versePassage(doc: ReaderDoc, verse: number): Passage {
  const found = doc.verses.find((v) => v.number === verse) ?? doc.verses[0];
  const scripture = doc.kind === "scripture";
  const reference = scripture ? `${doc.book} ${doc.chapter}:${found.number}` : `“${doc.chapter}” ¶ ${found.number}`;

  return {
    kind: doc.kind,
    reference,
    sourceLabel: doc.sourceLabel,
    text: found.text,
    url: scripture ? `${doc.url}?lang=eng&id=p${found.number}#p${found.number}` : doc.url,
    urlLabel: "Open in Gospel Library",
    expansionTitle: doc.title,
    expansionSubtitle: doc.subtitle,
    verses: doc.verses.map((v) => ({ number: v.number, text: v.text })),
    highlightVerse: found.number,
    book: doc.book,
    chapter: doc.chapter,
    section: found.number,
  };
}

/**
 * A neighbouring chapter, as the citation that opens it.
 *
 * The document's own kind decides how the neighbour is addressed — a talk is
 * only found by its session *and* its title, and a chapter by its book — so the
 * two are always built the same way rather than by each control that offers a
 * step to the next one. The foot of the reader and a horizontal swipe are the
 * same promise: here is the chapter beside this one.
 */
export function neighbourCitation(doc: ReaderDoc, neighbour: ReaderNeighbour): ReaderCitation {
  return {
    kind: doc.kind,
    book: neighbour.book,
    chapter: neighbour.chapter,
    conferenceId: neighbour.conferenceId,
  };
}

/** The chapter as a citation the reader can link to. */
export function docCitation(doc: ReaderDoc): ReaderCitation {
  return doc.kind === "conference"
    ? { kind: "conference", book: "General Conference", chapter: doc.chapter, conferenceId: doc.conferenceId }
    : { kind: "scripture", book: doc.book, chapter: doc.chapter };
}
