"use client";

import type { JournalEntry } from "./journal";
import { bodyText, displayTitle } from "./journal";
import { noteText, type Note } from "./notes";
import type { SearchHit } from "./search";

/**
 * What a journal entry can point at, and where each of those things lives.
 *
 * Three kinds share one shape, because the reader does not care which kind they
 * are picking: a passage, a note they wrote on one, and another entry are all
 * "something to link to", and all three are rendered by the same row in the
 * picker. Keeping one type means the picker has one list to draw and the editor
 * has one thing to insert.
 *
 * Everything is expressed as an in-app URL. A link to a passage goes to the
 * reader (the same URL the search results use, so a passage has one address in
 * the app), a note goes to its card on the favorites page, and an entry goes to
 * the journal, named in the query string. That is what makes the links work
 * offline in the packaged app, where there is no server to resolve them.
 */

export type LinkSource = "passages" | "notes" | "entries";

export interface LinkTarget {
  /** Stable across searches, so a list can key on it. */
  id: string;
  source: LinkSource;
  /** The words offered for the link, before the reader edits them. */
  text: string;
  /** Where the link points. */
  href: string;
  /** A line of context under the candidate. */
  detail: string;
}

/** Where a citation lives in the reader — the address the search results use. */
export function passageHref(hit: Pick<SearchHit, "citation">): string {
  const params = new URLSearchParams({
    action: "cite",
    kind: hit.citation.kind,
    book: hit.citation.book,
    chapter: hit.citation.chapter,
    section: String(hit.citation.section),
  });
  if (hit.citation.conferenceId) params.set("session", hit.citation.conferenceId);
  return `/read?${params.toString()}`;
}

export function passageTarget(hit: SearchHit): LinkTarget {
  return {
    id: `passage:${hit.id}`,
    source: "passages",
    text: hit.reference,
    href: passageHref(hit),
    detail: hit.source,
  };
}

/** A note's address is its card on the favorites page. */
export function noteTarget(note: Note): LinkTarget {
  return {
    id: `note:${note.favoriteId}`,
    source: "notes",
    text: note.reference,
    href: `/favorites#${encodeURIComponent(note.favoriteId)}`,
    // The words, not the markup: this line is read and searched, not rendered.
    detail: noteText(note.text),
  };
}

/** An entry's address is the journal, with the entry named in the query. */
export function entryTarget(entry: JournalEntry): LinkTarget {
  return {
    id: `entry:${entry.id}`,
    source: "entries",
    text: displayTitle(entry),
    href: `/journal?entry=${encodeURIComponent(entry.id)}`,
    detail: bodyText(entry.body).slice(0, 120) || "Empty entry",
  };
}

/** Where the journal itself lives, so an entry link can be recognized. */
export const JOURNAL_PATH = "/journal";

/**
 * Whether a link stays inside the app. Internal links are followed with the
 * router (no page load, and the back button still works); everything else is an
 * ordinary link out.
 */
export function isInternalHref(href: string): boolean {
  return href.startsWith("/");
}

/**
 * Whether a target answers a query, for the two sources that are searched
 * locally: every word has to appear somewhere in what is shown, in any order.
 * That is looser than the library search — deliberately, since a handful of
 * notes is read rather than ranked — and it is the same rule for each.
 */
export function targetMatches(target: LinkTarget, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = `${target.text} ${target.detail}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
