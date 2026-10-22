"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FeaturePage } from "./feature-page";
import { FreezeCube } from "./freeze-cube";
import { FreezeCubes } from "./freeze-cubes";
import { Glyph } from "./glyph";
import { StreakStrip } from "./streak-strip";
import { RollingNumber } from "./rolling-number";
import { dayKey } from "@/lib/daily";
import { spendGems, useGems } from "@/lib/gems";
import { citationHref } from "@/lib/picker";
import {
  FREEZE_COST,
  MAX_FREEZES,
  addFreezes,
  countedToday,
  freezePrice,
  streakInForce,
  useStreak,
} from "@/lib/streak";
import { useStudy } from "@/lib/study";

/**
 * The streak page: the run itself, the days behind it, and the freezes that
 * protect it.
 *
 * The number is the page's whole reason for existing, so it leads the card:
 * the run and its name on the left, the flame large on the right. It is dimmed
 * until today's goal is met, which is the same rule the app bar's flame follows
 * (components/status-tray.tsx): a run that has not been continued today is not
 * a live thing yet. Meeting the goal lights it without a sound or a popup — the
 * colour is the reward.
 *
 * The days sit in the same card, directly under the number they explain. They
 * are one horizontal line rather than a month grid: the run is a line, and the
 * strip reads it as one — coloured squares for the days the goal was met or a
 * freeze kept, quiet wells for the rest — with arrows and a swipe for walking
 * back through it. The freeze card comes after both, in the order the question
 * is asked.
 */
export function StreakPage() {
  const streak = useStreak();
  const study = useStudy();
  const mounted = useMounted();
  const run = streakInForce(streak);
  const counted = mounted && countedToday(streak);
  const [refilling, setRefilling] = useState(false);

  // The days are the reader's own, so the strip waits for the clock rather
  // than guessing at the build's date. The number above it needs no such wait:
  // the store is empty until the client reads it anyway.
  const today = mounted ? dayKey() : "";

  const target = study.goalMinutes;

  return (
    // The strapline is the verse the run is kept for, set the way the reference
    // quiz and the memory list set theirs: the words in the serif italic they
    // are read in, the citation after them and kept whole, and the citation a
    // way into the passage rather than a label beside it.
    <FeaturePage
      featureId="streak"
      subtitle={
        <span>
          <span className="font-serif italic text-foreground/85">
            &ldquo;Let your light so shine before men, that they may see your good works, and
            glorify your Father which is in heaven.&rdquo;
          </span>{" "}
          <span className="whitespace-nowrap font-semibold">
            —{" "}
            <Link
              href={citationHref({
                kind: "scripture",
                book: "Matthew",
                chapter: "5",
                section: 16,
              })}
              className="text-accent-strong hover:underline"
            >
              Matthew 5:16
            </Link>
          </span>
        </span>
      }
      contentClassName="mt-4 sm:mt-6"
    >
      {/* The run and the days that made it, as one card. The number is the
          page, so it is set large enough to be read from across the room and
          given the flame beside it rather than a badge above it; the dimmed
          state is a lower strength of the page's own ink. */}
      <section
        // A completed run gets a heavier rim in the flame's own gold, so the
        // card reads as finished before the number inside it is read; the
        // border is stated rather than grown, so the card keeps its size.
        className={`streak-card relative overflow-hidden rounded-3xl bg-surface p-4 sm:p-5 ${
          counted ? "border-2 border-accent" : "border border-border"
        }`}
        data-counted={counted}
      >
        {counted && <span className="streak-shine" aria-hidden="true" />}

        <div className="relative flex items-center justify-between gap-4 border-b border-border/70 pb-4">
          <div className="min-w-0">
            <p
              className={`font-serif text-6xl font-bold leading-none tabular-nums sm:text-7xl ${
                counted ? "text-accent-strong" : "text-muted/40"
              }`}
            >
              <RollingNumber value={run} />
            </p>
            <p
              className={`mt-2 text-lg font-bold leading-tight sm:text-xl ${
                counted ? "text-accent-strong" : "text-muted/50"
              }`}
            >
              day streak!
            </p>
          </div>

          <Glyph
            name="flame"
            className={`h-24 w-24 shrink-0 sm:h-28 sm:w-28 ${
              counted ? "text-accent-strong" : "text-muted/40 opacity-50 grayscale"
            }`}
          />
        </div>

        {/* Mounted only once the reader's own day is known: a strip laid out
            from the build's date would be the wrong week for anyone opening the
            app after it was made, and then move under their eyes. The card and
            its number are safe to draw straight away — the store is empty until
            the client reads it. */}
        {today ? (
          <StreakStrip streak={streak} today={today} />
        ) : (
          <div className="mt-4 h-28 animate-pulse rounded-2xl bg-surface-2/60" aria-hidden="true" />
        )}
      </section>

      {target === 0 && (
        <Link
          href="/settings#study-goal"
          className="mx-auto mt-3 flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-strong hover:underline"
        >
          Choose a daily goal
          <Glyph name="arrow" className="h-3.5 w-3.5" />
        </Link>
      )}

      <FreezeCard freezes={streak.freezes} onRefill={() => setRefilling(true)} />

      <RefillFreezeDialog open={refilling} onClose={() => setRefilling(false)} />
    </FeaturePage>
  );
}

