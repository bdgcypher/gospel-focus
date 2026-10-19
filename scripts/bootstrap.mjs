#!/usr/bin/env node
/**
 * Make this machine able to build Gospel Focus, in one command.
 *
 * A clone already carries everything that can travel through git: the source,
 * the lockfile, the 9.7 MB passage library, the Gradle wrapper, and both native
 * projects. What it cannot carry is the two binaries the Android build reads
 * (a JDK 21 and an Android SDK), the npm packages, and the release key. This
 * script fills in the first three — downloaded for this OS and CPU rather than
 * copied from another machine — and imports the fourth from the same secrets CI
 * uses, so a new machine is a clone plus `npm run bootstrap`.
 *
 *   node scripts/bootstrap.mjs              # toolchain, npm ci, web build, cap sync
 *   node scripts/bootstrap.mjs --build      # ...then assemble the release APK
 *   node scripts/bootstrap.mjs --toolchain ~/toolchains/gospel-focus
 *   node scripts/bootstrap.mjs --force-install
 *
 * Everything lands in the gitignored `.toolchain/` (or `$GOSPEL_FOCUS_TOOLCHAIN`),
 * so it can be deleted and rebuilt at any time. Signing needs
 * ANDROID_KEYSTORE_B64 and its three companions in the environment; with none
 * set the build is simply unsigned, which is fine for a local test.
 *
 * iOS is the one half that cannot be provisioned here: `cap sync ios` copies the
 * web app into `ios/` on any OS, but compiling it needs macOS and Xcode. On a
 * Mac this script checks for Xcode and `npm run ios:build` does the rest.
 */
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inflateRawSync } from "node:zlib";
import { spawnSync } from "node:child_process";

import {
  REQUIRED_JAVA_MAJOR,
  REQUIRED_SDK_PACKAGES,
  isWindows,
  javaMajor,
  repoRoot,
  resolveAndroidSdk,
  resolveJavaHome,
  sdkIsComplete,
  sdkManagerPath,
  toolchainDir,
  toolchainEnv,
} from "./toolchain.mjs";

/** Pinned so two machines provision the same command-line tools. */
const CMDLINE_TOOLS_VERSION = "13114758";

const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const valueOf = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const requestedToolchain = valueOf("--toolchain");
if (requestedToolchain) process.env.GOSPEL_FOCUS_TOOLCHAIN = resolve(requestedToolchain);
const root = toolchainDir();

const npm = isWindows ? "npm.cmd" : "npm";
const npx = isWindows ? "npx.cmd" : "npx";

function log(message) {
  console.log(`  ${message}`);
}

function step(message) {
  console.log(`\n▸ ${message}`);
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

/** Run a command and let it own the terminal; throw on a non-zero exit. */
function run(command, args, options = {}) {
  const result =
    isWindows && /\.(bat|cmd)$/i.test(command)
      ? // .bat files need cmd.exe; spawning them directly fails on Windows.
        spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command, ...args], {
          stdio: "inherit",
          ...options,
        })
      : spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? result.signal}`);
  }
}

/** Stream a download to disk, reporting the size so a slow link is visible. */
async function download(url, file, label) {
  if (existsSync(file)) {
    log(`${label}: reusing the download already in ${root}`);
    return;
  }
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`${label}: HTTP ${response.status} from ${url}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  // Download beside the destination and rename only once it is whole, so an
  // interrupted run cannot leave a file the next run would trust and reuse.
  const partial = `${file}.part`;
  await fs.rm(partial, { force: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  await fs.rename(partial, file);
  const size = (await fs.stat(file)).size;
  log(`${label}: ${megabytes(size)}${total > size ? ` of ${megabytes(total)}` : ""}`);
}

/**
 * Read a .zip in pure Node. The SDK's command-line tools only come as a zip,
 * and `unzip` is not installed everywhere (`tar` on GNU systems cannot read
 * one), so depending on an external tool here is what would break a fresh
 * machine. Stored and deflated entries are all these archives use.
 */
function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0 && offset >= buffer.length - 66_000; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("not a zip archive");
}

async function extractZip(archive, destination) {
  const buffer = await fs.readFile(archive);
  const end = findEndOfCentralDirectory(buffer);
  const entries = buffer.readUInt16LE(end + 10);
  if (entries === 0xffff) throw new Error(`${archive} is a zip64 archive, which this script cannot read`);

  const root = resolve(destination);
  let offset = buffer.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`damaged zip directory in ${archive}`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const mode = buffer.readUInt32LE(offset + 38) >>> 16;
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    const target = resolve(root, name);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new Error(`unsafe path in ${archive}: ${name}`);
    }
    if (name.endsWith("/")) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new Error(`unsupported compression method ${method} in ${archive}: ${name}`);

    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    // sdkmanager and friends have to stay executable, so honour the zip's
    // own unix mode instead of writing everything 0644.
    if (mode & 0o111) await fs.chmod(target, 0o755);
  }
}

