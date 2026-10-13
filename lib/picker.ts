import { buildTeasers, FALLBACK_TEASERS } from "./teasers";
import type { ConferenceInfo, Filters, Manifest, Passage, Verse, VolumeInfo } from "./types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dataUrl = (p: string) => `${BASE}/${p.replace(/^\/+/, "")}`;

export const GOSPEL_LIBRARY = "https://www.churchofjesuschrist.org";

/** ---------- Raw bundle shapes ---------- */

interface VolumeData {
  id: string;
  title: string;
  subtitle: string;
  volumeSlug: string;
  books: {
    name: string;
    fullTitle: string;
    slug: string;
    /** URL path segment up to the chapter, e.g. "bofm/1-ne" or "dc-testament/dc". */
    path: string;
    order: number;
    chapters: { n: number; verses: string[] }[];
  }[];
}

interface ConferenceData {
  id: string;
  label: string;
  year: number;
  month: number;
  source: string;
  talks: {
    id: string;
    title: string;
    speaker: string;
    calling: string;
    url: string;
    paragraphs: string[];
  }[];
}

/** ---------- Caches ---------- */

let manifestCache: Manifest | null = null;
let manifestPromise: Promise<Manifest> | null = null;
const volumeCache = new Map<string, Promise<VolumeData>>();
const conferenceCache = new Map<string, Promise<ConferenceData>>();

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return (await res.json()) as T;
}

export function loadManifest(): Promise<Manifest> {
  if (manifestCache) return Promise.resolve(manifestCache);
  if (!manifestPromise) {
    manifestPromise = fetchJSON<Manifest>(dataUrl("data/manifest.json")).then((m) => {
      manifestCache = m;
      return m;
    });
  }
  return manifestPromise;
}

function loadVolume(id: string): Promise<VolumeData> {
  let p = volumeCache.get(id);
  if (!p) {
    p = fetchJSON<VolumeData>(dataUrl(`data/scriptures/${id}.json`)).then((d) => {
      resolvedVolumes.set(id, d);
      return d;
    });
    volumeCache.set(id, p);
  }
  return p;
}

function loadConference(id: string): Promise<ConferenceData> {
  let p = conferenceCache.get(id);
  if (!p) {
    p = fetchJSON<ConferenceData>(dataUrl(`data/conference/${id}.json`));
    conferenceCache.set(id, p);
  }
  return p;
}

/** ---------- Filtering ---------- */

export const bookKey = (volumeId: string, bookSlug: string) => `${volumeId}:${bookSlug}`;

const isEnabled = (map: Record<string, boolean>, key: string) => map[key] !== false;

export function eligibleBooks(volume: VolumeInfo, filters: Filters) {
  if (!isEnabled(filters.volumes, volume.id)) return [];
  return volume.books.filter((b) => isEnabled(filters.books, bookKey(volume.id, b.slug)));
}

export function eligibleVolumeVerseCount(volume: VolumeInfo, filters: Filters): number {
  return eligibleBooks(volume, filters).reduce((a, b) => a + b.verses, 0);
}

export function eligibleConferences(manifest: Manifest, filters: Filters): ConferenceInfo[] {
  if (filters.conferenceMaster === false) return [];
  return manifest.conferences.filter((c) => isEnabled(filters.conferences, c.id));
}

export interface EligibleSummary {
  hasScriptures: boolean;
  hasConference: boolean;
  verses: number;
  paragraphs: number;
}

export function summarize(manifest: Manifest, filters: Filters): EligibleSummary {
  const verses = manifest.volumes.reduce((a, v) => a + eligibleVolumeVerseCount(v, filters), 0);
  const paragraphs = eligibleConferences(manifest, filters).reduce((a, c) => a + c.paragraphs, 0);
  return { hasScriptures: verses > 0, hasConference: paragraphs > 0, verses, paragraphs };
}

/** ---------- Random pick ---------- */

