/**
 * The general conference sessions the scraper dataset doesn't reach.
 *
 * The johnmwood CSV bundled by scripts/build-data.mjs stops at October 2018.
 * Everything since is on the Church's own site, behind the same public content
 * API scripts/build-cfm.mjs already reads:
 *
 *   .../api/v3/language-pages/type/content?lang=eng&uri=/general-conference/2024/04
 *
 * A session's index lists its talks in reading order, and each talk's page
 * carries its text as `<p id="pN">` elements. Those ids are the paragraph
 * numbers the Church itself uses, and the ones a Gospel Library mark names
 * (`...?id=p7`), so reading them — rather than re-splitting a blob — is what
 * makes an imported mark land on the paragraph it was drawn over.
 *
 * Output (written to public/data):
 *   conference/<year>-<month>.json   talk paragraphs, lazily loaded
 *   manifest.json                    the sessions merged into `conferences`
 *
 * Run: node scripts/build-conference.mjs [--from 2019]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSearchIndex } from "./search-index.mjs";
import { buildWordList } from "./build-words.mjs";
import { buildScrapedConferences } from "./conference-scraper.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SITE = "https://www.churchofjesuschrist.org";
const API = `${SITE}/study/api/v3/language-pages/type/content?lang=eng&uri=`;
const SESSION_MONTHS = [4, 10];
const MONTH_NAMES = { 4: "April", 10: "October" };

/** The first session the scraper dataset doesn't hold. */
export const CONFERENCE_API_FROM_YEAR = 2019;

/** What the manifest says about where the talks come from. */
export const CONFERENCE_SOURCE = {
  name: "johnmwood/LDS-Conference-Scraper (1971-2018); churchofjesuschrist.org content API (2019 on)",
  url: "https://github.com/johnmwood/LDS-Conference-Scraper",
  note: "Scraped dataset for 1971-2018; newer sessions read from the Church's own content API. Verify redistribution rights before publishing.",
};

const decode = (value) =>
  value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const text = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One GET, with a retry: the build is a single pass and the site is not ours. */
