"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Glyph } from "./glyph";
import { GoalPicker } from "./goal-picker";
import { readFocusAccessibility, type FocusAccessibility } from "@/lib/native-focus";
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
 * meeting the bar for the first time actually has. What it says about the Gospel
 * Library depends on the device, and only ever claims what is true there (see
 * `useLibraryReading`).
 */
export function GoalHero() {
  const study = useStudy();
  const progress = studyProgress(study);
  const library = useLibraryReading();
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
            {library?.supported && library.enabled ? (
              // Counting, so say so plainly.
              "Any time spent on Study Activities or in the Gospel Library App is counted towards your goal"
            ) : library?.supported ? (
              // Not counting, but this device could: the way to turn it on, in
              // the sentence rather than hidden in settings.
              <>
                Any time spent on Study Activities is counted towards your goal. Set up{" "}
                <Link
                  href="/settings#gospel-library-sync"
                  className="font-medium text-accent-strong underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent-strong"
                >
                  Gospel Library Sync
                </Link>{" "}
                to count study done in the Gospel Library App as well.
              </>
            ) : (
              // Everywhere else — the web, a desktop page, iOS — the Gospel
              // Library half cannot exist, so the line says nothing about it
              // rather than offering a setting that would not work.
              "Any time spent on Study Activities is counted towards your goal"
            )}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Where the device stands on counting Gospel Library reading: can it, and is it.
 *
 * It is counted by the accessibility service — the same grant Focus Lock asks for,
 * off until the reader gives it — so the card cannot promise it merely because
 * the app is on Android, and cannot offer to set it up in a browser that has no
 * such settings screen at all. This reads the device rather than the stored
 * state, the way the Focus page's own permission row does, and re-reads it when
 * the reader comes back from Android's settings, which is the only way to know
 * they changed anything.
 *
 * Null until the first answer arrives, so the line starts as the claim that is
 * always true and grows the rest a moment later rather than the other way round:
 * a promise withdrawn on load is worse than one arriving late.
 */
function useLibraryReading(): FocusAccessibility | null {
  const [access, setAccess] = useState<FocusAccessibility | null>(null);

  useEffect(() => {
    let live = true;

    const read = () => {
      // Resolves to `supported: false` on the web and on iOS, where there is no
      // such service to grant — and on a build whose bridge is missing.
      void readFocusAccessibility().then((next) => {
        if (live) setAccess(next);
      });
    };

    read();
    const onVisible = () => {
      if (!document.hidden) read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return access;
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
