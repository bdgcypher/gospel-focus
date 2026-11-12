import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, checker, freePort, launch } from "./cdp.mjs";
import { startServer } from "./server.mjs";
import * as annotations from "./annotations.test.mjs";
import * as backlinks from "./backlinks.test.mjs";
import * as scroll from "./scroll.test.mjs";
import * as handles from "./handles.test.mjs";
import * as links from "./links.test.mjs";
import * as nav from "./nav.test.mjs";
import * as notes from "./notes.test.mjs";
import * as reader from "./reader.test.mjs";
import * as saved from "./saved.test.mjs";
import * as tags from "./tags.test.mjs";

/**
 * The browser suite: the reader, marking, and the annotations file, driven
 * against the exported build in a real Chromium.
 *
 * Run it with `npm run test:browser`. It needs `out/` (so, `npm run build`
 * first) and a Chromium on the machine — `CHROME_BIN` if it is somewhere
 * unusual. It starts its own server and its own throwaway browser profile, so it
 * is safe to run beside a dev server, and it leaves nothing behind.
 *
 * The scenarios are separate modules with the same shape, so adding the next one
 * is a file and a line here. Each starts from a cleared library and asserts
 * through the DOM; the exit code is the number of failed checks.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../out");

if (!fs.existsSync(path.join(root, "index.html"))) {
  console.error("The exported app isn't built. Run `npm run build` first, then `npm run test:browser`.");
  process.exit(1);
}

const server = await startServer(root);
const port = await freePort();
const browser = await launch(port);
const page = await connect(browser.base);
const { check, failures } = checker();
const base = `http://127.0.0.1:${server.port}`;

const scenarios = [reader, nav, annotations, handles, notes, links, backlinks, saved, tags, scroll];

console.log(`Testing ${base} in ${process.env.CHROME_BIN ?? "the found Chromium"}\n`);

for (const scenario of scenarios) {
  console.log(`${scenario.name}`);
  const before = page.errors.length;
  try {
    await scenario.run({ page, check, base });
  } catch (error) {
    check(`${scenario.name} ran to the end`, false, error.message);
  }
  const fresh = page.errors.slice(before);
  check("no uncaught errors in the page", fresh.length === 0, fresh.slice(0, 2).join(" | "));
  console.log("");
}

page.close();
browser.stop();
await server.close();

console.log(failures.length ? `${failures.length} check(s) failed:\n  - ${failures.join("\n  - ")}` : "all checks passed");
process.exit(failures.length ? 1 : 0);
