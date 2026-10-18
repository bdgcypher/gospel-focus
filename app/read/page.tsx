import type { Metadata } from "next";
import { InspirationApp } from "@/components/inspiration-app";

export const metadata: Metadata = {
  title: "Random Scripture · Gospel Focus",
  description:
    "Draw a random passage from the standard works or general conference, read the whole chapter, and open it in the Gospel Library.",
};

export default function Page() {
  return <InspirationApp />;
}
