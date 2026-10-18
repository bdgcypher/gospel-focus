"use client";

import Link from "next/link";
import { Glyph, type GlyphName } from "./glyph";
import { useCoins } from "@/lib/coins";
import { focusStatus, useFocus, type FocusStatus } from "@/lib/focus";
import { countedToday, streakInForce, useStreak } from "@/lib/streak";
import { studyProgress, useStudy } from "@/lib/study";

/**
 * The status lights in the header: the day's study goal, the streak, and the
 * focus gate.
 *
 * These used to be full cards on the hub, which cost the reader a third of the
 * first screen to say three short things. A chip says the same thing in the
 * corner, keeps saying it on every page rather than only on the hub, and gives
 * each one a place to be tapped: the day's minutes open the study section, the
 * streak opens the stats page, the gate opens its own. The header is the right
 * home for them
 * because they describe *how it is going*, not what to do next — and what to do
 * next is the hero directly below it.
 *
 * None of them wear a pill at rest. Three tinted, bordered lozenges in a row
 * read as three buttons competing with the sections beside them, and the mark
 * that a state is *live* is better carried by the glyph and the number than by
 * a background. The pill comes back on hover and on keyboard focus, which is
 * where a background earns its keep — it says which one the pointer is over.
 */
export function StatusTray() {
  const streak = useStreak();
  const focus = useFocus();
  const study = useStudy();
  const run = streakInForce(streak);
  // Whether today's goal is in. The streak and the goal are the same day read
  // twice, so the chip is faded until they agree (lib/streak.ts).
  const counted = countedToday(streak);
  const status = focusStatus(focus);
  const progress = studyProgress(study);
  const coins = useCoins();
  // The bar stops at the goal rather than running past it: once the day is in,
  // the extra minutes are still studied, but they are no longer progress towards
  // anything, and "47/10 min" reads as a mistake rather than a good day.
  const studied = Math.min(progress.minutes, progress.target);

  return (
    <div className="app-status-tray flex min-w-0 shrink-0 items-center gap-0.5">
      {/* Only once a goal exists: with none set there is nothing to be a
          fraction of, and "0/0 min" is noise.

          It opens the study section rather than the hub, even though the hero
          that owns the goal is on the hub: what the number is counting is
          minutes, and the tools that spend them are the ones behind this door.
          A reader who wants to move the number has the hero and the stats page;
          a reader following it wants somewhere to study. */}
      {progress.target > 0 && (
        <StatusChip
          href="/study"
          tone="quiet"
          text={`${studied}/${progress.target} min`}
          progress={progress.percent}
          title={
            progress.done
              ? `Today's goal is met — ${studied} of ${progress.target} minutes. Open the study section.`
              : `${studied} of ${progress.target} minutes studied today, ${progress.remaining} to go. Open the study section.`
          }
          label="Daily study goal"
        />
      )}

      {/* The wallet, between the minutes that fill it and the streak those
          minutes keep. One coin is one studied minute up to the day's goal
          (lib/coins.ts), so the three chips in a row read as one story: what
          today is worth, what has been collected, and how long the run is. */}
      <StatusChip
        href="/stats"
        icon="coin"
        tone={coins.today > 0 ? "accent" : "quiet"}
        text={String(coins.total)}
        title={
          coins.today > 0
            ? `${coins.total} ${coins.total === 1 ? "coin" : "coins"} in the wallet, ${coins.today} earned today — a coin for each minute studied, up to the day's goal. Open your stats.`
            : `${coins.total} ${coins.total === 1 ? "coin" : "coins"} in the wallet. A minute studied earns a coin, up to the day's goal. Open your stats.`
        }
        label="Coins"
      />

      {/* The run through yesterday, faded until today's goal is met: the number
          is real either way, but a chain that is not yet continued today is not
          a live thing, and the tint is how this row says so. Reaching the goal
          lights it and turns today into a day of the run.

          The zero is drawn like any other number. A chip that says nothing until
          there is a run to show leaves a reader unable to tell a streak of none
          from a streak whose chip failed to appear — and the flame with no
          number beside it is the quietest possible way to say the least
          interesting thing in the row. A faded nought says it outright. */}
      <StatusChip
        href="/stats"
        icon="flame"
        text={String(run)}
        tone={run > 0 && counted ? "accent" : "quiet"}
        title={
          run === 0
            ? "No streak running yet — reaching today's goal starts one. Open your stats."
            : counted
              ? `You've reached your goal ${run} ${run === 1 ? "day" : "days"} in a row, today included. Open your stats.`
              : `You've reached your goal ${run} ${run === 1 ? "day" : "days"} in a row, but not today: today counts once the goal is met. Open your stats.`
        }
        label="Your stats"
      />

      {/* The padlock is shut in exactly one state: set up and waiting on the
          day's study — the only one where anything is actually being held back.
          The other two wear the open shackle: a lock that was never set up, and
          one standing open by hand. A shut padlock for a gate that is open says
          the opposite of what is true. The tint follows the same line, so the
          accent means "holding" and never "nothing here yet". */}
      <StatusChip
        href="/focus"
        icon={status === "locked" ? "lock" : "lock-open"}
        tone={status === "locked" ? "accent" : "quiet"}
        dot={status === "locked"}
        title={FOCUS_TITLES[status]}
        label="Focus lock"
      />
    </div>
  );
}

const FOCUS_TITLES: Record<FocusStatus, string> = {
  unset: "Focus lock isn't set up yet. Open it to set it up.",
  locked: "Focus lock is on and waiting on the day's study.",
  overridden: "Open by hand. The lock shuts itself again when the bypass runs out.",
};

interface ChipProps {
  href: string;
  title: string;
  label: string;
  text?: string;
  tone: "accent" | "quiet";
  /** An optional glyph for chips that want one (streak, focus, etc.). */
  icon?: GlyphName;
  /** A small mark for a state that is waiting on the reader. */
  dot?: boolean;
  /** How full the chip's own hairline bar is, 0–100. Omitted when there is none. */
  progress?: number;
}

/**
 * One status light. Borderless and untinted at rest; the pill and the tint
 * arrive on hover and on keyboard focus, so the row reads as three quiet marks
 * until the reader reaches for one.
 *
 * The optional hairline under the reading is the day's goal in miniature — the
 * same fraction the hub's bar shows, small enough to sit inside a chip. It is
 * as wide as the "0/10 min" above it rather than as wide as the chip, so the
 * bar and its own number start and end together and read as one thing.
 */
function StatusChip({
  href,
  icon,
  title,
  label,
  text,
  tone,
  dot = false,
  progress,
}: ChipProps) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={`${label}: ${title}`}
      className={`group relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-semibold transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent-strong focus-visible:border-accent/40 focus-visible:bg-accent/10 focus-visible:text-accent-strong ${
        tone === "accent" ? "text-accent-strong" : "text-muted"
      }`}
    >
      {/* A column, so a chip that has both a reading and a bar stacks them:
          the glyph (when there is one) and the number on the first line, the
          bar directly beneath, exactly as wide as that first line. */}
      <span className="flex flex-col items-stretch gap-[3px]">
        <span className="flex items-center gap-1.5">
          {icon && <Glyph name={icon} className="h-4 w-4" />}
          {text && <span className="tabular-nums">{text}</span>}
        </span>
        {progress !== undefined && (
          <span
            aria-hidden="true"
            className="h-[3px] w-full overflow-hidden rounded-full bg-accent/20"
          >
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </span>
        )}
      </span>
      {dot && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" />
      )}
    </Link>
  );
}
