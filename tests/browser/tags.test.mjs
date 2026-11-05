import { escape, openChapter, pressToolbar, reset, selectWords, waitFor, writeNote } from "./helpers.mjs";

export const name = "tags";

/**
 * Tags, and the one panel that holds them with notes and links.
 *
 * A tag names a theme — a word or a short phrase — and the marking panel's Tags
 * writes it on the words. The verse's margin keeps one mark for everything it
 * carries, so the note, the tag, and any link are read in one place; a tag's
 * pill narrows that panel to every marking in the library wearing the same
 * name, which is the point of tagging.
 */

/** Type a tag in the open sheet and add it. */
async function addTag(page, tag) {
  await page.evaluate(`(() => {
    const box = document.querySelector("#tag-field");
    if (!box) throw new Error("the tags sheet isn't open");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, ${JSON.stringify(tag)});
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await page.sleep(150);
  await page.evaluate(`(() => {
    const add = document.querySelector('[aria-label="Add the tag"]');
    if (!add) throw new Error("no add-the-tag button");
    add.click();
    return true;
  })()`);
  await page.sleep(150);
}

/** Press Save in whichever sheet is open. */
async function save(page) {
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim() === "Save");
    if (!button) throw new Error("no Save button");
    button.click();
    return true;
  })()`);
  await page.sleep(700);
}

