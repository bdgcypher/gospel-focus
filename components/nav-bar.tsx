"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Glyph } from "./glyph";
import { PRIMARY_NAV, isNavActive, navDirection } from "@/lib/features";
import { setPageDirection } from "@/lib/page-motion";

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
 * The section the reader is in is marked by a single pill that sits *under* the
 * entry rather than a border on the entry itself. One mark can travel; a border
 * on each of four tabs can only switch off and on, and the eye reads that as
 * two different controls. The pill is measured from the active link (it has to
 * be: the top bar's entries are as wide as their words and the bottom bar's are
 * equal shares of the screen) and then travels to the next one under its own
 * animation — leaning a little past the tab it is heading for and stretching on
 * the way, so the mark reads as something with weight rather than as a box
 * being redrawn.
 *
 * In the bottom bar the pill is drawn round the words rather than round the
 * whole tab, so it matches the mark the top bar has always had: the icon and
 * the emoji above the label are left out of it. The tab is still the target —
 * the whole cell is tappable — but the mark answers the words.
 *
 * The bars live in the layout (components/app-chrome.tsx), so they are still on
 * screen when the new page arrives and the pill has somewhere to travel from.
 * The arriving page animates underneath them (components/app-shell.tsx); the
 * bar itself never moves, which is what makes it the fixed point the motion is
 * read against.
 *
 * An entry answers the pointer with colour and weight rather than with a second
 * box: the tab being reached for warms to the reading colour and thickens its
 * type — the same reading colour the tab you are standing in wears. Nothing
 * draws a border or a fill around it, so the pill stays the only box in the
 * bar.
 */

