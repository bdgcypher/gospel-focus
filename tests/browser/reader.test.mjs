import {
  contrastOf,
  escape,
  fillOf,
  openChapter,
  openChapterMenu,
  press,
  pressMark,
  pressToolbar,
  reset,
  selectWords,
  tapLastWord,
  tapWord,
  writeNote,
} from "./helpers.mjs";

export const name = "reader";

/**
 * The reader as a reader uses it: open a chapter at a verse, mark words, write a
 * note, come back to it, and walk on to the next chapter. Everything is asserted
 * through the rendered page — computed colours included — because a mark that is
 * stored but not painted is not a mark.
 */
export async function run({ page, check, base }) {
  await reset(page, base);
  await openChapter(page, base, "book=Jeremiah&chapter=3&verse=15");

  const heading = await page.evaluate(`document.querySelector("main h1")?.textContent ?? ""`);
  check("opens the chapter named in the address", heading.includes("Jeremiah 3"), heading);

  const words = await page.evaluate(`document.querySelectorAll("[data-verse]").length`);
  check("renders the whole chapter, word by word", words > 500, `${words} word spans`);

  const inView = await page.evaluate(`(() => {
    const verse = document.getElementById("verse-15");
    if (!verse) return null;
    const box = verse.getBoundingClientRect();
    return box.top >= 0 && box.top < window.innerHeight;
  })()`);
  check("scrolls the requested verse into view", inView === true);

  // --- marking ------------------------------------------------------------
  await selectWords(page, 15, 4, 9);
  const toolbar = await page.evaluate(
    `Boolean(document.querySelector('[role="toolbar"][aria-label="Mark the selected words"]'))`
  );
  check("a selection opens the marking toolbar", toolbar);

  const fills = await page.evaluate(
    `[...document.querySelectorAll('[role="toolbar"] button[aria-label^="Highlight "]')].map((b) => b.getAttribute("aria-label"))`
  );
  const noRecents = await page.evaluate(
    `document.querySelectorAll('[role="toolbar"] button[aria-label^="Recent "]').length`
  );
  check("a fresh device has nothing to lead with", noRecents === 0, `${noRecents} recent(s)`);
  check(
    "the palette leads with yellow, red and the rest",
    ["Highlight yellow", "Highlight red", "Highlight green", "Highlight blue", "Highlight purple"].every((label) =>
      fills.includes(label)
    ),
    fills.join(", ")
  );
  // The two "A" tabs are what tell a highlight from an underline; the palette
  // under them is drawn in whichever tab is chosen.
  await pressToolbar(page, "Underline");
  const underlines = await page.evaluate(
    `[...document.querySelectorAll('[role="toolbar"] button[aria-label^="Underline "]')].map((b) => b.getAttribute("aria-label"))`
  );
  check(
    "the underline tab draws the same palette as underlines",
    underlines.length === 9 && underlines.includes("Underline red") && underlines.includes("Underline blue"),
    underlines.join(", ")
  );
  check(
    "the chosen style is the one shown as pressed",
    await page.evaluate(
      `document.querySelector('[role="toolbar"] button[aria-label="Underline"]')?.getAttribute("aria-pressed") === "true"`
    )
  );
  await pressToolbar(page, "Highlight");

  await pressToolbar(page, "yellow");
  check("yellow paints the words", (await fillOf(page, 15, 3)) === "rgb(251, 234, 160)", await fillOf(page, 15, 3));
  // The gap after each word belongs to the marked span, so the band runs on
  // through the spaces instead of breaking between the words.
  const gaps = await page.evaluate(`(() => {
    const spans = [...document.querySelectorAll('[data-verse="15"]')];
    return spans.slice(3, 8).map((span) => span.textContent.endsWith(" "));
  })()`);
  check("the mark carries the gaps between its words", gaps.every(Boolean), gaps.join(","));
  const rounding = await page.evaluate(`(() => {
    return [...document.querySelectorAll('[data-verse="15"]')].slice(3, 9).map((span) => {
      const style = getComputedStyle(span);
      return [style.borderTopLeftRadius, style.borderBottomRightRadius];
    });
  })()`);
  check(
    "the band is rounded at its two ends and square in between",
    rounding[0][0] !== "0px" &&
      rounding[rounding.length - 1][1] !== "0px" &&
      rounding[1][0] === "0px" &&
      rounding[0][1] === "0px",
    rounding.map((row) => row.join("/")).join(" ")
  );
  const lightContrast = await contrastOf(page, 15, 3);
  check("highlighted words clear WCAG AA", lightContrast >= 4.5, `${lightContrast}:1`);

  // --- pressing a mark -----------------------------------------------------
  await tapWord(page, 15, 5);
  check(
    "a tap on marked words opens the marking panel on that mark",
    await page.evaluate(`Boolean(document.querySelector('[role="toolbar"][aria-label="Mark the selected words"]'))`)
  );
  check(
    "the panel opens showing the mark's own colour and style",
    await page.evaluate(`(() => {
      const fill = document.querySelector('[role="toolbar"] button[aria-label="Highlight yellow"]');
      const style = document.querySelector('[role="toolbar"] button[aria-label="Highlight"]');
      return fill?.getAttribute("aria-pressed") === "true" && style?.getAttribute("aria-pressed") === "true";
    })()`)
  );
  check(
    "a tap on a mark does not open the note sheet",
    (await page.evaluate(`Boolean(document.querySelector('[aria-label="Your note"]'))`)) === false
  );
  await escape(page);

  await selectWords(page, 16, 1, 4);
  await pressMark(page, "underline", "red");
  const decoration = await page.evaluate(`(() => {
    const style = getComputedStyle([...document.querySelectorAll('[data-verse="16"]')][0]);
    return [style.textDecorationLine, style.textDecorationColor];
  })()`);
  check(
    "red underline draws under the words",
    decoration[0].includes("underline") && decoration[1] === "rgb(165, 31, 24)",
    decoration.join(" ")
  );

  // --- the reader's own last two choices ----------------------------------
  await selectWords(page, 16, 1, 4);
  const recent = await page.evaluate(`(() => {
    return [...document.querySelectorAll('[role="toolbar"] button[aria-label^="Recent "]')].map((button) => {
      const swatch = button.querySelector("span[style]");
      const paint = swatch ? getComputedStyle(swatch) : null;
      return {
        label: button.getAttribute("aria-label"),
        fill: paint ? paint.backgroundColor : "",
        line: paint ? paint.textDecorationLine : "",
      };
    });
  })()`);
  check(
    "the bar leads with the last two choices, newest first",
    recent.length === 2 &&
      recent[0].label === "Recent underline in red" &&
      recent[1].label === "Recent highlight in yellow",
    recent.map((row) => row.label).join(" | ")
  );
  check(
    "each recent is drawn in the mode it was used in",
    recent[0]?.line.includes("underline") && recent[1]?.fill === "rgb(251, 234, 160)",
    recent.map((row) => `${row.fill}/${row.line}`).join(" | ")
  );

  // One press takes both halves of a choice: the colour and the mode.
  await pressToolbar(page, "Recent highlight in yellow");
  const converted = await page.evaluate(`(() => {
    const style = getComputedStyle([...document.querySelectorAll('[data-verse="16"]')][0]);
    return [style.backgroundColor, style.textDecorationLine];
  })()`);
  check(
    "pressing a recent applies its colour and its mode at once",
    converted[0] === "rgb(251, 234, 160)" && !converted[1].includes("underline"),
    converted.join(" ")
  );

  // --- a note on the marked words -----------------------------------------
  await selectWords(page, 15, 4, 9);
  await pressToolbar(page, "Note");
  check(
    "the note sheet opens on the selection",
    await page.evaluate(`Boolean(document.querySelector('[aria-label="Your note"]'))`)
  );
  await writeNote(page, "<p>Trust the promise: he will do it.</p>");
  const markers = await page.evaluate(`document.querySelectorAll('[aria-label="Open the note on verse 15"]').length`);
  check("a note marker sits after the words", markers === 1, `${markers} marker(s)`);

  // --- the chapter's own list ---------------------------------------------
  await openChapterMenu(page);
  await press(page, "Marks", 600);
  const listed = await page.evaluate(`document.querySelectorAll('[role="dialog"] li').length`);
  check("the marks sheet lists both marks", listed === 2, `${listed} entries`);
  const preview = await page.evaluate(`(() => {
    const item = document.querySelector('[role="dialog"] li');
    return item ? item.textContent : "";
  })()`);
  check("the note reads as prose in the list", preview.includes("Trust the promise") && !preview.includes("<p>"), preview.slice(0, 60));
  await page.evaluate(`document.querySelector('[role="dialog"] button[aria-label="Close"]').click()`);
  await page.sleep(300);

  // --- persistence ---------------------------------------------------------
  await page.send("Page.reload");
  await page.sleep(2400);
  check("the highlight survives a reload", (await fillOf(page, 15, 3)) === "rgb(251, 234, 160)");
  const afterReload = await page.evaluate(`document.querySelectorAll('[aria-label="Open the note on verse 15"]').length`);
  check("the note survives a reload", afterReload === 1, `${afterReload} marker(s)`);

  // --- the night page ------------------------------------------------------
  await page.evaluate(`document.documentElement.classList.add("dark")`);
  await page.sleep(350);
  const nightFill = await fillOf(page, 15, 3);
  check("the night page washes the mark in the night palette", nightFill === "rgb(92, 75, 4)", nightFill);
  const nightContrast = await contrastOf(page, 15, 3);
  check("the night wash keeps the words legible", nightContrast >= 4.5, `${nightContrast}:1`);
  await page.evaluate(`document.documentElement.classList.remove("dark")`);
  await page.sleep(250);

  // --- a sweep across verses ----------------------------------------------
  await page.evaluate(`(() => {
    const first = [...document.querySelectorAll('[data-verse="20"]')];
    const second = [...document.querySelectorAll('[data-verse="21"]')];
    const range = document.createRange();
    range.setStartBefore(first[first.length - 3]);
    range.setEndAfter(second[2]);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return true;
  })()`);
  await page.sleep(420);
  await pressMark(page, "fill", "blue");
  const swept = await page.evaluate(`(() => {
    const a = [...document.querySelectorAll('[data-verse="20"]')].slice(-3);
    const b = [...document.querySelectorAll('[data-verse="21"]')].slice(0, 3);
    return [...a, ...b].map((span) => getComputedStyle(span).backgroundColor);
  })()`);
  check("a sweep across verses marks each verse it covers", swept.every((fill) => fill === "rgb(199, 224, 247)"), swept.join(" "));

  // The sweep is one mark, not two: tapping the words in either verse opens the
  // same panel, with the whole run quoted in it.
  await tapLastWord(page, 20);
  await pressToolbar(page, "Note");
  const sweptTitle = await page.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return dialog ? dialog.textContent : "";
  })()`);
  check(
    "a mark across verses comes back as one mark, spanning both",
    sweptTitle.includes("Jeremiah 3:20–21"),
    sweptTitle.slice(0, 60)
  );
  await page.evaluate(`(() => {
    const cancel = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent.trim() === "Cancel");
    cancel?.click();
    return true;
  })()`);
  await page.sleep(400);
  await escape(page);

  // --- removing a mark -----------------------------------------------------
  await selectWords(page, 24, 1, 3);
  await pressMark(page, "fill", "purple");
  check("a purple mark lands", (await fillOf(page, 24, 0)) === "rgb(224, 212, 247)");
  await selectWords(page, 24, 1, 3);
  await pressToolbar(page, "Remove");
  check("Remove takes it off again", (await fillOf(page, 24, 0)) === "rgba(0, 0, 0, 0)");

  // --- two marks on one patch of words -------------------------------------
  await selectWords(page, 24, 1, 5);
  await pressMark(page, "fill", "purple");
  await selectWords(page, 24, 3, 7);
  await pressMark(page, "underline", "red");

  await tapWord(page, 24, 4);
  const choices = await page.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Choose a mark"]');
    if (!dialog) return null;
    return [...dialog.querySelectorAll("li")].map((li) => {
      const span = li.querySelector("span[style]");
      const painted = span ? getComputedStyle(span) : null;
      return {
        text: li.textContent.trim(),
        fill: painted ? painted.backgroundColor : "",
        line: painted ? painted.textDecorationLine : "",
      };
    });
  })()`);
  check("a tap where marks overlap asks which one", choices?.length === 2, choices ? choices.map((row) => row.text).join(" | ") : "no chooser");
  check(
    "the chooser draws each mark as it sits on the page",
    choices?.[0]?.fill === "rgb(224, 212, 247)" && choices?.[1]?.line.includes("underline"),
    choices ? choices.map((row) => `${row.fill}/${row.line}`).join(" | ") : ""
  );
  check(
    "and the words say which mark is which",
    Boolean(choices?.[0]?.text.includes("For shame")) && Boolean(choices?.[1]?.text.includes("devoured the labour")),
    choices ? choices.map((row) => row.text.slice(0, 40)).join(" | ") : ""
  );

  // Picking a row hands it to the marking panel — the same tool as a mark that
  // was tapped on the page — and its Remove takes just that mark away.
  await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('[role="dialog"][aria-label="Choose a mark"] li')][1];
    const button = row?.querySelector("button");
    if (!button) throw new Error("the second mark has no row to press");
    button.click();
    return true;
  })()`);
  await page.sleep(500);
  check(
    "picking one opens the marking panel on it",
    await page.evaluate(`(() => {
      const panel = document.querySelector('[role="toolbar"][aria-label="Mark the selected words"]');
      const underline = panel?.querySelector('button[aria-label="Underline"]');
      return underline?.getAttribute("aria-pressed") === "true";
    })()`)
  );
  await pressToolbar(page, "Remove");
  await page.sleep(500);
  check("removing one mark leaves the other under the same words", (await fillOf(page, 24, 3)) === "rgb(224, 212, 247)", await fillOf(page, 24, 3));

  // --- chapter navigation --------------------------------------------------
  await page.evaluate(`(() => {
    const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("Jeremiah 4"));
    buttons[buttons.length - 1].click();
    return true;
  })()`);
  await page.sleep(1800);
  const nextHeading = await page.evaluate(`document.querySelector("main h1")?.textContent ?? ""`);
  check("the next chapter opens", nextHeading.includes("Jeremiah 4"), nextHeading);
  check("a new chapter starts at its top", (await page.evaluate(`window.scrollY`)) < 40);

  // --- the chapter grid ----------------------------------------------------
  await openChapterMenu(page);
  await press(page, "Chapters", 600);
  await page.evaluate(`(() => {
    const ten = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === "10");
    if (!ten) throw new Error("no chapter 10 in the grid");
    ten.click();
    return true;
  })()`);
  await page.sleep(1800);
  const tenth = await page.evaluate(`document.querySelector("main h1")?.textContent ?? ""`);
  check("the chapter grid opens a chapter", tenth.includes("Jeremiah 10"), tenth);

  // --- browsing the library ------------------------------------------------
  await openChapterMenu(page);
  await press(page, "Browse", 900);
  const browserOpen = await page.evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label="Browse"]'))`);
  check("the browse index opens", browserOpen);
  await press(page, "Old Testament", 500);
  await page.evaluate(`(() => {
    const book = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent.includes("Jeremiah"));
    if (!book) throw new Error("Jeremiah isn't in the Old Testament list");
    book.click();
    return true;
  })()`);
  await page.sleep(500);
  await page.evaluate(`(() => {
    const chapter = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => b.textContent.trim() === "5");
    if (!chapter) throw new Error("no chapter 5");
    chapter.click();
    return true;
  })()`);
  await page.sleep(2000);
  const browsed = await page.evaluate(`document.querySelector("main h1")?.textContent ?? ""`);
  check("browsing opens any chapter without a citation", browsed.includes("Jeremiah 5"), browsed);
  check("the sheet is closed once it hands over", (await page.evaluate(`Boolean(document.querySelector('[role="dialog"]'))`)) === false);
}
