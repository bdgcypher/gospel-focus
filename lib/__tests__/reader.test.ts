import { describe, expect, it } from "vitest";
import { versePassage, type ReaderDoc } from "../reader";

const doc = (patch: Partial<ReaderDoc> = {}): ReaderDoc => ({
  kind: "scripture",
  doc: "bom/alma/32",
  title: "Alma 32",
  book: "Alma",
  chapter: "32",
  sourceLabel: "Book of Mormon",
  subtitle: "Book of Mormon · 43 verses",
  verses: [
    { number: 20, text: "Now as I said concerning faith" },
    { number: 21, text: "And now as I said concerning faith" },
  ],
  url: "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32?lang=eng",
  prev: null,
  next: null,
  ...patch,
});

describe("versePassage", () => {
  it("addresses the chapter's verse once, without folding it into the language", () => {
    expect(versePassage(doc(), 21).url).toBe(
      "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32?lang=eng&id=p21#p21"
    );
  });

  it("leaves a talk's own page as it is", () => {
    const talk = doc({
      kind: "conference",
      doc: "c/2015-04/7",
      book: "General Conference",
      chapter: "Filling Our Homes with Light and Truth",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2015/04/filling-our-homes-with-light-and-truth?lang=eng",
    });
    expect(versePassage(talk, 1).url).toBe(talk.url);
  });
});
