"use client";

import { useSyncExternalStore } from "react";
import { dayKey } from "./daily";

/**
 * The daily study goal, and the record behind it.
 *
 * The reader picks how many minutes they want to spend in the word each day and
 * gets on with it: the session is started and stopped for them by the page they
 * are on (components/study-tracker.tsx), and time accrues while it runs and the
 * app is in front of them. There is deliberately no visible timer either — the
 * counting is the tracker's, not the reader's: the point is to lower the barrier
 * to *beginning*, and a stopwatch to watch is the opposite of that. The progress
 * bar on the hub is the whole of the feedback.
 *
 * What counts is a rule, not a guess: any minute spent with a page that studies
 * open and in front of the reader counts, and a minute spent anywhere else does
 * not. That is honest about what the app can see today. Counting the time spent in the Gospel
 * Library app is a later job — it needs the native layer (see ROADMAP.md) — and
 * it is why the minute is stored rather than derived: when a second source
 * arrives it adds to the same number rather than replacing it.
 *
 * The day is the reader's own local day, shared with the streak, the daily
 * passage, and the focus gate (lib/daily.ts) — one midnight for the whole app.
 */
export interface StudyState {
  /** Minutes aimed for each day. 0 until the reader chooses one. */
  goalMinutes: number;
  /** The local day everything below belongs to. */
  day: string;
  /** Seconds of study counted today. */
  seconds: number;
  /** A session is running right now, and time is being counted. */
  running: boolean;
  /** Seconds counted on every day together. */
  totalSeconds: number;
  /** How many days have reached the goal. */
  goalDays: number;
  /** Passages drawn, in all — the "passages read" line on the stats page. */
  passages: number;
}

/** The goal lengths offered, in minutes. Short is the point, so five is there. */
export const GOAL_CHOICES = [5, 10, 15, 20, 30];

/** A sane ceiling, so a mistyped goal can't make the bar meaningless. */
export const MAX_GOAL_MINUTES = 240;

const KEY = "gospel-focus:study:v1";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: StudyState = {
  goalMinutes: 0,
  day: "",
  seconds: 0,
  running: false,
  totalSeconds: 0,
  goalDays: 0,
  passages: 0,
};

let cache: StudyState | null = null;
let listening = false;
let dayTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/**
 * Watchers for the tick that crosses the day's goal, and only that one.
 *
 * Told apart from "the goal happens to be met" on purpose: a reader who opens
 * the app in the afternoon of a day already earned was not just rewarded for
 * anything, and anything built on this must not treat the two the same. The
 * crossing is known exactly here — it is the tick where `before` was false and
 * `reached` is true — so it is announced from there rather than left to a
 * consumer to infer from two reads of the state.
 */
const goalListeners = new Set<() => void>();

/** Run `listener` when a study tick crosses the day's goal. Returns a stopper. */
export function onGoalReached(listener: () => void): () => void {
  goalListeners.add(listener);
  return () => {
    goalListeners.delete(listener);
  };
}

/** A whole number of at least zero, or the fallback. */
function count(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function parse(raw: string | null): StudyState {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<StudyState> | null;
    if (!value || typeof value !== "object") return EMPTY;
    return {
      goalMinutes: Math.min(count(value.goalMinutes), MAX_GOAL_MINUTES),
      day: typeof value.day === "string" ? value.day : "",
      seconds: count(value.seconds),
      running: value.running === true,
      totalSeconds: count(value.totalSeconds),
      goalDays: count(value.goalDays),
      passages: count(value.passages),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Move yesterday's minutes out of the way when the day turns over.
 *
 * Pure, and applied every time the state is read, not just the first time it
 * is loaded — an installed app can sit in memory across midnight, and a cached
 * state is what every reader of this store gets. Left unrolled, yesterday's
 * minutes would still read as today's: the goal would look met before the
 * reader had studied a minute, and the streak would be told the day was earned
 * from minutes that belonged to yesterday. (And a later reload, which does roll
 * from storage, would then show those minutes as zero — the two readings
 * disagreeing.)
 */
function rollDay(state: StudyState, today: string): StudyState {
  if (state.day === today) return state;
  return { ...state, day: today, seconds: 0 };
}

/** Write the record out; a failure costs persistence, not the session. */
function persist(state: StudyState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode, full quota). The session keeps
    // counting; only the record is lost.
  }
}

function read(): StudyState {
  if (typeof window === "undefined") return EMPTY;
  if (!cache) {
    const stored = parse(window.localStorage.getItem(KEY));
    cache = rollDay(stored, dayKey());
    // A load that rolls storage should leave storage on the day the reader is
    // in, rather than keeping yesterday's minutes there to be rolled again.
    if (cache !== stored) persist(cache);
    return cache;
  }
  // Same reference on the same day, which is what useSyncExternalStore wants;
  // a new one only when the day has actually turned over.
  const rolled = rollDay(cache, dayKey());
  if (rolled !== cache) {
    cache = rolled;
    persist(cache);
  }
  return cache;
}

function write(next: StudyState): void {
  const state = rollDay(next, dayKey());
  cache = state;
  persist(state);
  for (const listener of listeners) listener();
}

/**
 * Bring the cached day up to date with the clock, and tell everyone if it moved.
 *
 * Called at the reader's midnight — scheduled below — and whenever the app
 * comes back into view, so a tab or phone that was asleep through midnight
 * agrees with the day the moment it is looked at again. Quiet when the day has
 * not changed, so it costs no renders in the ordinary case.
 */
function rollToToday(): void {
  if (typeof window === "undefined" || !cache) return;
  const before = cache.day;
  // read() rolls and persists if the day has turned over.
  if (read().day === before) return;
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

/** Keep another tab's minutes in step with this one. */
function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    // Roll what another tab wrote, too: a tab that was left open overnight can
    // write a state for the previous day, and reading it as today's is exactly
    // the mistake this store must not make.
    cache = rollDay(parse(e.newValue), dayKey());
    for (const listener of listeners) listener();
  });
  // A phone in a pocket comes back long after its midnight timer was throttled
  // or dropped; the first look at it is the moment to agree with the day.
  // Listened for on `document`: the event is fired there and does not bubble,
  // so a listener on `window` would never hear it.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    rollToToday();
    scheduleDayRoll();
  });
}