function weightedPick<T>(items: T[], weight: (t: T) => number): T | null {
  const total = items.reduce((a, i) => a + weight(i), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const item of items) {
    r -= weight(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export class NoSourcesError extends Error {
  constructor() {
    super("No sources selected");
    this.name = "NoSourcesError";
  }
}

export async function pickPassage(manifest: Manifest, filters: Filters): Promise<Passage> {
  const volumes = manifest.volumes.filter((v) => eligibleVolumeVerseCount(v, filters) > 0);
  const conferences = eligibleConferences(manifest, filters).filter((c) => c.paragraphs > 0);

  const scriptureWeight = volumes.reduce((a, v) => a + eligibleVolumeVerseCount(v, filters), 0);
  const conferenceWeight = conferences.reduce((a, c) => a + c.paragraphs, 0);

  if (scriptureWeight <= 0 && conferenceWeight <= 0) throw new NoSourcesError();

  // Weight the draw by how many eligible sections each source contributes.
  const drawScripture =
    conferenceWeight <= 0 ||
    (scriptureWeight > 0 && Math.random() * (scriptureWeight + conferenceWeight) < scriptureWeight);

  if (drawScripture) {
    const volume = weightedPick(volumes, (v) => eligibleVolumeVerseCount(v, filters));
    if (volume) return pickScripture(volume, filters);
  }
  const conference = weightedPick(conferences, (c) => c.paragraphs);
  if (conference) return pickConference(conference);
  throw new NoSourcesError();
}

async function pickScripture(volume: VolumeInfo, filters: Filters): Promise<Passage> {
  const data = await loadVolume(volume.id);
  const books = data.books.filter((b) => isEnabled(filters.books, bookKey(volume.id, b.slug)));

  // Uniform draw across every eligible verse in the volume.
  const flat: { book: (typeof books)[number]; chapter: VolumeData["books"][number]["chapters"][number]; verse: number }[] = [];
  for (const book of books) {
    for (const chapter of book.chapters) {
      for (let i = 0; i < chapter.verses.length; i++) {
        flat.push({ book, chapter, verse: i + 1 });
      }
    }
  }
  if (!flat.length) throw new NoSourcesError();
  const chosen = flat[Math.floor(Math.random() * flat.length)];

  const { book, chapter, verse } = chosen;
  return buildScripturePassage(data, book, chapter, verse);
}

type ScriptureBook = VolumeData["books"][number];
type ScriptureChapter = ScriptureBook["chapters"][number];

/** Build the passage for one verse of a chapter — shared by the draw and by imports. */
function buildScripturePassage(
  data: VolumeData,
  book: ScriptureBook,
  chapter: ScriptureChapter,
  verse: number
): Passage {
  const verses: Verse[] = chapter.verses.map((text, i) => ({ number: i + 1, text }));
  const reference = `${book.name} ${chapter.n}:${verse}`;
  const url = `${GOSPEL_LIBRARY}/study/scriptures/${book.path}/${chapter.n}?lang=eng&id=p${verse}#p${verse}`;

  return {
    kind: "scripture",
    reference,
    sourceLabel: data.title,
    text: chapter.verses[verse - 1],
    url,
    urlLabel: "Open in Gospel Library",
    expansionTitle: `${book.name} ${chapter.n}`,
    expansionSubtitle: `${data.title} · ${chapter.verses.length} verses`,
    verses,
    highlightVerse: verse,
    book: book.name,
    chapter: String(chapter.n),
    section: verse,
    // Some volumes (e.g. the Doctrine and Covenants) use the volume title as
    // their only book name, so drop any duplicate chip.
    chips: [data.title, book.name].filter((c, i, arr) => arr.indexOf(c) === i),
  };
}

async function pickConference(conference: ConferenceInfo): Promise<Passage> {
  const data = await loadConference(conference.id);
  const flat: { talk: ConferenceData["talks"][number]; paragraph: number }[] = [];
  for (const talk of data.talks) {
    for (let i = 0; i < talk.paragraphs.length; i++) flat.push({ talk, paragraph: i });
  }
  if (!flat.length) throw new NoSourcesError();
  const { talk, paragraph } = flat[Math.floor(Math.random() * flat.length)];
  return buildConferencePassage(conference, talk, paragraph);
}

type ConferenceTalk = ConferenceData["talks"][number];

/** Build the passage for one paragraph of a talk — shared by the draw and by imports. */
function buildConferencePassage(
  conference: ConferenceInfo,
  talk: ConferenceTalk,
  paragraph: number
): Passage {
  const verses: Verse[] = talk.paragraphs.map((text, i) => ({ number: i + 1, text }));
  const speakerLine = [talk.speaker, talk.calling].filter(Boolean).join(" · ");

  return {
    kind: "conference",
    reference: `“${talk.title}”`,
    sourceLabel: "General Conference",
    text: talk.paragraphs[paragraph],
    url: talk.url,
    urlLabel: "Read the full talk",
    expansionTitle: `“${talk.title}”`,
    expansionSubtitle: [speakerLine, conference.label].filter(Boolean).join(" · "),
    verses,
    highlightVerse: paragraph + 1,
    book: "General Conference",
    chapter: talk.title,
    section: paragraph + 1,
    chips: ["General Conference", conference.label],
  };
}

/** Snippets of real, already-loaded verse text for the riffling animation. */
export function getTeaserPool(): string[] {
  const pool: string[] = [];
  for (const data of resolvedVolumes.values()) {
    for (const book of data.books) {
      for (const chapter of book.chapters) {
        for (const v of chapter.verses) if (v.length >= 40 && v.length <= 220) pool.push(v);
      }
    }
  }
  return buildTeasers(pool.length ? pool : null);
}

const resolvedVolumes = new Map<string, VolumeData>();

/** ---------- Citations ---------- */

const normaliseTitle = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^[\u201c"']+|[\u201d"']+$/g, "")
    .replace(/\s+/g, " ");

async function resolveScriptureCitation(
  bookName: string,
  chapter: string,
  section: number
): Promise<Passage | null> {
  const chapterNumber = Number.parseInt(chapter, 10);
  if (!Number.isInteger(chapterNumber)) return null;

  const manifest = await loadManifest();
  const wanted = bookName.trim().toLowerCase();

  for (const volume of manifest.volumes) {
    const listed = volume.books.find(
      (b) => b.name.toLowerCase() === wanted || b.slug.toLowerCase() === wanted
    );
    if (!listed) continue;

    const data = await loadVolume(volume.id);
    const book = data.books.find((b) => b.slug === listed.slug);
    const chapterData = book?.chapters.find((c) => c.n === chapterNumber);
    if (!book || !chapterData) continue;
    if (!Number.isInteger(section) || section < 1 || section > chapterData.verses.length) continue;

    return buildScripturePassage(data, book, chapterData, section);
  }
  return null;
}

async function resolveConferenceCitation(title: string, section: number): Promise<Passage | null> {
  if (!title.trim()) return null;

  const manifest = await loadManifest();
  const wanted = normaliseTitle(title);

  for (const conference of manifest.conferences) {
    const data = await loadConference(conference.id);
    const talk = data.talks.find((t) => normaliseTitle(t.title) === wanted);
    if (!talk) continue;
    if (!Number.isInteger(section) || section < 1 || section > talk.paragraphs.length) continue;

    return buildConferencePassage(conference, talk, section - 1);
  }
  return null;
}

/**
 * Turn a citation from an imported favorites file into a passage, looking the
 * text up in the library this build ships. Returns null when nothing matches.
 */
export async function resolveCitation(
  kind: "scripture" | "conference" | undefined,
  book: string,
  chapter: string,
  section: number
): Promise<Passage | null> {
  if (kind !== "conference") {
    const scripture = await resolveScriptureCitation(book, chapter, section);
    if (scripture || kind === "scripture") return scripture;
  }
  return resolveConferenceCitation(chapter, section);
}

export { FALLBACK_TEASERS };
