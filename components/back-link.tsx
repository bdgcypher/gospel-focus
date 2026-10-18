"use client";

import { useRouter } from "next/navigation";

interface Props {
  /**
   * Where to go when there is no screen behind this one: a page opened straight
   * from a bookmark, a reminder, or a link, where the tab has nothing to go
   * back to. The hub is the safe landing place — the reader arrives somewhere
   * in the app rather than on a blank page.
   */
  fallbackHref?: string;
}

/**
 * The history move behind every back control: one screen back, or the hub when
 * this tab has nothing behind it.
 *
 * Going back is the reader's place, not the app's front door. Someone who opens
 * favourites from the reader expects the passage again, and someone who reaches
 * a planned feature from the study hub expects the hub — a fixed destination
 * quietly loses where they were. The browser's own history is what "back" means
 * everywhere else, forward button included.
 *
 * `history.length` is the count of entries this tab holds, so one means the page
 * is the first thing opened in it. That is the only case that needs a
 * destination of its own.
 */
export function useGoBack(fallbackHref = "/") {
  const router = useRouter();

  return () => {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };
}

/**
 * The icon-only back control, shown inline with a page's heading.
 *
 * It is a button rather than a link because where it leads depends on this tab's
 * history, so there is no href to offer a middle-click or a new tab.
 */
export function BackLink({ fallbackHref = "/" }: Props) {
  const goBack = useGoBack(fallbackHref);

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back to the previous screen"
      title="Back"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
    >
      <ChevronLeftIcon />
    </button>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
