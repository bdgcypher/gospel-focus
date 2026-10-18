import { FocusPage } from "@/components/focus-page";
import { featureMetadata } from "@/lib/features";

export const metadata = featureMetadata("focus-lock");

export default function Page() {
  return <FocusPage />;
}
