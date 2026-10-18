import { MemorizePage } from "@/components/memorize-page";
import { featureMetadata } from "@/lib/features";

export const metadata = featureMetadata("memorize");

export default function Page() {
  return <MemorizePage />;
}
