import { FeaturePage } from "@/components/feature-page";
import { featureMetadata } from "@/lib/features";

export const metadata = featureMetadata("widget");

export default function Page() {
  return <FeaturePage featureId="widget" />;
}
