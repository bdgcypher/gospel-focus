import type { Metadata } from "next";
import { ShopPage } from "@/components/shop-page";

export const metadata: Metadata = {
  title: "Shop · Gospel Focus",
  description: "Gems, streak freezes, and the Gospel Focus Plus subscription.",
};

export default function Page() {
  return <ShopPage />;
}
