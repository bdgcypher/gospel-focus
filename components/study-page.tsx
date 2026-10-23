"use client";

import Link from "next/link";
import { FeatureCard, FeatureGrid } from "./feature-card";
import { FeaturePage } from "./feature-page";
import { featureById, featuresInGroup, groupById, type Feature } from "@/lib/features";
import { citationHref } from "@/lib/picker";

const group = groupById("study");
/** The section reading belongs to. Its own copy, so the two can't disagree. */
const reading = groupById("read");
/** The picker's own entry, so the card points where the catalog says it is. */
const picker = featureById("picker");
/**
 * Searching is the way into the words from here, so it leads the wall — and it
 * leads it at full width, as the one card that opens the whole library rather
 * than one of the shelves inside it. A half-width card beside another read as
 * a pair when it is really the door.
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
 * banner it used to be — one wall, two across under the search's own row — so
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
      // memorizer and the reference quiz set theirs: the words in the serif italic
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
      icon="book"
      status="ready"
    >
      <FeatureGrid>
        {/* The search owns the first row on its own: two columns' worth of card,
            so the one door into the library is read before the shelves. */}
        {search && (
          <div className="col-span-2">
            <FeatureCard feature={search} />
          </div>
        )}
        <FeatureCard feature={readCard} cta="New passage" />
        {rest.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </FeatureGrid>
    </FeaturePage>
  );
}
