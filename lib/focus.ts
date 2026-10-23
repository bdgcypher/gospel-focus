"use client";

import { useSyncExternalStore } from "react";
import { dayKey } from "./daily";
import { goalReached, readStudy } from "./study";

/**
 * The Focus lock's state: whether the reader has set it up, which apps it holds,
 * and whether a hand bypass is open.
 *
 * The state lives here and nowhere else — the page, the hub's chip, and the
 * native accessibility service all read what this module decides. The service
 * (android/app/.../FocusAccessibilityService.java) is told the answer on every
 * change by components/focus-sync.tsx; it never works out for itself whether the
 * lock is on, because two places deciding would eventually disagree.
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

/**
 * One app on the reader's list: what Android calls it, and what the reader calls
 * it.
 *
 * Both halves are needed. The package is the only name the accessibility service
 * can match a foreground app against, and the label is the only name the reader
 * recognises — so the picker records both when the app is chosen rather than
 * looking the label up again on every render. An entry with no package is a name
 * typed by hand, which can be kept as a note but cannot be blocked (see
 * `linkHeldApps` for how one gets its package once the device's list is known).
 */
export interface HeldApp {
  /** The Android application id, or "" for a name with no app behind it yet. */
  package: string;
  /** The name shown on the chip and in the picker. */
  label: string;
}

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
   * The apps the reader wants held back, as chosen from the device's own list.
   *
   * Package and label together: the package is what the accessibility service
   * matches the foreground app against, and the label is what the reader reads on
   * the chip. A name typed on the web, or before the picker existed, is kept with
   * an empty package — a note rather than a block, since there is no app for it
   * to name (see `linkHeldApps`).
   */
  apps: HeldApp[];
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
const MAX_APPS = 200;

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

/**
 * What makes two entries the same app: its package, or its name when it has none.
 *
 * Used for deduplication and for removing a chip, so a list written by any version
 * of the app — plain names, entries with packages, or both — behaves the same.
 */
export function heldAppKey(app: HeldApp): string {
  return app.package ? `pkg:${app.package.toLowerCase()}` : `name:${app.label.toLowerCase()}`;
}

/**
 * One stored entry, whichever shape it arrived in.
 *
 * The first version of this feature kept only names (`["Instagram"]`); those
 * become entries with no package rather than being dropped, because the reader
 * wrote them and `linkHeldApps` can still match them to an app once it knows
 * what is installed.
 */
function readHeldApp(value: unknown): HeldApp | null {
  if (typeof value === "string") {
    const label = value.trim();
    return label ? { package: "", label } : null;
  }
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const pkg = typeof entry.package === "string" ? entry.package.trim() : "";
  const label = typeof entry.label === "string" ? entry.label.trim() : "";
  if (!pkg && !label) return null;
  return { package: pkg, label: label || pkg };
}

/** The held apps, checked enough to trust: trimmed, deduplicated, and capped. */
function readApps(value: unknown): HeldApp[] {
  if (!Array.isArray(value)) return [];
  const apps: HeldApp[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const app = readHeldApp(entry);
    if (!app) continue;
    const key = heldAppKey(app);
    if (seen.has(key)) continue;
    seen.add(key);
    apps.push(app);
    if (apps.length >= MAX_APPS) break;
  }
  return apps;
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
 * One act because setting up is arming: an armed lock with no apps on its list
 * holds nothing, so there is no second decision to put in the reader's way. From
 * here the page has a status, the app picker, and the permission row, and the
 * home screen's chip starts reading it.
 */
export function setFocusUp(): void {
  const previous = read();
  if (previous.setUp) return;
  write({ ...previous, setUp: true });
}

/**
 * Open the gate by hand for a while, without having studied.
 *
 * The honest middle ground the lock offers: the reader can see, and undo, the
 * state the gate is in — and taking it is recorded as a bypass rather than being
 * mistaken for having done the day's study, so the goal still has to be met for
 * the day to count.
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
export function addHeldApp(app: HeldApp): void {
  const pkg = app.package.trim();
  const label = app.label.trim() || pkg;
  if (!pkg && !label) return;

  const next: HeldApp = { package: pkg, label };
  const previous = read();
  if (previous.apps.length >= MAX_APPS) return;

  const key = heldAppKey(next);
  if (previous.apps.some((entry) => heldAppKey(entry) === key)) return;
  write({ ...previous, apps: [...previous.apps, next] });
}

/** Take an app back off the list, by `heldAppKey`. */
export function removeHeldApp(key: string): void {
  const previous = read();
  const apps = previous.apps.filter((app) => heldAppKey(app) !== key);
  if (apps.length !== previous.apps.length) write({ ...previous, apps });
}

/**
 * Match names typed before the picker existed to the apps actually installed.
 *
 * The list a reader wrote by hand was the best the app could ask for when it could
 * not see the device; now that the picker can, a name that matches an installed
 * app's label is given that app's package in place, so the reader's earlier choice
 * starts working instead of needing to be made twice. A name that matches nothing
 * is left alone, and duplicates that the match creates are dropped (keeping the
 * first, which is the one the reader put there).
 */
export function linkHeldApps(installed: HeldApp[]): void {
  const previous = read();
  if (!previous.apps.some((app) => !app.package)) return;

  const byLabel = new Map<string, HeldApp>();
  for (const app of installed) {
    const label = app.label.trim().toLowerCase();
    if (label && !byLabel.has(label)) byLabel.set(label, app);
  }

  const apps: HeldApp[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const app of previous.apps) {
    let next = app;
    if (!app.package) {
      const match = byLabel.get(app.label.toLowerCase());
      if (match) {
        next = { package: match.package, label: match.label };
        changed = true;
      }
    }
    const key = heldAppKey(next);
    if (seen.has(key)) {
      changed = true;
      continue;
    }
    seen.add(key);
    apps.push(next);
  }

  if (changed) write({ ...previous, apps });
}

/** The stored focus state. Default (off) during server rendering. */
export function useFocus(): FocusState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
