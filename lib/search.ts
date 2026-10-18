"use client";

import MiniSearch, { type AsPlainObject, type SearchResult } from "minisearch";
import {
  CONFERENCE_ID,
  SCRIPTURE_ID,
  dataUrl,
  eligibleBooks,
  eligibleConferences,
  loadManifest,
  loadPassageText,
} from "./picker";
import type { Filters, Manifest } from "./types";

/**
 * The search box's engine: one MiniSearch index, built at build time and read
 * here.
 *
 * The split between the two halves is deliberate, and the file is the contract.
 * `scripts/search-index.mjs` decides how a corpus becomes terms; this module
 * decides how a query does. The two must agree exactly — a stopword list on one
 * side and not the other fails silently, as an empty result set — so this module
 * takes the list, the options, and the term pattern *out of the file* rather
 * than keeping a second copy of them in code. The build then reloads what it
 * wrote and runs sample queries through it (`verifySnapshot`), which is the only
 * way drift gets caught before it reaches a reader.
 *
 * What it costs, measured rather than guessed: the snapshot is 11.9 MB of JSON
 * and 2.9 MB gzipped, and it is fetched and inflated once per session, on the
 * first query, only on this page. Everything else about the app stays offline
 * and instant; this is the one thing that has to be paid for when it is used.
 *
 * Ranking by how a passage answers the query puts a second read on top of that:
 * a query of more than one word reads the passage text it needs
 * (`loadPassageText`), out of the same files the page's snippets come from,
 * through the same caches, and only as far as the page's own rows require.
 * Measured on the web build, cold, with the browser cache off, one run per query:
 * a one-word search read one library file — the file its snippets needed — and
 * reached its first result in 1.34 s; "still small voice" read 13 (2.96 MB on the
 * wire) in 2.08 s; the worst measured, "service of your god" — four words, and no
 * passage holds all four as one run — read 14 (3.09 MB, which is the library) in
 * 2.09 s; and "nephi jesus", whose out-of-order answers have to be read to be
 * ranked below the in-order ones, read 11 (1.68 MB) in 1.65 s. Those are files a
 * reader pays for anyway, when a result is opened or a snippet drawn, and the
 * session keeps them.
 */

/** Where the build writes the snapshot (scripts/search-index.mjs). */
const INDEX_PATH = "data/search.json.gz";

/**
 * The file, as the build writes it. Every one of these is used: the options and
 * the term filter rebuild MiniSearch, `documents` is what the page counts, and
 * `version` is here so a stale index is recognizable.
 */
interface SearchFile {
  version: number;
  generatedAt: string | null;
  documents: number;
  options: { fields: string[]; storeFields: string[]; idField: string };
  stopwords: string[];
  termPattern: string;
  index: AsPlainObject;
}

interface SearchDocument {
  id: string;
  /** Conference hits carry their talk's title; a verse's id already says its own. */
  title?: string;
  byline?: string;
}

/** Where a hit is, in the shape `resolveCitation` takes. */
export interface SearchCitation {
  kind: "scripture" | "conference";
  /** A book name for a verse, and "General Conference" for a paragraph. */
  book: string;
  /** The chapter number as a string, or the talk's title. */
  chapter: string;
  section: number;
  /** Conference hits know their session, so opening one loads a single file. */
  conferenceId?: string;
}

export interface SearchHit {
  id: string;
  score: number;
  /** The passage's own reference — the same string the card shows once opened. */
  reference: string;
  /** The volume for a verse; the speaker and session for a talk. */
  source: string;
  citation: SearchCitation;
}

/** The loaded index, and the little the page needs to ask it things. */
export interface SearchLibrary {
  documents: number;
  /** Whether a word is one the index carries at all (false for "the", "a", "i"). */
  isTerm: (word: string) => boolean;
  /**
   * Whether a word is one the index could carry — the character rule alone,
   * without the stopword list. True for "of" and "still", false for "a". The
   * page marks by this rather than by `isTerm`, because the glue counts in a
   * result even though the index leaves it out.
   */
  isToken: (word: string) => boolean;
  mini: MiniSearch<SearchDocument>;
}

