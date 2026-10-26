import fs from "node:fs";
import http from "node:http";
import path from "node:path";

/**
 * A tiny static server for the exported app.
 *
 * The browser suite runs against `out/` — the same bytes the APK and the web
 * build ship — rather than the dev server, so a test that passes is a test of
 * the thing that gets installed. The rules are the ones `next export` with
 * `trailingSlash` produces: a directory is its `index.html`, and a bare path is
 * redirected to the directory so relative assets resolve as they do in the app.
 */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const typeOf = (file) => MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";

/** Only paths inside the export are reachable, however the URL is spelled. */
function resolve(root, pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0]);
  const target = path.normalize(path.join(root, clean));
  if (!target.startsWith(root)) return null;
  return target;
}

export function startServer(root, port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/" && !url.pathname.endsWith("/") && !path.extname(url.pathname)) {
      res.writeHead(308, { location: `${url.pathname}/${url.search}` });
      res.end();
      return;
    }

    let file = resolve(root, url.pathname);
    if (!file) {
      res.writeHead(403).end("no");
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;

    if (!fs.existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }

    res.writeHead(200, {
      "content-type": typeOf(file),
      // Nothing is cached between tests: a stale chunk would make a failure
      // depend on the order the scenarios ran in.
      "cache-control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((ready, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      ready({
        port: address.port,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
