import { escape, reset, waitFor, writeNote } from "./helpers.mjs";

export const name = "scroll";

/**
 * The scroll: a chapter one verse a screen.
 *
 * The page is checked for the three things that make it a scroll rather than the
 * reader — a screen per verse with one snap each, a mark down the left of the
 * chapter's count, and the verse's own actions — and then the bar's way into it
 * from the reader, and the ways into it from the hub and the study page.
 *
 * The sheet writes on the whole verse here, so the annotation the note and the
 * link leave behind is read back out of the database: it must cover every word
 * of the verse, and the link must join the same mark the note is on rather than
 * making a second one.
 */
export async function run({ page, check, base }) {
  await reset(page, base);
  await page.goto(`${base}/scroll/?book=Genesis&chapter=1&verse=1`, 2800);
  await waitFor(page, `Boolean(document.querySelector('[data-scroll-verse="1"]'))`);

  const opened = await page.evaluate(`(() => {
    const stage = document.querySelector("[data-scroll-stage]");
    const slide = document.querySelector('[data-scroll-verse="1"]');
    const bar = document.querySelector("[data-scroll]");
    return {
      progress: document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress,
      current: document.querySelector("[data-scroll-current]")?.dataset.scrollVerse,
      words: slide?.textContent ?? "",
      stageHeight: stage?.clientHeight ?? 0,
      viewport: window.innerHeight,
      slideHeight: slide?.getBoundingClientRect().height ?? 0,
      scrollHeight: stage?.scrollHeight ?? 0,
      railHeight: document.querySelector("[data-scroll-progress]")?.getBoundingClientRect().height ?? 0,
      ticks: document.querySelector("[data-scroll-progress]")?.children.length ?? 0,
      pages: stage?.querySelectorAll("[data-scroll-page]").length ?? 0,
      edgePages: [...(stage?.querySelectorAll("[data-scroll-edge]") ?? [])].map(
        (page) => page.getAttribute("aria-label")
      ),
      snap: stage ? getComputedStyle(stage).scrollSnapType : "",
      align: slide ? getComputedStyle(slide).scrollSnapAlign : "",
      controls: [...(bar?.querySelectorAll("button, a") ?? [])].map(
        (node) => node.getAttribute("aria-label") ?? ""
      ),
      header: getComputedStyle(document.querySelector(".app-header")).display,
      barTop: Math.round(document.querySelector("[data-scroll]")?.firstElementChild.getBoundingClientRect().top ?? -1),
      where: document.body.textContent.includes("In the beginning God created"),
      tab: document.querySelector('nav[aria-label="Sections and menu"] a[aria-current="page"] [data-nav-label]')?.textContent.trim() ?? "",
    };
  })()`);

  check(
    "the scroll opens on the verse the address names",
    opened.progress === "1 / 31" && opened.current === "1" && opened.where,
    `${opened.progress} / ${opened.current}`
  );
  check(
    "and the bar marks Scroll as the section it is in",
    opened.tab === "Scroll",
    opened.tab || "no current tab"
  );
  check(
    "the reader's own bar comes with it",
    opened.controls.includes("Back to the previous screen") &&
      opened.controls.some((label) => label.startsWith("Where you are")) &&
      opened.controls.includes("Bookmarks") &&
      opened.controls.includes("Search the library"),
    opened.controls.join(" | ")
  );
  check(
    "each verse is a screen with its own snap",
    Math.abs(opened.stageHeight - opened.slideHeight) <= 2 &&
      Math.abs(opened.scrollHeight - opened.stageHeight * opened.pages) <= 4 &&
      opened.snap.includes("mandatory") &&
      opened.align === "start",
    `${opened.slideHeight}/${opened.stageHeight} × ${opened.scrollHeight} / ${opened.snap} ${opened.align}`
  );
  // A chapter's two ends are pages like any other: the last verse of the
  // chapter before and the first verse of the one after. Genesis 1 is the first
  // chapter of its volume, so only the page after it is drawn.
  check(
    "and the chapter after it waits at the foot of the stage as its first verse",
    opened.pages === 32 && opened.edgePages.join(",") === "Genesis 2:1",
    `${opened.pages} pages · ${opened.edgePages.join(",")}`
  );
  check(
    "the scroll puts the app bar away and takes the top of the screen",
    opened.header === "none" && opened.barTop === 0,
    `${opened.header} / ${opened.barTop}px`
  );
  // The page's own height is what makes a verse a screen. Without it the stage
  // sizes itself to its verses, each row grows to the whole chapter, and the
  // words end up thousands of pixels below the middle of a blank page.
  check(
    "and the stage is one screen, not the whole chapter",
    opened.stageHeight > 0 && opened.stageHeight < opened.viewport,
    `${opened.stageHeight}px of ${opened.viewport}px`
  );
  check(
    "the left mark is one tick per verse down the whole stage",
    Math.abs(opened.railHeight - opened.stageHeight) <= 2 && opened.ticks === 31,
    `${opened.railHeight}/${opened.stageHeight} · ${opened.ticks} ticks`
  );

  // --- the reference and the notes mark -------------------------------------
  // Under the words, the reference names the verse and opens it in the reader:
  // the same place read as prose, with the chapter around it.
  const referenceLink = await page.evaluate(`(() => {
    const slide = document.querySelector('[data-scroll-verse="1"]');
    const link = [...slide.querySelectorAll("a")].find((node) =>
      (node.getAttribute("href") ?? "").startsWith("/read")
    );
    if (!link) return null;
    return {
      href: link.getAttribute("href"),
      label: [...link.childNodes].map((node) => node.textContent.trim()).filter(Boolean).join(" "),
      arrow: link.querySelector('[aria-hidden="true"]')?.textContent ?? "",
      keepsWords: slide.textContent.includes("In the beginning God created"),
      ink: getComputedStyle(link).color,
    };
  })()`);
  // The reference is drawn in the same reading gold the notes panel gives one,
  // so the two ends of a link look like one thing rather than two.
  const gold = await page.evaluate(`(() => {
    const probe = document.createElement("span");
    probe.className = "text-accent-strong";
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  })()`);
  check(
    "the verse's reference is a gold link into the reader at that verse, with a little arrow",
    referenceLink?.href === "/read/?book=Genesis&chapter=1&verse=1" &&
      referenceLink.label === "Genesis 1:1 →" &&
      referenceLink.arrow === "→" &&
      referenceLink.keepsWords &&
      referenceLink.ink === gold,
    referenceLink
      ? `${referenceLink.href} · ${referenceLink.label} · ${referenceLink.ink} vs ${gold}`
      : "no reference link"
  );

  // The notes mark is part of the column whether or not the verse has anything
  // to read; with nothing on the verse it is the door to the first note, and it
  // wears no badge until there is something behind it.
  const bareMark = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("[data-scroll] button")].find((node) =>
      (node.getAttribute("aria-label") ?? "").startsWith("Add a note to")
    );
    if (!button) return null;
    return {
      label: button.getAttribute("aria-label"),
      badge: Boolean(button.querySelector("[data-scroll-badge]")),
      target: Math.round(button.getBoundingClientRect().width),
    };
  })()`);
  check(
    "the notes mark stands on the verse's right edge even with nothing to read",
    bareMark?.label === "Add a note to Genesis 1:1" &&
      bareMark.badge === false &&
      bareMark.target >= 44,
    bareMark ? `${bareMark.label} · ${bareMark.target}px · badge=${bareMark.badge}` : "no notes mark"
  );

  // With nothing behind it, the same press is the door to the first note rather
  // than a panel with nothing to read in it.
  await page.evaluate(`(() => {
    [...document.querySelectorAll("[data-scroll] button")]
      .find((node) => (node.getAttribute("aria-label") ?? "").startsWith("Add a note to"))
      ?.click();
    return true;
  })()`);
  check(
    "and pressing it on a bare verse opens the sheet that writes one",
    await waitFor(
      page,
      `document.querySelector("#annotation-title")?.getAttribute("placeholder") === "Genesis 1:1"`
    )
  );
  await escape(page);
  await page.sleep(400);

  // The rows are equal shares of the rail, so the first tick sits at the top
  // and the last at the foot. A rail that grew with its content instead would
  // bunch every tick against the top of the screen.
  const spread = await page.evaluate(`(() => {
    const rail = document.querySelector("[data-scroll-progress]");
    const rows = [...rail.children];
    const box = rail.getBoundingClientRect();
    const first = rows[0].getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    return {
      firstTop: Math.round(first.top - box.top),
      lastBottom: Math.round(box.bottom - last.bottom),
      rowHeight: Math.round(first.height),
    };
  })()`);
  check(
    "the ticks run the whole length of the rail",
    spread.firstTop <= 20 && spread.lastBottom <= 20 && spread.rowHeight > 15,
    `${spread.firstTop} / ${spread.lastBottom} / rows ${spread.rowHeight}px`
  );

  const railNumbers = () =>
    page.evaluate(
      `[...document.querySelectorAll("[data-scroll-progress] [data-scroll-number]")].map((node) => node.textContent.trim())`
    );

  const firstNumbers = await railNumbers();
  check(
    "the rail names the verse under the eye, with the chapter's last verse at its foot",
    firstNumbers.join(",") === "1,31",
    firstNumbers.join(",") || "no numbers"
  );

  // --- one verse at a time --------------------------------------------------
  const scrollToVerse = async (at) => {
    await page.evaluate(
      `(() => { const stage = document.querySelector("[data-scroll-stage]"); stage.scrollTop = stage.clientHeight * ${at}; return true; })()`
    );
    await page.sleep(450);
  };

  await scrollToVerse(1);
  const second = await page.evaluate(`(() => ({
    progress: document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress,
    current: document.querySelector("[data-scroll-current]")?.dataset.scrollVerse,
    words: document.querySelector('[data-scroll-verse="2"]')?.textContent ?? "",
  }))()`);
  check(
    "a swipe moves exactly one verse, and the left mark with it",
    second.progress === "2 / 31" && second.current === "2" && second.words.includes("without form"),
    `${second.progress} / ${second.current}`
  );
  // A flick carries its momentum: without a stop on every page, a hard one
  // runs through several verses before the snap catches it.
  const stops = await page.evaluate(
    `[...document.querySelectorAll("[data-scroll-page]")].map((node) => getComputedStyle(node).scrollSnapStop)`
  );
  check(
    "every page is a stop, so even a hard flick turns one verse",
    stops.length > 1 && stops.every((stop) => stop === "always"),
    stops.join(",")
  );

  await scrollToVerse(10);
  check(
    "the mark reads the verse under the eye",
    (await page.evaluate(`document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress`)) === "11 / 31"
  );
  check(
    "and names it between the chapter's two ends",
    (await railNumbers()).join(",") === "1,11,31",
    (await railNumbers()).join(",")
  );

  // At rest the rail is a ruler rather than a handle: every tick is a hairline,
  // none is pulled out, and the number sits just inside its own tick.
  const rest = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll("[data-scroll-progress] > span")];
    const pull = (at) => {
      const tick = rows[at].firstElementChild;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(tick).transform);
      return Math.round(matrix.m41);
    };
    const label = rows[10].querySelector("[data-scroll-number]");
    return {
      here: pull(10),
      beside: pull(9),
      away: pull(6),
      hereWidth: Math.round(rows[10].firstElementChild.getBoundingClientRect().width),
      otherWidth: Math.round(rows[9].firstElementChild.getBoundingClientRect().width),
      numberLeft: Math.round(label.getBoundingClientRect().left),
      tickRight: Math.round(rows[10].firstElementChild.getBoundingClientRect().right),
      pinned: Boolean(rows[10].querySelector("[data-scroll-pin]")),
    };
  })()`);
  check(
    "at rest the rail lies flat, with the number just inside its tick",
    rest.here === 0 && rest.beside === 0 && rest.away === 0 && rest.numberLeft >= rest.tickRight,
    `${rest.here} / ${rest.beside} / ${rest.away} · ${rest.numberLeft} vs ${rest.tickRight}`
  );
  check(
    "and no tick is drawn thick or pinned until it is held",
    rest.hereWidth === 3 && rest.otherWidth === 3 && !rest.pinned,
    `${rest.hereWidth}px / ${rest.otherWidth}px · pin=${rest.pinned}`
  );

  await scrollToVerse(30);
  check(
    "and the chapter ends on its own last verse",
    (await page.evaluate(`(() => ({
      progress: document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress,
      current: document.querySelector("[data-scroll-current]")?.dataset.scrollVerse,
    }))()`)).progress === "31 / 31"
  );

  // --- the rail as a handle -------------------------------------------------
  // A finger on the rail puts the stage on that row, and a drag runs the
  // chapter at the finger's pace. The numbers follow: the two ends and the
  // verse under the finger.
  await page.evaluate(`(() => {
    const rail = document.querySelector("[data-scroll-progress]");
    const box = rail.getBoundingClientRect();
    const usable = box.height - 32;
    const x = box.left + 20;
    const yFor = (at) => box.top + 16 + ((at + 0.5) / 31) * usable;
    const fire = (type, at) => rail.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: yFor(at),
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      buttons: type === "pointerup" ? 0 : 1,
    }));
    fire("pointerdown", 4);
    fire("pointermove", 12);
    return true;
  })()`);

  // Held, the rail is a handle: the ticks thicken rather than move, and the
  // number rides out into the page on a gold pin that points back at its tick,
  // while the words go soft behind it.
  await page.sleep(350);
  const held = await page.evaluate(`(() => {
    const rail = document.querySelector("[data-scroll-progress]");
    const rows = [...rail.children];
    const pull = (at) => {
      const tick = rows[at].firstElementChild;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(tick).transform);
      return Math.round(matrix.m41);
    };
    const pin = rows[12].querySelector("[data-scroll-pin]");
    const head = rows[12].querySelector("[data-scroll-pin-head]");
    const style = head && getComputedStyle(head);
    const shape = pin?.querySelector("path");
    // The pin's two colours are custom properties; a probe resolves each to the
    // colour the browser actually paints, whatever theme the scenario is in.
    const paint = (token) => {
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      document.body.appendChild(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    };
    const pinBox = pin?.getBoundingClientRect();
    const headBox = head?.getBoundingClientRect();
    const railLeft = Math.round(rail.getBoundingClientRect().left);
    return {
      progress: rail.dataset.scrollProgress,
      holding: rail.dataset.scrollHolding,
      here: pull(12),
      beside: pull(11),
      away: pull(7),
      hereWidth: Math.round(rows[12].firstElementChild.getBoundingClientRect().width),
      otherWidth: Math.round(rows[11].firstElementChild.getBoundingClientRect().width),
      pinLeft: pinBox && Math.round(pinBox.left),
      headLeft: headBox && Math.round(headBox.left),
      headCentre: headBox && Math.round(headBox.left + headBox.width / 2 - railLeft),
      tickRight: Math.round(rows[12].firstElementChild.getBoundingClientRect().right),
      numberSize: style && parseFloat(style.fontSize),
      numberColor: style?.color,
      numberWidth: headBox && Math.round(headBox.width),
      pinFill: shape && getComputedStyle(shape).fill,
      tickColor: getComputedStyle(rows[12].firstElementChild).backgroundColor,
      accent: paint("--accent"),
      contrast: paint("--accent-contrast"),
      filter: getComputedStyle(document.querySelector("[data-scroll-stage]")).filter,
    };
  })()`);
  check(
    "holding the rail thickens it rather than moving it",
    held.progress === "13 / 31" &&
      held.holding === "true" &&
      held.here === 0 &&
      held.beside === 0 &&
      held.away === 0 &&
      held.hereWidth === 7 &&
      held.otherWidth === 5,
    `${held.progress} · ${held.here}/${held.beside}/${held.away} · ${held.hereWidth}px / ${held.otherWidth}px`
  );
  check(
    "and the number rides out on a pin that points back at the rail",
    held.headLeft >= held.tickRight && held.pinLeft < held.headLeft && held.headCentre === 84,
    `${held.pinLeft}..${held.headLeft} vs ${held.tickRight} · head at ${held.headCentre}`
  );
  check(
    "in gold, with the number cut out of the head in contrast",
    held.numberSize >= 15 &&
      held.numberColor === held.contrast &&
      held.pinFill === held.accent &&
      held.numberWidth >= 36,
    `${held.numberSize}px / ${held.numberColor} · pin ${held.pinFill} / ${held.accent} · ${held.numberWidth}px`
  );
  check(
    "its tick wears the same gold",
    held.tickColor === held.accent,
    `${held.tickColor} vs ${held.accent}`
  );
  check(
    "with the page softly out of focus behind it",
    held.filter === "blur(2px)",
    held.filter
  );

  await page.evaluate(`(() => {
    const rail = document.querySelector("[data-scroll-progress]");
    const box = rail.getBoundingClientRect();
    const usable = box.height - 32;
    const x = box.left + 20;
    const y = box.top + 16 + ((12 + 0.5) / 31) * usable;
    rail.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      buttons: 0,
    }));
    return true;
  })()`);
  await page.sleep(500);
  const scrubbed = await page.evaluate(`(() => ({
    progress: document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress,
    current: document.querySelector("[data-scroll-current]")?.dataset.scrollVerse,
    numbers: [...document.querySelectorAll("[data-scroll-progress] [data-scroll-number]")].map((node) => node.textContent.trim()),
    scrollTop: Math.round(document.querySelector("[data-scroll-stage]").scrollTop),
    step: document.querySelector("[data-scroll-stage]").clientHeight,
  }))()`);
  check(
    "dragging the rail puts the verse under the finger on screen",
    scrubbed.progress === "13 / 31" && scrubbed.current === "13" && scrubbed.scrollTop === 12 * scrubbed.step,
    `${scrubbed.progress} / ${scrubbed.current} / ${scrubbed.scrollTop} of ${scrubbed.step}`
  );
  check(
    "and its numbers follow the drag",
    scrubbed.numbers.join(",") === "1,13,31",
    scrubbed.numbers.join(",")
  );

  const released = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll("[data-scroll-progress] > span")];
    const pull = (at) => {
      const tick = rows[at].firstElementChild;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(tick).transform);
      return Math.round(matrix.m41);
    };
    return {
      here: pull(12),
      beside: pull(11),
      filter: getComputedStyle(document.querySelector("[data-scroll-stage]")).filter,
    };
  })()`);
  check(
    "letting go lays the rail flat and gives the page back",
    released.here === 0 && released.beside === 0 && released.filter === "none",
    `${released.here} / ${released.beside} / ${released.filter}`
  );

  // --- favorite -------------------------------------------------------------
  await scrollToVerse(1);
  await page.evaluate(`(() => {
    document.querySelector('[data-scroll] button[aria-label="Favorite Genesis 1:2"]')?.click();
    return true;
  })()`);
  await page.sleep(400);
  const saved = await page.evaluate(`(() => ({
    pressed: document.querySelector('[data-scroll] button[aria-pressed="true"]')?.getAttribute("aria-label"),
    stored: JSON.parse(localStorage.getItem("gospel-focus:favorites:v1") || "[]").map((entry) => entry.reference),
  }))()`);
  check(
    "the heart keeps the verse being looked at",
    saved.pressed === "Remove Genesis 1:2 from favorites" && saved.stored.includes("Genesis 1:2"),
    `${saved.pressed} / ${saved.stored.join(",")}`
  );

  await page.evaluate(`(() => {
    document.querySelector('[data-scroll] button[aria-label="Remove Genesis 1:2 from favorites"]')?.click();
    return true;
  })()`);
  await page.sleep(350);
  check(
    "and takes it back",
    (await page.evaluate(`JSON.parse(localStorage.getItem("gospel-focus:favorites:v1") || "[]").length`)) === 0
  );

  // --- double tap -----------------------------------------------------------
  const doubleTap = async () => {
    await page.evaluate(`(() => {
      const slide = document.querySelector('[data-scroll-verse="2"]');
      const box = slide.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      for (let tap = 0; tap < 2; tap += 1) {
        slide.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerType: "touch", isPrimary: true }));
        slide.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerType: "touch", isPrimary: true }));
      }
      return true;
    })()`);
    await page.sleep(450);
  };

  const favoriteState = () =>
    page.evaluate(`(() => ({
      stored: JSON.parse(localStorage.getItem("gospel-focus:favorites:v1") || "[]").map((entry) => entry.reference),
      pressed: document.querySelector('[data-scroll] button[aria-pressed="true"]')?.getAttribute("aria-label") ?? "",
    }))()`);

  await doubleTap();
  const tapped = await favoriteState();
  check(
    "a double tap on the verse favorites it",
    tapped.stored.includes("Genesis 1:2") && tapped.pressed === "Remove Genesis 1:2 from favorites",
    `${tapped.pressed} / ${tapped.stored.join(",")}`
  );

  // The gesture's own answer: a heart in the middle of the screen, growing and
  // turning before it settles and goes. It is drawn, not spoken, so no part of
  // it reaches the accessibility tree.
  const burst = await page.evaluate(`(() => {
    const node = document.querySelector("[data-scroll-burst]");
    const heart = node?.querySelector("svg");
    if (!node || !heart) return null;
    const style = getComputedStyle(node);
    return {
      animation: style.animationName,
      duration: style.animationDuration,
      width: Math.round(heart.getBoundingClientRect().width),
      hidden: node.getAttribute("aria-hidden"),
    };
  })()`);
  check(
    "and the double tap grows a gold heart in the middle of the screen",
    burst?.animation === "scroll-heart-burst" && burst.duration === "0.9s" && burst.width >= 96 && burst.hidden === "true",
    burst ? `${burst.animation} ${burst.duration} ${burst.width}px` : "no burst"
  );

  await page.sleep(650);
  const faded = await page.evaluate(`(() => {
    const node = document.querySelector("[data-scroll-burst]");
    return node ? Number(getComputedStyle(node).opacity) : null;
  })()`);
  check("and it fades away once it has played", faded === 0, String(faded));

  await doubleTap();
  check(
    "and a second one leaves it kept rather than undoing the first",
    (await favoriteState()).stored.includes("Genesis 1:2")
  );

  await page.evaluate(`(() => {
    document.querySelector('[data-scroll] button[aria-label="Remove Genesis 1:2 from favorites"]')?.click();
    return true;
  })()`);
  await page.sleep(350);
  check(
    "the heart is still the way to take it back",
    (await favoriteState()).stored.length === 0
  );

  await page.evaluate(`(() => {
    const slide = document.querySelector('[data-scroll-verse="2"]');
    const box = slide.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const tap = (type, toY) => slide.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: toY, pointerType: "touch", isPrimary: true }));
    tap("pointerdown", y);
    tap("pointerup", y - 140);
    tap("pointerdown", y);
    tap("pointerup", y);
    return true;
  })()`);
  await page.sleep(450);
  check(
    "but a swipe that ends on a tap is not one",
    (await favoriteState()).stored.length === 0
  );

  // --- the verse's other actions -------------------------------------------
  const openActions = async () => {
    await page.evaluate(`(() => {
      const button = [...document.querySelectorAll("[data-scroll] button")].find((node) =>
        (node.getAttribute("aria-label") ?? "").startsWith("More actions for")
      );
      if (!button) throw new Error("no more-actions button");
      button.click();
      return true;
    })()`);
    await page.sleep(320);
  };

  const pressMenuItem = async (text) => {
    await page.evaluate(`(() => {
      const item = [...document.querySelectorAll('[role="menu"] button')].find((node) =>
        node.textContent.trim().includes(${JSON.stringify(text)})
      );
      if (!item) throw new Error("no menu item: ${text}");
      item.click();
      return true;
    })()`);
    await page.sleep(650);
  };

  await openActions();
  const menuItems = await page.evaluate(`[...document.querySelectorAll('[role="menu"] button')].map((node) => node.querySelector(".truncate")?.textContent.trim() ?? node.textContent.trim())`);
  check(
    "the kebab holds the note, the link, and Memorize",
    menuItems.join(", ") === "Add a note, Link a passage, Memorize" && menuItems.length === 3,
    menuItems.join(", ")
  );

  // --- memorize -------------------------------------------------------------
  await pressMenuItem("Memorize");
  check(
    "Memorize opens the deck picker on the verse",
    await waitFor(page, `document.querySelector("#save-memorize-title")?.textContent.trim() === "Memorize"`)
  );
  await page.evaluate(`(() => {
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((node) => node.textContent.includes("Make your first deck"))
      ?.click();
    return true;
  })()`);
  await page.sleep(300);
  await page.evaluate(`(() => {
    const box = document.querySelector("#new-deck-name");
    if (!box) throw new Error("no deck name field");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, "Scroll deck");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await page.sleep(200);
  await page.evaluate(`(() => {
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((node) => node.textContent.trim() === "Save")
      ?.click();
    return true;
  })()`);
  await page.sleep(900);
  const memorized = await page.evaluate(`(() =>
    JSON.parse(localStorage.getItem("gospel-focus:memorize:v1") || "[]").map((item) => ({
      reference: item.reference,
      parts: (item.parts ?? []).map((part) => part.number),
    }))
  )()`);
  check(
    "and files the verse under the eye as a card",
    memorized.length === 1 &&
      memorized[0].reference === "Genesis 1:2" &&
      memorized[0].parts.join(",") === "2",
    JSON.stringify(memorized)
  );

  // --- a note on the whole verse -------------------------------------------
  await openActions();
  await pressMenuItem("Add a note");
  check(
    "the note item opens the sheet on that verse",
    await waitFor(
      page,
      `Boolean(document.querySelector('[role="dialog"] [aria-label="Your note"]')) && document.querySelector("#annotation-title")?.getAttribute("placeholder") === "Genesis 1:2"`
    )
  );

  await writeNote(
    page,
    '<p>Written from the scroll. See <a href="/read?book=Alma&chapter=32&verse=21">Alma 32:21</a>.</p>'
  );
  await page.sleep(700);

  await openActions();
  await pressMenuItem("Edit note");
  check(
    "the same verse holds the note when the sheet is opened again",
    await waitFor(page, `document.querySelector('[aria-label="Your note"]')?.innerHTML.includes("Written from the scroll")`)
  );
  await escape(page);

  const savedMark = await page.evaluate(`(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("gospel-focus");
      request.onsuccess = () => resolve(request.result);
    });
    return await new Promise((resolve) => {
      const tx = db.transaction("annotations", "readonly");
      const all = tx.objectStore("annotations").getAll();
      all.onsuccess = () =>
        resolve(
          all.result.map((mark) => ({
            doc: mark.doc,
            verse: mark.verse,
            startWord: mark.startWord,
            endWord: mark.endWord,
            color: mark.color,
            note: mark.note,
            links: (mark.links ?? []).map((link) => link.label),
          }))
        );
    });
  })()`);
  check(
    "and the note is written on every word of the verse",
    savedMark.length === 1 &&
      savedMark[0].doc === "ot/gen/1" &&
      savedMark[0].verse === 2 &&
      savedMark[0].startWord === 1 &&
      savedMark[0].endWord > 20 &&
      savedMark[0].color === "clear" &&
      savedMark[0].note.includes("Written from the scroll"),
    JSON.stringify(savedMark)
  );

  // --- a link on the same mark ---------------------------------------------
  await openActions();
  await pressMenuItem("Link a passage");
  check(
    "the link button opens the sheet on the library's search",
    await waitFor(page, `Boolean(document.querySelector("#passage-link-search"))`)
  );
  await page.evaluate(`(() => {
    const box = document.querySelector("#passage-link-search");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(box, "Alma 32");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await waitFor(
    page,
    `[...document.querySelectorAll('[role="dialog"] ul li button')].some((button) => button.textContent.includes("Alma 32"))`
  );
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="dialog"] ul li button')]
      .find((entry) => entry.textContent.includes("Alma 32"));
    if (!button) throw new Error("no Alma 32 result");
    button.click();
    return true;
  })()`);
  await waitFor(page, `Boolean(document.querySelector('[role="listbox"][aria-label="Verses in this passage"]'))`);
  await page.evaluate(`(() => {
    const option = [...document.querySelectorAll('[role="listbox"] [role="option"]')]
      .find((entry) => entry.querySelector("span")?.textContent.trim() === "21");
    if (!option) throw new Error("no verse 21");
    option.click();
    return true;
  })()`);
  await page.sleep(300);
  await page.evaluate(`(() => {
    const link = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim().startsWith("Link Alma 32:"));
    if (!link) throw new Error("no Link button");
    link.click();
    return true;
  })()`);
  await page.sleep(400);
  await page.evaluate(`(() => {
    const save = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim() === "Save");
    save?.click();
    return true;
  })()`);
  await page.sleep(900);

  const withLink = await page.evaluate(`(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("gospel-focus");
      request.onsuccess = () => resolve(request.result);
    });
    return await new Promise((resolve) => {
      const tx = db.transaction("annotations", "readonly");
      const all = tx.objectStore("annotations").getAll();
      all.onsuccess = () =>
        resolve(
          all.result.map((mark) => ({
            verse: mark.verse,
            note: mark.note,
            links: (mark.links ?? []).map((link) => link.label),
          }))
        );
    });
  })()`);
  check(
    "the link joins the verse's note instead of making a second mark",
    withLink.length === 1 &&
      withLink[0].note.includes("Written from the scroll") &&
      withLink[0].links.some((label) => label.startsWith("Alma 32:") && label.includes("21")),
    JSON.stringify(withLink)
  );

  await openActions();
  await pressMenuItem("Link a passage");
  check(
    "and reads back in the sheet",
    await waitFor(
      page,
      `[...document.querySelectorAll('[role="dialog"]')].some((box) => /Alma 32:.*21/.test(box.textContent))`
    )
  );
  await escape(page);

  // --- the notes mark says what the verse carries ---------------------------
  const accentStrong = await page.evaluate(`(() => {
    const probe = document.createElement("span");
    probe.className = "text-accent-strong";
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  })()`);
  const carriedMark = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("[data-scroll] button")].find((node) =>
      (node.getAttribute("aria-label") ?? "").startsWith("Read the notes, links, and tags on")
    );
    if (!button) return null;
    const badge = button.querySelector("[data-scroll-badge]");
    const glyph = button.querySelector(".glyph");
    const box = badge?.getBoundingClientRect();
    const ink = glyph?.getBoundingClientRect();
    return {
      label: button.getAttribute("aria-label"),
      badge: Boolean(badge),
      width: box ? Math.round(box.width) : 0,
      corner: box && ink ? { dx: Math.round(box.right - ink.right), dy: Math.round(box.top - ink.top) } : null,
      tint: glyph ? getComputedStyle(glyph).color : "",
    };
  })()`);
  check(
    "a verse carrying a note and a link wears a badge bubble on its notes mark",
    carriedMark?.label === "Read the notes, links, and tags on Genesis 1:2" &&
      carriedMark.badge === true &&
      carriedMark.width >= 8 &&
      carriedMark.width <= 12 &&
      carriedMark.corner.dx > 0 &&
      carriedMark.corner.dy < 0 &&
      carriedMark.tint === accentStrong,
    carriedMark
      ? `${carriedMark.label} · ${carriedMark.width}px at ${carriedMark.corner.dx}/${carriedMark.corner.dy} · ${carriedMark.tint}`
      : "no badge"
  );

  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("[data-scroll] button")].find((node) =>
      (node.getAttribute("aria-label") ?? "").startsWith("Read the notes, links, and tags on")
    );
    if (!button) throw new Error("no notes mark");
    button.click();
    return true;
  })()`);
  const panelOpen = await waitFor(
    page,
    `Boolean(document.querySelector('[role="dialog"][aria-label="Notes and links on Genesis 1:2"]'))`
  );
  const panelText = panelOpen
    ? await page.evaluate(
        `document.querySelector('[role="dialog"][aria-label^="Notes and links on"]').textContent`
      )
    : "";
  check(
    "and pressing it reads the note and the link back beside the words",
    panelOpen && panelText.includes("Written from the scroll") && /Alma 32/.test(panelText),
    panelOpen ? panelText.replace(/\s+/g, " ").slice(0, 80) : "panel did not open"
  );
  await escape(page);
  await page.sleep(400);

  // --- share ----------------------------------------------------------------
  await page.evaluate(`(() => {
    document.querySelector('[data-scroll] button[aria-label="Share Genesis 1:2"]')?.click();
    return true;
  })()`);
  await page.sleep(650);
  check(
    "the share button opens the verse's card",
    await waitFor(
      page,
      `Boolean(document.querySelector('[role="dialog"][aria-label="Share Passage"]'))`
    )
  );
  await escape(page);

  // --- ways in --------------------------------------------------------------
  await page.goto(`${base}/read/?book=Genesis&chapter=1&verse=7`, 2800);
  const barLink = await page.evaluate(`(() => {
    const link = [...document.querySelectorAll("a")].find(
      (node) => (node.getAttribute("aria-label") ?? "") === "Read this chapter as a scroll"
    );
    return link ? link.getAttribute("href") : null;
  })()`);
  check(
    "the reader's bar offers the same chapter as a scroll",
    barLink === "/scroll/?book=Genesis&chapter=1&verse=7",
    barLink ?? "missing"
  );

  await page.evaluate(`(() => {
    const link = [...document.querySelectorAll("a")].find(
      (node) => (node.getAttribute("aria-label") ?? "") === "Read this chapter as a scroll"
    );
    link?.click();
    return true;
  })()`);
  check(
    "and opens the scroll on the verse the reader was on",
    await waitFor(
      page,
      `document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress === "7 / 31"`
    )
  );

  await page.goto(`${base}/scroll/`, 2800);
  check(
    "a bare scroll continues where the reader left off",
    await waitFor(
      page,
      `document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress === "7 / 31"`
    ),
    await page.evaluate(`document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress`)
  );

  // Where the reading stopped is the verse under the eye, not the verse the
  // visit walked in on: turning a few pages moves the place it comes back to.
  await scrollToVerse(12);
  await page.goto(`${base}/scroll/`, 2800);
  check(
    "and comes back to the verse the reading stopped on, not just the chapter",
    await waitFor(
      page,
      `document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress === "13 / 31"`
    ),
    await page.evaluate(`document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress`)
  );

  // --- the bar's chapter menu ----------------------------------------------
  await page.evaluate(`(() => {
    [...document.querySelectorAll("button")]
      .find((node) => (node.getAttribute("aria-label") ?? "").startsWith("Where you are"))
      ?.click();
    return true;
  })()`);
  await page.sleep(600);
  const menu = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label="Choose a chapter"]');
    const name = [...(box?.querySelectorAll("button") ?? [])].find(
      (node) => node.textContent.trim() === "Genesis"
    );
    if (name) name.click();
    return Boolean(box);
  })()`);
  await page.sleep(600);
  await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label="Choose a chapter"]');
    [...(box?.querySelectorAll("button") ?? [])]
      .find((node) => node.textContent.trim() === "2")
      ?.click();
    return true;
  })()`);
  check(
    "the chapter menu opens the chapter in the scroll, not the reader",
    menu &&
      (await waitFor(
        page,
        `location.pathname === "/scroll/" && location.search.includes("chapter=2") && document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress === "1 / 25"`
      )),
    await page.evaluate(`location.pathname + location.search`)
  );

  await page.goto(`${base}/`, 2600);
  check(
    "the hub gets the app bar back",
    (await page.evaluate(`getComputedStyle(document.querySelector(".app-header")).display`)) !== "none"
  );
  const tabs = await page.evaluate(`(() => {
    const bar = document.querySelector('nav[aria-label="Sections and menu"]');
    const hrefs = [...(bar?.querySelectorAll("a[href]") ?? [])].map((link) => link.getAttribute("href"));
    return {
      labels: [...(bar?.querySelectorAll("[data-nav-label]") ?? [])].map((label) => label.textContent.trim()),
      scroll: hrefs.some((href) => href === "/scroll" || href === "/scroll/"),
      focus: hrefs.some((href) => href === "/focus" || href === "/focus/"),
    };
  })()`);
  check(
    "the bar's last tab is the scroll now",
    tabs.labels.join(",") === "Home,Study,Games,Scroll" && tabs.scroll && !tabs.focus,
    `${tabs.labels.join(",")} / scroll=${tabs.scroll} focus=${tabs.focus}`
  );
  check(
    "the hub has a door to the scroll",
    await page.evaluate(`[...document.querySelectorAll('a')].some((link) => link.getAttribute("href") === "/scroll/")`)
  );

  await page.goto(`${base}/study/`, 2600);
  check(
    "so does the study page",
    await page.evaluate(`[...document.querySelectorAll('a')].some((link) => link.getAttribute("href") === "/scroll/")`)
  );

  // --- the chapter's edges --------------------------------------------------
  // Running out of verses does not stop the reading: the chapter beside this
  // one waits at the end of the stage as a page of its own, so the swipe that
  // passes the last verse is an ordinary page turn — the same snap, the same
  // movement — and the chapter opens once the stage has come to rest on it.
  await page.goto(`${base}/scroll/?book=Genesis&chapter=1&verse=1`, 2800);
  await waitFor(page, `Boolean(document.querySelector('[data-scroll-verse="1"]'))`);
  await scrollToVerse(30);
  const lastPage = await page.evaluate(`(() => {
    const stage = document.querySelector("[data-scroll-stage]");
    const pages = [...stage.querySelectorAll("[data-scroll-page]")];
    const foot = pages[pages.length - 1];
    return {
      step: stage.clientHeight,
      at: Math.round(foot.offsetTop / stage.clientHeight),
      text: foot.textContent,
      label: foot.getAttribute("aria-label"),
    };
  })()`);
  check(
    "the page after the last verse is the next chapter's first",
    lastPage.label === "Genesis 2:1" && lastPage.text.includes("Thus the heavens"),
    `${lastPage.label} · ${lastPage.text.slice(0, 40)}`
  );

  // The turn is that page landing: the stage is carried onto it the way a swipe
  // carries any page into view, and the chapter changes once it has stopped.
  await page.evaluate(
    `(() => { const stage = document.querySelector("[data-scroll-stage]"); stage.scrollTop = stage.clientHeight * ${lastPage.at}; return true; })()`
  );
  check(
    "and a swipe that lands on it opens the next chapter at its first verse",
    await waitFor(
      page,
      `document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress === "1 / 25" && location.search.includes("chapter=2")`
    ),
    await page.evaluate(`location.pathname + location.search`)
  );
  const swipeStage = async (dy) => {
    await page.evaluate(`(() => {
      const stage = document.querySelector("[data-scroll-stage]");
      const box = stage.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const fire = (type, toY) => stage.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: toY,
        pointerId: 5,
        pointerType: "touch",
        isPrimary: true,
        buttons: type === "pointerup" ? 0 : 1,
      }));
      fire("pointerdown", y);
      fire("pointerup", y + (${dy}));
      return true;
    })()`);
    await page.sleep(1500);
  };

  await swipeStage(150);
  check(
    "and swiping down from the first opens the chapter before at its last",
    await waitFor(
      page,
      `document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress === "31 / 31" && location.search.includes("chapter=1")`
    ),
    await page.evaluate(`location.pathname + location.search`)
  );

  // A real touch, not a synthetic pointer. The browser takes a vertical drag
  // for a scroll and cancels the pointer stream as soon as the pan begins, so
  // the turn has to be read from the touch that ends rather than from a
  // pointerup that never comes.
  const stageCentre = await page.evaluate(`(() => {
    const box = document.querySelector("[data-scroll-stage]").getBoundingClientRect();
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
  })()`);
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await page.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: stageCentre.x, y: stageCentre.y + 120 }],
  });
  for (let y = stageCentre.y + 100; y >= stageCentre.y - 140; y -= 20) {
    await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: stageCentre.x, y }] });
    await page.sleep(16);
  }
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.sleep(1600);
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  const touched = await page.evaluate(`({
    search: location.search,
    progress: document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress,
    verses: [...document.querySelectorAll("[data-scroll-verse]")].map((row) => row.getAttribute("data-scroll-verse")).length,
    oneChapter: [...document.querySelectorAll("[data-scroll-verse]")].every((row) => row.getAttribute("aria-label").startsWith("Genesis 2:")),
  })`);
  check(
    "a finger swiping past the last verse turns the chapter too",
    touched.search.includes("chapter=2") && touched.progress === "1 / 25",
    `${touched.search} · ${touched.progress}`
  );
  check(
    "and the stage holds only the chapter it opened",
    touched.verses === 25 && touched.oneChapter,
    `${touched.verses} rows, one chapter=${touched.oneChapter}`
  );

  // --- a short chapter ------------------------------------------------------
  // Each dash is a share of its row rather than a fixed length, so a chapter of
  // two verses keeps a full rail where a 16px dash would have left two small
  // marks at either end of an empty edge.
  await page.goto(`${base}/scroll/?book=Psalms&chapter=117&verse=1`, 2600);
  check(
    "a short chapter opens on its few verses",
    await waitFor(page, `document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress === "1 / 2"`),
    await page.evaluate(`document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress`)
  );
  const shortChapter = await page.evaluate(`(() => {
    const rows = [...document.querySelector("[data-scroll-progress]").children];
    const row = rows[1].getBoundingClientRect();
    const tick = rows[1].firstElementChild.getBoundingClientRect();
    return { rows: rows.length, share: Math.round((tick.height / row.height) * 100) };
  })()`);
  check(
    "and its ticks grow to keep the rail full",
    shortChapter.rows === 2 && shortChapter.share >= 70,
    `${shortChapter.rows} rows · ${shortChapter.share}% of the row`
  );

  // --- the verses that arrive mid-chapter ------------------------------------
  // The chapter before this one is drawn at the head of the stage, so the verse
  // the address names is not the top of the scroll: the pages above it are part
  // of where it sits. Opened at its fifth verse, the stage must be on the fifth.
  await page.goto(`${base}/scroll/?book=Genesis&chapter=2&verse=5`, 2600);
  const midChapter = await page.evaluate(`(() => {
    const stage = document.querySelector("[data-scroll-stage]");
    const head = stage.querySelector('[data-scroll-edge="prev"]');
    return {
      progress: document.querySelector("[data-scroll-progress]")?.dataset.scrollProgress,
      current: document.querySelector("[data-scroll-current]")?.dataset.scrollVerse,
      head: head?.getAttribute("aria-label"),
      page: Math.round(stage.scrollTop / stage.clientHeight),
    };
  })()`);
  check(
    "a chapter with one before it opens on the verse the address names",
    midChapter.progress === "5 / 25" &&
      midChapter.current === "5" &&
      midChapter.head === "Genesis 1:31" &&
      midChapter.page === 5,
    `${midChapter.progress} / ${midChapter.current} / page ${midChapter.page} / ${midChapter.head}`
  );

  // --- a link written into a note ------------------------------------------
  // A note is stored HTML, so a link in it is a plain anchor. Followed as one,
  // it would load a whole document — and the packaged app answers a path it
  // does not route with the home page. The panel hands an in-app link to the
  // router, so the reading goes on in the same page and the way back returns to
  // the verse the note is on.
  await page.goto(`${base}/scroll/?book=Genesis&chapter=1&verse=2`, 2600);
  await waitFor(page, `document.querySelector("[data-scroll-current]")?.dataset.scrollVerse === "2"`);
  await page.evaluate(`(() => {
    const mark = [...document.querySelectorAll("[data-scroll] button")].find((node) =>
      (node.getAttribute("aria-label") ?? "").startsWith("Read the notes")
    );
    mark.click();
    return true;
  })()`);
  const noteLink = await waitFor(
    page,
    `Boolean(document.querySelector('[role="dialog"] .journal-body a[href*="Alma"]'))`
  );
  const panelFoot = await page.evaluate(`(() => {
    const body = document.querySelector(".verse-aside-body");
    const nav = document.querySelector(".app-nav-bottom");
    if (!body || !nav) return null;
    return {
      pad: Math.round(parseFloat(getComputedStyle(body).paddingBottom)),
      nav: Math.round(nav.getBoundingClientRect().height),
    };
  })()`);
  check(
    "the notes panel reserves the bottom bar's height at its foot",
    Boolean(panelFoot) && panelFoot.pad >= panelFoot.nav,
    panelFoot ? `${panelFoot.pad}px for a ${panelFoot.nav}px bar` : "no panel body"
  );

  await page.evaluate(`(() => {
    window.__stayedInPage = true;
    document.querySelector('[role="dialog"] .journal-body a').click();
    return true;
  })()`);
  check(
    "a link written into the note opens the reader at its verse",
    noteLink &&
      (await waitFor(
        page,
        `location.pathname === "/read/" && location.search.includes("book=Alma") && Boolean(document.querySelector('[data-verse="21"]'))`
      )),
    await page.evaluate(`location.pathname + location.search`)
  );
  check(
    "and it is followed in the app rather than loading a new page",
    await page.evaluate(`window.__stayedInPage === true`)
  );
}
