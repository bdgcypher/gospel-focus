import type { Passage, Verse } from "./types";
import type { Random } from "./daily";

/**
 * The scripture word-search: the passage's own significant words, hidden in a
 * letter grid.
 *
 * Three things live here and nothing draws a cell: which words of a passage are
 * worth hiding, how a grid is built around them, and which cells a drag from one
 * square to another covers. The page is the only thing that knows what a cell or
 * a word chip looks like, which is what keeps the rules readable and the game's
 * behaviour the same however it is driven.
 *
 * The words are *found*, not listed by hand. A passage is drawn with the same
 * picker as the reader's, and its words are read out of the text the draw landed
 * on — so the grid always belongs to the passage on the page, and there is no
 * word list to keep in step with the library. A verse with too few substantial
 * words borrows from its own chapter, because a one-line verse ("And it came to
 * pass") cannot fill a grid and the chapter around it says what it is about.
 *
 * Placement is random and so is the grid's padding, but neither is stored: a
 * grid is built when a passage is drawn and lives only while it is on screen.
 * That is what "a fresh grid for every passage you draw" means here.
 */

/** One cell of the grid, in reading order, as an index into `grid`. */
export type CellIndex = number;

export interface Placement {
  /** Lowercase; the grid prints it in capitals. */
  word: string;
  /** The cells it occupies, first letter first. */
  path: CellIndex[];
}

export interface WordSearchPuzzle {
  size: number;
  /** `size * size` letters, row-major, uppercase. */
  grid: string[];
  words: Placement[];
  /** The chapter the words came from. */
  reference: string;
  /** The verse (or paragraph) the draw landed on. */
  verse: string;
  verseNumber: number | null;
  /** Where the reader opens that chapter. */
  href: string;
  /**
   * The passage the grid was built from, kept whole so the page can print the
   * chapter or talk beside the board. Nothing stores a grid, so this costs no
   * storage — and the page already holds the passage while it builds the words.
   */
  passage: Passage;
}

/** Ten by ten: the longest word we hide fits, and a phone still gets big cells. */
export const GRID_SIZE = 10;
/** How many words a grid hides. */
export const WORD_COUNT = 6;
/** Below this a grid is not a game, it is a hunt for two words. */
export const MIN_WORDS = 3;

const MIN_WORD_LENGTH = 3;
/** Anything longer cannot be placed in a ten-wide grid without a scrollbar. */
const MAX_WORD_LENGTH = GRID_SIZE - 1;

/**
 * The words that carry no meaning to look for.
 *
 * Kept short and English-function-word-shaped on purpose: this is a list of
 * words a reader would be annoyed to hunt for, not a linguistic stopword list.
 * It includes the King James glue words (*ye*, *thou*, *hath*) because the
 * corpus is full of them and they are the ones that would otherwise fill half a
 * grid with things nobody wants to find.
 */
const STOPWORDS = new Set([
  "a", "about", "after", "again", "against", "all", "also", "am", "among", "an",
  "and", "any", "are", "as", "at", "be", "because", "been", "before", "behold",
  "being", "between", "both", "but", "by", "came", "can", "come", "did", "do",
  "does", "done", "down", "each", "even", "ever", "every", "for", "from", "had",
  "hath", "have", "he", "her", "here", "him", "his", "how", "i", "if", "in",
  "into", "is", "it", "its", "let", "like", "made", "make", "many", "may", "me",
  "might", "more", "most", "much", "my", "neither", "no", "nor", "not", "now",
  "of", "off", "on", "one", "only", "or", "other", "our", "out", "over", "own",
  "said", "same", "saith", "shall", "she", "should", "so", "some", "such",
  "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "thine", "this", "those", "thou", "though", "through", "thy", "to", "too",
  "under", "until", "unto", "up", "upon", "us", "very", "was", "we", "were",
  "what", "when", "where", "which", "while", "who", "whom", "why", "will",
  "with", "would", "ye", "yet", "you", "your",
]);

const tokens = (text: string): string[] =>
  [...text.matchAll(/[A-Za-z]+/g)].map((match) => match[0].toLowerCase());

