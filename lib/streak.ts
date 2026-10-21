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
 *
 * One thing protects the chain. A streak freeze, spent automatically, covers a
 * day the reader missed: the chain stays alive and the number keeps its value,
 * because a frozen day is a day kept rather than a day earned. The reader starts
 * with one and can hold two, and each is a shop item priced in gems
 * (components/streak-page.tsx) — there is no way to buy a longer streak, only to
 * lose one less often.
 *
 * The store also keeps the days themselves, not just their number: the strip on
 * /streak has to put a square on every day it shows and say which ones were
 * earned and which were frozen. `history` is that record. It is bounded — a year
 * and a bit — because the strip is a window on the habit rather than an
 * archive, while `days` keeps the lifetime count a bound would lose.
 */
export interface Streak {
  /**
   * The day the chain currently ends on — the last goal-met day, or the last
   * day a freeze kept — or null before the first.
   */
  lastDay: string | null;
  /** Consecutive goal-met days ending on `lastDay`, frozen days not counted. */
  current: number;
  /** The longest run ever reached. */
  best: number;
  /** Every day that has counted, in total. */
  days: number;
  /** Freezes in hand: 0 to MAX_FREEZES. */
  freezes: number;
  /** The days a freeze covered, oldest first, for the strip. */
  frozen: string[];
  /** The days the goal was met, oldest first — the strip's own record. */
  history: string[];
}

/** How many freezes a reader can hold at once. */
export const MAX_FREEZES = 2;

/** What one freeze costs, in gems. */
export const FREEZE_COST = 200;

/**
 * What a pair costs. Filling the wallet in one go is the shop's only bundle:
 * 375 against the 400 two singles would come to, so a reader who takes both
 * saves 25. Kept beside the single price rather than derived from it in a
 * component, because the streak sheet and the shop both sell the same pair.
 */
export const FREEZE_PAIR_COST = 375;

/**
 * What `count` freezes cost. The pair is a bundle price, not a per-item one, so
 * it is charged for exactly two — one freeze in hand is still 200, and a bigger
 * wallet would not make three cheaper.
 */
export function freezePrice(count: number): number {
  const wanted = Math.max(0, Math.round(count));
  return wanted === 2 ? FREEZE_PAIR_COST : wanted * FREEZE_COST;
}

/** The freezes a reader starts with. */
export const STARTING_FREEZES = 1;

/**
 * How many earned days the strip keeps behind it. A year and change is more
 * than a few pages can show at once, and small enough that the record stays
 * trivial to read and write on every tick.
 */
const HISTORY_LIMIT = 400;

/** How many frozen days are kept. Long enough to colour years of the strip. */
const FROZEN_LIMIT = 120;

/**
 * The store's storage key kept its v2 name when freezes and the day history
 * arrived: the days recorded under it still mean exactly what they meant, and
 * every new field has a migration from what a v2 record held. Bumping the key
 * would throw away a reader's run to add a feature that protects it.
 */
const KEY = "gospel-focus:streak:v2";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: Streak = {
  lastDay: null,
  current: 0,
  best: 0,
  days: 0,
  freezes: STARTING_FREEZES,
  frozen: [],
  history: [],
};

let cache: Streak | null = null;
let listening = false;
let dayTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** A list of day keys, with anything that isn't one dropped. */
function dayList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const days = value.filter(
    (day): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
  );
  // Sorted and unique, so appending today is the only ordering the store has to
  // think about and a duplicated write can never put two squares on one day.
  return [...new Set(days)].sort();
}