export async function run({ page, check, base }) {
  await reset(page, base);
  await openChapter(page, base, "book=Alma&chapter=32&verse=21");

  // --- the marking panel writes a tag --------------------------------------
  await selectWords(page, 21, 1, 4);
  await pressToolbar(page, "Tags");
  check(
    "the marking panel's Tags opens a sheet for the words",
    await page.evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label^="Tags for"]'))`)
  );
  await addTag(page, "faith");
  await save(page);
  check(
    "a tagged verse keeps a margin mark even with no ink on the words",
    await page.evaluate(
      `Boolean(document.querySelector('[aria-label="Open the notes, links, and tags on verse 21"]'))`
    )
  );

  // --- one panel, three sections ------------------------------------------
  await page.evaluate(
    `document.querySelector('[aria-label="Open the notes, links, and tags on verse 21"]')?.click()`
  );
  await page.sleep(600);
  const panel = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    if (!box) return null;
    const tags = box.querySelector('section[aria-label="Tags"]');
    return {
      label: box.getAttribute("aria-label"),
      tags: tags ? [...tags.querySelectorAll("button")].map((button) => button.textContent.trim()) : null,
      notes: Boolean(box.querySelector("#aside-notes")),
      links: Boolean(box.querySelector("#aside-links")),
    };
  })()`);
  check(
    "the margin mark opens the shared notes and links panel",
    Boolean(panel) && panel.label.includes("Alma 32:21"),
    panel ? panel.label : "no panel"
  );
  check(
    "with a Tags section carrying the tag that was made",
    Boolean(panel?.tags) && panel.tags.some((label) => label === "#faith"),
    panel?.tags?.join(", ") ?? "no tags section"
  );
  check(
    "and no Notes or Links heading for a verse that has neither",
    Boolean(panel) && !panel.notes && !panel.links,
    panel ? `notes=${panel.notes} links=${panel.links}` : ""
  );
  await page.evaluate(
    `document.querySelector('[role="dialog"][aria-label^="Notes and links on"] [aria-label="Close"]')?.click()`
  );
  await page.sleep(500);

  // --- a note, beside the tag ---------------------------------------------
  await selectWords(page, 21, 6, 10);
  await pressToolbar(page, "Note");
  await writeNote(page, "<p>Led by the Spirit.</p>");
  await page.evaluate(
    `document.querySelector('[aria-label="Open the notes, links, and tags on verse 21"]')?.click()`
  );
  await page.sleep(600);
  const withNote = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    if (!box) return null;
    const note = box.querySelector('section[aria-labelledby="aside-notes"] li');
    const stamp = note ? note.querySelector("time") : null;
    return {
      notes: Boolean(box.querySelector("#aside-notes")),
      links: Boolean(box.querySelector("#aside-links")),
      noteText: note ? note.textContent : "",
      stamp: stamp ? stamp.textContent.trim() : null,
      stamped: stamp ? Boolean(stamp.getAttribute("datetime")) : false,
      calendar: note ? Boolean(note.querySelector("svg")) : false,
    };
  })()`);
  check(
    "the panel shows a Notes section when there is a note",
    Boolean(withNote?.notes),
    withNote ? String(withNote.notes) : ""
  );
  check(
    "the note's own words are there to read",
    Boolean(withNote) && withNote.noteText.includes("Led by the Spirit"),
    withNote?.noteText?.slice(0, 60) ?? ""
  );
  check(
    "each note is stamped with when it was written, under a drawn calendar",
    Boolean(withNote?.stamp) && withNote.stamped && withNote.calendar,
    withNote ? String(withNote.stamp) : ""
  );
  check("and still no Links section, because there is no link", Boolean(withNote) && !withNote.links);
  await page.evaluate(
    `document.querySelector('[role="dialog"][aria-label^="Notes and links on"] [aria-label="Close"]')?.click()`
  );
  await page.sleep(500);

  // --- the same tag on another marking ------------------------------------
  await selectWords(page, 27, 1, 3);
  await pressToolbar(page, "Tags");
  const reused = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim() === "#faith");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  check("a tag already used is offered to the next marking", reused);
  await save(page);
  check(
    "the second verse keeps its own margin mark",
    await page.evaluate(
      `Boolean(document.querySelector('[aria-label="Open the notes, links, and tags on verse 27"]'))`
    )
  );

  // --- a tag gathers the library ------------------------------------------
  await page.evaluate(
    `document.querySelector('[aria-label="Open the notes, links, and tags on verse 27"]')?.click()`
  );
  await page.sleep(600);
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim() === "#faith");
    if (!button) throw new Error("no #faith pill");
    button.click();
    return true;
  })()`);
  await page.sleep(500);
  const gathered = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label^="Tagged #"]');
    if (!box) return null;
    const links = [...box.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? "");
    return { label: box.getAttribute("aria-label"), links, stamped: Boolean(box.querySelector("time")) };
  })()`);
  check("pressing a pill opens everything wearing that tag", Boolean(gathered), gathered?.label ?? "no list");
  check(
    "both tagged markings are in it",
    Boolean(gathered) && gathered.links.length === 2,
    gathered ? `${gathered.links.length} entries` : ""
  );
  check(
    "and each entry says when it was tagged",
    Boolean(gathered) && gathered.stamped,
    gathered ? String(gathered.stamped) : ""
  );

  // --- and a tag can be taken off ----------------------------------------
  await page.evaluate(`document.querySelector('[role="dialog"] [aria-label="Back to this verse"]')?.click()`);
  await page.sleep(500);
  await page.evaluate(
    `document.querySelector('[role="dialog"] [aria-label="Remove the tag faith"]')?.click()`
  );
  await page.sleep(600);
  const removed = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    return {
      closed: !box,
      marker: Boolean(document.querySelector('[aria-label="Open the notes, links, and tags on verse 27"]')),
    };
  })()`);
  check(
    "the tag's x takes it off a verse that held nothing else",
    removed.closed && !removed.marker,
    `panel=${removed.closed ? "closed" : "open"} marker=${removed.marker}`
  );

  // The library keeps the tag where it is still worn: removing it from one
  // verse is not a rename or a purge of the others.
  check(
    "and another verse still wears it",
    await page.evaluate(
      `Boolean(document.querySelector('[aria-label="Open the notes, links, and tags on verse 21"]'))`
    )
  );
  await page.evaluate(
    `document.querySelector('[aria-label="Open the notes, links, and tags on verse 21"]')?.click()`
  );
  await page.sleep(600);
  const kept = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    if (!box) return null;
    return [...box.querySelectorAll("button")]
      .map((button) => button.textContent.trim())
      .filter((label) => label.startsWith("#"));
  })()`);
  check("on the verse that was not edited", Boolean(kept) && kept.includes("#faith"), kept?.join(", ") ?? "no panel");

  // --- the plus at the end of the pills -----------------------------------
  await page.evaluate(
    `document.querySelector('[role="dialog"] [aria-label="Add a tag"], [role="dialog"] [aria-label="Add tags"]')?.click()`
  );
  await page.sleep(700);
  const sheet = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label^="Tags for"]');
    if (!box) return null;
    return {
      label: box.getAttribute("aria-label"),
      pills: [...box.querySelectorAll("li")].map((item) => item.textContent.trim()),
      field: Boolean(box.querySelector("#tag-field")),
    };
  })()`);
  check(
    "the panel's plus opens the tag sheet over it",
    Boolean(sheet) && sheet.field,
    sheet ? sheet.label : "no sheet"
  );
  check(
    "the sheet opens on the tags the verse already wears",
    Boolean(sheet) && sheet.pills.some((label) => label.includes("#faith")),
    sheet?.pills?.join(", ") ?? ""
  );

  // --- the library finds the theme ---------------------------------------
  await escape(page);

  // The theme is worn by more than one passage again, so search has something
  // to gather rather than a single row that any match would explain.
  await openChapter(page, base, "book=Alma&chapter=32&verse=27");
  await selectWords(page, 27, 1, 3);
  await pressToolbar(page, "Tags");
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim() === "#faith");
    if (!button) throw new Error("no #faith suggestion");
    button.click();
    return true;
  })()`);
  await save(page);

  await page.goto(`${base}/search/`, 2400);
  await page.evaluate(`(() => {
    const box = document.querySelector("#library-search");
    if (!box) throw new Error("the search page has no box");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, "faith");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  const answered = await waitFor(
    page,
    `Boolean(document.querySelector('[aria-labelledby="tagged-results"]'))`,
    20000
  );
  const found = await page.evaluate(`(() => {
    const section = document.querySelector('[aria-labelledby="tagged-results"]');
    if (!section) return null;
    return {
      heading: section.querySelector("h2")?.textContent ?? "",
      rows: [...section.querySelectorAll("li a")].map((anchor) => anchor.getAttribute("href") ?? ""),
    };
  })()`);
  check("a search for a tag name answers with the tagged passages", answered && Boolean(found));
  check(
    "under the tag's own name",
    found?.heading === "Tagged #faith",
    found?.heading ?? "no heading"
  );
  check(
    "one row for each passage wearing it",
    found?.rows.length === 2,
    found ? `${found.rows.length} row(s)` : ""
  );
  check(
    "and each opens the reader at its verse",
    Boolean(found) && found.rows.some((href) => href.includes("verse=21")) && found.rows.some((href) => href.includes("verse=27")),
    found?.rows.join(", ") ?? ""
  );
}

