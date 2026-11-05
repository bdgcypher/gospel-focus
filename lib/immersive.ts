"use client";

import { useSyncExternalStore } from "react";

/**
 * Reading without the app's bars.
 *
 * A double tap in the chapter hands the screen to the words: the app bar and the
 * bottom navigation leave the page until the next double tap, and the room they
 * kept at the foot of it goes with them. Both taps belong to the reader
 * (components/chapter-reader.tsx) and both bars belong to the chrome
 * (components/app-chrome.tsx), which is mounted outside every page — so the
 * answer cannot be a prop. It lives here instead, where the page can write it
 * and the chrome can subscribe to it.
 *
 * Not stored, and not remembered across a page: a mode that outlived the chapter
 * it was asked for would leave a reader on the home screen with no navigation
 * and no way to work out why. The reader clears it when it unmounts.
 */
let immersive = false;
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

/** Hand the screen to the words, or give the bars back. */
export function setImmersive(on: boolean): void {
  if (immersive === on) return;
  immersive = on;
  publish();
}

/** What a double tap does: the other of the two. */
export function toggleImmersive(): void {
  setImmersive(!immersive);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * Whether the bars are currently away. The server render — and the first frame
 * of a page that has not mounted yet — is always with them showing.
 */
export function useImmersive(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => immersive,
    () => false
  );
}
