/**
 * The daily layer: one local calendar day, one draw, everywhere.
 *
 * The daily passage has to come out the same in two places that never talk to
 * each other — the reminder scheduled ahead of time, and the app when it is
 * opened that day. So the draw is seeded from the day itself rather than from
 * `Math.random`, and both sides run the same seed through the same picker.
 * Nothing here depends on the clock other than the day it is given, which is
 * also what makes the reminder schedulable offline.
 */

/** A source of randomness in [0, 1), shaped like `Math.random`. */
export type Random = () => number;

/**
 * The local calendar day as "YYYY-MM-DD".
 *
 * Deliberately local, not UTC: the reader's own midnight is when the streak
 * turns over and when "today's passage" becomes tomorrow's.
 */
export function dayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The midnight-UTC instant a day key names, for whole-day arithmetic. */
function keyToUtc(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcToKey(utc: number): string {
  const date = new Date(utc);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** The day `days` away from `key`; negative moves backwards. */
export function addDays(key: string, days: number): string {
  return utcToKey(keyToUtc(key) + days * 86_400_000);
}

/** Whole days from `from` to `to`, so yesterday → today is 1. */
export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86_400_000);
}

/** FNV-1a, so a day key becomes a stable 32-bit seed. */
export function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A small, fast, seeded PRNG (mulberry32). Deterministic in the seed, which is
 * all this needs — it is picking a verse, not protecting anything.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The randomness for one day's passage. Same day in, same passage out — on any
 * device, in any timezone that agrees on the date.
 */
export function dailyRandom(day: string): Random {
  return seededRandom(seedFromString(`gospel-focus:${day}`));
}
