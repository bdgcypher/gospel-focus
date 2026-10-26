/**
 * Build the Come, Follow Me schedule: which chapters each week of the year asks
 * the reader to study.
 *
 * Source: the Church's own content API, the same one the site's reader uses.
 *
 *   .../api/v3/language-pages/type/content?lang=eng&uri=/manual/<manual>
 *
 * The manual's index lists every week with its date range, and each week's page
 * names the reading in its heading, in the manual's own shorthand:
 *
 *   Jeremiah 1–3; 7; 16–18; 20
 *
 * That heading is the reading, so it is parsed rather than fetched as a
 * structure — book names are matched against the library (which is also what
 * says how many chapters a whole book has), and a clause that is only numbers
 * continues the book before it. The site's own scripture links are no help here:
 * it links "1 and 2 Thessalonians" to the first chapter of the first book only.
 *
 * Output (written to public/data/cfm):
 *   <year>.json   { year, manual, weeks: [{ number, start, end, label, readings }] }
 *
 * Only the dates and the chapter ranges are kept — no lesson text. A week whose
 * reading cannot be resolved against the shipped library (an Official
 * Declaration, say, which is not in it) keeps its dates and drops that
 * reference, and the app then draws that day the way it did before.
 *
 * Run: node scripts/build-cfm.mjs [year...]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const CFM_DIR = path.join(DATA_DIR, "cfm");

const API = "https://www.churchofjesuschrist.org/study/api/v3/language-pages/type/content?lang=eng&uri=";
const SITE = "https://www.churchofjesuschrist.org";

/**
 * The manual's URL slug rotates with the year's course of study, and the site
 * publishes it well before the year starts. Trying the four courses rather than
 * pinning this year's slug means next year's file needs no code change.
 */
const COURSES = ["old-testament", "new-testament", "book-of-mormon", "doctrine-and-covenants"];
const PREFIXES = ["come-follow-me-for-home-and-church", "come-follow-me-for-individuals-and-families"];
const COURSE_TITLES = {
  "old-testament": "Old Testament",
  "new-testament": "New Testament",
  "book-of-mormon": "Book of Mormon",
  "doctrine-and-covenants": "Doctrine and Covenants",
};

const decode = (value) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const text = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One GET, with a retry: the build is a single pass and the site is not ours. */
async function fetchPage(uri, attempt = 0) {
  const res = await fetch(API + encodeURIComponent(uri), {
    headers: { "user-agent": "gospel-focus-build/1.0 (+https://github.com/bdgcypher/gospel-focus)" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    if (attempt < 2) {
      await sleep(600 * (attempt + 1));
      return fetchPage(uri, attempt + 1);
    }
    throw new Error(`Failed to fetch ${uri}: ${res.status}`);
  }
  const json = await res.json();
  return typeof json.content === "object" ? json.content : null;
}

/** The manual for `year`, or null when the site has not published it. */
async function discoverManual(year) {
  for (const prefix of PREFIXES) {
    for (const course of COURSES) {
      const uri = `/manual/${prefix}-${course}-${year}`;
      const content = await fetchPage(uri);
      if (content && typeof content.body === "string" && content.body.includes("data-date-start")) {
        return { uri, content, course };
      }
      await sleep(120);
    }
  }
  return null;
}

/**
 * The weeks in the manual's index: dates, number and page, read out of the list
 * of links the manual's own contents page renders.
 */
function parseIndex(body, uri) {
  const weeks = [];
  const chunks = body.split('<li data-content-type="chapter"').slice(1);

  for (const chunk of chunks) {
    const block = chunk.slice(0, chunk.indexOf("</li>") + 5);
    const start = /data-date-start="([^"]+)"/.exec(block)?.[1];
    const end = /data-date-end="([^"]+)"/.exec(block)?.[1];
    if (!start || !end) continue;

    const href = /href="([^"]+)"/.exec(block)?.[1] ?? "";
    const path = decode(href).split("?")[0];
    if (!path.endsWith(uri) && !path.includes(`${uri}/`)) continue;

    const number = Number(/(\d+)\/?$/.exec(path)?.[1]);
    // The API takes the manual's own path, without the `/study` the site's URLs
    // put in front of it.
    weeks.push({
      number: Number.isInteger(number) ? number : weeks.length + 1,
      start,
      end,
      uri: path.replace(/^\/study/, ""),
    });
  }

  return weeks.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The library's book names, longest first, so a scan can find the earliest
 * book named in a heading and never mistake "John" for "1 John".
 *
 * The heading is written for people, not for parsers: it mixes book names with
 * chapter lists ("Jeremiah 1–3; 7; 16–18; 20"), whole books with no chapters
 * ("Titus"), and two books sharing one name ("1 and 2 Thessalonians"). Names
 * are matched against the library itself, which is also the only thing that can
 * say how many chapters a whole book has.
 */
