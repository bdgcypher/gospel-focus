"use client";

import { useEffect, useRef } from "react";
import type { Passage } from "@/lib/types";
import { tapBookLanded, tapPageTurn } from "@/lib/haptics";

/** How many sheets are in the air at once. */
const SHEETS = 5;
/** Fastest the riffle is allowed to tick, in ms between page turns. */
const MIN_TAP_MS = 150;

/** Tempo bookends, in seconds per page turn: the flick the book opens with
    and the crawl it reaches by the end of the riffle. */
const FAST_TURN = 0.45;
const SLOW_TURN = 1.3;

/**
 * Seconds one full page turn takes at progress `t` through the riffle. The
 * tempo decelerates geometrically — every moment a fixed ratio slower than
 * the one before — so the riffle eases continuously from a flick to a crawl
 * with no flat stretch and no gear change, and the reveal page that follows
 * is just the slowest turn of the same curve.
 */
const turnSeconds = (t: number) => FAST_TURN * (SLOW_TURN / FAST_TURN) ** t;

/** The easing every riffle turn shares, so all the pages turn the same way. */
const easeTurn = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * The reveal page's easing: it enters at the pace the fan reached and only
 * ever slows, coming to rest on the draw — a decelerating landing rather than
 * the old ease-in-out that hesitated at 0° before starting.
 */
const easeReveal = (q: number) => 1 - (1 - q) ** 3;

/**
 * How solid a page is over its own turn: full paper coming over the spine,
 * thinning out as the page comes to rest on the far side so the sheets below
 * it — and finally the draw — keep showing through.
 */
const faceOpacity = (p: number) =>
  p < 0.85 ? 0.95 - (0.05 * p) / 0.85 : 0.9 - (0.75 * (p - 0.85)) / 0.15;

interface Props {
  /** How long the pages turn before the book lands. */
  durationMs: number;
  /** How long the final page takes to turn onto the draw. */
  settleMs: number;
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
export function RifflingPages({ durationMs, settleMs, passage }: Props) {
  const landed = passage !== null;
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const settleRef = useRef<HTMLDivElement | null>(null);
  const landedRef = useRef(landed);

  useEffect(() => {
    landedRef.current = landed;
  }, [landed]);

  // The riffle runs off a single clock. Every sheet reads the same amount of
  // turning and sits at an even offset along it, so they all move at exactly
  // the same speed and stay evenly fanned as the book slows down. Writing the
  // angles straight to the DOM is what keeps the turns smooth: restyling a
  // running CSS animation each time the tempo changed made the pages jump.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    let previous = start;
    let lastTap = 0;
    /** Whole turns the fan has made since the book was opened. */
    let turned = 0;

    /** Progress of the final, draw-carrying flip, 0 → 1 over `settleMs`. */
    let reveal = 0;
    let wasLanded = false;
    let landedAt = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;

      // The book has landed: the fan holds where it is and fades away, and the
      // final page turns on this same clock — entering at the pace the fan
      // reached and only slowing further, so the reveal is the last, slowest
      // turn of one continuous deceleration rather than a separate animation.
      if (landedRef.current) {
        if (!wasLanded) {
          wasLanded = true;
          landedAt = now;
        }
        if (reveal < 1) {
          reveal = Math.min(1, (now - landedAt) / settleMs);
          const settle = settleRef.current;
          if (settle) settle.style.transform = `rotateY(${-180 * easeReveal(reveal)}deg)`;
        } else return; // Resting on the draw; nothing left to animate.
        raf = requestAnimationFrame(frame);
        return;
      }

      const t = Math.min(1, (now - start) / durationMs);
      turned += dt / turnSeconds(t);

      for (let i = 0; i < SHEETS; i++) {
        const sheet = sheetRefs.current[i];
        if (!sheet) continue;
        const p = (((turned - i / SHEETS) % 1) + 1) % 1;
        sheet.style.transform = `rotateY(${-180 * easeTurn(p)}deg)`;
        const opacity = String(faceOpacity(p));
        for (const face of sheet.children as HTMLCollectionOf<HTMLElement>) face.style.opacity = opacity;
      }

      // A tick per page turn, on the same deceleration curve as the animation,
      // so the phone buzzes along with the riffle and calms down as it does.
      if (!landedRef.current && now - lastTap >= Math.max(MIN_TAP_MS, (turnSeconds(t) * 1000) / SHEETS)) {
        lastTap = now;
        void tapPageTurn();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, settleMs]);

  // A firmer tap marks the book actually coming to rest: it fires as the final
  // page finishes turning, not when the riffle stops.
  useEffect(() => {
    if (!landed) return;
    const id = setTimeout(() => void tapBookLanded(), settleMs);
    return () => clearTimeout(id);
  }, [landed, settleMs]);

  const sheets = Array.from({ length: SHEETS }, (_, i) => i);

  return (
    <div className="riffling-stage w-full" aria-hidden="true">
      <div className="relative mx-auto h-[300px] w-full max-w-lg">
        {/* Book body */}
        <div className="absolute inset-0 rounded-2xl border border-border bg-page shadow-[0_20px_60px_-25px_rgba(0,0,0,0.45)]" />
        {/* Spine */}
        <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-spine to-transparent" />

        {/* Left page: placeholder lines like the facing page, so the book
            holds no text at all until the draw arrives. */}
        <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
          <SkeletonLines />
        </div>

        {/* Facing page: placeholder lines, riffle and all — the draw only ever
            appears on the page the book comes to rest on. */}
        <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
          <SkeletonLines />
        </div>

        {/* Turning sheets. The stack keeps turning while it fades, so the riffle
            settles rather than being cut off. */}
        <div className={`turning-pages ${landed ? "turning-pages-done" : ""}`}>
          {sheets.map((i) => (
            <div
              key={i}
              ref={(el) => {
                sheetRefs.current[i] = el;
              }}
              className="flip-page absolute inset-y-0 left-1/2 right-0"
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
            <div ref={settleRef} className="flip-page-settle absolute inset-y-0 left-1/2 right-0">
              <div className="page-face">
                <SkeletonLines />
              </div>
              <div className="page-face page-back">
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
