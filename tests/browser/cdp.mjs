import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/**
 * The browser half of the suite: launch Chromium, drive it over the DevTools
 * protocol, and report in the same shape as the unit tests.
 *
 * No Playwright, no Puppeteer: the protocol is a WebSocket and a handful of
 * commands, and the app is the thing under test — a browser automation package
 * would add a second browser to keep in step with the one the app actually runs
 * in. `CHROME_BIN` picks the binary; otherwise the usual names are searched.
 *
 * The suite drives the *exported* app (see server.mjs). Scenarios are plain
 * modules: `{ name, run(ctx) }`, and each one starts from a cleared profile so
 * the order they run in can't change the result.
 */

/** A port nothing is listening on, for Chrome's debugger. */
export async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const CANDIDATES = [
  process.env.CHROME_BIN,
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
  "chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

export function findChrome() {
  for (const candidate of CANDIDATES) {
    if (candidate.includes("/") && fs.existsSync(candidate)) return candidate;
    try {
      const found = execFileSync("which", [candidate], { encoding: "utf8" }).trim();
      if (found) return found;
    } catch {
      // Try the next name.
    }
  }
  throw new Error("No Chromium found. Set CHROME_BIN to the browser to test with.");
}

/** Launch the browser and wait until its debugger answers. */
export async function launch(port) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gospel-focus-test-"));
  const child = spawn(
    findChrome(),
    [
      "--headless=new",
      // The suite runs on machines where the sandbox is unavailable (containers,
      // CI), and this browser only ever loads the app's own exported files.
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--window-size=430,932",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${base}/json/version`);
      if (response.ok) {
        return {
          child,
          base,
          stop: () => {
            child.kill("SIGKILL");
            // The kill ends the browser, not its children at once: a renderer
            // can still be writing into the profile while the directory is
            // being taken away. Retrying is the difference between a suite that
            // reports its checks and one that throws on the way out.
            fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
          },
        };
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  child.kill("SIGKILL");
  throw new Error("Chromium did not open its debugger port.");
}

/** One page, connected. */
export async function connect(base) {
  const target = await (
    await fetch(`${base}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })
  ).json();

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  /** Every uncaught error on the page, so a scenario can assert there were none. */
  const errors = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      errors.push(details.exception?.description ?? details.text);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId += 1;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`timed out: ${method}`));
      }, 30_000);
    });

  await send("Page.enable");
  await send("Runtime.enable");

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Run an expression in the page and return its value.
   *
   * Awaiting a promise is on: a scenario should be able to read a file the app
   * fetched without a second round trip. A thrown error in the page comes back
   * as a test failure with the message, never as a silent undefined.
   */
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.result?.exceptionDetails) {
      const details = response.result.exceptionDetails;
      throw new Error(details.exception?.description ?? details.text);
    }
    return response.result?.result?.value;
  };

  const goto = async (url, wait = 2200) => {
    await send("Page.navigate", { url });
    await sleep(wait);
  };

  const close = () => socket.close();
  return { send, evaluate, goto, sleep, errors, close };
}

/**
 * The assertions, in the shape the rest of the suite uses: one line per check,
 * a list of the ones that failed, and an exit code at the end.
 */
export function checker() {
  const failures = [];
  const check = (label, ok, detail = "") => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
    if (!ok) failures.push(label);
  };
  return { failures, check };
}
