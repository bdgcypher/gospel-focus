"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Glyph } from "./glyph";
import { startBypass, type BypassLength } from "@/lib/focus";

/**
 * The sheet that stands between the reader and an open gate.
 *
 * A bypass is the one thing on /focus that undoes the feature it belongs to, so
 * it is the one thing that asks first. What it asks with is the verse the gate
 * was armed for rather than a second explanation of the gate: the reader
 * already knows what the button does, and the only useful thing left to say is
 * the sentence they set the lock up to hear. The phrasing is deliberately about
 * *turning the gate off*, and nothing on the sheet calls it studying or studying
 * done: the confirm button says "bypass" and the body says what a bypass is, so
 * nobody can leave here thinking they have done the day's study.
 *
 * The three lengths are the answers to "just this once" — long enough to reply
 * to someone, long enough to finish something, or the day written off — and the
 * confirm button carries the chosen one, so the last thing tapped says what is
 * about to happen. Whatever the reader picks, the gate shuts itself again when
 * it is up (lib/focus.ts).
 *
 * Behaviour follows the widget prompt, the app's other sheet: the keyboard
 * lands on the way through, Escape and the backdrop take the way out, and
 * nothing is written to the store until the confirm is tapped — closing by any
 * other route leaves the gate exactly as it was.
 */

interface Props {
  open: boolean;
  /** Called on both answers; the bypass itself is taken inside the sheet. */
  onClose: () => void;
}

/** The lengths on offer, and what each one calls the button that takes it. */
const LENGTHS: { value: BypassLength; label: string; confirm: string }[] = [
  { value: 15, label: "15 min", confirm: "Bypass for 15 min" },
  { value: 30, label: "30 min", confirm: "Bypass for 30 min" },
  { value: "today", label: "Today", confirm: "Bypass the rest of today" },
];

export function BypassDialog({ open, onClose }: Props) {
  // Remembered between openings: the reader who took fifteen minutes at lunch
  // is more likely to want fifteen again than to be walked back to the top.
  const [length, setLength] = useState<BypassLength>(15);
  const confirm = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    confirm.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const choice = LENGTHS.find((option) => option.value === length) ?? LENGTHS[0];

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
            onClick={close}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bypass-dialog-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="relative z-10 max-h-full w-full max-w-sm overflow-y-auto rounded-3xl border border-border bg-background p-5 shadow-2xl"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/12 text-accent-strong">
              <Glyph name="lock-open" className="h-6 w-6" />
            </span>

            <h2 id="bypass-dialog-title" className="mt-4 font-serif text-lg font-semibold text-foreground">
              Turn The Gate Off By Hand?
            </h2>

            <p className="mt-1.5 text-sm text-muted">
              The gate is shut because the day&rsquo;s study is not done. A bypass opens it anyway, for
              as long as you choose — and then it shuts itself again.
            </p>

            {/* The same treatment the hub's banner and the verse card give
                scripture: a gold rule, the words in the serif and italic, the
                reference under them. */}
            <blockquote className="mt-3 border-l-2 border-accent/40 pl-3">
              <p className="font-serif text-sm italic leading-relaxed text-foreground">
                Seek ye first the kingdom of God, and his righteousness; and all these things shall be
                added unto you.
              </p>
              <p className="mt-1 text-xs text-muted">Matthew 6:33</p>
            </blockquote>

            <p className="mt-3 text-sm font-medium text-foreground">
              Are you sure you want to turn it off?
            </p>

            <p className="mt-4 text-xs font-semibold text-muted">For how long</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LENGTHS.map((option) => {
                const active = option.value === length;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setLength(option.value)}
                    aria-pressed={active}
                    className={`h-11 rounded-2xl border px-4 text-sm font-semibold transition-colors ${
                      active
                        ? "border-accent/60 bg-accent/15 text-accent-strong"
                        : "border-border bg-surface-2 text-foreground hover:border-accent/60 hover:text-accent-strong"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <button
                ref={confirm}
                type="button"
                onClick={() => {
                  startBypass(length);
                  onClose();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 sm:w-auto"
              >
                <Glyph name="lock-open" className="h-4 w-4" />
                {choice.confirm}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong sm:w-auto"
              >
                Keep it closed
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
