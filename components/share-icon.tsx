/**
 * The share glyph, shared by every share control (the card, the expanded
 * chapter, the floating bar and the share dialog): three connected nodes, the
 * shape the system share sheets use. The old "box with an arrow out of the top"
 * reads as an upload or a save, not a share.
 *
 * Drawn as strokes to match the rest of the icon set, in a 24×24 box.
 */
export function ShareIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="17.5" cy="5.5" r="2.6" />
      <circle cx="17.5" cy="18.5" r="2.6" />
      <circle cx="6.5" cy="12" r="2.6" />
      {/* The two links, stopping at the circles rather than crossing them. */}
      <path d="m8.74 10.68 6.52-3.86M8.74 13.32l6.52 3.86" />
    </svg>
  );
}
