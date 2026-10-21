"use client";

import { FeaturePage } from "./feature-page";
import { FeatureGrid } from "./feature-card";
import { featuresInGroup, groupById, type Feature } from "@/lib/features";

const group = groupById("games");

/**
 * The wall's order, by id: the two games played with today's passage first,
 * then the quiz and the colouring book. The catalog keeps its own order — this
 * page leads with the daily habit rather than with the list it grew up in.
 */
const ORDER = ["wordle", "word-search", "reference-quiz", "coloring"];
const games = ORDER.map((id) => featuresInGroup("games").find((feature) => feature.id === id)).filter(
  (feature): feature is Feature => Boolean(feature),
);

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
      <FeatureGrid features={games} />
    </FeaturePage>
  );
}
