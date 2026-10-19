"use client";

import { useSyncExternalStore } from "react";
import { dayKey } from "./daily";
import { goalReached, readStudy } from "./study";

/**
 * The Focus lock's local state: whether the reader has set it up, and whether a
 * hand bypass is open.
 *
 * What is real here is the state, not the enforcement. Holding other apps back
 * needs a native Android layer (UsageStatsManager plus an accessibility service
 * — see ROADMAP.md), and that does not exist yet, so /focus says so plainly.
 * Building the state model first is deliberate: the home hub's lock status, the
 * bypass, and the moment it runs out are the parts a reader sees, and they can
 * be right before anything is blocked.
 *
 * A bypass is a deadline, not a day. The reader asks for one in the units they
 * think in — fifteen minutes, half an hour, the rest of today — and the gate
 * closes itself again when that is up, with nothing to dismiss and nothing to
 * remember. That is the one thing this module watches the clock for (see
 * `scheduleExpiry`), because a gate that stayed open until the next render
 * would not be a gate.
 *
 * The other way the gate opens is the day's study. A lock is for getting the
 * reading done, so the reading ending it is the point, not a loophole: once the
 * goal is met the lock stands open until tomorrow, and the stored state says so
 * without having to be written — `focusStatus` is asked with the day's minutes
 * (`goalMet`) and decides from them. What *is* written is the reader's answer
 * to that: switching the lock back on after the goal is met, which has to
 * outlast the state that opened it (`relockedDay`).
 */

export interface FocusState {
  /**
   * The reader has set the lock up.
   *
   * A step of its own rather than a synonym for the lock being on, because it is
   * the first thing /focus has to know: before it, the page offers one button
   * and nothing to read, and after it the page has a status, a switch, and the
   * day's study to show. Setting up is also what arms it, since there is nothing
   * to set up *for* yet — the app holds no apps back — so the two happen
   * together; what the flag keeps apart is a lock the reader has taken up from
   * one they have never touched.
   */
  setUp: boolean;
  /**
   * The apps the reader wants held back, by name, as they chose them.
   *
   * Names rather than package ids on purpose: the list a reader can see and
   * edit today is what they would pick from in their own launcher, and only the
   * native layer (which is not built — see ROADMAP.md) can turn a name into an
   * app to hold. Keeping the list real now means the part that works is the
   * part the reader does by hand, and nothing has to be pretended.
   */
  apps: string[];
  /**
   * When the hand bypass runs out, in epoch milliseconds, or null for none.
   *
   * A deadline rather than the day it was taken on, because a bypass is not
   * about the date: opening the gate by hand is a decision with a length on it,
   * and this is when it stops being in force.
   */
  overrideUntil: number | null;
  /**
   * The day the reader switched the lock back on after the day's goal was met,
   * or "" for none.
   *
   * A day key rather than a flag, because the answer only holds for the day it
   * was given on: tomorrow's study is a new day to get through, so the stored
   * key stops matching at midnight and the lock is back on by itself. Only a
   * re-arm made *after* the goal was met is recorded — switching the lock on
   * before then is not an answer to anything, and must not stop the day's study
   * from taking it off.
   */
  relockedDay: string;
}

/**
 * Where the lock stands: never set up, holding, open by hand until a bypass runs
 * out, or open because the day's study is done.
 */
export type FocusStatus = "unset" | "locked" | "overridden" | "earned";

/**
 * How long a hand bypass lasts. "today" runs to the next local midnight.
 *
 * Two short lengths and "the rest of today", because those are the honest
 * answers to "just this once": long enough to answer a message, long enough to
 * finish something, or the day written off — and nothing in between that would
 * just be a number the reader has to think about.
 */
export type BypassLength = 15 | 30 | "today";

const KEY = "gospel-focus:focus:v1";

/** How many held apps the list will keep, so a bad import can't run away. */
const MAX_APPS = 40;

/** One shared default snapshot, so the server render and first client render agree. */
const EMPTY: FocusState = {
  setUp: false,
  apps: [],
  overrideUntil: null,
  relockedDay: "",
};

/** The next local midnight after `now`, in epoch milliseconds. */
function endOfDay(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

/**
 * When a bypass of the given length runs out.
 *
 * The clock starts when the reader confirms, not when the dialog opened: a
 * sheet left sitting on screen while they think it over should not eat into the
 * minutes they asked for.
 *
 * "Today" ends at the reader's own midnight — the same one the streak and the
 * daily passage turn over on (lib/daily.ts) — so a bypass taken at eleven at
 * night is a short one rather than a strange extra hour of tomorrow.
 */
export function bypassEnd(length: BypassLength, now: Date = new Date()): number {
  if (length === "today") return endOfDay(now);
  return now.getTime() + length * 60_000;
}

/** The held apps, checked enough to trust: names, trimmed and deduplicated. */
function readApps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= MAX_APPS) break;
  }
  return names;
}

/**
 * When a bypass ends, from whatever shape storage is in.
 *
 * Older states carried `overrideDay` instead: a hand override was good for the
 * whole day it was taken on, which is exactly what "today" means now, so a
 * reader mid-bypass when they update keeps it rather than losing it.
 */
function readOverrideUntil(value: Record<string, unknown>): number | null {
  const until = Number(value.overrideUntil);
  if (Number.isFinite(until) && until > 0) return until;
  if (typeof value.overrideDay === "string" && value.overrideDay === dayKey()) {
    return endOfDay(new Date());
  }
  return null;
}