function bookIndex(volumes) {
  const entries = [];
  for (const volume of volumes) {
    for (const book of volume.books) {
      entries.push({ volume: volume.id, book: book.slug, name: normalise(book.name), chapters: book.chapters });
    }
  }

  // The few names the manual uses that the library spells differently.
  const aliases = [
    ["psalm", "ps"],
    ["revelations", "rev"],
    ["song of songs", "song"],
    ["doctrine & covenants", "dc"],
    ["d&c", "dc"],
    ["joseph smith-matthew", "js-m"],
    ["joseph smith-history", "js-h"],
  ];
  for (const [alias, slug] of aliases) {
    const entry = entries.find((e) => e.book === slug);
    if (entry) entries.push({ ...entry, name: alias });
  }

  return entries.sort((a, b) => b.name.length - a.name.length);
}

/** Dashes and spaces the way a heading may spell them, one way. */
const normalise = (value) =>
  decode(value)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Where the next known book name starts at or after `from`; the longest wins. */
function findBook(index, clause, from) {
  for (let at = from; at < clause.length; at += 1) {
    const entry = index.find((candidate) => clause.startsWith(candidate.name, at));
    if (entry) return { start: at, end: at + entry.name.length, entry };
  }
  return null;
}

/** The chapters a clause names after a book, or null for the whole book. */
function chaptersIn(segment) {
  const found = [];
  for (const [, first, last] of segment.matchAll(/(\d+)(?:\s*-\s*(\d+))?/g)) {
    const from = Number(first);
    const to = last ? Number(last) : from;
    if (to < from || to - from > 200) continue;
    for (let n = from; n <= to; n += 1) found.push(n);
  }
  return found.length ? [...new Set(found)] : null;
}

/**
 * The reading a week's page names, as chapter lists per book.
 *
 * Read clause by clause — semicolons and commas are the list's own separators.
 * A clause that only holds numbers ("7", "16–18") continues the book before it;
 * a clause naming a book with no chapters ("Titus") means the whole book; and a
 * clause naming two numbered books at once ("1 and 2 Thessalonians") is two
 * whole books, because the site links only the first of them.
 */
