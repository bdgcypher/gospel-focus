"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FeaturePage } from "./feature-page";
import { Glyph } from "./glyph";
import { PassagePanel } from "./passage-panel";
import {
  CROSS_OUT_MS,
  tapDirectionChange,
  tapLetter,
  tapLineMissed,
  tapWordFound,
  useResultHaptics,
} from "@/lib/haptics";
import { NoSourcesError, loadManifest, pickPassage } from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import { useRevealDelay } from "@/lib/reveal";
import {
  GRID_SIZE,
  buildPuzzle,
  lineBetween,
  wordAt,
  type CellIndex,
  type WordSearchPuzzle,
} from "@/lib/word-search";

/**
 * The Scripture word-search.
 *
 * The board is the page: a ten-by-ten letter grid with the passage's words
 * hidden in eight directions, and the words themselves listed above it so the
 * reader knows what they are looking for. Nothing about the puzzle is stored —
 * a passage is drawn with the reader's own filters, its words are read out of
 * that text, and the grid lives only while it is on screen, which is what
 * makes "a fresh grid for every passage you draw" literal.
 *
 * Selection is a drag: press a cell and the cells under the pointer form a
 * straight line from there, in any of the eight directions (lib/word-search.ts
 * decides which). A line that spells a listed word is kept and marked; anything
 * else is dropped, so the board never punishes a wrong guess with a record of
 * it. The same cells can be tapped one after another for a reader who cannot
 * drag, and focused cells answer to Enter.
 *
 * A finger is answered as it goes (lib/haptics.ts): a tick for each letter the
 * line reaches, a firmer one when it turns onto another line, two quick buzzes
 * for a line that spelled nothing, and the long stroke of the pen when one
 * does — for as long as the cross-out takes to draw. The board plays these
 * itself, and says so with `data-haptic="own"`, so the app's one press tick does
 * not double the first letter.
 */
