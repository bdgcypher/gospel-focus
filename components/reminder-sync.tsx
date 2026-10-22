"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isNative } from "@/lib/external";
import { loadManifest } from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import { REMINDER_ROUTE, syncDailyReminders } from "@/lib/reminders";

/**
 * Keeps the daily reminder's window of scheduled days topped up, and follows a
 * tapped reminder to the verse it quoted.
 *
 * It lives in the app chrome — mounted once, on every screen — rather than on
 * any one page. Once the app had more than one screen, tying this to a page
 * broke it: the app opens on the hub, but the filters that decide which verse
 * gets drawn are set on the read page, so a top-up on either one would miss
 * changes made on the other. The window is a rolling fortnight (see
 * lib/reminders.ts), so missing a top-up entirely is what lets it run dry.
 *
 * Nothing here happens until the reminder is switched on: the manifest is only
 * fetched by readers who asked for one, and by the time the hub has drawn its
 * verse of the day it is already cached.
 *
 * The tap listener is separate from the scheduling, and registered even before
 * the reminder is switched on: a notification scheduled yesterday can be
 * tapped today, and the page it opens is the one the notification was about
 * (lib/reminders.ts gives every reminder the same route).
 */
export function ReminderSync() {
  const prefs = usePreferences();
  const router = useRouter();

  useEffect(() => {
    if (!prefs.dailyReminder) return;
    // Debounced, so flicking through a run of filters schedules once rather
    // than once per toggle.
    const timer = window.setTimeout(() => {
      void loadManifest()
        .then((manifest) =>
          syncDailyReminders({
            manifest,
            filters: prefs.filters,
            hour: prefs.reminderHour,
            minute: prefs.reminderMinute,
          })
        )
        .catch(() => {
          // A reminder that couldn't be scheduled shouldn't interrupt reading;
          // Settings is where that gets explained and re-tried.
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [prefs.dailyReminder, prefs.filters, prefs.reminderHour, prefs.reminderMinute]);

  useEffect(() => {
    if (!isNative()) return;

    // The plugin is imported rather than pulled in at the top of the file so
    // the browser build never loads it — the same bargain lib/reminders.ts
    // makes. The listener is removed on unmount, though the chrome lives for
    // the whole session, so that is mostly a guard for hot reload.
    let live = true;
    let remove: (() => void) | null = null;

    void import("@capacitor/local-notifications")
      .then(async ({ LocalNotifications }) => {
        const handle = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          (event) => {
            // The route rides on the notification (lib/reminders.ts), so a
            // reminder lands on the verse it quoted; anything else the app
            // ever schedules without one still gets the day's passage rather
            // than being swallowed.
            const carried = (event.notification?.extra as { route?: unknown } | undefined)?.route;
            router.push(typeof carried === "string" && carried ? carried : REMINDER_ROUTE);
          }
        );
        if (live) remove = () => void handle.remove();
        else void handle.remove();
      })
      .catch(() => {
        // No plugin in this shell, or no notification to follow: the reminder
        // simply opens nothing, which is what a browser does anyway.
      });

    return () => {
      live = false;
      remove?.();
    };
  }, [router]);

  return null;
}
