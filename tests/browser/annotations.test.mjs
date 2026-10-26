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
  check("the library still holds one mark", count.startsWith("1 mark"), count);

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
  check("the underline is still where it was drawn", kept[0].includes("underline") && kept[1] === "rgb(165, 31, 24)", kept.join(" "));

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
  check("the bad file changed nothing", stillThere.startsWith("2 marks"), stillThere);
}
