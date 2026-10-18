"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppShell } from "./app-shell";
import { FocusLockBanner } from "./focus-banner";
import { Glyph } from "./glyph";
import { GoalHero } from "./goal-hero";
import { QuickActivities } from "./quick-activities";
import { dayKey } from "@/lib/daily";
import { loadManifest, pickDailyPassage } from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import type { Passage } from "@/lib/types";

/**
 * The hub, in five blocks.
 *
 * Down the page: the focus banner (while there is a gate to arm), the day's own
 * heading, the way in (the goal hero), the words themselves (the verse of the
 * day), and four tiles for everything else.
 *
 * The order is the point. A reader opening the app meets something to *do*
 * before anything to choose, and the scripture is above the fold rather than
 * below the fold of a card wall — an earlier hub led with two status cards and
 * pushed the verse under them, which put the day's passage behind a scroll and
 * the streak in front of it. The status that used to be those two cards now
 * rides in the header as chips (components/status-tray.tsx), which is both
 * smaller and available everywhere rather than only here.
 *
 * The grouped list of every feature used to sit under the verse, four headed
 * sections of compact rows with a "See all" link on the two that have a hub
 * page. It is gone from the page and not from the app: the section pages it led
 * to still exist and still list themselves out of the same catalog, the menu
 * still holds the shelf, and the destinations readers actually start from are
 * the four tiles now (see components/quick-activities.tsx for why the hub
 * stopped mapping everything, and components/menu-panel.tsx for what is in the
 * menu instead).
 *
 * The banner is the one block above the day's own heading, and the one thing a
 * reader can switch off for good. It is allowed up there because it is the only
 * invitation on the page that cannot be discovered by using the app — every
 * other door announces itself the moment it is touched, and an unarmed Focus
 * gate looks like nothing at all (components/focus-banner.tsx).
 */
export function HomePage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:max-w-5xl sm:px-6 sm:py-8">
        <FocusLockBanner />

        <TodayHeading />

        <GoalHero />

        <DailyVerseCard />

        <QuickActivities />
      </main>
    </AppShell>
  );
}

/** The date only means anything once the clock is the reader's, not the build's. */
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

/**
 * The page's own heading: the day, and what it is called.
 *
 * Deliberately outside the goal card rather than inside it. The heading is the
 * hub's, not the widget's — it names the page the reader has landed on — and
 * keeping it off the card leaves the card to do one thing, which is ask for the
 * day's study. The date sits beside the word rather than at the far edge: out
 * here the row is as wide as the page, and "Today" and its date belong together
 * more than they belong at opposite ends of a five-hundred-pixel gap.
 *
 * The date is client-only, so the prerender and the first client render agree on
 * the word and simply gain the date a moment later.
 */
function TodayHeading() {
  const mounted = useMounted();
  const today = mounted
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(
        new Date()
      )
    : "";

  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:mb-4">
      <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">Today</h2>
      {today && <p className="text-sm text-muted">{today}</p>}
    </div>
  );
}

/**
 * Today's passage — the same one the reminder quotes.
 *
 * The anchor of the page: real scripture, drawn with the same day-seeded picker
 * the reminder uses (lib/daily.ts), so the hub, the notification, and the
 * passage the app opens on all agree.
 *
 * The verse is a preview rather than the verse: one line and an ellipsis. A
 * conference talk runs to thousands of words, and printing one whole in a card
 * pushed the map of everything else off the screen to say what the reference
 * already said. The full text stays in the DOM — clamped visually, not cut in
 * the markup — so nothing is hidden from a screen reader or from find-in-page.
 *
 * One action, "Open", carrying the whole width of the card on a phone, because
 * the thing worth tapping should not be the smallest target on the screen. The
 * Gospel Library link that used to sit beside it is gone: the passage card on
 * /read keeps its own, where the reader has decided to study the verses rather
 * than glance at them.
 */
function DailyVerseCard() {
  const prefs = usePreferences();
  const filters = prefs.filters;
  const [passage, setPassage] = useState<Passage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadManifest()
      .then((manifest) => pickDailyPassage(manifest, filters, dayKey()))
      .then((drawn) => {
        if (!live) return;
        setError(null);
        setPassage(drawn);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [filters]);

  return (
    <section className="mt-3 rounded-3xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-2 text-muted">
        <Glyph name="calendar" className="h-4 w-4" />
        <p className="text-xs font-semibold uppercase tracking-wider">Verse of the day</p>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-muted">
          Today’s passage couldn’t be drawn — the passage library didn’t load. It will be here next time
          the app opens.
        </p>
      ) : !passage ? (
        // A skeleton of the real shape, so nothing jumps when the verse lands:
        // the reference, then the one line the preview is given.
        <div className="mt-4 animate-pulse space-y-3" aria-hidden="true">
          <div className="h-4 w-32 rounded-full bg-surface-2" />
          <div className="h-4 w-full rounded-full bg-surface-2" />
        </div>
      ) : (
        <>
          <h3 className="mt-3 font-serif text-xl font-semibold text-accent-strong">
            {passage.reference}
          </h3>
          <blockquote className="mt-3 border-l-2 border-accent/50 pl-4">
            <p className="line-clamp-1 font-serif text-[1.08rem] leading-relaxed text-foreground">
              {passage.text}
            </p>
          </blockquote>
          <p className="mt-2 text-xs text-muted">{passage.sourceLabel}</p>

          <div className="mt-5 flex">
            <Link
              href="/read?action=daily"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 sm:w-auto"
            >
              <Glyph name="book" className="h-4 w-4" />
              Open
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
