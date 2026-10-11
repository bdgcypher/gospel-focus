"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Passage } from "@/lib/types";
import { isNative, openExternal } from "@/lib/external";

interface Props {
  passage: Passage;
  /** Changes on every new draw so the card re-animates. */
  drawKey: number;
}

export function PassageCard({ passage, drawKey }: Props) {
  const [expanded, setExpanded] = useState(false);
  const highlightRef = useRef<HTMLParagraphElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (expanded && highlightRef.current) {
      // Let the height animation start before scrolling.
      const id = window.setTimeout(
        () => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        320
      );
      return () => window.clearTimeout(id);
    }
  }, [expanded]);

  const isScripture = passage.kind === "scripture";

  return (
    <motion.article
      key={drawKey}
      // Rises into place as the landed page settles away, rather than morphing
      // out of it: travelling between the page and the card means scaling the
      // card, which stretched the passage text on the way. Fading up with a
      // short drift keeps every glyph at its final size.
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 26, mass: 0.9 }}
      className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_24px_70px_-40px_rgba(0,0,0,0.6)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

      <div className="p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {passage.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted"
            >
              {chip}
            </span>
          ))}
        </div>

        <h2 className="font-serif text-xl font-semibold text-accent-strong sm:text-2xl">
          {passage.reference}
        </h2>

        <blockquote className="mt-4 border-l-2 border-accent/50 pl-4 sm:pl-5">
          <p className="font-serif text-[1.15rem] leading-relaxed text-foreground sm:text-[1.3rem]">
            {passage.text}
          </p>
        </blockquote>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            <BookIcon open={expanded} />
            {expanded ? "Collapse" : "Read more"}
          </button>

          <a
            href={passage.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (isNative()) {
                e.preventDefault();
                void openExternal(passage.url);
              }
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
          >
            <LinkIcon />
            {passage.urlLabel}
          </a>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.section
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div ref={scrollRef} className="border-t border-border bg-surface-2/60 px-6 py-6 sm:px-8">
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {passage.expansionTitle}
              </h3>
              {passage.expansionSubtitle && (
                <p className="mt-1 text-sm text-muted">{passage.expansionSubtitle}</p>
              )}

              <div className="mt-5 space-y-3">
                {passage.verses.map((v) => {
                  const active = passage.highlightVerse === v.number;
                  return (
                    <p
                      key={v.number}
                      ref={active ? highlightRef : undefined}
                      className={`flex gap-3 rounded-lg px-2 py-1 font-serif text-[1.02rem] leading-relaxed transition-colors ${
                        active
                          ? "bg-accent/15 text-foreground ring-1 ring-accent/40"
                          : "text-foreground/80"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 select-none text-xs font-semibold tabular-nums text-accent-strong">
                        {isScripture ? v.number : ""}
                      </span>
                      <span>{v.text}</span>
                    </p>
                  );
                })}
              </div>

              <a
                href={passage.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (isNative()) {
                    e.preventDefault();
                    void openExternal(passage.url);
                  }
                }}
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
              >
                <LinkIcon />
                Continue in the Gospel Library
              </a>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function BookIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.5C10 5 7.5 4.3 4.8 4.3A1.3 1.3 0 0 0 3.5 5.6v12.2c0 .7.6 1.3 1.3 1.3 2.7 0 5.2.7 7.2 2.2 2-1.5 4.5-2.2 7.2-2.2.7 0 1.3-.6 1.3-1.3V5.6c0-.7-.6-1.3-1.3-1.3-2.7 0-5.2.7-7.2 2.2Z" />
      <path d="M12 6.5v14.8" />
      {open && <path d="M7 9.5h2.5M7 12.5h2.5" opacity={0.6} />}
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </svg>
  );
}