export function WordSearchPage() {
  const preferences = usePreferences();
  const [puzzle, setPuzzle] = useState<WordSearchPuzzle | null>(null);
  /** Whether the passage beside the board is showing. */
  const [chapterOpen, setChapterOpen] = useState(false);
  const [found, setFound] = useState<Set<string>>(new Set());
  /** The cells each found word was traced over; a word can be traced twice. */
  const [foundPaths, setFoundPaths] = useState<Map<string, CellIndex[]>>(new Map());
  const [selection, setSelection] = useState<CellIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  /** The finish card the reader has already closed, so it stays closed. */
  const [resultDismissed, setResultDismissed] = useState(false);
  /** The cells of a selection that spelled nothing, lit red for a moment. */
  const [miss, setMiss] = useState<Set<CellIndex>>(new Set());

  const gridRef = useRef<HTMLDivElement>(null);
  /** Where every cell's centre sits inside the board, for the found-word lines. */
  const [geometry, setGeometry] = useState<{
    width: number;
    height: number;
    /** One cell's width, so the found-word lines can overshoot by a fraction. */
    cell: number;
    centres: Map<number, { x: number; y: number }>;
  } | null>(null);
  /** The cell a drag started on, or where a keyboard selection is waiting. */
  const anchor = useRef<CellIndex | null>(null);
  const dragging = useRef(false);
  /**
   * What the last move across the board drew: the line's direction and the
   * cells it covered. The next move is compared against it, so a finger is told
   * what changed — a letter reached, or a turn onto another line — rather than
   * buzzed for every pointer event a device happens to report.
   */
  const drag = useRef<{ direction: string | null; cells: CellIndex[] } | null>(null);
  /** Guards against a slow draw landing after a newer one has started. */
  const run = useRef(0);
  const noticeTimer = useRef<number | undefined>(undefined);
  const missTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2200);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimer.current);
      window.clearTimeout(missTimer.current);
    },
    []
  );

  /**
   * Draw a passage and build its grid. The first statement is the guard rather
   * than a state update, so this is safe to call straight from the mount effect
   * — the clears below happen only once this draw is the newest one.
   */
  const load = useCallback(async () => {
    const current = run.current + 1;
    run.current = current;

    try {
      const manifest = await loadManifest();
      const passage = await pickPassage(manifest, preferences.filters);
      const next = buildPuzzle(passage);
      if (run.current !== current) return;
      setPuzzle(next);
      setFound(new Set());
      setFoundPaths(new Map());
      setSelection([]);
      setError(null);
      setResultDismissed(false);
      setMiss(new Set());
      setAnnouncement(`${next.words.length} words to find in ${next.reference}.`);
    } catch (cause) {
      if (run.current !== current) return;
      setPuzzle(null);
      setError(
        cause instanceof NoSourcesError
          ? "No sources are switched on, so there is nothing to draw from. Turn a book or a conference back on in the reader's filters."
          : cause instanceof Error
            ? cause.message
            : "The passage couldn't be drawn. Try again."
      );
    } finally {
      if (run.current === current) setLoading(false);
    }
  }, [preferences.filters]);

  /** The button's half: clear the board now, then draw the next one. */
  const draw = useCallback(() => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setPuzzle(null);
    setFound(new Set());
    setFoundPaths(new Map());
    setSelection([]);
    setResultDismissed(false);
    setMiss(new Set());
    setChapterOpen(false);
    anchor.current = null;
    void load();
  }, [load]);

  // The first draw, and a redraw when the reader's filters change: deferred by
  // a tick so the board isn't asked to clear and refill in the same pass as the
  // mount, which is the pattern the search page loads its library with too.
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const size = puzzle?.size ?? 0;

  /** The cell under a pointer, if the pointer is over one. */
  const cellFrom = (target: EventTarget | null): CellIndex | null => {
    if (!(target instanceof Element)) return null;
    const cell = target.closest<HTMLElement>("[data-cell]");
    if (!cell) return null;
    const index = Number(cell.dataset.cell);
    return Number.isInteger(index) ? index : null;
  };

  const foundCells = useMemo(() => {
    const cells = new Set<CellIndex>();
    for (const path of foundPaths.values()) for (const cell of path) cells.add(cell);
    return cells;
  }, [foundPaths]);

  /**
   * Measure the board so the found-word lines can be drawn across it.
   *
   * The cells are measured rather than calculated: the board's padding and gap
   * change with the breakpoint, so the only honest source for where a cell's
   * centre is, is the cell. Re-measured when a board is built and whenever the
   * board's own box changes, so a rotation keeps the lines on their words.
   */
  const measure = useCallback(() => {
    const board = gridRef.current;
    if (!board) return;
    const box = board.getBoundingClientRect();
    // The overlay is inset to the padding box, so the border is subtracted and
    // both origins agree to the pixel.
    const originX = box.x + board.clientLeft;
    const originY = box.y + board.clientTop;
    const centres = new Map<number, { x: number; y: number }>();
    let cell = 0;
    for (const square of board.querySelectorAll<HTMLElement>("[data-cell]")) {
      const index = Number(square.dataset.cell);
      const rect = square.getBoundingClientRect();
      cell = rect.width;
      centres.set(index, {
        x: rect.x + rect.width / 2 - originX,
        y: rect.y + rect.height / 2 - originY,
      });
    }
    setGeometry({ width: box.width, height: box.height, cell, centres });
  }, []);

  useEffect(() => {
    // A frame's delay, so the cells are laid out before they are measured — and
    // the one setState lives in a callback rather than in the effect's own body.
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    const board = gridRef.current;
    if (board) observer.observe(board);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure, puzzle]);

  /**
   * Settle a completed selection. A line that spells a word still on the list
   * is kept; a line too short to be one is just a tap and is dropped without a
   * word about it; anything else gets one quiet line of feedback.
   */
  const commit = useCallback(
    (path: CellIndex[]) => {
      if (!puzzle || path.length < 3) {
        setSelection([]);
        return;
      }
      const hit = wordAt(puzzle.grid, puzzle.words, path);
      if (hit && !found.has(hit.word)) {
        const next = new Set(found).add(hit.word);
        setFound(next);
        setFoundPaths((current) => new Map(current).set(hit.word, path));
        tapWordFound();
        setAnnouncement(
          next.size === puzzle.words.length
            ? `${hit.word} — that is all ${puzzle.words.length} words.`
            : `${hit.word} found. ${next.size} of ${puzzle.words.length}.`
        );
        if (next.size === puzzle.words.length) setNotice(null);
      } else if (hit) {
        flash("Already found.");
      } else {
        // A wrong line is shown, not just said: the cells the reader dragged
        // light red for a moment, which is feedback where their eyes already
        // are. The notice under the board says it too, for anyone not looking
        // at the grid — and for a screen reader, which cannot see a flash.
        flash("No word there — keep looking.");
        tapLineMissed();
        setMiss(new Set(path));
        window.clearTimeout(missTimer.current);
        missTimer.current = window.setTimeout(() => setMiss(new Set()), 480);
      }
      setSelection([]);
    },
    [flash, found, puzzle]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!puzzle) return;
      const index = cellFrom(event.target);
      if (index === null) return;
      dragging.current = true;
      anchor.current = index;
      drag.current = { direction: null, cells: [index] };
      setMiss(new Set());
      setSelection([index]);
      void tapLetter();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [puzzle]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging.current || !puzzle) return;
      const over = cellFrom(document.elementFromPoint(event.clientX, event.clientY));
      if (over === null || anchor.current === null) return;
      const line = lineBetween(puzzle.size, anchor.current, over);
      if (!line) return;

      const last = drag.current;
      // A drag that has come back to its first letter has no direction of its
      // own — it is a line of one — so it keeps the one it was last travelling
      // in, and leaving in another is still felt as a turn.
      const direction = dragDirection(puzzle.size, line) ?? last?.direction ?? null;
      const turned = Boolean(last?.direction && direction && direction !== last.direction);
      const tip = line[line.length - 1];
      drag.current = { direction, cells: line };
      setSelection(line);
      if (turned) void tapDirectionChange();
      else if (!last?.cells.includes(tip)) void tapLetter();
    },
    [puzzle]
  );

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    // The drag is over, so nothing is anchored any more: a later keyboard turn
    // must open its own selection rather than extend the one just released.
    anchor.current = null;
    drag.current = null;
    commit(selection);
  }, [commit, selection]);

  /** Enter on a focused cell: first press anchors, second press completes. */
  const onCellKey = useCallback(
    (index: CellIndex, event: ReactKeyboardEvent) => {
      if (!puzzle) return;
      if (event.key === "Escape") {
        anchor.current = null;
        setSelection([]);
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (anchor.current === null) {
        anchor.current = index;
        setSelection([index]);
        setAnnouncement("Start selected. Choose the last letter.");
        return;
      }
      const line = lineBetween(puzzle.size, anchor.current, index);
      anchor.current = null;
      commit(line ?? []);
    },
    [commit, puzzle]
  );

  const solved = Boolean(puzzle && found.size === puzzle.words.length);
  // The finish card waits for the last cross-out to finish being drawn: the pen
  // is still going across the word that won the board when it would otherwise
  // open over it. Keyed on the board itself, so a new puzzle starts a new wait.
  const revealDone = useRevealDelay(
    solved && puzzle ? `${puzzle.reference}|${puzzle.grid.join("")}` : null,
    preferences.reduceMotion ? 0 : CROSS_OUT_MS
  );

  return (
    <FeaturePage featureId="word-search" subtitle="" contentClassName="mt-5">
      <div className="mx-auto w-full max-w-lg">
        {error ? (
          <div className="mt-6 rounded-3xl border border-border bg-surface p-6 text-sm">
            <p className="font-semibold text-foreground">No grid to show.</p>
            <p className="mt-2 text-muted">{error}</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => void draw()}
                className="inline-flex items-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
              >
                <Glyph name="sparkles" className="h-4 w-4" />
                Try again
              </button>
              <Link
                href="/read"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                Change sources
              </Link>
            </div>
          </div>
        ) : (
          <>
            {!puzzle && loading && (
              <p className="text-center text-sm text-muted" aria-hidden="true">
                A {GRID_SIZE}×{GRID_SIZE} grid of the passage&apos;s own words, hidden in eight
                directions.
              </p>
            )}

            {puzzle && (
              <ul className="flex flex-wrap gap-2">
                {puzzle.words.map((placement) => {
                  const done = found.has(placement.word);
                  return (
                    <li key={placement.word}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                          done
                            ? "border-correct/50 bg-correct/15 text-correct-text line-through"
                            : "border-border bg-surface-2 text-foreground/80"
                        }`}
                      >
                        {placement.word}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Which passage this grid is built from — under the words to
                find, where the reader looks before starting. It opens the
                chapter beside the board rather than leaving the grid, so
                checking a word never costs the reader their place. */}
            {puzzle && (
              <p className="mt-4 text-sm text-muted">
                Passage:{" "}
                <button
                  type="button"
                  onClick={() => setChapterOpen(true)}
                  className="font-medium text-accent-strong underline decoration-accent/50 underline-offset-4 transition-colors hover:decoration-accent-strong"
                >
                  {/* The whole citation, verse included: the grid is built
                      from that verse, so "Isaiah 49" alone would leave the
                      reader hunting for what the board was made of. */}
                  {puzzle.passage.reference}
                </button>
              </p>
            )}

            {/* The board. `touch-none` keeps a drag across the letters from
                scrolling the page under the thumb, which is the one thing a
                drag-to-select grid cannot have. */}
            <div
              ref={gridRef}
              // The board answers a finger letter by letter, so the app's one
              // press tick stays out of it (components/press-feedback.tsx).
              data-haptic="own"
              role="group"
              aria-label="Word-search grid. Drag across letters, or focus a cell and press Enter to choose its first and last letters."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative mt-4 grid touch-none select-none gap-1 rounded-3xl border border-border bg-surface p-2 sm:gap-1.5 sm:p-3"
              style={{ gridTemplateColumns: `repeat(${size || 1}, minmax(0, 1fr))` }}
            >
              {puzzle?.grid.map((letter, index) => {
                const inLine = selection.includes(index);
                const isFound = foundCells.has(index);
                const isMiss = miss.has(index);
                return (
                  <button
                    key={index}
                    type="button"
                    data-cell={index}
                    onKeyDown={(event) => onCellKey(index, event)}
                    aria-label={`Row ${Math.floor(index / puzzle.size) + 1}, column ${
                      (index % puzzle.size) + 1
                    }: ${letter}`}
                    className={`grid aspect-square place-items-center rounded-md border text-[13px] font-semibold uppercase transition-colors sm:rounded-lg sm:text-base ${
                      inLine
                        ? "border-accent bg-accent/25 text-accent-strong"
                        : isFound
                          ? "border-correct/60 bg-correct/20 text-correct-text"
                          : isMiss
                            ? "border-wrong bg-wrong/20 text-wrong"
                            : "border-border bg-surface text-foreground"
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}

              {/* The word just found, crossed out with one stroke drawn from its
                  first letter to its last. Over the cells and deaf to
                  pointers, so the letters stay readable and the drag belongs to
                  the board underneath; hidden from a screen reader, which is
                  told about the find in words instead. */}
              {geometry && foundPaths.size > 0 && (
                <svg
                  aria-hidden="true"
                  width={geometry.width}
                  height={geometry.height}
                  className="pointer-events-none absolute inset-0 overflow-visible text-correct-text"
                >
                  {[...foundPaths].map(([word, path]) => {
                    const start = geometry.centres.get(path[0]);
                    const end = geometry.centres.get(path[path.length - 1]);
                    if (!start || !end) return null;
                    // Past the far edge of the first and last cells: half a
                    // cell reaches the edge, so six tenths leaves a sliver of a
                    // cell sticking out at each end — a word struck through by
                    // hand, not one underlined exactly to its last letter. A
                    // diagonal word gets three quarters, a little further: its
                    // stroke leaves the cells through their corners, where a
                    // sliver reads as stopping short rather than overshooting.
                    // The overlay paints outside its own box for this, so a word
                    // at the board's rim is not cut off.
                    const span = Math.hypot(end.x - start.x, end.y - start.y) || 1;
                    // Asked of the cell index, not the pixels: a cell's centre
                    // lands on a fraction, and two cells in one row can be a
                    // hundredth of a pixel apart, which read as a diagonal.
                    const first = path[0];
                    const last = path[path.length - 1];
                    const diagonal =
                      Math.floor(first / size) !== Math.floor(last / size) &&
                      first % size !== last % size;
                    const over = geometry.cell * (diagonal ? 0.75 : 0.6);
                    const ux = ((end.x - start.x) / span) * over;
                    const uy = ((end.y - start.y) / span) * over;
                    const from = { x: start.x - ux, y: start.y - uy };
                    const to = { x: end.x + ux, y: end.y + uy };
                    return (
                      <motion.path
                        key={word}
                        d={`M${from.x} ${from.y} L${to.x} ${to.y}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        initial={
                          preferences.reduceMotion ? false : { pathLength: 0, opacity: 0.5 }
                        }
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={
                          preferences.reduceMotion
                            ? { duration: 0 }
                            : { duration: CROSS_OUT_MS / 1000, ease: "easeOut" }
                        }
                      />
                    );
                  })}
                </svg>
              )}
            </div>

            {/* A word found is the only thing the board has to report, and it
                reports it here as well as on the grid, for a screen reader. */}
            <p role="status" aria-live="polite" className="mt-3 min-h-5 text-center text-sm text-foreground/85">
              {notice ?? (puzzle ? `${found.size} of ${puzzle.words.length} found` : "")}
            </p>
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>

            {/* The bottom of the page, under the board: full width on a phone,
                where the thumb already is, and its own width from there. */}
            <button
              type="button"
              onClick={() => void draw()}
              disabled={loading}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-5 py-3 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
            >
              <Glyph name="sparkles" className="h-4 w-4" />
              {loading ? "Drawing…" : "New passage"}
            </button>
          </>
        )}
      </div>

      {/* The finish card, over the board once every word is in — the same
          shape the daily puzzle ends on. Closing it leaves the board with its
          lines drawn, so the reader can look over the words a moment longer. */}
      {puzzle && (
        <PassagePanel
          open={chapterOpen}
          onClose={() => setChapterOpen(false)}
          title={puzzle.passage.reference}
          subtitle={puzzle.passage.expansionSubtitle}
          verses={puzzle.passage.verses}
          highlight={puzzle.passage.highlightVerse}
        />
      )}

      {solved && revealDone && puzzle && !resultDismissed && (
        <SolvedDialog
          puzzle={puzzle}
          onClose={() => setResultDismissed(true)}
          onNewPassage={() => void draw()}
        />
      )}
    </FeaturePage>
  );
}

/**
 * The word-search's finish card.
 *
 * The daily puzzle's result dialog, in this game's terms: the good news, the
 * passage itself with every word the reader found marked in it, and the two
 * ways on — read the chapter, or draw another passage. A dialog rather than a
 * card under the board, because the board is the thing that just finished and
 * the words are worth one last look.
 */
function SolvedDialog({
  puzzle,
  onClose,
  onNewPassage,
}: {
  puzzle: WordSearchPuzzle;
  onClose: () => void;
  onNewPassage: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // The card opens after the cross-out of the word that finished the board, so
  // the fanfare is the card's own and needs no delay of its own.
  useResultHaptics(true);

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
        aria-labelledby="word-search-result-title"
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-win-border bg-win-card p-6 text-win-ink shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="word-search-result-title"
            className="font-serif text-2xl font-semibold text-win-ink"
          >
            Great Work! <span aria-hidden="true">🎉</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-win-muted transition-colors hover:bg-win-border/40 hover:text-win-strong"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-win-border bg-win-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-win-muted">
            {puzzle.reference}
            {puzzle.verseNumber ? `:${puzzle.verseNumber}` : ""}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-win-ink">
            <HighlightedVerse text={puzzle.verse} words={puzzle.words.map((w) => w.word)} />
          </p>
        </div>

        {/* A plain way into the chapter rather than a second button: the card
            ends in the text, and this is the step further into it. It sits on
            its own line, with the draw under it, so the two never read as one
            row of equal actions. */}
        <div className="mt-4 flex">
          <Link
            href={puzzle.href}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-win-ink underline decoration-win-border underline-offset-4 transition-colors hover:text-win-strong hover:decoration-win-strong"
          >
            Read more
            <Glyph name="arrow" className="h-3.5 w-3.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={onNewPassage}
          className="mt-4 flex w-full items-center justify-center rounded-full bg-win-bar px-5 py-3 text-sm font-semibold text-win-bar-contrast transition-opacity hover:opacity-90"
        >
          New passage
        </button>
      </div>
    </div>,
    document.body
  );
}

/**
 * The step a drag is taking, as its row and column signs — null while the
 * finger is still on the cell it started from, where there is no direction yet.
 */
function dragDirection(size: number, path: CellIndex[]): string | null {
  if (path.length < 2) return null;
  const [from, to] = path;
  const rows = Math.floor(to / size) - Math.floor(from / size);
  const columns = (to % size) - (from % size);
  return `${rows},${columns}`;
}

/** The passage, with every word the reader found marked in it. */
function HighlightedVerse({ text, words }: { text: string; words: string[] }) {
  const unique = [...new Set(words.map((word) => word.toLowerCase()))].filter(Boolean);
  if (!unique.length) return <>{text}</>;

  // The words are letters only (lib/word-search.ts), so they carry nothing a
  // regular expression would read as syntax; a plain alternation is enough.
  const pattern = new RegExp(`\\b(${unique.join("|")})\\b`, "gi");
  const marked = new Set(unique);
  return (
    <>
      {text.split(pattern).map((part, i) =>
        marked.has(part.toLowerCase()) ? (
          <mark key={i} className="result-mark rounded-[3px] px-0.5 font-semibold">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
