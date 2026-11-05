import { openChapter, reset } from "./helpers.mjs";

export const name = "saved passages";

/**
 * A passage the reader kept — starred as a favorite, then filed into a deck —
 * and the way each card leads back to the words: its own name, and its Read
 * action, open the reader at the verses it holds, marked down the chapter.
 *
 * The favorite is made through the reader's verse sheet and the deck through
 * the favorites page's own Memorize sheet, because a card is only worth a test
 * if the app can still make one this way.
 */

/** Press the Read link (or the reference's own name) in the card holding `text`. */
const pressInCard = (page, text, pick) =>
  page.evaluate(`(() => {
    const card = [...document.querySelectorAll("li")].find((el) => el.textContent.includes(${JSON.stringify(text)}));
    if (!card) throw new Error("no card for ${text}");
    const target = ${pick};
    if (!target) throw new Error("no link in the card for ${text}");
    target.click();
    return true;
  })()`);

/** What that card offers as links into the words. */
const linksInCard = (page, text) =>
  page.evaluate(`(() => {
    const card = [...document.querySelectorAll("li")].find((el) => el.textContent.includes(${JSON.stringify(text)}));
    if (!card) return null;
    const heading = card.querySelector("h2 a, h4 a");
    const read = [...card.querySelectorAll("a")].find((a) => a.textContent.includes("Read"));
    return { heading: heading?.getAttribute("href") ?? null, read: read?.getAttribute("href") ?? null };
  })()`);

/** Where the reader landed, and which verses it marked. */
const landed = (page) =>
  page.evaluate(`(() => {
    const marked = [...document.querySelectorAll("[id^='verse-']")]
      .filter((el) => el.className.includes("border-accent"));
    return {
      path: location.pathname + location.search,
      marked: marked.map((el) => el.id),
      rule: marked[0] ? getComputedStyle(marked[0]).borderLeftWidth : null,
    };
  })()`);

export async function run({ page, check, base }) {
  await reset(page, base);
  await openChapter(page, base, "book=Jeremiah&chapter=3&verse=15", 3000);

  // Star the verse from its own sheet, the way a reader keeps a passage.
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((b) => b.getAttribute("aria-label") === "Verse 15: actions");
    if (!button) throw new Error("the reader has no verse control");
    button.click();
    return true;
  })()`);
  await page.sleep(500);
  await page.evaluate(`(() => {
    const star = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent.includes("Star"));
    if (!star) throw new Error("the verse sheet has no star");
    star.click();
    return true;
  })()`);
  await page.sleep(700);

  // --- the favorite's card --------------------------------------------------
  await page.goto(`${base}/favorites/`, 3000);
  await page.sleep(900);

  const favorite = await linksInCard(page, "Jeremiah 3:15");
  check("a saved passage names its reference as a link", Boolean(favorite?.heading), JSON.stringify(favorite));
  check("and offers a Read action", Boolean(favorite?.read), JSON.stringify(favorite));
  check(
    "both point at the reader",
    Boolean(favorite?.heading) && favorite.heading === favorite.read && /^\/read\/?\?/.test(favorite.read),
    JSON.stringify(favorite)
  );

  await pressInCard(
    page,
    "Jeremiah 3:15",
    `[...card.querySelectorAll("a")].find((a) => a.textContent.includes("Read"))`
  );
  await page.sleep(2600);
  const fromFavorite = await landed(page);
  check(
    "the favorite's Read link opens the reader at its verse",
    fromFavorite.path.startsWith("/read/") && fromFavorite.path.includes("verse=15"),
    fromFavorite.path
  );
  check(
    "and that verse wears the gold rule",
    JSON.stringify(fromFavorite.marked) === JSON.stringify(["verse-15"]) && fromFavorite.rule === "2px",
    JSON.stringify(fromFavorite)
  );

  // --- into a deck, from the favorite's card -------------------------------
  await page.goto(`${base}/favorites/`, 3000);
  await page.sleep(900);
  await page.evaluate(`(() => {
    const card = [...document.querySelectorAll("li")].find((el) => el.textContent.includes("Jeremiah 3:15"));
    const button = [...card.querySelectorAll("button")].find((b) => b.textContent.includes("Memorize"));
    if (!button) throw new Error("the favorite has no Memorize action");
    button.click();
    return true;
  })()`);
  await page.sleep(600);
  await page.evaluate(`(() => {
    const make = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => /Make your first deck|New deck/.test(b.textContent));
    if (!make) throw new Error("the sheet offers no new deck");
    make.click();
    return true;
  })()`);
  await page.sleep(400);
  await page.evaluate(`(() => {
    const field = document.querySelector("#new-deck-name");
    if (!field) throw new Error("no deck name field");
    // React reads the value off the input's own setter, so set it there.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(field, "Read them again");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await page.sleep(300);
  await page.evaluate(`(() => {
    const save = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent.trim() === "Save");
    if (!save) throw new Error("no Save in the deck sheet");
    save.click();
    return true;
  })()`);
  await page.sleep(800);

  // --- the memory card -----------------------------------------------------
  await page.goto(`${base}/memorize/`, 3200);
  await page.sleep(900);
  await page.evaluate(`(() => {
    const deck = [...document.querySelectorAll("button")].find((b) => b.getAttribute("title") === "Open this deck");
    if (!deck) throw new Error("the memorize index has no deck");
    deck.click();
    return true;
  })()`);
  await page.sleep(900);

  const memory = await linksInCard(page, "Jeremiah 3:15");
  check("a memory card names its reference as a link", Boolean(memory?.heading), JSON.stringify(memory));
  check("and offers a Read action", Boolean(memory?.read), JSON.stringify(memory));
  check(
    "both point at the reader",
    Boolean(memory?.heading) && memory.heading === memory.read && /^\/read\/?\?/.test(memory.read),
    JSON.stringify(memory)
  );

  await pressInCard(
    page,
    "Jeremiah 3:15",
    `[...card.querySelectorAll("a")].find((a) => a.textContent.includes("Read"))`
  );
  await page.sleep(2600);
  const fromMemory = await landed(page);
  check(
    "the memory card's Read link opens the reader at its verse",
    fromMemory.path.startsWith("/read/") && fromMemory.path.includes("verse=15"),
    fromMemory.path
  );
  check(
    "and that verse wears the gold rule",
    JSON.stringify(fromMemory.marked) === JSON.stringify(["verse-15"]) && fromMemory.rule === "2px",
    JSON.stringify(fromMemory)
  );

  // --- a series ------------------------------------------------------------
  await openChapter(page, base, "book=Jeremiah&chapter=31&verse=3-4;6", 3400);
  const series = await landed(page);
  check(
    "the reader opens a series of verses and marks every one, and only those",
    JSON.stringify(series.marked) === JSON.stringify(["verse-3", "verse-4", "verse-6"]),
    JSON.stringify(series.marked)
  );
}
