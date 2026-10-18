"use client";

import { useEffect } from "react";
import { loadManifest } from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import { syncDailyReminders } from "@/lib/reminders";

/**
 * Keeps the daily reminder's window of scheduled days topped up.
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
 */
export function ReminderSync() {
  const prefs = usePreferences();

  useEffect(() => {
    if (!prefs.dailyReminder) return;
    // Debounced, so flicking through a run of filters schedules once rather
    // than once per toggle.
    const timer = window.setTimeout(() => {
      void loadManifest()
        .then((manifest) =>
          syncDailyReminders({ manifest, filters: prefs.filters, hour: prefs.reminderHour })
        )
        .catch(() => {
          // A reminder that couldn't be scheduled shouldn't interrupt reading;
          // Settings is where that gets explained and re-tried.
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [prefs.dailyReminder, prefs.filters, prefs.reminderHour]);

  return null;
}
