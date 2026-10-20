"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PRIMARY_NAV, isNavPage } from "@/lib/features";
import { setPageDirection } from "@/lib/page-motion";

/**
 * A finger across the page, or across the bar, steps through the sections.
 *
 * The four tabs are one row, and the app already draws a move between them as
 * movement along that row: forward arrives from the right, back from the left
 * (see lib/page-motion.ts). A horizontal swipe is the same move made by hand,
 * so it uses the same direction and leaves the page entrance to say where the
 * reader went.
 *
 * Only the four sections are swiped. A tool under a tab — the memorizer, a
 * game, settings — is its own page rather than a neighbour in the row, and a
 * swipe there would promise a step that has no next tab. The bar's own links
 * are included: starting the gesture on a tab is natural, and the click that
 * would otherwise fire on release is swallowed once the gesture has become a
 * swipe (see `onClick`). Taps are untouched, so the links still work as links.
 *
 * The gesture is read from pointer events rather than from the browser's
 * scrolling, because a page has nothing to scroll sideways. A mostly vertical
 * drag is given back at once — the reader is scrolling, not turning a page —
 * and the page keeps its own vertical pan in the stylesheet (see the
 * `data-nav-swipe` rule in globals.css). `preventDefault` on the horizontal
 * move keeps a drag from
 * turning into a text selection, and the movement threshold means a slightly
 * crooked tap never counts.
 */

/** Movement before the gesture is read as horizontal rather than vertical. */
const SLOP = 12;

/** How far the finger must travel before the page changes. */
const COMMIT = 56;

/**
 * How long after a swipe a click is treated as its tail rather than as a tap.
 *
 * A touch that ends away from where it began can still produce a click on the
 * starting element, and that click would open a tab the reader did not choose.
 * The guard is short enough that a genuine tap after the swipe is not eaten.
 */
const CLICK_GUARD_MS = 450;

/** A path without its trailing slash, so "/study/" and "/study" agree. */
const withoutSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

export function NavSwipe() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isNavPage(pathname)) return;

    // Mark the document while a section page is on, so the stylesheet can let
    // the browser pan vertically without also claiming a horizontal drag.
    document.documentElement.dataset.navSwipe = "on";

    let pointer: number | null = null;
    let startX = 0;
    let startY = 0;
    let horizontal = false;
    let guardUntil = 0;

    const indexOf = (path: string) =>
      PRIMARY_NAV.findIndex((item) => withoutSlash(item.href) === withoutSlash(path));

    const forget = () => {
      pointer = null;
      horizontal = false;
    };

    const onDown = (event: PointerEvent) => {
      // A mouse has no swipe here; the tabs are a pointer's row to click along.
      if (event.pointerType === "mouse" || !event.isPrimary) return;
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
      horizontal = false;
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
      }

      // The page has no horizontal scroll, so this movement is only the
      // gesture. Keeping it from the browser also keeps it from selecting text
      // under the finger while the swipe is in progress.
      if (event.cancelable) event.preventDefault();
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const wasHorizontal = horizontal;
      forget();

      if (!wasHorizontal) return;
      if (Math.abs(dx) < COMMIT || Math.abs(dx) < Math.abs(dy) * 1.4) return;

      // The gesture was a swipe even where there is no tab to turn to — the
      // first tab, the last one, or the menu button at the end of the row. Eat
      // the click it would otherwise leave behind before looking for a target.
      guardUntil = performance.now() + CLICK_GUARD_MS;

      const from = indexOf(pathname);
      if (from < 0) return;
      const to = dx < 0 ? from + 1 : from - 1;
      const target = PRIMARY_NAV[to];
      if (!target) return;

      // The bar's order runs left to right: a finger moving left turns
      // forward, and one moving right turns back.
      setPageDirection(dx < 0 ? "forward" : "back");
      router.push(target.href);
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
    document.addEventListener("pointercancel", forget, { passive: true });
    document.addEventListener("click", onClick, true);

    return () => {
      delete document.documentElement.dataset.navSwipe;
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", forget);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname, router]);

  return null;
}
