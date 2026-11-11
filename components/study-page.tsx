"use client";

import Link from "next/link";
import { FeatureCard, FeatureGrid } from "./feature-card";
import { FeaturePage } from "./feature-page";
import { Glyph } from "./glyph";
import { featureById, featuresInGroup, groupById, type Feature } from "@/lib/features";
import { citationHref } from "@/lib/picker";

const group = groupById("study");
/** The section reading belongs to. Its own copy, so the two can't disagree. */
const reading = groupById("read");
/** The picker's own entry, so the card points where the catalog says it is. */
const picker = featureById("picker");
/** The reader's own entry: the library, named on this page for what it holds. */
const reader = featureById("reader");
/**
 * Searching is the way into the words from here, but it is not one of the
 * shelves: a card for it took a whole row of the wall it did not belong to. It
 * sits in the header's corner instead, the lens beside the arrow, and opens the
 * search page the way the reader's own lens does.
 */
const search = featureById("search");
/**
 * The wall's order, by id. The catalog keeps the study section in the order it
 * grew; the page has its own, which is the order a reader works in: the two
 * things you do with a passage — keep it, then write it down. A missing entry
 * drops out rather than leaving a gap.
 */
const ORDER = ["memorize", "journal"];
const rest = ORDER.map((id) => featuresInGroup("study").find((feature) => feature.id === id)).filter(
  (feature): feature is Feature => Boolean(feature),
);

/**
 * Reading is where studying starts, so the way to the passage picker sits here
 * as well as on the hub. It is a card like the others rather than the wide
 * banner it used to be — one wall, two across — so
 * the heading and the line under it come from the Read section's catalog entry and
 * the way there from the picker's, the way the rest of the wall comes from the
 * study section's. Its own call to action, though: the reader is drawing a new
 * passage, not "opening" a page — and its own short line as well, since the
 * section's line is written for the whole Read shelf rather than for a
 * half-width card.
 */
const readCard: Feature = {
  id: picker?.id ?? "picker",
  group: "read",
  href: picker?.href ?? "/read",
  title: reading?.label ?? "Random Scripture",
  blurb: reading?.blurb ?? "Flip open the scriptures and find inspiration!",
  tileBlurb: "A passage drawn at random",
  icon: picker?.icon ?? "book",
  status: "ready",
  capabilities: picker?.capabilities ?? [],
};

/**
 * The library itself: the reader page, named for what a reader finds there
 * rather than for the tool, and leading the wall.
 *
 * The two are the ways into the words — one that finds a passage and one that
 * opens any chapter — so they lead the wall together. It is also where the
 * reader's entry lives now that the More menu is the shelf and the settings
 * rather than a second set of doors (components/menu-panel.tsx). The heading is
 * this card's own, because the same page is "Reader" in the catalog and on the
 * home tiles; everything else comes from that entry, so the card and the page
 * cannot describe it differently.
 */
const libraryCard: Feature = {
  id: reader?.id ?? "reader",
  group: "read",
  href: reader?.href ?? "/read",
  title: "Library",
  tileTitle: "Library",
  tileBlurb: "Read any chapter, and mark the words",
  blurb: reader?.blurb ?? "Read a whole chapter, and mark the words that matter",
  icon: reader?.icon ?? "book",
  status: "ready",
  capabilities: reader?.capabilities ?? [],
};

/**
 * The Study hub.
 *
 * It lives here rather than in the route file because two things render it: the
 * page at /study, and the page's own preview while a finger is swiping towards
 * it (components/nav-preview.tsx). The route could not be imported from a
 * client component, and a second copy of this wall in the preview would be a
 * second thing to keep in step — the preview has to be the page, or the swap
 * when the swipe lands would show the reader two different pages in a row.
 */
export function StudyPage() {
  return (
    <FeaturePage
      title={group?.label ?? "Study"}
      // The strapline is a verse rather than the catalog's line, set the way the
      // memorizer and the streak page set theirs: the words in the serif italic
      // they are read in, the citation after them and kept whole. These tools exist
      // to carry the reader into the best books, which is what it says.
      subtitle={
        <span>
          <span className="font-serif italic text-foreground/85">
            &ldquo;seek ye out of the best books words of wisdom; seek learning, even by study and
            also by faith.&rdquo;
          </span>{" "}
          <span className="whitespace-nowrap font-semibold">
            —{" "}
            <Link
              href={citationHref({
                kind: "scripture",
                book: "Doctrine and Covenants",
                chapter: "88",
                section: 118,
              })}
              className="text-accent-strong hover:underline"
            >
              Doctrine and Covenants 88:118
            </Link>
          </span>
        </span>
      }
      status="ready"
      action={
        <Link
          href={search?.href ?? "/search"}
          aria-label="Search the library"
          title="Search"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
        >
          <Glyph name="search" className="h-6 w-6" />
        </Link>
      }
    >
      <FeatureGrid>
        <FeatureCard feature={libraryCard} cta="Read" />
        <FeatureCard feature={readCard} cta="New passage" />
        {rest.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </FeatureGrid>
    </FeaturePage>
  );
}
