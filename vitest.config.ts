import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The unit tests: the annotation engine and the file format.
 *
 * Those two are where a mistake is silent — a word range off by one, an anchor
 * read from the wrong field — and where a real browser is a slow way to find it.
 * Everything that needs the app's chrome, storage, or a selection is checked in
 * the browser suite instead (`npm run test:browser`, tests/browser/).
 *
 * The DOM environment is jsdom because the selection mapper walks real nodes;
 * the rest of the tests would run happily in node.
 */
export default defineConfig({
  resolve: {
    // The app's own alias, so a test imports exactly what the app imports.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
  },
});
