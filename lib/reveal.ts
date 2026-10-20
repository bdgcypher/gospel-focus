"use client";

import { useEffect, useState } from "react";

/**
 * Whether the animation that finishes a game has had time to play.
 *
 * Every game ends with a move the reader should be allowed to see — the word
 * search draws its last cross-out, the daily puzzle turns its last row of
 * letters, the quiz marks the guess that missed. The result card used to open on
 * the same frame as that move and cover it, so the one moment the game had been
 * building to went past behind a dialog. This holds the card back for the length
 * of the animation, and its own haptics with it, since both are hung off the card
 * (lib/haptics.ts).
 *
 * The wait is keyed rather than a plain boolean: the key names the ending being
 * waited for, so a new round starts its own wait instead of arriving with the
 * last one's already up. `null` means no ending is in progress, and the answer is
 * no. A zero `ms` — reduce motion — still settles, on the next tick rather than
 * on this frame, so a card never opens in the same pass the board changed under
 * it.
 */
export function useRevealDelay(key: string | null, ms: number): boolean {
  const [settled, setSettled] = useState<string | null>(null);

  useEffect(() => {
    if (key === null) return;
    const timer = window.setTimeout(() => setSettled(key), Math.max(0, ms));
    return () => window.clearTimeout(timer);
  }, [key, ms]);

  return key !== null && settled === key;
}
