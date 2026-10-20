"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isNavPage } from "@/lib/features";
import { pageArrivedByHand, pageDirection } from "@/lib/page-motion";

/**
 * A page's own wrapper: the box its content sits in, and the motion that brings
 * it in.
 *
 * The app's chrome — bar, sections, footer — lives in
 * components/app-chrome.tsx, mounted once by the root layout rather than here.
 * That split is what lets the section indicator travel: the navigation bars
 * outlive a navigation, so the pill has an old tab to start from. It also keeps
 * the bar itself still while the page moves underneath it.
 *
 * A section of the bar arrives by sliding in from the side it sits on, which is
 * the side the link left in lib/page-motion.ts. Everything else — a game, the
 * memorizer, settings — settles its blocks upward instead: it is not beside the
 * four in the bar, and sliding it in would claim a relationship it does not
 * have. The stylesheet holds both entrances (see "Changing pages" in
 * globals.css).
 *
 * A section handed over by a swipe arrives with no entrance at all. The finger
 * has already carried the page across (components/nav-swipe.tsx), and the page
 * that lands is standing exactly where the thumb left it; sliding it in again
 * from the edge would read as the app turning a second page the reader did not
 * ask for.
 *
 * The box is marked `data-app-page` so the drag can find it: the swipe has to
 * move the page itself, and the stylesheet is told which box that is (see
 * "Sweeping between sections" in globals.css). The mark is on this wrapper and
 * not on the page's `main` because it is the wrapper that the entrances above
 * move, and one box cannot have two ideas about where it is.
 *
 * The wrapper is a growing column rather than a bare fragment because the
 * page's `main` carries `flex-1`: it needs a parent that is itself a flex
 * column to fill a short viewport and push the footer to the foot of the
 * screen. It grows from its content and never shrinks below it, so a long page
 * is still as long as it is (see the note in app-chrome.tsx about the strip
 * the bottom bar reserves).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section = isNavPage(pathname);
  const direction = pageDirection();
  const byHand = pageArrivedByHand();

  const entrance = !section
    ? "page-rise"
    : byHand
      ? ""
      : direction === "forward"
        ? "page-enter page-enter-forward"
        : direction === "back"
          ? "page-enter page-enter-back"
          : "";

  return (
    <div
      data-app-page
      className={["flex grow shrink-0 basis-auto flex-col", entrance].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
