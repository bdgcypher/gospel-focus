"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { BookmarkIcon } from "./bookmark-icon";
import { Glyph } from "./glyph";
import { useFavorites } from "@/lib/favorites";
import { featureById } from "@/lib/features";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** The hamburger sheet: navigation to the pages behind the picker. */
export function MenuPanel({ open, onClose }: Props) {
  const favorites = useFavorites();
  // The stats entry's own name and line come from the catalog, so the menu and
  // the page it opens cannot describe it differently.
  const stats = featureById("stats");
  const streak = featureById("streak");
  const journal = featureById("journal");

  // Escape closes the pane, like any other dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <motion.button
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            className="relative z-10 flex h-full w-full max-w-sm flex-col border-l border-border bg-background shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
              <h2 className="font-serif text-lg font-semibold text-foreground">Menu</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full border border-border bg-surface-2 p-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                <CloseIcon />
              </button>
            </header>

            {/* Top to bottom: the reader's own shelf first (what they saved
                and what they wrote), then the run those readings build, then
                the two places that spend and explain it, and settings last as
                the least frequented door. */}
            <nav className="space-y-2 px-5 py-4">
              <MenuLink
                href="/favorites"
                onClick={onClose}
                // The bookmark is only filled in once something is saved, so
                // the menu itself says whether the shelf is empty.
                icon={<BookmarkIcon filled={favorites.length > 0} />}
                label="Favorites"
                hint={
                  favorites.length === 0
                    ? "No passages saved yet"
                    : `${favorites.length} saved ${favorites.length === 1 ? "passage" : "passages"}`
                }
              />
              {/* Named from the catalog like the two below it, so the menu
                  cannot go on calling a page unbuilt after it ships. */}
              <MenuLink
                href={journal?.href ?? "/journal"}
                onClick={onClose}
                icon={<Glyph name={journal?.icon ?? "journal"} />}
                label="Journal"
                hint={journal?.blurb ?? "Your own words, kept beside the verses"}
              />
              <MenuLink
                href={streak?.href ?? "/streak"}
                onClick={onClose}
                icon={<Glyph name="flame" />}
                label={streak?.title ?? "Streak"}
                hint={streak?.blurb ?? "The days in a row, and the freezes that protect them"}
              />
              {/* The shop sits under the streak because that is where a reader
                  is sent to it: the refill sheet's "Get Gems" points here, and
                  the menu is the way back for someone who is not short yet. */}
              <MenuLink
                href="/shop"
                onClick={onClose}
                icon={<Glyph name="gem" />}
                label="Shop"
                hint="Gems, streak freezes, and Gospel Focus Plus"
              />
              <MenuLink
                href={stats?.href ?? "/stats"}
                onClick={onClose}
                icon={<Glyph name={stats?.icon ?? "chart"} />}
                label={stats?.title ?? "Stats & Progress"}
                hint={stats?.blurb ?? "Streaks, passages, cards, and time studied"}
              />
              <MenuLink
                href="/settings"
                onClick={onClose}
                icon={<SettingsIcon />}
                label="Settings"
                hint="Theme, motion, reminders, and saved passages"
              />
            </nav>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function MenuLink({
  href,
  onClick,
  icon,
  label,
  hint,
}: {
  href: string;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-accent/60"
    >
      <span className="text-accent-strong">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      <ChevronIcon />
    </Link>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" />
    </svg>
  );
}