/** tar covers .tar.gz everywhere (Windows ships it); zips are read in Node. */
function extract(archive, destination) {
  if (archive.endsWith(".zip")) return extractZip(archive, destination);
  const tar = spawnSync("tar", ["-xzf", archive, "-C", destination], { stdio: "ignore" });
  if (tar.status !== 0) throw new Error(`could not extract ${archive} — is tar installed?`);
}

/** Adoptium's download names differ from Node's platform and arch names. */
const ADOPTIUM_OS = { linux: "linux", darwin: "mac", win32: "windows" };
const ADOPTIUM_ARCH = { x64: "x64", arm64: "aarch64" };

async function ensureJava() {
  const found = resolveJavaHome();
  if (found) {
    log(`JDK ${javaMajor(found)}: ${found}`);
    return found;
  }

  const os = ADOPTIUM_OS[process.platform];
  const arch = ADOPTIUM_ARCH[process.arch];
  if (!os || !arch) fail(`no JDK ${REQUIRED_JAVA_MAJOR} download for ${process.platform}/${process.arch}`);

  const extension = process.platform === "win32" ? "zip" : "tar.gz";
  const url = `https://api.adoptium.net/v3/binary/latest/${REQUIRED_JAVA_MAJOR}/ga/${os}/${arch}/jdk/hotspot/normal/eclipse`;
  log(`no JDK ${REQUIRED_JAVA_MAJOR}+ found — downloading Temurin ${REQUIRED_JAVA_MAJOR} (${os}/${arch})`);
  const archive = join(root, `.jdk-download.${extension}`);
  await download(url, archive, "JDK");
  await extract(archive, root);
  await fs.rm(archive, { force: true });

  const installed = resolveJavaHome();
  if (!installed) fail("the downloaded JDK did not contain a usable java");
  log(`JDK ${javaMajor(installed)}: ${installed}`);
  return installed;
}

