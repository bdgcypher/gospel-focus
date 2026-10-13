import type { Metadata } from "next";
import { FavoritesPage } from "@/components/favorites-page";

export const metadata: Metadata = {
  title: "Favorites · Open to Inspiration",
  description: "Passages you starred in Open to Inspiration.",
};

export default function Page() {
  return <FavoritesPage />;
}
