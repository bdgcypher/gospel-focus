import { openChapter, pressMark, reset, selectWords, tapWord } from "./helpers.mjs";

export const name = "mark handles";

/** The marks the app has stored, read from the store it writes to. */
const marks = (page) =>
  page.evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("gospel-focus");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const store = db.transaction("annotations", "readonly").objectStore("annotations");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows
      .map((row) => ({
        verse: row.verse,
        start: row.startWord,
        end: row.endWord,
        color: row.color,
        style: row.style,
        group: row.groupId ?? null,
      }))
      .sort((a, b) => a.verse - b.verse || a.start - b.start);
  })()`);

/** One of a mark's two handles, as it sits on the page. */
const handle = (page, edge) =>
  page.evaluate(`(() => {
    const node = document.querySelector('[data-mark-handle="${edge}"]');
    if (!node) return null;
    const box = node.getBoundingClientRect();
    const drop = node.querySelector("svg")?.getBoundingClientRect();
    const ink = node.querySelector("path");
    return {
      x: +(box.left + box.width / 2).toFixed(1),
      y: box.top + box.height / 2,
      width: +box.width.toFixed(1),
      height: +box.height.toFixed(1),
      drop: drop ? +drop.width.toFixed(1) : 0,
      ink: ink ? getComputedStyle(ink).fill : "",
      visible: getComputedStyle(node).visibility,
      label: node.getAttribute("aria-label"),
    };
  })()`);

/** Where a word's box is, and a point inside it a finger could land on. */
const word = (page, verse, word) =>
  page.evaluate(`(() => {
    const node = [...document.querySelectorAll('[data-verse="${verse}"]')][${word - 1}];
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { left: +box.left.toFixed(1), right: +box.right.toFixed(1), x: box.left + 1, y: box.top + box.height / 2 };
  })()`);

const grab = (page, edge, at) =>
  page.evaluate(`(() => {
    document.querySelector('[data-mark-handle="${edge}"]')
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, clientX: ${at.x}, clientY: ${at.y} }));
    return true;
  })()`);

const dragTo = (page, at) =>
  page.evaluate(`(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: ${at.x}, clientY: ${at.y} }));
    return true;
  })()`);

/**
 * Let go where the finger is — over a word, as a real release does.
 *
 * That matters: the reader treats a lift over the words as a tap and closes the
 * mark, so a release aimed at `window` would hide the very bug this covers.
 */
const release = (page, at) =>
  page.evaluate(`(() => {
    const target = document.elementFromPoint(${at?.x ?? 0}, ${at?.y ?? 0}) ?? window;
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    return true;
  })()`);

const underline = (page, verse, number) =>
  page.evaluate(
    `getComputedStyle([...document.querySelectorAll('[data-verse="${verse}"]')][${number - 1}]).textDecorationLine`
  );

/**
 * Adjusting the ends of a run of words.
 *
 * Two runs get handles. A mark already on the page is opened with a tap and its
 * two ends can be dragged; a fresh selection has the same handles before any
 * mark exists, so the words can be trimmed or stretched before a colour is
 * chosen. The checks are about the things a drag can get wrong: where the
 * handles are (on the run's own first and last word), what the words show while
 * the finger is still down (the new extent, with nothing written yet), and what
 * is left in the store once it is let go — including a run that grows into the
 * next verse, which is one mark stored as two annotations sharing a group.
 */
export async function run({ page, check, base }) {
  await reset(page, base);
  await openChapter(page, base, "book=Jeremiah&chapter=3&verse=15");

  await selectWords(page, 15, 1, 4);
  await pressMark(page, "underline", "red");

  check("a mark on its own has no handles", (await handle(page, "end")) === null);

  // Tapping the mark opens the panel, and the handles with it.
  await tapWord(page, 15, 2);
  const start = await handle(page, "start");
  const end = await handle(page, "end");
  const first = await word(page, 15, 1);
  const fourth = await word(page, 15, 4);

  check("an open mark has two handles", Boolean(start && end), `${Boolean(start)}/${Boolean(end)}`);
  check("they are drawn", start?.visible === "visible" && end?.visible === "visible");
  // A handle is grabbed with a thumb, under the words, while the page is being
  // read — so it has to be a target a thumb can find, not a dot to aim at.
  check(
    "each handle is a thumb's target",
    start?.width >= 44 && start?.height >= 44 && end?.width >= 44 && end?.height >= 44,
    `${start?.width}×${start?.height} and ${end?.width}×${end?.height}`
  );
  check("and the drop drawn inside it is a size to see", start?.drop >= 28, `${start?.drop}px`);
  // One colour in every colour of mark: the handles here are on a *red* mark,
  // and a handle is the app's control rather than part of what it marks.
  const handleInk = await page.evaluate(`(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--handle)";
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  })()`);
  check(
    "the drop is drawn in the handle's own colour, not the mark's",
    start?.ink === handleInk && handleInk !== "rgb(204, 90, 80)",
    `${start?.ink} vs ${handleInk}`
  );
  check(
    "the start handle is on the mark's first word",
    start ? Math.abs(start.x - first.left) <= 1 : false,
    `${start?.x} vs ${first.left}`
  );
  check(
    "the end handle is on the mark's last word",
    end ? Math.abs(end.x - fourth.right) <= 1 : false,
    `${end?.x} vs ${fourth.right}`
  );

  // --- the far edge, dragged out to word 8 --------------------------------
  const eighth = await word(page, 15, 8);
  await grab(page, "end", end);
  await dragTo(page, eighth);
  await page.sleep(160);

  check("the new words are painted before the finger lifts", (await underline(page, 15, 8)) === "underline");
  const during = await marks(page);
  check(
    "the drag itself writes nothing",
    during.length === 1 && during[0].end === 4,
    JSON.stringify(during)
  );

  await release(page, eighth);
  await page.sleep(600);
  const stretched = await marks(page);
  check(
    "letting go stores the wider mark",
    stretched[0]?.start === 1 && stretched[0]?.end === 8,
    JSON.stringify(stretched)
  );
  check("the words it reached stay painted", (await underline(page, 15, 8)) === "underline");
  check(
    "lifting a finger over a word does not close the mark",
    (await handle(page, "end"))?.visible === "visible"
  );

  // --- the near edge, pulled in to word 3 ---------------------------------
  const third = await word(page, 15, 3);
  const endNow = await handle(page, "end");
  await grab(page, "start", await handle(page, "start"));
  await dragTo(page, third);
  await page.sleep(120);
  await release(page, third);
  await page.sleep(600);

  const trimmed = await marks(page);
  check(
    "the start edge moves on its own",
    trimmed[0]?.start === 3 && trimmed[0]?.end === 8,
    JSON.stringify(trimmed)
  );
  check("the words it left are clear again", (await underline(page, 15, 1)) === "none");
  check("the words it kept are still marked", (await underline(page, 15, 3)) === "underline");
  check(
    "the end handle has not moved",
    endNow ? Math.abs((await handle(page, "end")).x - endNow.x) <= 1 : false
  );


  // --- across the verse break --------------------------------------------
  const into = await word(page, 16, 2);
  await grab(page, "end", await handle(page, "end"));
  await dragTo(page, into);
  await page.sleep(140);
  await release(page, into);
  await page.sleep(700);

  const across = await marks(page);
  check("a run across verses is two annotations", across.length === 2, JSON.stringify(across));
  check("the first verse ends where it should", across[0]?.verse === 15 && across[0]?.end === 18, JSON.stringify(across[0]));
  check(
    "the second verse takes the rest from its first word",
    across[1]?.verse === 16 && across[1]?.start === 1 && across[1]?.end === 2,
    JSON.stringify(across[1])
  );
  check("the two are one mark", Boolean(across[0]?.group) && across[0]?.group === across[1]?.group);
  check("the next verse is painted too", (await underline(page, 16, 2)) === "underline");
  check("and it is still one mark to open", Boolean(await handle(page, "end")));

  // --- a fresh selection, before any mark exists --------------------------
  const before = (await marks(page)).length;
  await page.evaluate(`document.getElementById("verse-20").scrollIntoView({ block: "center" })`);
  await page.sleep(400);
  await selectWords(page, 20, 3, 6);
  await page.sleep(320);

  const picked = await handle(page, "start");
  const pickedEnd = await handle(page, "end");
  check("a selection has handles before it is a mark", Boolean(picked && pickedEnd));
  check(
    "and they say what they belong to",
    picked?.label === "Start of the selection" && pickedEnd?.label === "End of the selection",
    `${picked?.label}/${pickedEnd?.label}`
  );

  const pickedFirst = await word(page, 20, 3);
  const pickedLast = await word(page, 20, 6);
  check(
    "the start handle is on the selection's first word",
    picked ? Math.abs(picked.x - pickedFirst.left) <= 1 : false,
    `${picked?.x} vs ${pickedFirst.left}`
  );
  check(
    "the end handle is on its last word",
    pickedEnd ? Math.abs(pickedEnd.x - pickedLast.right) <= 1 : false,
    `${pickedEnd?.x} vs ${pickedLast.right}`
  );

  // The selection is the app's own: the words it covers are washed by the
  // stylesheet, and the browser's selection is gone so the platform's handles
  // and menu cannot sit over the panel's.
  const pickedWords = await page.evaluate(
    `[...document.querySelectorAll('[data-verse="20"][data-selected]')].map((node) => Number(node.dataset.word))`
  );
  check("the app paints the words it selected", pickedWords.join(",") === "3,4,5,6", pickedWords.join(","));
  check("and the browser's own selection is gone", await page.evaluate(`window.getSelection().isCollapsed`));

  // Stretch the far edge to word 9: the selection grows, nothing is written.
  const ninth = await word(page, 20, 9);
  await grab(page, "end", pickedEnd);
  await page.sleep(140);
  await dragTo(page, ninth);
  await page.sleep(200);
  const grown = await page.evaluate(
    `[...document.querySelectorAll('[data-verse="20"][data-selected]')].map((node) => Number(node.dataset.word))`
  );
  check("the selection itself is what grows", grown.join(",") === "3,4,5,6,7,8,9", grown.join(","));
  check("and still nothing is stored", (await marks(page)).length === before, String((await marks(page)).length));

  await release(page, ninth);
  await page.sleep(500);
  check(
    "letting go keeps the selection open",
    (await handle(page, "end"))?.visible === "visible"
  );

  // Colour it, and the mark is exactly the run that was dragged.
  await pressMark(page, "highlight", "yellow");
  await page.sleep(600);
  const drawn = (await marks(page)).find((mark) => mark.color === "yellow");
  check(
    "the colour marks the dragged extent, not the first one",
    drawn?.verse === 20 && drawn?.start === 3 && drawn?.end === 9,
    JSON.stringify(drawn)
  );
}