/** Command-line tools, licences, and the three SDK packages the build reads. */
async function ensureAndroidSdk(javaHome) {
  const found = resolveAndroidSdk();
  if (found) {
    log(`Android SDK: ${found}`);
    return found;
  }

  const sdk = join(root, "android-sdk");
  await fs.mkdir(sdk, { recursive: true });

  let manager = sdkManagerPath(sdk);
  if (!existsSync(manager)) {
    const platform = { linux: "linux", darwin: "mac", win32: "win" }[process.platform];
    if (!platform) fail(`no Android command-line tools for ${process.platform}`);
    const url = `https://dl.google.com/android/repository/commandlinetools-${platform}-${CMDLINE_TOOLS_VERSION}_latest.zip`;
    log("no Android SDK found — downloading the command-line tools");
    const archive = join(root, ".cmdline-tools-download.zip");
    const staging = join(root, ".cmdline-tools-extract");
    await download(url, archive, "command-line tools");
    await fs.rm(staging, { recursive: true, force: true });
    await extract(archive, staging);
    await fs.rm(join(sdk, "cmdline-tools", "latest"), { recursive: true, force: true });
    await fs.mkdir(join(sdk, "cmdline-tools"), { recursive: true });
    await fs.rename(join(staging, "cmdline-tools"), join(sdk, "cmdline-tools", "latest"));
    await fs.rm(staging, { recursive: true, force: true });
    await fs.rm(archive, { force: true });
    manager = sdkManagerPath(sdk);
    // A zip made on Windows may carry no unix mode; sdkmanager still has to run.
    if (!isWindows) await fs.chmod(manager, 0o755).catch(() => {});
  }

  const env = toolchainEnv({ javaHome, sdk });
  log("accepting the SDK licences");
  const licences = spawnSync(manager, [`--sdk_root=${sdk}`, "--licenses"], {
    env,
    input: "y\n".repeat(60),
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (licences.status !== 0) fail("sdkmanager could not accept the SDK licences");
  log(`installing ${REQUIRED_SDK_PACKAGES.join(", ")}`);
  run(manager, [`--sdk_root=${sdk}`, ...REQUIRED_SDK_PACKAGES], { env });
  if (!sdkIsComplete(sdk)) fail("the SDK is still missing a package the build reads");
  log(`Android SDK: ${sdk}`);
  return sdk;
}

/**
 * Gradle reads the SDK path from this gitignored file, and Android Studio's
 * own Gradle sync reads it too. Gradle itself would fall back to ANDROID_HOME,
 * so the build does not depend on it — this just makes both paths agree.
 */
async function writeLocalProperties(sdk) {
  const file = join(repoRoot, "android", "local.properties");
  const path = sdk.replace(/\\/g, "/");
  await fs.writeFile(file, `sdk.dir=${path}\n`);
  log(`wrote android/local.properties -> ${path}`);
}

/** Shell snippets for terminals that should build without going through npm. */
async function writeEnvFiles({ javaHome, sdk }) {
  const posix = [
    "# Source this to put the toolchain on JAVA_HOME, ANDROID_HOME and PATH.",
    `export JAVA_HOME="${javaHome}"`,
    `export ANDROID_HOME="${sdk}"`,
    `export ANDROID_SDK_ROOT="${sdk}"`,
    `export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"`,
    "",
  ].join("\n");
  const powershell = [
    "# Dot-source this to put the toolchain on JAVA_HOME, ANDROID_HOME and PATH.",
    `$env:JAVA_HOME = "${javaHome}"`,
    `$env:ANDROID_HOME = "${sdk}"`,
    `$env:ANDROID_SDK_ROOT = "${sdk}"`,
    "$env:PATH = \"$env:JAVA_HOME\\bin;$env:ANDROID_HOME\\platform-tools;$env:PATH\"",
    "",
  ].join("\n");
  await fs.writeFile(join(root, "env.sh"), posix);
  await fs.writeFile(join(root, "env.ps1"), powershell);
}

/**
 * The same handoff CI does: the keystore and its passwords arrive as
 * environment variables, never in the repository. Existing files win, so a
 * machine that already has the key is never overwritten by a stale secret.
 */
async function restoreSigning() {
  const keystore = join(repoRoot, "android", "keystore", "release.keystore");
  const propertiesFile = join(repoRoot, "android", "keystore.properties");
  const base64 = process.env.ANDROID_KEYSTORE_B64;
  if (!base64) {
    log(
      existsSync(keystore) && existsSync(propertiesFile)
        ? `release key already present: ${keystore}`
        : "no release key (ANDROID_KEYSTORE_B64 unset) — release builds will be unsigned"
    );
    return;
  }

  const missing = [
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEYSTORE_KEY_ALIAS",
    "ANDROID_KEYSTORE_KEY_PASSWORD",
  ].filter((name) => !process.env[name]);
  if (missing.length) fail(`ANDROID_KEYSTORE_B64 is set but ${missing.join(", ")} is not`);

  if (existsSync(keystore) && existsSync(propertiesFile)) {
    log(`release key already present: ${keystore}`);
    return;
  }

  await fs.mkdir(join(repoRoot, "android", "keystore"), { recursive: true });
  await fs.writeFile(keystore, Buffer.from(base64, "base64"), { mode: 0o600 });
  const properties = [
    "storeFile=keystore/release.keystore",
    `storePassword=${process.env.ANDROID_KEYSTORE_PASSWORD}`,
    `keyAlias=${process.env.ANDROID_KEYSTORE_KEY_ALIAS}`,
    `keyPassword=${process.env.ANDROID_KEYSTORE_KEY_PASSWORD}`,
    "",
  ].join("\n");
  await fs.writeFile(propertiesFile, properties, { mode: 0o600 });
  log("restored the release keystore from the environment");
}

async function installDependencies() {
  if (existsSync(join(repoRoot, "node_modules")) && !has("--force-install")) {
    log("node_modules already installed — pass --force-install to reinstall");
    return;
  }
  run(npm, ["ci"], { cwd: repoRoot });
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22) {
    fail(`Node 22+ is required (this is ${process.versions.node}); see .nvmrc`);
  }

  step(`Bootstrapping Gospel Focus for ${process.platform}/${process.arch}`);
  await fs.mkdir(root, { recursive: true });

  step("Java");
  const javaHome = await ensureJava();

  step("Android SDK");
  const sdk = await ensureAndroidSdk(javaHome);

  step("Machine-local paths");
  await writeLocalProperties(sdk);
  await writeEnvFiles({ javaHome, sdk });
  await restoreSigning();

  step("JavaScript dependencies");
  await installDependencies();

  step("Web build and native sync");
  run(npm, ["run", "build"], { cwd: repoRoot });
  run(npx, ["cap", "sync"], { cwd: repoRoot });

  if (has("--build")) {
    step("Android release APK");
    run(process.execPath, [join(repoRoot, "scripts", "gradle.mjs"), "assembleRelease"], { cwd: repoRoot });

    if (process.platform === "darwin" && existsSync(join(repoRoot, "ios"))) {
      step("iOS simulator build");
      run(process.execPath, [join(repoRoot, "scripts", "ios-build.mjs")], { cwd: repoRoot });
    }
  }

  console.log(`\n✓ Ready. Toolchain: ${root}`);
  console.log("  npm run dev        # web app at http://localhost:3000");
  if (!has("--build")) console.log("  npm run cap:apk    # release APK");
  if (existsSync(join(repoRoot, "ios"))) {
    console.log(
      process.platform === "darwin"
        ? "  npm run ios:build  # iOS simulator .app (Xcode required)"
        : "  iOS syncs on any OS, but its build needs macOS + Xcode"
    );
  }
  if (root !== join(repoRoot, ".toolchain")) {
    console.log(
      isWindows
        ? `  $env:GOSPEL_FOCUS_TOOLCHAIN = "${root}"  # so later npm scripts find it`
        : `  export GOSPEL_FOCUS_TOOLCHAIN="${root}"  # so later npm scripts find it`
    );
  }
  const envFile = root === join(repoRoot, ".toolchain") ? `.toolchain/${isWindows ? "env.ps1" : "env.sh"}` : join(root, isWindows ? "env.ps1" : "env.sh");
  console.log(isWindows ? `  ${envFile}` : `  source ${envFile}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
