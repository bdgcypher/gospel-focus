"use client";

import { useEffect, useState } from "react";
import type { Passage } from "@/lib/types";
import { tapBookLanded, tapPageTurn } from "@/lib/haptics";

/** How many sheets are in the air at once. */
const SHEETS = 5;
/** Fastest the riffle is allowed to tick, in ms between page turns. */
const MIN_TAP_MS = 150;

/** Seconds for one full turn cycle at progress `t` through the riffle. */
const turnSeconds = (t: number) => 0.5 + 3.5 * Math.pow(t, 1.5);

interface Props {
  /** How long the pages turn before the book lands. */
  durationMs: number;
  /** How long the final page takes to turn onto the draw. */
  settleMs: number;
  /** Snippets cycled through the left-hand page while riffling. */
  teasers: string[];
  /**
   * The drawn passage. While this is null the book is still riffling: the
   * sheets fan across the right-hand page and slow to barely one turn at a
   * time, and no drawn text is on screen at all. Once set, one last page turns
   * all the way over carrying that text on its back, and the book rests open
   * with the draw on the page that turn came to rest on (the left-hand page).
   */
  passage: Passage | null;
}

/**
 * The "being opened to a random place" animation: a two-page book whose sheets
 * riffle quickly, slow down until they are turning barely one page at a time,
 * and then settle open on the drawn passage.
 *
 * Each sheet is a genuine two-sided page, so a turn carries paper over the
 * spine instead of the sheet vanishing at 90°, and both sides of every sheet
 * are the same unread placeholder page. Only the very last turn carries the
 * draw: its back is the drawn passage, so the text arrives with the flip and
 * comes to rest on the left, the one place it is ever shown.
 */
export function RifflingPages({ durationMs, settleMs, teasers, passage }: Props) {
  const landed = passage !== null;
  const [tick, setTick] = useState(0);
  const [flipSeconds, setFlipSeconds] = useState(0.55);

  useEffect(() => {
    // Landed: stop driving the turn speed and freeze the page snippet.
    if (landed) return;
    const start = performance.now();
    let timeout: ReturnType<typeof setTimeout>;
    let lastFlip = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      setTick((n) => n + 1);
      // Teaser flickers slow down as we approach the target.
      const interval = 55 + 900 * Math.pow(t, 2);
      const now = performance.now();
      if (now - lastFlip > 150) {
        lastFlip = now;
        // A full turn stretches from 0.5s out to 4s, so the last stretch
        // crawls to barely one page at a time before the book settles.
        setFlipSeconds(turnSeconds(t));
      }
      timeout = setTimeout(step, interval);
    };
    timeout = setTimeout(step, 45);
    return () => clearTimeout(timeout);
  }, [durationMs, landed]);

  // A tick per page turn, on the same deceleration curve as the animation, so
  // the phone buzzes along with the riffle and calms down as the book does.
  useEffect(() => {
    if (landed) return;
    const start = performance.now();
    let timeout: ReturnType<typeof setTimeout>;
    const beat = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      void tapPageTurn();
      timeout = setTimeout(beat, Math.max(MIN_TAP_MS, (turnSeconds(t) * 1000) / SHEETS));
    };
    timeout = setTimeout(beat, MIN_TAP_MS);
    return () => clearTimeout(timeout);
  }, [durationMs, landed]);

  // A firmer tap marks the book actually coming to rest: it fires as the final
  // page finishes turning, not when the riffle stops.
  useEffect(() => {
    if (!landed) return;
    const id = setTimeout(() => void tapBookLanded(), settleMs);
    return () => clearTimeout(id);
  }, [landed, settleMs]);

  const current = teasers.length ? teasers[tick % teasers.length] : "";

  // Spread the sheets evenly across one turn cycle: at any speed they fan at a
  // constant angle rather than clumping together as each turn slows.
  const turning = Array.from({ length: SHEETS }, (_, i) => ({ i, delay: -(i * flipSeconds) / SHEETS }));


  return (
    <div className="riffling-stage w-full" aria-hidden="true">
      <div className="relative mx-auto h-[300px] w-full max-w-lg">
        {/* Book body */}
        <div className="absolute inset-0 rounded-2xl border border-border bg-page shadow-[0_20px_60px_-25px_rgba(0,0,0,0.45)]" />
        {/* Spine */}
        <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-spine to-transparent" />

        {/* Left page: the flickering snippet while riffling. Once the book
            lands, the page it comes to rest on covers it. */}
        <div className="absolute inset-y-0 left-0 flex w-1/2 items-center overflow-hidden p-5 sm:p-6">
          <p key={tick} className="riffle-line font-serif text-[15px] leading-relaxed text-foreground/75">
            {current}
          </p>
        </div>

        {/* Facing page: placeholder lines, riffle and all — the draw only ever
            appears on the page the book comes to rest on. */}
        <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
          <SkeletonLines />
        </div>

        {/* Turning sheets. The stack keeps turning while it fades, so the riffle
            settles rather than being cut off. */}
        <div className={`turning-pages ${landed ? "turning-pages-done" : ""}`}>
          {turning.map(({ i, delay }) => (
            <div
              key={i}
              className="flip-page absolute inset-y-0 left-1/2 right-0"
              style={{ animationDelay: `${delay}s`, animationDuration: `${flipSeconds}s` }}
            >
              <SheetSides />
            </div>
          ))}
        </div>

        {/* One last page turns slowly all the way over. Its back carries the
            drawn passage, so the draw arrives with that turn and comes to rest
            on the left-hand page — the only place it is ever shown. */}
        {passage && (
          <div className="settling-pages">
            <div
              className="flip-page-settle absolute inset-y-0 left-1/2 right-0"
              style={{ animationDuration: `${settleMs}ms` }}
            >
              <div className="page-face">
                <SkeletonLines />
              </div>
              <div className="page-face page-face-solid page-back">
                <div className="p-5 sm:p-6">
                  <p className="font-serif text-[15px] leading-relaxed text-foreground/90">
                    {passage.text}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="sr-only" role="status">
        Opening to a passage…
      </p>
    </div>
  );
}

/**
 * Both sides of a turning sheet, so the page stays paper the whole way over
 * the spine rather than disappearing at 90 degrees. Both sides are the same
 * unread page: a turning sheet is a page that has not been read yet.
 */
function SheetSides() {
  return (
    <>
      <div className="page-face">
        <SkeletonLines />
      </div>
      <div className="page-face page-back">
        <SkeletonLines />
      </div>
    </>
  );
}

/** How wide each placeholder line runs, in order — varied so the block reads
    as a page of set text rather than a stack of bars. */
const LINE_WIDTHS = [97, 88, 94, 72, 91, 96, 84, 93, 66, 89, 95, 78, 92, 86];

/**
 * A page glimpsed while riffling. The lines are spread across the full height
 * of the page, so a preview runs all the way down the book rather than
 * stopping short of the foot.
 */
function SkeletonLines() {
  return (
    <div className="flex h-full flex-col justify-between p-5 sm:p-6">
      {LINE_WIDTHS.map((w, i) => (
        <div key={i} className="h-2 rounded-full bg-foreground/10" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
