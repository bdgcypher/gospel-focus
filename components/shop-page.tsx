"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { FeaturePage } from "./feature-page";
import { FreezeCube } from "./freeze-cube";
import { FreezeCubes } from "./freeze-cubes";
import { Glyph } from "./glyph";
import { spendGems, useGems } from "@/lib/gems";
import {
  FREEZE_COST,
  FREEZE_PAIR_COST,
  MAX_FREEZES,
  addFreezes,
  freezePrice,
  useStreak,
} from "@/lib/streak";

/**
 * The shop: the two things the app sells for gems, and the subscription that
 * sells everything at once.
 *
 * It is reached from the streak sheet when a reader is short of gems, so the
 * thing they came for — freezes — sits directly under the premium card rather
 * than below the real-money packs. The packs are last because they are the only
 * rows that cannot be bought yet: checkout is still to come, and a shop that
 * opened on "coming soon" would look broken rather than early.
 *
 * Prices in gems are the same numbers the streak sheet charges, read from
 * lib/streak.ts rather than retyped here, so the two places that sell a freeze
 * cannot drift apart. The pair is the one discount: 375 for both rather than
 * the 400 two singles come to.
 */
/** What the subscription puts in the wallet every month. */
const MONTHLY_GEMS = 400;

export function ShopPage() {
  const [premiumOpen, setPremiumOpen] = useState(false);

  return (
    <FeaturePage
      title="Shop"
      subtitle=""
      icon="gem"
      status="ready"
      contentClassName="mt-6 space-y-8"
    >
      <PremiumCard onLearnMore={() => setPremiumOpen(true)} />

      <FreezeSection />

      <GemSection />

      <PremiumSheet open={premiumOpen} onClose={() => setPremiumOpen(false)} />
    </FeaturePage>
  );
}

/** The subscription, as one card at the top of the page. */
function PremiumCard({ onLearnMore }: { onLearnMore: () => void }) {
  return (
    <section className="rounded-3xl border border-accent/45 bg-surface p-4 sm:p-5">
      {/* The name carries its own badge: "Plus" sits where a "+" would, so the
          product reads as a name rather than a name with a symbol after it. It
          is inside the heading, which also gives the card one accessible name
          — "Gospel Focus Plus" — without a second label above it. */}
      <h2 className="flex flex-wrap items-center gap-2 font-serif text-xl font-semibold text-foreground">
        Gospel Focus{" "}
        <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-accent-contrast">
          Plus
        </span>
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Supercharge your gospel study! Unlock all features and get {MONTHLY_GEMS} free gems per month.
      </p>

      {/* What the subscription actually opens, named rather than summarised:
          "nothing locked away" is a claim, while the three decks a reader
          already knows are the proof of it. The fourth line is the rate as a
          reader would say it — four hundred gems per month — with the wallet's
          own gem standing in for the word. */}
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {["Memorization Decks", "Study Quizzes", "Coloring Pages"].map((perk) => (
          <li key={perk} className="flex items-center gap-2 text-sm text-foreground/85">
            <span className="shrink-0 text-accent-strong">
              <Glyph name="check" className="h-4 w-4" />
            </span>
            {perk}
          </li>
        ))}
        <li className="flex items-center gap-2 text-sm text-foreground/85">
          <span className="shrink-0 text-accent-strong">
            <Glyph name="check" className="h-4 w-4" />
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            {MONTHLY_GEMS}
            <Glyph name="gem" className="h-4 w-4 text-accent-strong" />
            <span>per month</span>
          </span>
        </li>
      </ul>

      <button
        type="button"
        onClick={onLearnMore}
        className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 sm:w-auto"
      >
        Learn More
      </button>
    </section>
  );
}

/**
 * Freezes, at the same prices as the streak sheet — one at 200, both at 375.
 *
 * A row buys on the tap rather than asking first: the reader came to the shop
 * to spend, and the wallet rides in the header on every page, this one included.
 * The rows are disabled, not silent, when there is no room in the wallet or not
 * enough gems, and the line under them says which of the two is in the way.
 */
