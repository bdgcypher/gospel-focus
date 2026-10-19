"use client";

import { Glyph } from "./glyph";
import { streakInForce, useStreak } from "@/lib/streak";

/**
 * The running streak, as a small chip beside the daily passage button.
 *
 * Deliberately quiet: it appears only once there is a run to show, and it never
 * scolds. A missed day simply resets it, which is the whole of its design — and
 * the run here is the one through yesterday, since a day joins it when that
 * day's goal is reached (lib/streak.ts). The hub's own bar is where the reader
 * sees how close today is to being the next day of it.
 */
export function StreakBadge() {
  const streak = useStreak();
  const run = streakInForce(streak);
  if (run < 1) return null;

  const best = streak.best > run ? `Best: ${streak.best} days.` : "";

  return (
    <span
      title={`You've reached your goal ${run} ${run === 1 ? "day" : "days"} in a row. ${best}`.trim()}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-strong"
    >
      {/* The shared flame rather than a copy: in the playful themes it becomes
          🔥 along with every other glyph in the app. */}
      <Glyph name="flame" className="h-4 w-4" />
      {run}-day streak
    </span>
  );
}
