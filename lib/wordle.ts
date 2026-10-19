"use client";

import { useSyncExternalStore } from "react";
import { dayKey, seedFromString, seededRandom } from "./daily";
import { dataUrl, loadManifest, pickDailyPassage, pickPassage } from "./picker";
import type { Filters, Passage } from "./types";

/**
 * The daily word puzzle: one word, hidden somewhere in the day's chapter.
 *
 * Three things live here, and nothing draws a tile: the rule for marking a
 * guess, the derivation of today's puzzle, and the day's record of guesses.
 * The page is the only thing that knows what a tile or a key looks like, which
 * is why these functions are testable by reading instead of by tapping.
 *
 * The puzzle is *found*, not fetched. There is no list of daily words to write
 * by hand and no server to pick one: the day seeds the same picker the reminder
 * and the hub use, and the word is one of the four-to-six-letter words anywhere
 * in the chapter that draw lands on. Every device agrees because the seed is the
 * date, and the app can be played offline because the whole library already is.
 *
 * The word comes from the chapter rather than the one verse the passage names,
 * because the card no longer prints the verse: the reader is sent to the reader
 * for the chapter, and a word hiding anywhere in it is still a word they can
 * find. The result card then shows the verse the word actually sits in.
 *
 * Not every chapter carries a four-to-six-letter word — a chapter of short
 * verses can miss — so a day that draws one draws again, one attempt further
 * along the same day's seed.
 *
 * The word list is built from the library itself (scripts/build-words.mjs), so
 * a guess is allowed if it is a word these scriptures and talks use. That is a
 * rule the player can see the sense of, and it is the only rule that fits: the
 * answers come from the chapter on the screen, and a word the chapter prints is
 * a word that ought to be accepted back.
 *
 * Answers are the four-to-six-letter words the library ever writes in
 * lowercase. That is a first cut at keeping names out — a word that is only
 * ever capitalised is almost certainly one — but it is a cut, not a filter:
 * names do appear in lowercase somewhere in the corpus, so they can be answers.
 * That is fair, because the answer is always in the chapter the reader is sent
 * to: the player can find it.
 *
 * Practice games share every rule above; they are only drawn from
 * `Math.random` instead of the date, and kept apart from the day's board so
 * playing again never costs the reader their daily score.
 */

export const MIN_WORD_LENGTH = 4;
export const MAX_WORD_LENGTH = 6;
export const MAX_GUESSES = 6;

/**
 * How many passages a day may try before giving up on finding a word. A
 * chapter with no candidate is uncommon; eight misses in a row is not a run of
 * bad luck, it is a filters set with no scripture in it at all, and the page
 * says so rather than spinning.
 */
const ATTEMPTS = 8;

export type LetterState = "correct" | "present" | "absent";

/** Whether the board in play is the day's, or one started from "Play again". */
export type GameMode = "daily" | "practice";

export interface Puzzle {
  mode: GameMode;
  /** The local day for a daily puzzle; a unique token for practice. */
  day: string;
  /** The word to find, lowercase, four to six letters. */
  answer: string;
  /** The chapter the word is hiding in, e.g. "1 Nephi 3". */
  reference: string;
  /** The verse the answer appears in, shown once the board is done. */
  verse: string;
  /** That verse's number, for the reference on the result card. */
  verseNumber: number;
  /** Where the reader opens that chapter. */
  href: string;
}

/** Today's puzzle and how far the reader has got with it. */
export interface SavedGame extends Puzzle {
  /** Oldest first; each is lowercase and the answer's length. */
  guesses: string[];
}

/**
 * Mark each letter of a guess against the answer.
 *
 * The duplicate rule is the whole of it, and the reason this is here rather
 * than in the page: a letter is marked "present" only as many times as the
 * answer still has it spare. Guess "senses" against "sphere" and only one of
 * the three s's earns a mark, which is the rule every player of this game
 * already knows and the one implementation that is easy to get subtly wrong.
 */
