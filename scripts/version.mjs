#!/usr/bin/env node
/**
 * Point package.json at the release tag.
 *
 * The version we ship is the tag on the commit, not a number anyone remembers
 * to bump here — `package.json` sat at 1.0.0 through a dozen releases because
 * of that. This reads the newest tag (or the one you name), strips the leading
 * "v", and writes it into package.json plus the two root version fields in
 * package-lock.json that mirror it. Dependency versions are left alone.
 *
 *   npm run version:tag              # newest reachable tag, e.g. v2.0.1
 *   npm run version:tag v2.1.0       # or name one before tagging
 *   npm run version:tag -- --dry-run # show what would change
 *
 * CI runs this after `npm ci` on a tag push, so the build reports the version
 * it was cut as without a second source of truth to keep in step.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { repoRoot } from "./toolchain.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const named = args.find((arg) => !arg.startsWith("-"));

let tag = named;
if (!tag) {
  try {
    tag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    console.error("✗ No git tag found. Pass one explicitly: npm run version:tag v2.1.0");
    process.exit(1);
  }
}

const version = tag.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`✗ "${tag}" is not a vX.Y.Z release tag.`);
  process.exit(1);
}

const pkgPath = join(repoRoot, "package.json");
const lockPath = join(repoRoot, "package-lock.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

// The lockfile repeats the root version twice: once at the top and once in the
// "" entry. Both have to move, or the two files disagree about the project.
const rootEntry = lock.packages?.[""];
if (!rootEntry) {
  console.error("✗ package-lock.json has no root entry; run `npm install` once.");
  process.exit(1);
}

const previous = pkg.version;
if (previous === version && lock.version === version && rootEntry.version === version) {
  console.log(`Already ${version}; nothing to do.`);
  process.exit(0);
}

if (dryRun) {
  console.log(`Would set ${version}: package.json ${previous}, package-lock.json ${lock.version}/${rootEntry.version}.`);
  process.exit(0);
}

pkg.version = version;
lock.version = version;
rootEntry.version = version;

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Set version ${version} (was ${previous}) in package.json and package-lock.json.`);