/** Raised when this browser can't inflate the index at all. */
export class SearchUnsupportedError extends Error {
  constructor() {
    super("This browser can't open the search index.");
    this.name = "SearchUnsupportedError";
  }
}

/** One load per session: the fetch and the inflate are worth doing once. */
let loading: Promise<SearchLibrary> | null = null;

export const loadSearchLibrary = (): Promise<SearchLibrary> => (loading ??= open());

async function open(): Promise<SearchLibrary> {
  if (typeof DecompressionStream === "undefined") throw new SearchUnsupportedError();

  const res = await fetch(dataUrl(INDEX_PATH));
  if (!res.ok) throw new Error(`Failed to load the search index (${res.status})`);
  if (!res.body) throw new Error("Failed to load the search index: empty response");

  // Inflated as a stream rather than downloaded whole, so the browser can start
  // producing text while the rest of the file is still arriving.
  const text = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
  const file = JSON.parse(text) as SearchFile;

  const stopwords = new Set(file.stopwords);
  const keep = new RegExp(file.termPattern);
  const processTerm = (term: string) => {
    const lowered = term.toLowerCase();
    return !keep.test(lowered) || stopwords.has(lowered) ? null : lowered;
  };

  // `loadJS`, not `loadJSON`: the snapshot is already an object here, and
  // re-stringifying 11.9 MB just to parse it again would be pure waste.
  const mini = MiniSearch.loadJS<SearchDocument>(file.index, {
    fields: file.options.fields,
    storeFields: file.options.storeFields,
    idField: file.options.idField,
    processTerm,
  });

  return {
    documents: file.documents,
    isTerm: (word) => processTerm(word) !== null,
    isToken: (word) => keep.test(word.toLowerCase()),
    mini,
  };
}

/**
 * Turn one result into something the page can show and open.
 *
 * A verse's reference is derived here from the manifest the app already has
 * loaded, rather than stored in the index 42,000 times over — the id says which
 * verse it is, and the book's own name is one lookup away. A talk's title and
 * byline can't be derived from anything, so those two strings are the only ones
 * the index carries.
 */
function toHit(manifest: Manifest, result: SearchResult & SearchDocument): SearchHit | null {
  const scripture = SCRIPTURE_ID.exec(result.id);
  if (scripture) {
    const [, volumeId, bookSlug, chapter, verse] = scripture;
    const volume = manifest.volumes.find((v) => v.id === volumeId);
    const book = volume?.books.find((b) => b.slug === bookSlug);
    if (!volume || !book) return null;
    return {
      id: result.id,
      score: result.score,
      reference: `${book.name} ${chapter}:${verse}`,
      source: volume.title,
      citation: { kind: "scripture", book: book.name, chapter, section: Number(verse) },
    };
  }

  const conference = CONFERENCE_ID.exec(result.id);
  if (conference && result.title) {
    const [, conferenceId, , paragraph] = conference;
    return {
      id: result.id,
      score: result.score,
      reference: `“${result.title}”`,
      source: result.byline ? `${result.byline} · General Conference` : "General Conference",
      citation: {
        kind: "conference",
        book: "General Conference",
        chapter: result.title,
        section: Number(paragraph),
        conferenceId,
      },
    };
  }

  return null;
}

