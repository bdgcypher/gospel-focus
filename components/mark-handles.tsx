"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

/**
 * A word a finger landed on.
 *
 * Marks are stored as word ranges, so a handle moves in words rather than in
 * pixels: what the reader drags is the edge of a run of words, and the browser's
 * glyph positions only decide where on the page to draw the handle.
 */
export interface WordPoint {
  verse: number;
  word: number;
}

/** Two words in reading order — the run a drag would leave behind. */
export interface WordRange {
  from: WordPoint;
  to: WordPoint;
}

interface Box {
  left: number;
  right: number;
  bottom: number;
}

type Edge = "start" | "end";

/**
 * Half of a handle's own box.
 *
 * The box is 44px across — the smallest target both touch platforms recommend
 * — because the drop is drawn under a word, where a thumb is already close to
 * the text it is trying to grab. The drop inside it is 34px and hangs below the
 * line, the way a system text selection's handles do: the point is what marks
 * the edge, and the body has to be big enough to read at arm's length on a page
 * of type. Its body is nearly a circle, so it reads as a knob rather than a pin.
 */
const HANDLE = 22;

/** Where the drop's point sits inside the handle's box. */
const POINT = 8;

const atOrBefore = (a: WordPoint, b: WordPoint) =>
  a.verse < b.verse || (a.verse === b.verse && a.word <= b.word);

/** Where a word sits inside the chapter, in the article's own coordinates. */
function boxOf(host: HTMLElement | null, point: WordPoint): Box | null {
  if (!host) return null;
  const node = host.querySelector<HTMLElement>(`[data-verse="${point.verse}"][data-word="${point.word}"]`);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  const frame = host.getBoundingClientRect();
  return { left: rect.left - frame.left, right: rect.right - frame.left, bottom: rect.bottom - frame.top };
}

/**
 * The word under a finger.
 *
 * `elementFromPoint` rather than arithmetic over every span: a chapter holds
 * hundreds of words and this runs on every move. The lifts matter because a
 * handle hangs under its line — the finger is usually just below the words it
 * means — so the column is searched upwards before downwards.
 */
function wordAt(host: HTMLElement | null, x: number, y: number): WordPoint | null {
  if (!host) return null;
  for (const lift of [0, -10, -20, -30, -40, 10]) {
    const found = document.elementFromPoint(x, y + lift)?.closest?.("[data-word]");
    if (!(found instanceof HTMLElement) || !host.contains(found)) continue;
    const verse = Number(found.dataset.verse);
    const word = Number(found.dataset.word);
    if (Number.isInteger(verse) && Number.isInteger(word)) return { verse, word };
  }
  return null;
}

/**
 * The two grabbed ends of the run the panel is open on.
 *
 * They are the highlighter's own question — "does it start here or a word
 * earlier?" — made into something a thumb can answer. Dragging one edge moves
 * only that edge, so the run grows in either direction and can cross a verse
 * break. A mark is written once, on release: a drag is a question, not a
 * thousand answers, and a drag that is cancelled leaves it as it was.
 *
 * The same handles serve a fresh selection, where the run is not stored yet and
 * the browser's own selection is what paints it — the caller decides what a
 * preview and a release mean; this only reports the words the edge reached.
 *
 * Positions are painted onto the buttons rather than kept in state, so the page
 * behind can rerender on every word of a drag without the handles flickering,
 * and a reflow moves them without a second source of truth. The parent owns the
 * preview, because the words themselves have to repaint while the finger moves.
 */
