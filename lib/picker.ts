import { dailyRandom, type Random } from "./daily";
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

/**
 * The randomness a draw runs on. `Math.random` for the everyday "New passage",
 * and a day-seeded generator for the daily passage — see lib/daily.ts. Passing
 * it in is what lets the same day draw the same passage twice, in two places
 * that never share state.
 */
const unseeded: Random = Math.random;

function weightedPick<T>(items: T[], weight: (t: T) => number, random: Random): T | null {
  const total = items.reduce((a, i) => a + weight(i), 0);
  if (total <= 0) return null;
  let r = random() * total;
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

export async function pickPassage(
  manifest: Manifest,
  filters: Filters,
  random: Random = unseeded
): Promise<Passage> {
  const volumes = manifest.volumes.filter((v) => eligibleVolumeVerseCount(v, filters) > 0);
  const conferences = eligibleConferences(manifest, filters).filter((c) => c.paragraphs > 0);

  const scriptureWeight = volumes.reduce((a, v) => a + eligibleVolumeVerseCount(v, filters), 0);
  const conferenceWeight = conferences.reduce((a, c) => a + c.paragraphs, 0);

  if (scriptureWeight <= 0 && conferenceWeight <= 0) throw new NoSourcesError();

  // Weight the draw by how many eligible sections each source contributes.
  const drawScripture =
    conferenceWeight <= 0 ||
    (scriptureWeight > 0 && random() * (scriptureWeight + conferenceWeight) < scriptureWeight);

  if (drawScripture) {
    const volume = weightedPick(volumes, (v) => eligibleVolumeVerseCount(v, filters), random);
    if (volume) return pickScripture(volume, filters, random);
  }
  const conference = weightedPick(conferences, (c) => c.paragraphs, random);
  if (conference) return pickConference(conference, random);
  throw new NoSourcesError();
}

/**
 * The passage for one local day — what the daily reminder quotes, and what the
 * app shows if it is opened before drawing anything else.
 *
 * The day does the choosing, not `Math.random`, so the reminder (scheduled days
 * ahead) and the app (opened whenever) land on the same verse without sharing
 * any state. It follows the reader's filters, so a day never quotes a source
 * they have switched off.
 */
export function pickDailyPassage(
  manifest: Manifest,
  filters: Filters,
  day: string
): Promise<Passage> {
  return pickPassage(manifest, filters, dailyRandom(day));
}

async function pickScripture(volume: VolumeInfo, filters: Filters, random: Random): Promise<Passage> {
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
  const chosen = flat[Math.floor(random() * flat.length)];

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
  };
}

