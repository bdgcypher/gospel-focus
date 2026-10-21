"use client";

import { FreezeCube } from "./freeze-cube";
import { MAX_FREEZES } from "@/lib/streak";

/**
 * The freezes in hand, drawn as the cubes themselves: one per slot, grey until
 * it is really in hand, with the count spelled out on the badge underneath.
 *
 * It sits *below* the heading and the description that explain it, centred, and
 * much larger than the copy around it: the picture is the answer to "how
 * many?", so it reads after the question rather than before it, with air on
 * both sides of the badge so the row of cubes and the count read as one block
 * rather than crowding the copy above and the buttons below. Shared by the streak
 * page's freeze card and the shop's streak section, so the two places picture
 * the same wallet in the same way.
 *
 * Each cube is a `FreezeCube` (components/freeze-cube.tsx), so the focused
 * styles get the drawn cube and the playful ones keep the emoji.
 *
 * The cubes are decoration: the badge carries the number for a screen reader,
 * and the cubes are hidden, so the count is announced once.
 */
export function FreezeCubes({ freezes }: { freezes: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="flex items-center gap-4" aria-hidden="true">
        {Array.from({ length: MAX_FREEZES }, (_, index) => (
          <FreezeCube key={index} held={index < freezes} />
        ))}
      </span>
      <span className="mt-4 inline-flex items-center rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold tabular-nums text-muted">
        {freezes}/{MAX_FREEZES} Freezes
      </span>
    </div>
  );
}
