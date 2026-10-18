import { JournalPage } from "@/components/journal-page";
import { featureMetadata } from "@/lib/features";

export const metadata = featureMetadata("journal");

export default function Page() {
  return <JournalPage />;
}
