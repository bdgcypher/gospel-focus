"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PRIMARY_NAV, isNavPage, type NavDirection } from "@/lib/features";
import {
  TURN_MS,
  setPageDirection,
  turnFinished,
  turnProgress,
  turnReleased,
  turnStarted,
} from "@/lib/page-motion";
import { NavPreview, prefetchSection } from "./nav-preview";

/**
 * A finger across a section page turns to the section beside it — and the page
 * goes with the finger.
 *
 * The four tabs are one row, and the app has always drawn a move between them
 * as movement along that row (see lib/page-motion.ts). A swipe used to be that
 * same move made by hand, but only in effect: the finger travelled, the page
 * sat still, and on release the next page slid in from the edge on its own. The
 * gesture and the picture disagreed.
 *
 * Now the drag is the movement. As the finger crosses, the page it is on is
 * carried with it, and the page on the other side is already drawn and rides in
 * behind it (components/nav-preview.tsx), so what the reader sees is one strip
 * of pages passing under a thumb rather than two separate screens taking turns.
 * Releasing past the commit point finishes the turn; releasing short of it
 * springs the page back, and a drag at the first or last tab leans the page and
 * gives it back, which is how the row says there is nothing that way.
 *
 * Three decisions hold the whole gesture together:
 *
 * 1. **The finger writes CSS, not React.** Every move sets one custom property
 *    on the document, and the stylesheet translates the page and the incoming
 *    panel from it (see "Sweeping between sections" in globals.css). A React
 *    state update per pointermove would re-render the tree on every frame of
 *    the one movement that has to stay at frame rate. React is told only when
 *    the *shape* of the gesture changes — which section is peeking — and even
 *    that happens once, when the drag first commits to a direction.
 *
 * 2. **The page lands where the thumb left it.** A swipe does not hand off to
 *    an entrance animation: the arriving page is told it was carried in by hand
 *    (lib/page-motion.ts), so it is already standing at rest behind the
 *    preview when the preview is taken away. Nothing slides twice.
 *
 * 3. **The chrome never moves.** The app bar, the bottom bar and its travelling
 *    pill sit above the moving pages and stay put, exactly as they do for a
 *    link's step. The pill's own journey between tabs is the bar's way of
 *    saying the same thing the pages are saying.
 *
 * Only the four sections are swept. A tool under a tab — the memorizer, a game,
 * settings — is its own page rather than a neighbour in the row, and a swipe
 * there would promise a step that has no next tab. The bar's own links are
 * included: starting the gesture on a tab is natural, and the click that would
 * otherwise fire on release is swallowed once the gesture has become a swipe
 * (see `onClick`). Taps are untouched, so the links still work as links.
 *
 * The gesture is read from pointer events rather than from the browser's
 * scrolling, because a page has nothing to scroll sideways. A mostly vertical
 * drag is given back at once — the reader is scrolling, not turning a page —
 * and the page keeps its own vertical pan in the stylesheet (see the
 * `data-nav-swipe` rule in globals.css). `preventDefault` on the horizontal
 * move keeps a drag from turning into a text selection, and the movement
 * threshold means a slightly crooked tap never counts.
 */

/** Movement before the gesture is read as horizontal rather than vertical. */
const SLOP = 12;

/** How far the finger must travel before the page changes. */
const COMMIT = 56;

/** A flick shorter than the distance but fast enough to mean the same thing. */
const FLICK = 0.4;
const FLICK_MIN = 26;

/** How far a page leans when there is nothing on that side to turn to. */
const EDGE_GIVE = 0.3;
const EDGE_MAX = 88;

/**
 * How long after a swipe a click is treated as its tail rather than as a tap.
 *
 * A touch that ends away from where it began can still produce a click on the
 * starting element, and that click would open a tab the reader did not choose.
 * The guard is short enough that a genuine tap after the swipe is not eaten.
 */
const CLICK_GUARD_MS = 450;

/**
 * The longest the app will hold the preview up waiting for a page to arrive.
 *
 * A navigation that fails to change the path — offline, a broken chunk, an
 * error page — must not leave the reader behind a cover they cannot move. After
 * this the cover comes down whatever happened, and the app is usable again.
 */
const LANDING_TIMEOUT_MS = 1800;

/** A path without its trailing slash, so "/study/" and "/study" agree. */
const withoutSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/** One turn in flight, remembered across the navigations it causes. */
interface Session {
  /** Set from the release of a committed swipe until the arriving page is drawn. */
  awaitingLanding: boolean;
  /** When the finger lifted, so the reveal can wait out the settle. */
  releasedAt: number;
  /** The timer that takes the cover away once the new page is underneath it. */
  reveal: number | null;
  /** The timer that brings the cover down even if the page never arrives. */
  safety: number | null;
  /** The timer that ends a spring-back. */
  settle: number | null;
}

