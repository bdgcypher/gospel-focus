"use client";

import { useEffect, useRef, useState } from "react";
import { usePreferences } from "./preferences";

/**
 * How long the opening roll takes. Fixed rather than proportional: the point is
 * that a wallet of 1,000 reaches its number in the same breath as a run of 20,
 * so the reader is never left waiting on their own success. The steps are just
 * bigger for the bigger number.
 */
const DURATION = 900;

/**
 * The number as a reader should see it while the screen is first drawing: it
 * rolls up from zero once, then simply reports what it is given. The value it
 * returns is unrounded, so a wheel of digits can turn smoothly through the
 * carry (components/rolling-number.tsx); callers that print a plain number
 * round it themselves.
 *
 * Two things make this the right shape for the header's wallet and streak and
 * for the run on /streak. The stores behind them are external snapshots that
 * are empty during server rendering and hand over their real values a moment
 * after hydration, so the hook reads the target from a ref each frame: the roll
 * starts wherever it is when the real number arrives rather than being fixed to
 * the zero of the first paint. And the opening is the only time it animates —
 * once settled, every later change (a gem spent, a day counted) is reported at
 * once, because a number that rolls every time it moves turns a working app
 * into a slot machine.
 *
 * Readers who have asked for less motion are given the number outright; the
 * preference already treats an unset choice as following the device.
 */
export function useCountUp(target: number): number {
  const { reduceMotion } = usePreferences();
  const [shown, setShown] = useState(0);
  const targetRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (settled.current) return;
    if (reduceMotion) {
      settled.current = true;
      setShown(targetRef.current);
      return;
    }

    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const progress = Math.min(1, (now - startRef.current) / DURATION);
      // Ease-out: the roll arrives at the number rather than stopping dead on
      // it, which is what makes a long count read as one movement.
      const eased = 1 - (1 - progress) ** 3;
      const to = targetRef.current;
      setShown(to * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        settled.current = true;
        setShown(to);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [reduceMotion]);

  // The frame loop reads the target from here rather than from a captured
  // value, so the real number the store reports after hydration is what the
  // roll lands on. Before the opening finishes this only retargets it; after,
  // the number is a reading rather than a performance, and every later move is
  // shown as it happens (a gem spent, a day counted).
  useEffect(() => {
    targetRef.current = target;
    if (settled.current) setShown(target);
  }, [target]);

  return shown;
}
