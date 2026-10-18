"use client";

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
      <FlameIcon />
      {run}-day streak
    </span>
  );
}

function FlameIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.2c.6 2.6-.6 4.1-2 5.6-1.5 1.6-3 3.2-3 6a5 5 0 0 0 10 0c0-1.4-.5-2.6-1.2-3.6-.5 1-1.2 1.6-2.1 1.9.6-2.1.2-4-.6-5.3-.7-1.2-1.5-2.2-1.1-4.6Z" />
    </svg>
  );
}
