"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * The system back gesture, pointed at the app's own history.
 *
 * On Android the hardware key and the gesture bar both arrive as a back press,
 * and without a listener the shell has nothing to route it to: Capacitor's own
 * fallback only drops one entry of the WebView's history, and at the app's first
 * screen there is none — so the press finished the activity and the reader lost
 * their place. `@capacitor/app` hands the press to the page instead
 * (`backButton`), and the page can answer with the move the in-app back control
 * already makes (components/back-link.tsx): one entry back, into the screen the
 * reader came from.
 *
 * Three cases, in the order they are asked:
 *
 * - **There is a screen behind this one.** `canGoBack` is the WebView's own
 *   position in its history, and it is the same question `history.length` only
 *   approximates — it goes false again after the reader has walked back to where
 *   they started, where a length never shrinks. The entry may have been made by
 *   the router rather than by a page load, which is what every link in this app
 *   is, so it is the WebView's list being asked and not the document's.
 * - **This is a screen the reader was sent to.** A reminder, a shared card, or a
 *   link opens `/read` or `/focus` as the first entry in the history; back would
 *   otherwise close the app on someone who has just arrived. `replace`, not
 *   `push`, so the hub does not become a place back returns *from* — the next
 *   press is then the first screen's, and takes the branch below.
 * - **This is the hub.** Nowhere left to go, so the app does what back means on
 *   Android: it leaves the screen. `minimizeApp` keeps the session in recents
 *   (Android 12's own back-to-home behaviour) and falls back to closing where a
 *   device does not support it.
 *
 * iOS has no equivalent event — the platform's back affordance is the edge
 * swipe, which the WKWebView keeps to itself — so this is registered only on
 * Android and does nothing in the browser. The in-app back controls are still
 * the way back there.
 */
export function NativeBack() {
  const router = useRouter();
  const pathname = usePathname();

  // Read inside the listener, not captured by it: re-registering on every
  // navigation would leave a gap, however small, where a press falls through to
  // the shell's default and closes the app.
  const here = useRef(pathname);
  useEffect(() => {
    here.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;

    let cancelled = false;
    let remove: (() => Promise<void>) | null = null;

    void App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        router.back();
        return;
      }
      if (here.current !== "/") {
        router.replace("/");
        return;
      }
      void App.minimizeApp().catch(() => App.exitApp());
    }).then((handle) => {
      // The component may have unmounted while the plugin was being asked; a
      // listener that outlives its page would still drive a router nobody reads.
      if (cancelled) void handle.remove();
      else remove = () => handle.remove();
    });

    return () => {
      cancelled = true;
      void remove?.();
    };
  }, [router]);

  return null;
}