/** A word worth hiding: a whole word, long enough to see, not glue. */
const isCandidate = (word: string) =>
  word.length >= MIN_WORD_LENGTH &&
  word.length <= MAX_WORD_LENGTH &&
  !STOPWORDS.has(word);

/**
 * The words a grid hides, best first.
 *
 * The drawn passage's own text is the source: longer words first, because they
 * are the ones worth finding, then words it repeats, then alphabetical order so
 * two draws of the same verse agree. Staying inside that one verse is also what
 * lets the finish card mark every word in the passage it came from — a word
 * borrowed from a neighbouring verse would have nothing to be marked in.
 *
 * A verse with fewer than `MIN_WORDS` candidates cannot fill a board at all
 * ("And it came to pass" is one word, *came*), so only then does the chapter
 * around it make up the difference at a fraction of the weight. That is a rare
 * board, and the reader is sent to the chapter anyway.
 */
export function keyWords(passage: Passage, count: number = WORD_COUNT): string[] {
  const score = (text: string, weight: number, into: Map<string, number>) => {
    for (const word of tokens(text)) {
      if (!isCandidate(word)) continue;
      into.set(word, (into.get(word) ?? 0) + weight + Math.min(2, word.length - MIN_WORD_LENGTH) * 0.1);
    }
  };

  const own = new Map<string, number>();
  score(passage.text, 4, own);
  if (own.size >= MIN_WORDS) return rank(own).slice(0, count);

  const combined = new Map(own);
  const others: Verse[] = passage.verses ?? [];
  for (const verse of others) {
    if (verse.text === passage.text) continue;
    score(verse.text, 1, combined);
  }
  return rank(combined).slice(0, count);
}

/** Best first: score, then length, then alphabetical, so a draw is repeatable. */
function rank(scored: Map<string, number>): string[] {
  return [...scored.entries()]
    .sort(([a, aScore], [b, bScore]) => {
      if (bScore !== aScore) return bScore - aScore;
      if (b.length !== a.length) return b.length - a.length;
      return a.localeCompare(b);
    })
    .map(([word]) => word);
}

/** The eight ways a word can lie in a grid, as row/column steps. */
const DIRECTIONS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [-1, 1],
];

const rowOf = (index: CellIndex, size: number) => Math.floor(index / size);
const colOf = (index: CellIndex, size: number) => index % size;

/**
 * Where `word` fits, or null.
 *
 * A word may cross cells already holding the same letter — that is what makes a
 * grid read as a word-search rather than a set of separate puzzles — but never a
 * cell holding a different one. The first fit found is kept; with two hundred
 * tries behind it, a word that cannot be placed is a word this grid is too full
 * for, and the next word gets the room.
 */
function tryPlace(
  grid: (string | null)[],
  word: string,
  size: number,
  random: Random
): CellIndex[] | null {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const [dr, dc] = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)];
    const length = word.length;
    // Start anywhere the word can finish, walking backwards from the far edge.
    const rowSpan = (length - 1) * dr;
    const colSpan = (length - 1) * dc;
    const rowMin = dr < 0 ? -rowSpan : 0;
    const rowMax = size - 1 - (dr > 0 ? rowSpan : 0);
    const colMin = dc < 0 ? -colSpan : 0;
    const colMax = size - 1 - (dc > 0 ? colSpan : 0);
    if (rowMax < rowMin || colMax < colMin) continue;

    const row = rowMin + Math.floor(random() * (rowMax - rowMin + 1));
    const col = colMin + Math.floor(random() * (colMax - colMin + 1));

    const path: CellIndex[] = [];
    let fits = true;
    for (let i = 0; i < length; i += 1) {
      const index = (row + dr * i) * size + (col + dc * i);
      const held = grid[index];
      if (held !== null && held !== word[i]) {
        fits = false;
        break;
      }
      path.push(index);
    }
    if (fits) return path;
  }
  return null;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Build a grid around a passage's words.
 *
 * Words are placed longest first, because the longest word has the fewest homes
 * and every later word can still fit around it. Anything that will not fit is
 * dropped rather than forced, and a grid that cannot hold `MIN_WORDS` is not a
 * game: the caller gets an error instead of a board with one word on it.
 */
