"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Glyph } from "./glyph";
import { PRIMARY_NAV, isNavActive } from "@/lib/features";

interface BottomNavProps {
  /** Opens the menu pane, which the shell owns. */
  onOpenMenu: () => void;
  /** Whether that pane is up, for `aria-expanded` on the button that opened it. */
  menuOpen: boolean;
}

/**
 * The app's two navigations, from one list.
 *
 * Which one is on screen is decided by CSS rather than by JavaScript (see the
 * `app-nav-*` rules in globals.css): the top bar where there is width for it —
 * a desktop, or a tablet held sideways — and the bottom bar everywhere else,
 * where it sits under the thumb and stays out of the way of the device's own
 * top edge. Rendering both and letting the stylesheet choose means no layout
 * flash on a rotation, and no hydration mismatch from a viewport read.
 *
 * The bottom bar carries one entry the top bar has no use for: "More", the menu
 * itself. On a phone that is where the menu belongs — under the thumb with the
 * sections, rather than a small target in the corner of the header — and on wide
 * screens the bar is gone, so the menu returns to the header's own button. The
 * two are halves of one control, and the stylesheet picks between them by the
 * same rule that picks between the bars (see `.app-menu-button`).
 *
 * Every entry in either bar is drawn as the same hairline lozenge: a transparent
 * border that waits for the reader's attention. It arrives on hover — the mark
 * the pointer is over, in the same tint and border the header's status chips use
 * (components/status-tray.tsx) — and it stays on the section the reader is
 * already in. One rule for both states means the section you are standing in and
 * the tab you are reaching for look like the same control, which is what makes
 * the border read as "this one" rather than as a second, louder style.
 */

/**
 * The lozenge every entry in either bar wears: transparent until it is hovered,
 * focused, or the section you are already in. The tint and the border weight are
 * the status chips' own, so the header reads as one row of controls rather than
 * as a nav that happens to sit beside three buttons.
 */
function navItemClass(active: boolean): string {
  return `border transition-colors ${
    active
      ? "border-accent/40 bg-accent/15 text-accent-strong"
      : "border-transparent text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent-strong focus-visible:border-accent/40 focus-visible:bg-accent/10 focus-visible:text-accent-strong"
  }`;
}

/** The row of sections across the top bar. Desktop and landscape tablets. */
export function TopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="app-nav-top items-center gap-0.5">
      {PRIMARY_NAV.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-2 text-sm font-medium ${navItemClass(active)}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The tab bar along the bottom edge. Phones and upright tablets. */
export function BottomNav({ onOpenMenu, menuOpen }: BottomNavProps) {
  const pathname = usePathname();

  // Named for what it holds, which is the sections *and* the menu — the top
  // bar's plain "Sections" would be half a description down here.
  return (
    <nav
      aria-label="Sections and menu"
      className="app-nav-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 backdrop-blur-md"
    >
      {/* Equal targets, so no tab is a harder reach than another. The bar's own
          bottom inset rides the safe-area padding in globals.css, which is what
          keeps it clear of the Android gesture bar.

          The padding that separates a tab from its neighbours sits on the slot
          rather than on the tab. On the tab it would shrink the target — a
          button is not stretched by its parent the way a link is, so the menu's
          entry would end up narrower than the sections beside it however the
          other four measured. On the slot, every tab fills its own cell and they
          are equal by construction. */}
      <ul className="mx-auto flex w-full max-w-lg items-stretch">
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 p-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium ${navItemClass(
                  active
                )}`}
              >
                <Glyph name={item.icon} className="h-6 w-6" />
                {item.label}
              </Link>
            </li>
          );
        })}

        {/* The menu, where the bar is: not a section, so it gets no nav state
            and no link — it opens the pane the sections don't cover (favorites,
            stats, settings). It is a button because it goes nowhere; the titles
            that follow it in the pane are the links. */}
        <li className="flex-1 p-1">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium ${navItemClass(
              false
            )}`}
          >
            <Glyph name="menu" className="h-6 w-6" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
