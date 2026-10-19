"use client";

import Link from "next/link";
import { FeaturePage } from "./feature-page";
import { Glyph, type GlyphName } from "./glyph";

import { useGems } from "@/lib/gems";
import { useFavorites } from "@/lib/favorites";
import { useMemory } from "@/lib/memorize";
import { countedToday, streakInForce, useStreak } from "@/lib/streak";
import { studyProgress, useStudy } from "@/lib/study";
import { usePuzzleStats } from "@/lib/wordle";

/**
 * The stats page: what the app has kept, and how the daily habit is going.
 *
 * Everything here is read from the stores that already exist — the streak
 * (lib/streak.ts), the memory deck (lib/memorize.ts), the shelf
 * (lib/favorites.ts), the study record (lib/study.ts), and the word puzzle's
 * own count (lib/wordle.ts) — so this page cannot tell the reader a number the
 * rest of the app disagrees with. It is also where the daily goal is set and
 * moved, since a goal is a number to be looked at rather than a switch: the
 * hero on the home screen is the way *in*, and this is where it is tuned.
 */
export function StatsPage() {
  const streak = useStreak();
  const study = useStudy();
  const memory = useMemory();
  const favorites = useFavorites();
  const gems = useGems();
  const puzzles = usePuzzleStats();

  const run = streakInForce(streak);
  const counted = countedToday(streak);
  const progress = studyProgress(study);
  const memorized = memory.filter((item) => item.reviews > 0).length;
  const recitations = memory.reduce((total, item) => total + item.reviews, 0);

  return (
    <FeaturePage featureId="stats">
      <StreakNote run={run} counted={counted} target={progress.target} />

      <div className="mt-3 rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Daily study goal</p>
            <p className="mt-0.5 text-xs text-muted">
              {progress.target === 0
                ? "No goal yet. Set how long you want to give the scriptures each day."
                : `${progress.target} minutes a day. The time you spend reading and studying counts on its own.`}
            </p>
          </div>

          {/* Editing lives in settings, and this is the way there. The lengths
              used to sit right here as five buttons; a settings page with one
              home for every preference is worth the tap, and the goal is the one
              number a reader changes and then leaves alone for weeks. The anchor
              lands on the goal's own card (see components/settings-page.tsx). */}
          <Link
            href="/settings#study-goal"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            <Glyph name="pencil" className="h-4 w-4" />
            Edit
          </Link>
        </div>

        {progress.target > 0 ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted">
              <span className="font-semibold tabular-nums text-foreground">
                {Math.min(progress.minutes, progress.target)} / {progress.target} min today
              </span>
              <span>
                {progress.done ? "Goal reached" : `${progress.remaining} min to go`}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Today's study goal"
              aria-valuemin={0}
              aria-valuemax={progress.target}
              aria-valuenow={Math.min(progress.minutes, progress.target)}
              className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        ) : null}

      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          icon="flame"
          label="Streak"
          value={String(run)}
          unit={run === 1 ? "day" : "days"}
          hint={
            streak.best > 0
              ? `Best: ${streak.best} ${streak.best === 1 ? "day" : "days"}${counted ? " · today counts" : ""}`
              : "Reaching the goal on two days running starts one."
          }
        />
        <StatTile
          icon="book"
          label="Passages read"
          value={String(study.passages)}
          hint="Every passage you have drawn"
        />
        <StatTile
          icon="puzzle"
          label="Daily puzzles"
          value={String(puzzles.solved)}
          hint={
            puzzles.solved === 0
              ? "Find the day's word to start the count."
              : "Days you found the daily word"
          }
        />
        <StatTile
          icon="cards"
          label="Flashcards memorized"
          value={String(memorized)}
          hint={
            memory.length === 0
              ? "Nothing in your memory list yet."
              : `${memory.length} in your list · ${recitations} ${
                  recitations === 1 ? "recitation" : "recitations"
                }`
          }
        />
        <StatTile
          icon="star"
          label="Favorites"
          value={String(favorites.length)}
          hint={
            favorites.length === 0 ? "Nothing starred yet." : "Passages kept on this device"
          }
        />
        <StatTile
          icon="clock"
          label="Time studied"
          value={formatDuration(study.totalSeconds)}
          hint="Counted while a session runs"
        />
        <StatTile
          icon="calendar"
          label="Goal met"
          value={String(study.goalDays)}
          unit={study.goalDays === 1 ? "day" : "days"}
          hint="Days you reached the goal"
        />
        <StatTile
          icon="gem"
          label="Gems"
          value={String(gems.total)}
          hint={`A gem for each minute studied, up to the day's goal${
            gems.today > 0 ? ` · ${gems.today} today` : ""
          }`}
        />
      </div>

      <p className="mt-6 text-xs text-muted">
        All of this lives on this device. Nothing is sent anywhere, and nothing here needs an account.
      </p>
    </FeaturePage>
  );
}

