"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { HeldApp } from "./focus";

/**
 * The native half of the Focus Lock (android/app/.../FocusLockPlugin.java).
 *
 * Three things the browser cannot do, and this is the only module that asks for
 * them: list the apps on the device that can be held back, say whether Android's
 * accessibility permission is on, and write the lock where the accessibility
 * service reads it. Everything else about the lock — the switch, the bypass, the
 * day's study, which apps are held — stays in lib/focus.ts, which is what keeps
 * the page and the gate describing the same decision.
 *
 * Android only, deliberately. iOS has no equivalent without Screen Time, and the
 * web has no way to see another app at all, so both answer `supported: false`
 * and the page says the blocking half is the Android app's. Nothing here throws
 * into a render: a plugin that is missing (an older build, a browser) resolves to
 * the same quiet answer as a permission that is off.
 */

/** Where the reader stands with Android's accessibility permission. */
export interface FocusAccessibility {
  /** This build can gate apps at all — false on iOS and the web. */
  supported: boolean;
  /** The reader has switched the service on in Android's settings. */
  enabled: boolean;
}

/** What the accessibility service needs to know, written on every change. */
export interface FocusDeviceState {
  /** The held apps' package names; entries typed by hand have none and are skipped. */
  packages: string[];
  /** The reader has set the lock up. */
  lockOn: boolean;
  /**
   * The day the daily goal was met, or "" for none.
   *
   * A day key rather than an "armed" flag so the service can decide for itself
   * when the gate is open: yesterday's earned day stops matching at midnight and
   * the lock is on again without the app having to run.
   */
  earnedDay: string;
  /** The day the reader switched the lock back on after the goal, or "". */
  relockedDay: string;
  /** When an open bypass ends (epoch ms), or 0 for none. */
  bypassUntil: number;
}

interface FocusLockPlugin {
  status(): Promise<{ supported: boolean; enabled: boolean }>;
  openSettings(): Promise<void>;
  listApps(): Promise<{ apps: HeldApp[] }>;
  sync(options: FocusDeviceState): Promise<void>;
}

const FocusLock = registerPlugin<FocusLockPlugin>("FocusLock");

/**
 * Whether this build could gate another app.
 *
 * The narrow question, asked before any permission is looked at: the Focus page
 * uses it to choose between the app picker and the honest "Android only" note.
 */
export function focusLockSupported(): boolean {
  return Capacitor.getPlatform() === "android";
}

/** Whether the accessibility service is on, or `supported: false` off Android. */
export async function readFocusAccessibility(): Promise<FocusAccessibility> {
  if (!focusLockSupported()) return { supported: false, enabled: false };
  try {
    const { enabled } = await FocusLock.status();
    return { supported: true, enabled: enabled === true };
  } catch {
    // A missing plugin (a build from before this shipped) reads the same as a
    // permission that has not been given: nothing is blocked, and the page can
    // still offer the settings screen.
    return { supported: true, enabled: false };
  }
}

/** Open Android's accessibility settings so the reader can turn the service on. */
export async function openFocusAccessibilitySettings(): Promise<void> {
  if (!focusLockSupported()) return;
  try {
    await FocusLock.openSettings();
  } catch {
    // Nothing to fall back to: the page's button is the only route, and a device
    // without the screen simply leaves the reader where they were.
  }
}

/**
 * The apps with a launcher icon, by label.
 *
 * Empty on anything but Android, and empty when the query fails — the page tells
 * the difference between "no apps" and "no list" from the platform, not from an
 * empty array, so it can say which it is.
 */
export async function listInstalledApps(): Promise<HeldApp[]> {
  if (!focusLockSupported()) return [];
  try {
    const { apps } = await FocusLock.listApps();
    if (!Array.isArray(apps)) return [];
    return apps.filter(
      (app): app is HeldApp =>
        typeof app === "object" &&
        app !== null &&
        typeof (app as HeldApp).package === "string" &&
        (app as HeldApp).package.length > 0 &&
        typeof (app as HeldApp).label === "string"
    );
  } catch {
    return [];
  }
}

/**
 * Hand the lock to the device.
 *
 * Called on every change the gate cares about (components/focus-sync.tsx), so the
 * service never works from a state the reader can no longer see. Failures are
 * swallowed for the same reason as above: the page's own state is still true, and
 * a lock that is not being enforced because of a missing bridge is exactly what
 * the permission row is there to say.
 */
export async function syncFocusDevice(state: FocusDeviceState): Promise<void> {
  if (!focusLockSupported()) return;
  try {
    await FocusLock.sync(state);
  } catch {
    // See above.
  }
}
