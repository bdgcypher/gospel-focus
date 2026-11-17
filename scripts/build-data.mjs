/**
 * Build the bundled passage dataset for "Gospel Focus".
 *
 * Sources:
 *  - Standard Works (public domain, 2013 edition): https://github.com/bcbooks/scriptures-json
 *  - General conference talks (1971-2018): https://github.com/johnmwood/LDS-Conference-Scraper
 *  - General conference talks (2019 on): the Church's own content API, through
 *    scripts/build-conference.mjs
 *
 * Output (written to public/data):
 *  - manifest.json                      lightweight index used for filtering/picking
 *  - scriptures/<volume>.json           full verse text, lazily loaded per volume
 *  - conference/<year>-<month>.json     talk paragraphs, lazily loaded per conference
 *  - search.snapshot                    the full-text index /search queries
 *  - words.json                         four-to-six-letter words, for the daily puzzle
 *
 * Run: node scripts/build-data.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSearchIndex } from "./search-index.mjs";
import { buildWordList } from "./build-words.mjs";
import { buildCfm, cfmYears } from "./build-cfm.mjs";
import { buildChurchConferences, CONFERENCE_API_FROM_YEAR, CONFERENCE_SOURCE } from "./build-conference.mjs";
import { buildScrapedConferences } from "./conference-scraper.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");

// In reading order, which is the order every list in the app presents:
// Old Testament, New Testament, Book of Mormon, Doctrine and Covenants, Pearl
// of Great Price. The manifest is built in this order so a consumer that does
// not sort still shows the right one.
const SCRIPTURE_VOLUMES = [
  { id: "ot", file: "old-testament.json", title: "Old Testament", kind: "books" },
  { id: "nt", file: "new-testament.json", title: "New Testament", kind: "books" },
  { id: "bom", file: "book-of-mormon.json", title: "Book of Mormon", kind: "books" },
  { id: "dc", file: "doctrine-and-covenants.json", title: "Doctrine and Covenants", kind: "sections" },
  { id: "pgp", file: "pearl-of-great-price.json", title: "Pearl of Great Price", kind: "books" },
];

const SCRIPTURE_BASE = "https://raw.githubusercontent.com/bcbooks/scriptures-json/master/";

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

async function buildScriptures() {
  const manifest = [];
  await fs.mkdir(path.join(DATA_DIR, "scriptures"), { recursive: true });

  for (const vol of SCRIPTURE_VOLUMES) {
    const raw = JSON.parse(await fetchText(SCRIPTURE_BASE + vol.file));
    const volumeSlug = raw.lds_slug; // e.g. "bofm", "dc-testament/dc", "pgp", "ot", "nt"
    let books;
    if (vol.kind === "sections") {
      const chapters = raw.sections.map((sec) => ({
        n: sec.section,
        verses: (sec.verses || []).map((v) => clean(v.text)),
      }));
      books = [{ name: "Doctrine and Covenants", fullTitle: "The Doctrine and Covenants", slug: "dc", path: volumeSlug, order: 0, chapters }];
    } else {
      books = raw.books.map((b, bookIndex) => ({
        name: b.book,
        fullTitle: b.full_title || b.book,
        slug: b.lds_slug,
        path: `${volumeSlug}/${b.lds_slug}`,
        order: bookIndex,
        chapters: (b.chapters || []).map((c) => ({
          n: c.chapter,
          verses: (c.verses || []).map((v) => clean(v.text)),
        })),
      }));
    }

    const versesTotal = books.reduce((a, b) => a + b.chapters.reduce((x, c) => x + c.verses.length, 0), 0);
    const chaptersTotal = books.reduce((a, b) => a + b.chapters.length, 0);

    const payload = { id: vol.id, title: vol.title, subtitle: raw.subtitle || "", volumeSlug, books };
    await fs.writeFile(path.join(DATA_DIR, "scriptures", `${vol.id}.json`), JSON.stringify(payload));

    manifest.push({
      id: vol.id,
      title: vol.title,
      subtitle: raw.subtitle || "",
      url: `data/scriptures/${vol.id}.json`,
      chapters: chaptersTotal,
      verses: versesTotal,
      books: books.map((b) => ({
        name: b.name,
        slug: b.slug,
        chapters: b.chapters.length,
        verses: b.chapters.reduce((x, c) => x + c.verses.length, 0),
      })),
    });
    console.log(`  ${vol.id.padEnd(4)} ${books.length} books, ${chaptersTotal} chapters, ${versesTotal} verses`);
  }
  return manifest;
}

async function main() {
  // Only the two directories this script regenerates are cleared. `cfm/` is
  // fetched from a site rather than a dataset in this repo, and a fetch that
  // fails should not take the committed weeks with it — the new schedule is
  // written over the old one once it is in hand.
  await fs.rm(path.join(DATA_DIR, "scriptures"), { recursive: true, force: true });
  await fs.rm(path.join(DATA_DIR, "conference"), { recursive: true, force: true });
  console.log("Building scripture data...");
  const volumes = await buildScriptures();
  console.log("Building conference data...");
  const conferences = await buildScrapedConferences({ dataDir: DATA_DIR });
  // The scraper stops at October 2018; the Church's own API carries the rest.
  console.log("Building conference data from the Church's content API...");
  const recent = await buildChurchConferences({ dataDir: DATA_DIR, fromYear: CONFERENCE_API_FROM_YEAR });
  const allConferences = [...conferences, ...recent].sort((a, b) => a.id.localeCompare(b.id));
  // After the scriptures, because the schedule is checked against the library
  // that just shipped: a week may only name chapters this build can open.
  console.log("Building the Come, Follow Me schedule...");
  const cfm = await buildCfm({ years: cfmYears(), volumes });
  const manifest = {
    generatedAt: new Date().toISOString(),
    sources: {
      scriptures: { name: "bcbooks/scriptures-json", url: "https://github.com/bcbooks/scriptures-json", license: "Public domain (2013 edition)" },
      conference: CONFERENCE_SOURCE,
    },
    volumes,
    conferences: allConferences,
    cfm: {
      years: cfm.map((year) => year.year),
      source: {
        name: "Come, Follow Me",
        url: "https://www.churchofjesuschrist.org/study/manual",
        note: "Week dates and chapter ranges, read from the Church's public content API. No lesson text is reproduced.",
      },
    },
  };
  await fs.writeFile(path.join(DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  // Last, and from what has just been written rather than from the structures
  // above: the index is a reader of the passage data, so it can only ever
  // describe what actually shipped.
  console.log("Building the search index...");
  await buildSearchIndex({ dataDir: DATA_DIR });
  // The daily puzzle's vocabulary is read out of the same written files, for the
  // same reason: what ships is what the build describes.
  console.log("Building the word list...");
  await buildWordList({ dataDir: DATA_DIR });
  console.log("Written to public/data");
}

main().catch((err) => { console.error(err); process.exit(1); });
