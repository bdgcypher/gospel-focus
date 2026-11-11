import { openChapter, pressToolbar, reset, selectWords, waitFor } from "./helpers.mjs";

export const name = "backlinks";

/**
 * A link in the reader is read from both ends.
 *
 * The link is written once, on the mark it belongs to — this drives that, from
 * the words of 1 Nephi 3:7 to a search for D&C 6 — and then opens the passage it
 * points at to read the way back. Nothing is stored on D&C 6:36; the link on the
 * other end is the whole record of it.
 */
export async function run({ page, check, base }) {
  await reset(page, base);

  // --- a link out of 1 Nephi 3:7 -------------------------------------------
  await openChapter(page, base, "book=1%20Nephi&chapter=3&verse=7");
  await selectWords(page, 7, 1, 4);
  await pressToolbar(page, "Link");
  check(
    "the words' Link opens the library search",
    await waitFor(page, `Boolean(document.querySelector("#passage-link-search"))`)
  );

  await page.evaluate(`(() => {
    const box = document.querySelector("#passage-link-search");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, "Doctrine and Covenants 6");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  const found = await waitFor(
    page,
    `[...document.querySelectorAll('[role="dialog"] ul li button')].some((button) => button.textContent.includes("Doctrine and Covenants 6"))`
  );
  check("the search answers with the chapter", found);

  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] ul li button')]
      .find((entry) => entry.textContent.includes("Doctrine and Covenants 6"));
    if (!button) throw new Error("no result for D&C 6");
    button.click();
    return true;
  })()`);
  const opened = await waitFor(
    page,
    `Boolean(document.querySelector('[role="listbox"][aria-label="Verses in this passage"]'))`
  );
  check("and the result opens its verses", opened);

  await page.evaluate(`(() => {
    const option = [...document.querySelectorAll('[role="listbox"] [role="option"]')]
      .find((entry) => entry.querySelector("span")?.textContent.trim() === "36");
    if (!option) throw new Error("no verse 36 in the preview");
    option.click();
    return true;
  })()`);
  await page.sleep(250);
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim().startsWith("Link Doctrine and Covenants 6:"));
    if (!button) throw new Error("no Link button in the picker");
    button.click();
    return true;
  })()`);
  await page.sleep(400);
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim() === "Save");
    if (!button) throw new Error("no Save button");
    button.click();
    return true;
  })()`);
  await page.sleep(700);

  check(
    "the verse linked out of keeps its margin mark",
    await page.evaluate(
      `Boolean(document.querySelector('[aria-label="Open the notes, links, and tags on verse 7"]'))`
    )
  );

  // --- the way back, on the passage it points at ---------------------------
  await openChapter(page, base, "book=Doctrine%20and%20Covenants&chapter=6&verse=36");
  const marker = await waitFor(
    page,
    `Boolean(document.querySelector('[aria-label="Open the notes, links, and tags on verse 36"]'))`
  );
  check("the linked verse keeps a margin mark of its own", marker);

  await page.evaluate(
    `document.querySelector('[aria-label="Open the notes, links, and tags on verse 36"]')?.click()`
  );
  await page.sleep(700);

  // The way back is an entry of the Links section, drawn like any other link:
  // the passage it names, folded to its reference, with the way into it.
  const panel = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    const sections = box ? [...box.querySelectorAll("section")] : [];
    const links = sections.find((entry) => entry.querySelector("#aside-links"));
    const anchor = links
      ? [...links.querySelectorAll("a")].find((entry) => entry.getAttribute("href"))
      : null;
    const toggle = links ? links.querySelector('button[aria-expanded]') : null;
    return {
      open: Boolean(box),
      headings: sections.map((entry) => entry.querySelector("h3")?.textContent.trim() ?? ""),
      back: anchor ? anchor.textContent.trim() : null,
      href: anchor ? anchor.getAttribute("href") : null,
      folded: toggle ? toggle.getAttribute("aria-expanded") === "false" : null,
      quote: links ? links.textContent.includes("I will go and do") : false,
      church: links ? links.textContent.includes("Gospel Library") : false,
    };
  })()`);
  check(
    "and the way back is a Links entry, not a heading of its own",
    panel.open &&
      panel.back === "1 Nephi 3:7" &&
      !panel.headings.some((heading) => heading === "Linked from"),
    panel.headings.join(", ") + ` / ${panel.back}`
  );
  check(
    "folded to its reference until the reader opens it",
    panel.folded === true && !panel.quote && !panel.church,
    `folded=${panel.folded} quote=${panel.quote} church=${panel.church}`
  );

  // The chevron beside the reference unfolds the passage's words.
  await page.evaluate(
    `document.querySelector('[aria-label="Show the text of 1 Nephi 3:7"]')?.click()`
  );
  const unfolded = await waitFor(
    page,
    `(() => {
      const links = [...document.querySelectorAll("section")]
        .find((entry) => entry.querySelector("#aside-links"));
      return Boolean(
        links &&
          links.querySelector('[aria-label="Hide the text of 1 Nephi 3:7"]')?.getAttribute("aria-expanded") === "true" &&
          links.textContent.includes("I will go and do") &&
          links.textContent.includes("Gospel Library")
      );
    })()`
  );
  check("its chevron unfolds the quoted passage", unfolded);
  await page.evaluate(
    `document.querySelector('[aria-label="Hide the text of 1 Nephi 3:7"]')?.click()`
  );
  await page.sleep(250);
  check(
    "and folds it away again",
    await page.evaluate(`(() => {
      const links = [...document.querySelectorAll("section")]
        .find((entry) => entry.querySelector("#aside-links"));
      return Boolean(links && !links.textContent.includes("I will go and do"));
    })()`)
  );

  // --- the way back leads there --------------------------------------------
  await page.evaluate(`(() => {
    const links = [...document.querySelectorAll("section")]
      .find((entry) => entry.querySelector("#aside-links"));
    const anchor = links
      ? [...links.querySelectorAll("a")].find((entry) => entry.getAttribute("href"))
      : null;
    if (!anchor) throw new Error("no way back to follow");
    anchor.click();
    return true;
  })()`);
  await page.sleep(1800);
  const arrived = await page.evaluate(`(() => ({
    url: location.pathname + location.search,
    focused: Boolean(document.querySelector("#verse-7")),
  }))()`);
  check(
    "following it opens the passage the link was written from",
    arrived.url.includes("Nephi") &&
      arrived.url.includes("chapter=3") &&
      arrived.url.includes("verse=7") &&
      arrived.focused,
    arrived.url
  );
}
