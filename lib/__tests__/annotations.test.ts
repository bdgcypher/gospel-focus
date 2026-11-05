import { describe, expect, it } from "vitest";
import {
  markGroup,
  markGroupId,
  marksAt,
  marksWithNotes,
  noteRecentChoice,
  noteText,
  rangeText,
  readRecentChoices,
  rangesInSelection,
  searchMarks,
  wordsOf,
  type Annotation,
} from "../annotations";

const base: Annotation = {
  id: "a1",
  doc: "bom/alma/32",
  book: "Alma",
  chapter: "32",
  verse: 21,
  startWord: 1,
  endWord: 3,
  color: "yellow",
  style: "fill",
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mark = (patch: Partial<Annotation>): Annotation => ({ ...base, ...patch });

describe("wordsOf", () => {
  it("counts whitespace-separated words with their character offsets", () => {
    expect(wordsOf("And  I will give")).toEqual([
      { word: "And", start: 0, end: 3 },
      { word: "I", start: 5, end: 6 },
      { word: "will", start: 7, end: 11 },
      { word: "give", start: 12, end: 16 },
    ]);
  });

  it("keeps punctuation with the word it belongs to", () => {
    expect(wordsOf("heart; “saith the Lord.”")[0]).toEqual({ word: "heart;", start: 0, end: 6 });
  });

  it("is empty for empty text", () => {
    expect(wordsOf("")).toEqual([]);
  });
});

describe("rangeText", () => {
  const text = "And I will give you pastors";
  it("returns the words a range covers, inclusive", () => {
    expect(rangeText(text, 4, 6)).toBe("give you pastors");
  });
  it("clamps a range that runs past the end", () => {
    expect(rangeText(text, 5, 99)).toBe("you pastors");
  });
});

describe("noteText", () => {
  it("strips tags and collapses what a paragraph break leaves", () => {
    expect(noteText("<p>Light and truth, <strong>both</strong>.</p>\n<p>Second line.</p>")).toBe(
      "Light and truth, both. Second line."
    );
  });

  it("reads the entities the editor writes", () => {
    expect(noteText("<p>a &amp; b&nbsp;c &quot;d&quot; &#39;e&#39; &lt;f&gt;</p>")).toBe('a & b c "d" \'e\' <f>');
  });

  it("is empty for nothing", () => {
    expect(noteText(undefined)).toBe("");
  });
});

describe("rangesInSelection", () => {
  const build = () => {
    document.body.innerHTML = `
      <div id="root">
        <p>
          <span data-verse="15" data-word="1">And</span>
          <span data-verse="15" data-word="2">I</span>
          <span data-verse="15" data-word="3">will</span>
        </p>
        <p>
          <span data-verse="16" data-word="1">Go</span>
          <span data-verse="16" data-word="2">ye</span>
        </p>
      </div>`;
    return document.getElementById("root") as HTMLElement;
  };

  it("maps a selection inside one verse to a word range", () => {
    const root = build();
    const range = document.createRange();
    range.setStartBefore(root.querySelector('[data-verse="15"][data-word="2"]') as Node);
    range.setEndAfter(root.querySelector('[data-verse="15"][data-word="3"]') as Node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(rangesInSelection(root)).toEqual([{ verse: 15, startWord: 2, endWord: 3 }]);
  });

  it("splits a selection that crosses a verse into one range per verse", () => {
    const root = build();
    const range = document.createRange();
    range.setStartBefore(root.querySelector('[data-verse="15"][data-word="2"]') as Node);
    range.setEndAfter(root.querySelector('[data-verse="16"][data-word="1"]') as Node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(rangesInSelection(root)).toEqual([
      { verse: 15, startWord: 2, endWord: 3 },
      { verse: 16, startWord: 1, endWord: 1 },
    ]);
  });

  it("ignores a collapsed selection", () => {
    const root = build();
    const range = document.createRange();
    range.setStartBefore(root.querySelector('[data-verse="15"][data-word="1"]') as Node);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(rangesInSelection(root)).toEqual([]);
  });

  it("ignores a selection made outside the chapter", () => {
    const root = build();
    const outside = document.createElement("p");
    outside.textContent = "Elsewhere on the page";
    document.body.appendChild(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(rangesInSelection(root)).toEqual([]);
  });
});

describe("marks across verses", () => {
  // One sweep from the end of verse 20 into the start of verse 21, stored the
  // way the app stores it: a segment per verse sharing one group id.
  const sweep = [
    mark({ id: "s1", verse: 20, startWord: 26, endWord: 30, groupId: "g1", createdAt: "2026-01-02T00:00:00.000Z" }),
    mark({ id: "s2", verse: 21, startWord: 1, endWord: 3, groupId: "g1", createdAt: "2026-01-02T00:00:00.000Z" }),
  ];
  const plain = mark({ id: "p1", verse: 20, startWord: 26, endWord: 28, color: "blue" });
  const all = [plain, ...sweep];

  it("names a mark by its group, and a lone mark by itself", () => {
    expect(markGroupId(sweep[0])).toBe("g1");
    expect(markGroupId(plain)).toBe("p1");
  });

  it("gathers every verse segment of one mark in reading order", () => {
    expect(markGroup(all, sweep[1]).map((entry) => entry.id)).toEqual(["s1", "s2"]);
    expect(markGroup(all, plain).map((entry) => entry.id)).toEqual(["p1"]);
  });

  it("answers a tap with whole marks, not with the verse the finger landed on", () => {
    const groups = marksAt(all, "bom/alma/32", 21, 2);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((entry) => entry.id)).toEqual(["s1", "s2"]);
  });

  it("answers twice where two marks overlap, oldest first", () => {
    const groups = marksAt(all, "bom/alma/32", 20, 27);
    expect(groups.map((group) => markGroupId(group[0]))).toEqual(["p1", "g1"]);
  });

  it("answers nothing where no mark lies", () => {
    expect(marksAt(all, "bom/alma/32", 20, 20)).toEqual([]);
  });
});

describe("recent mark choices", () => {
  it("keeps the last two, newest first", () => {
    noteRecentChoice("yellow", "fill");
    noteRecentChoice("red", "underline");
    expect(readRecentChoices()).toEqual([
      { color: "red", style: "underline" },
      { color: "yellow", style: "fill" },
    ]);

    noteRecentChoice("blue", "fill");
    expect(readRecentChoices()).toEqual([
      { color: "blue", style: "fill" },
      { color: "red", style: "underline" },
    ]);
  });

  it("moves a repeated choice to the front instead of keeping two of it", () => {
    noteRecentChoice("green", "fill");
    noteRecentChoice("red", "underline");
    noteRecentChoice("green", "fill");

    expect(readRecentChoices()).toEqual([
      { color: "green", style: "fill" },
      { color: "red", style: "underline" },
    ]);
  });

  it("counts the same colour in the other mode as a choice of its own", () => {
    noteRecentChoice("purple", "fill");
    noteRecentChoice("purple", "underline");

    expect(readRecentChoices().map((choice) => `${choice.color}/${choice.style}`)).toEqual([
      "purple/underline",
      "purple/fill",
    ]);
  });

  it("never remembers the colourless marker", () => {
    noteRecentChoice("purple", "fill");
    const before = readRecentChoices();
    noteRecentChoice("clear", "fill");

    expect(readRecentChoices()).toEqual(before);
  });
});

describe("marksWithNotes", () => {
  it("keeps only the marks that carry words of the reader's own", () => {
    const marks = [
      mark({ id: "plain", note: undefined }),
      mark({ id: "empty", note: "<p></p>" }),
      mark({ id: "written", note: "<p>Faith is the substance.</p>" }),
    ];
    expect(marksWithNotes(marks).map((entry) => entry.id)).toEqual(["written"]);
  });
});

describe("searchMarks", () => {
  const marks = [
    mark({ id: "alma-faith", doc: "bom/alma/32", note: "<p>Faith grows by the word.</p>", tags: ["faith"] }),
    mark({ id: "alma-seed", doc: "bom/alma/32", verse: 28, note: "<p>Experiment on the seed.</p>" }),
    mark({ id: "jer", doc: "ot/jer/3", book: "Jeremiah", chapter: "3", verse: 15, note: "<p>Pastors after mine own heart.</p>" }),
    mark({ id: "jer5", doc: "ot/jer/5", book: "Jeremiah", chapter: "5", note: "<p>Their faces are harder than a rock.</p>" }),
    mark({ id: "link", doc: "bom/1-ne/3", book: "1 Nephi", chapter: "3", verse: 7, note: "<p>I will go.</p>", links: [{ book: "1 Nephi", chapter: "3", section: 7, label: "1 Nephi 3:7" }] }),
  ];

  it("returns everything for an empty query", () => {
    expect(searchMarks(marks, "   ")).toHaveLength(5);
  });

  it("matches the note's own words", () => {
    expect(searchMarks(marks, "seed").map((entry) => entry.id)).toEqual(["alma-seed"]);
  });

  it("matches a reference written the way a reader writes it", () => {
    expect(searchMarks(marks, "alma 32").map((entry) => entry.id)).toEqual(["alma-faith", "alma-seed"]);
    expect(searchMarks(marks, "alma 32:28").map((entry) => entry.id)).toEqual(["alma-seed"]);
    expect(searchMarks(marks, "3:15").map((entry) => entry.id)).toEqual(["jer"]);
  });

  it("reads a chapter number as a number, not as a digit inside a verse", () => {
    expect(searchMarks(marks, "jeremiah 5").map((entry) => entry.id)).toEqual(["jer5"]);
    expect(searchMarks(marks, "jeremiah 3").map((entry) => entry.id)).toEqual(["jer"]);
  });

  it("still finds a book whose name begins with a number", () => {
    expect(searchMarks(marks, "1 nephi").map((entry) => entry.id)).toEqual(["link"]);
  });

  it("requires every term, so a book and a subject narrow together", () => {
    expect(searchMarks(marks, "alma faith").map((entry) => entry.id)).toEqual(["alma-faith"]);
  });

  it("matches tags and link labels", () => {
    expect(searchMarks(marks, "#faith").map((entry) => entry.id)).toEqual(["alma-faith"]);
    expect(searchMarks(marks, "1 nephi 3:7").map((entry) => entry.id)).toEqual(["link"]);
  });

  it("finds nothing for a query that isn't there", () => {
    expect(searchMarks(marks, "tithing")).toEqual([]);
  });
});