export function buildPuzzle(passage: Passage, random: Random = Math.random): WordSearchPuzzle {
  const size = GRID_SIZE;
  const words = keyWords(passage);
  const grid: (string | null)[] = new Array(size * size).fill(null);
  const placements: Placement[] = [];

  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    const path = tryPlace(grid, word, size, random);
    if (!path) continue;
    for (let i = 0; i < word.length; i += 1) grid[path[i]] = word[i].toUpperCase();
    placements.push({ word, path });
  }

  if (placements.length < MIN_WORDS) {
    throw new Error("This passage has too few words for a grid.");
  }

  // The empty cells are filled from the letters the words already use, so the
  // board reads as one alphabet rather than as noise around the answers.
  const pool = [...new Set(placements.flatMap((placement) => [...placement.word.toUpperCase()]))];
  const filled = grid.map((letter) =>
    letter ?? pool[Math.floor(random() * pool.length)] ?? LETTERS[Math.floor(random() * LETTERS.length)]
  );

  return {
    size,
    grid: filled,
    words: placements,
    reference: passage.expansionTitle ?? passage.reference,
    verse: passage.text,
    verseNumber: passage.highlightVerse ?? passage.section ?? null,
    href: readerHref(passage),
    passage,
  };
}

/**
 * The reader's link back to the chapter a grid came from, with the drawn verse
 * highlighted. Built the same way the puzzle's own card builds it, so the link
 * lands the reader where the draw was rather than at the chapter's first verse.
 */
function readerHref(passage: Passage): string {
  if (passage.kind === "scripture" && passage.book && passage.chapter) {
    const params = new URLSearchParams({
      action: "cite",
      kind: "scripture",
      book: passage.book,
      chapter: passage.chapter,
      section: String(passage.section ?? 1),
    });
    return `/read?${params.toString()}`;
  }
  return passage.url;
}

/**
 * The cells a straight drag from `from` to `to` covers, or null.
 *
 * Word-search selections run in eights: across, down, and the two diagonals,
 * forwards or backwards. A drag that does not land on one of them covers
 * nothing, which is what lets the page show the reader a straight line forming
 * as they drag rather than a trail of squares.
 */
export function lineBetween(size: number, from: CellIndex, to: CellIndex): CellIndex[] | null {
  if (from === to) return [from];
  // The distances, not their signs: a drag of nine rows and four columns is a
  // steep diagonal that is not one of the eight, and comparing signs would let
  // it through — the line would then step four columns across every nine rows
  // and wander off the row it started on, which is a selection no word can sit
  // on and cells the reader never touched.
  const rows = rowOf(to, size) - rowOf(from, size);
  const columns = colOf(to, size) - colOf(from, size);
  // A knight's move, a bent drag, or anything else that is not one of the
  // eight directions: no word can run along it.
  if (rows !== 0 && columns !== 0 && Math.abs(rows) !== Math.abs(columns)) return null;

  const dr = Math.sign(rows);
  const dc = Math.sign(columns);
  const steps = Math.max(Math.abs(rows), Math.abs(columns));
  const path: CellIndex[] = [];
  for (let i = 0; i <= steps; i += 1) {
    path.push((rowOf(from, size) + dr * i) * size + (colOf(from, size) + dc * i));
  }
  return path;
}

/** The letters a selection spells, in the order the drag covered them. */
export function spell(grid: string[], path: CellIndex[]): string {
  return path.map((cell) => grid[cell] ?? "").join("");
}

/**
 * The word a selection spells, if it spells one of the grid's.
 *
 * Marked by what the letters say rather than by which cells the word was first
 * placed on. Two words can cross in a grid — and a word can appear in the pads
 * by accident — so a reader who traces a listed word over a second set of cells
 * has still found it, and is marked as having found it. The reported word is the
 * placement (the list entry); the page keeps the cells the reader actually used
 * for the highlight.
 */
export function wordAt(grid: string[], words: Placement[], path: CellIndex[]): Placement | null {
  const spelled = spell(grid, path).toLowerCase();
  const backwards = [...spelled].reverse().join("");
  return words.find((placement) => placement.word === spelled || placement.word === backwards) ?? null;
}
