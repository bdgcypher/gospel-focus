"use client";

import { addDays, dayKey } from "./daily";
import { isNative } from "./external";
import { pickDailyPassage } from "./picker";
import type { Filters, Manifest, Passage } from "./types";

/**
 * The daily study reminder.
 *
 * Android and iOS can't run JavaScript at a notification's fire time, so the
 * verse has to be worked out while the app is open and handed to the platform
 * in advance. That is why a *window* of days is scheduled rather than one
 * repeating alarm: a repeating notification would repeat its text too, and the
 * point is a different verse each morning. The window is topped up every time
 * the app starts, so it only runs dry after two weeks away — and the day-seeded
 * draw (lib/daily.ts) is what makes the verse in the reminder identical to the
 * one the app shows for that same day.
 */

/** How many days ahead are kept scheduled. Long enough to cover a holiday. */
export const REMINDER_HORIZON_DAYS = 14;

/**
 * Where a tapped reminder takes the reader: the day's verse, open in the
 * reader. The notification quotes the words, so the tap has to land on the
 * passage they came from rather than on a list of everything.
 */
export const REMINDER_ROUTE = "/read?action=daily";

/**
 * Notification ids live here and nowhere else, so rescheduling can clear its
 * own without touching anything else the app might ever schedule.
 */
const ID_BASE = 7100;
const ID_BAND = 64;

const isReminderId = (id: number) => id >= ID_BASE && id < ID_BASE + ID_BAND;

/** The most characters the one-line preview gets before the full text takes over. */
const PREVIEW_CHARS = 110;

export type ReminderPermission = "granted" | "denied" | "prompt" | "unsupported";

export interface ReminderSyncResult {
  /** How many days were scheduled. */
  scheduled: number;
  /** The day the first one lands on, as a day key. */
  from: string;
}

/**
 * The plugin module, loaded once.
 *
 * Note what is returned: the *module*, never `LocalNotifications` itself. A
 * Capacitor plugin is a Proxy whose unknown members resolve to native calls,
 * so it answers `then` with a function — and anything that hands it to a
 * promise (an async function's return, `await`, `Promise.resolve`) has it
 * swallowed as a thenable and rejected. Returning the module namespace keeps
 * the proxy at arm's length; destructuring it locally is safe.
 */
type NotificationsModule = typeof import("@capacitor/local-notifications");

let moduleCache: Promise<NotificationsModule> | null = null;

function plugin(): Promise<NotificationsModule> {
  moduleCache ??= import("@capacitor/local-notifications");
  return moduleCache;
}

/** Whether the reminder can work here at all — it needs a real native shell. */
export const remindersSupported = isNative;

/** Where the notification permission currently stands. */
export async function reminderPermission(): Promise<ReminderPermission> {
  if (!isNative()) return "unsupported";
  try {
    const { LocalNotifications } = await plugin();
    const { display } = await LocalNotifications.checkPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  } catch {
    return "unsupported";
  }
}

/**
 * Ask for the notification permission. Must be called from a user gesture (a
 * settings toggle), not on launch — an unexplained system prompt on first open
 * is the fastest way to a permanent "don't allow".
 */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!isNative()) return "unsupported";
  try {
    const { LocalNotifications } = await plugin();
    const { display } = await LocalNotifications.requestPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  } catch {
    return "unsupported";
  }
}

/** The date the reminder fires on a given local day. */
function fireTime(day: string, hour: number, minute: number): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, hour, minute, 0, 0);
}

/** The invitation every reminder opens with, before the day's verse. */
const INVITATION = "Connect with the Lord today!";

/**
 * What the notification says: the invitation, then the verse, its reference,
 * and where it's from.
 *
 * The invitation is split across the title and the first line of the body
 * rather than set in the title whole: Android gives a title one line, and the
 * sentence is twice that, so keeping it together would have it cut off before
 * it finished. As it is, the collapsed notification reads "Time for study and
 * prayer." over "Connect with the Lord today!" with the verse preview after
 * it, and the expanded one carries the verse entire.
 */
export function reminderCopy(passage: Passage) {
  const text = passage.text.trim();
  const preview = text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text;
  return {
    title: "Time for study and prayer.",
    body: `${INVITATION} ${preview}`,
    largeBody: `${INVITATION}\n\n${text}\n\n— ${passage.reference}\n${passage.sourceLabel}`,
  };
}

/** Clear this app's own scheduled reminders. */
async function clearScheduled(): Promise<void> {
  const { LocalNotifications } = await plugin();
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => isReminderId(n.id)).map((n) => ({ id: n.id }));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours });
}

/**
 * (Re)schedule the coming window of daily passages.
 *
 * Returns null when this isn't a native platform or the permission isn't
 * granted — both are ordinary states, not errors, and the caller says as much
 * in the UI. Each run replaces the previous window, so a change of filters (or
 * of the hour) takes effect the next time the app is opened.
 */
export async function syncDailyReminders({
  manifest,
  filters,
  hour,
  minute,
  today = dayKey(),
}: {
  manifest: Manifest;
  filters: Filters;
  hour: number;
  minute: number;
  today?: string;
}): Promise<ReminderSyncResult | null> {
  if (!isNative()) return null;
  if ((await reminderPermission()) !== "granted") return null;

  const now = Date.now();
  const days: string[] = [];
  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset += 1) {
    const day = addDays(today, offset);
    // Today only counts if the moment hasn't passed: scheduling a notification
    // for a time already gone would fire it the instant it is handed over.
    if (fireTime(day, hour, minute).getTime() > now) days.push(day);
  }
  if (!days.length) return null;

  const drawn = await Promise.all(
    days.map(async (day) => ({ day, passage: await pickDailyPassage(manifest, filters, day) }))
  );

  const { LocalNotifications } = await plugin();
  try {
    await clearScheduled();
  } catch {
    // Nothing pending, or nothing clearable — scheduling below will replace
    // same-id notifications anyway.
  }

  await LocalNotifications.schedule({
    notifications: drawn.map(({ day, passage }, index) => ({
      id: ID_BASE + index,
      ...reminderCopy(passage),
      // Carried on the notification so the tap knows where to go without
      // having to work out which day it was for (components/reminder-sync.tsx).
      extra: { route: REMINDER_ROUTE, day },
      // Not an exact alarm on purpose. Asking for one on Android 12+ throws
      // up the system "Alarms & reminders" screen, and a reading nudge has no
      // business demanding that; inexact still fires while the device dozes,
      // which is the part that matters.
      //
      // It belongs here, on the notification, and not in `schedule` below —
      // which is where it was, unnoticed. The Android plugin reads this flag
      // from the notification object (LocalNotification.kt), defaulting to
      // true, so the nested one was ignored and every schedule was treated as
      // exact: with the permission deliberately absent from the APK, the plugin
      // took the reader to the "Alarms & reminders" screen on every reminder
      // sync, where the toggle cannot be turned on. Opening the picker or a
      // notification both trigger a top-up, which is why the app appeared to
      // jump there by itself a second after opening.
      isExactNotification: false,
      schedule: {
        at: fireTime(day, hour, minute),
        allowWhileIdle: true,
      },
    })),
  });

  return { scheduled: drawn.length, from: days[0] };
}

/** Drop everything this module scheduled. For the reminder being switched off. */
export async function cancelDailyReminders(): Promise<void> {
  if (!isNative()) return;
  try {
    await clearScheduled();
  } catch {
    // Nothing scheduled — which is the state being asked for anyway.
  }
}
