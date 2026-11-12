import type { Metadata } from "next";
import { Suspense } from "react";
import { ScrollPage } from "@/components/scroll-page";

export const metadata: Metadata = {
  title: "Scroll · Gospel Focus",
  description:
    "A whole chapter one verse at a time: swipe through the verses, and favorite, note, link, or share the one you are on.",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ScrollPage />
    </Suspense>
  );
}
