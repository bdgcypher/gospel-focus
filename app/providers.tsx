"use client";

import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { NativeBack } from "@/components/native-back";

function NativeEffects() {
  const { resolvedTheme } = useTheme();

  // Nothing here records the streak any more: a day counts when the day's goal
  // is reached, which is a fact about the reader's studying rather than about
  // the app being launched. components/streak-tracker.tsx watches for it where
  // the minutes are, and lib/streak.ts keeps the chain.

  // Let the CSS know we're inside the Android shell so the safe-area
  // padding for the status bar / gesture bar is applied (see globals.css).
  useEffect(() => {
    document.documentElement.dataset.capacitor = Capacitor.getPlatform();
  }, []);

  // The SystemBars style follows the *device* theme by default; keep the
  // status bar icons readable when the in-app theme differs from it.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !resolvedTheme) return;
    SystemBars.setStyle({
      style:
        resolvedTheme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => {
      // Not critical — ignore devices/plugins that don't support it.
    });
  }, [resolvedTheme]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NativeEffects />
      {/* The Android back gesture, routed into the app's history instead of
          out of it — see components/native-back.tsx. Mounted here so it holds
          on every screen, including the ones that draw no chrome. */}
      <NativeBack />
      {children}
    </ThemeProvider>
  );
}
