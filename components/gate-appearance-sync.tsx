"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import { focusLockSupported, syncGateAppearance } from "@/lib/native-focus";
import { usePreferences } from "@/lib/preferences";

/**
 * Tells the Focus Lock's gate what the app looks like.
 *
 * The gate is drawn by the accessibility service, over another app, while Gospel
 * Focus is not in front — so it has no way to ask what the reader chose. Both
 * choices are the page's: light or dark is next-themes', and focused or playful is
 * a preference of the app's own (lib/preferences.ts). This is the one place the two
 * are pushed across the bridge (lib/native-focus.ts), and it is mounted once in the
 * app chrome so however the reader arrives at a theme, the gate hears about it.
 *
 * `resolvedTheme` as well as `theme`, because they answer different questions: the
 * first is the light or dark the app is in now, the second is whether that was the
 * reader's choice or the device's. Both are sent, so that a reader following the
 * device is still right at sunset, when the app is closed and only the device knows
 * the answer. `resolvedTheme` is undefined until next-themes has mounted, which is
 * why nothing is sent on the first pass.
 *
 * Silent on the web and on iOS — there is no gate there to dress — and silent when
 * the bridge is missing, like the rest of lib/native-focus.ts: the gate then keeps
 * the look it had, which is the device's night mode.
 */
export function GateAppearanceSync() {
  const { theme, resolvedTheme } = useTheme();
  const { style } = usePreferences();

  useEffect(() => {
    if (!focusLockSupported() || !resolvedTheme) return;
    void syncGateAppearance({
      dark: resolvedTheme === "dark",
      playful: style === "playful",
      follow: theme === "system",
    });
  }, [theme, resolvedTheme, style]);

  return null;
}
