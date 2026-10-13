"use client";

import Link from "next/link";
import { OpenBookLogo } from "./logo";

interface Props {
  onOpenMenu: () => void;
}

/** The app bar, identical on every page: mark, name, and the menu button. */
export function AppHeader({ onOpenMenu }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:max-w-5xl sm:px-6">
        {/* The mark and the name together are the way home from any page. */}
        <Link
          href="/"
          title="Go to the passage picker"
          className="group flex min-w-0 flex-1 items-center gap-3"
        >
          <span className="text-accent-strong">
            <OpenBookLogo className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <h1 className="font-serif text-lg font-semibold leading-tight text-foreground transition-colors group-hover:text-accent-strong sm:text-xl">
              Open to Inspiration
            </h1>
            <p className="hidden text-xs text-muted sm:block">
              Random passages from the Scriptures &amp; General Conference
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          title="Menu"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
        >
          <MenuIcon />
        </button>
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
