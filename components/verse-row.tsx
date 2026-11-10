"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  annotationsFor,
  markGroupId,
  noteText,
  wordsOf,
  type Annotation,
  type MarkColor,
  type MarkStyle,
  type SelectionRange,
} from "@/lib/annotations";
import type { ReaderDoc } from "@/lib/reader";
import { Glyph } from "./glyph";
import type { WordPoint } from "./mark-handles";
/**
 * One verse, its words, and the marks over them.
 *
 * Words are separate spans carrying their own anchor (`data-verse`,
 * `data-word`) so a browser selection can be turned back into word ranges
 * without measuring the text: the selection API says which spans it touches,
 * and their data attributes are the range.
 *
 * Each span carries the gap that follows its word, so a mark is one unbroken
 * band rather than a dashed row of word-shaped patches: the highlighted space
 * belongs to the marked words, and at the end of a line the band runs on to the
 * margin exactly as a highlighter would. The same space is part of the span's
 * tap target, which is what makes a mark something a reader can press anywhere
 * along — not only on the letters.
 */
export function VerseRow({
  doc,
  verse,
  annotations,
  preview,
  selected,
  focused,
  onVerse,
  onAside,
  onWords,
}: {
  doc: ReaderDoc;
  verse: { number: number; text: string };
  annotations: Annotation[];
  /** The extent a dragged edge is showing, which paints over the stored mark. */
  preview: { groupId: string; from: WordPoint; to: WordPoint; color: MarkColor; style: MarkStyle } | null;
  /**
   * The words the app's own selection covers.
   *
   * A pointer's browser selection cannot be left alive: its handles and
   * Copy/Share menu would sit over the panel's (see `captureSelection`). So the
   * selected words are marked here, and the stylesheet washes them the way the
   * platform would have. A keyboard selection is left to the platform until a
   * handle takes it over.
   */
  selected: SelectionRange[] | null;
  focused: boolean;
  onVerse: (verse: number) => void;
  /** Read what this verse carries — notes, links, tags — beside the words. */
  onAside: (verse: number) => void;
  /** Which word was pressed, so the reader can gather the marks over it. */
  onWords: (verse: number, word: number) => void;
}) {
  const words = useMemo(() => wordsOf(verse.text), [verse.text]);
  const selectedAt = (word: number) =>
    Boolean(
      selected?.some(
        (range) => range.verse === verse.number && word >= range.startWord && word <= range.endWord
      )
    );
  const marks = useMemo(
    () => annotationsFor(annotations, doc.doc, verse.number),
    [annotations, doc.doc, verse.number]
  );

  const fills = new Map<number, MarkColor>();
  const underlines = new Map<number, MarkColor>();

  // Oldest first, so a newer mark on the same words paints over an older one and
  // the list under a tap reads newest last.
  for (const mark of [...marks].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    // The mark being dragged is painted from the drag instead, below.
    if (preview && markGroupId(mark) === preview.groupId) continue;
    if (mark.color !== "clear") {
      for (let word = mark.startWord; word <= mark.endWord; word += 1) {
        if (mark.style === "underline") underlines.set(word, mark.color);
        else fills.set(word, mark.color);
      }
    }
    // A link is not ink. It used to be drawn as a blue line under its words,
    // which the reader read as a second underline they had not asked for — a
    // link is a place the mark points at, not a way the words are marked. The
    // verse's margin keeps the mark that opens it, and the linked passage is
    // read there.
  }

  /**
   * What the verse's margin says about it: whether any mark here holds a note, a
   * link, or a tag. It is read from the stored marks rather than painted into
   * the words, so a thought about a verse is found at the verse's edge however
   * far into the prose the marked words began. One margin mark speaks for all
   * three, because one panel holds them: the verse has something to say, or it
   * does not.
   */
  const carried = marks.some(
    (mark) => noteText(mark.note).length > 0 || Boolean(mark.links?.length) || mark.tags.length > 0
  );

  // A dragged edge paints the run it is showing, over whatever is stored.
  if (preview && preview.color !== "clear") {
    const covers = (word: number) => {
      if (verse.number < preview.from.verse || verse.number > preview.to.verse) return false;
      if (verse.number === preview.from.verse && word < preview.from.word) return false;
      if (verse.number === preview.to.verse && word > preview.to.word) return false;
      return true;
    };
    for (let word = 1; word <= words.length; word += 1) {
      if (!covers(word)) continue;
      if (preview.style === "underline") underlines.set(word, preview.color);
      else fills.set(word, preview.color);
    }
  }

  // --- which words share a line --------------------------------------------
  // One box per run of words would be the simplest thing to paint, and the
  // browser does round the ends of every line a run wraps onto. But a rounded
  // corner belongs to the box, not to a line: a run that wraps *and* meets
  // another mark wears its flat edge on every line it touches, so the ends of
  // its lines went square. Measuring the words lets the run be drawn as one box
  // per line instead, and each line end then gets its own corner back.
  //
  // Nothing here is painted differently because of the measurement — the boxes
  // and their padding are the same — so the measurement cannot change where the
  // words break.
  const host = useRef<HTMLSpanElement>(null);
  const [lines, setLines] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const spans = [...element.querySelectorAll<HTMLElement>("[data-word]")];
      if (!spans.length) return;
      const found: number[] = [];
      let top = Number.NaN;
      let line = -1;
      for (const span of spans) {
        const box = span.getBoundingClientRect();
        // A pixel of slack: one line's glyphs share their top to the
        // sub-pixel, and the line below is a whole line-height away.
        if (!Number.isFinite(top) || Math.abs(box.top - top) > 1) {
          top = box.top;
          line += 1;
        }
        found.push(line);
      }
      setLines((old) =>
        old && old.length === found.length && old.every((n, i) => n === found[i]) ? old : found
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    // The reader's type size and the width of the column both move the lines
    // without touching a word, and a webfont can land after the first paint.
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [verse.number, verse.text, annotations, preview]);

  const lineOf = (word: number) => lines?.[word - 1] ?? 0;
  /** Whether this word starts its line, so its left edge is an edge of text. */
  const beginsLine = (word: number) => word === 1 || lineOf(word) !== lineOf(word - 1);
  /** Whether this word ends its line. */
  const endsLine = (word: number) => word === words.length || lineOf(word) !== lineOf(word + 1);
  /** Whether any mark — a wash or a line — is inked on this word. */
  const inked = (word: number) => Boolean(fills.get(word) || underlines.get(word));

  // A band is a run of words in one colour on one line: two marks of the same
  // colour side by side read as one band, and a band never runs over the end of
  // a line, so each line can wear its own corners (see the measurement above).
  const bands: { key: number; fill?: MarkColor; first: number; last: number }[] = [];
  for (let word = 1; word <= words.length; word += 1) {
    const fill = fills.get(word);
    const band = bands[bands.length - 1];
    if (band && band.fill === fill && lineOf(word) === lineOf(band.last)) {
      band.last = word;
    } else {
      bands.push({ key: word, fill, first: word, last: word });
    }
  }

  return (
    // Two columns so the number hangs in the margin: the reader's eye runs down
    // a straight left edge of text, and the verse's first line is the one the
    // number sits beside however long the verse runs. Both columns are
    // top-aligned, which is what puts the number level with the first line the
    // reader is about to read — on a shared baseline the smaller type hangs low
    // against a line whose leading it does not share.
    //
    // Top-aligned boxes are not quite level ink, though: the number's own leading
    // is scaled to its smaller em, so its capital rides a couple of pixels above
    // the prose's. The nudge below closes that, in the number's own em so it
    // holds at both of the reader's type sizes.
    //
    // A third column at the right holds the verse's note and link marks. They
    // are not inside the prose because they would break a highlight at the word
    // they followed, and because a marker in the margin is found at the verse's
    // edge however deep into a long verse the marked words began. The column is
    // reserved on every verse, empty or not, so the measure is one width down
    // the whole chapter.
    <p
      id={`verse-${verse.number}`}
      className={`-mx-1 mb-3 grid grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-start gap-x-1.5 border-l-2 px-1 transition-colors sm:-mx-2 sm:gap-x-2 sm:px-2 ${
        // The rule is always in the layout and only coloured when the verse is
        // one the address asked for, so opening a chapter never shifts its text
        // by two pixels. Gold down the side says which verses are the place, and
        // survives the faint wash being easy to miss.
        //
        // Square, not rounded: the rule is the edge of the verse, the way a
        // strapline's is the edge of the words it quotes. Rounded corners bent
        // it away at the top and bottom and made the mark read as a card.
        focused ? "border-accent bg-accent/5" : "border-transparent"
      }`}
    >
      <button
        type="button"
        onClick={() => onVerse(verse.number)}
        aria-label={`Verse ${verse.number}: actions`}
        title={`Verse ${verse.number}`}

        className="translate-y-[0.2em] rounded text-right text-[0.72em] font-semibold tabular-nums text-muted transition-colors hover:text-accent-strong"
      >
        {verse.number}
      </button>

      <span ref={host} className="min-w-0">
        {bands.map((band) => {
          // Where one mark meets another they are one passage made in two inks,
          // so the seam is flat: two rounded corners meeting left a notch above
          // and below the join, and the colours read as separate stickers. The
          // ends of the lines keep their corners — a wash that wraps is a box
          // per line, so only the line that really touches another mark is
          // flat.
          //
          // It does not matter what the neighbouring mark is — a wash or a
          // line — only that something is inked on the word at the join.
          const leftSeam = Boolean(band.fill) && !beginsLine(band.first) && inked(band.first - 1);
          const rightSeam = Boolean(band.fill) && !endsLine(band.last) && inked(band.last + 1);
          // A line inked on the edge word has to reach the seam too: its own box
          // stops 0.3em short of the band's edge, which is where the ink of the
          // mark it meets begins (see `.mark-underline-bleed`).
          const leftInk = leftSeam ? underlines.get(band.first) : undefined;
          const rightInk = rightSeam ? underlines.get(band.last) : undefined;

          return (
          <span
            key={band.key}
            className={
              band.fill
                ? `mark-band${leftSeam ? " mark-band-meets-left" : ""}${
                    rightSeam ? " mark-band-meets-right" : ""
                  }`
                : undefined
            }
            style={band.fill ? { backgroundColor: `var(--mark-${band.fill})` } : undefined}
          >
            {leftInk && (
              <span
                aria-hidden
                className="mark-underline-bleed mark-underline-bleed-start"
                style={{ backgroundColor: `var(--mark-ink-${leftInk})` }}
              />
            )}
            {words.slice(band.first - 1, band.last).map((word, offset) => {
              const index = band.first - 1 + offset;
              const number = index + 1;
              const fill = fills.get(number);
              const underline = underlines.get(number);
              // A mark with no colour and no underline has nothing on the words
              // to press; its margin marker is the way in.
              const pressable = Boolean(fill || underline);
              return (
                <span
                  key={number}
                  data-verse={verse.number}
                  data-word={number}
                  data-selected={selectedAt(number) ? "" : undefined}
                  onClick={() => {
                    if (!pressable) return;
                    if (!window.getSelection()?.isCollapsed) return;
                    onWords(verse.number, number);
                  }}
                  className={pressable ? "cursor-pointer" : undefined}
                  style={{
                    // Only a mark the reader made is drawn on the words: a fill
                    // or an underline in its own colour. A link paints nothing,
                    // because the line it used to draw read as a mark — the
                    // words were already highlighted, and a blue edge under
                    // them was a second answer to a question the reader had
                    // not asked.
                    textDecorationLine: underline ? "underline" : undefined,
                    textDecorationColor: underline ? `var(--mark-ink-${underline})` : undefined,
                    textDecorationThickness: underline ? "2px" : undefined,
                    textUnderlineOffset: underline ? "3px" : undefined,
                  }}
                >
                  {word.word}
                  {index < words.length - 1 ? " " : null}
                </span>
              );
            })}
            {rightInk && (
              <span
                aria-hidden
                className="mark-underline-bleed mark-underline-bleed-end"
                style={{ backgroundColor: `var(--mark-ink-${rightInk})` }}
              />
            )}
          </span>
          );
        })}
      </span>

      {/* The verse's margin, at its right edge: one mark, and it is how a note
          is read, a linked passage shown, and the verse's tags gathered. Notes
          and links used to leave a mark each; they are sections of one panel
          now, so they share the door. It does not matter how many notes or
          links the verse holds — the panel behind it lists them all. */}
      {carried && (
        <button
          type="button"
          onClick={() => onAside(verse.number)}
          aria-label={`Open the notes, links, and tags on verse ${verse.number}`}
          title="Notes, links, and tags"
          className="grid h-6 w-6 place-items-center rounded-full bg-accent/20 text-accent-strong transition-colors hover:bg-accent/30"
        >
          <Glyph name="annotations" className="h-3.5 w-3.5" />
        </button>
      )}
    </p>
  );
}
