import type { NavDirection } from "./features";

/**
 * Which way the next page should arrive.
 *
 * A page cannot work out its own entrance: by the time it renders, the page it
 * replaced is gone, and the URL alone does not say whether the reader stepped
 * forward through the bar or back along it. The link that was pressed is the
 * only thing that knows, so it leaves the answer here (see
 * components/nav-bar.tsx) and the arriving page collects it.
 *
 * It is a module variable rather than storage because it describes one
 * transition and nothing else — there is no reason for it to outlive the
 * navigation, or to be shared with another tab.
 */
let pending: NavDirection | null = null;

/** Called by a link on its way out, with the step it is taking. */
export function setPageDirection(direction: NavDirection): void {
  pending = direction;
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
  return pending;
}
