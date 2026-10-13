"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isNative } from "@/lib/external";
import {
  buildShareImage,
  cardFileName,
  copyImage,
  downloadImage,
  shareImage,
  type ShareCard,
  type ShareImage,
} from "@/lib/share-image";

interface Props {
  open: boolean;
  card: ShareCard;
  onClose: () => void;
}

/** The rendered image plus the card it was rendered from, so a preview is never
 *  shown next to a selection it doesn't match. */
interface Rendered {
  key: string;
  image: ShareImage;
}

export function ShareCardDialog({ open, card, onClose }: Props) {
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const native = isNative();

  const cardKey = JSON.stringify(card);

  // Render whenever the dialog opens or the selection changes. The state lands
  // in a promise callback (never synchronously in the effect body), and the
  // preview below simply isn't shown until the render matches the current card.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    buildShareImage(card)
      .then((image) => {
        if (!cancelled) {
          setRendered({ key: cardKey, image });
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

  const image = rendered && rendered.key === cardKey ? rendered.image : null;
  const fileName = cardFileName(card.title);

  const onShare = async () => {
    if (!image) return;
    setBusy(true);
    const result = await shareImage(image.blob, fileName, card.title);
    setStatus(
      result === "shared"
        ? "Shared."
        : result === "cancelled"
          ? null
          : "Sharing isn't available here — copy or save the image instead."
    );
    setBusy(false);
  };

  const onCopy = async () => {
    if (!image) return;
    setBusy(true);
    const ok = await copyImage(image.blob);
    setStatus(ok ? "Copied to the clipboard." : "Copying isn't available here — save the image instead.");
    setBusy(false);
  };

  const onDownload = () => {
    if (!image) return;
    downloadImage(image.blob, fileName);
    setStatus(native ? "Saved. Check your Downloads." : "Saved the image.");
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
            aria-label="Share passage"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl sm:max-w-2xl lg:max-w-3xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
              <h2 className="font-serif text-lg font-semibold text-foreground">Share passage</h2>
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

              <div className="mt-4 flex flex-col gap-2.5">
                {native && (
                  <button
                    type="button"
                    onClick={() => void onShare()}
                    disabled={!image || busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShareIcon />
                    Share…
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void onCopy()}
                  disabled={!image || busy}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${
                    native
                      ? "border border-border bg-surface-2 text-foreground hover:border-accent/60"
                      : "bg-accent text-accent-contrast hover:opacity-90"
                  }`}
                >
                  <CopyIcon />
                  Copy image
                </button>

                <button
                  type="button"
                  onClick={onDownload}
                  disabled={!image}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DownloadIcon />
                  {native ? "Save image" : "Download PNG"}
                </button>
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

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V4m0 0L8 8m4-4 4 4" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
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
