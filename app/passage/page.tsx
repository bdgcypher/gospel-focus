import type { Metadata } from "next";
import { PassagePicker } from "@/components/passage-picker";

export const metadata: Metadata = {
  title: "Random Passage · Gospel Focus",
  description:
    "Draw a random passage from the standard works or general conference, read the whole chapter, and open it in the Gospel Library.",
};

export default function Page() {
  return <PassagePicker />;
}
