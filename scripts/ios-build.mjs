#!/usr/bin/env node
/**
 * Compile the iOS project for the simulator, unsigned.
 *
 * This is the iOS half of `npm run bootstrap --build`, and the only iOS step
 * that cannot run on Linux or Windows: `cap sync ios` copies the web app into
 * `ios/` anywhere, but the Swift compile needs Xcode, which needs macOS.
 *
 * The build is deliberately unsigned and simulator-only — a check that the
 * web bundle, the Swift package and every Capacitor plugin fit together, not a
 * distributable. Shipping to a device or the App Store means signing in Xcode
 * with your own team.
 *
 * The scheme it builds is the committed `App.xcscheme`: Xcode keeps schemes in
 * per-user `xcuserdata/`, which no clone carries, and it will not accept a
 * derived data path without one — so the shared copy is what lets this run on a
 * machine that has never opened the project.
 *
 *   node scripts/ios-build.mjs
 *   # output: ios/App/build/Build/Products/Release-iphonesimulator/App.app
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { repoRoot } from "./toolchain.mjs";

if (process.platform !== "darwin") {
  console.error("✗ iOS builds need macOS and Xcode; sync the project anywhere with `npx cap sync ios`.");
  process.exit(1);
}

const version = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" });
if (version.status !== 0) {
  console.error("✗ xcodebuild not found. Install Xcode and run: sudo xcode-select -s /Applications/Xcode.app");
  process.exit(1);
}
console.log(`  ${`${version.stdout}`.split("\n")[0]}`);

const project = join(repoRoot, "ios", "App", "App.xcodeproj");
if (!existsSync(project)) {
  console.error("✗ ios/App/App.xcodeproj is missing. Run: npx cap add ios");
  process.exit(1);
}

const result = spawnSync(
  "xcodebuild",
  [
    "-project",
    project,
    "-scheme",
    "App",
    "-configuration",
    "Release",
    "-sdk",
    "iphonesimulator",
    // A generic simulator destination keeps the build off any particular
    // installed runtime, which a CI runner has no opinion about.
    "-destination",
    "generic/platform=iOS Simulator",
    "-derivedDataPath",
    join(repoRoot, "ios", "App", "build"),
    "CODE_SIGNING_ALLOWED=NO",
    "CODE_SIGNING_REQUIRED=NO",
    "build",
  ],
  { stdio: "inherit" }
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log("\n✓ ios/App/build/Build/Products/Release-iphonesimulator/App.app");