function parse(raw: string | null): Streak {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<Streak> | null;
    if (!value || typeof value !== "object") return EMPTY;

    const current = Number(value.current);
    const best = Number(value.best);
    const lastDay = typeof value.lastDay === "string" ? value.lastDay : null;
    const goalDays = Number(value.days);

    // A v2 record has no history, but it does hold the run's length and its last
    // day, which is exactly the run's dates: the current chain is the last
    // `current` days ending on `lastDay`. Rebuilt here so the first reader to
    // open the strip sees their run rather than empty wells.
    let history = dayList(value.history);
    if (history.length === 0 && lastDay && Number.isInteger(current) && current > 0) {
      history = Array.from({ length: current }, (_, index) =>
        addDays(lastDay, index - (current - 1))
      );
    }

    return {
      lastDay,
      current: Number.isInteger(current) && current > 0 ? current : 0,
      best: Number.isInteger(best) && best > 0 ? best : 0,
      // A record from before freezes existed gets the starting one, which is
      // what a new reader gets too; an explicit nought is a reader who has
      // spent theirs and must stay spent.
      days:
        Number.isInteger(goalDays) && goalDays > 0 ? goalDays : history.length,
      freezes:
        typeof value.freezes === "number" && Number.isFinite(value.freezes)
          ? Math.max(0, Math.min(MAX_FREEZES, Math.round(value.freezes)))
          : STARTING_FREEZES,
      frozen: dayList(value.frozen).slice(-FROZEN_LIMIT),
      history: history.slice(-HISTORY_LIMIT),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Spend freezes on the days the reader missed since the chain last moved.
 *
 * A gap of one day (yesterday) is not a miss: yesterday is still the day after
 * the last counted one, and today is the day still to be earned. A bigger gap
 * means one or more whole days went by without the goal, and each of those is
 * what a freeze is for. They are spent only when they can bridge the whole gap:
 * a reader with one freeze who comes back after three days has lost the chain
 * either way, and taking the freeze as well would be charging them for nothing.
 *
 * Frozen days join `frozen` (the strip paints them blue) but not `current`:
 * the run keeps the number it had, which is what "kept alive" means. `lastDay`
 * moves to yesterday, so `streakInForce` sees an unbroken chain and today's
 * goal — if and when it is met — is the next counted day.
 *
 * Pure, and applied on every read rather than only at midnight, because an
 * installed app can sit open across midnight and a cached record is what every
 * reader of the store gets (lib/study.ts rolls its day the same way).
 */
function settle(streak: Streak, today: string): Streak {
  const from = streak.lastDay;
  if (!from) return streak;
  const gap = daysBetween(from, today);
  // Yesterday or today: nothing has been missed. Zero or less means the clock
  // moved backwards (a timezone change, a device set by hand), which must not
  // cost the reader a freeze or their run.
  if (gap <= 1) return streak;

  const missed = gap - 1;
  if (missed > streak.freezes) return streak;

  const frozen = Array.from({ length: missed }, (_, index) => addDays(from, index + 1));

  return {
    ...streak,
    lastDay: addDays(today, -1),
    freezes: streak.freezes - missed,
    frozen: [...new Set([...streak.frozen, ...frozen])].slice(-FROZEN_LIMIT),
  };
}

function persist(next: Streak): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota) — the chain just
    // won't persist; nothing else in the app depends on it.
  }
}

function read(): Streak {
  if (typeof window === "undefined") return EMPTY;

  if (!cache) {
    const stored = parse(window.localStorage.getItem(KEY));
    cache = settle(stored, dayKey());
    // A record that was settled on load should be written out on the same day,
    // so a reload does not have to spend the same freeze again.
    if (cache !== stored) persist(cache);
    return cache;
  }

  const settled = settle(cache, dayKey());
  if (settled !== cache) {
    cache = settled;
    persist(cache);
  }
  return cache;
}

function write(next: Streak): void {
  cache = next;
  persist(next);
  for (const listener of listeners) listener();
}

/**
 * Bring the cached record up to date with the clock, and tell everyone if it
 * moved. Called at the reader's midnight (scheduled below) and whenever the app
 * comes back into view, so a phone asleep through midnight spends its freeze the
 * moment it is looked at again rather than on the next minute studied.
 */
function rollToToday(): void {
  if (typeof window === "undefined" || !cache) return;
  const before = cache;
  // read() settles and persists if the day has turned over.
  if (read() === before) return;
  for (const listener of listeners) listener();
}

