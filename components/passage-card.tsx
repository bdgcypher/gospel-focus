"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Passage } from "@/lib/types";
import { isNative, openExternal } from "@/lib/external";
import { Glyph } from "./glyph";
import { NoteDialog } from "./note-dialog";
import { SaveToMemorizeDialog } from "./save-to-memorize-dialog";
import { ShareCardDialog } from "./share-card-dialog";
import { ShareIcon } from "./share-icon";
import {
  ensureFavorite,
  favoriteId,
  isSelectionSaved,
  toggleFavorite,
  toggleSelectionFavorite,
  useFavorites,
} from "@/lib/favorites";
import { noteFor, removeNote, saveNote, useNotes } from "@/lib/notes";
import { usePreferences } from "@/lib/preferences";
import type { ShareCard } from "@/lib/share-image";

interface Props {
  passage: Passage;
  /** Changes on every new draw so the card re-animates. */
  drawKey: number;
}

export function PassageCard({ passage, drawKey }: Props) {
  const [expanded, setExpanded] = useState(false);
  /** Verse/paragraph numbers picked to share while the chapter is open. */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  /** The memorize sheet, and the verses it was opened with. */
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memorySections, setMemorySections] = useState<number[]>([]);
  const highlightRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** The card's own share button, watched to know when it has been scrolled past. */
  const shareRef = useRef<HTMLButtonElement | null>(null);
  /** The expanded chapter's own row of controls, which stands in for the bar. */
  const [sectionControls, setSectionControls] = useState<HTMLElement | null>(null);

  const favorites = useFavorites();
  const notes = useNotes();
  const prefs = usePreferences();
  const savedId = favoriteId(passage);
  const saved = useMemo(() => favorites.some((f) => f.id === savedId), [favorites, savedId]);
  /** The note on this draw, if the reader has written one on it. */
  const note = noteFor(notes, savedId);

  const isScripture = passage.kind === "scripture";
  /** The verse (or paragraph) the draw landed on — what the card is showing. */
  const mainVerse = passage.highlightVerse;
  /** Only once the card's own button is out of sight above the reader. */
  const shareScrolledAway = useScrolledPast(shareRef);
  /** And only while the chapter's own controls are out of sight too. */
  const sectionControlsOnScreen = useOnScreen(sectionControls);

  useEffect(() => {
    if (expanded && highlightRef.current) {
      // Let the height animation start before scrolling.
      const id = window.setTimeout(
        () => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
        320
      );
      return () => window.clearTimeout(id);
    }
  }, [expanded]);

  const toggleExpanded = () => {
    if (expanded) {
      // A collapsed card shares only the passage itself, so a stale selection
      // would be a surprise the next time the chapter opens.
      setSelected(new Set());
      setExpanded(false);
      return;
    }
    // Opening the chapter starts on the draw itself: the verse the book landed
    // on comes up already picked, so sharing a few verses from around it can't
    // quietly drop the passage the card is showing.
    setSelected(
      mainVerse !== null && passage.verses.some((v) => v.number === mainVerse)
        ? new Set([mainVerse])
        : new Set<number>()
    );
    setExpanded(true);
  };

  const toggleSelected = (number: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  /**
   * A multi-verse save covers whatever is picked — a run or, like Share, a
   * scattered set — so the whole selection is saved as one favorite.
   */
  const selection = useMemo(
    () => (expanded && selected.size >= 2 ? [...selected].sort((a, b) => a - b) : null),
    [expanded, selected]
  );

  const selectionSaved = useMemo(
    () => (selection ? isSelectionSaved(favorites, passage, selection) : false),
    [favorites, passage, selection]
  );

  /**
   * The verses the reader has picked out, sorted, for the memorize sheet.
   *
   * One verse or several: a card is built from the whole set either way, so a
   * single verse goes through the same door as a run. Empty means nothing is
   * picked, which is what the sheet is only ever opened with after a check.
   */
  const picked = useMemo(
    () => (selected.size > 0 ? [...selected].sort((a, b) => a - b) : []),
    [selected]
  );

  /** What a selection's members are called: verses in scripture, paragraphs in a talk. */
  const unit = isScripture ? "verse" : "paragraph";
  /** With several verses picked, the star saves them rather than the one passage. */
  const starred = selection ? selectionSaved : saved;
  const count = selection?.length ?? 0;
  const starLabel = selection
    ? `${selectionSaved ? "Remove" : "Save"} ${count} ${unit}s ${selectionSaved ? "from" : "to"} favorites`
    : saved
      ? "Remove from favorites"
      : "Save to favorites";

  const toggleStar = () => {
    if (selection) toggleSelectionFavorite(passage, selection);
    else toggleFavorite(passage);
  };

  /** Collapsed, share just the drawn passage; expanded, share whatever is
   *  selected — falling back to the drawn passage when nothing is picked. */
  const shareSpec = useMemo<ShareCard>(() => {
    const lines =
      expanded && selected.size > 0
        ? passage.verses
            .filter((v) => selected.has(v.number))
            .map((v) => ({
              label: isScripture ? String(v.number) : undefined,
              text: v.text,
            }))
        : [
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
  }, [expanded, selected, passage, isScripture]);

  const shareLabel =
    expanded && selected.size > 0
      ? `Share ${selected.size} ${selected.size === 1 ? "verse" : "verses"}`
      : "Share image";
  /** The floating bar is only worth showing when it is the nearer controls. */
  const showFloatingBar = shareScrolledAway && !sectionControlsOnScreen && !shareOpen;

  /**
   * The bar floats over the page, so the scrolling content is given a matching
   * strip of room to clear it. The flag rides the document element because
   * <main> sits two components above this one (see globals.css), and it can only
   * flip once the card's own controls have scrolled away — so nothing shifts
   * vertically while the page is at rest.
   */
  useEffect(() => {
    if (!showFloatingBar) return;
    document.documentElement.dataset.floatingBar = "on";
    return () => {
      delete document.documentElement.dataset.floatingBar;
    };
  }, [showFloatingBar]);

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

          <div className="flex shrink-0 items-center gap-1">
            {/* Writing a note stars the passage on the way (see the dialog's
                onSave): a note is kept, and what the app keeps is favorites. */}
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              aria-label={note ? `Edit the note on ${passage.reference}` : `Add a note to ${passage.reference}`}
              title={note ? "Edit note" : "Add a note"}
              className={`-mt-1 shrink-0 rounded-full border p-2 transition-colors ${
                note
                  ? "border-accent/50 bg-accent/15 text-accent-strong"
                  : "border-border bg-surface-2 text-muted hover:border-accent/60 hover:text-accent-strong"
              }`}
            >
              {/* The star beside it is a 20px mark in the same 8px padding, so
                  this one matches: two controls in a row of the same job should
                  be the same size. */}
              <Glyph name="journal" className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={toggleStar}
              aria-pressed={starred}
              aria-label={starLabel}
              title={starLabel}
              className={`-mr-1 -mt-1 shrink-0 rounded-full border p-2 transition-colors ${
                starred
                  ? "border-accent/50 bg-accent/15 text-accent-strong"
                  : "border-border bg-surface-2 text-muted hover:border-accent/60 hover:text-accent-strong"
              }`}
            >
              <StarIcon filled={starred} />
            </button>
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
            >
              {expanded ? <CollapseIcon /> : <BookIcon />}
              {expanded ? "Collapse" : "Read more"}
            </button>

            <button
              type="button"
              ref={shareRef}
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
            >
              <ShareIcon />
              {shareLabel}
            </button>
          </div>

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

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.section
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div ref={scrollRef} className="border-t border-border bg-surface-2/60 px-6 py-6 sm:px-8">
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {passage.expansionTitle}
              </h3>
              {passage.expansionSubtitle && (
                <p className="mt-1 text-sm text-muted">{passage.expansionSubtitle}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Tap verses to select
                </p>
                <button
                  type="button"
                  onClick={() => setSelected(new Set(passage.verses.map((v) => v.number)))}
                  className="text-xs font-medium text-accent-strong hover:underline"
                >
                  Select all
                </button>
                {selected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs font-medium text-accent-strong hover:underline"
                  >
                    Clear ({selected.size})
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-3">
                {passage.verses.map((v) => {
                  const active = passage.highlightVerse === v.number;
                  const picked = selected.has(v.number);
                  return (
                    <button
                      type="button"
                      key={v.number}
                      ref={active ? highlightRef : undefined}
                      onClick={() => toggleSelected(v.number)}
                      aria-pressed={picked}
                      className={`flex w-full gap-3 rounded-lg px-2 py-1 text-left font-serif text-[1.02rem] leading-relaxed transition-colors ${
                        picked
                          ? "bg-accent/20 text-foreground ring-1 ring-accent/60"
                          : active
                            ? "bg-accent/15 text-foreground ring-1 ring-accent/40"
                            : "text-foreground/80 hover:bg-accent/5"
                      }`}
                    >
                      <span
                        className={`mt-1.5 shrink-0 ${
                          picked ? "text-accent-strong" : "text-muted/60"
                        }`}
                        aria-hidden="true"
                      >
                        {picked ? <CheckCircleIcon /> : <CircleIcon />}
                      </span>
                      <span className="mt-0.5 w-5 shrink-0 select-none text-xs font-semibold tabular-nums text-accent-strong">
                        {isScripture ? v.number : ""}
                      </span>
                      <span>{v.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* These are the bar's three jobs, at the foot of the chapter —
                  fold it back up, share the selection, or open the passage —
                  and the bar stands down while this block is on screen (see
                  showFloatingBar above). */}
              <div ref={setSectionControls} className="mt-6 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <button
                    type="button"
                    onClick={toggleExpanded}
                    className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
                  >
                    <CollapseIcon />
                    Collapse
                  </button>

                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
                  >
                    <ShareIcon />
                    {selected.size > 0 ? `Share ${selected.size} selected` : "Share this passage"}
                  </button>

                  {/* Saving the picked verses as one card, alongside Share. */}
                  {selection && (
                    <button
                      type="button"
                      onClick={() => toggleSelectionFavorite(passage, selection)}
                      aria-pressed={selectionSaved}
                      className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
                    >
                      <StarIcon filled={selectionSaved} />
                      {selectionSaved ? `Saved ${count} ${unit}s` : `Save ${count} ${unit}s`}
                    </button>
                  )}

                  {/* The same picked verses as learning material: a card can
                      hold a run, so the whole selection becomes one card rather
                      than a card per verse. */}
                  {picked.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMemorySections(picked);
                        setMemoryOpen(true);
                      }}
                      className="inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
                    >
                      <Glyph name="cards" className="h-4 w-4" />
                      Memorize {picked.length} {unit}
                      {picked.length === 1 ? "" : "s"}
                    </button>
                  )}
                </div>

                {/* self-start: a flex child would otherwise stretch, leaving a
                    full-width target for the link. */}
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
                  className="inline-flex items-center gap-2 self-start text-sm font-medium text-accent-strong hover:underline"
                >
                  <LinkIcon />
                  Continue in the Gospel Library
                </a>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* The bar every action lives in once the card's own controls are out of
          sight: fold the chapter back up, open the passage in the Gospel
          Library, or share the selection — all without scrolling back.
          Portalled to the body for the same reason as the dialog below: the
          card is transformed while it rises into place (and clipped by its own
          overflow), and a fixed element inside it would be pinned to the card
          instead of to the screen. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showFloatingBar && (
              <motion.div
                initial={prefs.reduceMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 14 }}
                transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.7 }}
                // Only the bar itself takes taps — the strip it floats in spans
                // the width of the screen, and the page behind it stays live.
                className="share-bar pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4"
              >
                {/* All four actions live here, however the chapter is drawn:
                    fold it back up, open it in the Gospel Library, save it to
                    favorites, or share it. Each is an icon and a single word,
                    and the tighter gaps plus p-1 are what keep all four on one
                    line on a phone. */}
                <div className="pointer-events-auto flex w-full max-w-md items-stretch gap-0.5 rounded-xl border border-border bg-surface/95 p-1 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.75)] backdrop-blur">
                  <button
                    type="button"
                    onClick={toggleExpanded}
                    aria-expanded={expanded}
                    className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1 py-2.5 text-[10px] font-semibold text-foreground transition-colors hover:bg-accent/10 hover:text-accent-strong"
                  >
                    {expanded ? <CollapseIcon /> : <BookIcon />}
                    {expanded ? "Collapse" : "Read more"}
                  </button>

                  <a
                    href={passage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={passage.urlLabel}
                    onClick={(e) => {
                      if (isNative()) {
                        e.preventDefault();
                        void openExternal(passage.url);
                      }
                    }}
                    className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1 py-2.5 text-[10px] font-semibold text-foreground transition-colors hover:bg-accent/10 hover:text-accent-strong"
                  >
                    <LinkIcon />
                    Gospel Library
                  </a>

                  {/* Saving turns on what is picked: the passage itself when
                      nothing more is selected, or the whole selection — a run
                      or a scattered set — once several verses are. */}
                  <button
                    type="button"
                    onClick={toggleStar}
                    aria-pressed={starred}
                    aria-label={starLabel}
                    title={starLabel}
                    className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1 py-2.5 text-[10px] font-semibold text-foreground transition-colors hover:bg-accent/10 hover:text-accent-strong"
                  >
                    <StarIcon filled={starred} />
                    Favorite
                  </button>

                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    aria-label={shareLabel}
                    className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1 py-2.5 text-[10px] font-semibold text-foreground transition-colors hover:bg-accent/10 hover:text-accent-strong"
                  >
                    <ShareIcon />
                    Share
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Portalled to the body (see the dialog) so the card's own transform and
          overflow can never clip or offset it. */}
      <ShareCardDialog open={shareOpen} card={shareSpec} onClose={() => setShareOpen(false)} />

      <SaveToMemorizeDialog
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        passage={passage}
        sections={memorySections}
      />

      <NoteDialog
        // Remounted per opening so the field starts from the stored note.
        key={noteOpen ? `${savedId}:${note?.text ?? ""}` : "note-closed"}
        open={noteOpen}
        title={passage.reference}
        source={passage.sourceLabel}
        passage={passage.text}
        initial={note?.text ?? ""}
        onSave={(text) => saveNote(ensureFavorite(passage), text)}
        onDelete={note ? () => removeNote(savedId) : undefined}
        onClose={() => setNoteOpen(false)}
      />
    </motion.article>
  );
}

/**
 * Whether the element is on screen. Held as state rather than a ref because the
 * element it watches only exists while the chapter is open — a callback ref
 * hands it over when it mounts, and null when it folds away.
 */
function useOnScreen(node: HTMLElement | null): boolean {
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  // A folded chapter has no controls of its own, so nothing is in the way.
  return node ? onScreen : false;
}

/**
 * Whether the element has scrolled off the top of the viewport — the moment the
 * floating bar becomes the nearer set of controls. Intersection alone is not
 * enough: on a phone the card's own controls start below the fold, and a
 * floating duplicate of what is already on screen is just noise.
 */
function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const node = ref.current;
    // Without an observer the bar simply never appears; the card's own controls
    // are still there.
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return past;
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8Z" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.5C10 5 7.5 4.3 4.8 4.3A1.3 1.3 0 0 0 3.5 5.6v12.2c0 .7.6 1.3 1.3 1.3 2.7 0 5.2.7 7.2 2.2 2-1.5 4.5-2.2 7.2-2.2.7 0 1.3-.6 1.3-1.3V5.6c0-.7-.6-1.3-1.3-1.3-2.7 0-5.2.7-7.2 2.2Z" />
      <path d="M12 6.5v14.8" />
    </svg>
  );
}

/** The expanded state's control: the section folding back up into the card. */
function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 15 6-6 6 6" />
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
