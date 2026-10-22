"use client";

import { Glyph } from "./glyph";

/**
 * The drawn cube needs more room than the picture for the same visual weight:
 * the house glyph keeps two units of its 24-unit box as padding, so a 110px box
 * draws a cube about 73px across, against the picture's 84px. The picture's
 * sizes are the ones the wallet has always used.
 */
const SIZES = {
  lg: { drawn: "h-[110px] w-[110px]", picture: "h-[84px] w-[84px]" },
  sm: { drawn: "h-[32px] w-[32px]", picture: "h-6 w-6" },
  xs: { drawn: "h-6 w-6", picture: "h-5 w-5" },
} as const;

/**
 * One streak freeze, drawn in whichever hand the skin uses: the stroke cube in
 * the focused styles, the ice-cube artwork in the playful ones.
 *
 * The two faces are sized separately — the drawing fills a square box, while
 * the picture keeps its own padding — because a single box cannot be right for
 * both. `Glyph`'s picture face is sized from its box, so a box big enough for
 * the drawing would blow the picture up, and a box sized for the picture would
 * strand the drawing in the middle of it. Both faces are rendered and the
 * stylesheet picks one, the way `Glyph` itself swaps, so the skin can flip
 * without a re-render or a mount guard.
 *
 * The picture is a file in public/emoji rather than the 🧊 character: some
 * device emoji fonts draw that codepoint as the bubble tea beside it, and a
 * freeze is the wrong thing to get wrong.
 *
 * `size` names the three places a cube appears: the wallet's own row
 * (components/freeze-cubes.tsx), the refill sheet's smaller copy
 * (components/streak-page.tsx), and the shop's buy badges
 * (components/shop-page.tsx). `held` is false for a slot still waiting for a
 * freeze, which quiets the ink and, under the playful styles, fades the emoji.
 */
export function FreezeCube({
  held = true,
  size = "lg",
  className = "",
}: {
  held?: boolean;
  size?: "lg" | "sm" | "xs";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`freeze-cube inline-flex shrink-0 items-center justify-center ${
        held ? "text-foreground" : "freeze-cube-empty text-muted/70"
      } ${className}`}
    >
      <Glyph
        name="ice"
        plain
        className={`freeze-cube-drawn ${SIZES[size].drawn}`}
      />
      {/* Shipped as-is and already sized by the box around it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/emoji/ice-cube.png"
        alt=""
        aria-hidden="true"
        className={`freeze-cube-emoji ${SIZES[size].picture}`}
      />
    </span>
  );
}

