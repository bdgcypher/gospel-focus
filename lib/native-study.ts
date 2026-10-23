"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * The minutes the reader spent in the Gospel Library, as the device counted them
 * (android/app/.../GospelStudyPlugin.java).
 *
 * Reading in the Church's own app is studying, and the daily goal is about the
 * reading rather than about this app being open — but a browser can see nothing
 * about another app, and neither can this one once it is in the background. So
 * the accessibility service that already hears every window change keeps the
 * count (GospelStudy.java), and this is how the page asks for it.
 *
 * It is a read, not a handover: the total for today is the service's, and how much
 * of it the goal still has room for is the page's to work out
 * (components/gospel-library-sync.tsx). Nothing is written back, so there is no
 * second copy of the number to fall out of step.
 *
 * Android only, and only while the accessibility service is on: on the web, on
 * iOS, and with the permission switched off there is no count to read, and every
 * answer here is 0. A missing plugin — a build from before this shipped — reads
 * the same way rather than throwing into a render.
 */

interface GospelStudyPlugin {
  today(): Promise<{ seconds: number }>;
}

const GospelStudy = registerPlugin<GospelStudyPlugin>("GospelStudy");

/** Whether this build could be counting Gospel Library minutes at all. */
export function gospelStudySupported(): boolean {
  return Capacitor.getPlatform() === "android";
}

/**
 * Seconds spent in the Gospel Library today, or 0 when nothing is being counted.
 *
 * The day is the device's own, on both sides: the service keys its total by the
 * local day, and the caller compares it against the same key (lib/daily.ts).
 */
export async function readGospelLibrarySeconds(): Promise<number> {
  if (!gospelStudySupported()) return 0;
  try {
    const { seconds } = await GospelStudy.today();
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
      ? Math.round(seconds)
      : 0;
  } catch {
    return 0;
  }
}
