"use client";

import { useEffect, useMemo, useState } from "react";

interface Props {
  /** How long to riffle before the passage settles. */
  durationMs: number;
  /** Snippets cycled through the pages. */
  teasers: string[];
}

/**
 * The "being opened to a random place" animation: a stack of pages fans across
 * the book, riffling quickly and then slowing down until they come to rest.
 */
export function RifflingPages({ durationMs, teasers }: Props) {
  const [tick, setTick] = useState(0);
  const [flipSeconds, setFlipSeconds] = useState(0.55);
  const pages = useMemo(
    () => [0, 1, 2, 3, 4].map((i) => ({ i, delay: -(i * 0.13) })),
    []
  );

  useEffect(() => {
    const start = performance.now();
    let timeout: ReturnType<typeof setTimeout>;
    let lastFlip = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      setTick((n) => n + 1);
      // Pages (and the flickering text) slow down as we approach the target.
      const interval = 55 + 360 * t * t;
      const now = performance.now();
      if (now - lastFlip > 150) {
        lastFlip = now;
        setFlipSeconds(0.5 + 1.45 * t);
      }
      timeout = setTimeout(step, interval);
    };
    timeout = setTimeout(step, 45);
    return () => clearTimeout(timeout);
  }, [durationMs]);

  const current = teasers.length ? teasers[tick % teasers.length] : "";

  return (
    <div className="riffling-stage w-full" aria-hidden="true">
      <div className="relative mx-auto h-60 w-full max-w-lg sm:h-64" style={{ transformStyle: "preserve-3d" }}>
        {/* Book body */}
        <div className="absolute inset-0 rounded-2xl border border-border bg-page shadow-[0_20px_60px_-25px_rgba(0,0,0,0.45)]" />
        {/* Spine */}
        <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-spine to-transparent" />

        {/* Left page: flickering snippet */}
        <div className="absolute inset-y-0 left-0 flex w-1/2 items-center overflow-hidden p-5 sm:p-6">
          <p key={tick} className="riffle-line font-serif text-[15px] leading-relaxed text-foreground/75">
            {current}
          </p>
        </div>

        {/* Right page: skeleton lines that stay put behind the flipping pages */}
        <div className="absolute inset-y-0 right-0 w-1/2 space-y-3 p-5 sm:p-6">
          {[92, 76, 88, 60, 80].map((w, i) => (
            <div key={i} className="h-2.5 rounded-full bg-foreground/10" style={{ width: `${w}%` }} />
          ))}
        </div>

        {/* Flipping pages */}
        {pages.map(({ i, delay }) => (
          <div
            key={i}
            className="flip-page absolute inset-y-0 left-1/2 right-0 rounded-r-2xl border border-l-0 border-page-edge bg-page"
            style={{
              animationDelay: `${delay}s`,
              animationDuration: `${flipSeconds}s`,
              boxShadow: "0 6px 20px -12px rgba(0,0,0,0.5)",
            }}
          >
            <div className="space-y-3 p-5 opacity-70 sm:p-6">
              {[80, 66, 90, 54].map((w, j) => (
                <div key={j} className="h-2.5 rounded-full bg-foreground/10" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">
        Opening to a passage…
      </p>
    </div>
  );
}
