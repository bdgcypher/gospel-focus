/**
 * Build the word list the daily puzzle needs.
 *
 * The puzzle answers a question the app already has the data for: which words
 * does the library actually contain? So the list is derived from the shipped
 * passage text rather than downloaded from a dictionary site — it is exactly
 * the vocabulary of the reader's own scriptures and conference talks, it needs
 * no extra licence, and it cannot drift from the corpus.
 *
 * The board is six rows high and four to six tiles wide, so only words of four,
 * five, or six letters ship. A shorter word fits the board; anything longer
 * does not.
 *
 * Two lists come out of the same pass:
 *
 *  - `guesses` is every distinct four-to-six-letter word in the library,
 *    lowercased. A guess has to be one of these, which is a rule the reader can
 *    see the sense of ("a word from the library") rather than a hidden
 *    dictionary's opinion. It includes proper nouns on purpose: a guess of
 *    "joseph" is not wrong, it is just not the answer.
 *  - `answers` is the narrower set — words that appear at least once in
 *    lowercase. A word that is only ever capitalised in the source is almost
 *    certainly a name, and a name is a poor answer: nothing in the passage
 *    tells the reader it was meant to be a name rather than a word.
 *
 * Output: public/data/words.json
 *
 * Run: node scripts/build-words.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");

/** The board is six tiles wide at most, so these are the lengths that ship. */
export const MIN_WORD_LENGTH = 4;
export const MAX_WORD_LENGTH = 6;

/** Letters only: an apostrophe splits a word rather than gluing it to the next. */
const TOKEN = /[A-Za-z]+/g;

/**
 * Every word in the library, with a note of whether it was ever seen in
 * lowercase. Walking the JSON generically rather than through the known shapes
 * keeps this working for a volume or a conference file alike, and for a shape
 * added later.
 */
function collect(text, found) {
  for (const match of text.matchAll(TOKEN)) {
    const word = match[0];
    if (word.length < MIN_WORD_LENGTH || word.length > MAX_WORD_LENGTH) continue;
    const lower = word.toLowerCase();
    const entry = found.get(lower) ?? { lower: 0 };
    if (word === lower) entry.lower += 1;
    found.set(lower, entry);
  }
}

function walk(value, found) {
  if (typeof value === "string") {
    collect(value, found);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) walk(item, found);
  }
}

/** Read the files the manifest says shipped, and nothing else. */
async function readLibrary(dataDir) {
  const manifest = JSON.parse(await fs.readFile(path.join(dataDir, "manifest.json"), "utf8"));
  const files = [
    ...manifest.volumes.map((volume) => volume.url),
    ...manifest.conferences.map((conference) => conference.url),
  ];
  const found = new Map();
  for (const relative of files) {
    const file = path.join(dataDir, relative.replace(/^data\//, ""));
    walk(JSON.parse(await fs.readFile(file, "utf8")), found);
  }
  return found;
}

/** Write the list the daily puzzle fetches, and report what it wrote. */
export async function buildWordList({ dataDir = DATA_DIR } = {}) {
  const found = await readLibrary(dataDir);
  const guesses = [...found.keys()].sort();
  const answers = [...found.entries()]
    .filter(([, entry]) => entry.lower > 0)
    .map(([word]) => word)
    .sort();

  const payload = {
    generatedAt: new Date().toISOString(),
    minLength: MIN_WORD_LENGTH,
    maxLength: MAX_WORD_LENGTH,
    answers,
    guesses,
  };
  await fs.writeFile(path.join(dataDir, "words.json"), JSON.stringify(payload));
  console.log(
    `  ${guesses.length} words of ${MIN_WORD_LENGTH}–${MAX_WORD_LENGTH} letters, ${answers.length} usable as answers`
  );
  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildWordList().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
