import { reset, waitFor } from "./helpers.mjs";

export const name = "links";

/**
 * A link written in a journal entry.
 *
 * The journal and the reader share one way to make a link now: search the
 * library, read the chapter that answers, and pick the verses out of it. This
 * drives the journal's half — the same picker, reached from the editor's own
 * Link button — and reads back the anchor the editor inserted.
 */
export async function run({ page, check, base }) {
  await reset(page, base);
  await page.goto(`${base}/journal/`, 2200);

  const opened = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((entry) => entry.textContent.includes("New entry"));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await page.sleep(500);
  check(
    "the journal opens a fresh entry",
    opened && (await page.evaluate(`Boolean(document.querySelector('[aria-label="Entry body"]'))`))
  );

  // A line of writing, selected, so the link has words to wear.
  await page.evaluate(`(() => {
    const body = document.querySelector('[aria-label="Entry body"]');
    body.focus();
    body.innerHTML = "A thought about faith.";
    body.dispatchEvent(new Event("input", { bubbles: true }));
    const range = document.createRange();
    range.selectNodeContents(body);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  })()`);

  const pressed = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((entry) => (entry.getAttribute("aria-label") ?? "").startsWith("Link ("));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  await page.sleep(600);
  check(
    "the editor's Link opens the library search",
    pressed && (await page.evaluate(`Boolean(document.querySelector("#passage-link-search"))`))
  );

  await page.evaluate(`(() => {
    const box = document.querySelector("#passage-link-search");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, "alma 32");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  const found = await waitFor(
    page,
    `[...document.querySelectorAll('[role="dialog"] ul li button')].some((button) => button.textContent.includes("Alma 32"))`
  );
  check("the search answers with the chapter", found);

  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] ul li button')]
      .find((entry) => entry.textContent.includes("Alma 32"));
    if (button) button.click();
    return true;
  })()`);
  const openedPreview = await waitFor(
    page,
    `Boolean(document.querySelector('[role="listbox"][aria-label="Verses in this passage"]'))`
  );
  const preview = await page.evaluate(`(() => {
    const list = document.querySelector('[role="listbox"][aria-label="Verses in this passage"]');
    return {
      verses: list ? list.querySelectorAll('[role="option"]').length : 0,
      picked: list ? list.querySelectorAll('[role="option"][aria-selected="true"]').length : 0,
    };
  })()`);
  check(
    "and a result opens its verses to choose from",
    openedPreview && preview.verses === 43,
    `${preview.verses} verses`
  );
  check("with the answering verse already picked", preview.picked === 1, `${preview.picked} picked`);

  await page.evaluate(`(() => {
    const options = [...document.querySelectorAll('[role="listbox"] [role="option"]')];
    if (options.length < 22) throw new Error("the preview is short: " + options.length);
    options[0].click();
    options[20].click();
    options[21].click();
    return true;
  })()`);
  await page.sleep(250);
  const confirmed = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim().startsWith("Link Alma 32:"));
    if (!button) return null;
    const text = button.textContent.trim();
    button.click();
    return text;
  })()`);
  check(
    "the verses chosen in the preview become the link",
    confirmed === "Link Alma 32:21-22",
    confirmed ?? "no confirmation"
  );
  await page.sleep(250);
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim() === "Insert link");
    if (!button) throw new Error("no Insert link button");
    button.click();
    return true;
  })()`);
  await page.sleep(600);

  const body = await page.evaluate(`(() => {
    const editor = document.querySelector('[aria-label="Entry body"]');
    const anchor = editor ? editor.querySelector("a") : null;
    return {
      href: anchor ? anchor.getAttribute("href") : null,
      text: anchor ? anchor.textContent : null,
      html: editor ? editor.innerHTML : "",
    };
  })()`);
  check(
    "the entry carries a link to the verses picked",
    Boolean(body.href) &&
      body.href.includes("book=Alma") &&
      body.href.includes("chapter=32") &&
      body.href.includes("verse=21-22"),
    body.href ?? body.html
  );
}
