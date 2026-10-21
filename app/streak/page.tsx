import type { Metadata } from "next";
import { StreakPage } from "@/components/streak-page";

export const metadata: Metadata = {
  title: "Streak · Gospel Focus",
  description: "The days in a row you have reached your daily study goal, and the freezes that protect them.",
};

export default function Page() {
  return <StreakPage />;
}