async function pickConference(conference: ConferenceInfo, random: Random): Promise<Passage> {
  const data = await loadConference(conference.id);
  const flat: { talk: ConferenceData["talks"][number]; paragraph: number }[] = [];
  for (const talk of data.talks) {
    for (let i = 0; i < talk.paragraphs.length; i++) flat.push({ talk, paragraph: i });
  }
  if (!flat.length) throw new NoSourcesError();
  const { talk, paragraph } = flat[Math.floor(random() * flat.length)];
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
    urlLabel: "Open in Gospel Library",
    expansionTitle: `“${talk.title}”`,
    expansionSubtitle: [speakerLine, conference.label].filter(Boolean).join(" · "),
    verses,
    highlightVerse: paragraph + 1,
    book: "General Conference",
    chapter: talk.title,
    section: paragraph + 1,
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

/**
 * A book's chapters and how many verses each one holds.
 *
 * The quiz's pickers have to know what a book contains before an answer is
 * given, and the manifest only counts chapters and verses per volume — the
 * volume file is the honest source. The read goes through the same cache as
 * every other one, so a second look at the same book costs nothing.
 */
export async function chapterSizes(
  volumeId: string,
  bookName: string
): Promise<{ chapter: number; verses: number }[]> {
  const data = await loadVolume(volumeId);
  const book = data.books.find((b) => b.name === bookName);
  if (!book) return [];
  return book.chapters.map((c) => ({ chapter: c.n, verses: c.verses.length }));
}

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

async function resolveConferenceCitation(
  title: string,
  section: number,
  conferenceId?: string
): Promise<Passage | null> {
  if (!title.trim()) return null;

  const manifest = await loadManifest();
  const wanted = normaliseTitle(title);
  // A caller that already knows which session it means — a search result does,
  // from its own id — names it, and one file is loaded instead of ten.
  const candidates = conferenceId
    ? manifest.conferences.filter((c) => c.id === conferenceId)
    : manifest.conferences;

  for (const conference of candidates) {
    const data = await loadConference(conference.id);
    const talk = data.talks.find((t) => normaliseTitle(t.title) === wanted);
    if (!talk) continue;
    if (!Number.isInteger(section) || section < 1 || section > talk.paragraphs.length) continue;

    return buildConferencePassage(conference, talk, section - 1);
  }
  return null;
}

/**
 * The reader's address for a passage, as the search page writes it.
 *
 * A citation in a page's strapline is a way into the words, not a label: the
 * reader takes a passage from `?action=cite` (see components/inspiration-app.tsx)
 * rather than being made to find it again in the picker, so every such link
 * says exactly which passage it means.
 */
export function citationHref(citation: {
  kind: "scripture" | "conference";
  book: string;
  chapter: string;
  section: number;
  conferenceId?: string;
}): string {
  const params = new URLSearchParams({
    action: "cite",
    kind: citation.kind,
    book: citation.book,
    chapter: citation.chapter,
    section: String(citation.section),
  });
  if (citation.conferenceId) params.set("session", citation.conferenceId);
  return `/read?${params.toString()}`;
}

/**
 * Turn a citation from an imported favorites file into a passage, looking the
 * text up in the library this build ships. Returns null when nothing matches.
 */
export async function resolveCitation(
  kind: "scripture" | "conference" | undefined,
  book: string,
  chapter: string,
  section: number,
  /** The session a conference talk belongs to, when the caller already knows it. */
  conferenceId?: string
): Promise<Passage | null> {
  if (kind !== "conference") {
    const scripture = await resolveScriptureCitation(book, chapter, section);
    if (scripture || kind === "scripture") return scripture;
  }
  return resolveConferenceCitation(chapter, section, conferenceId);
}

/**
 * The ids the search index is built from (`scripts/search-index.mjs`), and so
 * the ids a search result carries: `s/<volume>/<book slug>/<chapter>/<verse>`,
 * and `c/<conference>/<talk index>/<paragraph>`. One definition, read by both
 * the module that makes a hit out of a result (lib/search.ts) and the module
 * that reads a passage back out of one (below).
 */
export const SCRIPTURE_ID = /^s\/([^/]+)\/([^/]+)\/([0-9]+)\/([0-9]+)$/;
export const CONFERENCE_ID = /^c\/([^/]+)\/([0-9]+)\/([0-9]+)$/;

/**
 * The text of one passage, by the id a search result carries.
 *
 * The search's phrase rule has to read a candidate's words *before* the page can
 * decide what to show (see lib/search.ts), and it may have hundreds of candidates
 * to look at, so this goes straight at the file the id names rather than hunting
 * for the passage: no manifest scan, no title matching, and the one conference
 * session a talk belongs to instead of every session. Loading goes through the
 * caches everything else uses, so the first candidate from a volume pays for the
 * fetch and the rest are answered from memory — the same files, and the same
 * fetches, that the search page's snippets and the reader itself make.
 *
 * Returns null for an id this library doesn't hold, which is a fact about the
 * candidate rather than an error.
 */
export async function loadPassageText(id: string): Promise<string | null> {
  const scripture = SCRIPTURE_ID.exec(id);
  if (scripture) {
    const [, volumeId, bookSlug, chapter, verse] = scripture;
    const data = await loadVolume(volumeId);
    const book = data.books.find((b) => b.slug === bookSlug);
    const text = book?.chapters.find((c) => c.n === Number(chapter))?.verses[Number(verse) - 1];
    return text ?? null;
  }

  const conference = CONFERENCE_ID.exec(id);
  if (conference) {
    const [, conferenceId, talkIndex, paragraph] = conference;
    const data = await loadConference(conferenceId);
    return data.talks[Number(talkIndex)]?.paragraphs[Number(paragraph) - 1] ?? null;
  }

  return null;
}

export { FALLBACK_TEASERS };
