"use client";

import { useId, useState } from "react";
import { GOAL_CHOICES, MAX_GOAL_MINUTES } from "@/lib/study";

interface Props {
  /** What to do with the chosen length — create a goal, or move an existing one. */
  onPick: (minutes: number) => void;
  /** Marks the length already in force, when there is one. */
  current?: number;
  /**
   * Offer a field for a length that isn't one of the chips. Off by default:
   * the hub's create-a-goal card is a single tap, and the place a reader goes
   * to fine-tune an existing goal is settings.
   */
  allowCustom?: boolean;
}

/**
 * The lengths a daily goal can be picked in, and a way to name another.
 *
 * One tap each, and no slider: a row of numbers is a decision the reader can
 * make without thinking about it, which is the whole point of a goal they are
 * meant to start this minute. The tap target is the app's standard 44px even
 * though the chips look small.
 *
 * Where `allowCustom` is set — settings, the place an existing goal is
 * fine-tuned — a field under the row is for the reader whose day doesn't divide
 * into the five offered lengths: someone with a commute that fits twenty-five
 * minutes, or a Sunday with an hour. It is a number field rather than a slider
 * or a "more" menu because the answer is a number the reader already has in
 * mind; enter commits it the same way the Set button does, so typing 25 and
 * pressing enter does what it looks like it should.
 */
export function GoalPicker({ onPick, current, allowCustom = false }: Props) {
  const fieldId = useId();
  const [custom, setCustom] = useState("");

  /** Whether the typed number is a length this goal can actually take. */
  const typed = Number(custom);
  const valid = custom.trim() !== "" && Number.isFinite(typed) && Math.round(typed) >= 1;

  const commit = () => {
    if (!valid) return;
    onPick(Math.min(Math.round(typed), MAX_GOAL_MINUTES));
    setCustom("");
  };

  return (
    <div>
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

      {allowCustom && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            commit();
          }}
          className="mt-2 flex items-center gap-2"
        >
          <label htmlFor={fieldId} className="text-sm text-muted">
            Custom
          </label>
          <input
            id={fieldId}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_GOAL_MINUTES}
            step={1}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Minutes"
            className="h-11 w-24 rounded-2xl border border-border bg-surface-2 px-3 text-sm font-semibold tabular-nums text-foreground placeholder:font-normal placeholder:text-muted transition-colors hover:border-accent/60 focus:border-accent/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!valid}
            className="h-11 rounded-2xl border border-border bg-surface-2 px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border disabled:hover:text-foreground"
          >
            Set
          </button>
        </form>
      )}
    </div>
  );
}
