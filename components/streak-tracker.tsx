"use client";

import { useEffect } from "react";
import { recordGoalMetDay } from "@/lib/streak";
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
 */
export function StreakTracker() {
  const study = useStudy();
  const met = goalReached(study);

  useEffect(() => {
    if (met) recordGoalMetDay();
  }, [met]);

  return null;
}
