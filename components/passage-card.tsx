"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Passage } from "@/lib/types";
import { isNative, openExternal } from "@/lib/external";
import { StarIcon } from "./star-icon";
import { Glyph } from "./glyph";
import { NoteDialog } from "./note-dialog";
import { SaveToDeckDialog } from "./save-to-deck-dialog";
import { ShareCardDialog } from "./share-card-dialog";
import { ShareIcon } from "./share-icon";
import {
  ensureFavorite,
  favoriteId,
  toggleFavorite,
  useFavorites,
} from "@/lib/favorites";
import { itemFromPassage } from "@/lib/memorize";
import { noteFor, removeNote, saveNote, useNotes } from "@/lib/notes";
import { citationHref } from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import type { ShareCard } from "@/lib/share-image";

interface Props {
  passage: Passage;
  /** Changes on every new draw so the card re-animates. */
  drawKey: number;
}

/** The conference a talk's URL belongs to, as `2015-04`. */
function sessionOf(url: string): string | undefined {
  const match = /\/general-conference\/(\d{4})\/(\d{1,2})\//.exec(url);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}` : undefined;
}

export function PassageCard({ passage, drawKey }: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  /** The memorize sheet, opened on the passage as it was drawn. */
  const [memoryOpen, setMemoryOpen] = useState(false);
  /**
   * Which draw the card's little selector was opened for, if any. The three
   * jobs it holds — a note, saving, sharing — used to stand in the corner as
   * three marks of their own; one button that opens them keeps the card's
   * corner to a single mark and gives each job room for its name.
   *
   * Held as the draw rather than as a plain flag so a new passage shuts it on
   * its own: the selector belongs to the card it was opened over, and the next
   * draw is a new card. Reopening is `setMenuFor(drawKey)`.
   */
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const menuOpen = menuFor === drawKey;
  const closeMenu = () => setMenuFor(null);
  /** The menu button, watched to know when the card's own controls are gone. */
  const moreRef = useRef<HTMLButtonElement | null>(null);
  /** The button and its selector, so a press outside the pair can shut it. */
  const menuRef = useRef<HTMLDivElement | null>(null);

  const favorites = useFavorites();
  const notes = useNotes();
  const prefs = usePreferences();
  const savedId = favoriteId(passage);
  const saved = useMemo(() => favorites.some((f) => f.id === savedId), [favorites, savedId]);
  /** The note on this draw, if the reader has written one on it. */
  const note = noteFor(notes, savedId);

  const isScripture = passage.kind === "scripture";
  /** The card as a memorize save would write it, for the deck picker. */
  const memorizeDraft = useMemo(() => itemFromPassage(passage, undefined, []), [passage]);

  /**
   * The whole chapter, at the verse (or paragraph) that was drawn — the same
   * address the search results and the straplines use. A talk's session comes
   * out of its own URL, because a title alone can be shared by two conferences
   * and only the session says which.
   */
  const readerHref =
    passage.chapter && (passage.kind === "conference" || passage.book)
      ? citationHref({
          kind: passage.kind,
          book: passage.kind === "conference" ? "General Conference" : (passage.book as string),
          chapter: passage.chapter,
          section: passage.section ?? 1,
          conferenceId: sessionOf(passage.url),
        })
      : null;

  const starLabel = saved ? "Remove from favorites" : "Save to favorites";
  const toggleStar = () => toggleFavorite(passage);

  /** The drawn passage, as the image the share sheet is built from. */
  const shareSpec = useMemo<ShareCard>(() => {
    const lines = [
      {
        label: isScripture && passage.highlightVerse ? String(passage.highlightVerse) : undefined,
        text: passage.text,
      },
    ];

    return {
      title: passage.reference,
      // The volume (or the speaker and conference) — deliberately without the
      // chapter's verse count, which says nothing about the words shared.
      subtitle:
        passage.kind === "conference"
          ? passage.expansionSubtitle ?? passage.sourceLabel
          : passage.sourceLabel,
      lines,
      footer: "Gospel Focus",
    };
  }, [passage, isScripture]);

  /**
   * The corner's four jobs, as the selector lists them: write on the passage,
   * take it with you to learn, keep it, send it. Written as a list rather than
   * four buttons in the markup so the selector draws them alike, and so the
   * same four can be read out as a menu by a screen reader.
   *
   * Each carries its own state into the row: a note that exists says "Edit the
   * note", a saved passage says "Remove from favorites", and the row is in the
   * accent colour while it is true of this passage.
   *
   * The order is the order a passage is worked with. Reading the whole chapter
   * and opening it in Gospel Library are not here — they are the two buttons on
   * the card itself, where a reader can see them without opening anything.
   */
  const cardActions: CardAction[] = [
    // Writing a note saves the passage on the way (see the dialog's onSave): a
    // note is kept, and what the app keeps is favorites.
    {
      id: "note",
      label: note ? "Edit the note" : "Add a note",
      icon: <Glyph name="journal" className="h-[18px] w-[18px]" />,
      onSelect: () => setNoteOpen(true),
      active: Boolean(note),
    },
    {
      id: "memorize",
      label: "Memorize",
      icon: <Glyph name="cards" className="h-[18px] w-[18px]" />,
      onSelect: () => setMemoryOpen(true),
    },
    {
      id: "favorite",
      label: starLabel,
      icon: <StarIcon filled={saved} />,
      onSelect: toggleStar,
      active: saved,
    },
    {
      id: "share",
      label: "Share as image",
      icon: <ShareIcon className="h-[18px] w-[18px]" />,
      onSelect: () => setShareOpen(true),
    },
  ];

  /**
   * A press anywhere else shuts the selector, and so does Escape — which also
   * puts the focus back on the button that opened it, since the panel it was
   * in is gone.
   */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuFor(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuFor(null);
      moreRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <motion.article
      key={drawKey}
      // Rises into place as the landed page settles away, rather than morphing
      // out of it: travelling between the page and the card means scaling the
      // card, which stretched the passage text on the way. Fading up with a
      // short drift keeps every glyph at its final size — and with reduced
      // motion the card is simply there, already at rest.
      initial={prefs.reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 26, mass: 0.9 }}
      className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_24px_70px_-40px_rgba(0,0,0,0.6)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

      <div className="p-6 sm:p-8">
        {/* The volume, and only the volume: the reference below already names
            the book and the chapter, so a second badge would only say it
            twice — and on a phone it is exactly what pushes a short reference
            onto a line of its own. */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {passage.sourceLabel}
            </span>
          </div>

          {/* One control, and a mark rather than a button standing on the
              card: no surface and no rim, so the playful styles' raised face is
              deliberately not asked for here (see `.playful` in globals.css).
              A grid cell of its own makes it a 36px square, which is what
              `rounded-full` needs to be a circle.

              It opens the jobs a reader does on the passage — write on it,
              learn it, keep it, send it — as a small selector. Three marks in
              the corner were the same jobs with no room to say what they were,
              and the corner is the one part of the card the words do not
              need. */}
          <div ref={menuRef} className="relative flex shrink-0 items-center">
            <button
              type="button"
              ref={moreRef}
              onClick={() => setMenuFor(menuOpen ? null : drawKey)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`More actions for ${passage.reference}`}
              title="More actions"
              className={`-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:text-accent-strong ${
                menuOpen ? "text-accent-strong" : "text-foreground/70"
              }`}
            >
              <Glyph name="more" className="h-6 w-6" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  aria-label={`Actions for ${passage.reference}`}
                  initial={prefs.reduceMotion ? false : { opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  // The card clips its own corners, so the selector stays inside
                  // it: right-aligned under the button, as wide as a name and no
                  // wider than the passage it sits over.
                  className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_18px_44px_-20px_rgba(0,0,0,0.55)]"
                >
                  {cardActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        action.onSelect();
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-accent/10 hover:text-accent-strong ${
                        action.active ? "text-accent-strong" : "text-foreground"
                      }`}
                    >
                      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center">
                        {action.icon}
                      </span>
                      <span className="truncate">{action.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <h2 className="font-serif text-xl font-semibold text-accent-strong sm:text-2xl">
          {passage.reference}
        </h2>

        <blockquote className="mt-4 border-l-2 border-accent/50 pl-4 sm:pl-5">
          <p className="font-serif text-[1.15rem] leading-relaxed text-foreground sm:text-[1.3rem]">
            {passage.text}
          </p>
        </blockquote>

        <div className="mt-6 flex flex-col gap-3">
          {/* The way on from the draw: the whole chapter in the reader, at the
              verse (or paragraph) that was drawn. The card used to open the
              chapter inside itself, with the verse list and its own controls;
              that block is gone, so this is one plain way in and the card stays
              the passage. */}
          {readerHref && (
            <Link
              href={readerHref}
              className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
            >
              <BookIcon />
              Read more
            </Link>
          )}

          <a
            href={passage.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (isNative()) {
                e.preventDefault();
                void openExternal(passage.url);
              }
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
          >
            <LinkIcon />
            {passage.urlLabel}
          </a>
        </div>
      </div>

      {/* Portalled to the body (see the dialog) so the card's own transform and
          overflow can never clip or offset it. */}
      <ShareCardDialog open={shareOpen} card={shareSpec} onClose={() => setShareOpen(false)} />

      <SaveToDeckDialog
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        // The card as the save would write it: one card per passage, put into
        // whichever decks the reader picks.
        draft={memorizeDraft}
      />

      <NoteDialog
        // Remounted per opening so the field starts from the stored note.
        key={noteOpen ? `${savedId}:${note?.text ?? ""}:${note?.title ?? ""}` : "note-closed"}
        open={noteOpen}
        title={passage.reference}
        source={passage.sourceLabel}
        passage={passage.text}
        initial={note?.text ?? ""}
        initialTitle={note?.title ?? ""}
        onSave={(text, title) => saveNote(ensureFavorite(passage), text, title)}
        onDelete={note ? () => removeNote(savedId) : undefined}
        onClose={() => setNoteOpen(false)}
      />
    </motion.article>
  );
}

/** One row of the card's corner selector. */
interface CardAction {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** True of this passage as it stands — a note already written, a star set. */
  active?: boolean;
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.5C10 5 7.5 4.3 4.8 4.3A1.3 1.3 0 0 0 3.5 5.6v12.2c0 .7.6 1.3 1.3 1.3 2.7 0 5.2.7 7.2 2.2 2-1.5 4.5-2.2 7.2-2.2.7 0 1.3-.6 1.3-1.3V5.6c0-.7-.6-1.3-1.3-1.3-2.7 0-5.2.7-7.2 2.2Z" />
      <path d="M12 6.5v14.8" />
    </svg>
  );
}

/** The passage's page in Gospel Library. */
function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </svg>
  );
}
