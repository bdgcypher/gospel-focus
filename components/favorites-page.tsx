"use client";

import Link from "next/link";
import { AppShell } from "./app-shell";
import { BackLink } from "./back-link";
import { isNative, openExternal } from "@/lib/external";
import { clearFavorites, removeFavorite, useFavorites } from "@/lib/favorites";

export function FavoritesPage() {
  const favorites = useFavorites();

  const subtitle =
    favorites.length === 0
      ? "Passages you star are kept here"
      : `${favorites.length} saved ${favorites.length === 1 ? "passage" : "passages"}`;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:max-w-5xl sm:px-6 sm:py-10">
        <div className="mt-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-2xl font-semibold text-foreground sm:text-3xl">
              Favorites
            </h2>
            <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
          </div>
          <BackLink />
        </div>

        {favorites.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border px-6 py-16 text-center">
            <span className="mx-auto block text-accent/40">
              <StarIcon />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">No favorites yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Tap the star on any passage and it will show up here.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
            >
              Find a passage
            </Link>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {favorites.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-col rounded-3xl border border-border bg-surface p-5 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.7)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-serif text-lg font-semibold text-accent-strong">
                        {f.reference}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted">{f.sourceLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFavorite(f.id)}
                      aria-label={`Remove ${f.reference} from favorites`}
                      title="Remove from favorites"
                      className="-mr-1 -mt-1 shrink-0 rounded-full border border-border bg-surface-2 p-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
                    >
                      <TrashIcon />
                    </button>
                  </div>

                  <blockquote className="mt-3 flex-1 border-l-2 border-accent/40 pl-3">
                    <p className="font-serif text-[0.98rem] leading-relaxed text-foreground/85">
                      {f.text}
                    </p>
                  </blockquote>

                  {f.url && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (isNative()) {
                          e.preventDefault();
                          void openExternal(f.url);
                        }
                      }}
                      className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
                    >
                      <LinkIcon />
                      {f.urlLabel}
                    </a>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={clearFavorites}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                <TrashIcon />
                Clear all favorites
              </button>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m1.5 0-.6 12.1A1.5 1.5 0 0 1 14.4 20.5H9.6a1.5 1.5 0 0 1-1.5-1.4L7.5 7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </svg>
  );
}
