export interface BookInfo {
  name: string;
  slug: string;
  chapters: number;
  verses: number;
}

export interface VolumeInfo {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  chapters: number;
  verses: number;
  books: BookInfo[];
}

export interface ConferenceInfo {
  id: string;
  label: string;
  year: number;
  month: number;
  url: string;
  talks: number;
  paragraphs: number;
}

export interface DataSources {
  scriptures: { name: string; url: string; license?: string };
  conference: { name: string; url: string; note?: string };
}

export interface Manifest {
  generatedAt: string;
  sources: DataSources;
  volumes: VolumeInfo[];
  conferences: ConferenceInfo[];
}

/** Which sources/books/conferences are eligible for a random draw. */
export interface Filters {
  /** volumeId -> enabled (absent means enabled) */
  volumes: Record<string, boolean>;
  /** `${volumeId}:${bookSlug}` -> enabled (absent means enabled) */
  books: Record<string, boolean>;
  /** Master switch for general conference (absent means enabled). */
  conferenceMaster?: boolean;
  /** conferenceId -> enabled (absent means enabled) */
  conferences: Record<string, boolean>;
}

export interface Verse {
  number: number;
  text: string;
}

export interface Passage {
  kind: "scripture" | "conference";
  /** Short identifier, e.g. "1 Nephi 3:7" */
  reference: string;
  /** Top-level source label, e.g. "Book of Mormon" */
  sourceLabel: string;
  /** The selected verse / paragraph text */
  text: string;
  /** ChurchofJesusChrist.org (Gospel Library) link */
  url: string;
  urlLabel: string;
  /** Heading shown when expanded, e.g. "1 Nephi 3" */
  expansionTitle: string;
  /** Supporting line, e.g. speaker + conference */
  expansionSubtitle?: string;
  /** Full chapter (or talk) with the selected section highlighted */
  verses: Verse[];
  /** Verse number to highlight in the expansion (null for conference) */
  highlightVerse: number | null;
  /** Small chips shown on the card */
  chips: string[];
}
