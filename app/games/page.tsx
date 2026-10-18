import { FeaturePage } from "@/components/feature-page";
import { FeatureGrid } from "@/components/feature-card";
import { featuresInGroup, groupById } from "@/lib/features";

const group = groupById("games");

export const metadata = {
  title: "Games · Gospel Focus",
  description: "Quiz, word puzzle, word-search, and a coloring book — built on the passages you have read.",
};

export default function Page() {
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
