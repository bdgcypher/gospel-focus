"use client";

import { useSyncExternalStore } from "react";
import { dayKey, daysBetween } from "./daily";

/**
 * The reading streak: how many days in a row the app has been opened.
 *
 * All local, no account — which is what the roadmap calls for. A day counts
 * once, however many times the app is opened during it, and the chain only
 * breaks when a whole day goes by without one.
 */
export interface Streak {
  /** The last day that counted, or null before the first open. */
  lastDay: string | null;
  /** Consecutive days ending on `lastDay`. */
  current: number;
  /** The longest run ever reached. */
  best: number;
  /** Every day that has counted, in total. */
  days: number;
}

const KEY = "open-to-inspiration:streak:v1";

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
 * Count today as a day of use, and return the streak that leaves behind.
 *
 * Called once when the app starts. Opening it twice in a day changes nothing;
 * a day with no open breaks the chain, and the next open starts it again at 1.
 */
export function recordVisit(today: string = dayKey()): Streak {
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
 * The streak as it stands today, for display: a chain is still intact on the
 * day after its last open, so yesterday's run keeps showing until midnight
 * passes. After that it is over, and 0 is the honest number.
 */
export function streakInForce(streak: Streak, today: string = dayKey()): number {
  if (!streak.lastDay) return 0;
  const gap = daysBetween(streak.lastDay, today);
  return gap === 0 || gap === 1 ? streak.current : 0;
}

/** Whether a day is already counted, so the UI can say "today is in". */
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
