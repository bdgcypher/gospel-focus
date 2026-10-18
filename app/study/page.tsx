import { FeatureCard, FeatureGrid } from "@/components/feature-card";
import { FeaturePage } from "@/components/feature-page";
import { featureById, featuresInGroup, groupById, type Feature } from "@/lib/features";

const group = groupById("study");
/** The section reading belongs to. Its own copy, so the two can't disagree. */
const reading = groupById("read");
/** The picker's own entry, so the card points where the catalog says it is. */
const picker = featureById("picker");
/** Searching is the way into the words from here, so it leads the wall. */
const search = featureById("search");
/** The rest of the section, in the catalog's order. */
const rest = featuresInGroup("study").filter((feature) => feature.id !== "search");

/**
 * Reading is where studying starts, so the way to the passage picker sits here
 * as well as on the hub. It is a card like the others rather than the wide
 * banner it used to be — one wall, two across, with the search first — so the
 * heading and the line under it come from the Read section's catalog entry and
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

export const metadata = {
  title: "Study · Gospel Focus",
  description:
    "Search, memorization, reading plans, context, and a journal — the tools that carry the words past the draw.",
};

export default function Page() {
  return (
    <FeaturePage
      title={group?.label ?? "Study"}
      subtitle={group?.blurb ?? "Tools for taking the words with you"}
      icon="book"
      status="ready"
    >
      <FeatureGrid>
        {search && <FeatureCard feature={search} />}
        <FeatureCard feature={readCard} cta="New passage" />
        {rest.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </FeatureGrid>
    </FeaturePage>
  );
}
