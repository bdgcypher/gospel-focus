import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings-page";

export const metadata: Metadata = {
  title: "Settings · Open to Inspiration",
  description: "Theme and motion preferences for Open to Inspiration.",
};

export default function Page() {
  return <SettingsPage />;
}
