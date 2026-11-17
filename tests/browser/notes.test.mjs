import { escape, openChapter, pressToolbar, reset, selectWords, writeNote, writeNoteTitle } from "./helpers.mjs";

export const name = "notes view";

const rowCount = (page) => page.evaluate(`document.querySelectorAll("main li").length`);

const search = async (page, value) => {
  await page.evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Search your notes"]');
    if (!input) throw new Error("no search box");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await page.sleep(300);
};

/**
 * The view that answers "what have I written?".
 *
 * Two notes on different chapters, and one highlight with no note, so the view
 * has something it must show and something it must leave out. Then the search,
 * the empty state, and the jump back to the words — which is the whole point of
 * a collected note. One note is tagged, so the tag pills can be pressed to
 * narrow the page to that theme and pressed again to let it go.
 */
export async function run({ page, check, base }) {
  await reset(page, base);

  // --- before anything is written ----------------------------------------
  await page.goto(`${base}/notes/`, 2000);
  const empty = await page.evaluate(`[...document.querySelectorAll("p")].map((p) => p.textContent).join(" ")`);
  check("the empty view says there's nothing yet", empty.includes("No notes yet"), empty.slice(0, 60));
  check("and points at the reader", await page.evaluate(`Boolean(document.querySelector('a[href*="/read"]'))`));

  // --- two notes and one bare highlight ----------------------------------
  await openChapter(page, base, "book=Jeremiah&chapter=3&verse=15");
  await selectWords(page, 15, 4, 9);
  await pressToolbar(page, "Note");
  await writeNoteTitle(page, "A new heart");
  await writeNote(page, "<p>Pastors after mine own heart.</p>");

  // The same words now wear a tag, so the collected note has a theme.
  await selectWords(page, 15, 4, 9);
  await pressToolbar(page, "Tags");
  await page.evaluate(`(() => {
    const box = document.querySelector("#tag-field");
    if (!box) throw new Error("the tags sheet isn't open");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, "faith");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await page.sleep(160);
  await page.evaluate(`document.querySelector('[aria-label="Add the tag"]')?.click()`);
  await page.sleep(160);
  await page.evaluate(`(() => {
    const save = [...document.querySelectorAll('[role="dialog"] button')]
      .find((button) => button.textContent.trim() === "Save");
    if (!save) throw new Error("no Save button in the tags sheet");
    save.click();
    return true;
  })()`);
  await page.sleep(600);

  await openChapter(page, base, "book=Jeremiah&chapter=5&verse=3");
  await selectWords(page, 3, 2, 6);
  await pressToolbar(page, "Note");
  await writeNote(page, "<p>Their faces are harder than a rock.</p>");

  await openChapter(page, base, "book=Jeremiah&chapter=6&verse=1");
  await selectWords(page, 1, 1, 4);
  await pressToolbar(page, "yellow");

  // --- the view -----------------------------------------------------------
  await page.goto(`${base}/notes/`, 2200);
  check("two notes are collected", (await rowCount(page)) === 2, `${await rowCount(page)} rows`);

  const headings = await page.evaluate(
    `[...document.querySelectorAll("main section h2")].map((h2) => h2.textContent)`
  );
  check("they are grouped by chapter", headings.includes("Jeremiah 3") && headings.includes("Jeremiah 5"), headings.join(", "));
  check("a highlight with no note is not a note", !headings.includes("Jeremiah 6"), headings.join(", "));

  const body = await page.evaluate(`document.querySelector("main").textContent`);
  check("the note's words are shown, not its markup", body.includes("Pastors after mine own heart.") && !body.includes("<p>"));
  check("the count names two notes", body.includes("2 notes"), body.match(/\d+ notes?[^.]*/)?.[0] ?? "");
  const titled = await page.evaluate(`(() => {
    const heading = [...document.querySelectorAll("main li span")]
      .find((span) => span.textContent.trim() === "A new heart");
    return heading ? heading.className : "";
  })()`);
  check("a named note shows its name as the heading", titled.includes("font-serif") && titled.includes("font-semibold"), titled);

  // --- a theme, followed from the note ------------------------------------
  const pill = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("main li button")]
      .find((entry) => entry.textContent.trim() === "#faith");
    if (!button) return null;
    const pressed = button.getAttribute("aria-pressed");
    button.click();
    return pressed;
  })()`);
  check("a note shows its tags as pills", pill === "false", pill === null ? "no pill" : `pressed=${pill}`);
  await page.sleep(500);
  check("pressing one narrows the notes to that theme", (await rowCount(page)) === 1, `${await rowCount(page)} row`);
  const themed = await page.evaluate(`(() => {
    const headings = [...document.querySelectorAll("main section h2")].map((h2) => h2.textContent);
    const chip = document.querySelector('[aria-label^="Stop showing only the notes tagged"]');
    return { headings, chip: Boolean(chip) };
  })()`);
  check(
    "only the tagged note is left",
    themed.headings.length === 1 && themed.headings[0] === "Jeremiah 3",
    themed.headings.join(", ")
  );
  check("with a way to let the theme go", themed.chip);
  await page.evaluate(`document.querySelector('[aria-label^="Stop showing only the notes tagged"]')?.click()`);
  await page.sleep(450);
  check("letting it go brings the other note back", (await rowCount(page)) === 2, `${await rowCount(page)} rows`);

  // --- search -------------------------------------------------------------
  await search(page, "pastors");
  check("a search narrows to the note that has the word", (await rowCount(page)) === 1, `${await rowCount(page)} row`);
  await search(page, "jeremiah 5");
  check("a reference search finds the chapter's notes", (await rowCount(page)) === 1, `${await rowCount(page)} row`);
  await search(page, "new heart");
  check("a title search finds the note it names", (await rowCount(page)) === 1, `${await rowCount(page)} row`);
  await search(page, "tithing");
  const none = await page.evaluate(`[...document.querySelectorAll("p")].map((p) => p.textContent).join(" ")`);
  check("a search with no answer says so", none.includes("No notes match"), none.slice(0, 60));
  await search(page, "");
  check("clearing the search brings them back", (await rowCount(page)) === 2, `${await rowCount(page)} rows`);

  // --- back to the words --------------------------------------------------
  await page.evaluate(`(() => {
    const link = [...document.querySelectorAll("main li a")].find((a) => a.textContent.includes("Pastors"));
    if (!link) throw new Error("no row for the Jeremiah 3 note");
    link.click();
    return true;
  })()`);
  await page.sleep(2200);
  const address = await page.evaluate(`location.search`);
  const heading = await page.evaluate(`document.querySelector("main h1")?.textContent ?? ""`);
  check("a note opens the reader at its chapter", heading.includes("Jeremiah 3"), heading);
  check("and at its verse", /book=Jeremiah/.test(address) && /verse=\d+/.test(address), address);
  const noteMarker = await page.evaluate(`document.querySelectorAll('[aria-label^="Open the notes, links, and tags on verse"]').length`);
  check("the note is there to read again", noteMarker >= 1, `${noteMarker} marker(s)`);

  // --- the menu leaves both pages to the Study wall ----------------------
  // A note and a journal entry are both written into the study, and each has a
  // card on the Study page, so the menu's copy of either would be a second door
  // to the same room. Reading left for the same reason.
  const opened = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((b) => (b.getAttribute("aria-label") ?? "").toLowerCase().includes("menu"));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await page.sleep(700);
  const links = await page.evaluate(`[...document.querySelectorAll('[role="dialog"] a')].map((a) => a.getAttribute("href") ?? "")`);
  check(
    "the menu leaves the notes view to the Study page",
    opened && !links.some((href) => href.startsWith("/notes")),
    links.join(", ")
  );
  check(
    "and the journal there too",
    !links.some((href) => href.startsWith("/journal")),
    links.join(", ")
  );
  check(
    "and the library with them",
    !links.some((href) => href.startsWith("/read")),
    links.join(", ")
  );
  await escape(page);

  // --- the two pages are cards on the wall --------------------------------
  await page.goto(`${base}/study/`, 2400);
  const wall = await page.evaluate(`(() => {
    const cards = [...document.querySelectorAll("main a")].map((a) => ({
      href: a.getAttribute("href") ?? "",
      text: a.textContent.replace(/\\s+/g, " ").trim(),
    }));
    return {
      notes: cards.find((card) => card.text.includes("Notes & Annotations")) ?? null,
      journal: cards.find((card) => card.text.includes("Journal")) ?? null,
    };
  })()`);
  check(
    "the Study wall carries Notes & Annotations",
    Boolean(wall.notes) &&
      wall.notes.href.startsWith("/notes") &&
      wall.notes.text.includes("Review marked passages, highlights, and notes"),
    wall.notes ? `${wall.notes.href} · ${wall.notes.text.slice(0, 90)}` : "no card"
  );
  check(
    "and a Journal card that says only Journal",
    Boolean(wall.journal) &&
      wall.journal.href.startsWith("/journal") &&
      !wall.journal.text.includes("& Notes"),
    wall.journal ? `${wall.journal.href} · ${wall.journal.text.slice(0, 90)}` : "no card"
  );
}
