/**
 * The mark of a place the reader wants to come back to: a bookmark, filled once
 * the place is kept.
 *
 * One drawing for the app's places rather than a copy per screen: the reader's
 * bar, the scroll's bar, and the bookmarks sheet all open the same list, and the
 * reader has to recognise it as the same control in each — so the shape lives
 * here and everything else imports it. A passage the reader keeps is a different
 * thing, and wears the heart (components/glyph.tsx).
 *
 * The filled state is the same path painted in rather than a second drawing:
 * the difference between "kept" and "not" is a press that has already
 * happened, and two different outlines would make the reader compare shapes
 * instead of reading a state. It is still the same bookmark either way.
 */
export function BookmarkIcon({
  filled = false,
  className = "h-5 w-5",
}: {
  /** Kept: the ribbon is solid, where "not kept" is an outline. */
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
