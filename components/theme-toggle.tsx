"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

type Mode = "light" | "dark";

function Icon({ mode }: { mode: Mode }) {
  if (mode === "light")
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * Single-button light / dark switch: the icon shows the *current* theme
 * (sun in light, moon in dark) and tapping it flips the theme — and with it
 * the icon. The app starts on the device's preferred theme (see Providers ->
 * defaultTheme="system"); the first tap pins it explicitly.
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  // False during SSR/first paint, true after hydration — without an effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const current: Mode | undefined = mounted ? (resolvedTheme as Mode) : undefined;
  const next: Mode | undefined = current === "light" ? "dark" : current === "dark" ? "light" : undefined;

  return (
    <button
      type="button"
      onClick={() => next && setTheme(next)}
      aria-label={next ? `Switch to ${next} theme` : "Toggle color theme"}
      title={next ? `${next} theme` : "Toggle color theme"}
      className="flex items-center justify-center rounded-full border border-border bg-surface/70 p-2 text-muted backdrop-blur transition-colors hover:text-foreground"
    >
      {current ? <Icon mode={current} /> : <span className="block h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
