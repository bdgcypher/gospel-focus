import { ReferenceQuizPage } from "@/components/reference-quiz-page";
import { featureMetadata } from "@/lib/features";

export const metadata = featureMetadata("reference-quiz");

export default function Page() {
  return <ReferenceQuizPage />;
}
