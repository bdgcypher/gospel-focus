import { describe, expect, it } from "vitest";
import { paragraphAnchorFromUri, readNotesCsv, verseRunFromUri } from "../notes-csv";

const HEADER = "type,title,note text,source location,tags,notebooks,study set,last updated,created";

const uri = (path: string, id: string) => `https://www.churchofjesuschrist.org/study/${path}?lang=eng&id=${id}`;

describe("verseRunFromUri", () => {
  it("reads one verse", () => {
    expect(verseRunFromUri(uri("scriptures/ot/amos/3", "p7"))).toEqual({ start: 7, end: 7 });
  });

  it("reads a run", () => {
    expect(verseRunFromUri(uri("scriptures/bofm/alma/7", "p11-p13"))).toEqual({ start: 11, end: 13 });
  });

  it("leaves a talk paragraph hash to the paragraph reader", () => {
    expect(verseRunFromUri(uri("general-conference/2026/04/210soares", "p_vADlc"))).toBeNull();
    expect(paragraphAnchorFromUri(uri("general-conference/2026/04/210soares", "p_vADlc"))).toBe("p_vADlc");
  });

  it("refuses a chapter summary", () => {
    expect(verseRunFromUri(uri("scriptures/ot/neh/4", "study_summary1"))).toBeNull();
  });
});

describe("readNotesCsv", () => {
  it("leaves a file that isn't a notes export alone", () => {
    expect(readNotesCsv("book,chapter,passage\nAlma,32,21")).toBeNull();
  });

  it("reads a row, and the words the export writes as no title", () => {
    const csv = [
      HEADER,
      [
        "highlight",
        "undefined",
        '"The Lord always calls prophets!"',
        uri("scriptures/ot/amos/3", "p7"),
        "",
        "",
        "Default Set",
        "2026-11-05T01:25:39.405Z",
        "2016-05-06T04:44:45.035Z",
      ].join(","),
    ].join("\n");

    const parsed = readNotesCsv(csv);
    expect(parsed?.errors).toEqual([]);
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.rows[0]).toMatchObject({
      type: "highlight",
      title: undefined,
      note: "The Lord always calls prophets!",
      verseStart: 7,
      verseEnd: 7,
      tags: [],
      created: "2016-05-06T04:44:45.035Z",
      updated: "2026-11-05T01:25:39.405Z",
    });
  });

  it("keeps a quoted note's newlines, commas and quotes", () => {
    const csv = [
      HEADER,
      `highlight,"Sin is sin","The sins are just as bad.\nWe ""know"" that, comma, and all.",${uri(
        "scriptures/ot/isa/10",
        "p11"
      )},faith; hope,,Default Set,2026-09-25T14:36:57.700Z,2016-05-06T04:44:45.035Z`,
    ].join("\n");

    const row = readNotesCsv(csv)?.rows[0];
    expect(row?.note).toBe('The sins are just as bad.\nWe "know" that, comma, and all.');
    expect(row?.title).toBe("Sin is sin");
    expect(row?.tags).toEqual(["faith", "hope"]);
  });

  it("reads a run of verses", () => {
    const csv = [
      HEADER,
      `highlight,undefined,,${uri("scriptures/bofm/3-ne/23", "p6-p13")},,,Default Set,2026-11-01T16:29:22.285Z,2026-11-01T16:28:06.795Z`,
    ].join("\n");

    expect(readNotesCsv(csv)?.rows[0]).toMatchObject({ verseStart: 6, verseEnd: 13 });
  });

  it("reads a talk paragraph by its hash", () => {
    const csv = [
      HEADER,
      `highlight,undefined,,${uri("general-conference/2026/04/210soares", "p_yiWuc")},,,Default Set,2026-09-23T14:40:00.374Z,2026-09-23T14:40:00.374Z`,
    ].join("\n");

    expect(readNotesCsv(csv)?.rows[0]).toMatchObject({ verseStart: 0, verseEnd: 0, paragraphId: "p_yiWuc" });
  });

  it("reports a row it can't place instead of dropping it", () => {
    const csv = [
      HEADER,
      `highlight,undefined,No address,,,,Default Set,2026-09-23T14:40:00.374Z,2026-09-23T14:40:00.374Z`,
      `highlight,undefined,,${uri("scriptures/ot/neh/4", "study_summary1")},,,Default Set,2026-09-23T14:40:00.374Z,2026-09-23T14:40:00.374Z`,
    ].join("\n");

    const parsed = readNotesCsv(csv);
    expect(parsed?.rows).toEqual([]);
    expect(parsed?.errors.map((entry) => entry.line)).toEqual([2, 3]);
  });
});
