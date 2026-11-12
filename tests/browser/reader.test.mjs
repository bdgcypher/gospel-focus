import {
  contrastOf,
  escape,
  fillOf,
  openChapter,
  openPlaceMenu,
  pressInPlaceMenu,
  pressMark,
  pressToolbar,
  reset,
  selectWords,
  tapLastWord,
  tapWord,
  waitFor,
  writeNote,
} from "./helpers.mjs";

export const name = "reader";

/** The app's two bars, and the room the page keeps for the bottom one. */
const chromeOf = (page) =>
  page.evaluate(`(() => {
    const header = document.querySelector(".app-header");
    const bar = document.querySelector(".app-nav-bottom");
    const shell = document.querySelector(".app-shell-content");
    return {
      header: header ? getComputedStyle(header).display : "missing",
      bar: bar ? getComputedStyle(bar).display : "missing",
      room: shell ? getComputedStyle(shell).paddingBottom : "missing",
    };
  })()`);

/** A press on a word, lifted where it landed — once, or twice for a double tap. */
const pressWords = async (page, verse, word, times = 1) => {
  await page.evaluate(`(() => {
    const node = [...document.querySelectorAll('[data-verse="${verse}"]')][${word - 1}];
    if (!node) throw new Error("no word ${verse}:${word}");
    const box = node.getBoundingClientRect();
    for (let i = 0; i < ${times}; i += 1) {
      node.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        clientX: box.left + 2,
        clientY: box.top + box.height / 2,
      }));
    }
    return true;
  })()`);
  await page.sleep(420);
};

/**
 * A finger across the page: press, carry it sideways, and only then let go.
 *
 * The moves are the browser's own pointer events, spaced like frames, because
 * the reader reads the gesture as it arrives — how far it has travelled, which
 * side of the start the finger is on, and whether it began with a rest. They
 * are dispatched before the release so a scenario can look at what is on
 * screen mid-gesture — the chapter leaning, the preview riding in — and then
 * finish the swipe.
 */
const carry = async (page, { from = 300, to = 120, y = 480, steps = 6, pause = 12 } = {}) => {
  await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fire = (type, x) => document.body.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: ${y},
    }));
    fire("pointerdown", ${from});
    await sleep(4);
    for (let step = 1; step <= ${steps}; step += 1) {
      fire("pointermove", ${from} + ((${to} - ${from}) * step) / ${steps});
      await sleep(${pause});
    }
    return true;
  })()`);
};

/** Carry a finger that is already down on to another point. */
const carryOn = async (page, { from, to, y = 480, steps = 6, pause = 12 } = {}) => {
  await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fire = (x) => document.body.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: ${y},
    }));
    for (let step = 1; step <= ${steps}; step += 1) {
      fire(${from} + ((${to} - ${from}) * step) / ${steps});
      await sleep(${pause});
    }
    return true;
  })()`);
};

/** Lift the finger where the carry ended. */
const letGo = async (page, { to, y = 480 } = {}) => {
  await page.evaluate(`(() => {
    document.body.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: ${to},
      clientY: ${y},
    }));
    return true;
  })()`);
};

/** A whole swipe: carry, then lift. */
const swipe = async (page, options = {}) => {
  await carry(page, options);
  await letGo(page, options);
};