export function scoreGuess(answer: string, guess: string): LetterState[] {
  const marks: LetterState[] = new Array(guess.length).fill("absent");
  const spare: Record<string, number> = {};

  for (let i = 0; i < answer.length; i += 1) {
    if (guess[i] === answer[i]) marks[i] = "correct";
    else spare[answer[i]] = (spare[answer[i]] ?? 0) + 1;
  }

  for (let i = 0; i < guess.length; i += 1) {
    if (marks[i] === "correct") continue;
    const left = spare[guess[i]] ?? 0;
    if (left > 0) {
      marks[i] = "present";
      spare[guess[i]] = left - 1;
    }
  }

  return marks;
}

/** The best mark each letter has earned so far, for colouring the keyboard. */
export function letterStates(answer: string, guesses: string[]): Record<string, LetterState> {
  const rank: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };
  const states: Record<string, LetterState> = {};

  for (const guess of guesses) {
    for (const [i, mark] of scoreGuess(answer, guess).entries()) {
      const letter = guess[i];
      if (!states[letter] || rank[mark] > rank[states[letter]]) states[letter] = mark;
    }
  }

  return states;
}

export const isSolved = (game: SavedGame) => game.guesses.includes(game.answer);
export const isLost = (game: SavedGame) => !isSolved(game) && game.guesses.length >= MAX_GUESSES;
export const isOver = (game: SavedGame) => isSolved(game) || isLost(game);

/** ---------- The word list ---------- */

export interface WordList {
  /** Words that can be an answer. */
  answers: Set<string>;
  /** Words that can be guessed; answers are all in here too. */
  guesses: Set<string>;
}

let wordsPromise: Promise<WordList> | null = null;

/** A lowercased four-to-six-letter word, or null. */
const asWord = (value: unknown, length?: number): string | null => {
  if (typeof value !== "string") return null;
  if (!/^[a-z]+$/.test(value)) return null;
  if (length !== undefined) return value.length === length ? value : null;
  return value.length >= MIN_WORD_LENGTH && value.length <= MAX_WORD_LENGTH ? value : null;
};

function parseWordList(value: unknown): WordList {
  if (!value || typeof value !== "object") throw new Error("Bad word list");
  const candidate = value as { answers?: unknown; guesses?: unknown };
  if (!Array.isArray(candidate.answers) || !Array.isArray(candidate.guesses)) {
    throw new Error("Bad word list");
  }
  const answers = new Set<string>();
  for (const entry of candidate.answers) {
    const word = asWord(entry);
    if (word) answers.add(word);
  }
  const guesses = new Set<string>();
  for (const entry of candidate.guesses) {
    const word = asWord(entry);
    if (word) guesses.add(word);
  }
  // An answer the game won't accept as a guess would be a puzzle that cannot be
  // solved, so the narrower list can only ever be the subset.
  for (const word of answers) guesses.add(word);
  if (answers.size === 0) throw new Error("Empty word list");
  return { answers, guesses };
}

/**
 * The vocabulary, read once per session.
 *
 * 110 KB of JSON built from the library (scripts/build-words.mjs) and fetched
 * only on this page. A failed fetch is not cached: the next guess can try
 * again.
 */
export function loadWordList(): Promise<WordList> {
  if (!wordsPromise) {
    wordsPromise = fetch(dataUrl("data/words.json"))
      .then((res) => {
        if (!res.ok) throw new Error(`Word list failed (${res.status})`);
        return res.json() as Promise<unknown>;
      })
      .then(parseWordList)
      .catch((error: unknown) => {
        wordsPromise = null;
        throw error;
      });
  }
  return wordsPromise;
}

/** ---------- Deriving the puzzle ---------- */

/**
 * Every word of the chapter that can be an answer, with the verse it first
 * appears in. Keys are sorted so a seed always lands on the same word.
 */
function candidatesIn(passage: Passage, pool: Set<string>): Map<string, number> {
  const found = new Map<string, number>();
  for (const verse of passage.verses) {
    for (const match of verse.text.matchAll(/[A-Za-z]+/g)) {
      const word = match[0].toLowerCase();
      if (word.length < MIN_WORD_LENGTH || word.length > MAX_WORD_LENGTH) continue;
      if (!pool.has(word) || found.has(word)) continue;
      found.set(word, verse.number);
    }
  }
  return found;
}

