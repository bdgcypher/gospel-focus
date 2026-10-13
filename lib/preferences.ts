"use client";

import { useSyncExternalStore } from "react";

export interface Preferences {
  /** Skip the page-riffle animation and drop straight onto the draw. */
  reduceMotion: boolean;
}

const KEY = "open-to-inspiration:preferences:v1";

/** One shared default snapshot, so the server render and first client render agree. */
const DEFAULTS: Preferences = { reduceMotion: false };

let cache: Preferences | null = null;
let listening = false;
const listeners = new Set<() => void>();

function read(): Preferences {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULTS;

  let stored: Partial<Preferences> = {};
  try {
    stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Preferences>;
  } catch {
    stored = {};
  }

  cache = {
    reduceMotion:
      typeof stored.reduceMotion === "boolean"
        ? stored.reduceMotion
        : // Unset preferences follow the device: someone already asking their OS
          // for less motion shouldn't have to ask again here.
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
  return cache;
}

function write(next: Preferences): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable — the session still works, it just won't persist.
  }
  for (const listener of listeners) listener();
}

function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = null;
    for (const listener of listeners) listener();
  });
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  write({ ...read(), [key]: value });
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
