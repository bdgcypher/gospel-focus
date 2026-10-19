"use client";

import { useSyncExternalStore } from "react";
import { addDays, dayKey, daysBetween } from "./daily";

/**
 * The reading streak: how many days in a row the day's study goal was reached.
 *
 * All local, no account — which is what the roadmap calls for. A day counts
 * once, when that day's goal is met, however many sessions it took to get there,
 * and the chain only breaks when a whole day goes by without one.
 *
 * What counts is deliberately not "the app was opened". A chain a tap in the
 * morning could keep alive says nothing about the reading, and it leaves the
 * number climbing on days the goal is never touched — the streak and the goal
 * would be two unrelated readings of the same day. So the day is recorded from
 * the moment the goal is met (components/streak-tracker.tsx), and this store
 * simply keeps the chain.
 */
export interface Streak {
  /** The last day that counted — the day its goal was met — or null before the first. */
  lastDay: string | null;
  /** Consecutive goal-met days ending on `lastDay`. */
  current: number;
  /** The longest run ever reached. */
  best: number;
  /** Every day that has counted, in total. */
  days: number;
}

/**
 * Bumped to v2 when a counted day changed from "the app was opened" to "the
 * goal was reached". The numbers stored under v1 mean the other thing, so they
 * are left where they are rather than read as if they meant this one — which is
 * also the clean slate the new rule is easiest to see from.
 */
const KEY = "gospel-focus:streak:v2";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: Streak = { lastDay: null, current: 0, best: 0, days: 0 };

let cache: Streak | null = null;
let listening = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): Streak {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<Streak> | null;
    if (!value || typeof value !== "object") return EMPTY;
    const current = Number(value.current);
    const best = Number(value.best);
    const days = Number(value.days);
    return {
      lastDay: typeof value.lastDay === "string" ? value.lastDay : null,
      current: Number.isInteger(current) && current > 0 ? current : 0,
      best: Number.isInteger(best) && best > 0 ? best : 0,
      days: Number.isInteger(days) && days > 0 ? days : 0,
    };
  } catch {
    return EMPTY;
  }
}

function read(): Streak {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  cache = parse(window.localStorage.getItem(KEY));
  return cache;
}

function write(next: Streak): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota) — the streak just
    // won't persist; nothing else in the app depends on it.
  }
  for (const listener of listeners) listener();
}

/** Keep another tab's streak in sync with this one. */
function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = parse(e.newValue);
    for (const listener of listeners) listener();
  });
}

/**
 * Count today as a day the goal was reached, and return the streak that leaves
 * behind.
 *
 * Called whenever the day's goal is met. Reaching it twice in a day changes
 * nothing — this store will not count a day it has already counted — and a day
 * with no met goal breaks the chain, so the next one starts it again at 1.
 */
export function recordGoalMetDay(today: string = dayKey()): Streak {
  const previous = read();
  if (previous.lastDay === today) return previous;

  const gap = previous.lastDay ? daysBetween(previous.lastDay, today) : null;
  // Yesterday continues the chain. A gap of a day or more restarts it; a
  // "gap" of zero or less means the clock moved backwards (a timezone change,
  // or a device set by hand), which shouldn't cost the reader their streak.
  const current = gap === null ? 1 : gap === 1 ? previous.current + 1 : gap <= 0 ? previous.current || 1 : 1;

  const next: Streak = {
    lastDay: today,
    current,
    best: Math.max(previous.best, current),
    days: previous.days + 1,
  };
  write(next);
  return next;
}

/**
 * Take today back out of the streak, for the one case where it cannot be true:
 * today is recorded as counted, but not a single second has been studied today.
 *
 * There is no legitimate way to reach a goal with zero minutes studied, so the
 * entry can only be a leftover from a stale day — minutes from yesterday read as
 * today's. This is the repair for a record written before that hole was closed
 * (lib/study.ts now rolls the day on every read), and is a no-op unless today is
 * the recorded day.
 *
 * Only the day itself is given back: a run of one goes back to no run at all,
 * and a longer run hands its end back to yesterday, which is the day it actually
 * reached. `best` is left alone — the previous record is not stored, and
 * lowering it could erase a genuine one, so the worst case is a best that is a
 * day higher than any run that really happened.
 */
export function dropDay(today: string = dayKey()): Streak {
  const previous = read();
  if (previous.lastDay !== today) return previous;

  const current = Math.max(0, previous.current - 1);
  const next: Streak = {
    lastDay: current > 0 ? addDays(today, -1) : null,
    current,
    best: previous.best,
    days: Math.max(0, previous.days - 1),
  };
  write(next);
  return next;
}

/**
 * The streak as it stands today, for display: a chain is still intact on the
 * day after its last counted day, so yesterday's run keeps showing until
 * midnight passes. After that it is over, and 0 is the honest number.
 *
 * Note what this does *not* do: it never counts today until today is in. The
 * run through yesterday is what a reader has, and it is shown as it stands —
 * whether or not today's goal is done is a separate question, and one the UI
 * answers separately (see status-tray.tsx).
 */
export function streakInForce(streak: Streak, today: string = dayKey()): number {
  if (!streak.lastDay) return 0;
  const gap = daysBetween(streak.lastDay, today);
  return gap === 0 || gap === 1 ? streak.current : 0;
}

/**
 * Whether today is in the chain — its goal has been reached, today or at any
 * point since midnight, so the UI can say "today is in".
 */
export function countedToday(streak: Streak, today: string = dayKey()): boolean {
  return streak.lastDay === today;
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The stored streak. Empty during server rendering. */
export function useStreak(): Streak {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
