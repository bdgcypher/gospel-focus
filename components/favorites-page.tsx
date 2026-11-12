"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { BackLink } from "./back-link";
import { Glyph } from "./glyph";
import { NoteDialog } from "./note-dialog";
import { SaveToDeckDialog } from "./save-to-deck-dialog";
import { isNative, openExternal } from "@/lib/external";
import { clearFavorites, removeFavorite, useFavorites, type Favorite } from "@/lib/favorites";
import { isInternalHref } from "@/lib/journal-links";
import { itemFromFavorite, useMemory } from "@/lib/memorize";
import { noteFor, noteHtml, removeNote, saveNote, useNotes } from "@/lib/notes";
import { storedPassageHref } from "@/lib/reader";

/** How many verses a card shows before it offers to expand. */
const COLLAPSE_AFTER = 3;

export function FavoritesPage() {
  const favorites = useFavorites();

  // A link from the journal names a note in the fragment (`#<favorite id>`),
  // which is what brings the reader to the card it is written on. The list is
  // drawn after the first paint — the favorites come out of storage — so the
  // scroll happens once they are there rather than when the page loads.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !favorites.length) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [favorites]);

  const subtitle =
    favorites.length === 0
      ? "Saved passages are kept here"
      : `${favorites.length} saved ${favorites.length === 1 ? "passage" : "passages"}`;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:max-w-5xl sm:px-6 sm:py-10">
        {/* The way back on its own line, the title under it starting at the
            page's left edge — the shape every page header in the app takes, as
            components/feature-page.tsx sets it out. The arrow's box is drawn
            10px left and 8px up so its drawing, not its invisible edge, is what
            sits at the top left corner, and 24px of air separate it from the
            heading below. */}
        <div className="-ml-2.5 -mt-2 flex">
          <BackLink />
        </div>
        <div className="min-w-0">
          <h2 className="mt-6 font-serif text-2xl font-semibold text-foreground sm:text-3xl">
            Favorites
          </h2>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>

        {favorites.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border px-6 py-16 text-center">
            <span className="mx-auto block text-accent/40">
              <Glyph name="heart" className="mx-auto h-10 w-10" />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">No favorites yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Tap the heart on any passage and it will show up here.
            </p>
            <Link
              href="/passage"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-cta px-5 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90"
            >
              Find a passage
            </Link>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {favorites.map((f) => (
                <FavoriteCard key={f.id} favorite={f} />
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

/**
 * One saved favorite. A multi-verse favorite shows each verse on its own line,
 * labelled like the share preview; once it runs past a few, only the first few
 * are shown and the rest wait behind an expand toggle.
 */
function FavoriteCard({ favorite }: { favorite: Favorite }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  /** The deck picker, for taking this passage on as a card. */
  const [deckOpen, setDeckOpen] = useState(false);
  const notes = useNotes();
  const note = noteFor(notes, favorite.id);
  const memory = useMemory();
  const inMemory = memory.some((item) => item.id === favorite.id);
  /** The card this passage would become, for the deck picker to file. */
  const draft = useMemo(() => itemFromFavorite(favorite), [favorite]);
  const parts = favorite.parts ?? [];
  const multi = parts.length > 1;
  const collapsible = parts.length > COLLAPSE_AFTER;
  const shown = collapsible && !expanded ? parts.slice(0, COLLAPSE_AFTER) : parts;
  const unit = favorite.kind === "scripture" ? "verse" : "paragraph";
  /**
   * The saved passage in the reader, with every verse (or paragraph) the card
   * covers marked there — a run or a scattered pick alike. A favorite is a
   * passage rather than a quotation: the chapter it was taken from is one tap
   * away, so the card reads in place as well as here.
   */
  const href = storedPassageHref({
    kind: favorite.kind,
    book: favorite.book,
    chapter: favorite.chapter,
    verses: favorite.sections ?? (favorite.section ? [favorite.section] : undefined),
    url: favorite.url,
  });

  return (
    <li
      id={favorite.id}
      className="flex flex-col rounded-3xl border border-border bg-surface p-5 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.7)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The reference is the passage's name, so it is the link: naming a
              passage in this app has always meant opening it in the reader. */}
          <h2 className="font-serif text-lg font-semibold text-accent-strong">
            {href ? (
              <Link href={href} className="hover:underline">
                {favorite.reference}
              </Link>
            ) : (
              favorite.reference
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{favorite.sourceLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => removeFavorite(favorite.id)}
          aria-label={`Remove ${favorite.reference} from favorites`}
          title="Remove from favorites"
          className="-mr-1 -mt-1 shrink-0 rounded-full border border-border bg-surface-2 p-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
        >
          <TrashIcon />
        </button>
      </div>

      <blockquote className="mt-3 flex-1 border-l-2 border-accent/40 pl-3">
        {multi ? (
          <div className="space-y-2">
            {shown.map((part) => (
              <p key={part.number} className="flex gap-2 font-serif text-[0.98rem] leading-relaxed text-foreground/85">
                <span className="mt-0.5 w-5 shrink-0 select-none text-xs font-semibold tabular-nums text-accent-strong">
                  {favorite.kind === "scripture" ? part.number : `\u00b6${part.number}`}
                </span>
                <span>{part.text}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="font-serif text-[0.98rem] leading-relaxed text-foreground/85">
            {favorite.text}
          </p>
        )}
      </blockquote>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 self-start text-xs font-medium text-accent-strong hover:underline"
        >
          {expanded ? "Show less" : `Show all ${parts.length} ${unit}s`}
        </button>
      )}

      {/* The reader's own words about the passage, when they have written any.
          Shown before the row of actions, because the note is about the passage
          above it rather than an action on it. */}
      {note && (
        <div className="mt-3 rounded-2xl border border-accent/30 bg-accent/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-strong">
            Notes
          </p>
          {note.title && (
            <p className="mt-1 font-serif text-base font-semibold text-foreground">{note.title}</p>
          )}
          {/* Sanitized on the way in and again on the way out: what is in
              storage is data, and data is not trusted with the page's DOM. */}
          <div
            className="journal-body mt-1 text-sm leading-relaxed text-foreground/85"
            onClick={(event) => {
              // A link in the note is part of stored HTML, so following it as an
              // anchor would load a whole document — and the packaged app
              // answers an unrouted path with the home page. In-app links are
              // followed the app's way, as in the notes panel.
              const anchor = (event.target as Element | null)?.closest?.("a");
              if (!anchor) return;
              const href = anchor.getAttribute("href") ?? "";
              if (!isInternalHref(href)) return;
              event.preventDefault();
              router.push(href);
            }}
            dangerouslySetInnerHTML={{ __html: noteHtml(note.text) }}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
          >
            <Glyph name="book" className="h-4 w-4" />
            Read
          </Link>
        )}

        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
        >
          <Glyph name="journal" className="h-4 w-4" />
          {note ? "Edit note" : "Add a note"}
        </button>

        {favorite.url && (
          <a
            href={favorite.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (isNative()) {
                e.preventDefault();
                void openExternal(favorite.url);
              }
            }}
            className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
          >
            <LinkIcon />
            {favorite.urlLabel}
          </a>
        )}

        {/* The bridge from reading to learning by heart: a favorited passage is
            one tap from a deck, which the picker asks for. There is no default
            shelf to inherit — a card belongs to a deck the reader made. The
            picker opens even once the passage is saved, because a card can sit
            in several decks and that is also where it is taken back out. */}
        <button
          type="button"
          aria-pressed={inMemory}
          title={`Choose decks for ${favorite.reference}`}
          onClick={() => setDeckOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
        >
          <Glyph name="cards" className="h-4 w-4" />
          {inMemory ? "In Memorize" : "Memorize"}
        </button>
      </div>

      <SaveToDeckDialog
        open={deckOpen}
        onClose={() => setDeckOpen(false)}
        draft={draft}
      />

      <NoteDialog
        // Remounted per opening so the field starts from the stored note.
        key={noteOpen ? `${favorite.id}:${note?.text ?? ""}:${note?.title ?? ""}` : "note-closed"}
        open={noteOpen}
        title={favorite.reference}
        source={favorite.sourceLabel}
        passage={favorite.text}
        initial={note?.text ?? ""}
        initialTitle={note?.title ?? ""}
        onSave={(text, title) => saveNote(favorite, text, title)}
        onDelete={note ? () => removeNote(favorite.id) : undefined}
        onClose={() => setNoteOpen(false)}
      />
    </li>
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
