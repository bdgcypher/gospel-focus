"use client";

import Link from "next/link";
import { FeaturePage } from "./feature-page";
import { FeatureGrid } from "./feature-card";
import { featuresInGroup, groupById, type Feature } from "@/lib/features";
import { citationHref } from "@/lib/picker";

const group = groupById("games");

/**
 * The wall's order, by id: the two games played with today's passage first,
 * then the quiz. The catalog keeps its own order — this page leads with the
 * daily habit rather than with the list it grew up in.
 */
const ORDER = ["wordle", "word-search", "reference-quiz"];
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
      // The strapline is a verse rather than the catalog's line, set the way the
      // study hub, the memorizer and the reference quiz set theirs: the words in
      // the serif italic they are read in, the citation after them and kept
      // whole. Play is one way into the words, and this is the verse that says
      // a merry heart is good medicine — the page names the cheer it is for.
      subtitle={
        <span>
          <span className="font-serif italic text-foreground/85">
            &ldquo;A merry heart doeth good like a medicine&rdquo;
          </span>{" "}
          <span className="whitespace-nowrap font-semibold">
            —{" "}
            <Link
              href={citationHref({
                kind: "scripture",
                book: "Proverbs",
                chapter: "17",
                section: 22,
              })}
              className="text-accent-strong hover:underline"
            >
              Proverbs 17:22
            </Link>
          </span>
        </span>
      }
      status="ready"
    >
      <FeatureGrid features={games} />
    </FeaturePage>
  );
}