async function fetchContent(uri, attempt = 0) {
  const res = await fetch(API + encodeURIComponent(uri), {
    headers: { "user-agent": "gospel-focus-build/1.0 (+https://github.com/bdgcypher/gospel-focus)" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    if (attempt < 2) {
      await sleep(600 * (attempt + 1));
      return fetchContent(uri, attempt + 1);
    }
    throw new Error(`Failed to fetch ${uri}: ${res.status}`);
  }
  const json = await res.json();
  return typeof json.content === "object" ? json.content : null;
}

/** April and October of every year from `fromYear`; a month not yet held 404s. */
export function sessionIds(fromYear, now = new Date()) {
  const ids = [];
  for (let year = fromYear; year <= now.getFullYear(); year += 1) {
    for (const month of SESSION_MONTHS) ids.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return ids;
}

const talkUri = (id, slug) => {
  const [year, month] = id.split("-");
  return `/general-conference/${year}/${month}${slug ? `/${slug}` : ""}`;
};

/**
 * The talk's public page. The API takes the path without it, but every link the
 * app shows — and every address it exports — must carry the `/study` mount, or
 * Gospel Library won't recognise it.
 */
const talkUrl = (id, slug) => `${SITE}/study${talkUri(id, slug)}?lang=eng`;

/** Every talk's slug in a session, in the order the index lists them. */
function talkPaths(body, id) {
  const prefix = `${talkUri(id)}/`;
  const seen = new Set();
  const paths = [];
  for (const match of body.matchAll(/href="([^"]+)"/g)) {
    // The site writes every link with its `/study` mount; the API does not.
    const href = decode(match[1]).replace(/^\/study/, "").split("?")[0];
    if (!href.startsWith(prefix)) continue;
    const slug = href.slice(prefix.length);
    if (!slug || slug.includes("/") || slug.endsWith("-session") || seen.has(slug)) continue;
    seen.add(slug);
    paths.push(slug);
  }
  return paths;
}

/**
 * The opening element's text, to the next block-level tag.
 *
 * The site's pages leave some paragraphs unclosed (`<h1>Title<p class=…>`), so
 * the next tag is the only reliable end of an element here.
 */
function blockText(body, opening) {
  const open = opening.exec(body);
  if (!open) return "";
  const rest = body.slice(open.index + open[0].length);
  const cut = rest.search(/<\s*(?:p|h[1-6]|div|header|section|ul|ol|figure)\b/i);
  return text(cut >= 0 ? rest.slice(0, cut) : rest);
}

/**
 * The talk's paragraphs in reading order, each with the anchor the page gives it.
 *
 * Older pages number them (`id="p7"`); since October 2024 they carry a hash
 * (`id="p_iJBUv"`). Both are what a Gospel Library mark names, so both are kept.
 * Where the numbers are there, they are the reading order — the markup
 * occasionally places a paragraph before its number.
 */
function paragraphsOf(body) {
  const start = body.indexOf('<div class="body-block">');
  if (start < 0) return [];

  const found = [];
  for (const match of body.slice(start).matchAll(/<p[^>]*\bid="(p(?:\d+|_[A-Za-z0-9]+))"[^>]*>([\s\S]*?)<\/p>/g)) {
    const value = text(match[2]);
    if (value) found.push({ id: match[1], text: value });
  }

  if (found.every((paragraph) => /^p\d+$/.test(paragraph.id))) {
    found.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  }
  return found;
}

/** One session, written as `conference/<id>.json`; its manifest entry or null. */
async function buildSession(id, dataDir, log) {
  const content = await fetchContent(talkUri(id));
  if (!content?.body) {
    log(`  ${id}: not published, skipped`);
    return null;
  }

  const talks = [];
  for (const slug of talkPaths(content.body, id)) {
    const page = await fetchContent(talkUri(id, slug));
    const body = typeof page?.body === "string" ? page.body : "";
    const paragraphs = paragraphsOf(body);
    // Session and landing pages are linked from the same list but carry no talk
    // body, so the text itself is what says this is a talk.
    if (paragraphs.length < 3) continue;

    talks.push({
      id: `${id}-${talks.length}`,
      title: blockText(body, /<h1[^>]*\bid="title1"[^>]*>/i) || "Untitled talk",
      speaker: blockText(body, /<p[^>]*\bclass="author-name"[^>]*>/i) || "Unknown",
      calling: blockText(body, /<p[^>]*\bclass="author-role"[^>]*>/i),
      url: talkUrl(id, slug),
      paragraphs: paragraphs.map((paragraph) => paragraph.text),
      paragraphIds: paragraphs.map((paragraph) => paragraph.id),
    });
    await sleep(100);
  }

  if (!talks.length) {
    log(`  ${id}: no talks found, skipped`);
    return null;
  }

  const [year, month] = id.split("-").map(Number);
  const payload = {
    id,
    label: `${MONTH_NAMES[month]} ${year}`,
    year,
    month,
    source: `${SITE}/study${talkUri(id)}`,
    talks,
  };
  await fs.writeFile(path.join(dataDir, "conference", `${id}.json`), JSON.stringify(payload));

  const paragraphs = talks.reduce((total, talk) => total + talk.paragraphs.length, 0);
  log(`  ${id}: ${talks.length} talks, ${paragraphs} paragraphs`);
  return {
    id,
    label: payload.label,
    year,
    month,
    url: `data/conference/${id}.json`,
    talks: talks.length,
    paragraphs,
  };
}

/**
 * Every session from `fromYear` on, written into `dataDir`.
 *
 * The entries returned are shaped for the manifest; nothing else is touched, so
 * a caller that is already writing the manifest can merge them itself.
 */
export async function buildChurchConferences({ dataDir, fromYear = CONFERENCE_API_FROM_YEAR, log = console.log }) {
  await fs.mkdir(path.join(dataDir, "conference"), { recursive: true });
  const sessions = [];
  for (const id of sessionIds(fromYear)) {
    const entry = await buildSession(id, dataDir, log);
    if (entry) sessions.push(entry);
  }
  const paragraphs = sessions.reduce((total, session) => total + session.paragraphs, 0);
  log(
    `  ${sessions.length} sessions, ${sessions.reduce((total, session) => total + session.talks, 0)} talks, ${paragraphs} paragraphs`
  );
  return sessions;
}

/** Merge sessions into an existing manifest, replacing any it already lists. */
export async function addToManifest({ dataDir, sessions, log = console.log }) {
  const file = path.join(dataDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(file, "utf8"));
  const byId = new Map([...(manifest.conferences ?? []), ...sessions].map((conference) => [conference.id, conference]));
  manifest.conferences = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  manifest.sources = { ...manifest.sources, conference: CONFERENCE_SOURCE };
  manifest.generatedAt = new Date().toISOString();
  await fs.writeFile(file, JSON.stringify(manifest, null, 2));
  log(`  manifest: ${manifest.conferences.length} conferences`);
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--from");
  const fromYear = at >= 0 ? Number(args[at + 1]) : CONFERENCE_API_FROM_YEAR;
  if (!Number.isInteger(fromYear)) {
    console.error("--from takes a year, e.g. --from 2019");
    process.exitCode = 1;
    return;
  }

  const dataDir = path.join(ROOT, "public", "data");
  console.log("Building the scraped conference sessions...");
  const scraped = await buildScrapedConferences({ dataDir });
  console.log(`Building general conference from ${fromYear}...`);
  const sessions = await buildChurchConferences({ dataDir, fromYear });
  if (!sessions.length) {
    console.error("  nothing was fetched — is the session published?");
    process.exitCode = 1;
    return;
  }

  await addToManifest({ dataDir, sessions: [...scraped, ...sessions] });
  // The index and the word list are readers of the passage data, so they can
  // only describe what has just been written.
  console.log("Building the search index...");
  await buildSearchIndex({ dataDir });
  console.log("Building the word list...");
  await buildWordList({ dataDir });
  console.log("Written to public/data");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
