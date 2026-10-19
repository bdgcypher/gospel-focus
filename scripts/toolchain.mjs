/**
 * Where the two binaries the Android build needs live, and how to find them.
 *
 * Nothing in the repo hardcodes a machine path: an SDK may come from the
 * environment (`JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`) or from the
 * gitignored `.toolchain/` directory the bootstrap fills in. Both are checked,
 * the environment first, so a copy of the portable toolchain keeps working and
 * an Android Studio install keeps working too.
 *
 * `android/local.properties` is deliberately not required. Gradle's Android
 * plugin falls back to `ANDROID_HOME` when that file is absent, which is what
 * lets a clone build on a new machine without one being written first; the
 * bootstrap still writes it so Android Studio's own Gradle sync agrees.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const isWindows = process.platform === "win32";

/** The JDK the Gradle build compiles against (see capacitor.build.gradle). */
export const REQUIRED_JAVA_MAJOR = 21;

/** The SDK packages the build reads; CI installs the same list. */
export const REQUIRED_SDK_PACKAGES = ["platform-tools", "platforms;android-36", "build-tools;36.0.0"];

/** The gitignored directory the bootstrap provisions, unless told otherwise. */
export function toolchainDir() {
  return resolve(process.env.GOSPEL_FOCUS_TOOLCHAIN ?? join(repoRoot, ".toolchain"));
}

/** Adoptium's own directory name, e.g. `jdk-21.0.12.1+1`. */
export function jdkDirs() {
  const dir = toolchainDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith("jdk-"))
    .map((name) => join(dir, name));
}

function javaBinary(home) {
  return join(home, "bin", isWindows ? "java.exe" : "java");
}

/** The major version, or null when this home has no runnable java. */
export function javaMajor(home) {
  if (!existsSync(javaBinary(home))) return null;
  const result = spawnSync(javaBinary(home), ["-version"], { encoding: "utf8" });
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const match = text.match(/version "(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * The first usable JDK: `JAVA_HOME`, then the provisioned copy from newest to
 * oldest. Returns null rather than throwing so the caller can install one.
 */
export function resolveJavaHome({ minimum = REQUIRED_JAVA_MAJOR } = {}) {
  const candidates = [
    ...(process.env.JAVA_HOME ? [process.env.JAVA_HOME] : []),
    ...jdkDirs().reverse(),
  ];
  for (const home of candidates) {
    const major = javaMajor(home);
    if (major !== null && major >= minimum) return home;
  }
  return null;
}

function hasPackage(sdk, name) {
  return existsSync(join(sdk, ...name.split(";")));
}

export function sdkIsComplete(sdk) {
  return REQUIRED_SDK_PACKAGES.every((name) => hasPackage(sdk, name));
}

/** The SDK the Gradle build should use, or null when none is installed. */
export function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(toolchainDir(), "android-sdk"),
  ].filter(Boolean);
  return candidates.find((sdk) => sdkIsComplete(sdk)) ?? null;
}

/** Where `sdkmanager` lives inside an SDK, provisioned or not. */
export function sdkManagerPath(sdk) {
  return join(sdk, "cmdline-tools", "latest", "bin", isWindows ? "sdkmanager.bat" : "sdkmanager");
}

/** A copy of `process.env` with the toolchain on `JAVA_HOME`, `ANDROID_HOME`, and `PATH`. */
export function toolchainEnv({ javaHome, sdk }) {
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const parts = [
    javaHome && join(javaHome, "bin"),
    sdk && join(sdk, "platform-tools"),
    process.env[pathKey] ?? "",
  ].filter(Boolean);
  return {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    ...(sdk ? { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } : {}),
    [pathKey]: parts.join(isWindows ? ";" : ":"),
  };
}