/** A number that only becomes true on the client, never during the prerender. */
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

/**
 * The freezes in hand: the cubes themselves, the count, what they do, and the
 * way to refill one.
 *
 * A card rather than a button in a row of two, because the count is the thing
 * worth seeing and the purchase is the rarer visit — a reader who never refills
 * still needs to know they have one. The copy comes first and the cubes answer
 * it underneath, in the same shape the refill sheet opens with — one grey cube
 * per empty slot — so the page and the sheet it opens read as the same wallet.
 *
 * The card is no longer the control. Its one button is the filled Refill at the
 * bottom — the primary action's colour, the same face the sheet's confirm wears
 * — and it is only there when there is room to buy: a full wallet has nothing
 * to sell, so it gets no button rather than a disabled one.
 *
 * The ice cube is a real emoji in every style, not the drawn glyph the rest of
 * the app swaps in: the cube is the thing being sold, and a picture of ice says
 * "freeze" faster than the same cube stroked in ink.
 */
function FreezeCard({ freezes, onRefill }: { freezes: number; onRefill: () => void }) {
  const full = freezes >= MAX_FREEZES;

  return (
    <section className="mx-auto mt-3 w-full max-w-sm rounded-3xl border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-foreground">Streak freezes</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Protect your streak if you miss a day of study. Store up to {MAX_FREEZES} at once.
      </p>

      <div className="mt-5">
        <FreezeCubes freezes={freezes} />
      </div>

      {!full && (
        <button
          type="button"
          onClick={onRefill}
          aria-label={`Refill a streak freeze for ${FREEZE_COST} gems`}
          className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
        >
          Refill
        </button>
      )}
    </section>
  );
}

/**
 * The shop, for the one thing this page sells.
 *
 * A purchase is the one tap on the page that cannot be undone, so it asks
 * first, in the app's shared sheet shape (the bypass and widget prompts are the
 * same): the freezes held, the gems in hand, what it costs, and a confirm that
 * is disabled while it cannot be taken. Nothing is written until the confirm is
 * pressed; closing by Escape or the backdrop leaves the wallet exactly as it
 * was.
 *
 * The sheet says what it has to say in one line, and changes sides with the
 * wallet: a reader short of freezes is warned that the run is at stake, and a
 * reader holding both is told there is nothing here for them today. The stepper
 * is always the quantity, however much room is left: with one freeze in hand it
 * simply has a dead "+", because a reader who wants the pair should meet the
 * same shape as a reader with an empty wallet rather than a lone price line.
 * The stepper never offers more freezes than the wallet can hold — so the count
 * and the confirm can never disagree.
 */
function RefillFreezeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The sheet is mounted only while it is open, so every visit starts fresh —
  // at one freeze, with the confirm focused — without an effect to reset it.
  return (
    <AnimatePresence>{open && <RefillFreezeSheet onClose={onClose} />}</AnimatePresence>
  );
}