export function NavSwipe() {
  const pathname = usePathname();
  const router = useRouter();
  /** The section whose page is drawn off the side of the screen, if any. */
  const [pull, setPull] = useState<string | null>(null);
  const session = useRef<Session>({
    awaitingLanding: false,
    releasedAt: 0,
    reveal: null,
    safety: null,
    settle: null,
  });

  /**
   * Put the screen back the way it was.
   *
   * Idempotent on purpose: a turn ends from a transition, from the arriving
   * page, or from the safety timer, whichever comes first, and the other two
   * may still be in the air.
   */
  const teardown = useCallback(() => {
    const turn = session.current;
    for (const timer of [turn.reveal, turn.safety, turn.settle]) {
      if (timer !== null) window.clearTimeout(timer);
    }
    turn.reveal = null;
    turn.safety = null;
    turn.settle = null;
    turn.awaitingLanding = false;

    const root = document.documentElement;
    // The curve goes before the distance does. With the transition still on,
    // clearing the slide would animate the page *back* across the screen —
    // the one movement nobody asked for.
    root.removeAttribute("data-nav-settling");
    root.removeAttribute("data-nav-dragging");
    root.removeAttribute("data-nav-dir");
    root.style.removeProperty("--nav-slide");
    root.style.removeProperty("--nav-lead");
    setPull(null);
    // The bars drew along with the turn; this is when they may put themselves
    // back. Sent last, so the mark lands on the page's final tab rather than
    // on a distance that has just been cleared.
    turnFinished();
  }, []);

  /**
   * Fetch the pages either side of this one before anyone asks for them.
   *
   * A swipe should show the next page on the way past, not after it — and a
   * chunk that only starts loading when the thumb does arrives a beat too
   * late, leaving the edge of the screen blank for the first tenth of a second.
   *
   * A short delay rather than an idle callback: idle scheduling is not
   * universal (Safari only gained it recently, and the app runs in a WKWebView),
   * and the wait is what keeps the prefetch out of the first paint. 250ms is
   * after the page has settled and well before a thumb could have travelled far
   * enough to start a turn.
   */
  useEffect(() => {
    if (!isNavPage(pathname)) return;

    const here = PRIMARY_NAV.findIndex((item) => withoutSlash(item.href) === withoutSlash(pathname));
    const neighbours = [PRIMARY_NAV[here - 1], PRIMARY_NAV[here + 1]].filter(Boolean);
    const timer = window.setTimeout(() => {
      neighbours.forEach((item) => prefetchSection(withoutSlash(item.href)));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  /**
   * Take the cover away once the page under it has been painted.
   *
   * The wait is the rest of the settle, not a constant: when the arriving page
   * is quick it is still sliding in, and lifting the cover then would reveal
   * the jump the slide was covering. When it was slow the slide has already
   * finished, so the cover goes at once.
   */
  useEffect(() => {
    const turn = session.current;
    if (!turn.awaitingLanding) return;

    turn.awaitingLanding = false;
    const remaining = Math.max(0, TURN_MS - (performance.now() - turn.releasedAt));
    // Two frames on top of that: one for the new page to be rendered into the
    // box the preview is covering, and one for that paint to actually land.
    turn.reveal = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(teardown));
    }, remaining + 16);
  }, [pathname, teardown]);

  useEffect(() => {
    if (!isNavPage(pathname)) return;

    const root = document.documentElement;
    // Mark the document while a section page is on, so the stylesheet can let
    // the browser pan vertically without also claiming a horizontal drag.
    root.dataset.navSwipe = "on";

    const here = PRIMARY_NAV.findIndex((item) => withoutSlash(item.href) === withoutSlash(pathname));

    let pointer: number | null = null;
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let horizontal = false;
    let direction: NavDirection | null = null;
    /** The section being swept towards, if there is one. */
    let target: string | null = null;
    let guardUntil = 0;

    const forget = () => {
      pointer = null;
      horizontal = false;
      direction = null;
      target = null;
    };

    const slide = (px: number) => {
      root.style.setProperty("--nav-slide", `${px}px`);
    };

    /**
     * How far through the turn the finger is, for anything else that travels
     * with it — the bar's section mark, which follows the same finger between
     * its two tabs (components/nav-bar.tsx). 0 at the tab the reader is
     * standing on, 1 at the one they are turning to.
     */
    const progress = (px: number) => {
      turnProgress(Math.min(1, Math.abs(px) / window.innerWidth));
    };

    /**
     * Whether the reader has asked for less motion.
     *
     * The app's own setting, written to the document before the first frame
     * (app/layout.tsx) — not the media query, which the setting starts from and
     * can then override. A swipe still turns the page; it just isn't drawn.
     */
    const motionReduced = () => root.dataset.reduceMotion === "true";

    /** Where the incoming page's own top edge sits, in this viewport. */
    const pageTop = () => {
      const header = document.querySelector("header");
      return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    };

    /**
     * Pick up the gesture: point the stylesheet at the page that is coming in,
     * and hang it off the side of the screen.
     */
    const begin = (way: NavDirection) => {
      direction = way;
      const step = PRIMARY_NAV[here + (way === "forward" ? 1 : -1)];
      target = step ? withoutSlash(step.href) : null;

      // Nothing is drawn when motion is off. The turn itself still happens:
      // that is navigation, not decoration.
      if (motionReduced()) return;

      // Mounted before this move is painted rather than after it. React would
      // otherwise render at its own priority, and for a frame the edge of the
      // screen would be the colour of the page instead of the page that is
      // arriving on it. One synchronous render at the start of a turn costs
      // nothing the finger can feel; a blank peek costs the illusion.
      if (target) flushSync(() => setPull(target));
      root.dataset.navDir = way;
      root.dataset.navDragging = "";
      root.style.setProperty("--nav-lead", `${pageTop()}px`);
      // One clock for the whole turn, written where the stylesheet reads it and
      // read back by the mark's own animation (see TURN_MS).
      root.style.setProperty("--nav-settle", `${TURN_MS}ms`);
      turnStarted(target);
    };

    /** Carry the page with the thumb, within the width of the screen. */
    const follow = (dx: number) => {
      if (!target) {
        // Nothing on that side: the page leans, damped, and comes back. That
        // give is the difference between a row that ends and a row that froze.
        slide(Math.max(-EDGE_MAX, Math.min(EDGE_MAX, dx * EDGE_GIVE)));
        return;
      }
      const width = window.innerWidth;
      const travelled = Math.max(-width, Math.min(width, dx));
      slide(travelled);
      progress(travelled);
    };

    const onDown = (event: PointerEvent) => {
      // A mouse has no swipe here; the tabs are a pointer's row to click along.
      if (event.pointerType === "mouse" || !event.isPrimary) return;
      // A turn already in flight owns the screen until it lands.
      if (root.hasAttribute("data-nav-dragging")) return;
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable], [data-no-swipe]")
      ) {
        return;
      }
      // A sheet owns the screen while it is open, including the menu's own
      // slide-in; a swipe behind it would move the page the reader cannot see.
      if (document.querySelector('[role="dialog"]')) return;

      pointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startedAt = performance.now();
      horizontal = false;
      direction = null;
      target = null;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (!horizontal) {
        if (Math.abs(dx) < SLOP) return;
        // Mostly vertical: this is the page scrolling, so stop reading it.
        if (Math.abs(dx) <= Math.abs(dy) * 1.2) {
          forget();
          return;
        }
        horizontal = true;
        // The bar's order runs left to right: a finger moving left turns
        // forward, and one moving right turns back.
        begin(dx < 0 ? "forward" : "back");
      }

      // The page has no horizontal scroll, so this movement is only the
      // gesture. Keeping it from the browser also keeps it from selecting text
      // under the finger while the swipe is in progress.
      if (event.cancelable) event.preventDefault();
      follow(dx);
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const elapsed = Math.max(1, performance.now() - startedAt);
      const wasHorizontal = horizontal;
      const way = direction;
      const href = target;
      const travelled = Math.abs(dx);
      forget();

      if (!wasHorizontal) return;

      // The gesture was a swipe even where there is no tab to turn to — the
      // first tab, the last one, or the menu button at the end of the row. Eat
      // the click it would otherwise leave behind, whether or not it goes on
      // to change the page.
      guardUntil = performance.now() + CLICK_GUARD_MS;

      const flicked = travelled >= FLICK_MIN && travelled / elapsed >= FLICK;
      const sideways = Math.abs(dx) > Math.abs(dy) * 1.2;

      if (!way) return;

      if (!href || !sideways || (travelled < COMMIT && !flicked)) {
        // Short of the commit point, or nothing over there: the page goes back
        // to where it was, and the mark with it, on the elastic curve that
        // brings a page to rest.
        root.setAttribute("data-nav-settling", "");
        slide(0);
        turnReleased(false);
        session.current.settle = window.setTimeout(teardown, TURN_MS + 48);
        return;
      }

      setPageDirection(way, "hand");
      root.setAttribute("data-nav-settling", "");
      // All the way over, whether the thumb got there or not.
      slide(way === "forward" ? -window.innerWidth : window.innerWidth);
      turnReleased(true);

      const turn = session.current;
      turn.awaitingLanding = true;
      turn.releasedAt = performance.now();
      turn.safety = window.setTimeout(teardown, LANDING_TIMEOUT_MS);
      router.push(href);
    };

    const onCancel = () => {
      if (pointer === null) return;
      const wasHorizontal = horizontal;
      forget();
      if (!wasHorizontal) return;
      root.setAttribute("data-nav-settling", "");
      slide(0);
      turnReleased(false);
      session.current.settle = window.setTimeout(teardown, TURN_MS + 48);
    };

    const onClick = (event: MouseEvent) => {
      if (performance.now() > guardUntil) return;
      // The click is the tail of the swipe, not a choice of the tab it landed
      // on. Capturing it here stops that tab's own click before it runs.
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onCancel, { passive: true });
    document.addEventListener("click", onClick, true);

    return () => {
      delete root.dataset.navSwipe;
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname, router, teardown]);

  return pull ? <NavPreview href={pull} /> : null;
}
