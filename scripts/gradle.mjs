#!/usr/bin/env node
/**
 * Run Gradle with this checkout's own toolchain, on any OS.
 *
 * `npm run cap:apk` used to be `cd android && ./gradlew assembleRelease`, which
 * only works in a POSIX shell and only when JAVA_HOME and ANDROID_HOME are
 * already exported. This wrapper finds the JDK and SDK the bootstrap
 * provisioned (or the ones the environment names), sets both, and picks
 * `gradlew.bat` on Windows — so the same npm script builds on every machine.
 *
 *   node scripts/gradle.mjs assembleRelease
 *   node scripts/gradle.mjs clean assembleDebug
 */
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { isWindows, repoRoot, resolveAndroidSdk, resolveJavaHome, toolchainEnv } from "./toolchain.mjs";

const args = process.argv.slice(2);
if (args.length === 0) args.push("assembleRelease");

const javaHome = resolveJavaHome();
if (!javaHome) {
  console.error("✗ No JDK 21 found. Run: npm run bootstrap");
  process.exit(1);
}
const sdk = resolveAndroidSdk();
if (!sdk) {
  console.error("✗ No Android SDK found. Run: npm run bootstrap");
  process.exit(1);
}

const android = join(repoRoot, "android");
const env = toolchainEnv({ javaHome, sdk });
const result = isWindows
  ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", join(android, "gradlew.bat"), ...args], {
      cwd: android,
      stdio: "inherit",
      env,
    })
  : spawnSync(join(android, "gradlew"), args, { cwd: android, stdio: "inherit", env });

process.exit(result.status ?? 1);
