import type { Metadata } from "next";
import { NotesPage } from "@/components/notes-page";

export const metadata: Metadata = {
  title: "Marks & Notes · Gospel Focus",
  description:
    "Every note you've written on the scriptures and general conference talks, searchable, and a tap away from the words it sits on.",
};

export default function Page() {
  return <NotesPage />;
}