/** Whether today's minutes have reached the goal. False until one is set. */
export function goalReached(state: StudyState): boolean {
  return state.goalMinutes > 0 && state.seconds >= state.goalMinutes * 60;
}

/** Choose how long a day's study should be. 0 clears the goal. */
export function setGoalMinutes(minutes: number): void {
  const goalMinutes = Math.max(0, Math.min(Math.round(minutes) || 0, MAX_GOAL_MINUTES));
  write({ ...read(), goalMinutes });
}

/**
 * Begin counting. Nothing is timed on screen — the minutes just accrue.
 *
 * Called by components/study-tracker.tsx as the reader arrives on a page that
 * studies, rather than by anything of the reader's own.
 */
export function startSession(): void {
  const state = read();
  if (state.running) return;
  write({ ...state, running: true });
}

/**
 * Stop counting, keeping every minute already earned. Called by the tracker as
 * the reader leaves a page that studies — including the part-minute since the
 * last tick, which is banked on the way out.
 */
export function stopSession(): void {
  const state = read();
  if (!state.running) return;
  write({ ...state, running: false });
}

/**
 * Bank some studied seconds.
 *
 * Called from the tracker while a session runs. The day is rolled first, so a
 * session that spans midnight credits the minutes to the day they happened on.
 * Reaching the goal ends the session by itself: the goal is what the session
 * was for, and a session that closes on its own is a small, honest reward
 * rather than a switch left on. Studying past it is a tap away, and the extra
 * minutes still count towards the totals.
 */
export function addStudySeconds(seconds: number): void {
  const state = read();
  const added = Math.round(seconds);
  if (added <= 0) return;

  const before = goalReached(state);
  const now = state.seconds + added;
  const reached = state.goalMinutes > 0 && now >= state.goalMinutes * 60;

  write({
    ...state,
    seconds: now,
    totalSeconds: state.totalSeconds + added,
    // A day counts once, however many sessions it took to get there.
    goalDays: !before && reached ? state.goalDays + 1 : state.goalDays,
    // The session closes on the tick that *crosses* the goal, not on every
    // tick after it — so the goal still lands as an ending, while a reader who
    // chooses to keep going is not immediately switched back off.
    running: !before && reached ? false : state.running,
  });

  // Announced after the write, so a listener that reads the state sees the
  // minutes that finished the goal rather than the ones before them.
  if (!before && reached) for (const listener of goalListeners) listener();
}

/** One more passage drawn — the "passages read" line on the stats page. */
export function recordPassage(): void {
  const state = read();
  write({ ...state, passages: state.passages + 1 });
}

/** What the hero and the stats page need to draw the bar, worked out once. */
export function studyProgress(state: StudyState): {
  /** Whole minutes counted today. */
  minutes: number;
  /** The day's target, in minutes. 0 when none is set. */
  target: number;
  /** Whole minutes left to the goal; 0 once it is reached. */
  remaining: number;
  /**
   * How full the bar is, 0–100 — drawn from the whole minutes above, and so
   * moving only when they do.
   *
   * The seconds behind the minutes are what gets counted, and they can be
   * ahead of the last minute by up to a minute — every part-minute banked on
   * the way out of a page that studies is one. Drawn straight from them the bar
   * would say the day was further along than the number printed over it, and
   * the reader would watch the two disagree; drawn in whole minutes the bar is
   * the number made visible, and the remainder is simply the next step of it.
   */
  percent: number;
  done: boolean;
} {
  const minutes = Math.floor(state.seconds / 60);
  const target = state.goalMinutes;
  const done = goalReached(state);
  return {
    minutes,
    target,
    remaining: target > 0 ? Math.max(0, target - minutes) : 0,
    percent: target > 0 ? Math.min(100, (minutes / target) * 100) : 0,
    done,
  };
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  scheduleDayRoll();
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * The stored study state, with the day already rolled. Empty on the server.
 *
 * Exported for the stores that derive from the minutes rather than counting
 * their own — the gems are one — so they read the same numbers the bar shows.
 */
export function useStudy(): StudyState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** The minutes as they stand, read synchronously (for stores built on top). */
export function readStudy(): StudyState {
  return read();
}

/** Run `listener` on every study change. Returns a stopper. */
export function subscribeStudy(listener: () => void): () => void {
  return subscribe(listener);
}
