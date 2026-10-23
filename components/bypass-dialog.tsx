"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Glyph } from "./glyph";
import { startBypass, type BypassLength } from "@/lib/focus";

/**
 * The sheet that stands between the reader and a bypassed lock.
 *
 * A bypass is the one thing on /focus that undoes the feature it belongs to, so
 * it is the one thing that asks first. What it asks with is the verse the lock
 * was armed for rather than a second explanation of the lock: the reader
 * already knows what the button does, and the only useful thing left to say is
 * the sentence they set the lock up to hear. The phrasing is deliberately about
 * *bypassing Focus Lock*, and nothing on the sheet calls it studying or studying
 * done: the confirm button says "bypass" and the body says what a bypass is, so
 * nobody can leave here thinking they have done the day's study.
 *
 * Staying locked is the first thing offered and the one that looks like the
 * answer, because it is: a reader who opened this sheet by mistake, or on
 * second thought, should find the way back before the way through. The bypass
 * lengths follow under it, smaller, as the deliberate second choice.
 *
 * The three lengths are the answers to "just this once" — long enough to reply
 * to someone, long enough to finish something, or the day written off — and the
 * confirm button carries the chosen one, so the last thing tapped says what is
 * about to happen. None of them is chosen for the reader: a bypass is a
 * decision, and the sheet opens with the question still open, so opening it by
 * mistake cannot be finished with one more tap on a length the reader never
 * looked at. Whatever the reader picks, the lock shuts itself again when it is
 * up (lib/focus.ts).
 *
 * Behaviour follows the widget prompt, the app's other sheet: the keyboard
 * lands on the way out, Escape and the backdrop take the same way, and nothing
 * is written to the store until the bypass is confirmed — closing by any other
 * route leaves the lock exactly as it was.
 *
 * It is drawn at the end of the document rather than where the card sits, as
 * every other sheet in the app is (components/note-dialog.tsx). A page box can
 * carry a translate — the swipe writes one while a turn is in flight — and a
 * transformed box becomes the frame anything `fixed` inside it is measured
 * against, which put this sheet below the fold on a phone.
 *
 * The sheet is mounted per opening rather than kept around and reset, so the
 * unanswered lengths above are the state it was born in: there is no moment
 * where the last bypass's length is still selected, and no effect putting the
 * question back.
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
  { value: "today", label: "Today", confirm: "Bypass for today" },
];

export function BypassDialog({ open, onClose }: Props) {
  const close = useCallback(() => onClose(), [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>{open && <BypassSheet onClose={close} />}</AnimatePresence>,
    document.body
  );
}

function BypassSheet({ onClose }: { onClose: () => void }) {
  /** Null until the reader answers: a length is the question this sheet asks. */
  const [length, setLength] = useState<BypassLength | null>(null);
  const stay = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    stay.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const choice = LENGTHS.find((option) => option.value === length);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:items-center sm:pb-4">
      <motion.button
        type="button"
        aria-label="Close"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
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
        className="relative z-10 max-h-full w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-border bg-background p-5 shadow-2xl"
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/12 text-accent-strong">
          <Glyph name="lock-open" className="h-6 w-6" />
        </span>

        <h2 id="bypass-dialog-title" className="mt-4 font-serif text-lg font-semibold text-foreground">
          Bypass Focus Lock?
        </h2>

        <p className="mt-1.5 text-sm text-muted">Today&rsquo;s study goal hasn&rsquo;t been completed yet.</p>

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

        {/* The way back comes first and looks like the answer, because the
            lock staying on is the point of the feature. The bypass is under
            it, past a rule, as the deliberate second choice. */}
        <button
          ref={stay}
          type="button"
          onClick={onClose}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
        >
          <Glyph name="lock" className="h-4 w-4" />
          Lock in!
        </button>

        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="text-sm font-medium text-foreground">Are you sure you want to turn it off?</p>

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

          {/* Inert until a length is answered, and it says so by naming the
              answer rather than the action: there is no bypass to take yet. */}
          <button
            type="button"
            disabled={!choice}
            onClick={() => {
              if (!choice) return;
              startBypass(choice.value);
              onClose();
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors enabled:hover:border-accent/60 enabled:hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Glyph name="lock-open" className="h-4 w-4" />
            {choice ? choice.confirm : "For how long?"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
