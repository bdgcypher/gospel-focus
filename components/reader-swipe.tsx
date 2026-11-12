"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { NavDirection } from "@/lib/features";
import { tapPageTurn } from "@/lib/haptics";
import { TURN_MS } from "@/lib/page-motion";
import {
  neighbourCitation,
  previewReaderDoc,
  type ReaderCitation,
  type ReaderDoc,
} from "@/lib/reader";
import { ReaderPreview } from "./reader-preview";

/**
 * A finger across the chapter turns to the chapter beside it — and the page
 * goes with the finger.
 *
 * It is the same gesture the bar's four tabs have (components/nav-swipe.tsx),
 * drawn by the same stylesheet: the chapter the reader is on is carried along
 * with the thumb, the next chapter rides in from the edge already drawn
 * (components/reader-preview.tsx), and a release past the commit point finishes
 * the turn while a short one springs back. At the first and last chapter of the
 * volume there is nothing on that side, so the page leans and is given back.
 *
 * Three things are deliberately different from the sections' swipe, and each is
 * because this page is a page of words rather than a page of cards:
 *
 * 1. **Not every sideways drag is a turn.** Dragging across words is how this
 *    app marks them, and a gesture that took that drag for a page turn would
 *    quietly break the reader's most-used tool. So a drag that begins on the
 *    words is left to the browser when it begins with a rest — that pause is
 *    how the browser starts a selection — and a drag from the margin at the
 *    edge of the screen, where there are no words, is a turn from the first
 *    sideways movement. Otherwise the finger may travel as slowly as it likes:
 *    the turn is read from the distance gone and the side the finger is on,
 *    never from its speed.
 *
 *    Nor is a side fixed once the drag has begun. A finger that crosses back
 *    through where it started is turning the other way, so the chapter peeking
 *    changes with it — and a release that lands on the starting point turns
 *    nothing at all.
 *
 * 2. **The tick is the turn's own.** The bar's section mark has a hand-off to
 *    ring when a tab is left behind (components/nav-bar.tsx); a chapter has no
 *    mark to leave, so the soft pulse comes as the finger carries the page past
 *    the point where letting go would turn it. It is the app's page-turn pulse,
 *    the same one the riffle plays.
 *
 * 3. **The turn ends when the chapter is on the page, not when the address
 *    changes.** Both chapters are the same route, so the reader resolves the new
 *    citation in place; the preview is lifted once the new document has actually
 *    been drawn under it (and lifted anyway after a second and a half, so a
 *    chapter that will not open can never leave the reader behind a cover).
 *
 * Nothing moves when the app's motion preference is off (see lib/preferences.ts):
 * the swipe still turns the chapter — that is navigation, not decoration — it
 * simply does so without drawing the movement.
 */

/** Movement before the gesture is read as horizontal rather than vertical. */
const SLOP = 12;

/**
 * How far the finger must travel before the chapter changes.
 *
 * Further than the sections' 56px would be here — the words are what the
 * finger is usually doing, and a turn should not be something a thumb falls
 * into on the way to a word.
 */
const COMMIT = 64;

/** A flick shorter than the distance but fast enough to mean the same thing. */
const FLICK = 0.4;
const FLICK_MIN = 26;

/**
 * How far a drag must move before a press that began on the words is read as a
 * turn rather than as a selection.
 *
 * A drag from the screen's edge does not wait: the margin has no words in it,
 * so the gesture is a turn from the moment it is sideways.
 */
const EDGE = 28;
const CLAIM = 24;

/**
 * How long a finger may rest before it moves and still be read as a swipe.
 *
 * Marking words begins with a press that does not move: the browser needs the
 * pause to start its selection, and the drag that follows extends it. A
 * sideways movement that only begins after that pause is the reader marking,
 * not turning, so it is left to the browser. A swipe — however slowly it is
 * made — starts moving at once, and that is what lets a slow swipe turn the
 * page.
 */
const HOLD = 350;

/** How far a page leans when there is nothing on that side to turn to. */
const EDGE_GIVE = 0.3;
const EDGE_MAX = 88;

/**
 * How long after a swipe a click is treated as its tail rather than as a tap.
 *
 * A drag that ends on a verse number would otherwise open the verse's sheet on
 * release. The guard is short enough that a genuine tap after the swipe is not
 * eaten.
 */
const CLICK_GUARD_MS = 450;

/**
 * The longest the app will hold the preview up waiting for a chapter to arrive.
 *
 * A chapter that fails to open — offline, a broken chunk — must not leave the
 * reader behind a cover they cannot move. After this the cover comes down
 * whatever happened, and the page they were on is usable again.
 */
