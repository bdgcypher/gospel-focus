"use client";

import Link from "next/link";
import { useState } from "react";
import { Glyph } from "./glyph";
import { GoalPicker } from "./goal-picker";
import { setGoalMinutes, studyProgress, useStudy } from "@/lib/study";

/**
 * The hero: one way in, and how far along it is.
 *
 * This is the app's single call to action, sitting directly under the page's own
 * "Today" heading — the heading stayed with the page rather than the card, so
 * the card is free to do one thing. It is the only block on the hub that asks
 * for anything. Two states, one button between them: with no goal set it asks
 * for one, and with a goal set it is the door to the study section, which is
 * where the day's minutes are earned.
 *
 * It is a door and not a switch on purpose. The timer used to be started here and
 * then ran wherever the reader wandered, which made the hub the only way to begin
 * and left a session running behind a page that had nothing to study on. Now the
 * timer starts itself on the pages that study (components/study-tracker.tsx),
 * and this button takes the reader to them.
 *
 * There is still no timer to watch: the minutes accrue on their own and the bar
 * is the whole of the feedback. When the goal is reached the session closes
 * itself, which is the small reward the roadmap asks for — and the reader is left
 * looking at the verse of the day, one line below.
 *
 * Once a goal exists the card has one job left: show how far along the day is and
 * offer the way in. Nothing on it edits the goal — the goal is set once, in
 * settings, where a reader who wants a different one goes. Under the bar sits one
 * quiet line saying what does and doesn't count, which is the question a reader
 * meeting the bar for the first time actually has.
 */
export function GoalHero() {
  const study = useStudy();
  const progress = studyProgress(study);
  /** Whether the length chips are out, while a goal is being created. */
  const [creating, setCreating] = useState(false);

  const onPick = (minutes: number) => {
    setGoalMinutes(minutes);
    setCreating(false);
  };

  /* The completed day is its own card: a green face with green type, and the
     bar and the button that carries on studying in a deeper green (see the
     `--goal-*` tokens). Every state keeps the same padding and the same button
     geometry, so only the colour changes when the last minute lands. */
  const done = progress.done;

  return (
    <section
      className={`rounded-3xl border p-5 sm:p-6 ${
        done ? "border-goal-border bg-goal-card text-goal-ink" : "border-border bg-surface"
      }`}
    >
      {progress.target === 0 ? (
        creating ? (
          <div>
            <p className="font-serif text-lg font-semibold text-foreground">How long each day?</p>
            <p className="mt-1 text-sm text-muted">
              The minutes count themselves whenever you are reading or studying, and there is no timer to
              watch.
            </p>
            <div className="mt-4">
              <GoalPicker onPick={onPick} />
            </div>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="mt-3 text-sm font-medium text-muted transition-colors hover:text-accent-strong"
            >
              Not now
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted">
              Give a few minutes a day to the scriptures. The time you spend reading and studying counts
              toward it on its own, and there is no timer to watch.
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-cta px-6 py-4 text-base font-semibold text-cta-contrast shadow-lg shadow-cta/20 transition-all hover:opacity-90 sm:text-lg"
            >
              <Glyph name="plus" className="h-5 w-5" />
              Create daily study goal
            </button>
          </div>
        )
      ) : (
        <div>
          {/* The status line is optional; its spacing comes from its own
              margin, so the button sits the same distance below the card's
              edge in every state rather than shifting between them. */}
          {done ? (
            <p className="mb-4 flex items-center gap-2 font-serif text-lg font-semibold text-goal-ink">
              <Glyph name="check" className="h-5 w-5" />
              Goal complete!
            </p>
          ) : null}

          <Link
            href="/study"
            className={`inline-flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-4 text-base font-semibold shadow-lg transition-all hover:opacity-90 sm:text-lg ${
              done
                ? "bg-goal-bar text-goal-bar-contrast shadow-goal-bar/20"
                : "bg-cta text-cta-contrast shadow-cta/20"
            }`}
          >
            <Glyph name="book" plain className="h-5 w-5" />
            {done ? "Study more" : "Start studying"}
          </Link>

          <StudyBar
            minutes={progress.minutes}
            target={progress.target}
            remaining={progress.remaining}
            percent={progress.percent}
            done={done}
          />

          <p className={`mt-3 text-xs ${done ? "text-goal-muted" : "text-muted"}`}>
            Any time spent on Study Activities is counted towards your goal
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The goal bar: the reader's minutes over the day's target, with both written
 * out. The numbers are the honest part — a bar alone can't say whether three
 * minutes of five have passed or the whole thing has barely started.
 */
function StudyBar({
  minutes,
  target,
  remaining,
  percent,
  done,
}: {
  minutes: number;
  target: number;
  remaining: number;
  percent: number;
  done: boolean;
}) {
  return (
    <div className="mt-4">
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-3 text-xs ${
          done ? "text-goal-muted" : "text-muted"
        }`}
      >
        <span className={`font-semibold tabular-nums ${done ? "text-goal-strong" : "text-foreground"}`}>
          {Math.min(minutes, target)} / {target} min
        </span>
        <span>{done ? "Goal reached" : `${remaining} min to go`}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Today's study goal"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(minutes, target)}
        className={`mt-2 h-2.5 w-full overflow-hidden rounded-full ${done ? "bg-goal-track" : "bg-surface-2"}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            done ? "bg-goal-bar" : "bg-accent"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
