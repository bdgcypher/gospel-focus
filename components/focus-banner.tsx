"use client";

import Link from "next/link";
import { Glyph } from "./glyph";
import { focusStatus, useFocus } from "@/lib/focus";
import { setPreference, usePreferences } from "@/lib/preferences";

/**
 * The hub's one prompt: set up the Focus lock.
 *
 * It sits above everything else on the home screen, which is the only place in
 * the app that asks for something before showing the reader anything — and the
 * reason it is allowed there is that it is *not* a greeting. The lock is the
 * feature a reader cannot discover by using the app: study, memorization and
 * the draw all announce themselves the moment they are touched, while a lock
 * that was never set up looks exactly like one that is holding except in the
 * header chip, which is a padlock with no words attached to it. So the ask is
 * made once, at the top of the page it belongs on, and never again after it is
 * answered.
 *
 * Two answers count. Setting the lock up on /focus is the real one — after that
 * the banner has nothing left to ask for, and it goes without the reader having
 * to dismiss anything. Dismissing the card is the other, and it is remembered
 * on the device (see `focusBannerDismissed` in lib/preferences.ts), because a
 * card that comes back every morning is an advert. Both are read live, so a
 * reader who sets the lock up in another tab, or clears the preference, sees
 * the hub agree on the next render.
 *
 * What the card says is short on purpose: the name, one line on what the gate
 * is for, and then the verse the reader is being asked to make room for, which
 * is the argument for the gate and a better one than the card could make
 * itself. The line under the title promises blocking, and the app is not there
 * yet — holding another app back needs the native layer, which is not built
 * (see ROADMAP.md) — so it is /focus, one tap away, that says the honest half
 * out loud: the gate, the bypass and the list of apps are real today, and
 * that is exactly what the button opens onto.
 */
export function FocusLockBanner() {
  const focus = useFocus();
  const prefs = usePreferences();

  // Nothing left to ask for once the lock exists, however it stands today: a
  // bypass is the reader's own answer, not a case for the card to revisit.
  if (focusStatus(focus) !== "unset" || prefs.focusBannerDismissed) return null;

  return (
    <section className="mb-4 flex items-start gap-3 rounded-3xl border border-border bg-surface p-4 sm:mb-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-accent/12 text-accent-strong">
        <Glyph name="lock" className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-serif text-base font-semibold leading-snug text-foreground">
          Focus Lock
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Block distracting apps until after your gospel study
        </p>

        {/* The same blockquote the verse card keeps (components/home-page.tsx):
            a gold rule, the words in the serif, and the reference under them.
            Italic is what marks it as scripture rather than as more copy. */}
        <blockquote className="mt-3 border-l-2 border-accent/40 pl-3">
          <p className="font-serif text-sm italic leading-relaxed text-foreground">
            Seek ye first the kingdom of God, and his righteousness; and all these things shall be
            added unto you.
          </p>
          <p className="mt-1 text-xs text-muted">Matthew 6:33</p>
        </blockquote>

        <Link
          href="/focus"
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
        >
          Set up
          <Glyph name="arrow" className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* The way out. Its own hit area, a step in from the card's corner so the
          mark is not the first thing a thumb finds when the card is scrolled
          past — and it is the only control here that goes nowhere. */}
      <button
        type="button"
        onClick={() => setPreference("focusBannerDismissed", true)}
        aria-label="Dismiss the Focus Lock setup"
        title="Dismiss"
        className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-transparent text-muted transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent-strong focus-visible:border-accent/40 focus-visible:bg-accent/10 focus-visible:text-accent-strong"
      >
        <Glyph name="close" className="h-4 w-4" />
      </button>
    </section>
  );
}
