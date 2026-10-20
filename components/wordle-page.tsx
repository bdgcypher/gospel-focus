"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FeaturePage } from "./feature-page";
import { Glyph } from "./glyph";
import { PassagePanel } from "./passage-panel";
import { useResultHaptics } from "@/lib/haptics";
import { resolveCitation } from "@/lib/picker";
import { setPreference, usePreferences } from "@/lib/preferences";
import { useRevealDelay } from "@/lib/reveal";
import type { Passage } from "@/lib/types";
import {
  MAX_GUESSES,
  MAX_WORD_LENGTH,
  addGuess,
  createDailyPuzzle,
  createPracticePuzzle,
  describeGuess,
  isOver,
  isSolved,
  letterStates,
  loadWordList,
  scoreGuess,
  startGame,
  startPractice,
  useDailyGame,
  useGame,
  type LetterState,
  type SavedGame,
  type WordList,
} from "@/lib/wordle";

/**
 * How long a row takes to turn over: one tile's own turn, plus the stagger the
 * last column waits for the first. The finish card waits for both, so the row
 * that ended the round is read before the card covers it (lib/reveal.ts).
 */
const TILE_FLIP_MS = 320;
const TILE_STAGGER_MS = 60;

/** When the last tile of a row has come to rest, for a word of `length` letters. */
const revealMs = (length: number) => TILE_FLIP_MS + Math.max(0, length - 1) * TILE_STAGGER_MS;

/**
 * The daily word puzzle.
 *
 * The board is the page, in the shape the game is known by: six rows, four to
 * six tiles wide, and a keyboard under the thumb. The chapter is not printed
 * here — only its reference, which is a link into the reader — because the word
 * is hidden anywhere in that chapter, and the reader is where it can be read.
 * Keeping the text off this page also keeps the board above the fold on a
 * phone, which is where the game is actually played.
 *
 * Everything the page shows is derived from the day: the chapter, the word, and
 * the board's width (lib/wordle.ts). Nothing here decides anything the store
 * can't check — a guess arrives through the same `addGuess` whether it came from
 * the on-screen keys or a physical keyboard, so the two can't drift.
 *
 * The day's game is pinned to storage the first time it is opened, so a reader
 * who changes their filters at lunchtime does not lose the morning's guesses,
 * and coming back tomorrow starts a new board without anything having to be
 * cleared. A practice round ("Play again" on the result card) is a separate
 * board in memory, so it never costs the reader the day's score.
 */
