/**
 * Rebuild the search index from the passage data already on disk.
 *
 * `npm run build:data` does this too, but it re-downloads the whole corpus
 * first. This one only re-reads public/data, so the index can be rebuilt (after
 * a tweak to the stopword list, say) without the network.
 *
 * Run: node scripts/build-search.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDEX_FILE, buildSearchIndex } from "./search-index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");

console.log("Building the search index...");
await buildSearchIndex({ dataDir: DATA_DIR });
console.log(`Written to public/data/${INDEX_FILE}`);