/** Where the pill is, in the bar's own coordinates. */
interface Pill {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/** A pill's box without its visibility, which is all a move needs. */
type PillBox = Omit<Pill, "visible">;

/** How long one move of the pill takes, from the old tab to the settled one. */
const TRAVEL_MS = 520;

/**
 * Whether the reader has asked for less motion.
 *
 * The app's own setting is the one that counts: it starts from the device's and
 * can then be changed (see lib/preferences.ts), and it is written to the
 * document before the first frame (see app/layout.tsx). Both bars' page
 * entrances are already switched off from the same attribute in globals.css, so
 * the pill answers to it here rather than leaving one flourish behind.
 */
function motionReduced(): boolean {
  return document.documentElement.dataset.reduceMotion === "true";
}

/**
 * One move of the pill, as keyframes rather than as a transition.
 *
 * The mark leans past the tab it is heading for and comes back: at the peak of
 * the move it is a little beyond the link that was pressed, then it settles onto
 * it. It also widens as it crosses — to more than either tab is — which is the
 * stretch. A transition cannot say either of those things, because it can only
 * run between the old width and the new one, so the travel is animated here.
 *
 * The overshoot is a share of the distance, so a long jump leans further than a
 * short one, held between a floor and a ceiling: below the floor the move has no
 * visible weight, and above the ceiling the pill would reach past the bar.
 */
function travelKeyframes(from: PillBox, to: PillBox): Keyframe[] {
  const dx = to.x - from.x;
  const direction = dx < 0 ? -1 : 1;
  const overshoot = Math.min(18, Math.max(6, Math.abs(dx) * 0.12));
  const stretch = Math.min(16, Math.max(5, Math.max(from.width, to.width) * 0.1));

  return [
    {
      offset: 0,
      left: `${from.x}px`,
      top: `${from.y}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      easing: "cubic-bezier(0.3, 0.7, 0.35, 1)",
    },
    {
      // Past the link it was pressed for, and at its widest: the leading edge
      // has already arrived while the trailing edge is still catching up.
      offset: 0.58,
      left: `${to.x + direction * overshoot}px`,
      top: `${to.y}px`,
      width: `${Math.max(from.width, to.width) + stretch}px`,
      height: `${to.height}px`,
      easing: "cubic-bezier(0.3, 0, 0.5, 1)",
    },
    {
      // The rebound: a hair short of the tab before the last settle.
      offset: 0.8,
      left: `${to.x - direction * overshoot * 0.16}px`,
      top: `${to.y}px`,
      width: `${to.width + stretch * 0.18}px`,
      height: `${to.height}px`,
      easing: "cubic-bezier(0.25, 0.6, 0.4, 1)",
    },
    {
      offset: 1,
      left: `${to.x}px`,
      top: `${to.y}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
    },
  ];
}

/**
 * The pill's box, or nothing to show yet.
 *
 * Written as a position rather than a transform because that is the box the
 * measurement produced, and the travel animation moves the four values: a tab
 * is not always the same width as the last one, so the pill has to grow or
 * shrink as it moves.
 */
function pillStyle(pill: Pill | null): CSSProperties {
  return {
    top: pill?.y ?? 0,
    left: pill?.x ?? 0,
    width: pill?.width ?? 0,
    height: pill?.height ?? 0,
    opacity: pill?.visible ? 1 : 0,
  };
}

/**
 * Measure the pill against the bar it lives in, and follow the page.
 *
 * The measurement is a layout read: the bar's width depends on the wordmark's
 * and the fonts', and on whether the stylesheet is showing this bar at all. It
 * runs in a layout effect so the move starts from the old frame and lands on
 * the new one before anything is painted; a measurement taken after the paint
 * would show the pill on the new tab for a frame and then jump it backwards to
 * travel.
 *
 * `animate` is only true when the page changed. A rotation, a resize or a font
 * landing also moves the target, but those are not steps along the bar: the
 * pill should be on its tab already, so those measurements take effect at once
 * rather than sending it on a journey.
 *
 * A bar the stylesheet is hiding (the wrong one for this viewport) measures as
 * nothing. There is no target to follow, so the pill is only made invisible and
 * keeps its place for when the bar comes back.
 */
function usePill<T extends HTMLElement>(pathname: string) {
  const bar = useRef<T>(null);
  const node = useRef<HTMLElement | null>(null);
  const [pill, setPill] = useState<Pill | null>(null);
  // What the pill has been told to show. Its rendered box can be behind this
  // while an animation is running, which is why a new move reads the element.
  const shown = useRef<Pill | null>(null);
  const travel = useRef<Animation | null>(null);

  // A callback ref rather than a ref object because the two bars hold the pill
  // in different elements, and either may be the one on screen.
  const pillRef = useCallback((element: HTMLElement | null) => {
    node.current = element;
  }, []);

  const measure = useCallback((animate: boolean) => {
    const box = bar.current;
    if (!box) return;

    const active = box.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active || box.offsetParent === null) {
      travel.current?.cancel();
      travel.current = null;
      if (shown.current) shown.current = { ...shown.current, visible: false };
      setPill((current) => (current?.visible ? { ...current, visible: false } : current));
      return;
    }

    const frame = box.getBoundingClientRect();
    // A bar can name the box the mark should hug — the bottom bar's label — and
    // the words then set the mark's size. Without one the mark is the whole
    // link, which is what the top bar wants: its entries are word-sized.
    const label = active.querySelector<HTMLElement>("[data-nav-label]");
    const target = (label ?? active).getBoundingClientRect();
    // The label mark gets a little air round the words; the link mark needs
    // none, because its own padding is already inside the box.
    const air = label ? { x: 9, y: 4 } : { x: 0, y: 0 };
    const next: Pill = {
      x: target.left - frame.left - air.x,
      y: target.top - frame.top - air.y,
      width: target.width + air.x * 2,
      height: target.height + air.y * 2,
      visible: true,
    };

    const previous = shown.current;
    if (
      previous &&
      previous.visible &&
      previous.x === next.x &&
      previous.y === next.y &&
      previous.width === next.width &&
      previous.height === next.height
    ) {
      return;
    }

    // Where the pill is *now*, not where it was last sent: a second tap while
    // the first move is still in the air picks the mark up mid-flight, so the
    // two steps read as one continuous journey.
    const element = node.current;
    const from: PillBox | null =
      element && previous?.visible
        ? (() => {
            const rendered = element.getBoundingClientRect();
            return {
              x: rendered.left - frame.left,
              y: rendered.top - frame.top,
              width: rendered.width,
              height: rendered.height,
            };
          })()
        : null;

    shown.current = next;
    setPill(next);

    if (!element) return;

    // The inline box is already the target, so cancelling leaves the pill where
    // it belongs. An interrupted move starts again from the box just read.
    travel.current?.cancel();
    travel.current = null;

    if (!animate || !from || motionReduced()) return;

    travel.current = element.animate(travelKeyframes(from, next), {
      duration: TRAVEL_MS,
      // Each keyframe carries its own curve; the animation as a whole is the
      // timeline those curves are written against.
      easing: "linear",
    });
  }, []);