export function MarkHandles({
  host,
  from,
  to,
  wordCount,
  subject = "mark",
  onPreview,
  onCommit,
}: {
  /** The element holding the words — the reader's article. */
  host: RefObject<HTMLElement | null>;
  from: WordPoint;
  to: WordPoint;
  /** What the handles are on, for the labels a screen reader reads. */
  subject?: "mark" | "selection";
  /** How many words a verse holds, so a keyboard nudge knows where to stop. */
  wordCount: (verse: number) => number;
  onPreview: (range: WordRange) => void;
  onCommit: (range: WordRange) => void;
}) {
  const drag = useRef<{ edge: Edge; at: WordPoint } | null>(null);
  const [moving, setMoving] = useState<{ edge: Edge; at: WordPoint } | null>(null);
  const [, setTick] = useState(0);
  const startHandle = useRef<HTMLButtonElement>(null);
  const endHandle = useRef<HTMLButtonElement>(null);

  // The props the drag needs are read from here, so the window listeners below
  // are not torn down and rebuilt on every word of the drag.
  const latest = useRef({ from, to, onPreview, onCommit });
  useEffect(() => {
    latest.current = { from, to, onPreview, onCommit };
  });

  const start = moving?.edge === "start" ? moving.at : from;
  const end = moving?.edge === "end" ? moving.at : to;
  const sameWord = start.verse === end.verse && start.word === end.word;

  // Painted after every render, because the words move under the handles when
  // the type size, the rotation or a late font changes the line breaks.
  useLayoutEffect(() => {
    const place = (
      node: HTMLButtonElement | null,
      point: WordPoint,
      edge: Edge,
      offset: number
    ) => {
      if (!node) return;
      const box = boxOf(host.current, point);
      if (!box) {
        node.style.visibility = "hidden";
        return;
      }
      node.style.visibility = "visible";
      node.style.left = `${(edge === "start" ? box.left : box.right) - HANDLE + offset}px`;
      // The drop's own point lands on the word's line, a hair under it, and the
      // body hangs clear: POINT is where that point sits inside the box (see
      // the drawing below), so the ink, not the target, marks the edge.
      node.style.top = `${box.bottom + 4 - POINT}px`;
    };
    // One word is both ends: the two drops would sit on top of each other, so
    // they part to either side of it — far enough apart that a thumb can tell
    // them apart and reach each one's own box.
    place(startHandle.current, start, "start", sameWord ? -16 : 0);
    place(endHandle.current, end, "end", sameWord ? 16 : 0);
  });

  // A rotation, a window dragged, or a web font that lands after the first
  // measure all move the words; one more render puts the handles back on them.
  useEffect(() => {
    const bump = () => setTick((tick) => tick + 1);
    const settle = window.setTimeout(bump, 260);
    window.addEventListener("resize", bump);
    document.fonts?.ready.then(bump).catch(() => {});
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", bump);
    };
  }, []);

  useEffect(() => {
    if (!moving) return;
    const edge = moving.edge;

    const move = (event: PointerEvent) => {
      const { from: head, to: tail, onPreview: preview } = latest.current;
      const point = wordAt(host.current, event.clientX, event.clientY);
      if (!point || !drag.current) return;
      // An edge cannot cross the other one: dragging the start past the end
      // stops at the end rather than turning the mark inside out.
      const range: WordRange =
        edge === "start"
          ? { from: atOrBefore(point, tail) ? point : tail, to: tail }
          : { from: head, to: atOrBefore(head, point) ? point : head };
      drag.current = { edge, at: edge === "start" ? range.from : range.to };
      setMoving(drag.current);
      preview(range);
    };

    const finish = () => {
      const current = drag.current;
      const { from: head, to: tail, onCommit: commit } = latest.current;
      drag.current = null;
      setMoving(null);
      if (!current) return;
      commit(current.edge === "start" ? { from: current.at, to: tail } : { from: head, to: current.at });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [moving, host]);

  const grab = (event: ReactPointerEvent<HTMLButtonElement>, edge: Edge) => {
    // The press belongs to the handle, not to the words under it and not to the
    // page's own text selection.
    event.preventDefault();
    event.stopPropagation();
    const at = edge === "start" ? from : to;
    drag.current = { edge, at };
    setMoving({ edge, at });
    onPreview(edge === "start" ? { from: at, to } : { from, to: at });
  };

  /** A keyboard moves the same edge a word at a time, inside its verse. */
  const nudge = (event: ReactKeyboardEvent<HTMLButtonElement>, edge: Edge) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const point = edge === "start" ? from : to;
    const word = Math.min(wordCount(point.verse), Math.max(1, point.word + (event.key === "ArrowLeft" ? -1 : 1)));
    if (word === point.word) return;
    const moved = { verse: point.verse, word };
    const range: WordRange | null =
      edge === "start"
        ? atOrBefore(moved, to)
          ? { from: moved, to }
          : null
        : atOrBefore(from, moved)
          ? { from, to: moved }
          : null;
    if (!range) return;
    onPreview(range);
    onCommit(range);
  };

  return (
    <>
      <Handle
        edge="start"
        node={startHandle}
        point={start}
        total={wordCount(start.verse)}
        subject={subject}
        onGrab={grab}
        onKey={nudge}
      />
      <Handle
        edge="end"
        node={endHandle}
        point={end}
        total={wordCount(end.verse)}
        subject={subject}
        onGrab={grab}
        onKey={nudge}
      />
    </>
  );
}

function Handle({
  edge,
  node,
  point,
  total,
  subject,
  onGrab,
  onKey,
}: {
  edge: Edge;
  node: RefObject<HTMLButtonElement | null>;
  point: WordPoint;
  total: number;
  subject: string;
  onGrab: (event: ReactPointerEvent<HTMLButtonElement>, edge: Edge) => void;
  onKey: (event: ReactKeyboardEvent<HTMLButtonElement>, edge: Edge) => void;
}) {
  return (
    <button
      ref={node}
      type="button"
      role="slider"
      aria-label={edge === "start" ? `Start of the ${subject}` : `End of the ${subject}`}
      aria-valuemin={1}
      aria-valuemax={Math.max(1, total)}
      aria-valuenow={point.word}
      aria-valuetext={`Verse ${point.verse}, word ${point.word}`}
      aria-orientation="horizontal"
      data-mark-handle={edge}
      onPointerDown={(event) => onGrab(event, edge)}
      onKeyDown={(event) => onKey(event, edge)}
      style={{ visibility: "hidden" }}
      className="absolute z-30 grid h-11 w-11 touch-none select-none place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      <svg viewBox="0 0 20 20" className="h-[34px] w-[34px]" aria-hidden="true">
        {/* A drop, not a dot: the point is the thing being placed, and it
            touches the word's line while the body hangs clear of the words.
            One colour in every colour of mark — a handle is the app's control,
            not part of what it marks, so it reads as a selection rather than
            as a second swatch (see `--handle` in app/globals.css). */}
        {/* The drop's own edges come from the stylesheet's tokens, applied as a
            style so the ink and the hairline around it follow a theme change
            in the same paint as the page behind them. */}
        <path
          d="M10 1.6c3.9 4 7 7.4 7 10.4a7 7 0 1 1-14 0c0-3 3.1-6.4 7-10.4Z"
          style={{ fill: "var(--handle)", stroke: "var(--background)" }}
          strokeWidth={1.2}
        />
      </svg>
    </button>
  );
}
