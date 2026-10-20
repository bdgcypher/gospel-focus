"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Glyph } from "./glyph";
import { PRIMARY_NAV, isNavActive, navDirection } from "@/lib/features";
import { TURN_MS, onTurn, setPageDirection } from "@/lib/page-motion";
import { tapSectionSnap } from "@/lib/haptics";

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
 * animation: the edge in the direction of travel leads, the edge behind holds
 * the words being left for a moment, and then comes away in one break. The mark
 * reads as something with weight rather than as a box being redrawn — and the
 * break is a moment, not a rate, so the highlight leaves the old tab at a point
 * the eye can catch rather than sliding off it. A tap and a swipe run the same
 * move, one from the press and one from the finger (see travelKeyframes and
 * `lift`).
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

/** A path without its trailing slash, so "/study/" and "/study" agree. */
const withoutSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/** Whether two boxes are the same place on the bar, to the pixel. */
function sameBox(a: PillBox, b: PillBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Put the mark's box where it is told, without a render.
 *
 * The same four properties React writes from the pill's state. Written by hand
 * where a gesture or an animation is moving the mark faster than a render can
 * follow, which is why they are inline rather than in the stylesheet.
 */
function paint(element: HTMLElement, box: PillBox): void {
  element.style.left = `${box.x}px`;
  element.style.top = `${box.y}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
}

/**
 * The link in `nav` that points at `href`.
 *
 * Both spellings of the trailing slash, because a link's href and a route's
 * name need not agree about one (the app renders ".../" for every route).
 */
function linkTo(nav: HTMLElement, href: string): HTMLAnchorElement | null {
  return (
    [...nav.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
      (link) => withoutSlash(link.getAttribute("href") ?? "") === withoutSlash(href)
    ) ?? null
  );
}

/**
 * When the mark lets go, and how fast it goes once it has.
 *
 * A highlight that shrank and grew at the same rate as it crossed would read as
 * a box being resized rather than as something with weight. So the edge behind
 * the finger holds on to the words being left — still touching them — while the
 * leading edge runs on, and then it comes away in one quick break and rides the
 * rest of the way with the lead. `TRAIL_HOLD` is how far along the leading edge
 * has to get before that break: a fifth of the move, whether that fifth is of
 * the clock (a press) or of the finger's travel (a drag), because the lead runs
 * with the page either way.
 *
 * `TRAIL_SNAP` is the share of the move the tail takes to close the gap after
 * it: the busiest part of the whole thing, where the tail travels at nearly
 * twice the lead's speed. That is what makes the break read as a snap rather
 * than as a slide — and it is measured on the clock, so a two-tab jump and a
 * step next door take the same time to come away. After it the mark is whole
 * again and travels as one box, which is what the last of the journey should
 * look like.
 */
const TRAIL_HOLD = 0.18;
const TRAIL_SNAP = 0.14;

/**
 * The same break on the clock, for a move nothing is holding.
 *
 * A press has no finger in it: nothing is keeping the old words under the mark,
 * so a grip of a fifth of the move — a tenth of a second in which the mark only
 * gets longer — is a balloon rather than a hold, and reads as one animation
 * followed by another when the mark finally goes. A press therefore grips for
 * only a flick of a second and runs on by a few pixels: enough that the mark is
 * pulled off the old word rather than teleported, little enough that the eye
 * reads the whole thing as one movement. The tick for a press lands here, and
 * on the release of a drag that never got as far as the break.
 */
const GRIP_HOLD = 0.09;

/**
 * Where the trailing edge is, as a share of its own journey.
 *
 * `lead` is how far the leading edge has got, as a share of its own, and `grip`
 * is where it was when the tail let go. Until then the tail has not moved at
 * all; after that it closes the gap on a curve that is quick away and eases
 * into the new tab, meeting the lead's own progress by the end of the window.
 * Meeting it is the point: from there the two edges cover the rest of the
 * distance together, and the mark has its tab's width again.
 */
function tailAcross(lead: number, grip: number): number {
  if (lead <= grip) return 0;
  const t = Math.min(1, (lead - grip) / TRAIL_SNAP);
  return lead * (1 - Math.pow(1 - t, 3));
}

/**
 * How long the mark takes to close a few pixels it was left off by.
 *
 * Shorter than a step, because it is not one: the bar moved under a mark that
 * had already landed, and the correction has to be over before the eye can
 * follow it to the wrong place.
 */
const CORRECTION_MS = 200;

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
 * The mark is drawn by its two edges rather than by its box, because that is
 * how the movement is read: the side in the direction of travel leads, and the
 * side behind holds on to the words being left until the leading edge has gone
 * far enough, comes away in one quick break, and then rides the rest of the way
 * with the lead (see `tailAcross`). Every frame below is a pair of edges — the
 * leading one and the trailing one — turned back into `left` and `width`.
 *
 * A press runs the whole of this. So does a swipe's release when the finger let
 * go before the tail had come away: there the mark still has its grip to lose,
 * and this is where it loses it. A release that broke the grip during the drag
 * asks for `hold: false` — the mark is already whole and already travelling, so
 * it only has the landing left, with the same little lean past the tab that a
 * page's own arrival has.
 *
 * The leading edge is eased both out of the hold and into its destination, and
 * the lean past the tab is a single pass with one return. A move of two tabs
 * crosses the tab between them on the way, and a curve with a hump at each end
 * — a quick flick across, a long slide, then a bounce — read as two animations
 * on that crossing rather than one long one. What this aims for instead is one
 * continuous deceleration from the old word to the new one, with the break at
 * the front of it and the lean at the back.
 *
 * The overshoot and the run-on are shares of the distance and of the tab's
 * width, held between a floor and a ceiling: below the floor the move has no
 * visible weight, and above the ceiling the mark would reach into the words of
 * the link beside the one it is landing on.
 */
function travelKeyframes(from: PillBox, to: PillBox, hold = true): Keyframe[] {
  const dx = to.x - from.x;
  const towards = dx < 0 ? -1 : 1;
  const overshoot = Math.min(8, Math.max(3, Math.abs(dx) * 0.05));
  // A press's run-on: a few pixels of pull, not the arm's length a finger takes.
  const runOn = Math.min(Math.abs(dx) * 0.5, Math.min(10, Math.max(4, Math.abs(dx) * 0.1)));

  const leadFrom = towards > 0 ? from.x + from.width : from.x;
  const leadTo = towards > 0 ? to.x + to.width : to.x;
  const trailFrom = towards > 0 ? from.x : from.x + from.width;
  const trailTo = towards > 0 ? to.x : to.x + to.width;

  // The lead's journey, in the lead's own terms: 0 at the old tab's edge, 1 at
  // the new one's, and past 1 while the mark is leaning beyond it.
  const span = Math.abs(leadTo - leadFrom) || 1;
  // Nothing to lean over on a correction of a pixel or two: the overshoot is a
  // share of a real journey, and a share of nothing is a twitch.
  const peak = span > 12 ? 1 + overshoot / span : 1;
  // Where the lead is when the tail lets go: whatever run-on it has by the end
  // of the hold, or nowhere if the drag already spent it.
  const grip = hold ? runOn / span : 0;

  /** Ease in and out: a move that gathers before it lands. */
  const smooth = (t: number) => t * t * (3 - 2 * t);

  /** The leading edge's share of its journey, at `at` of the move. */
  const leading = (at: number): number => {
    // Rushing on while the tail holds still: this is what lengthens the mark.
    if (hold && at <= GRIP_HOLD) {
      return grip * (1 - Math.pow(1 - at / GRIP_HOLD, 2));
    }
    const startedAt = hold ? GRIP_HOLD : 0;
    if (at <= 0.58) {
      // Across the bar, and leaning past the tab it is heading for.
      const start = hold ? grip : 0;
      return start + (peak - start) * smooth((at - startedAt) / (0.58 - startedAt));
    }
    if (at <= 0.78) {
      // The return: one pass, all the way back to the tab.
      return peak + (1 - peak) * smooth((at - 0.58) / 0.2);
    }
    return 1;
  };

  /**
   * The trailing edge's share of its journey, at `at` of the move.
   *
   * On the old link for the whole hold, and then chasing the lead over a window
   * measured on the clock rather than on the lead's progress: the gap is much
   * the same wherever the mark is going, so a fixed window keeps the break at
   * one length instead of making a two-tab jump whip across in a single frame
   * while a step next door takes four.
   */
  const trailing = (at: number): number => {
    if (!hold) return leading(at);
    if (at <= GRIP_HOLD) return 0;
    const t = Math.min(1, (at - GRIP_HOLD) / TRAIL_SNAP);
    return leading(at) - grip * Math.pow(1 - t, 3);
  };

  const frame = (at: number): Keyframe => {
    const lead = leading(at);
    const leadAt = leadFrom + (leadTo - leadFrom) * lead;
    const trailAt = trailFrom + (trailTo - trailFrom) * trailing(at);
    return {
      // Rounded because a sum of the constants lands on 0.33999999999999997,
      // and an offset is a place on the timeline, not a measurement.
      offset: Math.round(at * 1000) / 1000,
      left: `${Math.min(leadAt, trailAt)}px`,
      top: `${from.y + (to.y - from.y) * at}px`,
      width: `${Math.abs(leadAt - trailAt)}px`,
      height: `${from.height + (to.height - from.height) * at}px`,
      // Each frame is a sample of the curves above, so the segments between
      // them are the straight lines those curves are drawn with.
      easing: "linear",
    };
  };

  return [
    0,
    0.04,
    // The break, the whip across the bar that follows it, and the lean.
    GRIP_HOLD,
    GRIP_HOLD + 0.04,
    GRIP_HOLD + 0.08,
    GRIP_HOLD + 0.12,
    GRIP_HOLD + 0.18,
    0.40,
    0.49,
    0.58,
    0.68,
    0.78,
    1,
  ].map(frame);
}

/**
 * The pill's box, or nothing to show yet.
 *
 * Written as a position rather than a transform because that is the box the
 * measurement produced, and the travel animation moves the four values: a tab
 * is not always the same width as the last one, so the pill has to grow or
 * shrink as it moves. A drag writes the same four properties directly (see the
 * turn effect in `usePill`), which is why they are inline rather than in the
 * stylesheet: the mark must not depend on CSS arriving at the same time as the
 * code that moves it.
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
  /**
   * A tap's own move, from the press to the page under it.
   *
   * Held apart from `travel` because the measurement that follows the page
   * change has to recognise this as the move already in the air rather than
   * start a second one over the top of it (see `lift`). The link is kept with
   * it rather than only the box: a box is a pixel measurement, and the one taken
   * at the press can be a pixel or two out from the one taken on arrival — a
   * finger leaves `:hover` behind it, and a hovered label is set in a heavier
   * weight than the settled one. Recognising the move by the link it is a move
   * *to* is what keeps that pixel from restarting the whole animation.
   */
  const press = useRef<{
    link: HTMLElement;
    from: PillBox;
    to: PillBox;
    animation: Animation;
  } | null>(null);
  /** The hand-off tick a move has scheduled, so it can be called off with it. */
  const tick = useRef<number | null>(null);

  // A callback ref rather than a ref object because the two bars hold the pill
  // in different elements, and either may be the one on screen.
  const pillRef = useCallback((element: HTMLElement | null) => {
    node.current = element;
  }, []);

  const clearTick = useCallback(() => {
    if (tick.current !== null) window.clearTimeout(tick.current);
    tick.current = null;
  }, []);

  /**
   * Where the mark for one link sits, in the bar's own coordinates.
   *
   * A bar can name the box the mark should hug — the bottom bar's label — and
   * the words then set the mark's size. Without one the mark is the whole link,
   * which is what the top bar wants: its entries are word-sized. A label mark
   * also gets a little air round the words; a link mark needs none, because its
   * own padding is already inside its box.
   */
  const boxOf = useCallback((link: HTMLElement, frame: DOMRect): PillBox => {
    const label = link.querySelector<HTMLElement>("[data-nav-label]");
    const target = (label ?? link).getBoundingClientRect();
    const air = label ? { x: 9, y: 4 } : { x: 0, y: 0 };
    return {
      x: target.left - frame.left - air.x,
      y: target.top - frame.top - air.y,
      width: target.width + air.x * 2,
      height: target.height + air.y * 2,
    };
  }, []);

  /** Where the pill actually is, which may be partway through a journey. */
  const rendered = useCallback((element: HTMLElement, frame: DOMRect): PillBox => {
    const box = element.getBoundingClientRect();
    return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height };
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
    const next: Pill = { ...boxOf(active, frame), visible: true };

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

    shown.current = next;
    setPill(next);

    const element = node.current;
    // A finger owns the mark while it is turning the row: the drag's own snap
    // lands it, and only the remembered box is updated here, so the next
    // measurement starts from the right place.
    if (!element || element.hasAttribute("data-pill-drag")) return;

    // A press has already set the mark travelling for this link (see `lift`):
    // that animation *is* the move, and this measurement only records where it
    // is going. Restarting from partway along it would look like the mark sets
    // off, changes its mind, and does the whole move again — which is exactly
    // what it did when this compared the two boxes to the pixel, and a label
    // that was bold under the finger came back thin once it was the active tab.
    const pressed = press.current;
    if (pressed && pressed.link === active) {
      // The box can move under a move that is already in the air — the label the
      // finger left behind it was set in the heavier weight, and the settled one
      // is not, or the bar itself shifted. The frames are re-aimed at the box
      // the mark should end on, keeping the animation's own clock, so the move
      // neither restarts nor lands a pixel or two off the words.
      if (!sameBox(pressed.to, next)) {
        pressed.to = next;
        const effect = pressed.animation.effect as KeyframeEffect | null;
        effect?.setKeyframes(travelKeyframes(pressed.from, next, true));
      }
      return;
    }

    // Anything else a press had the mark doing is over — the bar is being
    // measured, and this is the move now.
    if (pressed) {
      pressed.animation.cancel();
      press.current = null;
      clearTick();
    }

    // Where the pill is *now*, not where it was last sent: a second tap while
    // the first move is still in the air picks the mark up mid-flight, so the
    // two steps read as one continuous journey.
    const from: PillBox | null = previous?.visible ? rendered(element, frame) : null;

    // The inline box is already the target, so cancelling leaves the pill where
    // it belongs. An interrupted move starts again from the box just read.
    travel.current?.cancel();
    travel.current = null;

    if (!animate || !from || motionReduced()) return;

    travel.current = element.animate(travelKeyframes(from, next), {
      duration: TURN_MS,
      // Each keyframe carries its own curve; the animation as a whole is the
      // timeline those curves are written against.
      easing: "linear",
    });
  }, [boxOf, rendered, clearTick]);

  /**
   * Set the mark moving for a link that has just been pressed.
   *
   * A swipe's mark comes away under the finger, so a tap's has to come away
   * under the press — at the moment of the click, not the moment the new page's
   * first paint lands. Waiting for the route would leave the mark sitting under
   * the old tab for a few frames while the page was already sliding in, and the
   * highlight would look towed along behind the page instead of leading it.
   *
   * The destination is measured from the pressed link, which is the only thing
   * that knows where the mark is going before the new page renders. It is then
   * the same animation either way — a press runs the whole of travelKeyframes,
   * and a swipe's release finishes it from wherever the finger left the mark —
   * so the two paths are one gesture seen from two ends.
   *
   * The measurement that follows the page change recognises this move rather
   * than starting another (see `measure`), and if the press turns out not to
   * change the page at all — a click the browser swallowed, a navigation that
   * failed — the mark goes back to the tab it left, on the same elastic return
   * a swipe that fell short makes.
   */
  const lift = useCallback(
    (href: string) => {
      const nav = bar.current;
      const element = node.current;
      if (!nav || !element) return;
      // A bar the stylesheet is hiding is not the one the reader pressed.
      if (nav.offsetParent === null) return;
      // A finger already owns the mark: the drag lands it when it lets go.
      if (element.hasAttribute("data-pill-drag")) return;

      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      const link = linkTo(nav, href);
      if (!active || !link) return;

      const frame = nav.getBoundingClientRect();
      const to = boxOf(link, frame);
      // Pressing the tab you are standing in is not a move.
      if (sameBox(to, boxOf(active, frame))) return;

      const from = rendered(element, frame);
      // Nothing of the old move belongs to this one.
      press.current?.animation.cancel();
      press.current = null;
      travel.current?.cancel();
      travel.current = null;
      clearTick();

      // With motion off there is nothing to draw, so the hand-off is the press
      // itself. The tick stays: it marks the section changing, not the drawing.
      if (motionReduced()) {
        tapSectionSnap();
        return;
      }

      const animation = element.animate(travelKeyframes(from, to), {
        duration: TURN_MS,
        easing: "linear",
      });
      press.current = { link, from, to, animation };
      travel.current = animation;

      // The tick belongs to the moment the trailing edge comes away from the
      // words being left — `GRIP_HOLD` into the move, the same beat a dragged
      // mark lets go on. Scheduled rather than fired here for that reason.
      tick.current = window.setTimeout(() => {
        tick.current = null;
        if (press.current?.animation === animation) tapSectionSnap();
      }, GRIP_HOLD * TURN_MS);

      animation.onfinish = () => {
        if (press.current?.animation !== animation) return;
        // Where the frames were last pointed, which is not necessarily where
        // they started out: the arrival may have re-aimed them (see `measure`).
        const aimed = press.current.to;
        press.current = null;
        if (travel.current === animation) travel.current = null;

        // Where the mark should have landed is measured again rather than
        // remembered, because the bar can move while a move is in the air. Two
        // things do that. A page that never arrived leaves the bar standing on
        // the tab it was, and the mark belongs back under it. A page that did
        // arrive can still have moved the bar — a shorter page takes the
        // scrollbar away, which shifts a centred row by half of it — so the
        // mark finishes the last few pixels of its journey rather than sitting
        // a hair off the words it is meant to be under.
        const box = bar.current;
        const here = box?.querySelector<HTMLElement>('[aria-current="page"]');
        if (!box || !here) return;
        const resting = boxOf(here, box.getBoundingClientRect());
        if (sameBox(resting, aimed)) return;

        // A pixel or two is not worth a second movement: the mark is already
        // where the bar says it should be as far as the eye goes, and the box
        // the animation was aimed at gives way to that one as it ends.
        if (Math.abs(resting.x - aimed.x) <= 2 && Math.abs(resting.width - aimed.width) <= 2) return;

        // Whether the press did its job decides how it gets there: a step back
        // is a whole move and keeps the grip, while a correction is a short
        // glide with nothing left to let go of.
        const landed = link.getAttribute("aria-current") === "page";
        const back = element.animate(travelKeyframes(aimed, resting, !landed), {
          duration: landed ? CORRECTION_MS : TURN_MS,
          easing: "linear",
        });
        travel.current = back;
        back.onfinish = () => {
          if (travel.current === back) travel.current = null;
          paint(element, resting);
        };
      };
    },
    [boxOf, rendered, clearTick]
  );

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
      press.current?.animation.cancel();
      press.current = null;
      clearTick();
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [measure, clearTick]);

  /**
   * Follow a finger that is turning the row, and land with it.
   *
   * The page draws the swipe (components/nav-swipe.tsx), but the mark is part
   * of the same movement: as the page crosses, the mark travels from the tab the
   * reader is on to the tab they are turning to, by the same fraction. It is
   * placed by writing the same four properties React writes at rest, on every
   * move — a handful of property writes beside the ones the page is already
   * doing, rather than a React render per frame.
   *
   * Letting go is where the feel is. The mark then runs the very animation a
   * pressed tab runs (travelKeyframes), from wherever the finger left it to the
   * tab it belongs on, over the same TURN_MS the page is settling over. It only
   * holds before it goes if the finger never took it past the break; a mark that
   * has already come away has nothing left but the landing. A drag that fell
   * short runs that same animation back to the tab it started from, so a rebound
   * reads as a page coming to rest rather than a box being put back.
   *
   * Measurement still owns the mark between turns. The drag only borrows it, and
   * `data-pill-drag` is how `measure` knows to keep its hands off while the
   * finger is in charge.
   */
  useEffect(() => {
    const nav = bar.current;
    if (!nav) return;

    let origin: PillBox | null = null;
    let destination: PillBox | null = null;
    let snap: Animation | null = null;
    /** Whether this turn has already given its hand-off tick. */
    let ticked = false;
    /** The tick a release has scheduled, for a finger that let go early. */
    let handoff: number | null = null;

    /** Put the mark's box where the turn has got to. */
    const draw = (box: PillBox) => {
      const element = node.current;
      if (element) paint(element, box);
    };

    /**
     * The mark's box, partway between the two tabs.
     *
     * The two edges are placed separately rather than the box being resized as
     * one. The leading edge — the one on the side the mark is travelling
     * towards — goes with the finger, at exactly the rate the page is moving.
     * The trailing edge stays on the words being left until the page has been
     * taken a fifth of the screen: that is the break, and it is deliberate that
     * it has a moment rather than a rate — the mark still belongs to the old tab
     * until the finger has gone far enough to mean the new one, and then it does
     * not. After the break the tail closes the gap in a fifth of that distance
     * and rides along with the lead, so the rest of the drag moves a whole mark
     * rather than stretching it further and further apart.
     */
    const between = (progress: number): PillBox | null => {
      if (!origin || !destination) return null;
      const at = Math.max(0, Math.min(1, progress));

      const towards = destination.x >= origin.x ? 1 : -1;
      const fromLead = towards > 0 ? origin.x + origin.width : origin.x;
      const toLead = towards > 0 ? destination.x + destination.width : destination.x;
      const fromTrail = towards > 0 ? origin.x : origin.x + origin.width;
      const toTrail = towards > 0 ? destination.x : destination.x + destination.width;

      const lead = fromLead + (toLead - fromLead) * at;
      const trail = fromTrail + (toTrail - fromTrail) * tailAcross(at, TRAIL_HOLD);

      return {
        x: Math.min(lead, trail),
        y: origin.y + (destination.y - origin.y) * at,
        width: Math.abs(lead - trail),
        height: origin.height + (destination.height - origin.height) * at,
      };
    };

    const stop = onTurn({
      start(href) {
        // A bar the stylesheet is hiding has nothing to draw.
        if (nav.offsetParent === null) return;

        const pillElement = node.current;
        const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
        if (!pillElement || !active) return;

        const frame = nav.getBoundingClientRect();
        const link = href ? linkTo(nav, href) : null;

        origin = boxOf(active, frame);
        destination = link ? boxOf(link, frame) : null;
        ticked = false;
        if (handoff !== null) window.clearTimeout(handoff);
        handoff = null;

        // The end of the row has no tab to follow: the mark stays where it is
        // while the page leans and comes back.
        if (!destination) return;

        travel.current?.cancel();
        travel.current = null;
        snap?.cancel();
        snap = null;

        pillElement.setAttribute("data-pill-drag", "");
      },

      progress(progress) {
        const box = between(progress);
        if (box) draw(box);

        // The trailing edge lets go a fifth of the way through the turn, and
        // that is the mark's hand-off — the beat the tick belongs to. Fired as
        // the finger takes the page past it, not on release: the mark is empty
        // of the old tab at this moment, whatever the finger does next.
        // Only the bar holding the mark says so: the other one is not on
        // screen, and a tick from it would arrive twice for one turn.
        if (!ticked && progress >= TRAIL_HOLD && node.current?.hasAttribute("data-pill-drag")) {
          ticked = true;
          tapSectionSnap();
        }
      },

      release(committed) {
        const pillElement = node.current;
        if (!origin || !destination || !pillElement?.hasAttribute("data-pill-drag")) return;

        const to = committed ? destination : origin;
        snap?.cancel();
        snap = null;

        if (motionReduced()) {
          draw(to);
          pillElement.removeAttribute("data-pill-drag");
          return;
        }

        // A release that never carried the mark past the hold — a flick short
        // enough to commit without the tail ever coming away — still has its
        // grip to lose, so its landing keeps the hold and the tick that goes
        // with it. A mark the drag has already broken free of has nothing left
        // but the landing, and a rebound has no hand-off to mark at all.
        const holding = committed && !ticked;
        const frame = nav.getBoundingClientRect();
        snap = pillElement.animate(travelKeyframes(rendered(pillElement, frame), to, holding), {
          duration: TURN_MS,
          easing: "linear",
        });

        if (holding) {
          ticked = true;
          handoff = window.setTimeout(() => {
            handoff = null;
            tapSectionSnap();
          }, GRIP_HOLD * TURN_MS);
        }

        // Left where the snap put it, so a page that is slow to arrive cannot
        // leave the mark falling back to the tab it came from.
        snap.onfinish = () => {
          snap = null;
          draw(to);
        };
      },

      done() {
        snap?.cancel();
        snap = null;
        if (handoff !== null) window.clearTimeout(handoff);
        handoff = null;
        origin = null;
        destination = null;
        node.current?.removeAttribute("data-pill-drag");

        // Given back the box the bar is showing. The drag wrote these four
        // properties by hand, and React only rewrites what it thinks changed —
        // so the resting box has to be written out here rather than assumed.
        const resting = shown.current;
        if (resting) draw(resting);
      },
    });

    return () => {
      stop();
      snap?.cancel();
      snap = null;
      if (handoff !== null) window.clearTimeout(handoff);
      handoff = null;
    };
  }, [boxOf, rendered]);

  return { bar, pillRef, pill, lift };
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

/**
 * A pressed link's step: the page's own slide, and the mark's move along the row.
 *
 * One handler for both bars because a press is a press in either: the direction
 * is left for the arriving page to read (lib/page-motion.ts), and the mark is
 * set moving here rather than waiting for the page to be rendered under it.
 *
 * A modified press — command-click, a middle click — opens the link somewhere
 * else rather than stepping anywhere, so the mark stays where it is.
 */
function useSectionPress(pathname: string, lift: (href: string) => void) {
  return useCallback(
    (event: MouseEvent, href: string) => {
      rememberDirection(pathname, href);
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      lift(href);
    },
    [pathname, lift]
  );
}

/** The row of sections across the top bar. Desktop and landscape tablets. */
export function TopNav() {
  const pathname = usePathname();
  const { bar, pillRef, pill, lift } = usePill<HTMLElement>(pathname);
  const press = useSectionPress(pathname, lift);

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
            onClick={(event) => press(event, item.href)}
            // The bar plays one tick of its own, when its mark comes away
            // (tapSectionSnap), so the app's press tick stays out of it: two
            // would make one tap sound like two (components/press-feedback.tsx).
            data-haptic="own"
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
  const { bar, pillRef, pill, lift } = usePill<HTMLUListElement>(pathname);
  const press = useSectionPress(pathname, lift);

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
          className="nav-pill rounded-lg"
          style={pillStyle(pill)}
        />
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 p-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={(event) => press(event, item.href)}
                // As above: one tick per turn, and none for a tab that is
                // already the page being read.
                data-haptic="own"
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