function parseReading(body, index) {
  const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(body)?.[1];
  if (!heading) return { label: "", readings: [] };

  const label = text(heading).replace(/\s+([;,])/g, "$1");
  const readings = [];
  let previous = null;

  for (const rawClause of label.split(/[;,]/)) {
    let clause = normalise(rawClause);
    if (!clause) continue;

    const found = [];

    // "1 and 2 Thessalonians" is two books, and "1–3 John" is three: one
    // clause, several whole books, none of them chapter lists.
    const paired = /(\d)\s*(and|-)\s*(\d)\s+([a-z][a-z .'-]*)/.exec(clause);
    if (paired) {
      const [, first, joiner, second, stem] = paired;
      const from = Number(first);
      const to = Number(second);
      const names = joiner === "and"
        ? [`${first} ${stem.trim()}`, `${second} ${stem.trim()}`]
        : Array.from({ length: to - from + 1 }, (_, i) => `${from + i} ${stem.trim()}`);
      const books = names.map((name) => index.find((entry) => entry.name === name));
      if (books.every(Boolean)) {
        for (const entry of books) found.push({ ...entry, chapters: null });
        clause = clause.replace(paired[0], " ".repeat(paired[0].length));
      }
    }

    let cursor = 0;
    for (let hit = findBook(index, clause, cursor); hit; hit = findBook(index, clause, cursor)) {
      const next = findBook(index, clause, hit.end);
      const segment = clause.slice(hit.end, next ? next.start : clause.length);
      found.push({ ...hit.entry, chapters: chaptersIn(segment) });
      cursor = hit.end;
    }

    if (found.length) {
      readings.push(...found);
      previous = found[found.length - 1];
      continue;
    }

    // A bare list of chapters is the last book named: "… ; 7; 16–18; 20".
    if (previous && /^[\d\s-]+$/.test(clause)) {
      const chapters = chaptersIn(clause);
      if (chapters) readings.push({ ...previous, chapters });
    }
  }

  return { label, readings };
}

/**
 * Keep only what the shipped library can open: a real volume, a real book, and
 * chapters the book actually has. Anything else is reported and dropped, so a
 * mapping gap is visible in the build rather than as a missing week in the app.
 *
 * The same book named twice in one week is one entry, with both lists merged —
 * "Jeremiah 1–3; 7; 16–18" is three references to one book.
 */
function resolve(readings, volumes) {
  const byId = new Map(volumes.map((volume) => [volume.id, volume]));
  const kept = new Map();
  const whole = new Set();
  const dropped = [];

  for (const reading of readings) {
    const volume = byId.get(reading.volume);
    const book = volume?.books.find((b) => b.slug === reading.book);
    if (!book) {
      dropped.push(`${reading.volume}/${reading.book}`);
      continue;
    }

    const key = `${reading.volume}/${reading.book}`;
    if (!kept.has(key)) kept.set(key, { volume: volume.id, book: book.slug, chapters: new Set() });
    const entry = kept.get(key);

    if (reading.chapters === null) whole.add(key);
    else for (const n of reading.chapters) entry.chapters.add(n);
  }

  const resolved = [];
  for (const [key, entry] of kept) {
    const book = byId.get(entry.volume).books.find((b) => b.slug === entry.book);
    const chapters = whole.has(key)
      ? Array.from({ length: book.chapters }, (_, i) => i + 1)
      : [...entry.chapters].filter((n) => n >= 1 && n <= book.chapters).sort((a, b) => a - b);

    if (!chapters.length) {
      dropped.push(key);
      continue;
    }
    resolved.push({ volume: entry.volume, book: entry.book, chapters });
  }

  return { kept: resolved, dropped };
}

/**
 * Build one year's schedule. `volumes` is the library's own manifest entry, so
 * the schedule can only ever point at chapters the app ships.
 */
export async function buildCfm({ years, volumes, quiet = false }) {
  const log = quiet ? () => {} : (...args) => console.log(...args);
  await fs.mkdir(CFM_DIR, { recursive: true });

  const built = [];
  const index = bookIndex(volumes);

  for (const year of years) {
    const manual = await discoverManual(year);
    if (!manual) {
      log(`  ${year}: no manual published yet, skipped`);
      continue;
    }

    const listed = parseIndex(manual.content.body, manual.uri);
    if (!listed.length) {
      log(`  ${year}: manual found but no weeks listed, skipped`);
      continue;
    }

    const weeks = [];
    for (const week of listed) {
      const page = await fetchPage(week.uri);
      const parsed = typeof page?.body === "string" ? parseReading(page.body, index) : { label: "", readings: [] };
      const { kept, dropped } = resolve(parsed.readings, volumes);

      if (dropped.length) log(`  ${week.start}: dropped ${dropped.join(", ")}`);
      weeks.push({ number: week.number, start: week.start, end: week.end, label: parsed.label, readings: kept });
      await sleep(120);
    }

    const payload = {
      year,
      manual: {
        title: `Come, Follow Me — ${COURSE_TITLES[manual.course]} ${year}`,
        course: manual.course,
        uri: manual.uri,
        url: `${SITE}/study${manual.uri}`,
      },
      weeks,
    };
    await fs.writeFile(path.join(CFM_DIR, `${year}.json`), JSON.stringify(payload, null, 2));

    const withReading = weeks.filter((w) => w.readings.length).length;
    log(`  ${year}: ${weeks.length} weeks, ${withReading} with a reading`);
    built.push({ year, weeks: weeks.length, withReading, url: `data/cfm/${year}.json` });
  }

  return built;
}

/**
 * The years to build: this year and the next, because the next manual is
 * usually published a year ahead and the first week of it falls in December.
 */
export function cfmYears() {
  const now = new Date().getFullYear();
  return [now, now + 1];
}

async function main() {
  const args = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n));
  const years = args.length ? args : cfmYears();

  const manifestPath = path.join(DATA_DIR, "manifest.json");
  let volumes;
  try {
    volumes = JSON.parse(await fs.readFile(manifestPath, "utf8")).volumes;
  } catch {
    console.error("public/data/manifest.json is missing — run scripts/build-data.mjs first.");
    process.exitCode = 1;
    return;
  }

  console.log(`Building the Come, Follow Me schedule for ${years.join(", ")}...`);
  const built = await buildCfm({ years, volumes });
  if (!built.length) {
    console.error("  nothing was built — is the manual published?");
    process.exitCode = 1;
    return;
  }
  console.log(`  wrote ${built.map((b) => `cfm/${b.year}.json`).join(", ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
