import { Capacitor } from "@capacitor/core";

/** True when running inside the Capacitor iOS/Android shell. */
export const isNative = () => Capacitor.isNativePlatform();

/**
 * Open an external URL. Inside the Capacitor native shells this uses the
 * in-app browser plugin; on the web it falls back to a new tab.
 */
export async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
