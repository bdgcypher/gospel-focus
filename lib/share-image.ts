"use client";

export interface ShareCard {
  /** Serif heading, e.g. "1 Nephi 3:7" or "“The Wind and the Waves”". */
  title: string;
  /** Small line under the title, e.g. "Book of Mormon" or the speaker line. */
  subtitle?: string;
  /** The passage body — one entry per shared verse/paragraph. */
  lines: { label?: string; text: string }[];
  /** Small footer line, e.g. "Open to Inspiration". */
  footer: string;
}

/** The card's colours, taken from the theme the reader is looking at. */
interface Palette {
  bg: string;
  accent: string;
  accentStrong: string;
  ink: string;
  muted: string;
  border: string;
}

/** Fallbacks, matching globals.css, for when the CSS variables can't be read. */
const LIGHT: Palette = {
  bg: "#f7f2e7",
  accent: "#9a6b1f",
  accentStrong: "#7c5514",
  ink: "#2a2118",
  muted: "#7a6b53",
  border: "#e2d6bd",
};

/**
 * The card is drawn in whichever theme is active: the app's own CSS variables
 * are the single source of truth, so the shared image looks like the screen it
 * came from.
 */
function readPalette(): Palette {
  if (typeof document === "undefined") return LIGHT;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    bg: read("--background", LIGHT.bg),
    accent: read("--accent", LIGHT.accent),
    accentStrong: read("--accent-strong", LIGHT.accentStrong),
    ink: read("--foreground", LIGHT.ink),
    muted: read("--muted", LIGHT.muted),
    border: read("--border", LIGHT.border),
  };
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const W = 1080;
const PAD = 92;
const INNER = W - PAD * 2;

const TITLE_FONT = `600 56px ${SERIF}`;
const SUBTITLE_FONT = `400 28px ${SANS}`;
const BODY_FONT = `400 42px ${SERIF}`;
const LABEL_FONT = `600 36px ${SERIF}`;
const FOOTER_FONT = `400 26px ${SANS}`;

const TITLE_LH = 68;
const SUBTITLE_LH = 38;
const BODY_LH = 62;
const LABEL_W = 78;

/** The app mark, drawn from the same paths as components/logo.tsx (48×48 box). */
const LOGO_BOX = 48;
const LOGO_SIZE = 34;
const LOGO_GAP = 14;
const LOGO_PATHS: { d: string; alpha: number }[] = [
  {
    d: "M24 12.5c-3.4-2.3-7.7-3.4-12.6-3.4-1.4 0-2.4 1-2.4 2.4v22.2c0 1.4 1 2.4 2.4 2.4 4.6 0 8.9 1 12.6 3.2 3.7-2.2 8-3.2 12.6-3.2 1.4 0 2.4-1 2.4-2.4V11.5c0-1.4-1-2.4-2.4-2.4-4.9 0-9.2 1.1-12.6 3.4Z",
    alpha: 1,
  },
  { d: "M24 12.5v26.8", alpha: 1 },
  { d: "M24 6.5c-.6-.7-1.5-1.1-2.5-1.4M24 6.5c.6-.7 1.5-1.1 2.5-1.4", alpha: 0.85 },
  { d: "M24 5.2V3.1M17.6 6.1 16.5 4.3M30.4 6.1l1.1-1.8", alpha: 0.9 },
];

type Op =
  | { kind: "rule"; x: number; y: number; w: number; color: string; h: number }
  | { kind: "text"; text: string; font: string; color: string; x: number; y: number }
  | { kind: "logo"; x: number; y: number; size: number };

