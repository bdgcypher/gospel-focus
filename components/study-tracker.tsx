"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isStudyPath } from "@/lib/features";
import { addStudySeconds, startSession, stopSession, useStudy } from "@/lib/study";

/**
 * Runs the study timer wherever there is something to study, and counts the
 * minutes of it.
 *
 * The session is no longer the reader's to start. Being on a page that studies is
 * the whole of the condition — the passage picker, the study tools, the section
 * that gathers them (lib/features.ts names them) — so opening the picker from a
 * reminder, or going straight to the memorization list, counts without anyone
 * remembering to press anything. The hub keeps a way in of its own, as a door
 * that goes to the study section, and the reader who wanders off it leaves the
 * timer behind: this is a record of minutes spent studying, not of the app being
 * open.
 *
 * What is left is the counting, and the tick is deliberately coarse (one minute):
 * the hub's bar is measured in minutes, so writing more often buys the reader
 * nothing but a bar that twitches, and a timer that fires this rarely costs the
 * battery almost nothing. A minute is also the granularity the bar can actually
 * show — the display is in whole minutes — so the number the reader sees is never
 * more than one tick behind the time they have really spent. The part-minute
 * banked on the way out of a page is kept, because the record is of time spent
 * rather than of ticks; it is the bar that leaves it alone, and draws whole
 * minutes only (lib/study.ts), so bar and number move together.
 */

/** How often the counted time is banked, and so how often the bar moves. */
const TICK_MS = 60_000;

/**
 * A single tick is capped at two minutes — two ticks' worth, so a tick that
 * arrives late still credits the seconds it carries instead of quietly dropping
 * them, since an interval of exactly a minute never fires at exactly a minute.
 * A device that sleeps mid-session is the case this really guards against:
 * crediting that whole span as study would make the goal meaningless, so the
 * rest is dropped.
 */
const MAX_TICK_SECONDS = 120;

export function StudyTracker() {
  const { running } = useStudy();
  const pathname = usePathname();
  const studying = isStudyPath(pathname);

  // The switch follows the page. There is nothing to cancel that isn't also
  // covered by that rule: a reader who steps away from the tools ends the
  // session, and the seconds spent away are never counted, because the timer
  // that would count them has already been stopped.
  useEffect(() => {
    if (studying) startSession();
    else stopSession();
  }, [studying]);

  useEffect(() => {
    if (!running || typeof document === "undefined") return;

    let since = Date.now();
    let timer: number | undefined;

    const bank = () => {
      const now = Date.now();
      const seconds = Math.min((now - since) / 1000, MAX_TICK_SECONDS);
      since = now;
      if (seconds >= 1) addStudySeconds(seconds);
    };

    const start = () => {
      if (timer !== undefined) return;
      since = Date.now();
      timer = window.setInterval(bank, TICK_MS);
    };

    // Stopping banks the part-minute since the last tick — and only when a
    // tick was actually running, so time the app spent out of sight is never
    // credited on the way out.
    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
      bank();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    // A page being dismissed doesn't always get a visibility change first, so
    // the last few seconds are banked here too.
    window.addEventListener("pagehide", stop);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [running]);

  return null;
}
