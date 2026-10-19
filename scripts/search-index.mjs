/**
 * Build the full-text index the /search page queries.
 *
 * The index is a plain MiniSearch snapshot, written to public/data/search.snapshot
 * and shipped with the app like the passage data itself, because the build is a
 * static export — there is no server to search on.
 *
 * What the shape is, and why, in one place:
 *
 * - **One document per verse / conference paragraph.** A hit is then exactly
 *   what the reader wanted to find, and its id is its citation, so the app can
 *   open the passage without a second lookup. 51,083 documents.
 * - **No stored text.** Storing a snippet per document added 10 MB on its own —
 *   as much as the corpus. The id carries the citation and the page reads the
 *   real text out of the passage data it already loads to open a result
 *   (`resolveCitation`), a result's first line and the phrase rule coming the same
 *   way, by id (`loadPassageText`), so the index stores nothing for scripture and
 *   only the two strings a conference id can't imply (the talk's title and its
 *   byline).
 * - **Common words are not indexed at all.** They are the glue of a sentence and
 *   they are most of the postings: the 441 terms that appear in more than 1% of
 *   documents are ~1.1 M of the ~1.6 M term/document pairs in the whole corpus.
 *   Dropping them takes the snapshot from 35 MB to about 5 MB. The list is a
 *   hand-kept one rather than "everything above some frequency" on purpose: a
 *   frequency cut at 1% would also drop *lord*, *god*, and *nephi* — the words
 *   this app is most likely to be searched for — while "the" and "and" cost
 *   whole megabytes each. The list travels *in the index file*, so the browser
 *   filters a query with the same words the build filtered the corpus with.
 * - **No stemming, no custom tokenizer.** MiniSearch's own tokenizer is used
 *   unchanged on both sides, so nothing about how text becomes terms can drift
 *   between the script that builds the index and the page that queries it.
 *
 * Run it alone (over the passage data already on disk) with:
 *   npm run build:search
 * or as the last step of the full dataset build, which is `npm run build:data`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import MiniSearch from "minisearch";

const gzip = (buf) => zlib.gzipSync(buf, { level: 9 });
const gunzip = (buf) => zlib.gunzipSync(buf).toString("utf8");

/** Bumped when the file's shape changes, so a stale index is obvious. */
export const INDEX_VERSION = 1;

/**
 * The snapshot, gzipped, in public/data.
 *
 * Gzipped because of arithmetic rather than taste: a hit is a (term, document)
 * pair and this corpus has about 1.4 M of them, which is ~11 MB of JSON however
 * it is arranged, against ~2 MB once deflated. The index is the one asset that
 * makes the download bigger than the scripture it searches, so it travels
 * compressed and the page inflates it with `DecompressionStream` — see
 * lib/search.ts. Both numbers are measured, not guessed: `npm run build:search`
 * prints them.
 *
 * The name deliberately does not end in `.gz`. Android's asset packer gunzips
 * `*.gz` files as it packages them and drops the suffix, so the shipped APK
 * carried `data/search.json` — inflated, 11.9 MB — while the app asked for
 * `data/search.json.gz` and got a 404. That made search work on the web and
 * fail only on Android, which is exactly the shape of bug a green build never
 * shows. A neutral suffix is left alone, and the file stays one compressed
 * asset inside the APK.
 */
export const INDEX_FILE = "search.snapshot";

/** Fields searched. `reference` is boosted at query time (see lib/search.ts). */
export const INDEX_FIELDS = ["text", "reference"];

/**
 * The few strings worth carrying: a conference hit shows its talk's title, and
 * scripture's shows nothing because its id already says which verse it is.
 */
export const STORED_FIELDS = ["title", "byline"];

/**
 * What counts as a searchable term at all: anything but a lone letter.
 *
 * A single letter is never a search term ("a", "i", "s"…), but a single
 * *digit* is — half the citations in the canon are a number and a book ("1
 * Nephi", "3 Nephi", "D&C 121"), and dropping digits would make those
 * unsearchable. The pattern itself travels in the index file (`termPattern`) so
 * the page applies the same rule to a query.
 */
export const TERM_PATTERN = /^[0-9]|.{2,}$/;

export const keepTerm = (lowered) => TERM_PATTERN.test(lowered);

