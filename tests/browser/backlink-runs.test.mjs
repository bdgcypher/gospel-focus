import { openChapter, reset, waitFor } from "./helpers.mjs";

export const name = "backlink runs";

/**
 * A link that points at a run of verses makes one way back, not one per verse.
 *
 * A mark on Moroni 10:4 names James 1:5-6, so a reader opening that run is
 * offered the way back once, beside the verse the run begins at — the rule a
 * mark that crosses verses already follows for its own margin.
 *
 * The record is written straight into the library because it is the shape a
 * reader's library takes: a note or a highlight made in Gospel Library and
 * imported, or a link made on another passage. The rendering is the thing under
 * test, and it is the same however the record arrived.
 */
export async function run({ page, check, base }) {
  await reset(page, base);
  await page.goto(`${base}/`, 1600);

  await page.evaluate(`(async () => {
    const db = await new Promise((res, rej) => {
      const request = indexedDB.open("gospel-focus", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("annotations", { keyPath: "id" });
        store.createIndex("doc", "doc", { unique: false });
      };
      request.onsuccess = () => res(request.result);
      request.onerror = () => rej(request.error);
    });
    const tx = db.transaction("annotations", "readwrite");
    tx.objectStore("annotations").put({
      id: "moro-10-4",
      doc: "bom/moro/10",
      book: "Moroni",
      chapter: "10",
      verse: 4,
      startWord: 1,
      endWord: 3,
      color: "yellow",
      style: "fill",
      links: [{ book: "James", chapter: "1", section: 5, sections: [5, 6], label: "James 1:5-6" }],
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await new Promise((res) => { tx.oncomplete = res; });
    db.close();
    return true;
  })()`);

  await openChapter(page, base, "book=James&chapter=1&verse=5-6", 2600);
  const marked = await waitFor(
    page,
    `(() => {
      const count = (verse) => document.querySelectorAll('[aria-label="Open the notes, links, and tags on verse ' + verse + '"]').length;
      return count(5) === 1 && count(6) === 0;
    })()`,
    20000
  );
  const counts = await page.evaluate(`(() => {
    const count = (verse) => document.querySelectorAll('[aria-label="Open the notes, links, and tags on verse ' + verse + '"]').length;
    return { five: count(5), six: count(6) };
  })()`);
  check(
    "a link naming a run of verses marks the way back once, at the run's first verse",
    marked,
    JSON.stringify(counts)
  );

  await page.evaluate(
    `document.querySelector('[aria-label="Open the notes, links, and tags on verse 5"]')?.click()`
  );
  await page.sleep(700);
  const panel = await page.evaluate(`(() => {
    const box = document.querySelector('[role="dialog"][aria-label^="Notes and links on"]');
    return box ? { label: box.getAttribute("aria-label"), text: box.textContent } : null;
  })()`);
  check(
    "and that one mark carries the way back to the passage",
    Boolean(panel) && panel.label.includes("James 1:5") && panel.text.includes("Moroni 10:4"),
    panel ? panel.label : "no panel"
  );
}
