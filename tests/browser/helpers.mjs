/**
 * The moves every scenario makes, written once.
 *
 * Nothing here hides the app's behaviour: each helper is the finger — a
 * selection dragged over the words, a button pressed, a file handed to the
 * picker — and each returns what the page then shows. Assertions stay in the
 * scenarios.
 */

/** Clear everything the app keeps, so a scenario starts on a fresh device. */
export async function reset(page, base) {
  await page.goto(`${base}/`, 1500);
  await page.evaluate(`(async () => {
    try { localStorage.clear(); } catch {}
    // Only open the database if the app made one. Opening it here on a fresh
    // profile would create a version-1 database with no stores, and the app's
    // own upgrade would never run — every write would fail with "object store
    // not found", which is a bug in the test rather than in the app.
    const listed = indexedDB.databases ? await indexedDB.databases() : [];
    if (!listed.some((entry) => entry.name === "gospel-focus")) return true;

    await new Promise((resolve) => {
      const request = indexedDB.open("gospel-focus");
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("annotations")) { db.close(); return resolve(); }
        const tx = db.transaction("annotations", "readwrite");
        tx.objectStore("annotations").clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => { db.close(); resolve(); };
      };
      request.onerror = () => resolve();
    });
    return true;
  })()`);
}

/** Open the reader on a citation or a place, and wait for the chapter. */
export async function openChapter(page, base, query, wait = 2400) {
  await page.goto(`${base}/read/?${query}`, wait);
}

/**
 * Open the reader's one menu.
 *
 * The library, the chapter grid and this chapter's marks live behind a single
 * control so the page keeps its width for the words; everything they used to be
 * pressed from is reached through here.
 */
export async function openChapterMenu(page) {
  await page.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Chapter menu"]');
    if (!button) throw new Error("the reader has no chapter menu");
    button.click();
    return true;
  })()`);
  await page.sleep(450);
}

/** Press the words of one verse, the way a thumb does. */
export async function tapWord(page, verse, word) {
  await page.evaluate(`(() => {
    const span = [...document.querySelectorAll('[data-verse="${verse}"]')][${word - 1}];
    if (!span) throw new Error("no word ${verse}:${word}");
    span.click();
    return true;
  })()`);
  await page.sleep(420);
}

/** Drag a selection over words of one verse, the way a finger does. */
export async function selectWords(page, verse, from, to) {
  await page.evaluate(`(() => {
    const spans = [...document.querySelectorAll('[data-verse="${verse}"]')].slice(${from - 1}, ${to});
    if (!spans.length) throw new Error("no words at verse ${verse} ${from}-${to}");
    const range = document.createRange();
    range.setStartBefore(spans[0]);
    range.setEndAfter(spans[spans.length - 1]);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return true;
  })()`);
  await page.sleep(340);
}

/** The toolbar's button with this label, pressed. */
export async function pressToolbar(page, label) {
  await page.evaluate(`(() => {
    // A colour swatch says its name twice — once in the label, once in the
    // screen-reader text inside it — and an underline swatch says "U" but is
    // labelled with its colour. Both count as the name.
    const button = [...document.querySelectorAll('[role="toolbar"] button')]
      .find((entry) => entry.textContent.includes(${JSON.stringify(label)}) || (entry.getAttribute("aria-label") ?? "").includes(${JSON.stringify(label)}));
    if (!button) throw new Error("no toolbar button: ${label}");
    button.click();
    return true;
  })()`);
  await page.sleep(360);
}

/**
 * Mark the selected words: choose the style tab, then a colour.
 *
 * The panel draws the two things a mark can be as two "A" tabs, and the palette
 * under them in the style being chosen — so a mark is always two presses.
 */
export async function pressMark(page, style, colour) {
  await pressToolbar(page, style === "underline" ? "Underline" : "Highlight");
  await pressToolbar(page, colour);
}

/** Close the marking panel the way a keyboard would. */
export async function escape(page) {
  await page.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  })()`);
  await page.sleep(320);
}