/**
 * Words the index leaves out.
 *
 * English function words, their scripture-archaic spellings, and the handful of
 * verbs that only ever appear inside idioms ("it came to pass", "he said unto
 * them"). Everything else is kept, including words that are merely frequent —
 * *lord*, *god*, *behold*, *nephi* are all searchable.
 */
export const STOPWORDS = [
  "a", "about", "above", "after", "again", "against", "all", "almost", "along", "already", "also",
  "although", "always", "am", "among", "amongst", "an", "and", "another", "any", "anyone", "are",
  "around", "art", "as", "at", "back", "be", "became", "because", "become", "been", "before",
  "began", "behind", "being", "below", "beside", "besides", "between", "beyond", "both", "but",
  "by", "came", "can", "cannot", "come", "could", "did", "didst", "do", "doeth", "does", "doing",
  "done", "dost", "doth", "down", "during", "each", "either", "else", "even", "ever", "every",
  "everyone", "everything", "except", "few", "for", "forth", "from", "further", "get", "gets",
  "getting", "go", "goes", "going", "gone", "got", "had", "hadst", "has", "hast", "hath", "have",
  "having", "he", "hence", "her", "here", "hers", "herself", "him", "himself", "his", "how",
  "however", "i", "if", "in", "indeed", "instead", "into", "is", "it", "its", "itself", "just",
  "lest", "let", "like", "lo", "made", "make", "makes", "making", "many", "may", "me", "might",
  "mine", "more", "most", "much", "must", "my", "myself", "nay", "neither", "never", "no", "nor",
  "not", "nothing", "now", "of", "off", "often", "on", "once", "one", "only", "or", "other",
  "others", "otherwise", "ought", "our", "ours", "ourselves", "out", "over", "own", "perhaps",
  "put", "rather", "really", "said", "saith", "same", "say", "saying", "says", "see", "seem",
  "seemed", "shall", "shalt", "she", "should", "shouldst", "since", "so", "some", "someone",
  "something", "still", "such", "take", "taken", "than", "that", "the", "thee", "their", "theirs",
  "them", "themselves", "then", "thence", "there", "thereof", "these", "they", "thine", "this",
  "those", "thou", "though", "through", "throughout", "thus", "thy", "thyself", "till", "to",
  "together", "too", "toward", "towards", "under", "until", "unto", "up", "upon", "us", "very",
  "was", "wast", "we", "well", "went", "were", "wert", "what", "whatever", "when", "whence",
  "whenever", "where", "whereas", "whereby", "wherefore", "wherein", "whereof", "wherever",
  "whether", "which", "while", "whither", "who", "whoever", "whom", "whose", "why", "will",
  "wilt", "with", "within", "without", "would", "wouldst", "ye", "yea", "yes", "yet", "you",
  "your", "yours", "yourself", "yourselves",
];

/** The predicate both sides use. Kept in one expression so the two can't drift. */
export const termFilter = (stopwords) => {
  const stop = new Set(stopwords);
  return (term) => {
    const lowered = term.toLowerCase();
    return !keepTerm(lowered) || stop.has(lowered) ? null : lowered;
  };
};

/**
 * Every searchable document, built from the passage data on disk.
 *
 * The id is the citation, deliberately readable rather than opaque — a hit that
 * arrives without its citation can't be opened, and an id the page can parse
 * means the index needs no stored fields to say where a result is.
 *
 *   s/<volume>/<book slug>/<chapter>/<verse>      e.g. s/bom/1-ne/3/7
 *   c/<conference>/<talk index>/<paragraph>       e.g. c/2014-10/12/3
 */
export async function buildSearchDocs(dataDir) {
  const read = async (rel) => JSON.parse(await fs.readFile(path.join(dataDir, rel), "utf8"));
  const manifest = await read("manifest.json");
  const docs = [];

  for (const volume of manifest.volumes) {
    const data = await read(`scriptures/${volume.id}.json`);
    for (const book of data.books) {
      for (const chapter of book.chapters) {
        for (let i = 0; i < chapter.verses.length; i++) {
          docs.push({
            id: `s/${volume.id}/${book.slug}/${chapter.n}/${i + 1}`,
            reference: `${book.name} ${chapter.n}:${i + 1}`,
            text: chapter.verses[i],
          });
        }
      }
    }
  }

  for (const conference of manifest.conferences) {
    const data = await read(`conference/${conference.id}.json`);
    data.talks.forEach((talk, talkIndex) => {
      talk.paragraphs.forEach((text, paragraph) => {
        docs.push({
          id: `c/${conference.id}/${talkIndex}/${paragraph + 1}`,
          reference: `“${talk.title}”`,
          text,
          title: talk.title,
          byline: [talk.speaker, talk.calling].filter(Boolean).join(" · "),
        });
      });
    });
  }

  return docs;
}

