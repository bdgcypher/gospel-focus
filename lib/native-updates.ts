"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * The update checker, as Settings sees it.
 *
 * Android only, because it is Android that can be updated this way: the APK is
 * the product, the update is another APK, and installing one is a thing the
 * platform lets a sideloaded app do. The web build is served from wherever it is
 * served and the iOS project has no store listing, so neither has anything for
 * this to check — `updatesSupported` is false and the row stays out of Settings
 * entirely (components/settings-page.tsx).
 *
 * `status` never touches the network: it reports what the last check found,
 * which the eight-hourly job and the launch check keep current, so opening
 * Settings is instant and works offline. `checkForUpdate` is the reader's own
 * ask, and is the only call here that can fail for want of a connection.
 *
 * The native half is android/app/.../UpdateCheckPlugin.java.
 */

/** What the row shows: this build, and the newest release the checker found. */
export interface UpdateStatus {
  /** The installed build's versionName, e.g. "3.0.6". */
  installedVersion: string;
  /** Its versionCode — what a release has to beat. */
  installedCode: number;
  /** The newest release's version without its tag's "v", or "" when none was found. */
  latestVersion: string;
  latestCode: number;
  /** Whether the newest release is above the installed build. */
  updateAvailable: boolean;
  /** When a check last found a release (epoch ms), or 0. */
  checkedAt: number;
}

interface UpdateCheckPlugin {
  status(): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  install(): Promise<void>;
}

const UpdateCheck = registerPlugin<UpdateCheckPlugin>("UpdateCheck");

/** Whether this build can check for, and install, a new APK. */
export function updatesSupported(): boolean {
  return Capacitor.getPlatform() === "android";
}

/** What the last check found, or null when there is no checker here. */
export async function readUpdateStatus(): Promise<UpdateStatus | null> {
  if (!updatesSupported()) return null;
  try {
    return await UpdateCheck.status();
  } catch {
    // An older build without the plugin, or a bridge that is not up yet: the
    // row simply has nothing to add rather than an error to report.
    return null;
  }
}

/**
 * Ask GitHub now. A rejection is the answer when there is no connection — the
 * row says so and keeps the version it already knew.
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  return UpdateCheck.check();
}

/** Take the update that was found: the same download-and-install a notification tap starts. */
export async function installUpdate(): Promise<void> {
  await UpdateCheck.install();
}
