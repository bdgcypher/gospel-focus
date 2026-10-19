"use client";

import { useSyncExternalStore } from "react";
import { dayKey } from "./daily";
import { readStudy, subscribeStudy, type StudyState } from "./study";

/**
 * Gems: what the day's study is worth, kept in one number the reader can
 * spend.
 *
 * The rule is deliberately the same rule as the goal bar — a minute studied is
 * a gem — with the day's goal as the ceiling, so a reader who stops when the
 * bar fills earns exactly the goal and a long session cannot mint more than the
 * goal is worth. Nothing here counts time of its own: the minutes are read from
 * lib/study.ts, which is the one place that knows what studying means. A day's
 * gems are awarded once, as the minutes grow, and never taken back when the
 * clock moves on.
 *
 * Spending is a second, separate fact: the wallet keeps the total in hand and
 * the day's already-credited amount. Buying a hint lowers the total without
 * lowering what has been credited, so the next tick cannot re-award gems that
 * were just spent.
 */

/** What the reader sees: the wallet, and what today has put in it so far. */
export interface Gems {
  /** Gems in hand — everything earned, less everything spent. */
  total: number;
  /** Gems earned today, already capped at the day's goal. */
  today: number;
}

// The wallet's storage key predates the rename from coins to gems. Keeping it
// means a reader's balance survives the change; only the name on disk is old.
const KEY = "gospel-focus:coins:v1";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: Gems = { total: 0, today: 0 };

/** The stored side: a total, and the day it was last credited for. */
interface Wallet {
  total: number;
  day: string;
  credited: number;
}

let wallet: Wallet | null = null;
let snapshot: Gems = EMPTY;
let listening = false;
const listeners = new Set<() => void>();

/** A whole number of at least zero, or the fallback. */
function count(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function parse(raw: string | null): Wallet {
  if (!raw) return { total: 0, day: "", credited: 0 };
  try {
    const value = JSON.parse(raw) as Partial<Wallet> | null;
    if (!value || typeof value !== "object") return { total: 0, day: "", credited: 0 };
    return {
      total: count(value.total),
      day: typeof value.day === "string" ? value.day : "",
      credited: count(value.credited),
    };
  } catch {
    return { total: 0, day: "", credited: 0 };
  }
}

/** What the minutes are worth today: one a minute, up to the day's goal. */
function earnedToday(study: StudyState): number {
  const minutes = Math.floor(study.seconds / 60);
  // No goal is no ceiling: the minutes still happened, and still count.
  return study.goalMinutes > 0 ? Math.min(minutes, study.goalMinutes) : minutes;
}

/**
 * Bring a wallet up to date with the study state.
 *
 * Returns the same object when there is nothing to award, so a caller can tell
 * an actual change from a tick that happened to leave the minutes where they
 * were.
 */
function settle(current: Wallet, study: StudyState, today: string): Wallet {
  const credited = current.day === today ? current.credited : 0;
  const earned = earnedToday(study);
  if (current.day === today && earned <= credited) return current;
  return {
    total: current.total + Math.max(0, earned - credited),
    day: today,
    credited: Math.max(credited, earned),
  };
}

function publish(next: Wallet): void {
  wallet = next;
  const today = next.day === dayKey() ? next.credited : 0;
  if (snapshot.total !== next.total || snapshot.today !== today) {
    snapshot = { total: next.total, today };
  }
}

function persist(next: Wallet): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota) — the wallet then
    // lives for this visit only, which is better than losing the count mid-day.
  }
}

/** Read storage and study together, and publish whatever that comes to. */
function refresh(): void {
  if (typeof window === "undefined") {
    publish({ total: 0, day: "", credited: 0 });
    return;
  }
  const stored = parse(window.localStorage.getItem(KEY));
  const next = settle(stored, readStudy(), dayKey());
  wallet = next;
  if (next !== stored) persist(next);
  publish(next);
}

function read(): Gems {
  if (typeof window === "undefined") return EMPTY;
  if (!wallet) refresh();
  return snapshot;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function ensureListeners(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;

  // Every study tick can move the day's credit; the settle above decides
  // whether anything actually changed.
  subscribeStudy(() => {
    refresh();
    notify();
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    wallet = null;
    refresh();
    notify();
  });
}

function subscribe(onChange: () => void): () => void {
  ensureListeners();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The wallet, kept in step with the day's minutes. Empty on the server. */
export function useGems(): Gems {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/**
 * Pay for something with gems. Returns false — and changes nothing — when the
 * wallet cannot cover it, so a button can be drawn as unavailable rather than
 * failing after the tap.
 */
export function spendGems(cost: number): boolean {
  const amount = Math.max(0, Math.round(cost));
  if (amount === 0) return true;
  if (typeof window === "undefined") return false;

  if (!wallet) refresh();
  const current = wallet;
  if (!current || current.total < amount) return false;

  const next: Wallet = { ...current, total: current.total - amount };
  persist(next);
  publish(next);
  notify();
  return true;
}
