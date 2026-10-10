/**
 * Build the bundled passage dataset for "Open to Inspiration".
 *
 * Sources:
 *  - Standard Works (public domain, 2013 edition): https://github.com/bcbooks/scriptures-json
 *  - General conference talks (2018 and earlier): https://github.com/johnmwood/LDS-Conference-Scraper
 *
 * Output (written to public/data):
 *  - manifest.json                      lightweight index used for filtering/picking
 *  - scriptures/<volume>.json           full verse text, lazily loaded per volume
 *  - conference/<year>-<month>.json     talk paragraphs, lazily loaded per conference
 *
 * Run: node scripts/build-data.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");

// Conference years to bundle. The scraper dataset ends at October 2018.
const CONFERENCE_MIN_YEAR = 2014;

const SCRIPTURE_VOLUMES = [
  { id: "bom", file: "book-of-mormon.json", title: "Book of Mormon", kind: "books" },
  { id: "dc", file: "doctrine-and-covenants.json", title: "Doctrine and Covenants", kind: "sections" },
  { id: "pgp", file: "pearl-of-great-price.json", title: "Pearl of Great Price", kind: "books" },
  { id: "nt", file: "new-testament.json", title: "New Testament", kind: "books" },
  { id: "ot", file: "old-testament.json", title: "Old Testament", kind: "books" },
];

const SCRIPTURE_BASE = "https://raw.githubusercontent.com/bcbooks/scriptures-json/master/";
const CONFERENCE_CSV =
  "https://raw.githubusercontent.com/johnmwood/LDS-Conference-Scraper/master/conference_talks.csv";

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

/** Minimal RFC 4180 CSV parser (handles quoted fields, escaped quotes and embedded newlines). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = null;
  let i = 0;
  const n = text.length;
  const pushField = () => { row.push(field); field = null; };
  while (i < n) {
    if (field === null) {
      if (text[i] === '"') {
        i++;
        const buf = [];
        for (;;) {
          const q = text.indexOf('"', i);
          if (q < 0) { buf.push(text.slice(i)); i = n; break; }
          if (text[q + 1] === '"') { buf.push(text.slice(i, q + 1)); i = q + 2; continue; }
          buf.push(text.slice(i, q)); i = q + 1; break;
        }
        field = buf.join("");
        continue;
      }
      field = "";
    }
    let j = i;
    while (j < n) { const ch = text[j]; if (ch === "," || ch === "\n" || ch === "\r") break; j++; }
    field += text.slice(i, j);
    i = j;
    if (i < n && text[i] === "\r") i++;
    if (i < n && text[i] === ",") { pushField(); i++; continue; }
    if (i < n && text[i] === "\n") { pushField(); rows.push(row); row = []; i++; continue; }
    if (i >= n) { pushField(); rows.push(row); break; }
  }
  return rows;
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

function splitParagraphs(text) {
  // The scraper concatenates a talk into one blob. Split on sentence groups into
  // readable paragraphs of roughly 2-4 sentences so "random section" is digestible.
  const normalized = clean(text);
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?]+[.!?]+["\u201d\u2019)]?|\S[^.!?]*$/g) || [normalized];
  const paragraphs = [];
  let buf = [];
  for (const s of sentences) {
    buf.push(clean(s));
    // break after a sentence when the accumulating paragraph is long enough
    if (buf.join(" ").length >= 320) { paragraphs.push(buf.join(" ")); buf = []; }
  }
  if (buf.length) paragraphs.push(buf.join(" "));
  return paragraphs.filter((p) => p.length > 40);
}

async function buildConference() {
  console.log("  downloading conference CSV...");
  const csv = await fetchText(CONFERENCE_CSV);
  const rows = parseCSV(csv);
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  await fs.mkdir(path.join(DATA_DIR, "conference"), { recursive: true });
  const groups = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const conference = clean(r[idx.conference]);
    const m = conference.match(/(\w+)\s+(\d{4})/);
    if (!m) continue;
    const year = Number(m[2]);
    if (year < CONFERENCE_MIN_YEAR) continue;
    const monthName = m[1].toLowerCase();
    const month = monthName.startsWith("april") ? 4 : monthName.startsWith("oct") ? 10 : 0;
    if (!month) continue;

    const url = clean(r[idx.url])
      .replace("https://www.lds.org/", "https://www.churchofjesuschrist.org/study/")
      .replace("https://lds.org/", "https://www.churchofjesuschrist.org/study/");
    const talkBlob = r[idx.talk] || "";
    if (!talkBlob || talkBlob.length < 200) continue;

    let speaker = clean(r[idx.speaker]);
    const calling = clean(r[idx.calling]);
    if (calling && speaker.endsWith(calling)) speaker = clean(speaker.slice(0, -calling.length));

    const paragraphs = splitParagraphs(talkBlob);
    if (!paragraphs.length) continue;

    const id = `${year}-${String(month).padStart(2, "0")}`;
    if (!groups.has(id)) groups.set(id, { id, label: conference, year, month, talks: [] });
    groups.get(id).talks.push({
      id: `${id}-${groups.get(id).talks.length}`,
      title: clean(r[idx.title]) || "Untitled talk",
      speaker: speaker || "Unknown",
      calling,
      url,
      paragraphs,
    });
  }

  const manifest = [];
  for (const [id, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const paragraphs = group.talks.reduce((a, t) => a + t.paragraphs.length, 0);
    const payload = {
      id,
      label: group.label,
      year: group.year,
      month: group.month,
      source: `https://www.churchofjesuschrist.org/study/general-conference/${group.year}/${String(group.month).padStart(2, "0")}`,
      talks: group.talks,
    };
    await fs.writeFile(path.join(DATA_DIR, "conference", `${id}.json`), JSON.stringify(payload));
    manifest.push({ id, label: group.label, year: group.year, month: group.month, url: `data/conference/${id}.json`, talks: group.talks.length, paragraphs });
  }
  console.log(`  ${manifest.length} conferences, ${manifest.reduce((a, c) => a + c.talks, 0)} talks, ${manifest.reduce((a, c) => a + c.paragraphs, 0)} paragraphs`);
  return manifest;
}

async function main() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  console.log("Building scripture data...");
  const volumes = await buildScriptures();
  console.log("Building conference data...");
  const conferences = await buildConference();
  const manifest = {
    generatedAt: new Date().toISOString(),
    sources: {
      scriptures: { name: "bcbooks/scriptures-json", url: "https://github.com/bcbooks/scriptures-json", license: "Public domain (2013 edition)" },
      conference: { name: "johnmwood/LDS-Conference-Scraper", url: "https://github.com/johnmwood/LDS-Conference-Scraper", note: "Scraped; verify redistribution rights before publishing." },
    },
    volumes,
    conferences,
  };
  await fs.writeFile(path.join(DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("Written to public/data");
}

main().catch((err) => { console.error(err); process.exit(1); });
