"use client";

import Link from "next/link";
import { FeaturePage } from "./feature-page";
import { Glyph, type GlyphName } from "./glyph";

import { addDays, dayKey } from "@/lib/daily";
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
      <StreakNote
        run={run}
        counted={counted}
        target={progress.target}
        lastDay={streak.lastDay}
      />

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
              className={`mt-2 h-2.5 w-full overflow-hidden rounded-full ${
                progress.done ? "bg-goal-track" : "bg-surface-2"
              }`}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                  progress.done ? "bg-goal-bar" : "bg-accent"
                }`}
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
 * The streak, at the head of the page, drawn as the habit it is.
 *
 * A day counts when that day's goal is reached (lib/streak.ts), which is the one
 * thing a number on a tile cannot say for itself: a reader looking at a streak
 * that has not moved since yesterday cannot tell from the number whether the
 * chain is waiting on them, whether a day was missed, or whether the goal is
 * simply untouched. So the card says it in two marks instead — the flame and the
 * check light when today is in, and stay muted while it is still open — and backs
 * them with a strip of days.
 *
 * The strip is the current run and only the current run: the store keeps the
 * length of a run, its last day, and the number of days ever counted, but not
 * which day each of those was (lib/streak.ts). A full year of squares would have
 * to invent the days before this run, so the run is drawn from its own first day
 * to its last and every other square is left quiet. That still makes the shape of
 * the habit visible — a long run fills most of the strip, a new one is a handful
 * of lit squares at the end — without claiming anything the record does not hold.
 */
function StreakNote({
  run,
  counted,
  target,
  lastDay,
}: {
  /** Days in the run through yesterday, or 0 when there is none. */
  run: number;
  /** Today's goal is met, so today is in the chain. */
  counted: boolean;
  /** The day's goal in minutes, or 0 when none is set. */
  target: number;
  /** The last day the goal was met, or null before the first. */
  lastDay: string | null;
}) {
  const title = target === 0 ? "No streak yet" : run > 0 ? `${run}-day streak` : "No run going";

  const body = counted
    ? "Way to go! Come back tomorrow to keep the fire alive!"
    : target === 0
      ? "Set a daily goal below and today can be the first."
      : run > 0
        ? `Reach today's goal to make it ${run + 1}.`
        : "Reach today's goal to start one.";

  return (
    <section
      className="streak-card rounded-3xl border border-border bg-surface p-4 sm:p-5"
      data-counted={counted}
    >
      <div className="flex items-start gap-3.5">
        {/* The flame is the app bar's own mark for the streak. It is lit and in
            colour on the day the goal is met, and greyed while the day is still
            open — the mark itself is the state, not a badge beside it. */}
        <span className="streak-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2">
          <Glyph
            name="flame"
            className={`h-6 w-6 ${
              counted ? "text-accent-strong" : "text-muted/60 opacity-60 grayscale"
            }`}
          />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="streak-title font-serif text-lg font-semibold leading-tight text-foreground">
            {title}
          </p>
          <p className="streak-body mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
        </div>

        {/* The day's own mark: filled when the goal is met, a quiet outline
            waiting for it otherwise. */}
        <span
          aria-hidden="true"
          className={`streak-check grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
            counted ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted/40"
          }`}
        >
          <Glyph name="check" className="h-5 w-5" />
        </span>
      </div>

      <StreakGrid run={run} lastDay={lastDay} counted={counted} />
    </section>
  );
}

/** The stretch of days the streak card draws, in weeks. */
const STREAK_WEEKS = 21;
const STREAK_DAYS = STREAK_WEEKS * 7;

/**
 * The run as a strip of days: one square per day, the most recent at the
 * bottom-right, and only the days of the current run lit.
 *
 * The run's dates come from its last day and its length, both already in the
 * record, so nothing here has to guess at a missing day. Squares after the run
 * are days the goal has not been met yet (today, while it is still open);
 * squares before it are simply outside this run. The strip is quiet enough to
 * sit under the heading without competing with it, and the day shape reads at a
 * glance: a run is a block of light at the end of the strip.
 */
function StreakGrid({
  run,
  lastDay,
  counted,
}: {
  run: number;
  lastDay: string | null;
  counted: boolean;
}) {
  const today = dayKey();
  const from = run > 0 && lastDay ? addDays(lastDay, -(run - 1)) : null;
  const days = Array.from({ length: STREAK_DAYS }, (_, index) =>
    addDays(today, index - (STREAK_DAYS - 1))
  );
  const lit = days.filter(
    (day) => from !== null && lastDay !== null && day >= from && day <= lastDay
  ).length;

  const label =
    run === 0
      ? `No days in the current run yet. Each dot is one of the last ${STREAK_DAYS} days.`
      : `${run} ${run === 1 ? "day" : "days"} in the current run${
          counted ? ", today included" : ""
        }. ${lit} of the last ${STREAK_DAYS} days are lit.`;

  return (
    <div
      role="img"
      aria-label={label}
      className="mt-4 grid grid-flow-col grid-cols-[repeat(21,minmax(0,1fr))] grid-rows-[repeat(7,minmax(0,1fr))] gap-[3px]"
    >
      {days.map((day) => {
        const on = from !== null && lastDay !== null && day >= from && day <= lastDay;
        return (
          <span
            key={day}
            aria-hidden="true"
            className={`streak-dot aspect-square rounded-[3px] ${
              on ? "streak-dot-on bg-accent" : "bg-border/60"
            }`}
          />
        );
      })}
    </div>
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
