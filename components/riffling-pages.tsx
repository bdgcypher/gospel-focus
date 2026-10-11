"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Passage } from "@/lib/types";
import { tapBookLanded, tapPageTurn } from "@/lib/haptics";
import { PASSAGE_SHEET_ID, PASSAGE_SHEET_SPRING } from "./passage-card";

/** How many sheets are in the air at once. */
const SHEETS = 5;
/** Fastest the riffle is allowed to tick, in ms between page turns. */
const MIN_TAP_MS = 150;

/** Seconds for one full turn cycle at progress `t` through the riffle. */
const turnSeconds = (t: number) => 0.5 + 2.1 * Math.pow(t, 1.7);

interface Props {
  /** How long the pages turn before the book lands. */
  durationMs: number;
  /** Snippets cycled through the left-hand page while riffling. */
  teasers: string[];
  /**
   * The drawn passage. While this is null the book is still riffling: the
   * sheets fan across the right-hand page and slow to barely one turn at a
   * time. Once set, the sheets settle, the book rests open with the drawn body
   * text on the page the last turn came to rest on (the left-hand page), and
   * that page is the shared element the passage card expands out of.
   */
  passage: Passage | null;
}

/**
 * The "being opened to a random place" animation: a two-page book whose sheets
 * riffle quickly, slow down until they are turning barely one page at a time,
 * and then settle open on the drawn passage.
 *
 * Each sheet is a genuine two-sided page, so a turn carries paper over the
 * spine instead of the sheet vanishing at 90°. The last turn comes to rest on
 * the left, which is where the draw appears — carrying just its body text,
 * with the section continuing on the facing page.
 */
export function RifflingPages({ durationMs, teasers, passage }: Props) {
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
        // A full turn stretches from 0.5s out to 2.6s, so the last stretch
        // turns barely one page at a time. Capped there (rather than growing
        // without bound) so the book comes to rest on a finished turn instead
        // of the riffle being cut off part-way.
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

  // A firmer tap marks the book actually coming to rest on the passage.
  useEffect(() => {
    if (landed) void tapBookLanded();
  }, [landed]);

  const current = teasers.length ? teasers[tick % teasers.length] : "";

  // Spread the sheets evenly across one turn cycle: at any speed they fan at a
  // constant angle rather than clumping together as each turn slows.
  const turning = Array.from({ length: SHEETS }, (_, i) => ({ i, delay: -(i * flipSeconds) / SHEETS }));

  // The section carries on across the fold once the book has landed.
  const lead = passage?.highlightVerse ?? 0;
  const following = passage && lead > 0 ? passage.verses.slice(lead, lead + 3) : [];
  const showVerseNumbers = passage?.kind === "scripture";

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

        {/* Facing page: skeleton lines while riffling, then the verses that
            follow the draw so the open spread is a real page, not a blank. */}
        <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden p-5 sm:p-6">
          {landed && following.length > 0 ? (
            <div className="space-y-3">
              {following.map((v) => (
                <p key={v.number} className="font-serif text-[14px] leading-relaxed text-foreground/55">
                  {showVerseNumbers && (
                    <span className="mr-1.5 align-super text-[10px] font-semibold text-accent-strong/70">
                      {v.number}
                    </span>
                  )}
                  {v.text}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[92, 76, 88, 60, 80].map((w, i) => (
                <div key={i} className="h-2.5 rounded-full bg-foreground/10" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
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
              <div className="page-face">
                <SkeletonLines />
                <div className="page-shade" />
              </div>
              <div className="page-face page-back">
                <SkeletonLines />
                <div className="page-shade" />
              </div>
            </div>
          ))}
        </div>

        {/* The sheet the last turn leaves us on: the left-hand page, carrying
            the drawn body text only, lying on top of the rest of the book.
            Same layoutId as the passage card, so the card expands out of this
            page. */}
        {passage && (
          <motion.div
            layoutId={PASSAGE_SHEET_ID}
            transition={PASSAGE_SHEET_SPRING}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-y-0 left-0 w-1/2 overflow-hidden rounded-l-2xl border border-r-0 border-page-edge bg-page p-5 sm:p-6"
          >
            <p className="font-serif text-[15px] leading-relaxed text-foreground/90">{passage.text}</p>
          </motion.div>
        )}
      </div>
      <p className="sr-only" role="status">
        Opening to a passage…
      </p>
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="space-y-3 p-5 sm:p-6">
      {[80, 66, 90, 54].map((w, i) => (
        <div key={i} className="h-2.5 rounded-full bg-foreground/10" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
