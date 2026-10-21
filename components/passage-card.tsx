"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { Passage } from "@/lib/types";
import { isNative, openExternal } from "@/lib/external";
import { BookmarkIcon } from "./bookmark-icon";
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
  /** With several verses picked, the bookmark saves them rather than the one passage. */
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
  /**
   * The floating button is only worth showing when it is the nearer controls:
   * once the card's own row has scrolled away above the reader. It then stays
   * up for the rest of the card, foot of an open chapter included — the block
   * down there is one Collapse link, not a set of controls to hand over to.
   */
  const showFloatingBar = shareScrolledAway && !shareOpen;

  /**
   * What the floating button opens: every job this card has, as a mark.
   *
   * The card's own controls say these in words, in the body of the card. By the
   * time this button is up they are behind the reader, scrolled away — the
   * choices are already known, so the button only has to name them to a screen
   * reader and draw them for everyone else. Icons rather than a row of labels
   * because they fan out round the button instead of sitting in a bar: at this
   * size a word would be wider than an option and the arc would fall apart.
   *
   * Saving turns on what is picked, exactly as the bar's Favorite did: the
   * passage itself, or the whole selection once several verses are chosen.
   */
  const floatingActions: FloatingAction[] = [
    {
      id: "read",
      label: expanded ? "Collapse the chapter" : "Read the whole chapter",
      short: expanded ? "Collapse" : "Read more",
      icon: expanded ? <CollapseIcon /> : <BookIcon />,
      onSelect: toggleExpanded,
    },
    {
      // A link rather than a button, so the passage can still be opened in a
      // new tab on the web — the shell intercepts it where there are no tabs.
      id: "library",
      label: passage.urlLabel,
      short: "Library",
      icon: <LinkIcon />,
      href: passage.url,
    },
    {
      id: "favorite",
      label: starLabel,
      short: "Favorite",
      icon: <BookmarkIcon filled={starred} />,
      onSelect: toggleStar,
    },
    {
      id: "notes",
      label: note ? "Edit the note" : "Add a note",
      short: "Notes",
      icon: <Glyph name="journal" className="h-5 w-5" />,
      onSelect: () => setNoteOpen(true),
    },
    {
      id: "memorize",
      label: picked.length > 0 ? `Memorize ${picked.length} ${unit}` : "Add to your memory list",
      short: "Memorize",
      icon: <Glyph name="cards" className="h-5 w-5" />,
      onSelect: () => {
        setMemorySections(picked);
        setMemoryOpen(true);
      },
    },
    {
      id: "share",
      label: shareLabel,
      short: "Share",
      icon: <ShareIcon />,
      onSelect: () => setShareOpen(true),
    },
  ];

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

          {/* Two controls, one size. The box is stated rather than grown from
              the mark inside it: a drawn glyph is an inline box and carries the
              line's descender space with it, while the bookmark is an svg that
              does not — so padding alone made the note a rounded rectangle
              taller than the circle beside it. A grid cell of its own makes
              both 36px squares, which is what `rounded-full` needs to be a
              circle. */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Writing a note saves the passage on the way (see the dialog's
                onSave): a note is kept, and what the app keeps is favorites. */}
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              aria-label={note ? `Edit the note on ${passage.reference}` : `Add a note to ${passage.reference}`}
              title={note ? "Edit note" : "Add a note"}
              className={`-mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                note
                  ? "border-accent/50 bg-accent/15 text-accent-strong"
                  : "border-border bg-surface-2 text-muted hover:border-accent/60 hover:text-accent-strong"
              }`}
            >
              <Glyph name="journal" className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={toggleStar}
              aria-pressed={starred}
              aria-label={starLabel}
              title={starLabel}
              className={`-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                starred
                  ? "border-accent/50 bg-accent/15 text-accent-strong"
                  : "border-border bg-surface-2 text-muted hover:border-accent/60 hover:text-accent-strong"
              }`}
            >
              <BookmarkIcon filled={starred} />
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

              {/* One job at the foot of the chapter: fold it back up, which
                  is only worth repeating here because the button above is a
                  whole chapter's scroll away. Everything else the bar carries
                  — share, favorite, memorize, the library link — is left to
                  the bar, so this block never becomes a second set of
                  controls that push the bar out of sight. */}
              <button
                type="button"
                onClick={toggleExpanded}
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent-strong hover:underline"
              >
                <CollapseIcon />
                Collapse
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Every action this card has, once its own controls are out of sight.

          A bar of four labelled buttons used to sit here. On a phone it was as
          wide as the passage it floated over and read as a second navigation
          bar, and every job added to the card made it tighter — notes and
          memorizing would have been six words across a 390px screen. One gold
          button is the same target in any width, and the jobs fan out round it
          as marks when it is open.

          Portalled to the body for the same reason as the dialogs below: the
          card is transformed while it rises into place (and clipped by its own
          overflow), and a fixed element inside it would be pinned to the card
          instead of to the screen. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showFloatingBar && (
              <PassageActions
                actions={floatingActions}
                url={passage.url}
                reduceMotion={prefs.reduceMotion}
              />
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

/**
 * The card's own controls, floating, for a reader who has scrolled past them.
 *
 * Two shapes of the same six jobs, chosen by the stylesheet at the
 * navigation's breakpoint (see `.passage-actions-*` in app/globals.css).
 *
 * On a phone — where a thumb is doing the reaching, and a row of six would be
 * narrower than the words it sat over — it is one gold button in the corner,
 * shut, that opens into a fan of marks round it: a quarter arc, one 44px target
 * per job, every one of them within reach of the button.
 *
 * On a wide screen it is a labelled bar along the foot of the page, always out.
 * A pointer has room for the words and no corner to tuck a button into, and
 * six bare marks would each need a hover to say what they do.
 *
 * Everything here is a plain button or link, so the app's press feedback gives
 * each one its tick without being asked (components/press-feedback.tsx). The
 * open/shut state lives here rather than in the card because it belongs to the
 * thing being animated: the button unmounts whenever the card's own controls
 * come back into view, and a menu that stayed open in memory would spring back
 * open the next time a reader scrolled away.
 */
function PassageActions({
  actions,
  url,
  reduceMotion,
}: {
  actions: FloatingAction[];
  /** The passage's page, opened outside the shell where there is no tab to open. */
  url: string;
  reduceMotion: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dock = useRef<HTMLDivElement | null>(null);

  // A thin press anywhere else puts the fan away, and so does Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (dock.current && !dock.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Take an option. The fan shuts before the option does its job, so a dialog
   * that opens over the page is not showing an open menu underneath it — which
   * would otherwise still be there when the dialog closed.
   */
  const choose = (action: FloatingAction) => {
    setOpen(false);
    action.onSelect?.();
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 14 }}
      transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.7 }}
      // Only the controls themselves take taps — the strip they float in spans
      // the width of the screen, and the page behind it stays live.
      className="passage-fab-dock pointer-events-none fixed inset-x-0 bottom-0 z-40"
    >
      {/* Phones and upright tablets: one gold button in the corner, with the
          fan round it. Docked right by the stylesheet, and hidden there on a
          wide screen. */}
      <div
        ref={dock}
        className="passage-actions-fan pointer-events-auto relative h-14 w-14"
      >
        <AnimatePresence>
          {open && (
            <ul role="menu" aria-label="Passage actions" className="m-0 list-none p-0">
              {actions.map((action, index) => {
                const offset = arcOffset(index, actions.length);
                return (
                  <motion.li
                    key={action.id}
                    // The list item is the animation's box, not a thing the
                    // menu exposes: the option inside it is the item.
                    role="none"
                    className="absolute inset-0 grid place-items-center"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.4, x: 0, y: 0 }}
                    animate={{ opacity: 1, scale: 1, x: offset.x, y: offset.y }}
                    exit={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 520,
                      damping: 34,
                      mass: 0.6,
                      delay: reduceMotion ? 0 : index * 0.015,
                    }}
                  >
                    {action.href ? (
                      <a
                        href={action.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        role="menuitem"
                        aria-label={action.label}
                        title={action.label}
                        onClick={(event) => {
                          setOpen(false);
                          if (isNative()) {
                            event.preventDefault();
                            void openExternal(url);
                          }
                        }}
                        className={FLOATING_OPTION}
                      >
                        {action.icon}
                      </a>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => choose(action)}
                        aria-label={action.label}
                        title={action.label}
                        className={FLOATING_OPTION}
                      >
                        {action.icon}
                      </button>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          )}
        </AnimatePresence>

        {/* The button itself: the app's gold, the same size as the memorize
            page's, with a plus that turns into the cross it always was — a
            quarter turn, not a second icon. */}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={open ? "Close passage actions" : "Passage actions"}
          title={open ? "Close" : "Passage actions"}
          className="relative z-10 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-contrast shadow-[0_1px_2px_rgba(0,0,0,0.16),0_10px_24px_-8px_rgba(0,0,0,0.45)]"
        >
          <Glyph
            name="plus"
            className={`h-6 w-6 transition-transform duration-300 ${open ? "rotate-45" : ""}`}
          />
        </button>
      </div>

      {/* Wide screens: the same six jobs in a bar, always out. There is no
          thumb to make room for and no corner to tuck into, so the labels can
          sit beside their marks instead of behind a button. */}
      <div className="passage-actions-bar pointer-events-none">
        <div
          role="group"
          aria-label="Passage actions"
          className="pointer-events-auto flex w-full max-w-lg items-stretch gap-0.5 rounded-xl border border-border bg-surface/95 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_18px_50px_-24px_rgba(0,0,0,0.75)] backdrop-blur"
        >
          {actions.map((action) =>
            action.href ? (
              <a
                key={action.id}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={action.label}
                title={action.label}
                onClick={(event) => {
                  if (isNative()) {
                    event.preventDefault();
                    void openExternal(url);
                  }
                }}
                className={FLOATING_BAR_OPTION}
              >
                {action.icon}
                <span className="truncate">{action.short}</span>
              </a>
            ) : (
              <button
                key={action.id}
                type="button"
                onClick={() => choose(action)}
                aria-label={action.label}
                title={action.label}
                className={FLOATING_BAR_OPTION}
              >
                {action.icon}
                <span className="truncate">{action.short}</span>
              </button>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** One option on the floating button's fan. */
interface FloatingAction {
  id: string;
  /** Spoken, and shown on hover — the option itself is only a mark. */
  label: string;
  /** The word the wide-screen bar wears beside the mark. */
  short: string;
  icon: ReactNode;
  /** An option that goes somewhere is a link, so it can open a new tab. */
  href?: string;
  onSelect?: () => void;
}

/**
 * The mark each option wears: a light disc with the page behind it, so the
 * circles read as controls over the words rather than as part of them.
 *
 * The surface is the card's own — not the slightly darker second surface the
 * card's buttons use — because these sit on top of text rather than on a card,
 * and a tone this close to the parchment left them looking like smudges. Every
 * mark inside is set to the same 20px, whatever size its own drawing defaults
 * to, so six different drawings look like one set.
 */
const FLOATING_OPTION =
  "grid h-11 w-11 place-items-center rounded-full border border-border bg-surface text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.14),0_8px_20px_-8px_rgba(0,0,0,0.45)] transition-colors hover:border-accent/60 hover:text-accent-strong [&_svg]:h-5 [&_svg]:w-5";

/**
 * One option in the wide-screen bar: its mark and its word, sharing the width
 * six ways. The word is what makes the bar worth having on a desk — a row of
 * marks in a corner still leaves you hovering to find out which is which — so
 * the text stays on one line rather than wrapping the bar to two rows.
 */
const FLOATING_BAR_OPTION =
  "flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2.5 text-[11px] font-semibold leading-none text-foreground transition-colors hover:bg-accent/10 hover:text-accent-strong [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_span.glyph]:h-4 [&_span.glyph]:w-4";

/**
 * Where one option sits round the floating button, in pixels from its centre.
 *
 * A quarter arc, opening up and to the left — the only directions with room
 * for them, with the button in the bottom corner. The radius is what keeps six 44px
 * options a few pixels apart while every one of them is still within a thumb's
 * reach of the button: closer and the circles touch, further and the fan climbs
 * past the passage the reader is trying to read.
 */
const FAN_FROM = 92;
const FAN_TO = 184;
const FAN_RADIUS = 148;

function arcOffset(index: number, count: number): { x: number; y: number } {
  const step = count > 1 ? (FAN_TO - FAN_FROM) / (count - 1) : 0;
  const angle = ((FAN_FROM + step * index) * Math.PI) / 180;
  return {
    x: Math.round(Math.cos(angle) * FAN_RADIUS),
    y: Math.round(-Math.sin(angle) * FAN_RADIUS),
  };
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
