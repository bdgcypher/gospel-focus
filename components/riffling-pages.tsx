"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Passage } from "@/lib/types";
import { PASSAGE_SHEET_ID, PASSAGE_SHEET_SPRING } from "./passage-card";

interface Props {
  /** How long the pages turn before the book lands. */
  durationMs: number;
  /** Snippets cycled through the facing page while riffling. */
  teasers: string[];
  /**
   * The drawn passage. While this is null the book is still riffling: the pages
   * fan across the right-hand page and slow to barely one turn at a time. Once
   * set, the turning pages settle, the book rests open with the passage on the
   * page it landed on, and that page is the shared element the passage card
   * expands out of.
   */
  passage: Passage | null;
}

/**
 * The "being opened to a random place" animation: a two-page book whose pages
 * riffle quickly, slow down until they are turning barely one page at a time,
 * and then land open on the drawn passage. The page it lands on carries
 * {@link PASSAGE_SHEET_ID}, so the passage card grows straight out of it.
 */
export function RifflingPages({ durationMs, teasers, passage }: Props) {
  const landed = passage !== null;
  const [tick, setTick] = useState(0);
  const [flipSeconds, setFlipSeconds] = useState(0.55);

  useEffect(() => {
    // Landed: stop driving the flip speed and freeze the facing-page snippet.
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
        // Each flip stretches out hard at the end: a full page turn grows
        // from 0.5s to 4s, so the last stretch turns barely one page at a time.
        setFlipSeconds(0.5 + 3.5 * Math.pow(t, 1.5));
      }
      timeout = setTimeout(step, interval);
    };
    timeout = setTimeout(step, 45);
    return () => clearTimeout(timeout);
  }, [durationMs, landed]);

  const current = teasers.length ? teasers[tick % teasers.length] : "";

  // Spread the five turning pages evenly across one flip cycle: at any speed
  // there is always exactly one page turning at a time, instead of the pages
  // clumping together as each flip gets slower.
  const turning = [0, 1, 2, 3, 4].map((i) => ({ i, delay: -(i * flipSeconds) / 5 }));

  return (
    <div className="riffling-stage w-full" aria-hidden="true">
      <div
        className="relative mx-auto h-[300px] w-full max-w-lg"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Book body */}
        <div className="absolute inset-0 rounded-2xl border border-border bg-page shadow-[0_20px_60px_-25px_rgba(0,0,0,0.45)]" />
        {/* Spine */}
        <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-spine to-transparent" />

        {/* Facing page: flickering snippet while rifling, frozen once landed */}
        <div className="absolute inset-y-0 left-0 flex w-1/2 items-center overflow-hidden p-5 sm:p-6">
          <p key={tick} className="riffle-line font-serif text-[15px] leading-relaxed text-foreground/75">
            {current}
          </p>
        </div>

        {/* Right-hand page, showing through behind the turning pages */}
        <div className="absolute inset-y-0 right-0 w-1/2 space-y-3 p-5 sm:p-6">
          {[92, 76, 88, 60, 80].map((w, i) => (
            <div key={i} className="h-2.5 rounded-full bg-foreground/10" style={{ width: `${w}%` }} />
          ))}
        </div>

        {/* Turning pages */}
        {turning.map(({ i, delay }) => (
          <div
            key={i}
            className={`flip-page absolute inset-y-0 left-1/2 right-0 rounded-r-2xl border border-l-0 border-page-edge bg-page ${
              landed ? "flip-page-landed" : ""
            }`}
            style={{
              animationDelay: `${delay}s`,
              animationDuration: `${flipSeconds}s`,
              boxShadow: "0 6px 20px -12px rgba(0,0,0,0.5)",
            }}
          >
            <div className="space-y-3 p-5 opacity-70 sm:p-6">
              {[80, 66, 90, 54].map((w, j) => (
                <div key={j} className="h-2.5 rounded-full bg-foreground/10" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        ))}

        {/* The page the book lands on. Same layoutId as the passage card, so
            the card expands out of this page. */}
        {passage && (
          <motion.div
            layoutId={PASSAGE_SHEET_ID}
            transition={PASSAGE_SHEET_SPRING}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-y-0 right-0 w-1/2 overflow-hidden rounded-r-2xl border border-l-0 border-page-edge bg-page p-5 sm:p-6"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-strong">
              {passage.reference}
            </p>
            <p className="mt-3 font-serif text-[15px] leading-relaxed text-foreground/90">
              {passage.text}
            </p>
          </motion.div>
        )}
      </div>
      <p className="sr-only" role="status">
        Opening to a passage…
      </p>
    </div>
  );
}