  useLayoutEffect(() => {
    measure(true);
  }, [measure, pathname]);

  useEffect(() => {
    const box = bar.current;
    if (!box) return;

    // A rotation, a window dragged, or the bar appearing at the stylesheet's
    // breakpoint all change the geometry the pill is measured against.
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(box);
    const onResize = () => measure(false);
    window.addEventListener("resize", onResize);
    // Web fonts land after the first measure and change every label's width,
    // which changes every tab's width with them.
    document.fonts?.ready.then(() => measure(false)).catch(() => {});

    return () => {
      travel.current?.cancel();
      travel.current = null;
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [measure]);

  return { bar, pillRef, pill };
}

/**
 * Leaves the step a link is taking for the page that will arrive.
 *
 * Read at click time because this is the only moment both ends are known: which
 * section the reader is standing in, and which one they picked.
 */
function rememberDirection(pathname: string, href: string): void {
  const direction = navDirection(pathname, href);
  if (direction) setPageDirection(direction);
}

/**
 * How an entry answers the pointer.
 *
 * The tab you are already in has no second mark of its own — the pill behind it
 * is that mark — so it only takes the reading colour. A tab being reached for
 * takes the same colour and thickens its type, with no border or fill: the pill
 * stays the only box in the bar. Keyboard focus keeps a ring of its own, which
 * a pointer never sees.
 *
 * The transparent border is kept as a frame, not as an outline: it is what
 * makes a hovered entry the same size as a settled one.
 */
function navItemClass(active: boolean): string {
  return `relative border border-transparent transition-colors ${
    active
      ? "text-accent-strong"
      : "text-muted hover:font-semibold hover:text-accent-strong focus-visible:text-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  }`;
}

/** The row of sections across the top bar. Desktop and landscape tablets. */
export function TopNav() {
  const pathname = usePathname();
  const { bar, pillRef, pill } = usePill<HTMLElement>(pathname);

  return (
    <nav ref={bar} aria-label="Sections" className="app-nav-top relative items-center gap-0.5">
      <span
        ref={pillRef}
        aria-hidden="true"
        className="nav-pill rounded-xl"
        style={pillStyle(pill)}
      />
      {PRIMARY_NAV.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => rememberDirection(pathname, item.href)}
            className={`rounded-full px-3 py-2 text-sm font-medium ${navItemClass(active)}`}
          >
            {/* The bolder label sits under the quiet one at its full width, so
                thickening the type on hover moves no tab and leaves the pill
                under the right word. */}
            <span className="nav-label">
              <span>{item.label}</span>
              <span aria-hidden="true" className="nav-label-wide">
                {item.label}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The tab bar along the bottom edge. Phones and upright tablets. */
export function BottomNav({ onOpenMenu, menuOpen }: BottomNavProps) {
  const pathname = usePathname();
  const { bar, pillRef, pill } = usePill<HTMLUListElement>(pathname);

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
      <ul ref={bar} className="relative mx-auto flex w-full max-w-lg items-stretch">
        {/* A list item, because the bar is a list: an absolutely positioned
            cell takes no space in the row, but it does not leave the markup
            with a child the list cannot hold. */}
        <li
          ref={pillRef}
          aria-hidden="true"
          className="nav-pill rounded-2xl"
          style={pillStyle(pill)}
        />
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 p-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => rememberDirection(pathname, item.href)}
                className={`flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-[11px] font-medium ${navItemClass(
                  active
                )}`}
              >
                <Glyph name={item.icon} className="h-6 w-6" />
                {/* The words are their own box so the bar's mark can be
                    measured from them rather than from the whole tab. */}
                <span data-nav-label>{item.label}</span>
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