function RefillFreezeSheet({ onClose }: { onClose: () => void }) {
  const streak = useStreak();
  const gems = useGems();
  const full = streak.freezes >= MAX_FREEZES;
  // How many will still fit in the wallet — the stepper's ceiling, and nothing
  // to add at all when the wallet is already full.
  const room = Math.max(0, MAX_FREEZES - streak.freezes);
  const [wanted, setWanted] = useState(1);
  // Clamped rather than trusted: the stepper can only ask for what is left to
  // fill, whatever number it happens to be holding.
  const count = Math.min(Math.max(1, wanted), Math.max(1, room));
  const cost = freezePrice(count);
  const short = !full && gems.total < cost;
  const confirm = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirm.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refill = () => {
    if (full || short) return;
    // The gems go first, and the freezes only exist if they did: a failed
    // purchase must never leave freezes in the wallet without charging for them.
    if (spendGems(cost)) addFreezes(count);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
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
        aria-labelledby="refill-freeze-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="relative z-10 max-h-full w-full max-w-sm overflow-y-auto rounded-3xl border border-border bg-background p-5 shadow-2xl"
      >
        {/* The wallet at a glance: the two freezes drawn as the cubes
            themselves, each one grey until it is really in hand, so the
            count is a picture before it is a number. The badge underneath
            spells the number out, and the gems sit quietly in the corner
            where a balance belongs — small, and not in a pill of their
            own. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col items-start">
            <span className="flex items-center gap-2" aria-hidden="true">
              {Array.from({ length: MAX_FREEZES }, (_, index) => (
                // The same cube the freeze card draws, one size down.
                <FreezeCube key={index} size="sm" held={index < streak.freezes} />
              ))}
            </span>
            <span className="mt-1.5 inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
              {streak.freezes}/{MAX_FREEZES} Freezes
            </span>
          </div>

          {/* A number beside an icon says nothing out loud, so the words are
              hidden in the line rather than given as a label: a label on a
              plain span is not reliably announced. */}
          <span className="flex items-center gap-1 pt-0.5 text-sm font-semibold tabular-nums text-foreground">
            <span className="sr-only">Gems in the wallet: </span>
            <Glyph name="gem" className="h-3.5 w-3.5 text-accent-strong" />
            {gems.total}
          </span>
        </div>

        <h2
          id="refill-freeze-title"
          className="mt-4 font-serif text-lg font-semibold text-foreground"
        >
          {full ? "You are protected!" : "Keep your streak safe!"}
        </h2>

        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {full
            ? "Both freezes are in place. Come back when one is spent to top up."
            : "Don't risk losing your streak if you forget a day or life gets crazy."}
        </p>

        {/* The quantity, always. A reader with one freeze has a dead "+" rather
            than a price line in its place: the shape stays the same however
            full the wallet is, and the greyed end says "this is all the room
            there is" without a sentence explaining it. */}
        {!full && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3 py-2">
            <span className="flex items-center gap-1">
              <StepButton
                label="One fewer freeze"
                disabled={count <= 1}
                onClick={() => setWanted(count - 1)}
                symbol="minus"
              />
              <span className="w-5 text-center text-sm font-semibold tabular-nums text-foreground">
                {count}
              </span>
              <StepButton
                label="One more freeze"
                disabled={count >= room}
                onClick={() => setWanted(count + 1)}
                symbol="plus"
              />
            </span>

            {/* What the stepper costs, as the shelf would ticket it: a plain
                price for one, and for the pair the two singles struck through
                above the bundle so the saving is visible without a sentence
                explaining it. */}
            <span className="text-right">
              {count >= 2 && (
                <span className="block text-[11px] leading-tight tabular-nums text-muted line-through">
                  {FREEZE_COST * 2}
                </span>
              )}
              <span className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums text-foreground">
                {cost}
                <Glyph name="gem" className="h-3.5 w-3.5 text-accent-strong" />
              </span>
            </span>
          </div>
        )}

        {short && (
          <p className="mt-3 text-sm font-medium text-accent-strong">
            You need {cost - gems.total} more {cost - gems.total === 1 ? "gem" : "gems"}. Studying
            earns a gem per minute of your daily goal.{" "}
            <Link
              href="/shop"
              onClick={onClose}
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
            >
              Get Gems
              <Glyph name="arrow" className="h-3.5 w-3.5" />
            </Link>
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <button
            ref={confirm}
            type="button"
            onClick={refill}
            disabled={full || short}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45 disabled:hover:opacity-45 sm:w-auto"
          >
            Refill
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong sm:w-auto"
          >
            {full ? "Close" : "Risk it"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/** One side of the quantity stepper, drawn in the app's shared hand. */
function StepButton({
  label,
  disabled,
  onClick,
  symbol,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  symbol: "plus" | "minus";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-full border border-border bg-surface-2 text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-default disabled:opacity-35 disabled:hover:border-border disabled:hover:text-foreground"
    >
      <Glyph name={symbol} className="h-3.5 w-3.5" />
    </button>
  );
}
