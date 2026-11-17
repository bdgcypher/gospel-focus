/**
 * The general conference sessions from the scraped dataset.
 *
 * Source: https://github.com/johnmwood/LDS-Conference-Scraper — one CSV of every
 * talk, the whole talk in a single cell, from April 1971 to October 2018. The
 * dataset has no declared license; the manifest says so.
 *
 * A talk is one blob there, so it is split into paragraphs of roughly 320
 * characters. Those paragraphs are the app's "verses" for a talk, which is why
 * a mark downloaded from that era lands on the paragraph group rather than on a
 * single paragraph: the file names whole talks, and this is the shape they have.
 *
 * Output (written to `dataDir`):
 *   conference/<year>-<month>.json   talk paragraphs, lazily loaded
 *
 * Run through scripts/build-conference.mjs; scripts/build-data.mjs calls it too.
 */
import fs from "node:fs/promises";
import path from "node:path";

const CONFERENCE_CSV =
  "https://raw.githubusercontent.com/johnmwood/LDS-Conference-Scraper/master/conference_talks.csv";

/** The first conference the scraped dataset holds. */
export const SCRAPED_FROM_YEAR = 1971;

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

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

/**
 * Every session in the CSV from `minYear` on, written into `dataDir`.
 *
 * Returns manifest entries only; a caller that writes the manifest merges them.
 */
export async function buildScrapedConferences({ dataDir, minYear = SCRAPED_FROM_YEAR, log = console.log }) {
  log("  downloading conference CSV...");
  const csv = await fetchText(CONFERENCE_CSV);
  const rows = parseCSV(csv);
  const idx = Object.fromEntries(rows[0].map((h, i) => [h, i]));

  await fs.mkdir(path.join(dataDir, "conference"), { recursive: true });
  const groups = new Map();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const conference = clean(r[idx.conference]);
    const m = conference.match(/(\w+)\s+(\d{4})/);
    if (!m) continue;
    const year = Number(m[2]);
    if (year < minYear) continue;
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
    const paragraphs = group.talks.reduce((total, talk) => total + talk.paragraphs.length, 0);
    const payload = {
      id,
      label: group.label,
      year: group.year,
      month: group.month,
      source: `https://www.churchofjesuschrist.org/study/general-conference/${group.year}/${String(group.month).padStart(2, "0")}`,
      talks: group.talks,
    };
    await fs.writeFile(path.join(dataDir, "conference", `${id}.json`), JSON.stringify(payload));
    manifest.push({
      id,
      label: group.label,
      year: group.year,
      month: group.month,
      url: `data/conference/${id}.json`,
      talks: group.talks.length,
      paragraphs,
    });
  }

  log(
    `  ${manifest.length} conferences, ${manifest.reduce((total, entry) => total + entry.talks, 0)} talks, ${manifest.reduce(
      (total, entry) => total + entry.paragraphs,
      0
    )} paragraphs`
  );
  return manifest;
}
