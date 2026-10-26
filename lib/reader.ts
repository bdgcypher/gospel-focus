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
import { loadConferenceData, loadManifest, loadVolumeData, resolveCitation } from "./picker";
import type { AnnotationLink } from "./annotations";
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

const normalise = (value: string) => value.trim().toLowerCase();

/** The reader's address for a place in the library. */
export function readerHref(citation: ReaderCitation & { verse?: number }): string {
  const params = new URLSearchParams();
  if (citation.kind === "conference") {
    params.set("kind", "conference");
    params.set("session", citation.conferenceId ?? "");
  }
  params.set("book", citation.book);
  params.set("chapter", citation.chapter);
  if (citation.verse && citation.verse > 0) params.set("verse", String(citation.verse));
  return `/read?${params.toString()}`;
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
 * The standard works as a browsing tree.
 *
 * Built from the manifest alone, because the manifest already carries what a
 * browse screen needs — every volume, every book, and how many chapters each
 * book holds. Opening a chapter is what loads the chapter itself
 * (`openReaderDoc`), so the index costs no fetch of its own and works before a
 * single verse has been read. A volume with no books in this build is dropped
 * rather than shown empty.
 */
export function browseIndex(manifest: Manifest): BrowseVolume[] {
  return manifest.volumes
    .filter((volume) => volume.books.length > 0)
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
 * A typed reference ("Alma 32:21") as a link target, or null when it isn't one.
 *
 * The book may be a name or a slug, and a chapter without a verse points at the
 * chapter's first verse. Talks are not offered here: their titles are not
 * references a reader types, and the citation box is for scripture chains.
 */
export async function resolveReference(value: string): Promise<AnnotationLink | null> {
  const match = /^(.+?)\s+(\d+)(?::\s*(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const section = match[3] ? Number(match[3]) : 1;
  const passage = await resolveCitation("scripture", match[1], match[2], section);
  if (!passage?.book || !passage.chapter) return null;
  return {
    book: passage.book,
    chapter: passage.chapter,
    section: passage.section ?? 1,
    label: passage.reference,
  };
}

/**
 * One verse of the open document as a `Passage`, so the reader's verse menu can
 * star it, share it, memorize it and open it in Gospel Library with the same
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

/** The chapter as a citation the reader can link to. */
export function docCitation(doc: ReaderDoc): ReaderCitation {
  return doc.kind === "conference"
    ? { kind: "conference", book: "General Conference", chapter: doc.chapter, conferenceId: doc.conferenceId }
    : { kind: "scripture", book: doc.book, chapter: doc.chapter };
}