function FreezeSection() {
  const streak = useStreak();
  const gems = useGems();
  const [bought, setBought] = useState("");
  const room = Math.max(0, MAX_FREEZES - streak.freezes);
  const full = room === 0;
  const short = gems.total < FREEZE_COST;
  // The two gaps the rows cannot say out loud. The pair's is the case in
  // between: enough for one and not both leaves the pair row greyed, so the
  // line below names how far off it is rather than leaving the reader guessing.
  const singleGap = Math.max(0, FREEZE_COST - gems.total);
  const pairGap = Math.max(0, FREEZE_PAIR_COST - gems.total);

  const buy = (count: number) => {
    const cost = freezePrice(count);
    // Gems first, freezes only if they were paid for — the same order the
    // streak sheet uses, so a failed purchase can't mint anything.
    if (!spendGems(cost)) return;
    addFreezes(count);
    setBought(count === 1 ? "One freeze added to your wallet." : "Two freezes added to your wallet.");
  };

  return (
    <section>
      {/* The streak page's own freeze block: the two lines that explain the
          freezes, then the cubes that answer "how many?". The shop used to name
          the section "Streak" and answer the count with a sentence; this is the
          same wallet drawn the same way in both places. */}
      <h2 className="font-serif text-lg font-semibold text-foreground">Streak freezes</h2>
      <p className="mt-0.5 text-sm text-muted">
        Protect your streak if you miss a day of study. Store up to {MAX_FREEZES} at once.
      </p>
      <div className="mt-6">
        <FreezeCubes freezes={streak.freezes} />
      </div>

      <div className="mt-5 space-y-2.5">
        <ShopRow
          // The wallet's own cube: the focused styles' drawing here, the
          // playful styles' picture there (see components/freeze-cube.tsx).
          icon={<FreezeCube size="xs" />}
          title="1 freeze"
          price={
            <>
              {FREEZE_COST}
              <Glyph name="gem" emoji className="h-3.5 w-3.5 text-accent-strong" />
            </>
          }
          disabled={full || short}
          onClick={() => buy(1)}
          ariaLabel={`Buy one streak freeze for ${FREEZE_COST} gems`}
        />
        <ShopRow
          icon={<FreezeCube size="xs" />}
          count={2}
          title="2 freezes"
          // The pair's saving, shown the same way the gem packs show theirs: the
          // two singles' price struck through above what the pair actually costs.
          wasPrice={String(FREEZE_COST * 2)}
          price={
            <>
              {FREEZE_PAIR_COST}
              <Glyph name="gem" emoji className="h-3.5 w-3.5 text-accent-strong" />
            </>
          }
          disabled={room < 2 || gems.total < FREEZE_PAIR_COST}
          onClick={() => buy(2)}
          ariaLabel={`Buy 2 streak freezes for ${FREEZE_PAIR_COST} gems`}
        />
      </div>

      {bought && (
        <p role="status" className="mt-2.5 text-sm font-medium text-accent-strong">
          {bought}
        </p>
      )}

      {full ? (
        // The refill sheet's own full-wallet message, word for word, so the two
        // places that can say "both are in hand" say the same thing.
        <p className="mt-2.5 text-sm text-muted">
          <span className="font-semibold text-foreground">You are protected!</span> Both freezes
          are in place. Come back when one is spent to top up.
        </p>
      ) : singleGap > 0 ? (
        <p className="mt-2.5 text-sm font-medium text-accent-strong">
          You need {singleGap} more {singleGap === 1 ? "gem" : "gems"}. Studying earns a gem per
          minute of your daily goal.
        </p>
      ) : room === 1 ? (
        <p className="mt-2.5 text-sm text-muted">One more will fit in your wallet.</p>
      ) : pairGap > 0 ? (
        <p className="mt-2.5 text-sm font-medium text-accent-strong">
          You need {pairGap} more {pairGap === 1 ? "gem" : "gems"} for the pair. Studying earns a gem
          per minute of your daily goal.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Real money, once checkout exists. Until then the prices are shown, unlinked.
 *
 * The two larger packs carry their old price, struck through above the new one,
 * the same way the freeze sheet shows the pair's saving — one shape for "this
 * is cheaper than it was", wherever the shop uses it.
 */
const GEM_PACKS = [
  { gems: 400, price: "$1.99", count: 1 },
  { gems: 1200, price: "$4.99", wasPrice: "$5.99", count: 2 },
  { gems: 3000, price: "$9.99", wasPrice: "$14.99", count: 3 },
];

function GemSection() {
  return (
    <section>
      <h2 className="font-serif text-lg font-semibold text-foreground">Gems</h2>
      <p className="mt-0.5 text-sm text-muted">
        A top-up for the days you would rather read than count minutes.
      </p>

      <div className="mt-3 space-y-2.5">
        {GEM_PACKS.map((pack) => (
          <ShopRow
            key={pack.gems}
            icon={<Glyph name="gem" emoji className="h-5 w-5 text-accent-strong" />}
            count={pack.count}
            title={`${pack.gems.toLocaleString("en-US")} gems`}
            wasPrice={pack.wasPrice}
            price={pack.price}
            disabled
            ariaLabel={`${pack.gems} gems for ${pack.price}. Checkout is not open yet.`}
          />
        ))}
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-muted">
        Checkout isn&rsquo;t open yet. Studying still earns gems in the meantime — a gem a minute, up to
        your daily goal.
      </p>
    </section>
  );
}

/**
 * One product, as a row: its picture, what it is, and what it costs — nothing
 * else. The description lines and the little action words that used to sit
 * under the title and the price were repeating what the row already said (a
 * freeze protects a day; a pack is a one-time purchase), so the row is now
 * name, picture and price.
 *
 * `count` is how many of the thing the row sells, drawn as a stack in the
 * tile — one cube for a freeze, three gems for the biggest pack — so the
 * picture says the quantity before the title does. The stack is decoration only
 * (the tile is hidden from screen readers); the title carries the count.
 */
function ShopRow({
  icon,
  count = 1,
  title,
  wasPrice,
  price,
  disabled = false,
  onClick,
  ariaLabel,
}: {
  icon: ReactNode;
  count?: number;
  title: string;
  /** The old price, struck through above `price`, when the row is a saving. */
  wasPrice?: string;
  price: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-accent/60 disabled:cursor-default disabled:opacity-45 disabled:hover:border-border"
    >
      <span
        aria-hidden="true"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl leading-none"
      >
        <span className="flex items-center justify-center">
          {Array.from({ length: count }, (_, index) => (
            <span
              key={index}
              // Slight overlap and a little vertical shift, so three read as a
              // loose pile rather than a row of identical marks.
              className={`${index === 0 ? "" : count > 2 ? "-ml-3" : "-ml-2"} ${
                index % 2 === 0 ? "translate-y-[2px]" : "-translate-y-[2px]"
              }`}
            >
              {icon}
            </span>
          ))}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
      </span>

      <span className="shrink-0 text-right">
        {wasPrice && (
          <span className="block text-[11px] leading-tight tabular-nums text-muted line-through">
            {wasPrice}
          </span>
        )}
        <span className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums text-foreground">
          {price}
        </span>
      </span>
    </button>
  );
}

/**
 * What the subscription includes, in the app's shared sheet shape.
 *
 * The same frame the streak and bypass sheets wear: a backdrop, a rounded card,
 * Escape to close, and nothing written until the one button is pressed. It is
 * the only place the subscription is explained, since /plans is the reading
 * plans rather than the paid tier, and a card on the page can only hold a line.
 */
function PremiumSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return <AnimatePresence>{open && <PremiumBody onClose={onClose} />}</AnimatePresence>;
}

function PremiumBody({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    close.current?.focus();
  }, []);

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
        aria-labelledby="premium-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="relative z-10 max-h-full w-full max-w-sm overflow-y-auto rounded-3xl border border-border bg-background p-5 shadow-2xl"
      >
        {/* The same heading the card wears, so the sheet and the card that
            opens it name the product the same way. */}
        <h2
          id="premium-title"
          className="flex flex-wrap items-center gap-2 font-serif text-lg font-semibold text-foreground"
        >
          Gospel Focus{" "}
          <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-accent-contrast">
            Plus
          </span>
        </h2>

        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Everything the app does, plus {MONTHLY_GEMS} gems a month to spend on freezes, hints, and
          whatever comes next.
        </p>

        <ul className="mt-4 space-y-2.5">
          {[
            "Every feature, including the ones still being built",
            `${MONTHLY_GEMS} gems added to the wallet each month`,
            "The app stays offline-first and ad-free",
          ].map((perk) => (
            <li key={perk} className="flex gap-2.5 text-sm leading-relaxed text-foreground/85">
              <span className="mt-0.5 shrink-0 text-accent-strong">
                <Glyph name="check" className="h-4 w-4" />
              </span>
              {perk}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-sm font-medium text-accent-strong">
          Subscriptions aren&rsquo;t on sale yet — checkout is still to come.
        </p>

        <div className="mt-5">
          <button
            ref={close}
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            Not now
          </button>
        </div>
      </motion.div>
    </div>
  );
}