/** Schedule the next roll for just after the reader's next local midnight. */
function scheduleDayRoll(): void {
  if (typeof window === "undefined" || listeners.size === 0) return;
  if (dayTimer !== null) clearTimeout(dayTimer);
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const delay = Math.max(1_000, midnight.getTime() - Date.now() + 250);
  dayTimer = setTimeout(() => {
    dayTimer = null;
    rollToToday();
    scheduleDayRoll();
  }, delay);
}

/** Keep another tab's streak in sync with this one. */
function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;

  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    // Settle what another tab wrote, too: a tab left open overnight can write a
    // record for the previous day, and reading it as today's would skip the
    // freeze that day is owed.
    cache = settle(parse(e.newValue), dayKey());
    for (const listener of listeners) listener();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    rollToToday();
    scheduleDayRoll();
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
  // Yesterday continues the chain, whether it was earned or frozen (a frozen day
  // left `lastDay` there without raising the count). A gap of a day or more
  // restarts it — settle() has already spent any freezes it could — and a "gap"
  // of zero or less means the clock moved backwards, which shouldn't cost the
  // reader their streak.
  const current =
    gap === null ? 1 : gap === 1 ? previous.current + 1 : gap <= 0 ? previous.current || 1 : 1;

  const next: Streak = {
    ...previous,
    lastDay: today,
    current,
    best: Math.max(previous.best, current),
    days: previous.days + 1,
    history: [...previous.history.filter((day) => day !== today), today].slice(-HISTORY_LIMIT),
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
 * and a longer run hands its end back to the day before, which is the day it
 * actually reached. `best` is left alone — the previous record is not stored,
 * and lowering it could erase a genuine one, so the worst case is a best that is
 * a day higher than any run that really happened.
 */
export function dropDay(today: string = dayKey()): Streak {
  const previous = read();
  if (previous.lastDay !== today) return previous;

  const history = previous.history.filter((day) => day !== today);
  const current = Math.max(0, previous.current - 1);
  // Hand the end back to the latest day still standing — earned or frozen. A
  // frozen day is not in `history`, but it is exactly where the chain would
  // have been, and settling from the last earned day would see the frozen gap
  // again and spend a second freeze on the same day.
  const known = [...history, ...previous.frozen].filter((day) => day < today).sort();
  const next: Streak = {
    ...previous,
    lastDay: current > 0 ? (known[known.length - 1] ?? addDays(today, -1)) : null,
    current,
    days: Math.max(0, previous.days - 1),
    history,
  };
  write(next);
  return next;
}

/**
 * Put a bought freeze in the wallet. Capped at MAX_FREEZES, so a second tap
 * after the shop was drawn cannot take the count past what the badge says.
 */
export function addFreezes(count = 1): Streak {
  const previous = read();
  const freezes = Math.min(
    MAX_FREEZES,
    previous.freezes + Math.max(0, Math.round(count))
  );
  if (freezes === previous.freezes) return previous;

  const next: Streak = { ...previous, freezes };
  write(next);
  return next;
}

/**
 * The streak as it stands today, for display: a chain is still intact on the
 * day after its last counted day — whether that day was earned or frozen — so
 * yesterday's run keeps showing until midnight passes. After that it is over,
 * and 0 is the honest number.
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

/**
 * What one day of the strip is: earned, kept by a freeze, or neither.
 *
 * A day both earned and frozen cannot exist in the record — a freeze is only
 * spent on a day with no goal met — but the earned answer wins if one ever
 * appears, because a day that was really studied is not a day that was saved.
 */
export type StreakDay = "counted" | "frozen";

export function streakDay(streak: Streak, day: string): StreakDay | null {
  if (streak.history.includes(day)) return "counted";
  if (streak.frozen.includes(day)) return "frozen";
  return null;
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  scheduleDayRoll();
  return () => {
    listeners.delete(onChange);
  };
}

/** The stored streak. Empty during server rendering. */
export function useStreak(): Streak {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
