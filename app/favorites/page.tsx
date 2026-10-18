import type { Metadata } from "next";
import { FavoritesPage } from "@/components/favorites-page";

export const metadata: Metadata = {
  title: "Favorites · Gospel Focus",
  description: "Passages you starred in Gospel Focus.",
};

export default function Page() {
  return <FavoritesPage />;
}
