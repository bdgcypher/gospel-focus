"use client";

import { GOAL_CHOICES } from "@/lib/study";

interface Props {
  /** What to do with the chosen length — create a goal, or move an existing one. */
  onPick: (minutes: number) => void;
  /** Marks the length already in force, when there is one. */
  current?: number;
}

/**
 * The lengths a daily goal can be picked in.
 *
 * One tap each, and no slider: a row of numbers is a decision the reader can
 * make without thinking about it, which is the whole point of a goal they are
 * meant to start this minute. The tap target is the app's standard 44px even
 * though the chips look small.
 */
export function GoalPicker({ onPick, current }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {GOAL_CHOICES.map((minutes) => {
        const active = minutes === current;
        return (
          <button
            key={minutes}
            type="button"
            onClick={() => onPick(minutes)}
            aria-pressed={active}
            className={`h-11 rounded-2xl border px-4 text-sm font-semibold tabular-nums transition-colors ${
              active
                ? "border-accent/60 bg-accent/15 text-accent-strong"
                : "border-border bg-surface-2 text-foreground hover:border-accent/60 hover:text-accent-strong"
            }`}
          >
            {minutes} min
          </button>
        );
      })}
    </div>
  );
}