/** What the reader is showing, for the swipe's assertions. */
const swipeState = (page) =>
  page.evaluate(`(() => {
    const root = document.documentElement;
    const page = document.querySelector("[data-app-page]");
    const preview = document.querySelector("[data-reader-preview]");
    const box = page?.getBoundingClientRect();
    return {
      heading: document.querySelector("main h1")?.textContent ?? "",
      url: location.search,
      dragging: root.hasAttribute("data-nav-dragging"),
      slide: root.style.getPropertyValue("--nav-slide"),
      shift: box ? Math.round(box.left) : null,
      preview: Boolean(preview),
      previewText: preview ? (preview.textContent ?? "").slice(0, 120) : "",
      previewVerses: preview ? preview.querySelectorAll("[data-verse]").length : 0,
    };
  })()`);

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
  const caret = await page.evaluate(`(() => {
    const svg = document.querySelector("main h1 button svg");
    return svg ? svg.getBoundingClientRect().height > 0 : false;
  })()`);
  check("the chapter's name carries a dropdown caret", caret);

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
  // The palette is longer than a phone, so it scrolls: an arrow each side of it
  // steps it along, and the left one is dead at the very beginning, where it has
  // nowhere to go. Clearing a mark is the Remove action and not a cross up here.
  const stripState = await page.evaluate(`(() => {
    const strip = document.querySelector('[role="toolbar"] button[aria-label^="Highlight "]')?.parentElement;
    const left = document.querySelector('[role="toolbar"] button[aria-label="Previous colours"]');
    const right = document.querySelector('[role="toolbar"] button[aria-label="More colours"]');
    const cross = document.querySelector('[role="toolbar"] button[aria-label="Clear the mark"]');
    return {
      arrows: Boolean(left && right),
      cross: Boolean(cross),
      disabled: left ? left.disabled : null,
      at: strip ? strip.scrollLeft : null,
    };
  })()`);
  check(
    "the strip carries an arrow each side, and no cross",
    stripState.arrows && !stripState.cross,
    JSON.stringify(stripState)
  );
  check(
    "its left arrow starts out of reach",
    stripState.disabled === true && stripState.at === 0,
    `${stripState.disabled}/${stripState.at}`
  );

  const stripAt = () =>
    page.evaluate(`(() => {
      const strip = document.querySelector('[role="toolbar"] button[aria-label^="Highlight "]').parentElement;
      const left = document.querySelector('[role="toolbar"] button[aria-label="Previous colours"]');
      return { left: strip.scrollLeft, disabled: left.disabled };
    })()`);

  await pressToolbar(page, "More colours");
  await page.sleep(800);
  const stepped = await stripAt();
  check("the right arrow steps the palette along", stepped.left > 0, String(stepped.left));
  check("and the left arrow comes alive with somewhere to go", stepped.disabled === false);

  await pressToolbar(page, "Previous colours");
  await page.sleep(800);
  const returned = await stripAt();
  check(
    "the left arrow steps back, and goes dead again at the start",
    returned.left <= 1 && returned.disabled === true,
    `${returned.left}/${returned.disabled}`
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
  // The band is one inline box, so the browser breaks it into a fragment per
  // line and clones the corners onto each one: both ends of *every* line are
  // round, not just the two ends of the run.
  const band = await page.evaluate(`(() => {
    const span = [...document.querySelectorAll('[data-verse="15"]')][3];
    const box = span && span.closest(".mark-band");
    if (!box) return null;
    const style = getComputedStyle(box);
    return {
      radius: style.borderTopLeftRadius,
      right: style.borderBottomRightRadius,
      break: style.boxDecorationBreak || style.webkitBoxDecorationBreak,
      fragments: box.getClientRects().length,
      words: box.querySelectorAll("[data-word]").length,
    };
  })()`);
  check(
    "the band clones its corners onto every line it wraps onto",
    Boolean(band) && band.break === "clone" && band.radius !== "0px" && band.right !== "0px",
    band ? `${band.break} ${band.radius}/${band.right}` : "no band"
  );
  check(
    "the corners are the band's, not each word's",
    await page.evaluate(`(() => {
      const spans = [...document.querySelectorAll('[data-verse="15"]')].slice(3, 9);
      return spans.length > 0 && spans.every((span) => getComputedStyle(span).borderTopLeftRadius === "0px");
    })()`)
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

  // The strip of colours scrolls sideways, and a scroll container clips what is
  // drawn outside its own box — which is where the ring on the chosen colour
  // lives. If the ring has no room above and below, it is cut off at both and
  // reads as two brackets either side of the swatch.
  const ringRoom = await page.evaluate(`(() => {
    const swatch = document.querySelector('[role="toolbar"] button[aria-label="Highlight yellow"]');
    const strip = swatch?.parentElement;
    if (!swatch || !strip) return null;
    const box = swatch.getBoundingClientRect();
    const clip = strip.getBoundingClientRect();
    const ring = 2;
    return {
      top: +(box.top - ring - clip.top).toFixed(1),
      bottom: +(clip.bottom - (box.bottom + ring)).toFixed(1),
    };
  })()`);
  check(
    "the ring on the chosen colour is not clipped top and bottom",
    ringRoom ? ringRoom.top >= 0 && ringRoom.bottom >= 0 : false,
    ringRoom ? `${ringRoom.top}px above, ${ringRoom.bottom}px below` : "no panel"
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
    decoration[0].includes("underline") && decoration[1] === "rgb(204, 90, 80)",
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
    const span = [...document.querySelectorAll('[data-verse="16"]')][0];
    const band = span.closest(".mark-band");
    return [
      band ? getComputedStyle(band).backgroundColor : "rgba(0, 0, 0, 0)",
      getComputedStyle(span).textDecorationLine,
    ];
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
  const markers = await page.evaluate(`document.querySelectorAll('[aria-label="Open the notes, links, and tags on verse 15"]').length`);
  check("the verse keeps a mark for its note", markers === 1, `${markers} marker(s)`);
  const markerPlace = await page.evaluate(`(() => {
    const marker = document.querySelector('[aria-label="Open the notes, links, and tags on verse 15"]');
    const words = [...document.querySelectorAll('[data-verse="15"]')];
    if (!marker || !words.length) return null;
    return {
      left: Math.round(marker.getBoundingClientRect().left),
      words: Math.round(Math.max(...words.map((span) => span.getBoundingClientRect().right))),
      inBand: Boolean(marker.closest(".mark-band")),
    };
  })()`);
  check(
    "the mark hangs in the verse's right margin, not inside its words",
    Boolean(markerPlace) && !markerPlace.inBand && markerPlace.left >= markerPlace.words,
    markerPlace ? `marker starts at ${markerPlace.left}, words end at ${markerPlace.words}` : "no marker"
  );

  // --- persistence ---------------------------------------------------------
  await page.send("Page.reload");
  await page.sleep(2400);
  check("the highlight survives a reload", (await fillOf(page, 15, 3)) === "rgb(251, 234, 160)");
  const afterReload = await page.evaluate(`document.querySelectorAll('[aria-label="Open the notes, links, and tags on verse 15"]').length`);
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
    return [...a, ...b].map((span) => {
      const band = span.closest(".mark-band");
      return band ? getComputedStyle(band).backgroundColor : "rgba(0, 0, 0, 0)";
    });
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
  const chooserSkin = await page.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Choose a mark"]');
    const list = dialog?.querySelector("ul");
    const previews = [...(dialog?.querySelectorAll("li span[style]") ?? [])];
    return {
      bg: dialog ? getComputedStyle(dialog).backgroundColor : "",
      ink: dialog ? getComputedStyle(dialog).color : "",
      scroll: list ? getComputedStyle(list).overflowY : "",
      clamp: previews.map((span) => getComputedStyle(span).webkitLineClamp),
    };
  })()`);
  check(
    "the chooser is the page's own paper, not the dark tool",
    chooserSkin.bg === "rgb(247, 242, 231)" && chooserSkin.ink === "rgb(42, 33, 24)",
    `${chooserSkin.bg} / ${chooserSkin.ink}`
  );
  check(
    "a long mark is cut to four lines in it",
    chooserSkin.clamp.every((value) => value === "4"),
    chooserSkin.clamp.join(", ")
  );
  check("and the list scrolls when the marks outgrow the sheet", chooserSkin.scroll === "auto", chooserSkin.scroll);

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

  // --- swiping between chapters --------------------------------------------
  // A finger across the page turns to the chapter beside it, the way the same
  // gesture turns between the sections: the page goes with the finger, the next
  // chapter is already drawn off the side, and the release lands on it.
  await carry(page, { from: 320, to: 130, y: 480 });
  await page.sleep(160);
  const midSwipe = await swipeState(page);
  check("a swipe carries the page with the finger", midSwipe.dragging && midSwipe.shift < -40, JSON.stringify(midSwipe));
  check("the chapter being turned to is drawn beside it", midSwipe.preview, JSON.stringify(midSwipe));
  check(
    "the preview is the chapter itself, not a sketch of it",
    midSwipe.previewText.includes("Jeremiah 5") && midSwipe.previewVerses > 10,
    `${midSwipe.previewVerses} verses: ${midSwipe.previewText}`
  );
  await letGo(page, { to: 130, y: 480 });
  await page.sleep(1700);
  const afterSwipe = await swipeState(page);
  check("letting go opens the next chapter", afterSwipe.heading.includes("Jeremiah 5") && afterSwipe.url.includes("chapter=5"), JSON.stringify(afterSwipe));
  check("the preview is taken away once the chapter lands", !afterSwipe.preview && !afterSwipe.dragging, JSON.stringify(afterSwipe));
  check("the turn leaves no trace on the page", afterSwipe.slide === "" && afterSwipe.shift === 0, JSON.stringify(afterSwipe));
  check("a swiped chapter starts at its top", (await page.evaluate(`window.scrollY`)) < 40);

  await swipe(page, { from: 120, to: 320, y: 480 });
  await page.sleep(1700);
  const sweptBack = await swipeState(page);
  check(
    "a swipe the other way opens the chapter before it",
    sweptBack.heading.includes("Jeremiah 4") && sweptBack.url.includes("chapter=4"),
    JSON.stringify(sweptBack)
  );

  // A slow swipe is still a swipe: the turn is read from the distance the
  // finger has gone, not from how fast it went.
  await swipe(page, { from: 320, to: 140, y: 480, pause: 180 });
  await page.sleep(1700);
  const slow = await swipeState(page);
  check(
    "a slow swipe still turns the page",
    slow.heading.includes("Jeremiah 5") && slow.url.includes("chapter=5"),
    JSON.stringify(slow)
  );

  // The finger decides the direction, not the first movement of the gesture:
  // starting forward and crossing back through the start turns the other way.
  await carry(page, { from: 320, to: 160, y: 480 });
  await page.sleep(120);
  await carryOn(page, { from: 160, to: 400, y: 480, pause: 30 });
  const flipped = await swipeState(page);
  check(
    "changing direction swaps the chapter being turned to",
    flipped.preview && flipped.previewText.includes("Jeremiah 4"),
    JSON.stringify(flipped).slice(0, 200)
  );
  await letGo(page, { to: 400, y: 480 });
  await page.sleep(1700);
  const reversed = await swipeState(page);
  check(
    "and letting go turns the way the finger ended up going",
    reversed.heading.includes("Jeremiah 4") && reversed.url.includes("chapter=4"),
    JSON.stringify(reversed)
  );

  // Brought back to where it began and let go there, the gesture asked for
  // nothing: the page returns without turning.
  await carry(page, { from: 320, to: 160, y: 480 });
  await page.sleep(120);
  await carryOn(page, { from: 160, to: 320, y: 480, pause: 30 });
  await letGo(page, { to: 320, y: 480 });
  await page.sleep(900);
  const restored = await swipeState(page);
  check(
    "a swipe brought back to where it began turns nothing",
    restored.heading.includes("Jeremiah 4") &&
      restored.url.includes("chapter=4") &&
      !restored.dragging &&
      restored.shift === 0,
    JSON.stringify(restored)
  );

  // A press that rests before it moves is how the browser begins a selection,
  // so a drag that starts that way belongs to the words and the chapter stays.
  await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fire = (type, x) => document.body.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: 480,
    }));
    fire("pointerdown", 320);
    await sleep(520);
    for (let step = 1; step <= 6; step += 1) {
      fire("pointermove", 320 - (180 * step) / 6);
      await sleep(30);
    }
    fire("pointerup", 140);
    return true;
  })()`);
  await page.sleep(900);
  const held = await swipeState(page);
  check(
    "a drag that rested first belongs to the words, not the chapter",
    held.heading.includes("Jeremiah 4") && held.url.includes("chapter=4"),
    JSON.stringify(held)
  );

  // --- the chapter grid ----------------------------------------------------
  // The chapter's own name is the door: it opens beside the heading, the book
  // at its top drills into its chapters, and a number is a chapter to go to.
  await openPlaceMenu(page);
  const menuRows = await page.evaluate(`[...document.querySelectorAll('[role="dialog"][aria-label="Choose a chapter"] > div > ul > li > button')].map((b) => b.textContent.trim())`);
  check(
    "the chapter menu is its rows, with no counts or arrows beside them",
    menuRows.join("|") === "Jeremiah|Old Testament|Scriptures",
    menuRows.join("|")
  );
  await pressInPlaceMenu(page, "Jeremiah", 600);
  const tile = await page.evaluate(`(() => {
    const grid = document.querySelector('[role="dialog"][aria-label="Choose a chapter"]');
    const button = [...(grid?.querySelectorAll("div.grid button") ?? [])].find((b) => b.textContent.trim() === "3");
    return button ? getComputedStyle(button).backgroundColor : "";
  })()`);
  check("a chapter tile is the card's paper, not the sheet behind it", tile === "rgb(255, 253, 247)", tile);
  await page.evaluate(`(() => {
    const ten = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === "10");
    if (!ten) throw new Error("no chapter 10 in the grid");
    ten.click();
    return true;
  })()`);
  await page.sleep(1800);
  const tenth = await page.evaluate(`document.querySelector("main h1")?.textContent ?? ""`);
  check("the chapter grid opens a chapter", tenth.includes("Jeremiah 10"), tenth);

  // --- the ends of the volume ----------------------------------------------
  // The first chapter has nothing before it: the page leans and is given back,
  // which is how the row says there is nothing that way.
  await openChapter(page, base, "book=Genesis&chapter=1", 2600);
  await carry(page, { from: 200, to: 340, y: 480 });
  await page.sleep(120);
  const leaning = await swipeState(page);
  check("a swipe past the first chapter leans the page", leaning.dragging && leaning.shift > 0 && !leaning.preview, JSON.stringify(leaning));
  await letGo(page, { to: 340, y: 480 });
  await page.sleep(900);
  const rebounded = await swipeState(page);
  check(
    "and gives it back without changing the chapter",
    rebounded.heading.includes("Genesis 1") && rebounded.shift === 0 && !rebounded.dragging,
    JSON.stringify(rebounded)
  );

  // The last chapter of a book has the next book after it, so a swipe crosses
  // into the next book rather than stopping at the end of this one.
  await openChapter(page, base, "book=Genesis&chapter=50", 2600);
  await swipe(page, { from: 320, to: 130, y: 480 });
  await page.sleep(1800);
  const crossed = await swipeState(page);
  check(
    "a swipe at the end of a book opens the next book",
    crossed.heading.includes("Exodus 1"),
    JSON.stringify(crossed)
  );

  // --- bookmarks -----------------------------------------------------------
  // A place the reader names and comes back to: saved from the bar, opened from
  // the list, moved when they read on, renamed, and taken out again.
  await openChapter(page, base, "book=Jeremiah&chapter=2");
  await page.evaluate(`(() => {
    const verse = document.getElementById("verse-6");
    window.scrollTo(0, verse.getBoundingClientRect().top + window.scrollY - 90);
    return true;
  })()`);
  await page.sleep(500);
  await page.evaluate(`document.querySelector('button[aria-label="Bookmarks"]').click()`);
  await page.sleep(400);
  const sheetText = `document.querySelector('[role="dialog"][aria-label="Bookmarks"]')?.textContent ?? ""`;
  check("the bar carries the bookmarks list", (await page.evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label="Bookmarks"]'))`)));
  check("an empty shelf says so", (await page.evaluate(sheetText)).includes("No bookmarks yet"));

  await page.evaluate(`document.querySelector('button[aria-label="Add a bookmark here"]').click()`);
  await page.sleep(300);
  const fab = await page.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Close the new bookmark"]');
    const svg = button?.querySelector("svg");
    return { open: Boolean(button), turned: svg ? svg.getAttribute("class").includes("rotate-45") : false };
  })()`);
  check("the plus turns into a close while the field is open", fab.open && fab.turned, `${fab.open}/${fab.turned}`);
  const defaultTitle = await page.evaluate(`document.querySelector("#bookmark-title")?.value ?? ""`);
  check("a new bookmark starts named for the place in view", defaultTitle === "Jeremiah 2:6", defaultTitle);

  await page.evaluate(`(() => {
    const box = document.querySelector("#bookmark-title");
    box.focus();
    box.select();
    return true;
  })()`);
  await page.send("Input.insertText", { text: "Family Bible study" });
  await page.sleep(250);
  await page.evaluate(`(() => {
    const sheet = document.querySelector('[role="dialog"][aria-label="Bookmarks"]');
    const save = [...sheet.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save");
    if (!save) throw new Error("no save control");
    save.click();
    return true;
  })()`);
  await page.sleep(400);
  const saved = await page.evaluate(sheetText);
  check("the bookmark is listed under its name", saved.includes("Family Bible study"), saved.slice(0, 80));
  check("and keeps the place it was saved at", saved.includes("Jeremiah 2:6"), saved.slice(0, 80));

  await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('[role="dialog"][aria-label="Bookmarks"] a')]
      .find((a) => a.textContent.includes("Family Bible study"));
    if (!row) throw new Error("no bookmark row");
    row.click();
    return true;
  })()`);
  await page.sleep(2200);
  check(
    "a bookmark opens the place it holds",
    (await page.evaluate(`location.search`)).includes("verse=6"),
    await page.evaluate(`location.search`)
  );

  await page.evaluate(`(() => {
    const verse = document.getElementById("verse-10");
    window.scrollTo(0, verse.getBoundingClientRect().top + window.scrollY - 90);
    return true;
  })()`);
  await page.sleep(400);
  await page.evaluate(`document.querySelector('button[aria-label="Bookmarks"]').click()`);
  await page.sleep(400);
  await page.evaluate(`document.querySelector('button[aria-label="Options for Family Bible study"]').click()`);
  await page.sleep(300);
  const options = await page.evaluate(`document.querySelector('[role="menu"]')?.textContent ?? ""`);
  check(
    "the kebab offers update, rename and delete",
    ["Update", "Rename", "Delete"].every((word) => options.includes(word)),
    options
  );
  await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('[role="menu"] button')].find((b) => b.textContent.trim() === "Update");
    if (!item) throw new Error("no update item");
    item.click();
    return true;
  })()`);
  await page.sleep(400);
  check(
    "Update moves the bookmark to where the reader is",
    (await page.evaluate(sheetText)).includes("Jeremiah 2:10"),
    await page.evaluate(sheetText)
  );

  await page.evaluate(`document.querySelector('button[aria-label="Options for Family Bible study"]').click()`);
  await page.sleep(250);
  await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('[role="menu"] button')].find((b) => b.textContent.trim() === "Rename");
    if (!item) throw new Error("no rename item");
    item.click();
    return true;
  })()`);
  await page.sleep(400);
  await page.evaluate(`(() => {
    const box = [...document.querySelectorAll('[role="dialog"] input')].at(-1);
    box.focus();
    box.select();
    return true;
  })()`);
  await page.send("Input.insertText", { text: "Family study" });
  await page.sleep(250);
  await page.evaluate(`(() => {
    const save = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === "Save");
    if (!save) throw new Error("no save control");
    save.click();
    return true;
  })()`);
  await page.sleep(400);
  check("Rename changes the name and not the place", (await page.evaluate(sheetText)).includes("Family study"), await page.evaluate(sheetText));

  await page.evaluate(`document.querySelector('button[aria-label="Options for Family study"]').click()`);
  await page.sleep(250);
  await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('[role="menu"] button')].find((b) => b.textContent.trim() === "Delete");
    if (!item) throw new Error("no delete item");
    item.click();
    return true;
  })()`);
  await page.sleep(400);
  check("Delete takes the bookmark out", (await page.evaluate(sheetText)).includes("No bookmarks yet"));
  await page.evaluate(`(() => {
    const outside = [...document.querySelectorAll('button[aria-label="Close bookmarks"]')]
      .find((button) => !button.closest('[role="dialog"]'));
    if (!outside) throw new Error("no way out of the sheet");
    outside.click();
    return true;
  })()`);
  await page.sleep(300);
  check(
    "pressing outside the sheet closes it",
    (await page.evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label="Bookmarks"]'))`)) === false
  );
  // Back to where the browsing section left the reader, so the rest of the
  // scenario starts from the chapter it expects.
  await openChapter(page, base, "book=Jeremiah&chapter=5&verse=3");

  // --- reading without the bars -------------------------------------------
  // A double tap hands the screen to the chapter: both bars go, and the room the
  // page kept for the navigation goes with them. A second double tap gives them
  // back. It is a reading gesture, so nothing about the words may come of it.
  const bars = await chromeOf(page);
  check(
    "the reader keeps the app bar off the page from the first frame",
    bars.header === "none" && bars.bar === "flex",
    `${bars.header}/${bars.bar}`
  );

  await pressWords(page, 1, 2);
  const once = await chromeOf(page);
  check(
    "one tap leaves the bars exactly where they were",
    once.header === bars.header && once.bar === bars.bar,
    `${once.header}/${once.bar}`
  );

  await pressWords(page, 1, 2, 2);
  const hidden = await chromeOf(page);
  check(
    "a double tap in the words takes both bars away",
    hidden.header === "none" && hidden.bar === "none",
    `${hidden.header}/${hidden.bar}`
  );
  check("and the page takes the room the navigation kept", hidden.room === "0px", hidden.room);

  // The marking panel floats above the bottom bar, so with the bar gone it has to
  // come down rather than hang a bar's height in the air.
  await selectWords(page, 1, 1, 3);
  const parted = await page.evaluate(`(() => {
    const node = document.querySelector("[data-marking-panel]");
    return node ? getComputedStyle(node).bottom : "missing";
  })()`);
  check("the marking panel comes down to the foot of the screen", parted === "8px", parted);
  await escape(page);

  await pressWords(page, 1, 2, 2);
  const given = await chromeOf(page);
  check(
    "a second double tap gives the bars back",
    given.header === bars.header && given.bar === bars.bar,
    `${given.header}/${given.bar}`
  );
  check("and the room under the page comes back too", given.room === bars.room, given.room);

  // The page's own controls answer a tap in their own way; a double tap on one
  // is not the reading gesture.
  await page.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Verse 2: actions"]');
    if (!button) throw new Error("no verse number to press");
    const box = button.getBoundingClientRect();
    for (let i = 0; i < 2; i += 1) {
      button.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      }));
    }
    return true;
  })()`);
  await page.sleep(420);
  const onControl = await chromeOf(page);
  check(
    "a double tap on the verse number is left to the verse",
    onControl.header === bars.header && onControl.bar === bars.bar,
    `${onControl.header}/${onControl.bar}`
  );

  // The room belongs to reading, so the next chapter keeps it.
  await pressWords(page, 1, 2, 2);
  await page.evaluate(`(() => {
    const buttons = [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("Jeremiah 6"));
    if (!buttons.length) throw new Error("no way on to Jeremiah 6");
    buttons[buttons.length - 1].click();
    return true;
  })()`);
  await page.sleep(1800);
  const nextChapter = await chromeOf(page);
  check(
    "the next chapter stays in the room the reader chose",
    nextChapter.header === "none" && nextChapter.bar === "none",
    `${nextChapter.header}/${nextChapter.bar}`
  );

  // The room the reader asked for never outlives the page, and the app bar is
  // out of the reader whether the reader has touched it or not — the chapter's
  // own bar is the way back.
  await page.send("Page.reload");
  await page.sleep(2400);
  const fresh = await chromeOf(page);
  check(
    "a fresh load gives the room back and still keeps the app bar away",
    fresh.header === "none" && fresh.bar === "flex",
    `${fresh.header}/${fresh.bar}`
  );

  // --- the way in, on the Study page ---------------------------------------
  // Reading is a door on the Study wall now rather than an entry in the More
  // menu. The search is a mark in the page's corner, above the wall, and the
  // Library card leads that wall: the two ways into the words, the one that
  // finds them and the one that opens them.
  await page.goto(`${base}/study/`, 2200);
  const wall = await page.evaluate(`(() => {
    // The search control is a mark in the page's corner, so its name is the
    // only text it carries: read the label as well as the words on the card.
    const cards = [...document.querySelectorAll("main a")].map((a) => ({
      href: a.getAttribute("href") ?? "",
      text: a.textContent + " " + (a.getAttribute("aria-label") ?? ""),
    }));
    const index = (needle) => cards.findIndex((card) => card.text.includes(needle));
    const library = cards[index("Library")];
    return {
      search: index("Search"),
      library: index("Library"),
      href: library?.href ?? null,
      random: index("Random Scripture"),
    };
  })()`);
  check(
    "the Study page offers the library",
    Boolean(wall.href) && wall.href.startsWith("/read"),
    `${wall.href} at ${wall.library}`
  );
  check(
    "and it leads the wall, under the search",
    wall.search >= 0 && wall.library > wall.search && wall.random === wall.library + 1,
    `search ${wall.search}, library ${wall.library}, random ${wall.random}`
  );

  await page.evaluate(`[...document.querySelectorAll("main a")]
    .find((a) => a.textContent.includes("Library")).click()`);
  await page.sleep(2600);
  check(
    "the Library card opens the reader",
    (await page.evaluate(`location.pathname + location.search`)).startsWith("/read"),
    await page.evaluate(`location.pathname + location.search`)
  );

  // --- a highlight's corners, line by line --------------------------------
  // A mark long enough to wrap: the ink should stop a beat short of the margin
  // on both sides of *every* line it covers. The reader measures which words
  // share a line and draws the run as one box per line, so a line end can keep
  // its corner even when the run also touches another mark somewhere else.
  //
  // A chapter of its own, so nothing another check left open is in the way of
  // the marking panel.
  await openChapter(page, base, "book=Alma&chapter=32");
  const longest = await page.evaluate(`(() => {
    const counts = new Map();
    for (const span of document.querySelectorAll("[data-verse]")) {
      counts.set(span.dataset.verse, (counts.get(span.dataset.verse) ?? 0) + 1);
    }
    let best = null;
    for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
    return best;
  })()`);
  await selectWords(page, longest[0], 1, longest[1]);
  await pressMark(page, "fill", "green");
  const wrapped = await page.evaluate(`(() => {
    const bands = [...document.querySelectorAll(".mark-band")].map((box) => {
      const style = getComputedStyle(box);
      return {
        fragments: box.getClientRects().length,
        words: box.querySelectorAll("[data-word]").length,
        radius: style.borderTopLeftRadius,
        right: style.borderBottomRightRadius,
        fill: style.backgroundColor,
      };
    });
    return {
      count: bands.length,
      words: bands.reduce((total, band) => total + band.words, 0),
      // A word can break at a dash ("yourselves—It"), and a word is the
      // smallest thing a band can stop at, so that one band draws two boxes.
      split: bands.filter((band) => band.fragments > 1).length,
      fills: [...new Set(bands.map((band) => band.fill))],
      round: bands.every((band) => band.radius !== "0px" && band.right !== "0px"),
      radius: bands[0] ? bands[0].radius + " / " + bands[0].right : "none",
    };
  })()`);
  check(
    "a mark that wraps is drawn as one band per line",
    wrapped.count > 1 && wrapped.words === longest[1] && wrapped.split <= 1,
    `${wrapped.count} bands, ${wrapped.words} of ${longest[1]} words, ${wrapped.split} split`
  );
  check(
    "and every line end carries the corners",
    wrapped.round && wrapped.fills.length === 1,
    `${wrapped.radius} in ${wrapped.fills.join(", ")}`
  );

  // A mark beside this one must not cost the wrapped run its line ends: only
  // the line that actually touches the neighbour is flat.
  await selectWords(page, longest[0], 1, 2);
  await pressToolbar(page, "Highlight");
  await pressToolbar(page, "Highlight red");
  const seamed = await page.evaluate(`(() => {
    const green = [...document.querySelectorAll(".mark-band")]
      .filter((box) => getComputedStyle(box).backgroundColor === "rgb(200, 236, 200)");
    const flat = (box, corner) => getComputedStyle(box)[corner] === "0px";
    return {
      count: green.length,
      flatLeft: green.filter((box) => flat(box, "borderTopLeftRadius")).length,
      flatRight: green.filter((box) => flat(box, "borderTopRightRadius")).length,
      radius: green.length ? getComputedStyle(green[green.length - 1]).borderTopRightRadius : "none",
    };
  })()`);
  check(
    "a seam flattens only the line that touches the other mark",
    seamed.count > 1 && seamed.flatLeft <= 1 && seamed.flatRight === 0,
    `${seamed.flatLeft} flat left, ${seamed.flatRight} flat right, of ${seamed.count} bands`
  );
  check("and the far end of the run is still round", seamed.radius !== "0px", seamed.radius);

  // An underline on a washed word has to reach the seam too: its own box stops
  // one band-padding short of it, and a bar carries the ink across. Two words
  // in the middle of a line, so the join is a seam and not a line break.
  const pair = await page.evaluate(`(() => {
    const spans = [...document.querySelectorAll('[data-verse="${longest[0]}"]')];
    const tops = spans.map((span) => Math.round(span.getBoundingClientRect().top));
    for (let i = 1; i < spans.length - 1; i += 1) {
      if (tops[i - 1] === tops[i] && tops[i] === tops[i + 1]) return [i + 1, i + 2];
    }
    return null;
  })()`);
  check("a verse has two words together on one line", Boolean(pair), JSON.stringify(pair));
  await selectWords(page, longest[0], pair[0], pair[0]);
  await pressToolbar(page, "Highlight");
  await pressToolbar(page, "Highlight red");
  await selectWords(page, longest[0], pair[1], pair[1]);
  await pressToolbar(page, "Underline");
  await pressToolbar(page, "Underline blue");
  const bled = await page.evaluate(`(() => {
    const bars = [...document.querySelectorAll(".mark-underline-bleed")];
    return {
      bars: bars.length,
      paint: bars.map((bar) => getComputedStyle(bar).backgroundColor),
      width: bars[0] ? getComputedStyle(bars[0]).width : "none",
    };
  })()`);
  check(
    "a line inked at a seam is carried across the band's padding",
    bled.bars >= 1 && bled.paint.every((paint) => paint === "rgb(71, 132, 192)"),
    `${bled.bars} bar(s) ${bled.width} wide in ${bled.paint.join(", ")}`
  );

  // --- the rail, on a wide screen -----------------------------------------
  // The other half of the navigation: a wide page keeps the library down its
  // left side, where it can be read without covering the words. Its volume
  // title is the menu between standard works, and its chapters say they are
  // chapters.
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await openChapter(page, base, "book=Genesis&chapter=2");
  const rail = await page.evaluate(`(() => {
    const aside = document.querySelector('aside[aria-label="Chapter navigation"]');
    const heading = document.querySelector("main h1");
    const bar = heading?.closest("div.relative");
    const controls = bar ? [...bar.children].map((child) => child.getAttribute("aria-label") ?? ".") : [];
    return {
      present: Boolean(aside),
      top: aside?.querySelector("button")?.textContent.trim() ?? "",
      chapters: [...(aside?.querySelectorAll("ul ul button") ?? [])].slice(0, 3).map((b) => b.textContent.trim()),
      heading: heading?.textContent ?? "",
      menuHidden: (() => {
        const button = heading?.querySelector("button");
        return button ? button.getBoundingClientRect().height === 0 : true;
      })(),
      close: Boolean(document.querySelector('button[aria-label="Close the chapter navigation"]')),
      first: controls[0] ?? "",
      menu: Boolean(document.querySelector('button[aria-label="Chapter menu"]')),
    };
  })()`);
  check("a wide page keeps the library down its left side", rail.present);
  check("the volume title is the rail's menu", rail.top === "Old Testament", rail.top);
  check("with a cross to put it away", rail.close);
  check("the rail names chapters as chapters", rail.chapters[0] === "Chapter 1", rail.chapters.join(", "));
  check("the chapter's name carries no verse count", !rail.heading.includes("verses"), rail.heading);
  check("the chapter menu belongs to the phone", rail.menuHidden);
  check("back leads the bar", rail.first.includes("previous"), rail.first);
  check("the old chapter menu is gone", rail.menu === false);

  await page.evaluate(`document.querySelector('aside[aria-label="Chapter navigation"] button').click()`);
  await page.sleep(400);
  const works = await page.evaluate(`(() => {
    const menu = document.querySelector('[role="menu"][aria-label="Standard works"]');
    return {
      open: Boolean(menu),
      items: [...(menu?.querySelectorAll('[role="menuitemradio"]') ?? [])].map((b) => b.textContent.trim()),
    };
  })()`);
  check("the volume menu opens beside it", works.open);
  check(
    "the standard works are in reading order",
    works.items.join("|") ===
      "Old Testament|New Testament|Book of Mormon|Doctrine and Covenants|Pearl of Great Price",
    works.items.join("|")
  );
  await page.evaluate(`(() => {
    const item = [...document.querySelectorAll('[role="menu"][aria-label="Standard works"] [role="menuitemradio"]')]
      .find((b) => b.textContent.trim() === "New Testament");
    if (!item) throw new Error("no New Testament in the volume menu");
    item.click();
    return true;
  })()`);
  await page.sleep(500);
  const turned = await page.evaluate(`(() => {
    const aside = document.querySelector('aside[aria-label="Chapter navigation"]');
    return {
      books: [...(aside?.querySelectorAll('ul > li > button') ?? [])].slice(0, 2).map((b) => b.textContent.trim()),
      heading: document.querySelector("main h1")?.textContent ?? "",
    };
  })()`);
  check("choosing a work turns the rail to its books", turned.books[0] === "Matthew", turned.books.join(", "));
  check("without moving the chapter being read", turned.heading.includes("Genesis 2"), turned.heading);

  // --- putting the rail away ----------------------------------------------
  // The rail is a tool over the page, and a chapter that wants the whole width
  // can have it: the cross folds the tree into one icon, and that icon brings it
  // back.
  await page.evaluate(`(() => {
    const close = document.querySelector('button[aria-label="Close the chapter navigation"]');
    if (!close) throw new Error("the rail has no close control");
    close.click();
    return true;
  })()`);
  await page.sleep(400);
  const folded = await page.evaluate(`(() => {
    const open = document.querySelector('button[aria-label="Open the chapter navigation"]');
    return {
      tab: Boolean(open),
      words: open ? open.textContent.trim() : "",
      chapters: document.querySelectorAll('aside[aria-label="Chapter navigation"] ul ul button').length,
    };
  })()`);
  check("the rail folds away to one icon", folded.tab && folded.words === "" && folded.chapters === 0, `${folded.tab}/${folded.words}`);
  await page.evaluate(`document.querySelector('button[aria-label="Open the chapter navigation"]').click()`);
  await page.sleep(400);
  const unfolded = await page.evaluate(`document.querySelectorAll('aside[aria-label="Chapter navigation"] ul ul button').length`);
  check("and the icon brings it back", unfolded > 0, `${unfolded} chapter rows`);

  await openChapter(page, base, "book=Doctrine%20and%20Covenants&chapter=1");
  const sections = await page.evaluate(`(() => {
    const aside = document.querySelector('aside[aria-label="Chapter navigation"]');
    return {
      rows: [...(aside?.querySelectorAll("ul > li > button") ?? [])].slice(0, 2).map((b) => b.textContent.trim()),
      named: [...(aside?.querySelectorAll("button") ?? [])].filter(
        (b) => b.textContent.trim() === "Doctrine and Covenants"
      ).length,
      heading: document.querySelector("main h1 button")?.textContent ?? "",
    };
  })()`);
  check("the Doctrine and Covenants numbers sections", sections.rows[0] === "Section 1", sections.rows.join(", "));
  check(
    "its sections are the rail's list, not a book inside it",
    sections.named === 1,
    `the volume's name appears ${sections.named} time(s) in the rail`
  );
  check(
    "and the chapter's bar names it once",
    sections.heading.match(/Doctrine and Covenants/g)?.length === 1,
    sections.heading
  );

  // The same on a phone: one row for the volume, and it opens its sections.
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 430,
    height: 932,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await openChapter(page, base, "book=Doctrine%20and%20Covenants&chapter=1");
  await openPlaceMenu(page);
  const covenantRows = await page.evaluate(`[...document.querySelectorAll('[role="dialog"][aria-label="Choose a chapter"] > div > ul > li > button')].map((b) => b.textContent.trim())`);
  check(
    "the Doctrine and Covenants is one row on a phone, not two",
    covenantRows.join("|") === "Doctrine and Covenants|Scriptures",
    covenantRows.join("|")
  );
  await pressInPlaceMenu(page, "Doctrine and Covenants", 600);
  const covenantGrid = await page.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Choose a chapter"]');
    return {
      head: dialog?.querySelector("p")?.textContent.trim() ?? "",
      tiles: [...(dialog?.querySelectorAll("div.grid button") ?? [])].slice(0, 2).map((b) => b.textContent.trim()),
    };
  })()`);
  check(
    "its row opens straight into the sections",
    covenantGrid.head === "Doctrine and Covenants" && covenantGrid.tiles[0] === "1",
    `${covenantGrid.head}: ${covenantGrid.tiles.join(", ")}`
  );
  await page.evaluate(`document.querySelector('button[aria-label="Close the chapter menu"]')?.click()`);
  await page.sleep(300);
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.sleep(400);

  // --- the reader's chrome --------------------------------------------------
  // A chapter is read, not navigated: the app bar — the mark, the section links,
  // the streak and the gems — is out of the page for the whole visit, from the
  // first frame, and the chapter's own bar is the one at the top of the screen,
  // so a bookmark or a search is always within reach.
  await openChapter(page, base, "book=Genesis&chapter=2");
  const bare = await page.evaluate(`(() => {
    const header = document.querySelector("header.app-header");
    const bar = document.querySelector("main [data-reader-bar]");
    return {
      bare: document.documentElement.dataset.bare === "true",
      header: getComputedStyle(header).display,
      height: Math.round(header.getBoundingClientRect().height),
      bar: Math.round(bar.getBoundingClientRect().top),
      sticky: getComputedStyle(bar).position,
      background: getComputedStyle(bar).backgroundColor,
      rail: Math.round(document.querySelector('aside[aria-label="Chapter navigation"] > div').getBoundingClientRect().top),
    };
  })()`);
  check("the reader puts the app bar away for the visit", bare.bare && bare.header === "none", `${bare.bare} / ${bare.header}`);
  check("and gives its height to the page", bare.height === 0, `${bare.height}px`);
  check("with the chapter's bar at the top", bare.bar === 0 && bare.sticky === "sticky", `${bare.bar} / ${bare.sticky}`);
  check("over the reader's own paper, not the words", bare.background === "rgb(255, 253, 247)", bare.background);
  check("the rail comes up with it", bare.rail > 0 && bare.rail < 40, `${bare.rail}px`);

  // Scrolling is just reading now: the chrome is the same at the top of the
  // chapter and deep down it.
  await page.evaluate(`window.scrollTo({ top: 700, behavior: "instant" })`);
  await page.sleep(500);
  const deep = await page.evaluate(`(() => ({
    header: getComputedStyle(document.querySelector("header.app-header")).display,
    bar: Math.round(document.querySelector("main [data-reader-bar]").getBoundingClientRect().top),
  }))()`);
  check(
    "down the page the chapter bar is still the top of the screen",
    deep.header === "none" && deep.bar === 0,
    `${deep.header} / ${deep.bar}`
  );

  // --- a verse's margin: notes, links, and tags ----------------------------
  // A note or a link is part of a verse's furniture rather than of its prose:
  // the margin keeps one small mark for whatever the verse carries, and that
  // mark reads it in a panel at the page's edge — not the sheet that writes it.
  await openChapter(page, base, "book=Jeremiah&chapter=3&verse=15");
  await page.evaluate(`document.querySelector('[aria-label="Open the notes, links, and tags on verse 15"]')?.click()`);
  await page.sleep(600);
  const notePanel = await page.evaluate(`(() => {
    const panel = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    if (!panel) return null;
    const box = panel.getBoundingClientRect();
    return {
      label: panel.getAttribute("aria-label"),
      text: panel.textContent,
      editing: Boolean(document.querySelector('[aria-label="Your note"]')),
      edge: Math.round(box.right - window.innerWidth),
      width: Math.round(box.width),
    };
  })()`);
  check(
    "the margin mark opens the note beside the words",
    Boolean(notePanel) && notePanel.label.includes("Jeremiah 3:15"),
    notePanel ? notePanel.label : "no panel"
  );
  check(
    "the panel quotes the marked words and reads what was written",
    Boolean(notePanel) &&
      notePanel.text.includes("give you pastors according to mine") &&
      notePanel.text.includes("Trust the promise"),
    notePanel ? notePanel.text.slice(0, 70) : ""
  );
  check("and it is a reading panel, not the editor", Boolean(notePanel) && !notePanel.editing);
  check(
    "a panel at the page's right edge, with the words still in sight",
    Boolean(notePanel) && notePanel.edge === 0 && notePanel.width > 240 && notePanel.width < 500,
    notePanel ? `${notePanel.width}px wide, ${notePanel.edge}px from the edge` : ""
  );

  await escape(page);
  check(
    "Escape puts the panel away",
    (await page.evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label^="Notes and links on"]'))`)) === false
  );

  // A link is found in the library now: the search answers by words or by a
  // reference, the chapter opens under the results, and the verses the link
  // points at are picked out of the text itself. So the mark can point at a
  // range, not only at one verse typed from memory.
  await selectWords(page, 15, 11, 14);
  await pressToolbar(page, "Link");
  check(
    "the panel's Link opens the library search",
    await page.evaluate(`Boolean(document.querySelector("#passage-link-search"))`)
  );

  await page.evaluate(`(() => {
    const box = document.querySelector("#passage-link-search");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, "alma 32");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  const foundResult = await waitFor(
    page,
    `[...document.querySelectorAll('[role="dialog"] ul li button')].some((button) => button.textContent.includes("Alma 32"))`
  );
  check("a reference search finds the chapter in the library", foundResult);

  const openedPreview = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] ul li button')]
      .find((entry) => entry.textContent.includes("Alma 32"));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  const previewed = await waitFor(
    page,
    `Boolean(document.querySelector('[role="listbox"][aria-label="Verses in this passage"]'))`
  );
  const preview = await page.evaluate(`(() => {
    const list = document.querySelector('[role="listbox"][aria-label="Verses in this passage"]');
    const dialog = list ? list.closest('[role="dialog"]') : null;
    return {
      verses: list ? list.querySelectorAll('[role="option"]').length : 0,
      picked: list ? list.querySelectorAll('[role="option"][aria-selected="true"]').length : 0,
      title: dialog ? dialog.textContent.slice(0, 80) : "",
    };
  })()`);
  check(
    "a result opens its chapter to read before linking",
    openedPreview && previewed && preview.verses === 43,
    `${preview.verses} verses`
  );
  check(
    "with the verse that answered the search already picked",
    preview.picked === 1,
    `${preview.picked} picked`
  );

  // Verse 1 came picked because it was the hit; the reader wants 21-22.
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
    "the verses picked in the preview are the link",
    confirmed === "Link Alma 32:21-22",
    confirmed ?? "no confirmation"
  );
  await page.sleep(250);
  check(
    "and the sheet reads back the place it will point at",
    await page.evaluate(
      `[...document.querySelectorAll('[role="dialog"] span')].some((span) => span.textContent.trim() === "Alma 32:21-22")`
    )
  );
  const clearedSearch = await page.evaluate(`document.querySelector("#passage-link-search")?.value ?? null`);
  check(
    "and the search is cleared for the next link",
    clearedSearch === "",
    clearedSearch === null ? "no search box" : JSON.stringify(clearedSearch)
  );
  await page.evaluate(`(() => {
    const save = [...document.querySelectorAll('[role="dialog"] button')]
      .find((button) => button.textContent.trim() === "Save");
    if (!save) throw new Error("no Save button in the annotation sheet");
    save.click();
    return true;
  })()`);
  await page.sleep(1400);
  const linkedInk = await page.evaluate(`(() => {
    const spans = [...document.querySelectorAll('[data-verse="15"]')].slice(10, 14);
    const styles = spans.map((span) => {
      const style = getComputedStyle(span);
      return style.textDecorationLine + "/" + style.textDecorationStyle;
    });
    return {
      styles,
      marker: Boolean(document.querySelector('[aria-label="Open the notes, links, and tags on verse 15"]')),
    };
  })()`);
  check(
    "a link paints no line of its own under the words",
    linkedInk.styles.every((value) => !value.startsWith("underline")),
    linkedInk.styles.join(", ")
  );
  check("and the verse keeps a mark for the link", linkedInk.marker);

  await page.evaluate(`document.querySelector('[aria-label="Open the notes, links, and tags on verse 15"]')?.click()`);
  await page.sleep(1400);
  const collapsedLink = await page.evaluate(`(() => {
    const panel = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    if (!panel) return null;
    return {
      text: panel.textContent,
      folded: panel.querySelector('[aria-label="Show the text of Alma 32:21-22"]')?.getAttribute("aria-expanded") === "false",
    };
  })()`);
  check(
    "the link's mark names the range it points at, folded to the reference",
    Boolean(collapsedLink) &&
      collapsedLink.text.includes("Alma 32:21-22") &&
      collapsedLink.folded &&
      !collapsedLink.text.includes("faith is not to have a perfect knowledge"),
    collapsedLink ? collapsedLink.text.slice(-70) : "no panel"
  );

  // The chevron beside the reference unfolds the verses it names.
  await page.evaluate(`document.querySelector('[aria-label="Show the text of Alma 32:21-22"]')?.click()`);
  await waitFor(
    page,
    `Boolean(document.querySelector('[role="dialog"][aria-label^="Notes and links on"]')?.textContent.includes("faith is not to have a perfect knowledge"))`
  );
  const linkPanel = await page.evaluate(`(() => {
    const panel = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    if (!panel) return null;
    return {
      text: panel.textContent,
      href: [...panel.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? ""),
    };
  })()`);
  check(
    "reading both verses, in the library's own words",
    Boolean(linkPanel) &&
      linkPanel.text.includes("faith is not to have a perfect knowledge") &&
      linkPanel.text.includes("God is merciful unto all who believe on his name"),
    linkPanel ? linkPanel.text.slice(-90) : ""
  );
  check(
    "with a way into the passage at the verses chosen",
    Boolean(linkPanel) &&
      linkPanel.href.some(
        (href) => href.includes("book=Alma") && href.includes("chapter=32") && href.includes("verse=21-22")
      ),
    linkPanel ? linkPanel.href.join(", ") : ""
  );
  await escape(page);

  // --- memorizing the marked words ----------------------------------------
  // The panel's Memorize hands the marked run to the deck picker as a card:
  // the words that were marked, not the whole verse around them.
  await selectWords(page, 19, 1, 6);
  await pressMark(page, "fill", "blue");
  await tapWord(page, 19, 2);
  check(
    "the marking panel offers Memorize with the rest",
    await page.evaluate(
      `[...document.querySelectorAll('[role="toolbar"] button')].some((button) => button.textContent.trim() === "Memorize")`
    )
  );
  await pressToolbar(page, "Memorize");
  await page.sleep(600);
  const deckSheet = await page.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    return {
      text: dialog.textContent,
      firstDeck: Boolean(
        [...dialog.querySelectorAll("button")].find((button) =>
          button.textContent.includes("Make your first deck")
        )
      ),
    };
  })()`);
  check(
    "Memorize opens the deck picker on the mark",
    Boolean(deckSheet) && deckSheet.text.includes("Memorize") && deckSheet.firstDeck,
    deckSheet ? deckSheet.text.slice(0, 60) : "no sheet"
  );
  await page.evaluate(`(() => {
    const make = [...document.querySelectorAll('[role="dialog"] button')]
      .find((button) => button.textContent.includes("Make your first deck"));
    if (!make) throw new Error("no deck to make");
    make.click();
    return true;
  })()`);
  await page.sleep(400);
  await page.evaluate(`(() => {
    const box = document.querySelector("#new-deck-name");
    if (!box) throw new Error("no deck name field");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, "Promises to keep");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    const save = [...box.closest("form").querySelectorAll("button")]
      .find((button) => button.textContent.trim() === "Save");
    if (!save) throw new Error("no Save in the deck form");
    save.click();
    return true;
  })()`);
  await page.sleep(700);
  const card = await page.evaluate(`(() => {
    const list = JSON.parse(localStorage.getItem("gospel-focus:memorize:v1") || "[]");
    return list[0] ?? null;
  })()`);
  check(
    "the card holds the words that were marked, not the whole verse",
    Boolean(card) &&
      card.reference === "Jeremiah 3:19" &&
      card.parts.length === 1 &&
      card.parts[0].text === "But I said, How shall I",
    card ? `${card.reference}: ${card.parts.map((part) => part.text).join(" ")}` : "no card"
  );
  check(
    "and it is filed in the deck that was made for it",
    Boolean(card) && Array.isArray(card.deckIds) && card.deckIds.length === 1,
    card ? JSON.stringify(card.deckIds) : ""
  );

  await page.send("Emulation.clearDeviceMetricsOverride", {});
}
