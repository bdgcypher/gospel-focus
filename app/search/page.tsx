import { SearchPage } from "@/components/search-page";
import { featureMetadata } from "@/lib/features";

export const metadata = featureMetadata("search");

export default function Page() {
  return <SearchPage />;
}