/**
 * The streak, at the head of the page, in the two states a day comes in.
 *
 * A day counts when that day's goal is reached (lib/streak.ts), which is the one
 * thing a number on a tile cannot say for itself: a reader looking at a streak
 * that has not moved since yesterday cannot tell from the number whether the
 * chain is waiting on them, whether a day was missed, or whether the goal is
 * simply untouched. So it is said here instead, above everything else on the
 * page.
 *
 * It is an alert while the day is still open, and that is a deliberate claim on
 * the top of the page: this is the only thing on it that can still be acted on
 * today, and a day not yet counted stops being fixable at midnight. Once today is
 * in there is nothing to act on, so the same block goes quiet in the same place —
 * the page does not reorganise itself around a state.
 *
 * The flame is the app bar's own mark for the streak, drawn at the size an alert
 * asks for rather than the size a chip can afford.
 */
function StreakNote({
  run,
  counted,
  target,
}: {
  /** Days in the run through yesterday, or 0 when there is none. */
  run: number;
  /** Today's goal is met, so today is in the chain. */
  counted: boolean;
  /** The day's goal in minutes, or 0 when none is set. */
  target: number;
}) {
  if (counted) {
    return (
      <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface px-5 py-4">
        <FlameBadge className="h-12 w-12 rounded-full bg-accent/10" glyph="h-7 w-7" />
        <div className="min-w-0">
          <p className="font-serif text-lg font-semibold text-foreground">Today is in.</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {run > 1
              ? `That is ${run} days in a row. Come back tomorrow and reach the goal again to keep it going.`
              : "That is the first day of this run. Come back tomorrow and reach the goal again to make it two."}
          </p>
        </div>
      </div>
    );
  }

  // Nothing set to reach yet, so this can't ask for minutes: the ask is the goal
  // itself, and the picker is the card directly below.
  if (target === 0) {
    return (
      <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface px-5 py-4">
        <FlameBadge className="h-12 w-12 rounded-full bg-surface-2" glyph="h-7 w-7" />
        <div className="min-w-0">
          <p className="font-serif text-lg font-semibold text-foreground">No streak to lock in yet.</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            A day joins the streak when you reach that day&apos;s goal. Choose one just below and today can be
            the first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-accent/50 bg-accent/10 p-5 shadow-sm shadow-accent/10">
      <div className="flex items-start gap-4">
        <FlameBadge className="h-14 w-14 shrink-0 rounded-full bg-accent/20" glyph="h-8 w-8" />
        <div className="min-w-0">
          <p className="font-serif text-xl font-semibold text-foreground">Your streak is waiting!</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Complete today&apos;s study to lock it in.
          </p>
        </div>
      </div>

      <Link
        href="/"
        className="mt-4 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-lg shadow-accent/20 transition-all hover:opacity-90 active:scale-[0.99] sm:w-auto sm:px-8"
      >
        Jump in!
      </Link>
    </div>
  );
}

/** The streak's own mark, on its own circle — the badge either state opens with. */
function FlameBadge({ className, glyph }: { className: string; glyph: string }) {
  return (
    <span className={`grid shrink-0 place-items-center text-accent-strong ${className}`}>
      <Glyph name="flame" className={glyph} />
    </span>
  );
}

/** One number, its name, and the line that keeps it honest. */
function StatTile({
  icon,
  label,
  value,
  unit,
  hint,
}: {
  icon: GlyphName;
  label: string;
  value: string;
  unit?: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-border bg-surface p-4">
      <span className="flex items-center gap-2 text-muted">
        <Glyph name={icon} className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </span>

      <span className="mt-3 flex items-baseline gap-1.5">
        <span className="font-serif text-3xl font-semibold tabular-nums text-foreground">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </span>

      <span className="mt-1 text-xs leading-snug text-muted">{hint}</span>
    </div>
  );
}

/**
 * Studied time as a reader would say it: hours only once there are any, and
 * minutes below that, because "0 h 4 min" is a worse way to say four minutes.
 */
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return String(minutes);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}
