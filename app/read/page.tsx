import type { Metadata } from "next";
import { Suspense } from "react";
import { ChapterReader } from "@/components/chapter-reader";

export const metadata: Metadata = {
  title: "Read · Gospel Focus",
  description:
    "Read a whole chapter of the standard works or a general conference talk, mark any words, and keep your notes with you.",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChapterReader />
    </Suspense>
  );
}
