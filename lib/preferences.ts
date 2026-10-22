"use client";

import { useSyncExternalStore } from "react";
import type { Filters } from "./types";

/**
 * Which face of a flashcard comes up first: the citation, to recall the words,
 * or the words, to name the citation. Kept here rather than on the memorize
 * page so a run opens on the side the reader chose last time.
 */
export type CardSide = "reference" | "passage";

/**
 * How the app is drawn, chosen separately from light or dark: the focused
 * paper-and-ink skin the app has always had, or the playful one with emoji in
 * place of the drawn glyphs and a raised, toy-like treatment on its cards and
 * buttons. Kept here rather than in next-themes so the two choices are
 * independent — any theme can wear either style — and so the skin survives a
 * change of light or dark.
 */
export type StyleChoice = "focused" | "playful";

export interface Preferences {
  /** Skip the page-riffle animation and drop straight onto the draw. */
  reduceMotion: boolean;
  /** Whether the daily study reminder is wanted on this device. */
  dailyReminder: boolean;
  /** The hour (0–23) the daily reminder fires, in the device's local time. */
  reminderHour: number;
  /** The minute (0–59) past that hour, so a reminder can land at 7:30. */
  reminderMinute: number;
  /**
   * Which sources the draw may use. Kept here rather than in the picker's
   * state so the daily reminder picks from the same set the reader chose —
   * otherwise a device with a book switched off would still be notified about
   * it, and the app would show a different verse than the reminder did.
   */
  filters: Filters;
  /** Which side of a flashcard is shown first. */
  flashcardSide: CardSide;
  /** The focused or playful skin, independent of the light/dark theme. */
  style: StyleChoice;
  /**
   * Whether the home-screen widget has been put to the reader already, after a
   * study session finished the day's goal. Once per device, not once a day: an
   * invitation that comes back every evening is an advert, and the settings row
   * is where a reader goes when they want it.
   */
  widgetPromptSeen: boolean;
  /**
   * Whether the daily puzzle's "How to play" card has been shown. Once per
   * device, like `widgetPromptSeen`: the card explains the colours, and a
   * reader who has read it once should not have it over the board each day.
   * The page keeps its own "How to play" button for anyone who wants it again.
   */
  wordleHelpSeen: boolean;
  /**
   * Whether the hub's Focus Lock invitation has been dismissed. Kept here
   * rather than in lib/focus.ts because it is not a fact about the gate — the
   * gate is armed or it isn't, and the banner reads that directly. It is a fact
   * about a card the reader has already answered, which is the same kind of
   * thing as `widgetPromptSeen` above (see components/focus-banner.tsx).
   */
  focusBannerDismissed: boolean;
}

const KEY = "gospel-focus:preferences:v1";

/** Every source on, which is what a fresh install should draw from. */
export const defaultFilters = (): Filters => ({
  volumes: {},
  books: {},
  conferences: {},
  conferenceMaster: true,
});

/** One shared default snapshot, so the server render and first client render agree. */
const DEFAULTS: Preferences = {
  reduceMotion: false,
  dailyReminder: false,
  reminderHour: 7,
  // On the hour: the time people most often name for a morning habit, and the
  // one the reminder had before a minute could be chosen at all.
  reminderMinute: 0,
  filters: { volumes: {}, books: {}, conferences: {}, conferenceMaster: true },
  // Recalling the words from the reference is the harder half, so that is what
  // a fresh install asks for first.
  flashcardSide: "reference",
  // Paper and ink is the app's own face, so that is what a fresh install wears.
  style: "focused",
  widgetPromptSeen: false,
  wordleHelpSeen: false,
  focusBannerDismissed: false,
};

let cache: Preferences | null = null;
let listening = false;
const listeners = new Set<() => void>();

/**
 * A stored filter set, checked enough to trust: the records have to be records
 * of booleans. Anything else is dropped back to the default rather than left
 * to decide whether a book is enabled.
 */
function readFilters(value: unknown): Filters {
  if (!value || typeof value !== "object") return defaultFilters();
  const candidate = value as Partial<Filters>;

  const flags = (input: unknown): Record<string, boolean> => {
    if (!input || typeof input !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [key, entry] of Object.entries(input as Record<string, unknown>)) {
      if (typeof entry === "boolean") out[key] = entry;
    }
    return out;
  };

  return {
    volumes: flags(candidate.volumes),
    books: flags(candidate.books),
    conferences: flags(candidate.conferences),
    conferenceMaster:
      typeof candidate.conferenceMaster === "boolean" ? candidate.conferenceMaster : true,
  };
}

function read(): Preferences {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULTS;

  let stored: Partial<Preferences> = {};
  try {
    stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Preferences>;
  } catch {
    stored = {};
  }

  const hour = Number(stored.reminderHour);
  const minute = Number(stored.reminderMinute);
  cache = {
    reduceMotion:
      typeof stored.reduceMotion === "boolean"
        ? stored.reduceMotion
        : // Unset preferences follow the device: someone already asking their OS
          // for less motion shouldn't have to ask again here.
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    // The reminder is opt-in: defaulting it on would have the app ask for
    // notification permission the moment it is first opened.
    dailyReminder: stored.dailyReminder === true,
    reminderHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULTS.reminderHour,
    reminderMinute:
      Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : DEFAULTS.reminderMinute,
    filters: readFilters(stored.filters),
    flashcardSide: stored.flashcardSide === "passage" ? "passage" : "reference",
    style: stored.style === "playful" ? "playful" : "focused",
    widgetPromptSeen: stored.widgetPromptSeen === true,
    wordleHelpSeen: stored.wordleHelpSeen === true,
    focusBannerDismissed: stored.focusBannerDismissed === true,
  };
  return cache;
}

/**
 * Put the chosen skin on the document.
 *
 * The style is a class rather than a React render because the whole app's CSS
 * hangs off it, and because next-themes owns the light/dark class on the same
 * element. Writing it here, in the one place preferences are written, means a
 * tap in settings flips the skin on the spot instead of waiting for an effect,
 * and every other writer of a preference keeps it right too.
 */
function applyStyle(style: StyleChoice): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("playful", style === "playful");
}

function write(next: Preferences): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable — the session still works, it just won't persist.
  }
  applyStyle(next.style);
  for (const listener of listeners) listener();
}

function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = null;
    // A style changed in another tab should reach this one at once, the same
    // way every other preference does.
    applyStyle(read().style);
    for (const listener of listeners) listener();
  });
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  write({ ...read(), [key]: value });
}

/** The stored preferences, outside React — for the reminder scheduler. */
export function readPreferences(): Preferences {
  return read();
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
