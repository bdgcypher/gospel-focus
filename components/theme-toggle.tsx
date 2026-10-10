"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];

const LABEL: Record<Mode, string> = { light: "Light", dark: "Dark" };

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
 * Light / dark switch. The app starts on the device's preferred theme (see
 * Providers -> defaultTheme="system"), and tapping an icon pins it explicitly.
 * The highlight always reflects the currently resolved theme.
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

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex items-center gap-0.5 rounded-full border border-border bg-surface/70 p-1 backdrop-blur"
    >
      {MODES.map((mode) => {
        const active = current === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${LABEL[mode]} theme`}
            title={`${LABEL[mode]} theme`}
            onClick={() => setTheme(mode)}
            className={`flex items-center justify-center rounded-full p-2 transition-colors ${
              active ? "bg-accent text-accent-contrast" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon mode={mode} />
          </button>
        );
      })}
    </div>
  );
}