export function WordlePage() {
  const preferences = usePreferences();
  const daily = useDailyGame();
  const game = useGame();
  const [words, setWords] = useState<WordList | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [starting, setStarting] = useState(false);
  /** The result card the reader has already closed, by game and progress. */
  const [dismissed, setDismissed] = useState<string | null>(null);
  /**
   * The rules card: shown by itself the first time this device opens the
   * board, and by the "How to play" button whenever it is wanted again. Being
   * shown once is recorded in preferences, so it greets a reader rather than
   * interrupting every morning.
   */
  const [helpOpen, setHelpOpen] = useState(false);
  /** Whether the chapter the day's word hides in is showing beside the board. */
  const [chapterOpen, setChapterOpen] = useState(false);
  /**
   * The chapter fetched for the panel, with the citation it belongs to. The key
   * is the puzzle's reference and verse, so a practice round fetches its own
   * chapter instead of showing the daily one's.
   */
  const [chapter, setChapter] = useState<{
    key: string;
    passage: Passage | null;
    error: boolean;
  } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 1900);
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // Opened from a frame callback rather than the effect's own body, so the
  // first paint is the board and the card arrives over it — and so a device
  // that has read the card before never sees it flash open.
  useEffect(() => {
    if (preferences.wordleHelpSeen) return;
    const frame = requestAnimationFrame(() => setHelpOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [preferences.wordleHelpSeen]);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    if (!preferences.wordleHelpSeen) setPreference("wordleHelpSeen", true);
  }, [preferences.wordleHelpSeen]);

  /**
   * The vocabulary, read once: it both builds the puzzle and checks guesses.
   * `attempt` is the retry button's only state — the fetch itself is cached in
   * lib/wordle.ts until it fails.
   */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadWordList()
      .then((list) => {
        if (live) setWords(list);
      })
      .catch(() => {
        if (live) setFailure("The word list didn't load. Check your connection and try again.");
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setFailure(null);
    setAttempt((n) => n + 1);
  };

  /**
   * Pin today's puzzle once the words are here. `startGame` is a no-op when a
   * game is already pinned, which is what makes this safe to run again after a
   * storage event or a re-render.
   */
  useEffect(() => {
    if (daily || !words || failure) return;
    let live = true;
    createDailyPuzzle(preferences.filters)
      .then((puzzle) => {
        if (live) startGame(puzzle);
      })
      .catch(() => {
        if (live) {
          setFailure(
            "Today's chapter couldn't be drawn. Check that at least one book of scripture is switched on in the reader."
          );
        }
      });
    return () => {
      live = false;
    };
  }, [daily, words, failure, preferences.filters]);

  const guesses = game?.guesses ?? [];
  const wordLength = game?.answer.length ?? MAX_WORD_LENGTH;
  const over = game ? isOver(game) : false;
  const solved = game ? isSolved(game) : false;
  const states = game ? letterStates(game.answer, game.guesses) : {};
  const resultKey = game ? `${game.mode}:${game.day}:${game.guesses.length}` : "";
  // The card waits for the last guess's tiles to finish turning over, and its
  // haptics with it, since they play when the card mounts (lib/haptics.ts).
  const revealDone = useRevealDelay(
    game && over ? resultKey : null,
    preferences.reduceMotion ? 0 : revealMs(wordLength)
  );
  const showResult = Boolean(game && over && dismissed !== resultKey && revealDone);
  const closeResult = useCallback(() => setDismissed(resultKey), [resultKey]);

  /**
   * The chapter the board is about, fetched the first time the passage is
   * opened. The puzzle names its chapter the way the reader does (“1 Nephi 3”)
   * and the verse the word hides in, so the panel shows the reader's own text
   * rather than a copy kept in storage. Keyed by citation, so a practice round
   * fetches its own chapter instead of showing the day's.
   */
  const chapterKey = game ? `${game.reference}|${game.verseNumber}` : null;
  const shownChapter = chapter && chapter.key === chapterKey ? chapter : null;
  const chapterLoading = chapterOpen && Boolean(chapterKey) && !shownChapter;

  useEffect(() => {
    if (!chapterOpen || !game || !chapterKey || shownChapter) return;
    let live = true;
    loadChapter(game.reference, game.verseNumber)
      .then((passage) => {
        if (live) setChapter({ key: chapterKey, passage, error: false });
      })
      .catch(() => {
        if (live) setChapter({ key: chapterKey, passage: null, error: true });
      });
    return () => {
      live = false;
    };
  }, [chapterOpen, game, chapterKey, shownChapter]);

  const letter = useCallback(
    (key: string) => {
      if (!game || over) return;
      setDraft((current) => (current.length < wordLength ? current + key : current));
    },
    [game, over, wordLength]
  );

  const erase = useCallback(() => setDraft((current) => current.slice(0, -1)), []);

  const submit = useCallback(() => {
    if (!game || !words || over) return;
    const guess = draft.toLowerCase();
    if (guess.length < wordLength) {
      flash("Not enough letters.");
      return;
    }
    // The answer is always in the list by construction, but a build whose word
    // list and puzzle disagree must not make a solvable puzzle unsolvable.
    if (!words.guesses.has(guess)) {
      flash("Not a word from the library.");
      return;
    }
    if (game.guesses.includes(guess)) {
      flash("Already guessed.");
      return;
    }
    setDraft("");
    addGuess(guess);
    setAnnouncement(describeGuess(game.answer, guess));
  }, [draft, flash, game, over, wordLength, words]);

  /**
   * A new puzzle from a random chapter. The daily board stays where it is, so
   * playing again after the day is done costs nothing, and the reader can come
   * back to it from the line under the intro.
   */
  const playAgain = useCallback(async () => {
    if (!words) return;
    setStarting(true);
    try {
      const puzzle = await createPracticePuzzle(preferences.filters);
      setDraft("");
      setAnnouncement("");
      startPractice(puzzle);
    } catch {
      flash("Couldn't draw a new chapter. Check that a book of scripture is switched on.");
    } finally {
      setStarting(false);
    }
  }, [flash, preferences.filters, words]);

  // The physical keyboard is the same input as the on-screen one. Modifier
  // chords are left alone so the usual browser and OS shortcuts still work.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The rules card and the chapter take the keys while they are up: a
      // reader reading either is not typing a guess at the board behind them.
      if (helpOpen || chapterOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        erase();
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        letter(event.key.toLowerCase());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, erase, letter, helpOpen, chapterOpen]);

  const current = game && !over ? guesses.length : -1;

  return (
    <FeaturePage featureId="wordle" subtitle="">
      <div className="mx-auto w-full max-w-md">
        <div
          className="mt-4 flex flex-col gap-1.5"
          aria-hidden="true"
          style={{ perspective: "800px" }}
        >
          {Array.from({ length: MAX_GUESSES }, (_, row) => {
            const guess = guesses[row];
            const marks = guess && game ? scoreGuess(game.answer, guess) : null;
            return (
              // The row is keyed by its guess, so committing one remounts the
              // row and the tiles turn over; the empty row underneath keeps its
              // key while letters are typed, and so does not re-animate.
              <div
                key={`${row}-${guess ?? "open"}`}
                className="grid justify-center gap-1.5"
                // One tile size for every answer: a track is always a sixth of
                // the full row, so a four- or five-letter board has the same
                // tiles as a six-letter one and simply sits centered. The rows
                // still line up, because `justify-center` centers each without
                // stretching its tracks.
                style={{ gridTemplateColumns: `repeat(${wordLength}, calc((100% - 1.875rem) / 6))` }}
              >
                {Array.from({ length: wordLength }, (_, col) => {
                  const value = guess?.[col] ?? (row === current ? (draft[col] ?? "") : "");
                  return (
                    <Tile
                      key={col}
                      letter={value}
                      mark={marks?.[col] ?? null}
                      reveal={Boolean(marks)}
                      delay={col * TILE_STAGGER_MS}
                      reduce={preferences.reduceMotion}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Directly under the grid, so the hint reads as part of the board and
            the gap below it belongs to the guesses, not to a heading. */}
        {game && <PassageHint game={game} onOpen={() => setChapterOpen(true)} />}

        {/* What the colours mean, for a reader who can't see them. */}
        <ol className="sr-only">
          {game?.guesses.map((guess, i) => (
            <li key={i}>{describeGuess(game.answer, guess)}</li>
          ))}
        </ol>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        <Keyboard states={states} disabled={!game || over} onLetter={letter} onEnter={submit} onErase={erase} />

        {/* Below the keys: it is feedback on a guess, and the board says what
            it needs to whether or not there is anything to report. */}
        <p
          role="status"
          aria-live="polite"
          className="mt-3 min-h-5 text-center text-sm text-foreground/85"
        >
          {notice ?? failure ?? (!game ? "Finding today's chapter…" : "")}
        </p>

        {/* The card greets a device once; this is the way back to it. */}
        <div className="mt-1 text-center">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="text-xs font-medium text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent-strong"
          >
            How to play
          </button>
        </div>

        {failure && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
            >
              Try again
            </button>
          </div>
        )}

        {game && over && (
          <div className="mt-5 rounded-2xl border border-border bg-surface p-4 text-center">
            <p className="font-serif text-base font-semibold text-accent-strong">
              Come back tomorrow to guess the new daily word!
            </p>
            {solved && (
              <p className="mt-1 text-sm text-muted">
                You found it in {guesses.length} of {MAX_GUESSES}.
              </p>
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={playAgain}
                disabled={starting || !words}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
              >
                {starting ? "Finding a chapter…" : "Play again"}
              </button>
            </div>
          </div>
        )}
      </div>

      {chapterOpen && game && (
        <PassagePanel
          open
          onClose={() => setChapterOpen(false)}
          title={game.reference}
          subtitle={shownChapter?.passage?.expansionSubtitle}
          // No verse marked: the panel is the chapter to hunt through, and a
          // highlight would point at the answer's verse.
          verses={shownChapter?.passage?.verses ?? null}
          loading={chapterLoading}
          error={
            shownChapter?.error
              ? "This chapter couldn't be loaded. Check your connection and try again."
              : null
          }
        />
      )}

      {helpOpen && <HelpDialog onClose={closeHelp} />}

      {game && showResult && (
        <ResultDialog
          game={game}
          solved={solved}
          busy={starting}
          onClose={closeResult}
          onPlayAgain={playAgain}
        />
      )}
    </FeaturePage>
  );
}

/** One letter of the board. */
function Tile({
  letter,
  mark,
  reveal,
  delay,
  reduce,
}: {
  letter: string;
  mark: LetterState | null;
  /** Whether this tile's marking has been settled by a guess. */
  reveal: boolean;
  /** Milliseconds this column waits for the ones before it. */
  delay: number;
  reduce: boolean;
}) {
  const tone = mark ? TONES[mark] : letter ? "border-border bg-surface text-foreground" : "border-border bg-surface/60";
  return (
    <motion.span
      initial={reveal && !reduce ? { rotateX: 90, opacity: 0.6 } : false}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ duration: TILE_FLIP_MS / 1000, delay: delay / 1000 }}
      className={`grid aspect-square place-items-center rounded-lg border font-serif text-xl font-semibold uppercase shadow-[0_10px_24px_-22px_rgba(0,0,0,0.8)] sm:text-2xl ${
        // An empty slot stays flat; a tile with a letter is a piece in the
        // playful skin (see `.puzzle-tile` in globals.css).
        letter ? "puzzle-tile" : ""
      } ${tone}`}
    >
      {letter}
    </motion.span>
  );
}

const TONES: Record<LetterState, string> = {
  correct: "border-correct bg-correct text-correct-contrast",
  present: "border-present bg-present text-present-contrast",
  absent: "border-border bg-surface-2 text-muted",
};

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** The keys, marked with the best each letter has earned. */
function Keyboard({
  states,
  disabled,
  onLetter,
  onEnter,
  onErase,
}: {
  states: Record<string, LetterState>;
  disabled: boolean;
  onLetter: (letter: string) => void;
  onEnter: () => void;
  onErase: () => void;
}) {
  return (
    <div role="group" className="mt-4 flex flex-col gap-1.5" aria-label="Keyboard">
      {KEY_ROWS.map((row, index) => (
        <div key={row} className="flex justify-center gap-1">
          {index === 2 && (
            <Key label="Enter" wide disabled={disabled} onClick={onEnter}>
              <Glyph name="return" className="mx-auto h-5 w-5" />
            </Key>
          )}
          {[...row].map((letter) => (
            <Key
              key={letter}
              label={letter.toUpperCase()}
              mark={states[letter] ?? null}
              disabled={disabled}
              onClick={() => onLetter(letter)}
            >
              {letter.toUpperCase()}
            </Key>
          ))}
          {index === 2 && (
            <Key label="Backspace" wide disabled={disabled} onClick={onErase}>
              <Glyph name="backspace" className="mx-auto h-5 w-5" />
            </Key>
          )}
        </div>
      ))}
    </div>
  );
}

function Key({
  children,
  label,
  mark = null,
  wide = false,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  mark?: LetterState | null;
  wide?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone = mark ? TONES[mark] : "border-border bg-surface text-foreground";
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`puzzle-key grid h-11 min-w-0 flex-1 place-items-center rounded-lg border text-sm font-semibold uppercase transition-colors disabled:opacity-60 sm:h-12 ${
        wide ? "flex-[1.6]" : ""
      } ${tone}`}
    >
      {children}
    </button>
  );
}

/**
 * The chapter the word is hiding in, as one line under the board.
 *
 * A hint rather than a card: "Hint:" and the chapter's reference, linked into
 * the reader. No icon, no verse text, and no box around it — the board is the
 * page, and this is the one line that says where to read.
 */
function PassageHint({ game, onOpen }: { game: SavedGame; onOpen: () => void }) {
  return (
    <p className="mt-3 text-center text-sm text-muted">
      <span className="font-semibold text-foreground">Hint:</span>{" "}
      {/* A button, not a link: the chapter opens beside the board, so a reader
          checking a hunch keeps their place and their guesses. */}
      <button
        type="button"
        onClick={onOpen}
        className="text-accent-strong underline decoration-accent/50 underline-offset-4 transition-colors hover:decoration-accent-strong"
      >
        {game.reference}
      </button>
    </p>
  );
}

/**
 * The chapter a puzzle's reference names: “1 Nephi 3” is the book up to the
 * last space and the chapter after it, which is the label the reader prints.
 * Cached by reference — the picker keeps the volume files, so this only spares
 * the walk back through them when the panel is closed and opened again.
 */
const chapters = new Map<string, Passage>();

async function loadChapter(reference: string, verse: number): Promise<Passage> {
  const known = chapters.get(reference);
  if (known) return known;

  const cut = reference.lastIndexOf(" ");
  const passage = await resolveCitation(
    "scripture",
    reference.slice(0, cut),
    reference.slice(cut + 1),
    verse
  );
  if (!passage) throw new Error(`No chapter for ${reference}`);
  chapters.set(reference, passage);
  return passage;
}

/**
 * The three example rows the rules card teaches with: one green letter in its
 * right spot, one gold letter in the word but misplaced, one grey letter the
 * word does not hold. Each row marks a single tile and explains it underneath,
 * which is the whole rule — the board itself is only these three states.
 */
const HELP_ROWS: { word: string; marked: number; state: LetterState; letter: string; where: string }[] = [
  { word: "FAITH", marked: 0, state: "correct", letter: "F", where: "in the word and in the right spot" },
  { word: "GRACE", marked: 2, state: "present", letter: "A", where: "in the word but in the wrong spot" },
  { word: "PSALM", marked: 3, state: "absent", letter: "L", where: "not in the word at all" },
];

/**
 * The rules card, over the board the first time the puzzle is opened.
 *
 * It is the reference board's three colour samples, in this app's palette, so
 * the markings a guess earns are explained before the first guess earns any.
 * The rows are decorative — each caption says the same thing in words — and
 * the card is recorded in preferences once shown, so it is a greeting rather
 * than a daily interruption. "How to play" under the board brings it back.
 * Escape, the close button, or a tap on the backdrop put it away.
 */
function HelpDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wordle-help-title"
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="wordle-help-title" className="font-serif text-2xl font-semibold text-foreground">
            How To Play
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-muted">
          The word is hidden somewhere in today&apos;s chapter. There is a new word daily.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          {HELP_ROWS.map((row) => (
            <div key={row.word}>
              <div className="grid grid-cols-5 gap-1.5" aria-hidden="true">
                {[...row.word].map((letter, index) => (
                  <span
                    key={`${row.word}-${index}`}
                    className={`puzzle-tile grid aspect-square place-items-center rounded-lg border font-serif text-xl font-semibold uppercase ${
                      index === row.marked
                        ? TONES[row.state]
                        : "border-border bg-surface text-foreground"
                    }`}
                  >
                    {letter}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                The letter <strong className="font-semibold text-foreground">{row.letter}</strong> is {""}
                {row.where}.
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-cta px-5 py-3 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}

/**
 * The result card, over the board once the last guess is in.
 *
 * It answers the two questions a finished board leaves: what the word was, and
 * where it was hiding. The verse is printed in full with the answer marked, so
 * the puzzle ends in the text rather than in a score, and "Play again" turns
 * the same board into a fresh random chapter. Escape, the close button, or a
 * tap on the backdrop put the board back without starting anything.
 */
function ResultDialog({
  game,
  solved,
  busy,
  onClose,
  onPlayAgain,
}: {
  game: SavedGame;
  solved: boolean;
  busy: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // The card's own fanfare, in the hand rather than on the screen: six beats
  // for the word, two for the near miss — played when the card opens, which is
  // once the last row has finished turning over.
  useResultHaptics(solved);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wordle-result-title"
        className={`max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border p-6 shadow-2xl outline-none ${
          solved
            ? "border-win-border bg-win-card text-win-ink"
            : "border-loss-border bg-loss-card text-loss-ink"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="wordle-result-title"
              className={`whitespace-nowrap font-serif text-2xl font-semibold ${
                solved ? "text-win-ink" : "text-loss-ink"
              }`}
            >
              {solved ? "Good Work!" : "Not Quite!"}{" "}
              <span aria-hidden="true">{solved ? "🎉" : "🫤"}</span>
            </h2>
            <p className={`mt-1 text-sm ${solved ? "text-win-muted" : "text-loss-muted"}`}>
              {solved ? (
                `Found in ${game.guesses.length} of ${MAX_GUESSES}.`
              ) : (
                <>
                  The word was{" "}
                  <span className="font-semibold text-loss-strong">
                    {game.answer.toUpperCase()}
                  </span>
                  .
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
              solved
                ? "text-win-muted hover:bg-win-border/40 hover:text-win-strong"
                : "text-loss-muted hover:bg-loss-border/40 hover:text-loss-strong"
            }`}
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`mt-4 rounded-2xl border p-4 ${
            solved ? "border-win-border bg-win-panel" : "border-loss-border bg-loss-panel"
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-wider ${
              solved ? "text-win-muted" : "text-loss-muted"
            }`}
          >
            {game.reference}:{game.verseNumber}
          </p>
          <p
            className={`mt-2 text-sm leading-relaxed ${
              solved ? "text-win-ink" : "text-loss-ink"
            }`}
          >
            <HighlightedVerse text={game.verse} word={game.answer} tone={solved ? "win" : "loss"} />
          </p>
        </div>

        <button
          type="button"
          onClick={onPlayAgain}
          disabled={busy}
          className={`mt-5 flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 ${
            solved
              ? "bg-win-bar text-win-bar-contrast"
              : "bg-loss-bar text-loss-bar-contrast"
          }`}
        >
          {busy ? "Finding a chapter…" : "Play again"}
        </button>
      </div>
    </div>,
    document.body
  );
}

/** The verse, with every whole-word match of the answer marked. */
function HighlightedVerse({
  text,
  word,
  tone,
}: {
  text: string;
  word: string;
  /** The card the verse sits on, so the mark is cut from its own ink. */
  tone: "win" | "loss";
}) {
  const pattern = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        part.toLowerCase() === word ? (
          <mark
            key={i}
            className={`result-mark rounded-[3px] px-0.5 font-semibold ${
              tone === "loss" ? "result-mark-loss" : ""
            }`}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