/** Greedy word-wrap against the measuring context at the given font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, font: string, maxWidth: number): string[] {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Walks the card once, producing the drawing ops and the exact canvas height. */
function layout(ctx: CanvasRenderingContext2D, card: ShareCard, palette: Palette): { ops: Op[]; height: number } {
  const ops: Op[] = [];
  const hasLabels = card.lines.some((l) => l.label);
  const bodyWidth = INNER - (hasLabels ? LABEL_W : 0);

  let y = PAD;
  ops.push({ kind: "rule", x: PAD, y, w: 72, h: 6, color: palette.accent });
  y += 30;

  const titleLines = wrap(ctx, card.title, TITLE_FONT, INNER);
  titleLines.forEach((text, i) => {
    ops.push({ kind: "text", text, font: TITLE_FONT, color: palette.accentStrong, x: PAD, y: y + i * TITLE_LH });
  });
  y += titleLines.length * TITLE_LH;

  if (card.subtitle) {
    y += 8;
    ops.push({ kind: "text", text: card.subtitle, font: SUBTITLE_FONT, color: palette.muted, x: PAD, y });
    y += SUBTITLE_LH;
  }

  y += 30;
  ops.push({ kind: "rule", x: PAD, y, w: INNER, h: 2, color: palette.border });
  y += 46;

  for (const line of card.lines) {
    const lines = wrap(ctx, line.text, BODY_FONT, bodyWidth);
    if (hasLabels) {
      ops.push({ kind: "text", text: line.label ?? "", font: LABEL_FONT, color: palette.accent, x: PAD, y });
    }
    lines.forEach((text, i) => {
      ops.push({
        kind: "text",
        text,
        font: BODY_FONT,
        color: palette.ink,
        x: PAD + (hasLabels ? LABEL_W : 0),
        y: y + i * BODY_LH,
      });
    });
    y += lines.length * BODY_LH + 30;
  }

  y += 14;
  ops.push({ kind: "rule", x: PAD, y, w: INNER, h: 2, color: palette.border });
  y += 40;
  // The footer is the mark plus the app name, baseline-aligned with the text.
  ops.push({ kind: "logo", x: PAD, y: y - 5, size: LOGO_SIZE });
  ops.push({
    kind: "text",
    text: card.footer,
    font: FOOTER_FONT,
    color: palette.muted,
    x: PAD + LOGO_SIZE + LOGO_GAP,
    y,
  });
  y += 34 + PAD;

  return { ops, height: Math.round(y) };
}

export interface ShareImage {
  /** The PNG, for sharing, copying, or saving. */
  blob: Blob;
  /** The same PNG as a data URL, so the preview needs no object-URL lifecycle. */
  dataUrl: string;
}

/** Render the card to a PNG at a shareable size, in the active theme. */
export async function buildShareImage(card: ShareCard): Promise<ShareImage> {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("Canvas is not available.");

  const palette = readPalette();
  const { ops, height } = layout(probe, card, palette);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = "top";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const op of ops) {
    if (op.kind === "rule") {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.kind === "text") {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x, op.y);
    } else {
      const scale = op.size / LOGO_BOX;
      ctx.save();
      ctx.translate(op.x, op.y);
      ctx.scale(scale, scale);
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2.1;
      for (const path of LOGO_PATHS) {
        ctx.globalAlpha = path.alpha;
        ctx.stroke(new Path2D(path.d));
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Could not export the image."))),
      "image/png"
    );
  });
  return { blob, dataUrl: canvas.toDataURL("image/png") };
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "passage";

/** The suggested file name for a card, e.g. "1-nephi-3-7.png". */
export function cardFileName(title: string): string {
  return `${slug(title)}.png`;
}

/** Hand the image to the OS share sheet. */
export async function shareImage(
  blob: Blob,
  fileName: string,
  title: string
): Promise<"shared" | "cancelled" | "unsupported"> {
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (typeof nav.share !== "function" || !nav.canShare?.({ files: [file] })) return "unsupported";

  try {
    await nav.share({ files: [file], title, text: title });
    return "shared";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}

/** Copy the image itself to the clipboard. False when the browser can't. */
export async function copyImage(blob: Blob): Promise<boolean> {
  const ctor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!ctor || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ctor({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Save the image as a file. */
export function downloadImage(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
