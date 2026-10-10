export function OpenBookLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* open book */}
      <path d="M24 12.5c-3.4-2.3-7.7-3.4-12.6-3.4-1.4 0-2.4 1-2.4 2.4v22.2c0 1.4 1 2.4 2.4 2.4 4.6 0 8.9 1 12.6 3.2 3.7-2.2 8-3.2 12.6-3.2 1.4 0 2.4-1 2.4-2.4V11.5c0-1.4-1-2.4-2.4-2.4-4.9 0-9.2 1.1-12.6 3.4Z" />
      <path d="M24 12.5v26.8" />
      <path d="M24 6.5c-.6-.7-1.5-1.1-2.5-1.4M24 6.5c.6-.7 1.5-1.1 2.5-1.4" opacity={0.85} />
      {/* rays */}
      <path d="M24 5.2V3.1M17.6 6.1 16.5 4.3M30.4 6.1l1.1-1.8" opacity={0.9} />
    </svg>
  );
}