/**
 * Search the library.
 *
 * All the words have to match — `combineWith: "AND"` — because a reader who
 * types "faith repentance" wants the verses with both, not the 1,700 with
 * either. Prefix matching keeps it forgiving of a half-typed word, and a small
 * fuzzy allowance catches a misspelling.
 *
 * And then a citation is put back on top of the ranking, by hand. Scoring alone
 * cannot do it: "alma 32" matches *Alma 2:32* — a short verse holding both
 * tokens, which BM25 likes more than the chapter asked for — because a search
 * index sees tokens, not the shape of a reference. The shape is easy to read
 * though, so the query is checked against the books the library actually has
 * (`parseCitation`), and if it names one, that chapter's verses are lifted to the
 * top in order. Nothing is excluded: the chapters that merely share the words
 * still follow, which is what someone searching "alma 32" probably wants if they
 * weren't asking for the chapter at all.
 *
 * And one more hand on the scale: **scripture ranks above conference.** This is a
 * scripture app — the words are what it is for, and a talk quoting a verse is
 * rarely the thing someone searched the verse for. So the page is filled from the
 * verses first, whatever the scores say. Talks are not shut out by that, though:
 * a slice of the page is held back for them (`TALK_RESERVE`), so a search for
 * "faith" — 1,700 verses, and every one of them a better score than any talk —
 * still offers the talks that match instead of burying them under a wall of
 * verses the reader will never reach the bottom of.
 *
 * `filters` are the reader's own selection of sources — the same one the draw, the
 * daily verse, and the reminder answer to — applied here before anything is
 * ranked or cut, so narrowing to the Book of Mormon gives a page of Book of Mormon
 * verses rather than a page with the other volumes sieved out of it.
 *
 * The last hand on the scale reads the passages themselves, because the index
 * cannot answer what it asks: the terms are matched with AND, so every candidate
 * has every word of the query that the index carries — and the index carries only
 * the significant ones. The glue is added back here, out of the passage's own
 * text, so a word the reader typed is never simply ignored. What separates two
 * candidates is therefore *the words the reader actually typed* and the *order*
 * they come in, and both of those live only in the passage text:
 *
 *   - the passage carrying **more** of the query's words outranks one carrying
 *     fewer, but a word that means something is counted before the glue: "service
 *     of your god" prefers a passage that also has *of* and *your*, and never at
 *     the cost of *service* or *god*. On their own the glue words are worth
 *     little — a query of nothing but them is not a search at all;
 *   - at the same count, the passage carrying those words **in the query's own
 *     order** outranks one carrying them backwards — *service … god* over
 *     *god … service*;
 *   - and a passage carrying the whole query **as one unbroken run** — the exact
 *     phrase — leads those that merely hold the words in order.
 *
 * A word with meaning counts for the reader as the index counts it, by prefix:
 * searching *faith* keeps "faithful", which the page marks in the result, so it is
 * the same match here (`wordsOf`, `matchOf`). The glue counts exactly instead,
 * because a prefix on *of* would match "offering" — and it is marked in the
 * result like any other word the reader typed (`highlightMatches`).
 *
 * The candidates are read out of the passage library (`loadPassageText`, by the id
 * a hit already carries) in the order the index ranked them, and the reading stops
 * as soon as each stream of the page is full of the best answer there is — the
 * whole query as one run. A query of one word reads nothing at all: one word is
 * its own phrase, always. The lift happens *within* the streams the rules above
 * set up — after the cited chapter, verses before talks — so a talk that quotes
 * the phrase still does not jump the verses.
 */
export async function searchLibrary(
  query: string,
  { limit = 40, filters }: { limit?: number; filters?: Filters } = {}
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [library, manifest] = await Promise.all([loadSearchLibrary(), loadManifest()]);

  const allowed = filters ? sourceFilter(manifest, filters) : null;
  const results = (
    library.mini.search(trimmed, {
      combineWith: "AND",
      prefix: true,
      fuzzy: 0.2,
      boost: { reference: 2 },
    }) as (SearchResult & SearchDocument)[]
  ).filter((result) => !allowed || allowed(result.id));

  // Ordered before the cut, not after: the chapter asked for may be a thousand
  // hits deep in a query like "mosiah 2", where every verse numbered 2 in Mosiah
  // matches too.
  const { cited, scriptures, talks } = rankResults(results, parseCitation(trimmed, manifest));

  // Never more than half the page, so a caller asking for a handful of results
  // still gets verses in it: the reserve is a floor for talks, and it must not
  // become a ceiling for the thing the reader is looking for. And none at all
  // when no talks can appear — with conference switched off, holding ten rows
  // back would just be ten rows of nothing.
  const reserve = talks.length ? Math.min(TALK_RESERVE, Math.floor(limit / 2)) : 0;
  const verseSlots = Math.max(0, limit - reserve);
  const wanted = wordsOf(trimmed);
  // The words the index leaves out, matched out of the passage's own text. They
  // are worth less than the words that mean something (see `compareMatches`),
  // but they are not discarded: "of" in "service of your god" is still one of
  // the words the reader asked for.
  const glue = new Set(wanted.filter((word) => !library.isTerm(word)));

  // The cited chapter keeps the top of the page whatever else matches: it is the
  // one thing a reader can ask for by name. Everything under it is ranked by how
  // well the passage answers the query.
  const citedHead = cited.slice(0, verseSlots);
  const verses = await matchFirstOr(scriptures, verseSlots - citedHead.length, wanted, glue);
  const entries = [...citedHead, ...verses].slice(0, verseSlots);

  const talkSlots = limit - entries.length;
  const talkEntries = await matchFirstOr(talks, talkSlots, wanted, glue);
  entries.push(...talkEntries.slice(0, talkSlots));

  return entries
    .map((result) => toHit(manifest, result))
    .filter((hit): hit is SearchHit => hit !== null);
}