interface WordPick {
  answer: string;
  verse: string;
  verseNumber: number;
}

/** One word from the chapter, chosen with `random`, or null if it has none. */
function pickWord(passage: Passage, pool: Set<string>, random: () => number): WordPick | null {
  const found = candidatesIn(passage, pool);
  const options = [...found.keys()].sort();
  if (!options.length) return null;

  const answer = options[Math.floor(random() * options.length)];
  const verseNumber = found.get(answer) ?? 1;
  const verse = passage.verses.find((v) => v.number === verseNumber)?.text ?? passage.text;
  return { answer, verse, verseNumber };
}

/**
 * The reader's link back to the chapter a puzzle came from.
 *
 * A citation rather than a bare link: the reader page understands it, and it
 * opens the whole chapter from its first verse. The card names the chapter, so
 * that is what the link should show — not the one verse the day's draw happened
 * to land on, which the card no longer prints.
 */
function readerHref(book: string, chapter: string): string {
  const params = new URLSearchParams({
    action: "cite",
    kind: "scripture",
    book,
    chapter,
    section: "1",
  });
  return `/read?${params.toString()}`;
}

/** The puzzle the drawn passage yields, or null when it has no usable word. */
function puzzleFrom(
  mode: GameMode,
  day: string,
  passage: Passage,
  pick: WordPick
): Puzzle {
  const book = passage.book ?? "";
  const chapter = passage.chapter ?? "";

  return {
    mode,
    day,
    answer: pick.answer,
    reference: passage.expansionTitle ?? `${book} ${chapter}`,
    verse: pick.verse,
    verseNumber: pick.verseNumber,
    href: readerHref(book, chapter),
  };
}

/**
 * The word game is played on chapters, so conference talks — which are drawn
 * by paragraph and have no chapter — are not eligible. Everything else about
 * the draw is the reader's own filters.
 */
const scripturesOnly = (filters: Filters): Filters => ({ ...filters, conferenceMaster: false });

/**
 * Build today's puzzle from the day and the reader's filters.
 *
 * The passage is the one the rest of the app is showing for the day; the word
 * is drawn from anywhere in its chapter. A day that draws a chapter with no
 * four-to-six-letter word draws again — `#2`, `#3` — off the same date, which
 * stays deterministic on every device.
 */
export async function createDailyPuzzle(
  filters: Filters,
  day: string = dayKey()
): Promise<Puzzle> {
  const [manifest, words] = await Promise.all([loadManifest(), loadWordList()]);

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const seed = attempt === 1 ? day : `${day}#${attempt}`;
    const passage = await pickDailyPassage(manifest, scripturesOnly(filters), seed);
    if (passage.kind !== "scripture") continue;

    // The passage is chosen from one stream and the word from another, so the
    // word does not depend on how much of the picker's randomness was spent.
    const random = seededRandom(seedFromString(`gospel-focus:wordle:${seed}`));
    const pick = pickWord(passage, words.answers, random);
    if (!pick) continue;

    return puzzleFrom("daily", day, passage, pick);
  }

  throw new Error("No four-to-six-letter word in today's chapter");
}

/**
 * A puzzle to play after the day's board is done: a random passage, and a word
 * from anywhere in its chapter. Not tied to the date and not stored, so it
 * never disturbs the daily game.
 */
export async function createPracticePuzzle(filters: Filters): Promise<Puzzle> {
  const [manifest, words] = await Promise.all([loadManifest(), loadWordList()]);

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const passage = await pickPassage(manifest, scripturesOnly(filters));
    if (passage.kind !== "scripture") continue;

    const pick = pickWord(passage, words.answers, Math.random);
    if (pick) return puzzleFrom("practice", `practice-${Date.now()}-${attempt}`, passage, pick);
  }

  throw new Error("No four-to-six-letter word could be drawn");
}

/** ---------- The day's record ---------- */

const DAILY_KEY = "gospel-focus:wordle:v2";

/**
 * A stored game, checked enough to trust: a real answer on the day, a chapter
 * to show for it, the verse it hides in, and no more guesses than the board has
 * rows. Every guess is the answer's length, so a board cannot be half one size
 * and half another.
 */
