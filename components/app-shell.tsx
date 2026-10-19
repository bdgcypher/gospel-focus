"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isNavPage } from "@/lib/features";
import { pageDirection } from "@/lib/page-motion";

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

  const entrance = section
    ? direction === "forward"
      ? "page-enter page-enter-forward"
      : direction === "back"
        ? "page-enter page-enter-back"
        : ""
    : "page-rise";

  return (
    <div className={["flex grow shrink-0 basis-auto flex-col", entrance].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
