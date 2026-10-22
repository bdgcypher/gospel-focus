/**
 * The face beside "Not Quite!" when a round is lost.
 *
 * The 🫤 character, shipped as a picture. It is the newest emoji in the app,
 * and the device fonts that misdraw the brain, the green square, the puzzle
 * piece and the ice cube put the dotted-line face after it in its place. A
 * result card is the wrong place to look undecided about what happened, so the
 * face comes from the app's own file (public/emoji/not-quite.png) instead of
 * from the phone's font.
 *
 * Sized in `em` and nudged down the baseline, so it sits in a heading exactly
 * where the character it replaces would have sat, whatever size the card sets.
 */
export function NotQuiteFace({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/emoji/not-quite.png"
      alt=""
      aria-hidden="true"
      className={`inline-block h-[1.15em] w-[1.15em] translate-y-[0.16em] align-baseline ${className}`}
    />
  );
}
