import { Capacitor, registerPlugin } from "@capacitor/core";

/** True when running inside the Capacitor iOS/Android shell. */
export const isNative = () => Capacitor.isNativePlatform();

/**
 * Minimal native plugin (android/app/.../OpenUrlPlugin.java) that fires an
 * ACTION_VIEW intent and rejects when no installed app can handle the URL.
 */
const OpenUrl = registerPlugin<{ openUrl(options: { url: string }): Promise<void> }>("OpenUrl");

/**
 * Convert a Gospel Library web URL to the app's official custom scheme, per
 * https://www.churchofjesuschrist.org/learn/mobile-applications/deep-linking-in-gospel-library:
 * `https://www.churchofjesuschrist.org/study/...` → `gospellibrary://content/...`
 * (query params and fragments carry over). Returns null for other URLs.
 */
export function toGospelLibraryAppUrl(url: string): string | null {
  const prefix = /^https:\/\/(www\.)?churchofjesuschrist\.org\/study(?=\/|[?#]|$)/;
  return prefix.test(url) ? url.replace(prefix, "gospellibrary://content") : null;
}

/**
 * Open an external URL.
 *
 * - Android: Gospel Library links open in the Gospel Library app (official
 *   `gospellibrary://content` scheme) when it is installed; otherwise we fall
 *   back to the in-app browser.
 * - iOS: in-app browser.
 * - Web: a new tab.
 */
export async function openExternal(url: string): Promise<void> {
  if (Capacitor.getPlatform() === "android") {
    const appUrl = toGospelLibraryAppUrl(url);
    if (appUrl) {
      try {
        await OpenUrl.openUrl({ url: appUrl });
        return;
      } catch {
        // Gospel Library isn't installed (or can't take the link) —
        // fall through to the website below.
      }
    }
  }

  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