function parseGame(value: unknown): SavedGame | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SavedGame>;
  const answer = asWord(candidate.answer);
  if (!answer) return null;
  if (candidate.mode !== "daily" && candidate.mode !== "practice") return null;
  if (typeof candidate.day !== "string" || !candidate.day) return null;
  if (typeof candidate.reference !== "string" || !candidate.reference) return null;
  if (typeof candidate.verse !== "string" || !candidate.verse) return null;
  const verseNumber = candidate.verseNumber;
  if (typeof verseNumber !== "number" || !Number.isInteger(verseNumber) || verseNumber < 1) {
    return null;
  }
  if (typeof candidate.href !== "string" || !candidate.href) return null;
  if (!Array.isArray(candidate.guesses)) return null;

  const guesses: string[] = [];
  for (const entry of candidate.guesses.slice(0, MAX_GUESSES)) {
    const guess = asWord(entry, answer.length);
    if (!guess) return null;
    guesses.push(guess);
  }

  return {
    mode: candidate.mode,
    day: candidate.day,
    answer,
    reference: candidate.reference,
    verse: candidate.verse,
    verseNumber,
    href: candidate.href,
    guesses,
  };
}

let cache: SavedGame | null | undefined;
/** The practice board, kept in memory only: reloading returns to the daily. */
let practice: SavedGame | null = null;
let activeMode: GameMode = "daily";
let listening = false;
const listeners = new Set<() => void>();

function stored(): string | null {
  try {
    return window.localStorage.getItem(DAILY_KEY);
  } catch {
    return null;
  }
}

/** Today's game, or null when the day has none yet. */
function read(): SavedGame | null {
  if (cache !== undefined) return cache;
  if (typeof window === "undefined") return null;

  let game: SavedGame | null = null;
  try {
    const raw = stored();
    game = raw ? parseGame(JSON.parse(raw)) : null;
  } catch {
    game = null;
  }
  // Yesterday's board is not today's. Kept in storage rather than cleared, so a
  // clock that is set back a day finds its own game again.
  cache = game && game.mode === "daily" && game.day === dayKey() ? game : null;
  return cache;
}

/** The board the page is showing: the practice one if it was started. */
function readActive(): SavedGame | null {
  return activeMode === "practice" && practice ? practice : read();
}

function notify(): void {
  for (const listener of listeners) listener();
}

function write(game: SavedGame): void {
  cache = game;
  try {
    window.localStorage.setItem(DAILY_KEY, JSON.stringify(game));
  } catch {
    // Storage can be unavailable — the day can still be played, it just won't
    // be remembered.
  }
  notify();
}

function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== DAILY_KEY && event.key !== STATS_KEY && event.key !== null) return;
    // A cleared store (`key === null`) takes both records with it.
    if (event.key !== STATS_KEY) cache = undefined;
    if (event.key !== DAILY_KEY) statsRecord = null;
    notify();
  });
}

/**
 * Today's game as it is on disk right now, ignoring this tab's cache.
 *
 * The page derives a puzzle asynchronously, and a second tab or an early
 * attempt can pin one while this one is still thinking. Reading the cache here
 * would miss that write and, worse, overwrite it — including a board that has
 * already been played. So the check before pinning goes to storage.
 */
