import { WordlePage } from "@/components/wordle-page";
import { featureMetadata } from "@/lib/features";

export const metadata = featureMetadata("wordle");

export default function Page() {
  return <WordlePage />;
}
