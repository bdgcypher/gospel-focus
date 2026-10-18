import type { Metadata } from "next";
import { StatsPage } from "@/components/stats-page";

export const metadata: Metadata = {
  title: "Stats & Progress · Gospel Focus",
  description:
    "Your streak, the passages you have read, the cards you have recited, and the time you have studied.",
};

export default function Page() {
  return <StatsPage />;
}
