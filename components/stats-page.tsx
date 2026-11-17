"use client";

import Link from "next/link";
import { FeaturePage } from "./feature-page";
import { Glyph, type GlyphName } from "./glyph";

import { useGems } from "@/lib/gems";
import { useFavorites } from "@/lib/favorites";
import { useMemory } from "@/lib/memorize";
import { streakInForce, useStreak } from "@/lib/streak";
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
  const progress = studyProgress(study);
  const memorized = memory.filter((item) => item.reviews > 0).length;

  return (
    <FeaturePage featureId="stats" subtitle="">
      <div className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Daily study goal</p>
            {progress.target === 0 && (
              <p className="mt-0.5 text-xs text-muted">
                No goal yet. Set how long you want to give the scriptures each day.
              </p>
            )}
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
          // The strip and the freezes live on their own page now; the tile
          // stays here as the number, and opens the page that explains it.
          href="/streak"
          hint={
            streak.best > 0
              ? `Best: ${streak.best} ${streak.best === 1 ? "day" : "days"}`
              : "Reaching the goal on two days running starts one. Open your streak."
          }
        />
        <StatTile icon="book" label="Random verses read" value={String(study.passages)} />
        <StatTile icon="puzzle" label="Daily puzzles solved" value={String(puzzles.solved)} />
        <StatTile icon="cards" label="Flashcards memorized" value={String(memorized)} />
        <StatTile
          icon="heart"
          // The shelf's own drawn mark, whatever the skin: a heart that is a
          // label here, not a picture of something on sale.
          plain
          label="Favorites"
          value={String(favorites.length)}
        />
        <StatTile icon="clock" label="Total time studied" value={formatDuration(study.totalSeconds)} />
        <StatTile
          icon="calendar"
          label="Daily study goal"
          value={String(study.goalDays)}
          unit={study.goalDays === 1 ? "day" : "days"}
        />
        <StatTile icon="gem" label="Gems" value={String(gems.total)} />
      </div>

      <p className="mt-6 text-xs text-muted">
        All of this lives on this device. Nothing is sent anywhere, and nothing here needs an account.
      </p>
    </FeaturePage>
  );
}

/** One number and its name, with a line under it where the number has one. */
function StatTile({
  icon,
  label,
  value,
  unit,
  hint,
  href,
  plain,
}: {
  icon: GlyphName;
  label: string;
  value: string;
  unit?: string;
  /** The line under the number, for a tile with something to say about it. */
  hint?: string;
  /** Somewhere to go for the number's own page, where it has one. */
  href?: string;
  /** Keep the drawn mark in the playful skins as well (see components/glyph.tsx). */
  plain?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-muted">
        <Glyph name={icon} className="h-4 w-4" plain={plain} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </span>

      <span className="mt-3 flex items-baseline gap-1.5">
        <span className="font-serif text-3xl font-semibold tabular-nums text-foreground">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </span>

      {hint && <span className="mt-1 text-xs leading-snug text-muted">{hint}</span>}
    </>
  );

  return href ? (
    <Link
      href={href}
      className="flex flex-col rounded-3xl border border-border bg-surface p-4 transition-colors hover:border-accent/60"
    >
      {body}
    </Link>
  ) : (
    <div className="flex flex-col rounded-3xl border border-border bg-surface p-4">{body}</div>
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
