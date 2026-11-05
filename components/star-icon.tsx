/**
 * The mark of a saved passage: a star, filled once it is on the shelf.
 *
 * It is a star rather than a bookmark because the app now keeps two different
 * things — a passage the reader starred, and a place in the text they set a
 * ribbon in (components/bookmarks-dialog.tsx). Two jobs need two shapes, and
 * the ribbon belongs to the place.
 *
 * The filled state is the same path painted in rather than a second drawing:
 * the difference between "saved" and "not" is a press that has already
 * happened, and two different outlines would make the reader compare shapes
 * instead of reading a state.
 */
export function StarIcon({
  filled = false,
  className = "h-5 w-5",
}: {
  /** Saved: the star is solid, where "not saved" is an outline. */
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
      <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8Z" />
    </svg>
  );
}
