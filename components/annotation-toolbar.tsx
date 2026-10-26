"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Glyph } from "./glyph";
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
  onRemove,
  onClose,
}: Props) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const more = () => {
    const box = strip.current;
    if (box) box.scrollBy({ left: box.clientWidth * 0.7, behavior: "smooth" });
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
                    color: color ? `var(--mark-ink-${color})` : "#ffffff",
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

            <div
              ref={strip}
              className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                type="button"
                onClick={onRemove}
                disabled={!canRemove}
                aria-label="Clear the mark"
                title="Clear"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[5px] text-white transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Glyph name="close" className="h-5 w-5" />
              </button>

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
              onClick={more}
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

          <div className="mt-1.5 grid grid-cols-5 gap-0.5 border-t border-white/10 pt-1.5">
            <Action icon="journal" label="Note" onClick={onNote} />
            <Action icon="link" label="Link" onClick={onLink} />
            <Action icon="copy" label="Copy" onClick={onCopy} />
            <Action icon="sparkles" label="Share" onClick={onShare} />
            <Action icon="trash" label="Remove" onClick={onRemove} disabled={!canRemove} />
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
  icon: "journal" | "link" | "copy" | "sparkles" | "trash";
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
      <Glyph name={icon} className="h-6 w-6" plain />
      {label}
    </button>
  );
}
