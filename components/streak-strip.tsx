"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Glyph } from "./glyph";
import { addDays, daysBetween } from "@/lib/daily";
import { streakDay, type Streak } from "@/lib/streak";

/**
 * The streak strip: the run drawn as one horizontal line of days.
 *
 * A square says one of three things. Gold is a day the goal was met; the
 * button blue is a day a freeze kept alive; a plain well is a day nothing
 * happened. That is the whole record the store keeps — the days the goal was
 * met (`history`) and the days a freeze covered (`frozen`) — so nothing here is
 * inferred from a run's length, which would put a freeze's square in the
 * earned colour. Today is the square with the gold outline: the newest day,
 * whatever its colour, so the reader can find their place at the end of the
 * line without counting back from the corner.
 *
 * The strip is read in blocks of three weeks: twenty-one columns of seven
 * days, each block a page. The newest block ends today at its bottom-right,
 * and the page opens there. Walking back is a swipe or the two round buttons;
 * the arrows stop at the first block and the newest one. A reader with less
 * than three weeks behind them gets one block, with empty wells before their
 * first tracked day, so the buttons say honestly that there is nothing older
 * to see yet.
 *
 * In the playful skin the card that holds this strip takes a slow orange
 * reflection when today is in the run (see `.streak-card` in app/globals.css).
 */
export function StreakStrip({ streak, today }: { streak: Streak; today: string }) {
  const earliest = [...streak.history, ...streak.frozen].sort()[0] ?? today;
  const tracked = Math.max(1, daysBetween(earliest, today) + 1);
  // Full pages only, so every block is the same width and the newest one ends
  // exactly today. The oldest page may open before the first tracked day;
  // those days are wells, not invented history.
  const pages = Math.max(1, Math.ceil(tracked / DAYS_PER_PAGE));
  const days = pages * DAYS_PER_PAGE;
  const start = addDays(today, -(days - 1));

  const scroller = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(pages - 1);

  // Open on the newest page, and stay there when a day is added. The effect
  // runs before paint so the strip never flashes its oldest page first. The
  // component is only mounted once the reader's own day is known, so there is
  // no server render for a layout effect to warn about.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setPage(pages - 1);
  }, [pages]);

  const step = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
  };

  const sync = () => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.max(
      0,
      Math.min(pages - 1, Math.round(el.scrollLeft / el.clientWidth))
    );
    setPage((current) => (current === next ? current : next));
  };

  const earned = streak.history.length;
  const frozen = streak.frozen.length;
  const summary =
    earned === 0 && frozen === 0
      ? "no days tracked yet"
      : `${earned} ${earned === 1 ? "day" : "days"} reached the goal${
          frozen > 0
            ? ` and ${frozen} ${frozen === 1 ? "day was" : "days were"} kept by a freeze`
            : ""
        }`;

  return (
    <div className="relative mt-4">
      <div
        ref={scroller}
        onScroll={sync}
        tabIndex={0}
        role="group"
        aria-label={`Streak history: ${summary}. Swipe or use the arrows for earlier days.`}
        // The scrollbar would sit under the squares as a second, louder rule;
        // the arrows and the swipe are the way through the strip.
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Array.from({ length: pages }, (_, pageIndex) => {
          const pageStart = addDays(start, pageIndex * DAYS_PER_PAGE);

          return (
            <div
              key={pageIndex}
              className="flex w-full shrink-0 basis-full snap-start gap-[3px]"
            >
              {Array.from({ length: WEEKS_PER_PAGE }, (_, weekIndex) => (
                <div key={weekIndex} className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  {Array.from({ length: 7 }, (_, dayIndex) => {
                    const day = addDays(pageStart, weekIndex * 7 + dayIndex);
                    const state = streakDay(streak, day);

                    return (
                      <span
                        key={day}
                        aria-hidden="true"
                        // The outline is an inset ring rather than a border or
                        // an offset ring: at 13px a border would shrink the
                        // square's own colour, and an offset ring has only the
                        // 3px gap to live in before it touches the next day.
                        // It wears the accent — the same gold a counted day is
                        // painted — rather than the page's ink, which on a dark
                        // page is a white ring the squares do not ask for. On
                        // the freeze blue and on a plain well it is the one warm
                        // mark in the strip, which is what today is. On a
                        // counted today it sinks into the square's own gold; the
                        // day is already the success colour, and the newest page
                        // ends there, so nothing is lost by not drawing twice.
                        className={`aspect-square rounded-[3px] ${
                          state === "counted"
                            ? "bg-accent"
                            : state === "frozen"
                              ? "bg-frozen"
                              : "bg-border/60"
                        }${
                          day === today ? " ring-2 ring-inset ring-accent" : ""
                        }`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end gap-1.5">
        <StripStep
          label="Earlier days"
          disabled={page <= 0}
          onClick={() => step(-1)}
          direction="back"
        />
        <StripStep
          label="Later days"
          disabled={page >= pages - 1}
          onClick={() => step(1)}
          direction="forward"
        />
      </div>
    </div>
  );
}

/** Three weeks of seven-day columns; the width the strip was designed around. */
const WEEKS_PER_PAGE = 21;
const DAYS_PER_PAGE = WEEKS_PER_PAGE * 7;

/** One strip step, drawn in the app's shared hand. */
function StripStep({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: "back" | "forward";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-default disabled:opacity-35 disabled:hover:border-border disabled:hover:text-muted"
    >
      <Glyph name="arrow" className={`h-4 w-4 ${direction === "back" ? "rotate-180" : ""}`} />
    </button>
  );
}
