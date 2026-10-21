"use client";

import { useCountUp } from "@/lib/count-up";

/**
 * The ten digits as one continuous strip, with the nought repeated at the end
 * so the wheel can turn from 9 back to 0 without a gap. The extra 0 is the only
 * thing that makes a column read as a wheel rather than as a list that jumps
 * back to the top.
 */
const STRIP = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/**
 * A number that rolls up like a mechanical counter: each place is its own
 * column, and the units wheel spins with the value while the higher wheels
 * turn only as the wheel below them carries. Every wheel is held on its own
 * digit everywhere else, which is what lets a settled 24 rest square on the 2
 * and the 4 while still turning as it arrives — and what makes 20 and 1,000
 * both finish in the same fixed beat (lib/count-up.ts).
 *
 * The wheels are hidden from assistive tech and the settled number is given
 * once in their place, so a screen reader hears the number rather than every
 * frame of the animation. In the header the link's own label already carries
 * the reading; on /streak this is the number.
 *
 * The column width is one `ch` and the numerals are tabular, so a column keeps
 * its width as it turns. Columns left of the value's own magnitude are not
 * drawn — the number grows from "0" to "500" the way a written number does,
 * instead of arriving padded with noughts.
 */
export function RollingNumber({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const shown = useCountUp(value);
  const settled = Math.max(0, Math.round(value));
  // The wheels turn on the unrounded value so the roll is smooth; how many
  // places to draw is decided by the rounded one, so a column appears on the
  // carry rather than a frame later.
  const magnitude = Math.max(0, Math.round(shown));
  const places: number[] = [];
  for (let place = 10 ** Math.max(0, String(magnitude).length - 1); place >= 1; place /= 10) {
    places.push(place);
  }

  return (
    <span className={`inline-flex items-center tabular-nums ${className}`}>
      <span className="sr-only">{settled}</span>
      <span aria-hidden="true" className="inline-flex overflow-hidden">
        {places.map((place) => {
          const turn = turnFor(shown, place);
          return (
            <span key={place} className="relative block h-[1em] w-[1ch] overflow-hidden">
              <span
                className="absolute inset-x-0 top-0 flex flex-col"
                style={{ transform: `translateY(-${turn}em)` }}
              >
                {STRIP.map((digit, index) => (
                  <span
                    key={`${digit}-${index}`}
                    className="flex h-[1em] items-center justify-center leading-none"
                  >
                    {digit}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/**
 * Where one wheel has turned to, counted in digits.
 *
 * The units wheel turns with the value itself, so it moves smoothly through the
 * whole roll. Every wheel above it holds square on its own digit until the
 * wheel below is nine-tenths of the way round, then turns the one place as that
 * wheel carries — the last tenth, eased in and out so the carry has a shape
 * rather than a snap. Turning every wheel with the value would leave a settled
 * 24 resting on 2.4 and 4, half a digit between two numbers; turning only on
 * the carry leaves it resting on the digits themselves.
 */
function turnFor(value: number, place: number): number {
  if (place === 1) return value % 10;
  const digit = Math.floor(value / place) % 10;
  const below = (value % place) / place;
  const carry = Math.min(1, Math.max(0, (below - 0.9) / 0.1));
  return digit + carry * carry * (3 - 2 * carry);
}
