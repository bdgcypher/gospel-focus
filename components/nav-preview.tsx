"use client";

import { createElement, useEffect, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";

/**
 * The page on the other side of a swipe, already drawn.
 *
 * A finger turning to the next section expects to see the next section — not a
 * blank edge that becomes a page once the thumb lifts. So the page is mounted
 * while the drag is still happening, in a panel just off the side of the screen,
 * and the stylesheet slides it in behind the page that is leaving (see
 * "Sweeping between sections" in globals.css).
 *
 * It is the *same component* the route renders, not a sketch of it: the swipe
 * reveals the real heading, the real cards, the real words. That is what makes
 * the movement read as one connected page rather than as a white card with a
 * title on it — and it is why /study and /games moved their bodies into
 * components (components/study-page.tsx) instead of staying in their route
 * files, which a client component could not import.
 *
 * Each page is loaded on demand rather than with the app. The alternative —
 * importing all four here, where the app bar lives — would put every section's
 * code into the bundle every section loads, on a phone, for a movement most
 * readers will make a few times a day. `prefetchSection` fetches the neighbours
 * of the page the reader is on shortly after it opens, so the first swipe
 * already has its page in hand.
 *
 * The page is held in a cache and rendered directly rather than through
 * `React.lazy`, and that is not a style choice. An update that suspends is
 * retried at transition priority, and a transition yields to continuous input —
 * which is exactly what a drag is. Under `lazy` the panel stayed empty for the
 * whole gesture and filled in only once the thumb lifted, which is precisely
 * the beat this feature exists to remove. Importing into a cache and setting
 * state when it lands is an ordinary update, so the page appears mid-drag.
 *
 * The panel is decoration and nothing else: it is `inert` and hidden from
 * assistive technology, and the pointer passes through it untouched. The reader
 * is looking at the page, not operating it — the operation happens when the
 * page arrives.
 */
type SectionPage = ComponentType;

const LOADERS: Record<string, () => Promise<SectionPage>> = {
  "/": () => import("./home-page").then((module) => module.HomePage),
  "/study": () => import("./study-page").then((module) => module.StudyPage),
  "/games": () => import("./games-page").then((module) => module.GamesPage),
  "/focus": () => import("./focus-page").then((module) => module.FocusPage),
};

/** Pages already in hand, by section. */
const CACHE = new Map<string, SectionPage>();
/** Loads already in the air, so two callers never fetch the same chunk twice. */
const INFLIGHT = new Map<string, Promise<SectionPage>>();

/** The page for a section if it has arrived, without starting anything. */
function loaded(href: string): SectionPage | null {
  return CACHE.get(href) ?? null;
}

function loadSection(href: string): Promise<SectionPage | null> {
  const already = loaded(href);
  if (already) return Promise.resolve(already);

  const load = LOADERS[href];
  if (!load) return Promise.resolve(null);

  let pending = INFLIGHT.get(href);
  if (!pending) {
    pending = load();
    INFLIGHT.set(href, pending);
  }

  return pending.then((page) => {
    CACHE.set(href, page);
    return page;
  });
}

/**
 * Warm a section's chunk before it is needed.
 *
 * The bundler caches the module, so the page is in the map by the time a thumb
 * reaches for it — which is the difference between the neighbour appearing with
 * the finger and appearing a beat after it.
 */
export function prefetchSection(href: string): void {
  // A failed load is not worth reporting: the swipe still lands on the real
  // page, and the route's own navigation will report anything actually broken.
  void loadSection(href).catch(() => {});
}

export function NavPreview({ href }: { href: string }) {
  const [page, setPage] = useState<SectionPage | null>(() => loaded(href));

  // The chunk may still be on its way — the very first swipe of a session can
  // beat the prefetch. When it lands the panel fills in, mid-gesture. (A page
  // already in hand needs nothing here: it was there on the first render.)
  useEffect(() => {
    if (loaded(href)) return;

    let live = true;
    loadSection(href)
      .then((arrived) => {
        if (live && arrived) setPage(() => arrived);
      })
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [href]);

  if (!page || typeof document === "undefined") return null;

  return createPortal(
    <div data-nav-preview="" data-nav-preview-for={href} aria-hidden="true" inert>
      {/* `createElement` rather than JSX: the component is only known once its
          chunk has landed, and a capitalised variable in JSX reads to both the
          linter and the next reader as a component defined in this file. */}
      {createElement(page)}
    </div>,
    document.body
  );
}
