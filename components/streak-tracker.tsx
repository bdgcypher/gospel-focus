"use client";

import { useEffect } from "react";
import { dayKey } from "@/lib/daily";
import { countedToday, dropDay, recordGoalMetDay, useStreak } from "@/lib/streak";
import { goalReached, useStudy } from "@/lib/study";

/**
 * Puts a day in the streak the moment that day's goal is reached.
 *
 * The streak used to be recorded by opening the app (see lib/streak.ts, which
 * holds the rest of that argument). That left the number climbing on days the
 * goal was never touched, so the record is made here instead, where the two
 * readings it is made of can be seen together: the minutes counted today and the
 * goal they are measured against.
 *
 * Mounted by the shell, so it watches on every page, after every tick of a
 * running session, and whenever the goal itself is moved — lowering the goal to
 * what has already been studied meets it, and that counts like any other day. It
 * also catches up on the first render, which covers a goal met in another tab, or
 * one met before this component existed. The store, not this effect, is what
 * decides a day counts once.
 *
 * The reverse is watched too, and only in the one case where a recorded day
 * cannot be true: today is in the streak but not a second has been studied
 * today. That is what a record made from yesterday's minutes leaves behind (the
 * study store used to keep a stale day while the app stayed open overnight), so
 * it is given back here rather than left to disagree with the bar until
 * midnight (lib/streak.ts).
 */
export function StreakTracker() {
  const study = useStudy();
  const streak = useStreak();
  const met = goalReached(study);

  useEffect(() => {
    if (met) {
      recordGoalMetDay();
      return;
    }
    // The day has to be today's own record: the store's empty snapshot (day
    // "") is a real state during hydration, and a record read against it would
    // throw away a day that was earned.
    if (study.seconds === 0 && study.day === dayKey() && countedToday(streak)) dropDay();
  }, [met, study.seconds, study.day, streak]);

  return null;
}
