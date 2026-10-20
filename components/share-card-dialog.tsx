"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isNative } from "@/lib/external";
import { copyNativeImage, shareNativeFiles } from "@/lib/native-files";
import { ShareIcon } from "./share-icon";
import {
  buildShareImages,
  cardFileName,
  copyImage,
  downloadImage,
  type ShareCard,
  type ShareImage,
} from "@/lib/share-image";

interface Props {
  open: boolean;
  card: ShareCard;
  onClose: () => void;
}

/**
 * How far apart the whole-set downloads are fired. Browsers drop downloads that
 * arrive in the same tick — a twelve-image set saved only the first ten — so
 * they go out one every 200ms, well inside what a click's user activation and
 * the download manager can take in turn.
 */
const DOWNLOAD_GAP_MS = 200;

/** The rendered images plus the card they were rendered from, so a preview is
 *  never shown next to a selection it doesn't match. */
interface Rendered {
  key: string;
  images: ShareImage[];
}

export function ShareCardDialog({ open, card, onClose }: Props) {
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which image the preview (and the single-image actions) are pointed at. */
  const [page, setPage] = useState(0);
  const native = isNative();

  const cardKey = JSON.stringify(card);

  // Render whenever the dialog opens or the selection changes. A long selection
  // comes back as several pages. The state lands in a promise callback (never
  // synchronously in the effect body), and the preview below simply isn't shown
  // until the render matches the current card.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    buildShareImages(card)
      .then((images) => {
        if (!cancelled) {
          setRendered({ key: cardKey, images });
          setPage(0);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't create the image.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, card, cardKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const images = rendered && rendered.key === cardKey ? rendered.images : null;
  const pages = images?.length ?? 0;
  const current = Math.min(page, Math.max(pages - 1, 0));
  const image = images?.[current] ?? null;
  /** Every image of the set, named in order, for the whole-set actions. */
  const files = () =>
    (images ?? []).map((each, i) => ({ name: cardFileName(card.title, i + 1, pages), base64: each.base64 }));
  const fileName = cardFileName(card.title, current + 1, pages);
  const many = pages > 1;

  // On device the images are written to the app cache and handed to the system
  // share sheet, which is also how they reach the user's own storage (Files,
  // Drive, Photos…). The browser half of each action stays as it was.
  const onShare = async (which: "all" | "one") => {
    if (!images || !image) return;
    setBusy(true);
    const outcome = await shareNativeFiles(which === "all" ? files() : [{ name: fileName, base64: image.base64 }], {
      title: card.title,
      dialogTitle: "Share passage",
    });
    setStatus(
      outcome === "done"
        ? which === "all" && many
          ? `Shared ${pages} images.`
          : "Shared."
        : outcome === "cancelled"
          ? null
          : "Sharing isn't available on this device — try Copy image instead."
    );
    setBusy(false);
  };

  const onCopy = async () => {
    if (!image) return;
    setBusy(true);
    const ok = native
      ? await copyNativeImage({ name: fileName, base64: image.base64 })
      : await copyImage(image.blob);
    setStatus(
      ok
        ? "Copied to the clipboard."
        : native
          ? "Copying isn't available on this device — use Share instead."
          : "Copying isn't available here — save the image instead."
    );
    setBusy(false);
  };

  const onDownload = (which: "all" | "one") => {
    if (!images || !image) return;
    if (which === "all") {
      // Spaced out: see DOWNLOAD_GAP_MS. The status still reports the whole
      // set, because every one of them has been handed to the browser by then.
      images.forEach((each, i) => {
        const name = cardFileName(card.title, i + 1, pages);
        if (i === 0) downloadImage(each.blob, name);
        else window.setTimeout(() => downloadImage(each.blob, name), i * DOWNLOAD_GAP_MS);
      });
    } else {
      downloadImage(image.blob, fileName);
    }
    setStatus(which === "all" && many ? `Saved ${pages} images.` : "Saved the image.");
  };

  // The card lives inside an animated, overflow-hidden article; a portal keeps
  // the dialog out of that containing block entirely.
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close share dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Share Passage"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl sm:max-w-2xl lg:max-w-3xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
              <h2 className="font-serif text-lg font-semibold text-foreground">Share Passage</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full border border-border bg-surface-2 p-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                <CloseIcon />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex min-h-40 items-center justify-center rounded-2xl border border-border bg-surface-2/60 p-3">
                {image ? (
                  // The exact PNG that will be shared, inline as a data URL.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.dataUrl}
                    alt={`Preview of the shareable image for ${card.title}`}
                    className="max-h-[45vh] w-auto rounded-lg border border-border shadow-[0_18px_44px_-30px_rgba(0,0,0,0.7)] sm:max-h-[62vh] lg:max-h-[70vh]"
                  />
                ) : (
                  <p className="text-sm text-muted">{error ?? "Preparing the image…"}</p>
                )}
              </div>

              {/* A long selection comes back as a set: the strip picks which
                  image to look at, and which one the single-image actions act
                  on. */}
              {many && images && (
                <>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPage(i)}
                        aria-pressed={i === current}
                        aria-label={`Show image ${i + 1} of ${pages}`}
                        className={`h-8 min-w-8 rounded-full border px-2.5 text-xs font-semibold tabular-nums transition-colors ${
                          i === current
                            ? "border-accent/60 bg-accent/15 text-accent-strong"
                            : "border-border bg-surface-2 text-muted hover:border-accent/60 hover:text-accent-strong"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-center text-xs text-muted">
                    Image {current + 1} of {pages}
                  </p>
                </>
              )}

              <div className="mt-4 flex flex-col gap-2.5">
                {native && (
                  <button
                    type="button"
                    onClick={() => void onShare("all")}
                    disabled={!image || busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cta px-4 py-3 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShareIcon />
                    {many ? `Share all ${pages} images` : "Share…"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void onCopy()}
                  disabled={!image || busy}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${
                    native
                      ? "border border-border bg-surface-2 text-foreground hover:border-accent/60"
                      : "bg-cta text-cta-contrast hover:opacity-90"
                  }`}
                >
                  <CopyIcon />
                  Copy image
                </button>

                {/* A WebView has no download manager, so on device the share
                    sheet above is the way a card leaves the app. */}
                {!native && (
                  <button
                    type="button"
                    onClick={() => onDownload("all")}
                    disabled={!image}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <DownloadIcon />
                    {many ? `Download all ${pages} images` : "Download PNG"}
                  </button>
                )}

                {/* The set is the default, so one image at a time is the
                    quieter, secondary choice. */}
                {many && (
                  <button
                    type="button"
                    onClick={() => (native ? void onShare("one") : onDownload("one"))}
                    disabled={!image || busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-accent-strong transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {native ? "Share just this image" : "Download just this image"}
                  </button>
                )}
              </div>

              {status && <p className="mt-3 text-center text-xs text-muted">{status}</p>}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2.2" />
      <path d="M15 9V6.2A2.2 2.2 0 0 0 12.8 4H6.2A2.2 2.2 0 0 0 4 6.2v6.6A2.2 2.2 0 0 0 6.2 15H9" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11m0 0-4-4m4 4 4-4" />
      <path d="M5 18.5h14" />
    </svg>
  );
}
