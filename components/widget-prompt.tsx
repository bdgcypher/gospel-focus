"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph } from "./glyph";
import { setPreference, usePreferences } from "@/lib/preferences";
import { onGoalReached } from "@/lib/study";

/**
 * The one invitation the app makes: the widget, offered at the moment the day's
 * study is finished.
 *
 * The moment is the whole of the idea. A prompt about a home-screen widget
 * arrives cold anywhere else — on first open it interrupts a reader who has not
 * yet used the app, and on the hub it is one more card competing with the ones
 * that get things done. Straight after the goal lands, the reader has just felt
 * the thing the widget would remind them of, and the app has a minute of their
 * goodwill to spend. That is also why it is offered once and then never again
 * (see `widgetPromptSeen` in lib/preferences.ts): a reward, not a campaign.
 *
 * It is honest about what is behind the door. The widget is not built, so this
 * leads to its page and says so, rather than offering a setup button that would
 * do nothing — the app's own rule for anything still on the roadmap.
 *
 * Built on `onGoalReached` rather than on watching the goal state, so it cannot
 * fire for a reader who opens the app in the afternoon of a day whose goal they
 * met in the morning: only the tick that actually crosses the goal counts, and
 * that tick can only come from a session being studied.
 */
export function WidgetPrompt() {
  const { widgetPromptSeen } = usePreferences();
  const [open, setOpen] = useState(false);
  const primary = useRef<HTMLAnchorElement | null>(null);

  // Subscribed only while it has not been shown, and re-subscribed if the flag
  // is ever cleared: a preference reset should bring the offer back rather than
  // leave a listener that can no longer fire.
  useEffect(() => {
    if (widgetPromptSeen) return;
    return onGoalReached(() => setOpen(true));
  }, [widgetPromptSeen]);

  const dismiss = useCallback(() => {
    // Marked on the way out, whatever the reader chose: leaving a card open on
    // a phone is as much an answer as tapping Not now.
    setPreference("widgetPromptSeen", true);
    setOpen(false);
  }, []);

  // A dialog that opens without being touched still has to behave: the keyboard
  // lands on the way forward, and Escape closes it like any other sheet.
  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismiss}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="widget-prompt-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="relative z-10 w-full max-w-sm rounded-3xl border border-border bg-background p-5 shadow-2xl"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/12 text-accent-strong">
              <Glyph name="widget" className="h-6 w-6" />
            </span>

            <h2
              id="widget-prompt-title"
              className="mt-4 font-serif text-lg font-semibold text-foreground"
            >
              Today&rsquo;s Study Is Done
            </h2>

            <p className="mt-1.5 text-sm text-muted">
              A home-screen widget would put the verse of the day, your streak, and a one-tap draw where
              you already look. It isn&rsquo;t built yet — the page behind this shows the shape it will
              take.
            </p>

            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
              <Link
                ref={primary}
                href="/widgets"
                onClick={dismiss}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 sm:w-auto"
              >
                <Glyph name="arrow" className="h-4 w-4" />
                See the plan
              </Link>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex w-full items-center justify-center rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong sm:w-auto"
              >
                Not now
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
