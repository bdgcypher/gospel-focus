/**
 * Generate the dark-mode Android icon resources for Gospel Focus.
 *
 * Produces, from app/icon.svg (the single source of truth):
 *
 *  - night-qualified `mipmap-night-<density>` icon variants: dark background
 *    (#13100b) with the light accent book (#e0b45c) — used by launchers that
 *    honor night-mode resource qualifiers (best effort; support varies by
 *    launcher).
 *  - `drawable/ic_launcher_monochrome.xml` + a `<monochrome>` layer in the
 *    adaptive icon XMLs: the official Android 13+ "themed icon" support.
 *    The launcher tints this book silhouette with the wallpaper-derived
 *    theme color, which is how dark mode is officially expressed.
 *  - restores the flat `android:windowBackground` on the launch and app themes.
 *    `@capacitor/assets` points the launch theme at `@drawable/splash`, a
 *    bitmap; Android stretches a bitmap window background to fill whatever
 *    window paints it, which showed the splash artwork squashed into the
 *    status-bar strip above the WebView.
 *  - re-applies the no-title flags on the launch theme. On API 31+
 *    `Theme.SplashScreen` re-parents to the platform DeviceDefault splash
 *    theme, which has a window title bar, so without these the activity label
 *    renders as a band above the WebView.
 *
 * Run after re-generating the light assets:
 *   npx @capacitor/assets generate android --assetPath app \
 *     --iconBackgroundColor "#f7f2e7" --splashBackgroundColor "#f7f2e7"
 *   npm run icons:dark
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const RES = join(ROOT, "android/app/src/main/res");
const ICON_SVG = join(ROOT, "app/icon.svg");

const LIGHT_BG = "#f7f2e7";
const DARK_BG = "#13100b";
const LIGHT_STROKE = "#9a6b1f";
const DARK_STROKE = "#e0b45c";

const svg = readFileSync(ICON_SVG, "utf8");

const bgReplacements = svg.match(new RegExp(LIGHT_BG, "gi"))?.length ?? 0;
const strokeReplacements = svg.match(new RegExp(LIGHT_STROKE, "gi"))?.length ?? 0;
if (bgReplacements === 0 || strokeReplacements === 0) {
  console.error(
    `icon.svg no longer contains the expected colors ` +
      `(background ${LIGHT_BG}: ${bgReplacements}, stroke ${LIGHT_STROKE}: ${strokeReplacements}). ` +
      `Update the color constants in this script.`
  );
  process.exit(1);
}

const darkSvg = svg
  .replace(new RegExp(LIGHT_BG, "gi"), DARK_BG)
  .replace(new RegExp(LIGHT_STROKE, "gi"), DARK_STROKE);
const darkBuffer = Buffer.from(darkSvg);

const PAD = 8; // same transparent padding the light legacy icons use

/** Replicates @capacitor/assets' legacy icon pipeline with the dark SVG. */
async function legacyIcon(w, h) {
  return sharp(darkBuffer)
    .resize(w, h)
    .resize(Math.max(0, w - PAD * 2), Math.max(0, h - PAD * 2))
    .extend({
      top: PAD,
      bottom: PAD,
      left: PAD,
      right: PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/** Replicates @capacitor/assets' round icon pipeline: circular mask. */
async function roundIcon(w, h) {
  const circle = Buffer.from(
    `<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="#ffffff"/></svg>`
  );
  return sharp(darkBuffer)
    .resize(w, h)
    .composite([{ input: circle, blend: "dest-in" }])
    .png()
    .toBuffer();
}

// --- Night-qualified PNG variants ------------------------------------------

const densities = ["ldpi", "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
let written = 0;

for (const density of densities) {
  const lightDir = join(RES, `mipmap-${density}`);
  const nightDir = join(RES, `mipmap-night-${density}`);
  if (!existsSync(lightDir)) continue;
  mkdirSync(nightDir, { recursive: true });

  const dims = async (name) => {
    const file = join(lightDir, name);
    if (!existsSync(file)) return null;
    const meta = await sharp(file).metadata();
    return { w: meta.width, h: meta.height };
  };

  const legacy = await dims("ic_launcher.png");
  if (legacy) {
    writeFileSync(join(nightDir, "ic_launcher.png"), await legacyIcon(legacy.w, legacy.h));
    written++;
  }

  const round = await dims("ic_launcher_round.png");
  if (round) {
    writeFileSync(join(nightDir, "ic_launcher_round.png"), await roundIcon(round.w, round.h));
    written++;
  }

  const fg = await dims("ic_launcher_foreground.png");
  if (fg) {
    const buf = await sharp(darkBuffer).resize(fg.w, fg.h).png().toBuffer();
    writeFileSync(join(nightDir, "ic_launcher_foreground.png"), buf);
    written++;
  }

  const bg = await dims("ic_launcher_background.png");
  if (bg) {
    const buf = await sharp({
      create: { width: bg.w, height: bg.h, channels: 4, background: DARK_BG },
    })
      .png()
      .toBuffer();
    writeFileSync(join(nightDir, "ic_launcher_background.png"), buf);
    written++;
  }
}

// --- Monochrome (Android 13+ themed icons) layer ----------------------------

const paths = [...svg.matchAll(/<path\s+d="([^"]+)"/g)].map((m) => m[1]);
const strokeWidth = svg.match(/stroke-width="([\d.]+)"/)?.[1] ?? "2.6";
const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
if (paths.length === 0 || !viewBox) {
  console.error("Could not parse paths/viewBox out of app/icon.svg");
  process.exit(1);
}

const pathXml = paths
  .map(
    (d) => `    <path
        android:pathData="${d}"
        android:fillColor="#00000000"
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="${strokeWidth}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round" />`
  )
  .join("\n");

const monochromeXml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Monochrome layer for Android 13+ themed icons: launchers tint this
     silhouette with the wallpaper-derived theme color (dark mode friendly).
     Generated by scripts/generate-android-icons.mjs from app/icon.svg. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${viewBox[1]}dp"
    android:height="${viewBox[2]}dp"
    android:viewportWidth="${viewBox[1]}"
    android:viewportHeight="${viewBox[2]}">
${pathXml}
</vector>
`;

mkdirSync(join(RES, "drawable"), { recursive: true });
writeFileSync(join(RES, "drawable/ic_launcher_monochrome.xml"), monochromeXml);

const monoLayer = `    <monochrome>
        <inset android:drawable="@drawable/ic_launcher_monochrome" android:inset="16.7%" />
    </monochrome>
`;

for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  const file = join(RES, "mipmap-anydpi-v26", name);
  if (!existsSync(file)) continue;
  let xml = readFileSync(file, "utf8");
  if (!xml.includes("<monochrome")) {
    xml = xml.replace(/<\/adaptive-icon>\s*$/, monoLayer + "</adaptive-icon>\n");
    writeFileSync(file, xml);
  }
}

// --- Window / launch background ---------------------------------------------
//
// @capacitor/assets rewrites the launch theme back to the legacy
// `android:background="@drawable/splash"` bitmap every time it runs, so undo
// that here and keep both themes on the flat @color/splashBackground instead.

const WINDOW_BACKGROUND = [
  "android:windowBackground",
  `        <item name="android:windowBackground">@color/splashBackground</item>`,
];
// On API 31+ Theme.SplashScreen drops the no-title flags its pre-31 variant
// inherits, leaving a platform title bar with the activity label above the app.
const NO_TITLE = [
  ["android:windowNoTitle", `        <item name="android:windowNoTitle">true</item>`],
  ["windowNoTitle", `        <item name="windowNoTitle">true</item>`],
  ["windowActionBar", `        <item name="windowActionBar">false</item>`],
];

const withStyleItems = (xml, styleName, items) => {
  const block = new RegExp(`(<style name="${styleName}"[^>]*>)([\\s\\S]*?)(</style>)`);
  return xml.replace(block, (match, open, body, close) => {
    const missing = items.filter(([attr]) => !body.includes(`name="${attr}"`));
    if (missing.length === 0) return match;
    const added = missing.map(([, item]) => item).join("\n");
    return `${open}${body.replace(/\s*$/, "\n")}${added}\n    ${close}`;
  });
};

// values/styles.xml is rewritten by @capacitor/assets; values-v31/styles.xml
// is ours, but keep both on the same item set.
const stylePatches = [
  {
    file: join(RES, "values/styles.xml"),
    stripLegacyBackground: true,
    styles: [
      { name: "AppTheme.NoActionBar", items: [WINDOW_BACKGROUND] },
      { name: "AppTheme.NoActionBarLaunch", items: [WINDOW_BACKGROUND, ...NO_TITLE] },
    ],
  },
  {
    file: join(RES, "values-v31/styles.xml"),
    stripLegacyBackground: false,
    styles: [{ name: "AppTheme.NoActionBarLaunch", items: [WINDOW_BACKGROUND, ...NO_TITLE] }],
  },
];

for (const { file, stripLegacyBackground, styles } of stylePatches) {
  if (!existsSync(file)) continue;
  const before = readFileSync(file, "utf8");
  let xml = stripLegacyBackground
    ? before
        .replace(/\s*<item name="android:background">@drawable\/splash<\/item>/g, "")
        .replace(/\s*<item name="android:background">@null<\/item>/g, "")
    : before;
  for (const style of styles) xml = withStyleItems(xml, style.name, style.items);
  if (xml !== before) {
    writeFileSync(file, xml);
    console.log(`Window theme: window background/no-title restored in ${file.slice(RES.length + 1)}`);
  }
}

// The flat background lives in these files; warn loudly if any went missing
// (e.g. after re-generating the native project) so the squashed-artwork bug
// cannot come back unnoticed.
const requiredWindowResources = [
  "values/colors.xml",
  "values-night/colors.xml",
  "values-v31/styles.xml",
  "drawable/splash_icon.xml",
  "drawable-night/splash_icon.xml",
];
const missing = requiredWindowResources.filter((name) => !existsSync(join(RES, name)));
if (missing.length > 0) {
  console.error(`Missing window/splash resources, restore them from git: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Night icons: ${written} PNGs written across ${densities.length} densities`);
console.log("Monochrome layer: drawable/ic_launcher_monochrome.xml + adaptive icon XMLs");
