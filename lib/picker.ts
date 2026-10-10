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

export { FALLBACK_TEASERS };
