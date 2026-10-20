import type { NavDirection } from "./features";

/**
 * Which way the next page should arrive, and how it got there.
 *
 * A page cannot work out its own entrance: by the time it renders, the page it
 * replaced is gone, and the URL alone does not say whether the reader stepped
 * forward through the bar or back along it. The link that was pressed is the
 * only thing that knows, so it leaves the answer here (see
 * components/nav-bar.tsx) and the arriving page collects it.
 *
 * `by` is the hand-off. A link's step is drawn by the arriving page itself — it
 * slides in from the side its tab sits on. A swipe's step is not: the finger
 * has already carried the old page across and pulled the new one in behind it
 * (components/nav-swipe.tsx), so the page that lands is standing exactly where
 * the swipe left it and must not then slide a second time from the edge. The
 * direction is the same either way; only who drew the movement differs.
 *
 * It is a module variable rather than storage because it describes one
 * transition and nothing else — there is no reason for it to outlive the
 * navigation, or to be shared with another tab.
 */
let pending: { direction: NavDirection; by: "link" | "hand" } | null = null;

/** Called by whatever is leaving the page, with the step it is taking. */
export function setPageDirection(direction: NavDirection, by: "link" | "hand" = "link"): void {
  pending = { direction, by };
}

/**
 * The direction left for the page now arriving, without spending it.
 *
 * Reading without clearing is deliberate: a page renders more than once in
 * development, and a consumed value would leave the second render without its
 * entrance. Nothing is harmed by it lingering either — the next link replaces
 * it before the next page can read it.
 */
export function pageDirection(): NavDirection | null {
  return pending?.direction ?? null;
}

/**
 * Whether the finger that moved the reader here has already drawn the movement.
 *
 * True only for the page a swipe handed over, and only until the next link
 * writes a direction of its own.
 */
export function pageArrivedByHand(): boolean {
  return pending?.by === "hand";
}

/**
 * How long a turn along the bar takes.
 *
 * One number for all three of the things that finish one: the page sliding the
 * rest of the way, the incoming page coming in behind it, and the section mark
 * travelling to the tab it now belongs to. They are one movement seen in three
 * places, so they have to share a clock — a mark that arrived early, or a page
 * still settling after the bar had finished, reads as two movements. The
 * stylesheet takes it as `--nav-settle` (components/nav-swipe.tsx writes it out
 * before a drag starts) and the mark's own animation uses it directly.
 */
export const TURN_MS = 520;

/**
 * The four moments of a turn a finger is drawing, for anything that draws along
 * with it.
 *
 * The page and the bar are separate components, mounted separately, and a drag
 * is driven from the page's own listener (components/nav-swipe.tsx). The bar's
 * section mark has to follow the same finger, but it cannot read the page's
 * state any more than the page can read its geometry. So the turn is announced
 * here and whoever draws along subscribes. Nothing is stored: these are
 * moments, not a state.
 *
 * `start` carries the section being turned to (null at the end of the row),
 * `progress` is how far the finger has carried the page — the hot path, called
 * on every move, hence a plain function call rather than a DOM event —
 * `release` says whether the finger committed to the turn, and `done` is the
 * moment the whole turn is over and everything may be put back.
 */
export interface TurnHandlers {
  start?: (href: string | null) => void;
  progress?: (progress: number) => void;
  release?: (committed: boolean) => void;
  done?: () => void;
}

const handlers = new Set<TurnHandlers>();

/** Listen to the turn. Returns the unsubscribe. */
export function onTurn(handler: TurnHandlers): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function turnStarted(href: string | null): void {
  for (const handler of handlers) handler.start?.(href);
}

export function turnProgress(progress: number): void {
  for (const handler of handlers) handler.progress?.(progress);
}

export function turnReleased(committed: boolean): void {
  for (const handler of handlers) handler.release?.(committed);
}

export function turnFinished(): void {
  for (const handler of handlers) handler.done?.();
}
