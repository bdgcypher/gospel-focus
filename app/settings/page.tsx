import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings-page";

export const metadata: Metadata = {
  title: "Settings · Gospel Focus",
  description: "Theme, motion, streak, and daily reminder preferences for Gospel Focus.",
};

export default function Page() {
  return <SettingsPage />;
}