function readStored(): SavedGame | null {
  try {
    const raw = stored();
    return raw ? parseGame(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * Pin today's puzzle and its empty board, unless today already has one.
 *
 * A game found on disk is adopted rather than replaced: another tab may have
 * pinned it, or this one may be re-running the derivation after a storage
 * event, and either way the board the reader can see is the one to keep.
 */
export function startGame(puzzle: Puzzle): void {
  const current = readStored();
  if (current && current.mode === "daily" && current.day === puzzle.day) {
    cache = current;
    activeMode = "daily";
    notify();
    return;
  }
  activeMode = "daily";
  write({ ...puzzle, mode: "daily", guesses: [] });
}

/** Switch the page to a fresh puzzle, leaving the day's board untouched. */
export function startPractice(puzzle: Puzzle): void {
  activeMode = "practice";
  practice = { ...puzzle, mode: "practice", guesses: [] };
  notify();
}

/** Put the day's board back after a practice round. */
export function resumeDaily(): void {
  activeMode = "daily";
  practice = null;
  notify();
}

/**
 * Record one guess on the board in play.
 *
 * The page is the one that knows whether a guess is a word; this only refuses
 * what the board itself cannot hold — the wrong length, or a seventh guess.
 */
export function addGuess(guess: string): void {
  const game = readActive();
  if (!game || isOver(game)) return;
  const word = guess.toLowerCase();
  if (word.length !== game.answer.length) return;
  if (game.guesses.length >= MAX_GUESSES) return;
  if (game.guesses.includes(word)) return;

  const next = { ...game, guesses: [...game.guesses, word] };
  if (game.mode === "practice") {
    practice = next;
    notify();
    return;
  }
  // Only the day's own board counts: a practice round is unlimited, and the
  // record the stats page shows is of days, not of taps.
  if (word === game.answer) recordSolved(game.day);
  write(next);
}

/** ---------- The record across days ---------- */

/** What the daily puzzle has earned over time: the stats page's own line. */
export interface PuzzleStats {
  /** Daily boards solved, in all. A practice round never counts. */
  solved: number;
}

const STATS_KEY = "gospel-focus:wordle:stats:v1";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY_STATS: PuzzleStats = { solved: 0 };

/** The stored side: the total, and the day it was last raised for. */
interface StatsRecord {
  solved: number;
  last: string;
}

let statsRecord: StatsRecord | null = null;
let statsSnapshot: PuzzleStats = EMPTY_STATS;

function readStats(): StatsRecord {
  if (statsRecord) return statsRecord;
  if (typeof window === "undefined") return { solved: 0, last: "" };

  let record: StatsRecord = { solved: 0, last: "" };
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<StatsRecord> | null) : null;
    if (value && typeof value === "object") {
      const solved = Number(value.solved);
      record = {
        solved: Number.isFinite(solved) && solved > 0 ? Math.round(solved) : 0,
        last: typeof value.last === "string" ? value.last : "",
      };
    }
  } catch {
    // A corrupt record starts again from nothing rather than costing the
    // reader the board they are on.
  }
  statsRecord = record;
  return record;
}

/**
 * Add one to the count, once per day's board.
 *
 * The day is kept with the number so a re-solve cannot count twice: a board
 * whose write to storage failed can be played again after a reload, and the
 * tile should read the number of days the word was found, not the number of
 * times it was typed.
 */
function recordSolved(day: string): void {
  const record = readStats();
  if (record.last === day) return;
  const next: StatsRecord = { solved: record.solved + 1, last: day };
  statsRecord = next;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // The solve still counts for this visit; only the record is lost.
  }
}

/** Publish a stable snapshot: the reader's hook must not re-render on every read. */
function readPuzzleStats(): PuzzleStats {
  const record = readStats();
  if (statsSnapshot.solved !== record.solved) statsSnapshot = { solved: record.solved };
  return statsSnapshot;
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Today's game, or null until the page has pinned one. */
export function useDailyGame(): SavedGame | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** The daily puzzle's record across days. Empty on the server. */
export function usePuzzleStats(): PuzzleStats {
  return useSyncExternalStore(subscribe, readPuzzleStats, () => EMPTY_STATS);
}

/** The board on screen: the daily until the reader starts a practice round. */
export function useGame(): SavedGame | null {
  return useSyncExternalStore(subscribe, readActive, () => null);
}

/**
 * The letters of one guess for a screen reader: "3 right, 1 elsewhere" rather
 * than a grid of coloured squares it cannot see.
 */
export function describeGuess(answer: string, guess: string): string {
  const marks = scoreGuess(answer, guess);
  const right = marks.filter((mark) => mark === "correct").length;
  const elsewhere = marks.filter((mark) => mark === "present").length;
  const wrong = marks.filter((mark) => mark === "absent").length;
  const parts = [
    right ? `${right} in the right place` : null,
    elsewhere ? `${elsewhere} elsewhere in the word` : null,
    wrong ? `${wrong} not in the word` : null,
  ].filter(Boolean);
  return `${guess.toUpperCase()}: ${parts.join(", ")}`;
}
