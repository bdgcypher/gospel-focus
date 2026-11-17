import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  captureExport,
  importFile,
  openChapter,
  pressExport,
  pressMark,
  pressToolbar,
  reset,
  selectWords,
  writeNote,
} from "./helpers.mjs";

export const name = "annotations file";

const write = (name, text) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gospel-focus-file-")), name);
  fs.writeFileSync(file, text);
  return file;
};

/**
 * The file the app hands Gospel Library, and takes back.
 *
 * A mark is made, exported, read as JSON, and imported again; the record's
 * anchors are checked against the chapter it came from, and the import is
 * checked to *update* rather than duplicate. The same is done for a conference
 * talk, whose address is a completely different shape. A file that isn't an
 * export has to fail with a sentence rather than a stack.
 */
export async function run({ page, check, base }) {
  await reset(page, base);
  await openChapter(page, base, "book=Alma&chapter=32&verse=21");

  await selectWords(page, 21, 1, 3);
  await pressToolbar(page, "green");
  await selectWords(page, 21, 1, 3);
  await pressToolbar(page, "Note");
  await writeNote(page, "<p>Faith is the substance of things hoped for.</p>");

  // --- out ---------------------------------------------------------------
  await page.goto(`${base}/settings/`, 2400);
  await captureExport(page);
  const text = await pressExport(page);
  check("the panel writes a file", Boolean(text), text ? `${text.length} bytes` : "nothing");

  const parsed = text ? JSON.parse(text) : null;
  check("the file is JSON", Boolean(parsed));
  check("the envelope is version 3", parsed?.metadata?.version === 3, String(parsed?.metadata?.version));
  check("the envelope counts its records", parsed?.metadata?.count === parsed?.annotations?.length);
  const record = parsed?.annotations?.[0];
  check("one record, for the mark just made", parsed?.annotations?.length === 1, String(parsed?.annotations?.length));
  check("the record is a note about a highlight", record?.type === "note" && record?.color === "green", `${record?.type}/${record?.color}`);
  check("the record carries the document", record?.docId === "bom/alma/32", record?.docId);
  check(
    "the record's address is the chapter at its verse",
    record?.uri === "https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32?lang=eng&id=p21#p21",
    record?.uri
  );
  check(
    "the record's offsets span the marked words",
    record?.startOffset === 0 && record?.endOffset > 0,
    `${record?.startOffset}-${record?.endOffset}`
  );
  check("the record carries the note", (record?.note ?? "").includes("Faith is the substance"), String(record?.note).slice(0, 40));
  check("the record names its source", record?.source === "scriptures", record?.source);

  // --- back in -----------------------------------------------------------
  const sameFile = write("annotations.json", text ?? "{}");
  await importFile(page, sameFile);
  const summary = await page.evaluate(`(() => {
    const line = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Imported"));
    return line ? line.textContent : "none";
  })()`);
  check("re-importing updates the mark instead of duplicating it", /Imported 0 .*1 updated/.test(summary), summary);

  const count = await page.evaluate(
    `[...document.querySelectorAll("p")].map((p) => p.textContent).find((t) => t.includes("on this device")) ?? ""`
  );
  check("the library still holds one mark", count.startsWith("1 on this device"), count);

  // --- a talk, whose address is a different shape ------------------------
  await openChapter(
    page,
    base,
    "kind=conference&session=2015-04&book=General%20Conference&chapter=Filling%20Our%20Homes%20with%20Light%20and%20Truth"
  );
  check(
    "a talk opens in the reader",
    (await page.evaluate(`document.querySelector("main h1")?.textContent ?? ""`)).includes("Filling Our Homes")
  );
  await selectWords(page, 3, 1, 5);
  await pressMark(page, "underline", "red");

  await page.goto(`${base}/settings/`, 2400);
  await captureExport(page);
  const talkText = await pressExport(page);
  const talkParsed = talkText ? JSON.parse(talkText) : null;
  const talkRecords = talkParsed?.annotations ?? [];
  const talk = talkRecords.find((entry) => entry.source === "general-conference");
  check("the talk exports as its own record", Boolean(talk), String(talkRecords.length));
  check("its address is the talk's own page", /general-conference\/2015\/04\/filling-our-homes/.test(talk?.uri ?? ""), talk?.uri);
  check("its document id is the talk's place in the session", /^c\/2015-04\/\d+$/.test(talk?.docId ?? ""), talk?.docId);
  check("it keeps the underline it was given", talk?.subtype === "underline", talk?.subtype);

  await importFile(page, write("talk.json", talkText ?? "{}"));
  const talkSummary = await page.evaluate(`(() => {
    const line = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Imported"));
    return line ? line.textContent : "none";
  })()`);
  check("the talk imports without duplicating", /Imported 0 .*2 updated/.test(talkSummary), talkSummary);

  await openChapter(
    page,
    base,
    "kind=conference&session=2015-04&book=General%20Conference&chapter=Filling%20Our%20Homes%20with%20Light%20and%20Truth"
  );
  const kept = await page.evaluate(`(() => {
    const style = getComputedStyle([...document.querySelectorAll('[data-verse="3"]')][0]);
    return [style.textDecorationLine, style.textDecorationColor];
  })()`);
  check("the underline is still where it was drawn", kept[0].includes("underline") && kept[1] === "rgb(204, 90, 80)", kept.join(" "));

  // --- a file that isn't an export ---------------------------------------
  await page.goto(`${base}/settings/`, 2400);
  await importFile(page, write("notes.txt", "this is not JSON"));
  const failure = await page.evaluate(`(() => {
    const line = [...document.querySelectorAll("p")].map((p) => p.textContent).find((t) => t.includes("isn't JSON"));
    return line ? line : "none";
  })()`);
  check("a file that isn't an export is refused in words", failure !== "none", failure);
  const stillThere = await page.evaluate(
    `[...document.querySelectorAll("p")].map((p) => p.textContent).find((t) => t.includes("on this device")) ?? ""`
  );
  check("the bad file changed nothing", stillThere.startsWith("2 on this device"), stillThere);

  // --- the notes CSV, which names verses but not the words inside them ---
  const notesCsv = [
    "type,title,note text,source location,tags,notebooks,study set,last updated,created",
    'highlight,Run of faith,"Two verses, one thought",https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32?lang=eng&id=p10-p11,faith,,Default Set,2026-09-25T14:36:57.700Z,2016-05-06T04:44:45.035Z',
    'reference,Pinned note,"No ink under this one",https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32?lang=eng&id=p12,faith,,Default Set,2026-09-20T20:42:55.879Z,2016-05-06T04:44:45.035Z',
  ].join("\n");
  await importFile(page, write("NotesDownload.csv", notesCsv));
  const csvSummary = await page.evaluate(`(() => {
    const line = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Imported"));
    return line ? line.textContent : "none";
  })()`);
  check("a notes CSV imports its rows", /Imported 3\b/.test(csvSummary), csvSummary);

  const imported = await page.evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("gospel-focus");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise((resolve) => {
      const request = db.transaction("annotations").objectStore("annotations").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return all
      .filter((mark) => mark.doc === "bom/alma/32" && mark.verse >= 10 && mark.verse <= 12)
      .map((mark) => ({
        verse: mark.verse,
        groupId: mark.groupId,
        color: mark.color,
        endWord: mark.endWord,
        title: mark.title,
        note: mark.note,
        tags: mark.tags,
      }));
  })()`);
  const byVerse = Object.fromEntries((imported ?? []).map((mark) => [mark.verse, mark]));
  check(
    "the run is one mark across its verses",
    Boolean(byVerse[10]?.groupId) && byVerse[10].groupId === byVerse[11]?.groupId,
    JSON.stringify([byVerse[10]?.groupId, byVerse[11]?.groupId])
  );
  check(
    "the run's first verse carries its note and title",
    byVerse[10]?.title === "Run of faith" && (byVerse[10]?.note ?? "").includes("Two verses"),
    JSON.stringify([byVerse[10]?.title, byVerse[10]?.note])
  );
  check(
    "the note is not written again on the next verse",
    Boolean(byVerse[11]) && !byVerse[11].note,
    JSON.stringify(byVerse[11]?.note)
  );
  check(
    "the tags travel with every verse of the run",
    byVerse[10]?.tags.includes("faith") && byVerse[11]?.tags.includes("faith"),
    JSON.stringify([byVerse[10]?.tags, byVerse[11]?.tags])
  );
  check(
    "a highlight covers its whole verse",
    byVerse[10]?.color === "yellow" && byVerse[10].endWord > 0,
    JSON.stringify([byVerse[10]?.color, byVerse[10]?.endWord])
  );
  check(
    "a reference lands as a note with no ink",
    byVerse[12]?.color === "clear" && (byVerse[12]?.note ?? "").includes("No ink"),
    JSON.stringify([byVerse[12]?.color, byVerse[12]?.note])
  );

  await importFile(page, write("NotesDownload.csv", notesCsv));
  const csvAgain = await page.evaluate(`(() => {
    const line = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Imported"));
    return line ? line.textContent : "none";
  })()`);
  check("importing the same notes twice updates instead of duplicating", /Imported 0 .*3 updated/.test(csvAgain), csvAgain);

  // --- an address this build doesn't hold --------------------------------
  // An account's download can name a talk the library has no text for. Those
  // rows are skipped and reported; the rest of the file still lands.
  const mixedCsv = [
    "type,title,note text,source location,tags,notebooks,study set,last updated,created",
    'highlight,Missing talk,"A talk this build has no text for",https://www.churchofjesuschrist.org/study/general-conference/2024/10/no-such-talk?lang=eng&id=p4,,,Default Set,2026-11-01T16:31:20.143Z,2026-11-01T16:22:27.096Z',
    'highlight,Still scripture,"This one lands",https://www.churchofjesuschrist.org/study/scriptures/bofm/alma/32?lang=eng&id=p20,,,Default Set,2026-11-01T16:31:20.143Z,2026-11-01T16:22:27.096Z',
  ].join("\n");
  await importFile(page, write("NotesDownload.csv", mixedCsv));
  const mixedSummary = await page.evaluate(`(() => {
    const line = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Imported"));
    return line ? line.textContent : "none";
  })()`);
  check(
    "an address this build doesn't hold is skipped, and the rest still imports",
    /Imported 1\b/.test(mixedSummary) && /1 skipped/.test(mixedSummary),
    mixedSummary
  );
  const reasons = await page.evaluate(`(() => {
    const list = [...document.querySelectorAll("ul li")].map((li) => li.textContent).filter((t) => t.includes("build of the library"));
    return list.join(" | ");
  })()`);
  check("the skipped row says which kind of address it was", /conference talk isn't in this build/.test(reasons), reasons);

  // --- a talk whose paragraphs are named by hash -------------------------
  // Since October 2024 the Church anchors a talk's paragraphs by hash, and the
  // download names them that way. The anchor has to place the mark on the
  // paragraph it names, and the export has to write the same anchor back.
  const session = JSON.parse(
    fs.readFileSync(new URL("../../public/data/conference/2024-10.json", import.meta.url), "utf8")
  );
  const talkIndex = session.talks.findIndex(
    (entry) => Array.isArray(entry.paragraphIds) && entry.paragraphIds.length > 3
  );
  const hashTalk = session.talks[talkIndex];
  const anchor = hashTalk.paragraphIds[2];
  const talkSlug = hashTalk.url.split("/").pop().split("?")[0];
  const hashCsv = [
    "type,title,note text,source location,tags,notebooks,study set,last updated,created",
    `highlight,Pinned by hash,"A paragraph named by its hash",https://www.churchofjesuschrist.org/study/general-conference/2024/10/${talkSlug}?lang=eng&id=${anchor},,,Default Set,2026-11-01T16:31:20.143Z,2026-11-01T16:22:27.096Z`,
  ].join("\n");
  await importFile(page, write("NotesDownload.csv", hashCsv));
  const hashSummary = await page.evaluate(`(() => {
    const line = [...document.querySelectorAll("p")].find((p) => p.textContent.startsWith("Imported"));
    return line ? line.textContent : "none";
  })()`);
  check("a talk paragraph named by hash imports", /Imported 1\b/.test(hashSummary), hashSummary);

  const placed = await page.evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("gospel-focus");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise((resolve) => {
      const request = db.transaction("annotations").objectStore("annotations").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return all
      .filter((mark) => mark.doc === "c/2024-10/${talkIndex}")
      .map((mark) => ({ verse: mark.verse, note: mark.note }));
  })()`);
  check(
    "the mark lands on the paragraph the hash names",
    placed?.length === 1 && placed[0].verse === 3 && (placed[0].note ?? "").includes("named by its hash"),
    JSON.stringify(placed)
  );

  await page.goto(`${base}/settings/`, 2400);
  await captureExport(page);
  const hashText = await pressExport(page);
  const hashRecord = (hashText ? JSON.parse(hashText) : { annotations: [] }).annotations.find(
    (entry) => entry.docId === `c/2024-10/${talkIndex}`
  );
  check(
    "the export writes that same anchor back, on the talk's own page",
    (hashRecord?.uri ?? "").includes(`id=${anchor}`) && /\/study\/general-conference\/2024\/10\//.test(hashRecord?.uri ?? ""),
    hashRecord?.uri
  );
}