/** A word, as a reader sees one: letters and digits, in any script, and the apostrophe inside one. */
const WORD = /[\p{L}\p{N}']+/gu;

/** How many words of the passage to keep in front of the first match, as context. */
const PREVIEW_LEAD = 3;

/**
 * A result's preview, started where the query's words are.
 *
 * A card shows two lines of a passage and a passage runs longer than that, so a
 * preview that always starts at the beginning can hide the very words that were
 * searched for, the mark sitting below the clamp. This starts the line a few words
 * *before* the first word the query asked for — so the highlight is on screen —
 * and marks the cut with a leading ellipsis. A passage holding none of the query's
 * words (a citation search, where the query is in the reference and not the text)
 * is shown from its start, as before.
 *
 * The few words of run-up are context, not filler: starting exactly on the match
 * reads like a fragment, where three words of lead-in read like a sentence.
 *
 * The window starts on a word with meaning whenever the query has one
 * (`isContent`), because the glue it leaves out is marked but says little: a
 * query of "the word of god" should open on *word*, not wherever a stray "the"
 * happens to fall. A query of nothing but glue has no better anchor, so it uses
 * the glue.
 */
export function previewFrom(
  text: string,
  query: string,
  { lead = PREVIEW_LEAD, isContent = () => true }: {
    lead?: number;
    isContent?: (word: string) => boolean;
  } = {}
): string {
  const terms = [...new Set(wordsOf(query))];
  if (!terms.length) return text;

  const meaningful = terms.filter(isContent);
  const anchors = meaningful.length ? meaningful : terms;

  const words = [...text.matchAll(WORD)];
  const first = words.findIndex((word) =>
    anchors.some((term) => word[0].toLowerCase().startsWith(term))
  );
  if (first <= 0) return text;

  const start = Math.max(0, first - lead);
  if (start === 0) return text;
  return `… ${text.slice(words[start].index ?? 0)}`;
}

/**
 * A query, or a passage, as the words in it: lowercased, typographic apostrophes
 * straightened, punctuation dropped. What is left is what the match is read
 * against — the reader's words in their order, with the punctuation of written
 * English taken out of the way of both sides equally.
 */
function wordsOf(value: string): string[] {
  return value.toLowerCase().replace(/[\u2018\u2019]/g, "'").match(WORD) ?? [];
}

/**
 * How well one passage answers the query.
 *
 * `words` is how many of the query's distinct words the passage carries, glue
 * included, and `content` how many of those are words with meaning in them — the
 * index's own terms. `inOrder` is how many of the query's words it carries in the
 * query's own order (the longest run that can be read straight through the
 * passage that way), and `whole` whether it carries the entire query as one
 * unbroken run. Ranked in that order, they are the rule `searchLibrary`
 * describes: the words that mean something first, then the rest of the words,
 * then the query's order, then the exact phrase.
 */
interface Match {
  words: number;
  content: number;
  inOrder: number;
  whole: boolean;
}

const NOTHING: Match = { words: 0, content: 0, inOrder: 0, whole: false };

/**
 * A passage word answers a query word: by prefix when it means something, as the
 * index has it, and exactly when it is glue. A prefix on "of" would match
 * "offering", which is not the word the reader asked for.
 */
const answers = (word: string, term: string, glue: Set<string>) =>
  glue.has(term) ? word === term : word.startsWith(term);

/** Whether the query sits in those words as one unbroken run. */
function holdsRun(words: string[], query: string[], glue: Set<string>): boolean {
  for (let start = 0; start + query.length <= words.length; start += 1) {
    let run = true;
    for (let j = 0; j < query.length && run; j += 1)
      run = answers(words[start + j], query[j], glue);
    if (run) return true;
  }
  return false;
}

/**
 * Read a passage against the query.
 *
 * One pass over the passage's words answers two of the three questions — which of
 * the query's words it carries at all, and how far through the query its own words
 * run in order. The second is a longest-common-subsequence over *words* rather
 * than characters, and that is the point of it: a passage saying *god … service*
 * has both words and not the order the reader asked for. The third question — the
 * whole query as one unbroken run — is a small scan of its own.
 */
function matchOf(words: string[], query: string[], glue: Set<string>): Match {
  const distinct = [...new Set(query)];
  const carried = new Set<string>();
  const meaningful = new Set<string>();
  // `runs[j]` is the longest in-order run that reaches the query's j-th word. The
  // rows are carried over the passage one word at a time, j descending, so each
  // cell still reads the previous word's row — the ordinary rolling-row recurrence.
  const runs = new Array<number>(query.length + 1).fill(0);

  for (const word of words) {
    for (let j = query.length; j >= 1; j -= 1) {
      if (answers(word, query[j - 1], glue)) {
        runs[j] = Math.max(runs[j], runs[j - 1] + 1);
      }
    }
    for (const term of distinct) {
      if (!answers(word, term, glue)) continue;
      carried.add(term);
      if (!glue.has(term)) meaningful.add(term);
    }
  }

  return {
    words: carried.size,
    content: meaningful.size,
    inOrder: runs[query.length],
    whole: holdsRun(words, query, glue),
  };
}

/**
 * The rule, as a comparison: the better answer sorts first, ties keep the index's
 * order.
 *
 * The words that mean something are compared before the total, which is what makes
 * glue worth less than a word like *faith*: it can settle a row between two
 * passages that found the same meaningful words, and it can never lift a passage
 * over one that found more of them. A query of nothing but glue therefore has no
 * ranking at all — and is refused before it reaches here.
 */
function compareMatches(a: Match, b: Match): number {
  if (a.content !== b.content) return b.content - a.content;
  if (a.words !== b.words) return b.words - a.words;
  if (a.inOrder !== b.inOrder) return b.inOrder - a.inOrder;
  if (a.whole !== b.whole) return a.whole ? -1 : 1;
  return 0;
}

/**
 * A stream of candidates, ranked by how well each answers the query.
 *
 * The scan stops as soon as `needed` candidates hold the whole query as one run —
 * the best answer there is, so nothing further down could take a row from them,
 * which is what makes it safe to stop reading the library there. A query whose
 * phrase is nowhere is the expensive case, and there the whole stream is read and
 * sorted; a query of one word, or one with no room left on the page, is not read
 * at all.
 *
 * What comes back is exact for its first `needed` entries, and the rest in the
 * order the index gave them — which is all a caller that slices to `needed` can
 * use. The stream is only ever reordered, never shortened.
 */
async function matchFirst(
  list: Ranked[],
  needed: number,
  query: string[],
  glue: Set<string>
): Promise<Ranked[]> {
  // One word is its own phrase: every candidate carries it, in order, already.
  if (needed <= 0 || !list.length || query.length < 2) return list;

  const read: { result: Ranked; match: Match }[] = [];
  let filled = 0;

  for (let i = 0; i < list.length; i += 1) {
    if (filled >= needed) break;
    const text = await loadPassageText(list[i].id);
    const match = text === null ? NOTHING : matchOf(wordsOf(text), query, glue);
    if (match.whole) filled += 1;
    read.push({ result: list[i], match });
  }

  // The page is full of the whole query: those rows, in the index's own order,
  // and then the rest as they were, unread and untouched.
  if (filled >= needed) {
    const held = read.filter((r) => r.match.whole).map((r) => r.result);
    const rest = read.filter((r) => !r.match.whole).map((r) => r.result);
    return [...held, ...rest, ...list.slice(read.length)];
  }

  // Nothing fills the page, so everything was read: best answer first, and the
  // index's order wherever two candidates answer equally well.
  return [...read].sort((a, b) => compareMatches(a.match, b.match)).map((r) => r.result);
}

/**
 * `matchFirst`, with the passage library treated as best-effort.
 *
 * Reading a passage can fail — a file is missing, a fetch drops — and when it
 * does the stream keeps the order the index gave it. The reader still gets the
 * results the search found; what is lost is the ranking, which is the only part of
 * this that needs the text at all.
 */
async function matchFirstOr(
  list: Ranked[],
  needed: number,
  query: string[],
  glue: Set<string>
): Promise<Ranked[]> {
  try {
    return await matchFirst(list, needed, query, glue);
  } catch {
    return list;
  }
}

/**
 * Whether a document's source is one the reader is reading from at all.
 *
 * Built out of the app's own rules for eligibility (`eligibleBooks`,
 * `eligibleConferences`) rather than a second reading of `Filters`, so a source
 * that is off for a draw cannot somehow be on for a search. The app has one
 * selection of sources — the panel on the passage page and the one on the search
 * page edit the same thing — and the draw, the daily verse, the reminder, and this
 * all answer to it.
 *
 * A document is recognized by the source segment of its id: `s/<volume>/<book>/…`
 * or `c/<conference>/…`, which is the same id the ranking and the page already
 * read.
 */
function sourceFilter(manifest: Manifest, filters: Filters) {
  const books = new Map(
    manifest.volumes.map((volume) => [
      volume.id,
      new Set(eligibleBooks(volume, filters).map((book) => book.slug)),
    ])
  );
  const conferences = new Set(eligibleConferences(manifest, filters).map((c) => c.id));

  return (id: string) => {
    const [, source, book] = id.split("/");
    return id.startsWith("s/")
      ? books.get(source)?.has(book) ?? false
      : conferences.has(source);
  };
}

/**
 * How much of a page's results the talks are guaranteed, when they match.
 *
 * Not a ranking rule — the verses are all above them — but a floor, so that
 * conference stays reachable on the queries where it would otherwise be
 * invisible. Small on purpose: ten rows is a screen and a half on a phone, and a
 * search for something the talks discuss is usually about the topic, not about
 * finding a talk.
 */
const TALK_RESERVE = 10;

/**
 * A query that reads as a reference — "alma 32", "1 nephi 3:7", "d&c 121" —
 * resolved against the books this build actually ships.
 *
 * Anything the library doesn't have is not a citation, so "faith 3" stays an
 * ordinary search. That check is what makes it safe to be generous with the
 * pattern: a wrong guess here costs the reader their ranking, not their results.
 */
export interface CitationMatch {
  /** The id prefix every verse of that chapter shares. */
  prefix: string;
  /** The verse asked for, when the query named one. */
  verse: number | null;
}

/** One or two digits of book, then a chapter, then optionally a verse. */
const CITATION = /^([0-9]?\s*[a-z][a-z.&'\s]*?)\s*([0-9]{1,3})(?::([0-9]{1,3}))?$/i;

/** "1 Nephi" / "1-ne" / "1 nephi" all come to the same key. */
const bare = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function parseCitation(query: string, manifest: Manifest): CitationMatch | null {
  const match = CITATION.exec(query.trim());
  if (!match) return null;

  const [, book, chapter, verse] = match;
  const wanted = bare(book);
  if (!wanted) return null;

  for (const volume of manifest.volumes) {
    for (const listed of volume.books) {
      if (bare(listed.name) !== wanted && bare(listed.slug) !== wanted) continue;
      // Chapter numbers are numbers in the ids, so "03" has to come back as "3".
      return {
        prefix: `s/${volume.id}/${listed.slug}/${Number(chapter)}/`,
        verse: verse ? Number(verse) : null,
      };
    }
  }
  return null;
}

/** The verse number in a scripture id, or 0 for anything else. */
const verseOf = (id: string) => Number(id.slice(id.lastIndexOf("/") + 1)) || 0;

type Ranked = SearchResult & SearchDocument;

interface Tiers {
  /** The chapter the query cited, if it cited one: verses in order, named verse first. */
  cited: Ranked[];
  /** Every other verse, in the order the index scored them. */
  scriptures: Ranked[];
  /** Conference paragraphs, likewise. */
  talks: Ranked[];
}

/**
 * Sort the results into the three groups the page shows in order.
 *
 * A verse is recognized by its id (`s/…`) rather than by any stored field,
 * because the id is the one thing every document is guaranteed to have and the
 * one the app already parses to open a hit.
 */
function rankResults(results: Ranked[], citation: CitationMatch | null): Tiers {
  const cited: Ranked[] = [];
  const scriptures: Ranked[] = [];
  const talks: Ranked[] = [];

  for (const result of results) {
    if (citation && result.id.startsWith(citation.prefix)) cited.push(result);
    else if (result.id.startsWith("s/")) scriptures.push(result);
    else talks.push(result);
  }

  cited.sort((a, b) => verseOf(a.id) - verseOf(b.id));
  if (citation && citation.verse !== null) {
    const named = cited.filter((result) => verseOf(result.id) === citation.verse);
    const neighbours = cited.filter((result) => verseOf(result.id) !== citation.verse);
    return { cited: [...named, ...neighbours], scriptures, talks };
  }

  return { cited, scriptures, talks };
}

/**
 * Whether a query is made only of glue ("the", "and", "unto"). The page says so
 * instead of showing an empty result, which is the difference between "no
 * matches" and "that word can't find anything on its own" — those words count in
 * the ranking beside a word that means something, but there is nothing here to
 * rank by.
 *
 * A crude split on purpose: this is a message, not the query — the real
 * tokenizing is MiniSearch's, and this only has to be right about ordinary
 * prose.
 */
export function allCommonWords(query: string, library: SearchLibrary): boolean {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length > 0 && words.every((word) => !library.isTerm(word));
}

/** A stretch of a passage's text, and whether the query asked for it. */
export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * The words in a passage that answer the query, in order, for the page to mark.
 *
 * It marks what the search actually matched: whole words, ignoring case, and by
 * prefix for a word with meaning — searching *faith* marks "faith" and
 * "faithful" in a verse about either, because those are the passages the search
 * returned. Not the fuzzy allowance, as the index's 0.2 is for forgiving a
 * misspelling; a word it forgave is not the word the reader typed, and marking
 * it would claim a match the query never made.
 *
 * The glue is marked too, exactly rather than by prefix: the ranking counts it
 * and the reader typed it, so "service of your god" puts a stripe on *of* and
 * *your* as well as the two words that carry the meaning. Exactly, because a
 * prefix on "of" would mark "offering" — a word the query did not ask for.
 * Pass the loaded library's `isToken` (the character rule) and `isTerm` (the
 * words that mean something); without them every word is marked by prefix.
 *
 * Splitting on `WORD` rather than on a plain-text pattern is what keeps the
 * marks on whole words: the highlight can't start in the middle of a word, and it
 * survives the letters a scripture actually uses — "Nephi's" is one word, and
 * searching *nephi* marks the whole of it. The same splitting reads the passage
 * for the ranking and for a result's preview, so what is counted, what is marked,
 * and where the preview starts all agree.
 */
export function highlightMatches(
  text: string,
  query: string,
  {
    isToken = () => true,
    isTerm = () => true,
  }: { isToken?: (word: string) => boolean; isTerm?: (word: string) => boolean } = {}
): HighlightPart[] {
  const terms = (query.toLowerCase().match(WORD) ?? []).filter(isToken);
  if (!terms.length) return [{ text, match: false }];

  const parts: HighlightPart[] = [];
  let cursor = 0;

  for (const word of text.matchAll(WORD)) {
    const start = word.index ?? 0;
    const lowered = word[0].toLowerCase();
    const hit = terms.some((term) => (isTerm(term) ? lowered.startsWith(term) : lowered === term));
    if (!hit) continue;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
    parts.push({ text: word[0], match: true });
    cursor = start + word[0].length;
  }

  if (!parts.length) return [{ text, match: false }];
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}