/** The snapshot to write: MiniSearch's own JSON, plus what the page needs. */
export function buildSnapshot(docs, { generatedAt } = {}) {
  const index = new MiniSearch({
    fields: INDEX_FIELDS,
    storeFields: STORED_FIELDS,
    idField: "id",
    processTerm: termFilter(STOPWORDS),
  });
  index.addAll(docs);

  return {
    version: INDEX_VERSION,
    generatedAt: generatedAt ?? null,
    documents: docs.length,
    // The query side rebuilds MiniSearch's options and its term filter from
    // these, so the file — not a second copy of this config — is the contract.
    options: { fields: INDEX_FIELDS, storeFields: STORED_FIELDS, idField: "id" },
    stopwords: STOPWORDS,
    termPattern: TERM_PATTERN.source,
    index: index.toJSON(),
  };
}

/**
 * The check that matters: read the file back the way the page will, and put a
 * few queries through it.
 *
 * The build and the page each own half of one contract — the script decides how
 * text becomes terms, the page decides how a query does — and a missing stopword
 * list on either side fails silently, as an empty result set. Loading the file
 * from disk and searching it is the only way to catch that, so it is part of
 * writing the file rather than something to remember later.
 */
export async function verifySnapshot(filePath, { log = console.log } = {}) {
  const file = JSON.parse(gunzip(await fs.readFile(filePath)));
  const search = MiniSearch.loadJSON(JSON.stringify(file.index), {
    fields: file.options.fields,
    storeFields: file.options.storeFields,
    idField: file.options.idField,
    processTerm: termFilter(file.stopwords),
  });

  const checks = [
    { query: "nephi", want: 10 },
    { query: "atonement", want: 3 },
    { query: "faith love", want: 1 },
    { query: "1 nephi 3", want: 3 },
    { query: "“the family”", want: 1 },
    { query: "alma 32", want: 3 },
  ];
  let failed = 0;
  for (const { query, want } of checks) {
    const results = search.search(query, { combineWith: "AND" });
    const ok = results.length >= want;
    if (!ok) failed++;
    log(`  ${ok ? "ok  " : "FAIL"} ${JSON.stringify(query)} → ${results.length} hits`);
  }

  // The stopwords must be gone from both sides at once: if the page kept them
  // while the build dropped them, this is the query that shows it.
  const stopped = search.search("the and of", { combineWith: "AND" });
  const stopClean = stopped.length === 0;
  if (!stopClean) failed++;
  log(`  ${stopClean ? "ok  " : "FAIL"} common words are not indexed → ${stopped.length} hits (want 0)`);

  return failed === 0;
}

/** Build, write, and verify. Returns the file's size in bytes. */
export async function buildSearchIndex({ dataDir, log = console.log } = {}) {
  const started = Date.now();
  const manifest = JSON.parse(await fs.readFile(path.join(dataDir, "manifest.json"), "utf8"));
  const docs = await buildSearchDocs(dataDir);
  const snapshot = buildSnapshot(docs, { generatedAt: manifest.generatedAt });
  const serialized = Buffer.from(JSON.stringify(snapshot));
  const gzipped = gzip(serialized);
  const filePath = path.join(dataDir, INDEX_FILE);
  await fs.writeFile(filePath, gzipped);

  log(
    `  ${docs.length.toLocaleString("en-US")} documents, ` +
      `${(serialized.length / 1e6).toFixed(2)} MB → ${(gzipped.length / 1e6).toFixed(2)} MB gzipped, ` +
      `${Date.now() - started} ms`
  );
  log(`  verifying ${path.relative(process.cwd(), filePath)}...`);
  const ok = await verifySnapshot(filePath, { log });
  if (!ok) throw new Error("search index failed its own round-trip check");

  return gzipped.length;
}
