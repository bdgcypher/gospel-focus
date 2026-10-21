/**
 * The mark of a saved passage: a bookmark, filled once it is on the shelf.
 *
 * One drawing for the whole app rather than a copy per screen. A passage is
 * saved from the card, counted in the menu, and collected on the favorites
 * page, and the reader has to recognise it as the same action in all three —
 * so the shape lives here and everything else imports it.
 *
 * The filled state is the same path painted in rather than a second drawing:
 * the difference between "on the shelf" and "not" is a press that has already
 * happened, and two different outlines would make the reader compare shapes
 * instead of reading a state. It is still the same bookmark either way.
 */
export function BookmarkIcon({
  filled = false,
  className = "h-5 w-5",
}: {
  /** Saved: the ribbon is solid, where "not saved" is an outline. */
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.75 4.6A1.6 1.6 0 0 1 8.35 3h7.3a1.6 1.6 0 0 1 1.6 1.6V21l-5.25-3.65L6.75 21V4.6Z" />
    </svg>
  );
}