/** Press the last word of a verse — for a mark that ends at the verse's edge. */
export async function tapLastWord(page, verse) {
  await page.evaluate(`(() => {
    const spans = [...document.querySelectorAll('[data-verse="${verse}"]')];
    if (!spans.length) throw new Error("no verse ${verse}");
    spans[spans.length - 1].click();
    return true;
  })()`);
  await page.sleep(420);
}

/** A button anywhere on the page whose words include this text. */
export async function press(page, text, wait = 400) {
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((entry) => entry.textContent.includes(${JSON.stringify(text)}));
    if (!button) throw new Error("no button: ${text}");
    button.click();
    return true;
  })()`);
  await page.sleep(wait);
}

/** Write a note in the open annotation sheet and save it. */
export async function writeNote(page, html) {
  await page.evaluate(`(() => {
    const box = document.querySelector('[aria-label="Your note"]');
    if (!box) throw new Error("the note sheet isn't open");
    box.focus();
    box.innerHTML = ${JSON.stringify(html)};
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await page.sleep(150);
  await page.evaluate(`(() => {
    const save = [...document.querySelectorAll('[role="dialog"] button')]
      .find((entry) => entry.textContent.trim() === "Save");
    if (!save) throw new Error("no Save button");
    save.click();
    return true;
  })()`);
  await page.sleep(500);
}

/** The computed background of the nth word span of a verse. */
export function fillOf(page, verse, index = 0) {
  return page.evaluate(
    `getComputedStyle([...document.querySelectorAll('[data-verse="${verse}"]')][${index}]).backgroundColor`
  );
}

/** How legible a word is, by the colours the browser actually painted. */
export function contrastOf(page, verse, index = 0) {
  return page.evaluate(`(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const paint = (colour, over) => {
      ctx.fillStyle = over;
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const lum = ([r, g, b]) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const span = [...document.querySelectorAll('[data-verse="${verse}"]')][${index}];
    if (!span) return 0;
    const style = getComputedStyle(span);
    const page = getComputedStyle(document.documentElement).backgroundColor || "#fffdf7";
    const backdrop = document.documentElement.classList.contains("dark") ? "#111111" : page;
    const bg = lum(paint(style.backgroundColor, backdrop));
    const fg = lum(paint(style.color, backdrop));
    const [hi, lo] = [bg, fg].sort((a, b) => b - a);
    return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
  })()`);
}

/**
 * Catch the file the app would download.
 *
 * The export path is a blob URL plus a synthetic click, so the test stands in
 * front of both: the blob's text is fetched before the anchor is allowed to do
 * anything, and nothing is written to the temp profile.
 */
export async function captureExport(page) {
  await page.evaluate(`(() => {
    window.__exported = null;
    window.__exportedName = null;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      fetch(url).then((response) => response.text()).then((text) => { window.__exported = text; });
      return url;
    };
    HTMLAnchorElement.prototype.click = function () { window.__exportedName = this.download; };
    return true;
  })()`);
}

/** Press "Export to file" inside the Marks & notes card. */
export async function pressExport(page) {
  await page.evaluate(`(() => {
    const title = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === "Marks & notes");
    if (!title) throw new Error("the marks panel isn't on this page");
    const card = title.closest("div.rounded-3xl");
    const button = [...card.querySelectorAll("button")].find((b) => b.textContent.includes("Export to file"));
    if (!button) throw new Error("no export button");
    if (button.disabled) throw new Error("the export button is disabled");
    button.click();
    return true;
  })()`);
  await page.sleep(1100);
  return page.evaluate(`window.__exported`);
}

/** Hand a file to the marks panel's import input. */
export async function importFile(page, file) {
  const document = await page.send("DOM.getDocument", {});
  const input = await page.send("DOM.querySelector", {
    nodeId: document.result.root.nodeId,
    selector: 'input[aria-label="Gospel Library annotations file to import"]',
  });
  if (!input.result?.nodeId) throw new Error("the import input isn't on this page");
  await page.send("DOM.setFileInputFiles", { nodeId: input.result.nodeId, files: [file] });
  await page.sleep(2400);
}
