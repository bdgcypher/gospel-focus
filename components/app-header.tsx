"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Glyph } from "./glyph";
import { OpenBookLogo } from "./logo";
import { StatusTray } from "./status-tray";
import { TopNav } from "./nav-bar";
import { navDirection } from "@/lib/features";
import { setPageDirection } from "@/lib/page-motion";

interface Props {
  onOpenMenu: () => void;
}

/**
 * The app bar, identical on every page: the mark and name (the way home), the
 * sections where there is width to show them, the status lights, and the menu
 * button.
 *
 * The sections are centred by giving the two flanks the same width — `flex-1`
 * on the mark and on the lights, and nothing on the links themselves — so they
 * land on the middle of the bar whatever the wordmark and the chips happen to
 * measure. An absolutely-positioned nav was tried first and is the wrong tool:
 * it takes the links out of the row, so they float over the space the flanks
 * leave instead of the bar making room for them, and the wordmark ends up
 * sharing its corner with them. In flow, nothing can overlap.
 *
 * The menu button is the wide-width half of one control. Where the bottom bar
 * is on screen it is the bar's last entry instead, as "More" (see
 * components/nav-bar.tsx), and the stylesheet takes this one off the page —
 * which is also what keeps it out of the tab order, rather than the header
 * carrying a button that does nothing on a phone. It wears the same hairline as
 * the sections beside it and the chips opposite, so the whole bar answers the
 * pointer the same way. Menu is never the page you are on, so it has only the
 * hover and focus states — which is why it keeps a transparent border of its own
 * rather than borrowing the nav's active one.
 */
export function AppHeader({ onOpenMenu }: Props) {
  const pathname = usePathname();
  // The reader is the one page where the bar is not furniture: a reader deep in
  // a chapter wants the width and the height for the words, so the bar leaves as
  // they go down and returns the moment they come back up. Everywhere else it
  // stays where it has always been.
  const reading = /^\/read\/?$/.test(pathname);
  const header = useRef<HTMLElement>(null);

  // The height is measured rather than guessed: the rail and the chapter's own
  // bar both park under this one, and they have to park under *this* bar at
  // whatever size the reader's text and the safe area have made it.
  useEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      const node = header.current;
      if (node) root.style.setProperty("--app-header-height", `${node.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (header.current) observer.observe(header.current);
    return () => observer.disconnect();
  }, []);

  // Down the page the bar is away; up the page it is back. The flag lives on the
  // document so the reader's rail and chapter bar, which are a page's own
  // markup, can follow it in the stylesheet (see "The reader's chrome" in
  // globals.css) without a second copy of the scroll position in React.
  useEffect(() => {
    const root = document.documentElement;
    const show = () => {
      delete root.dataset.chrome;
    };
    if (!reading) {
      show();
      return;
    }
    let last = window.scrollY;
    let frame = 0;
    const settle = () => {
      frame = 0;
      const y = window.scrollY;
      const height = header.current?.offsetHeight ?? 56;
      // The bar has nowhere to hide until it is past its own height, and the top
      // of a chapter is always the bar's own place. The threshold keeps a
      // jittery thumb or a trackpad's momentum from flickering it.
      if (y <= height) show();
      else if (y > last + 6) root.dataset.chrome = "away";
      else if (y < last - 6) show();
      last = y;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(settle);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      show();
    };
  }, [reading]);

  return (
    <header
      ref={header}
      className="app-header sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur"
    >
      <div className="app-header-row mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:max-w-5xl sm:px-6">
        {/* The mark and the name together are the way home from any page. On a
            phone the link is only as wide as the mark; where the top bar is on
            screen it grows into the left flank. See `.app-home-link`. */}
        <Link
          href="/"
          title="Go to the home screen"
          // Home is the first section in the bar, so arriving there from any
          // other section is a step back along it (see components/nav-bar.tsx).
          onClick={() => {
            const step = navDirection(pathname, "/");
            if (step) setPageDirection(step);
          }}
          className="app-home-link group flex min-w-0 items-center gap-3"
        >
          {/* The mark is the app's own, in every style: the playful skin
              decorates the pages, it does not redraw the logo. */}
          <span className="text-accent-strong">
            <OpenBookLogo className="h-8 w-8" />
          </span>
          {/* On a phone the mark alone is the way home: the wordmark would eat
              the corner the status lights and the menu need. It is hidden rather
              than dropped, so it is still the page's heading and still names
              this link for a screen reader. See `.app-wordmark`. */}
          <h1 className="app-wordmark min-w-0 font-serif text-lg font-semibold leading-tight text-foreground transition-colors group-hover:text-accent-strong sm:text-xl">
            Gospel Focus
          </h1>
        </Link>

        <TopNav />

        {/* The status lights and the menu hold the right flank, at the same
            width as the mark's — which is the whole of what centres the
            sections. */}
        <div className="app-header-flank flex min-w-0 flex-1 items-center justify-end gap-1">
          <StatusTray />

          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            title="Menu"
            className="app-menu-button h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent text-muted transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent-strong focus-visible:border-accent/40 focus-visible:bg-accent/10 focus-visible:text-accent-strong"
          >
            <Glyph name="menu" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
