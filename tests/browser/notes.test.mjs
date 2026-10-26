import { openChapter, pressToolbar, reset, selectWords, writeNote } from "./helpers.mjs";

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
 * a collected note.
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
  await writeNote(page, "<p>Pastors after mine own heart.</p>");

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

  // --- search -------------------------------------------------------------
  await search(page, "pastors");
  check("a search narrows to the note that has the word", (await rowCount(page)) === 1, `${await rowCount(page)} row`);
  await search(page, "jeremiah 5");
  check("a reference search finds the chapter's notes", (await rowCount(page)) === 1, `${await rowCount(page)} row`);
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
  const noteMarker = await page.evaluate(`document.querySelectorAll('[aria-label^="Open the note on verse"]').length`);
  check("the note is there to read again", noteMarker >= 1, `${noteMarker} marker(s)`);

  // --- the menu offers the view ------------------------------------------
  const opened = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((b) => (b.getAttribute("aria-label") ?? "").toLowerCase().includes("menu"));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await page.sleep(700);
  const links = await page.evaluate(`[...document.querySelectorAll('[role="dialog"] a')].map((a) => a.getAttribute("href"))`);
  const hasNotes = links.some((href) => href === "/notes/" || href === "/notes");
  check("the menu carries the notes view", opened && hasNotes, links.join(", "));
}
