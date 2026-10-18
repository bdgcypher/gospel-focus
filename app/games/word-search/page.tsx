import { WordSearchPage } from "@/components/word-search-page";
import { featureMetadata } from "@/lib/features";

export const metadata = featureMetadata("word-search");

export default function Page() {
  return <WordSearchPage />;
}
