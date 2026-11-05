"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Glyph } from "./glyph";
import { ShareIcon } from "./share-icon";
import { MARK_COLORS, type MarkChoice, type MarkColor, type MarkStyle } from "@/lib/annotations";

interface Props {
  open: boolean;
  /** The mark's colour, when the panel was opened on one. */
  color: MarkColor | null;
  /** The style the next colour tap will make — or the mark's own. */
  style: MarkStyle;
  /** The reader's last two choices, newest first; they lead the palette. */
  recent: MarkChoice[];
  /** Whether there is a mark here to take off. */
  canRemove: boolean;
  onColor: (color: MarkColor) => void;
  /** A pair of colour and style at once — what a recent swatch is. */
  onChoice: (color: MarkColor, style: MarkStyle) => void;
  onStyle: (style: MarkStyle) => void;
  onNote: () => void;
  onLink: () => void;
  onCopy: () => void;
  onShare: () => void;
  /** Take the words away to be learned by heart. */
  onMemorize: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * The marking panel — the app's answer to the Gospel Library's highlighter.
 *
 * Its shape is the one a reader already knows from that app: two "A" tabs that
 * say whether the next mark is a highlight or an underline, a strip of colours
 * drawn as the same "A" in the style being chosen, and one row of actions under
 * them. Seeing the mark as a letter is the point: a filled A and an underlined A
 * are the two things the app can do, side by side, before any words are painted.
 *
 * The strip opens on the reader's own last two marks — the colour *and* the mode
 * they used it in — before the standing palette, so the colour a reader keeps
 * reaching for is one tap away in exactly the style they used it. Those two are
 * the only swatches that ignore the tabs: they carry their own style, because
 * that is the thing being remembered.
 *
 * The palette is longer than a phone, so it scrolls, and an arrow on either side
 * steps it along; the left one is dead while the strip is at its beginning.
 * Clearing a mark is the Remove action and nothing else — a cross beside the
 * colours was a second way to do what the trash does, in a place a reader has to
 * scroll past to find the colour they wanted.
 *
 * The same panel serves both moments a reader needs it — a fresh selection, and
 * a mark they have tapped back open — because the question is the same in both:
 * what colour, in which style, and what else would you like to do with it. Only
 * the *actions* differ in effect, and they read what they are acting on from the
 * page rather than from the panel.
 *
 * It is deliberately dark in every theme. Like the system's own text controls,
 * it is a tool laid over the page rather than a surface of the page; a panel that
 * changed with the theme would change the apparent colour of every swatch in it.
 *
 * The note sheet is *not* opened from a tap on the words: the words open this
 * panel, and the panel's Note opens the sheet. That is what keeps a reader from
 * writing a note every time they meant to change a colour.
 */
export function AnnotationToolbar({
  open,
  color,
  style,
  recent,
  canRemove,
  onColor,
  onChoice,
  onStyle,
  onNote,
  onLink,
  onCopy,
  onShare,
  onMemorize,
  onRemove,
  onClose,
}: Props) {
  const strip = useRef<HTMLDivElement>(null);
  /** Whether the strip is at its very beginning, where its left arrow has nowhere to go. */
  const [atStart, setAtStart] = useState(true);

  // The strip is remounted with the panel, so it opens at its beginning; a
  // change of style tab can also leave it somewhere new, and a smooth scroll
  // reports itself as it goes. Reading it on every scroll covers all three.
  const syncStart = () => {
    const box = strip.current;
    if (box) setAtStart(box.scrollLeft <= 1);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** One step along the strip, in either direction. */
  const step = (direction: -1 | 1) => {
    const box = strip.current;
    if (box) box.scrollBy({ left: direction * box.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.7 }}
          role="toolbar"
          aria-label="Mark the selected words"
          aria-orientation="vertical"
          data-marking-panel
          className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.5rem)] z-40 mx-auto w-[min(34rem,calc(100%-1rem))] rounded-[1.6rem] border border-white/10 bg-[#111111] p-2.5 text-white shadow-2xl"
        >
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onStyle("fill")}
                aria-label="Highlight"
                aria-pressed={style === "fill"}
                title="Highlight"
                className={`grid h-11 w-11 place-items-center rounded-lg bg-white/[0.06] transition-colors ${
                  style === "fill" ? "ring-2 ring-accent" : "ring-1 ring-white/10 hover:bg-white/[0.12]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 place-items-center rounded-[3px] text-base font-semibold leading-none"
                  style={{
                    backgroundColor: color ? `var(--mark-${color})` : "rgba(255,255,255,0.22)",
                    // The page's own ink over the wash: the mark's ink token is
                    // tuned for the 2px line, not for type sitting on the face.
                    color: color ? "var(--foreground)" : "#ffffff",
                  }}
                >
                  A
                </span>
              </button>

              <button
                type="button"
                onClick={() => onStyle("underline")}
                aria-label="Underline"
                aria-pressed={style === "underline"}
                title="Underline"
                className={`grid h-11 w-11 place-items-center rounded-lg bg-white/[0.06] transition-colors ${
                  style === "underline" ? "ring-2 ring-accent" : "ring-1 ring-white/10 hover:bg-white/[0.12]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="text-base font-semibold leading-none"
                  style={{
                    textDecoration: "underline",
                    textDecorationColor: color ? `var(--mark-${color})` : "#ffffff",
                    textDecorationThickness: "3px",
                    textUnderlineOffset: "3px",
                  }}
                >
                  A
                </span>
              </button>
            </div>

            <span aria-hidden="true" className="h-9 w-px shrink-0 bg-white/15" />

            {/* Scrolls sideways, which clips anything drawn outside a swatch —
                and the ring on the chosen colour is drawn outside it by 2px. The
                padding is what keeps those two pixels inside the scrollport:
                a scroll container clips to its own box, so a ring on a swatch
                flush against the top or bottom edge loses its whole top and
                bottom and reads as two brackets either side. */}
            {/* The strip scrolls; there is more palette than a phone can show.
                Its two arrows sit outside it so they stay where they are while
                the colours move under them — and the left one is dead at the
                beginning, where it has nowhere to go. Clearing a mark is not
                here: the Remove action below does that, and a cross beside the
                colours read as a second way to do it. */}
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={atStart}
              aria-label="Previous colours"
              title="Previous colours"
              className="grid h-10 w-7 shrink-0 place-items-center rounded-[5px] text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 5-7 7 7 7" />
              </svg>
            </button>

            <div
              ref={strip}
              onScroll={syncStart}
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* The two the reader used last, in the mode they used them. */}
              {recent.map((choice) => (
                <Swatch
                  key={`recent-${choice.style}-${choice.color}`}
                  color={choice.color}
                  style={choice.style}
                  label={`Recent ${choice.style === "underline" ? "underline" : "highlight"} in ${choice.color}`}
                  onPress={() => onChoice(choice.color, choice.style)}
                />
              ))}
              {recent.length > 0 && (
                <span aria-hidden="true" className="mx-0.5 h-7 w-px shrink-0 bg-white/15" />
              )}

              {MARK_COLORS.map((swatch) => (
                <Swatch
                  key={swatch}
                  color={swatch}
                  style={style}
                  label={`${style === "underline" ? "Underline" : "Highlight"} ${swatch}`}
                  pressed={color === swatch}
                  onPress={() => onColor(swatch)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => step(1)}
              aria-label="More colours"
              title="More colours"
              className="grid h-10 w-7 shrink-0 place-items-center rounded-[5px] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 5 7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="mt-1.5 grid grid-cols-6 gap-0.5 border-t border-white/10 pt-1.5">
            <Action icon={<Glyph name="journal" plain className="h-6 w-6" />} label="Note" onClick={onNote} />
            <Action icon={<Glyph name="link" plain className="h-6 w-6" />} label="Link" onClick={onLink} />
            <Action icon={<Glyph name="copy" plain className="h-6 w-6" />} label="Copy" onClick={onCopy} />
            <Action icon={<ShareIcon className="h-6 w-6" />} label="Share" onClick={onShare} />
            <Action icon={<Glyph name="cards" plain className="h-6 w-6" />} label="Memorize" onClick={onMemorize} />
            <Action
              icon={<Glyph name="trash" plain className="h-6 w-6" />}
              label="Remove"
              onClick={onRemove}
              disabled={!canRemove}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * One colour, drawn as the letter A in the style it will paint.
 *
 * A recent carries its own style — that is the thing being remembered — while
 * the palette follows the tab above it, so the same component serves both.
 */
function Swatch({
  color,
  style,
  label,
  pressed,
  onPress,
}: {
  color: MarkColor;
  style: MarkStyle;
  label: string;
  pressed?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-[5px] transition-colors hover:bg-white/10 ${
        pressed ? "ring-2 ring-white/80" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-[3px] text-base font-semibold leading-none"
        style={
          style === "underline"
            ? {
                color: "#ffffff",
                textDecoration: "underline",
                textDecorationColor: `var(--mark-${color})`,
                textDecorationThickness: "4px",
                textUnderlineOffset: "3px",
              }
            : { backgroundColor: `var(--mark-${color})`, color: `var(--mark-ink-${color})` }
        }
      >
        A
      </span>
    </button>
  );
}

function Action({
  icon,
  label,
  onClick,
  disabled,
}: {
  /** The drawn glyph: `plain` so the panel's own set matches, except Share,
   *  which is the app's share mark everywhere else too. */
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {/* Drawn in both skins: these are the panel's controls, and a row of
          emoji read as stickers beside the letter swatches rather than as the
          four things a reader can do with the words. */}
      {icon}
      {label}
    </button>
  );
}
