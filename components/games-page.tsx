"use client";

import { FeaturePage } from "./feature-page";
import { FeatureGrid } from "./feature-card";
import { featuresInGroup, groupById } from "@/lib/features";

const group = groupById("games");

/**
 * The Games hub.
 *
 * Out of the route file for the same reason the Study hub is (see
 * components/study-page.tsx): the swipe preview renders this exact component,
 * so the page a thumb reveals and the page the swipe lands on are one page.
 */
export function GamesPage() {
  return (
    <FeaturePage
      title={group?.label ?? "Games"}
      subtitle={group?.blurb ?? "Play with what you know"}
      icon="puzzle"
      status="ready"
    >
      <FeatureGrid features={featuresInGroup("games")} />
    </FeaturePage>
  );
}