let cache: FocusState | null = null;
let listening = false;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): FocusState {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return EMPTY;
    return {
      // `enabled` is what the flag was called when the lock armed itself the
      // moment its switch was touched: a reader who did that has set it up.
      setUp: value.setUp === true || value.enabled === true,
      apps: readApps(value.apps),
      overrideUntil: readOverrideUntil(value),
      relockedDay: typeof value.relockedDay === "string" ? value.relockedDay : "",
    };
  } catch {
    return EMPTY;
  }
}

function read(): FocusState {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  cache = parse(window.localStorage.getItem(KEY));
  return cache;
}

function write(next: FocusState): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota). Everything keeps
    // working for the session; only the persistence is lost.
  }
  scheduleExpiry(next);
  for (const listener of listeners) listener();
}

/**
 * Close the gate again if the bypass has run out, and leave everything alone if
 * it hasn't.
 *
 * The status is read against the clock rather than against a stored flag, so a
 * page that was open across the deadline is already telling the truth; this is
 * what clears the stale deadline out of storage and puts a live bypass back in
 * step with the reader's own watch.
 */
function expireIfDue(): void {
  const current = read();
  if (current.overrideUntil === null || current.overrideUntil > Date.now()) return;
  write({ ...current, overrideUntil: null });
}

/**
 * Arm the one timer this app has.
 *
 * A gate that opens by hand has to shut itself, and nothing else in the app is
 * watching the clock: the hub's chip, this page, and the reader's own sense of
 * "I said fifteen minutes" all come from the deadline passing. The longest
 * bypass is until midnight, well inside `setTimeout`'s range, and re-arming on
 * every write means a stretched deadline (thirty minutes on top of fifteen)
 * replaces the timer rather than racing it.
 */
function scheduleExpiry(next: FocusState): void {
  if (typeof window === "undefined") return;
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  if (next.overrideUntil === null) return;
  const delay = next.overrideUntil - Date.now();
  if (delay <= 0) return;
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    expireIfDue();
  }, delay);
}

/** Keep another tab's gate in sync with this one, and wake up agreeing with the clock. */
function ensureListeners(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = parse(e.newValue);
    scheduleExpiry(cache);
    for (const listener of listeners) listener();
  });
  // A tab that was in the background (or a phone that was in a pocket) can come
  // back long after a bypass ran out, with its timer throttled or dropped. The
  // moment it is looked at again is the moment to agree with the clock. The
  // event is fired at the document and does not bubble, so it is listened for
  // there rather than on `window`.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) expireIfDue();
  });
}

/**
 * Take the lock up: set it up and arm it in one act.
 *
 * One act because there is nothing yet to set up: no app can be held back until
 * the native layer exists, so the reader's half of the feature is the state
 * itself and the promise to come back to it. From here the page has a status
 * and a switch, and the home screen's chip starts reading it.
 */
export function setFocusUp(): void {
  const previous = read();
  if (previous.setUp) return;
  write({ ...previous, setUp: true });
}

/**
 * Open the gate by hand for a while, without having studied.
 *
 * The honest middle ground while the blocking itself doesn't exist: the reader
 * can see, and undo, the state the gate is in — and taking it is recorded as a
 * bypass rather than being mistaken for having done the day's study.
 */
export function startBypass(length: BypassLength, now: Date = new Date()): void {
  const previous = read();
  write({ ...previous, overrideUntil: bypassEnd(length, now) });
}

/**
 * Turn the lock on by hand: close any bypass, and remember the answer if the
 * day's study has already opened the gate.
 *
 * One act because the switch is one control. Closing the bypass is the old job.
 * The new one is the day's study: with the goal met the gate stands open on its
 * own, so switching it on has to be recorded for the rest of the day or the
 * reader's own choice would last only until the next render. Before the goal is
 * met there is nothing to record — the lock is on anyway, and the day's study
 * still has to be able to take it off.
 */
export function lockNow(): void {
  const previous = read();
  const met = goalReached(readStudy());
  write({
    ...previous,
    overrideUntil: null,
    relockedDay: met ? dayKey() : "",
  });
}

/**
 * Where the lock stands today, read against the clock rather than against a
 * stored flag — a deadline that has passed is a lock that is holding again.
 *
 * `goalMet` is today's study, reported by the caller that already has it (the
 * hub's chip and /focus both read the same store). It opens the lock the moment
 * it is true, unless the reader has switched the lock back on since — which is
 * the one thing that outranks the day's study, because it is the reader saying
 * so. A bypass still counts as open for its own reason, but a gate the study
 * already opened needs no deadline to explain it, so "earned" is answered
 * first.
 */
export function focusStatus(
  state: FocusState,
  { goalMet = false, now = Date.now() }: { goalMet?: boolean; now?: number } = {},
): FocusStatus {
  if (!state.setUp) return "unset";
  if (goalMet && state.relockedDay !== dayKey()) return "earned";
  if (state.overrideUntil !== null && state.overrideUntil > now) return "overridden";
  return "locked";
}

function subscribe(onChange: () => void): () => void {
  ensureListeners();
  // In order: close a bypass that ran out while nothing was watching, then arm
  // the timer for one that is still running. Both are no-ops in the common case
  // of a gate with no bypass on it.
  expireIfDue();
  scheduleExpiry(read());
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Add an app to the list the gate would hold back. */
export function addHeldApp(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const previous = read();
  if (
    previous.apps.length >= MAX_APPS ||
    previous.apps.some((app) => app.toLowerCase() === trimmed.toLowerCase())
  ) {
    return;
  }
  write({ ...previous, apps: [...previous.apps, trimmed] });
}

/** Take an app back off the list. */
export function removeHeldApp(name: string): void {
  const previous = read();
  const apps = previous.apps.filter((app) => app !== name);
  if (apps.length !== previous.apps.length) write({ ...previous, apps });
}

/** The stored focus state. Default (off) during server rendering. */
export function useFocus(): FocusState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
