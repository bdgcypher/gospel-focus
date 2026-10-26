import { describe, expect, it } from "vitest";
import { anchorFromUri, normaliseColor, recordsFromExport, wordRange } from "../annotations-io";
import { wordsOf } from "../annotations";
import { browseIndex } from "../reader";
import manifest from "../../public/data/manifest.json";
import type { Manifest } from "../types";

const VERSE = "And I will give you pastors according to mine heart, which shall feed you with knowledge and understanding.";

describe("wordRange", () => {
  const words = wordsOf(VERSE);

  it("turns a character span back into the words it covers", () => {
    const from = words[3].start; // "give"
    const to = words[5].end; // "pastors"
    expect(wordRange(VERSE, from, to, undefined)).toEqual({ startWord: 4, endWord: 6 });
  });

  it("snaps a span that starts mid-word outward to the whole word", () => {
    const from = words[2].start + 1; // inside "will"
    const to = words[3].end - 1; // inside "give"
    expect(wordRange(VERSE, from, to, undefined)).toEqual({ startWord: 3, endWord: 4 });
  });

  it("falls back to the marked text when a file carries no offsets", () => {
    expect(wordRange(VERSE, undefined, undefined, "pastors according")).toEqual({ startWord: 6, endWord: 7 });
  });

  it("falls back to the marked text when the offsets point nowhere", () => {
    expect(wordRange(VERSE, 10_000, 10_010, "mine heart")).toEqual({ startWord: 9, endWord: 10 });
  });

  it("marks the first word when there is nothing to go on", () => {
    expect(wordRange(VERSE, undefined, undefined, undefined)).toEqual({ startWord: 1, endWord: 1 });
  });

  it("survives an empty verse", () => {
    expect(wordRange("", 0, 4, "anything")).toEqual({ startWord: 1, endWord: 1 });
  });

  it("round-trips the offsets the export writes", () => {
    // What lib/annotations-io.ts writes for words 4–6, read back by the importer.
    const startOffset = words[3].start;
    const endOffset = words[5].end;
    const back = wordRange(VERSE, startOffset, endOffset, undefined);
    expect(back).toEqual({ startWord: 4, endWord: 6 });
    expect(words[back.startWord - 1].start).toBe(startOffset);
    expect(words[back.endWord - 1].end).toBe(endOffset);
  });
});

describe("recordsFromExport", () => {
  it("reads the envelope the app writes", () => {
    const parsed = recordsFromExport({ metadata: { version: 3, count: 1 }, annotations: [{ id: "a" }] });
    expect(parsed.records).toHaveLength(1);
    expect(parsed.version).toBe(3);
  });

  it("reads a bare array of records", () => {
    expect(recordsFromExport([{ id: "a" }, { id: "b" }]).records).toHaveLength(2);
  });

  it("reads the other names an export may use for the list", () => {
    expect(recordsFromExport({ data: [{ id: "a" }] }).records).toHaveLength(1);
    expect(recordsFromExport({ items: [{ id: "a" }] }).records).toHaveLength(1);
  });

  it("drops entries that are not records", () => {
    expect(recordsFromExport({ annotations: [{ id: "a" }, "nonsense", 7, null] }).records).toHaveLength(1);
  });

  it("reads nothing out of a file that is not an export", () => {
    expect(recordsFromExport({ hello: "world" }).records).toEqual([]);
    expect(recordsFromExport("nope").records).toEqual([]);
  });
});

describe("normaliseColor", () => {
  it("takes the names the app and the Church both use", () => {
    expect(normaliseColor("yellow")).toBe("yellow");
    expect(normaliseColor("Purple")).toBe("purple");
  });

  it("maps a hex value to the nearest of the nine", () => {
    expect(normaliseColor("#ffe082")).toBe("yellow");
    expect(normaliseColor("#ef5350")).toBe("red");
    expect(normaliseColor("#64b5f6")).toBe("blue");
  });

  it("refuses what it can't place", () => {
    expect(normaliseColor("chartreuse")).toBeNull();
    expect(normaliseColor(undefined)).toBeNull();
  });
});

describe("anchorFromUri", () => {
  it("reads a chapter, its verse, and the book's URL slug", () => {
    expect(anchorFromUri("https://www.churchofjesuschrist.org/study/scriptures/ot/jer/3?lang=eng&id=p15#p15")).toEqual({
      kind: "scripture",
      slug: "jer",
      chapter: "3",
      verse: 15,
    });
  });

  it("reads a Book of Mormon chapter whose slug is hyphenated", () => {
    expect(anchorFromUri("/scriptures/bom/1-ne/3?lang=eng&id=p7#p7")).toMatchObject({
      kind: "scripture",
      slug: "1-ne",
      chapter: "3",
      verse: 7,
    });
  });

  it("reads a general conference talk and the session it belongs to", () => {
    expect(
      anchorFromUri(
        "https://www.churchofjesuschrist.org/study/general-conference/2015/04/filling-our-homes-with-light-and-truth?lang=eng&id=p3#p3"
      )
    ).toEqual({
      kind: "conference",
      slug: "filling-our-homes-with-light-and-truth",
      chapter: "filling-our-homes-with-light-and-truth",
      conferenceId: "2015-04",
      verse: 3,
    });
  });

  it("defaults to the first verse when the address doesn't name one", () => {
    expect(anchorFromUri("/scriptures/nt/matt/5")?.verse).toBe(1);
  });

  it("refuses an address that isn't a chapter", () => {
    expect(anchorFromUri("https://example.com/whatever")).toBeNull();
    expect(anchorFromUri("")).toBeNull();
  });
});

describe("browseIndex", () => {
  const volumes = browseIndex(manifest as unknown as Manifest);

  it("lists the standard works in the manifest's own order", () => {
    expect(volumes.map((volume) => volume.id)).toEqual(["bom", "dc", "pgp", "nt", "ot"]);
  });

  it("gives every book at least one chapter", () => {
    for (const volume of volumes) {
      expect(volume.books.length).toBeGreaterThan(0);
      for (const book of volume.books) expect(book.chapters).toBeGreaterThan(0);
    }
  });

  it("matches the manifest's book count, chapter for chapter", () => {
    const expected = (manifest as unknown as Manifest).volumes.reduce((total, volume) => total + volume.books.length, 0);
    const listed = volumes.reduce((total, volume) => total + volume.books.length, 0);
    expect(listed).toBe(expected);
  });

  it("drops a volume with no books rather than showing it empty", () => {
    const empty = {
      volumes: [
        { id: "bom", title: "Book of Mormon", subtitle: "", url: "", chapters: 1, verses: 1, books: [{ name: "1 Nephi", slug: "1-ne", chapters: 22, verses: 618 }] },
        { id: "gone", title: "Nothing Here", subtitle: "", url: "", chapters: 0, verses: 0, books: [] },
      ],
    } as unknown as Manifest;
    expect(browseIndex(empty).map((volume) => volume.id)).toEqual(["bom"]);
  });
});
