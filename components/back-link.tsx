"use client";

import { useRouter } from "next/navigation";
import { Glyph } from "./glyph";

interface Props {
  /**
   * Where to go when there is no screen behind this one: a page opened straight
   * from a bookmark, a reminder, or a link, where the tab has nothing to go
   * back to. The hub is the safe landing place — the reader arrives somewhere
   * in the app rather than on a blank page.
   */
  fallbackHref?: string;
  /**
   * Extra classes for the button itself, for the place it is set in.
   *
   * A page header stacks it above the heading rather than beside it, and passes
   * the offsets that line the arrow's ink up with the words below; the 36px
   * target still hangs its usual 8px of empty space either side of the drawing.
   */
  className?: string;
}

/**
 * The history move behind every back control: one screen back, or the hub when
 * this tab has nothing behind it.
 *
 * Going back is the reader's place, not the app's front door. Someone who opens
 * favourites from the reader expects the passage again, and someone who reaches
 * a planned feature from the study hub expects the hub — a fixed destination
 * quietly loses where they were. The browser's own history is what "back" means
 * everywhere else, forward button included.
 *
 * `history.length` is the count of entries this tab holds, so one means the page
 * is the first thing opened in it. That is the only case that needs a
 * destination of its own.
 */
export function useGoBack(fallbackHref = "/") {
  const router = useRouter();

  return () => {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };
}

/**
 * The icon-only back control, at the top left of the page it belongs to.
 *
 * Just the arrow: no face, no rim, no height. It is the one control on every
 * page that a reader already knows by its shape, and a button drawn round it
 * made going back look like an action of the app's rather than the plain step
 * out that it is.
 *
 * The arrow is the app's own drawing — the one the rail's "back a level", the
 * bookmarks sheet's way out, and the journal's "All entries" use — turned to
 * face left. It used to be a thin chevron of its own, which was the one back
 * mark in the app that did not match the others, and its few pixels of ink left
 * a pocket of empty button either side, so a title set beside it read as a
 * separate thing stranded down the row.
 *
 * It is drawn at 24px inside its 36px target — big enough to read as the way
 * out at arm's length, and still the quietest mark on the page.
 *
 * It is a button rather than a link because where it leads depends on this tab's
 * history, so there is no href to offer a middle-click or a new tab.
 *
 * On a page's own header it sits on the line above the heading, not beside it:
 * the arrow is a step out of the page rather than one of the page's controls,
 * and stacking it lets the title start at the page's left edge with the whole
 * width in front of it. The offsets that line its ink up with that title live
 * at the call site, since they depend on the heading's own size.
 */
export function BackLink({ fallbackHref = "/", className = "" }: Props) {
  const goBack = useGoBack(fallbackHref);

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back to the previous screen"
      title="Back"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent-strong ${className}`}
    >
      <Glyph name="arrow" className="h-6 w-6 rotate-180" />
    </button>
  );
}