const LANDING_TIMEOUT_MS = 1800;

/** One turn in flight, remembered across the navigation it causes. */
interface Turn {
  /** Set from the release of a committed swipe until the new chapter is drawn. */
  awaiting: boolean;
  /** The document the turn started from, so its replacement can be recognised. */
  from: string;
  /** When the finger lifted, so the reveal can wait out the settle. */
  releasedAt: number;
  /** The timer that takes the cover away once the new chapter is underneath it. */
  reveal: number | null;
  /** The timer that brings the cover down even if the chapter never arrives. */
  safety: number | null;
  /** The timer that ends a spring-back. */
  settle: number | null;
}

export function ReaderSwipe({
  doc,
  onGo,
}: {
  /** The chapter on screen, whose neighbours are the two the swipe can reach. */
  doc: ReaderDoc | null;
  /** Open a citation as the reader's own chapter-navigation does. */
  onGo: (citation: ReaderCitation) => void;
}) {
  /** The chapter whose page is drawn off the side of the screen, if any. */
  const [pull, setPull] = useState<ReaderCitation | null>(null);
  const session = useRef<Turn>({
    awaiting: false,
    from: "",
    releasedAt: 0,
    reveal: null,
    safety: null,
    settle: null,
  });
  /**
   * The chapter and the way on from it, read by the listeners.
   *
   * The listeners are attached once for the life of the page, so they cannot
   * close over a render: a new chapter arrives every time the reader turns one,
   * and a stale document here would send the next swipe to a chapter that was
   * left two turns ago.
   */
  const latest = useRef({ doc, onGo });
  useEffect(() => {
    latest.current = { doc, onGo };
  });

  /**
   * Put the screen back the way it was.
   *
   * Idempotent on purpose: a turn ends from the arriving chapter or from the
   * safety timer, whichever comes first, and the other may still be in the air.
   */
  const teardown = useCallback(() => {
    const turn = session.current;
    for (const timer of [turn.reveal, turn.safety, turn.settle]) {
      if (timer !== null) window.clearTimeout(timer);
    }
    turn.reveal = null;
    turn.safety = null;
    turn.settle = null;
    turn.awaiting = false;

    const root = document.documentElement;
    // The curve goes before the distance does. With the transition still on,
    // clearing the slide would animate the page *back* across the screen — the
    // one movement nobody asked for.
    root.removeAttribute("data-nav-settling");
    root.removeAttribute("data-nav-dragging");
    root.removeAttribute("data-nav-dir");
    root.style.removeProperty("--nav-slide");
    root.style.removeProperty("--nav-lead");
    setPull(null);
  }, []);

  /**
   * Warm the two chapters either side before anyone asks for them.
   *
   * A swipe should show the next chapter on the way past, not after it. The
   * volume files are already in memory for the chapter being read, so this is
   * a short read of the same bundle — but a chapter across a book boundary
   * lands in the next volume, and that fetch is far better spent now than
   * under a thumb. The wait keeps it out of the first paint, as the sections'
   * prefetch does.
   */
  useEffect(() => {
    if (!doc) return;
    const neighbours = [doc.prev, doc.next]
      .filter((neighbour) => neighbour !== null)
      .map((neighbour) => neighbourCitation(doc, neighbour));
    const timer = window.setTimeout(() => {
      neighbours.forEach((citation) => void previewReaderDoc(citation).catch(() => {}));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [doc]);

  /**
   * Take the cover away once the chapter under it has been painted.
   *
   * The wait is the rest of the settle, not a constant: a chapter that arrives
   * quickly is still sliding in, and lifting the cover then would reveal the
   * jump the slide was covering. When it was slow the slide has already
   * finished, so the cover goes at once.
   */
  useEffect(() => {
    const turn = session.current;
    if (!turn.awaiting || !doc) return;
    // The old document is still the one on the page until the reader has
    // resolved the new citation; its replacement is the signal that there is
    // something to uncover.
    if (doc.doc === turn.from) return;

    turn.awaiting = false;
    const remaining = Math.max(0, TURN_MS - (performance.now() - turn.releasedAt));
    // Two frames on top of that: one for the new chapter to be rendered into
    // the box the preview is covering, and one for that paint to land.
    turn.reveal = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(teardown));
    }, remaining + 16);
  }, [doc, teardown]);

  useEffect(() => {
    const root = document.documentElement;
    // Mark the document while the reader is on, so the stylesheet lets the
    // browser pan vertically without also claiming a horizontal drag. The
    // section pages set the same mark for their own swipe.
    root.dataset.navSwipe = "on";

    let pointer: number | null = null;
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let horizontal = false;
    let way: NavDirection | null = null;
    /** The neighbour to open, or null at the ends of the volume. */
    let target: ReaderCitation | null = null;
    /** Whether this drag has been taken as a turn, rather than left to the words. */
    let claimed = false;
    /** Whether the gesture began with a rest, which makes it the words'. */
    let selecting = false;
    /** Whether the turn has already been felt. */
    let ticked = false;
    let guardUntil = 0;

    const forget = () => {
      pointer = null;
      horizontal = false;
      way = null;
      target = null;
      claimed = false;
      selecting = false;
      ticked = false;
    };

    const slide = (px: number) => {
      root.style.setProperty("--nav-slide", `${px}px`);
    };

    /** Whether the reader has asked for less motion. */
    const motionReduced = () => root.dataset.reduceMotion === "true";

    /** Where the incoming chapter's own top edge sits, in this viewport. */
    const pageTop = () => {
      const header = document.querySelector("header");
      return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    };

    /**
     * Point the turn at a direction: work out which chapter is coming in and
     * hang it off the side of the screen the finger is coming from.
     *
     * Called when the drag starts and again whenever the finger crosses back
     * through where it began. The direction belongs to the finger rather than
     * to the gesture: a reader who changes their mind is turning the other
     * way, so the chapter peeking has to be the one that way leads to.
     */
    const aim = (direction: NavDirection) => {
      const current = latest.current.doc;
      if (!current) return;

      way = direction;
      const neighbour = direction === "forward" ? current.next : current.prev;
      target = neighbour ? neighbourCitation(current, neighbour) : null;
      // A new side has its own commit point to be felt at.
      ticked = false;

      // Nothing is drawn when motion is off. The turn itself still happens:
      // that is navigation, not decoration.
      if (motionReduced()) return;

      // Mounted before this move is painted rather than after it. React would
      // otherwise render at its own priority, and for a frame the edge of the
      // screen would be the colour of the page instead of the chapter arriving
      // on it. One synchronous render at the start of a turn costs nothing the
      // finger can feel; a blank peek costs the illusion.
      flushSync(() => setPull(target));
      root.dataset.navDir = direction;
      root.style.setProperty("--nav-lead", `${pageTop()}px`);
    };

    /** Take the gesture: from here on the page is in the finger's hand. */
    const begin = (direction: NavDirection) => {
      if (!latest.current.doc) return;
      claimed = true;
      if (!motionReduced()) {
        root.dataset.navDragging = "";
        root.style.setProperty("--nav-settle", `${TURN_MS}ms`);
      }
      aim(direction);
    };

    /** Carry the page with the thumb, within the width of the screen. */
    const follow = (dx: number) => {
      if (motionReduced()) return;
      if (!target) {
        // Nothing on that side: the page leans, damped, and comes back. That
        // give is the difference between a row that ends and a row that froze.
        slide(Math.max(-EDGE_MAX, Math.min(EDGE_MAX, dx * EDGE_GIVE)));
        return;
      }
      const width = window.innerWidth;
      const travelled = Math.max(-width, Math.min(width, dx));
      slide(travelled);
      // The point where letting go would turn the page is where the turn is
      // felt — the same beat the section mark's hand-off rings on the bar.
      if (!ticked && Math.abs(travelled) >= COMMIT) {
        ticked = true;
        void tapPageTurn();
      }
    };

    const onDown = (event: PointerEvent) => {
      // A mouse has no swipe here; the foot of the chapter is its way on.
      if (event.pointerType === "mouse" || !event.isPrimary) return;
      // A turn already in flight owns the screen until it lands.
      if (root.hasAttribute("data-nav-dragging")) return;
      // A sheet owns the screen while it is open; a swipe behind it would move
      // the page the reader cannot see.
      if (document.querySelector('[role="dialog"]')) return;
      // Words are already selected: this drag belongs to the selection, not to
      // the chapter.
      if (!window.getSelection()?.isCollapsed) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable], [data-no-swipe], [data-mark-handle], [role="toolbar"]'
        )
      ) {
        return;
      }

      pointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startedAt = performance.now();
      horizontal = false;
      way = null;
      target = null;
      claimed = false;
      selecting = false;
      ticked = false;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (!claimed && !selecting) {
        // A drag that has begun selecting words is about the words: the reader
        // is marking, and the chapter stays where it is.
        if (!window.getSelection()?.isCollapsed) {
          forget();
          return;
        }
        if (!horizontal) {
          if (Math.abs(dx) < SLOP) return;
          // Mostly vertical: this is the page scrolling, so stop reading it.
          if (Math.abs(dx) <= Math.abs(dy) * 1.2) {
            forget();
            return;
          }
          horizontal = true;
          // Left runs forward through the volume, right runs back — the way a
          // book's pages turn.
          way = dx < 0 ? "forward" : "back";
          if (startX <= EDGE || startX >= window.innerWidth - EDGE) begin(way);
          // A press that rested before it went sideways is the browser
          // starting a selection on the words: the drag that follows is the
          // reader's, not the chapter's, and is left entirely to the browser.
          else if (performance.now() - startedAt >= HOLD) {
            selecting = true;
            return;
          }
        }
        if (!claimed) {
          if (Math.abs(dx) < CLAIM || !way) return;
          begin(way);
          if (!claimed) return;
        }
      }

      // Nothing is the page's until this drag has been taken as a turn; a drag
      // that is still the words' must reach the browser untouched.
      if (!claimed) return;

      // The finger can turn back before it lets go. The page follows the side
      // of the start the finger is on, so the chapter peeking has to change
      // with it — otherwise a change of mind would still turn the page the
      // reader first reached for.
      const heading = dx < 0 ? "forward" : "back";
      if (way !== heading) aim(heading);

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
      const wasClaimed = claimed;
      const direction = way;
      // The finger's last position decides which way the turn goes. A release
      // on the other side of where the drag began — without a movement in
      // between — is not a turn at all.
      const changedMind = direction !== null && direction !== (dx < 0 ? "forward" : "back");
      const citation = changedMind ? null : target;
      const felt = ticked;
      const travelled = Math.abs(dx);
      forget();

      if (!wasHorizontal) return;
      // The drag was never taken as a turn: it was the reader's thumb on the
      // words, and nothing about the chapter changes.
      if (!wasClaimed) return;

      // The gesture was a swipe even where there is no chapter to turn to, so
      // eat the click it would otherwise leave behind on whatever it started
      // on — a verse number, the chapter's name, the bar.
      guardUntil = performance.now() + CLICK_GUARD_MS;
      if (!direction) return;

      const flicked = travelled >= FLICK_MIN && travelled / elapsed >= FLICK;
      const sideways = Math.abs(dx) > Math.abs(dy) * 1.2;

      if (!citation || !sideways || (travelled < COMMIT && !flicked)) {
        if (motionReduced()) return;
        // Short of the commit point, or nothing over there: the page goes back
        // to where it was on the elastic curve that brings it to rest.
        root.setAttribute("data-nav-settling", "");
        slide(0);
        session.current.settle = window.setTimeout(teardown, TURN_MS + 48);
        return;
      }

      // A flick commits before the finger ever reaches the commit point, and
      // has not been felt yet.
      if (!felt) void tapPageTurn();

      if (motionReduced()) {
        latest.current.onGo(citation);
        return;
      }

      root.setAttribute("data-nav-settling", "");
      // All the way over, whether the thumb got there or not.
      slide(direction === "forward" ? -window.innerWidth : window.innerWidth);

      const turn = session.current;
      turn.awaiting = true;
      turn.from = latest.current.doc?.doc ?? "";
      turn.releasedAt = performance.now();
      turn.safety = window.setTimeout(teardown, LANDING_TIMEOUT_MS);
      latest.current.onGo(citation);
    };

    const onCancel = () => {
      if (pointer === null) return;
      const wasClaimed = claimed;
      forget();
      if (!wasClaimed || motionReduced()) return;
      root.setAttribute("data-nav-settling", "");
      slide(0);
      session.current.settle = window.setTimeout(teardown, TURN_MS + 48);
    };

    const onClick = (event: MouseEvent) => {
      if (performance.now() > guardUntil) return;
      // The click is the tail of the swipe, not a choice of whatever it landed
      // on. Capturing it here stops that control's own click before it runs.
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
      root.removeAttribute("data-nav-settling");
      root.removeAttribute("data-nav-dragging");
      root.removeAttribute("data-nav-dir");
      root.style.removeProperty("--nav-slide");
      root.style.removeProperty("--nav-lead");
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("click", onClick, true);
    };
  }, [teardown]);

  return pull ? <ReaderPreview {...pull} /> : null;
}
