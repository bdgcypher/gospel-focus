/**
 * The word-level half of memorization: cutting a passage into the words a
 * reader says, and deciding which of them are out of sight.
 *
 * Kept apart from the store (lib/memorize.ts) because this is the method
 * itself, and the method is pure — no storage, no React, no clock. Everything
 * here takes strings and numbers and returns the same answer every time, which
 * is also what makes the scattered order stable from one level to the next.
 */

import { seededRandom, seedFromString } from "./daily";

/** Which end the words come out of sight from. */
export type HideOrder = "start" | "scattered";

/**
 * A passage cut into what the reader says and the space between: splitting on
 * the whitespace and *keeping* it means a hidden word can be swapped back in
 * without the text ever reflowing, and without losing a double space.
 *
 * Passage text is stored trimmed, so there is no leading or trailing space to
 * preserve.
 */
export function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token !== "");
}

/** Whether a token is a word rather than the space between two of them. */
export function isWord(token: string): boolean {
  return !/^\s+$/.test(token);
}

/** A passage's words, punctuation left attached — "pass," is one word. */
export function words(text: string): string[] {
  return tokenize(text).filter(isWord);
}

export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Which words are out of sight: `level` of them, either the first ones in the
 * passage or a scattered set.
 *
 * The scattered order is seeded from the passage rather than `Math.random`, so
 * it is the same every time it is asked for. That is what lets the reader step
 * up a level without the words already gone shuffling around: each level is a
 * longer prefix of one fixed permutation.
 */
export function hiddenWords(count: number, level: number, order: HideOrder, seed: number): Set<number> {
  const wanted = Math.max(0, Math.min(Math.trunc(level) || 0, count));
  if (wanted <= 0) return new Set();

  if (order === "start") {
    return new Set(Array.from({ length: wanted }, (_, index) => index));
  }

  const random = seededRandom(seed);
  const positions = Array.from({ length: count }, (_, index) => index);
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return new Set(positions.slice(0, wanted));
}

/** The seed a scattered hide runs on: one per passage, per order. */
export function hideSeed(id: string, order: HideOrder): number {
  return seedFromString(`gospel-focus:memorize:${order}:${id}`);
}

/**
 * The whole passage reduced to the first letter of each word — the hint that
 * sits between knowing nothing and being shown the words. A word's length is
 * kept, because the shape of it is half of what is being recalled.
 */
export function firstLetterHint(text: string): string {
  return text.replace(/\S+/g, (word) => word[0] + "·".repeat(Math.max(0, word.length - 1)));
}


