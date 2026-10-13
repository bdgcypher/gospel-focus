import Link from "next/link";

interface Props {
  href?: string;
}

/** The icon-only back control, shown inline with a page's heading. */
export function BackLink({ href = "/" }: Props) {
  return (
    <Link
      href={href}
      aria-label="Back to the passage picker"
      title="Back"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
    >
      <ChevronLeftIcon />
    </Link>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
