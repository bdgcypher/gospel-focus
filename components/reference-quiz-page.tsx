"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FeaturePage } from "./feature-page";
import { Glyph } from "./glyph";
import { SearchSelect, type SelectOption } from "./search-select";
import { spendGems, useGems } from "@/lib/gems";
import { goalReached, useStudy } from "@/lib/study";
import {
  NoSourcesError,
  chapterSizes,
  citationHref,
  loadManifest,
  pickPassage,
} from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import type { Manifest, Passage } from "@/lib/types";

/** The four parts of a reference, in the order the hints give them away. */
const PARTS = ["volume", "book", "chapter", "verse"] as const;
type Part = (typeof PARTS)[number];

const LABELS: Record<Part, string> = {
  volume: "Volume",
  book: "Book",
  chapter: "Chapter",
  verse: "Verse",
};

/**
 * What each part costs, in gems. The price follows how much the answer the
 * part gives away: a volume narrows the field, a verse ends the round.
 */
const HINT_COST: Record<Part, number> = {
  volume: 1,
  book: 5,
  chapter: 10,
  verse: 15,
};

/** A round is this many guesses — the third wrong one ends it. */
const MAX_TRIES = 3;

interface Answer {
  volumeId: string;
  book: string;
  chapter: string;
  verse: string;
}

interface ChapterSize {
  chapter: number;
  verses: number;
}

const NONE_REVEALED: Record<Part, boolean> = {
  volume: false,
  book: false,
  chapter: false,
  verse: false,
};

/** The round's state: still asking, answered, or out of tries. */
type Round = "playing" | "won" | "lost";

/**
 * "What's That Verse?" — a verse is printed and the reader names its reference.
 *
 * The answer is built from four searchable dropdowns, one per part of a
 * reference, so a guess is a set of choices rather than a typed string that has
 * to be parsed. Three guesses are allowed; the third wrong one ends the round.
 *
 * Hints are bought rather than spent from a score: each part of the reference
 * has a price in gems (lib/gems.ts), and the hint sheet lists all four so the
 * reader can decide which part is worth buying — the volume for a gem, or the
 * verse for fifteen. Parts already bought are ticked off in the same sheet, so
 * it doubles as the record of what has been given away.
 *
 * A wrong guess only marks the parts that are off; nothing is charged for it
 * beyond one of the three tries.
 */
export function ReferenceQuizPage() {
  const preferences = usePreferences();
  const gems = useGems();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [volumeId, setVolumeId] = useState<string | null>(null);
  const [book, setBook] = useState<string | null>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  const [verse, setVerse] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<Record<Part, boolean>>({ ...NONE_REVEALED });
  const [wrong, setWrong] = useState<Partial<Record<Part, boolean>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [round, setRound] = useState<Round>("playing");
  /** Wrong guesses this round, 0–MAX_TRIES. */
  const [tries, setTries] = useState(0);
  const [hintsOpen, setHintsOpen] = useState(false);
  /** The result sheet starts open on the guess that ended the round. */
  const [resultOpen, setResultOpen] = useState(false);

  /** The chapter list of the book being answered, once it is known. */
  const [sizes, setSizes] = useState<{ key: string; chapters: ChapterSize[] } | null>(null);

  /**
   * Draw a verse and keep what it will take to mark a guess: the volume is the
   * one whose book list holds the drawn book, and the answer is the passage's
   * own citation. Scriptures only — a talk has a title, not a book and chapter.
   */
  const draw = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setWrong({});
    setRevealed({ ...NONE_REVEALED });
    setRound("playing");
    setTries(0);
    setHintsOpen(false);
    setResultOpen(false);
    setVolumeId(null);
    setBook(null);
    setChapter(null);
    setVerse(null);
    setPassage(null);
    setAnswer(null);

    try {
      const catalogue = manifest ?? (await loadManifest());
      setManifest(catalogue);
      const next = await pickPassage(catalogue, {
        ...preferences.filters,
        conferenceMaster: false,
      });
      const volume = catalogue.volumes.find((v) =>
        v.books.some((b) => b.name === next.book)
      );
      if (!volume || !next.book || !next.chapter || next.section == null) {
        throw new Error("That verse isn't in this build of the library.");
      }
      setPassage(next);
      setAnswer({
        volumeId: volume.id,
        book: next.book,
        chapter: String(next.chapter),
        verse: String(next.section),
      });
    } catch (cause) {
      setError(
        cause instanceof NoSourcesError
          ? "No books of scripture are switched on, so there is nothing to draw from. Turn a book back on in the reader's filters."
          : cause instanceof Error
            ? cause.message
            : "A verse couldn't be drawn. Try again."
      );
    } finally {
      setLoading(false);
    }
  }, [manifest, preferences.filters]);

  useEffect(() => {
    const id = window.setTimeout(() => void draw(), 0);
    return () => window.clearTimeout(id);
  }, [draw]);

  // The chapter and verse pickers have to know how long a book is before the
  // answer is chosen, so a chosen book's chapter sizes are fetched once.
  const sizesKey = volumeId && book ? `${volumeId}:${book}` : null;
  const chapters = sizes && sizes.key === sizesKey ? sizes.chapters : null;

  useEffect(() => {
    if (!volumeId || !book) return;
    const key = `${volumeId}:${book}`;
    let live = true;
    chapterSizes(volumeId, book)
      .then((list) => {
        if (live) setSizes({ key, chapters: list });
      })
      .catch(() => {
        if (live) setSizes({ key, chapters: [] });
      });
    return () => {
      live = false;
    };
  }, [volumeId, book]);

  const volume = manifest?.volumes.find((v) => v.id === volumeId) ?? null;
  // Volumes with a single book — the Doctrine and Covenants — name it in their
  // own title, so there is nothing to choose; the book is settled by the volume
  // and its dropdown is left disabled (lib/picker.ts drops the duplicate there
  // for the same reason).
  const soleBook = soleBookOf(manifest, volumeId);
  const ready = Boolean(volumeId && book && chapter && verse) && round === "playing";
  const triesLeft = MAX_TRIES - tries;

  const clearMarks = () => {
    setWrong({});
    setNotice(null);
  };

  const reveal = (part: Part) => {
    if (!answer || round !== "playing" || revealed[part]) return;
    if (!spendGems(HINT_COST[part])) return;

    setRevealed((current) => ({ ...current, [part]: true }));
    clearMarks();
    if (part === "volume") {
      setVolumeId(answer.volumeId);
      setBook(soleBookOf(manifest, answer.volumeId));
    }
    if (part === "book") setBook(answer.book);
    if (part === "chapter") setChapter(answer.chapter);
    if (part === "verse") setVerse(answer.verse);
  };

  const guess = () => {
    if (!answer || !ready) return;
    const marks: Partial<Record<Part, boolean>> = {
      volume: volumeId !== answer.volumeId,
      book: book !== answer.book,
      chapter: chapter !== answer.chapter,
      verse: verse !== answer.verse,
    };
    setWrong(marks);
    if (Object.values(marks).some(Boolean)) {
      const used = tries + 1;
      setTries(used);
      if (used >= MAX_TRIES) {
        setNotice(null);
        setRound("lost");
        setResultOpen(true);
        return;
      }
      setNotice(
        `Not quite — the parts marked in red are off. ${MAX_TRIES - used} ${
          MAX_TRIES - used === 1 ? "try" : "tries"
        } left.`
      );
      return;
    }
    setNotice(null);
    setRound("won");
    setResultOpen(true);
  };

  const volumeOptions = (manifest?.volumes ?? []).map((v) => ({
    value: v.id,
    label: v.title,
  }));
  const bookOptions = withValue(
    (volume?.books ?? []).map((b) => ({ value: b.name, label: b.name })),
    book,
    (value) => value
  );
  const chapterOptions = withValue(
    (chapters ?? []).map((c) => ({ value: String(c.chapter), label: `Chapter ${c.chapter}` })),
    chapter,
    (value) => `Chapter ${value}`
  );
  const verseCount = chapters?.find((c) => String(c.chapter) === chapter)?.verses ?? 0;
  const verseOptions = withValue(
    Array.from({ length: verseCount }, (_, i) => ({
      value: String(i + 1),
      label: `Verse ${i + 1}`,
    })),
    verse,
    (value) => `Verse ${value}`
  );

  const reference = answer ? `${answer.book} ${answer.chapter}:${answer.verse}` : "";

  return (
    // The strapline is the verse's own invitation rather than the catalog's
    // "read a verse, name its reference", which is what the hub card still
    // says — here the page is opened, so the words can do the asking. Set as a
    // verse with its citation: the words in the serif italic the reader meets
    // them in, the reference after them and kept whole.
    <FeaturePage
      featureId="reference-quiz"
      subtitle={
        <span>
          <span className="font-serif italic text-foreground/85">
            &ldquo;Learn of me… and ye shall find rest unto your souls.&rdquo;
          </span>{" "}
          <span className="whitespace-nowrap font-semibold">
            —{" "}
            <Link
              href={citationHref({
                kind: "scripture",
                book: "Matthew",
                chapter: "11",
                section: 29,
              })}
              className="text-accent-strong hover:underline"
            >
              Matthew 11:29
            </Link>
          </span>
        </span>
      }
    >
      <div className="mx-auto w-full max-w-lg">
        {error ? (
          <div className="rounded-3xl border border-border bg-surface p-6 text-sm">
            <p className="font-semibold text-foreground">No verse to show.</p>
            <p className="mt-2 text-muted">{error}</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => void draw()}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
              >
                <Glyph name="dice" className="h-4 w-4" />
                Try again
              </button>
              <Link
                href="/read"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
              >
                Change sources
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-border bg-surface p-5">
              {/* Only the count of tries is left up here. The page's own title
                  already asks the question, so a line inside the card asking it
                  again only pushed the verse down the card. */}
              <div className="flex items-center justify-end text-xs font-semibold uppercase tracking-wider text-muted">
                <span className="whitespace-nowrap">
                  {round === "playing"
                    ? `${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left`
                    : round === "won"
                      ? "Found"
                      : "Out of tries"}
                </span>
              </div>
              <p className="mt-3 min-h-24 font-serif text-lg leading-relaxed text-foreground">
                {passage?.text ?? "Drawing a verse…"}
              </p>

              {/* One control instead of four prices in a row: the parts are
                  chosen in the sheet, where each one can say what it costs and
                  whether it has already been bought. The wallet itself lives in
                  the app bar, so the card does not repeat it. */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setHintsOpen(true)}
                  disabled={round !== "playing" || !answer}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:opacity-50"
                >
                  <Glyph name="help" className="h-3.5 w-3.5" />
                  Hint
                </button>
              </div>
            </div>

            {/* Two columns at every width: the four parts are two pairs — the
                volume and its book, the chapter and its verse — and reading
                them as a block beats scrolling four full-width controls. */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <SearchSelect
                label="Volume"
                options={volumeOptions}
                value={volumeId}
                onChange={(value) => {
                  clearMarks();
                  setVolumeId(value);
                  // A single-book volume comes with its book already chosen, so
                  // the round can be completed without the disabled control.
                  setBook(soleBookOf(manifest, value));
                  setChapter(null);
                  setVerse(null);
                }}
                placeholder={loading ? "Drawing…" : "Choose a volume"}
                disabled={round !== "playing"}
                invalid={Boolean(wrong.volume)}
                revealed={revealed.volume}
              />
              <SearchSelect
                label="Book"
                options={bookOptions}
                value={book}
                onChange={(value) => {
                  clearMarks();
                  setBook(value);
                  setChapter(null);
                  setVerse(null);
                }}
                disabled={(!volumeId && !revealed.book) || Boolean(soleBook) || round !== "playing"}
                placeholder="Choose a book"
                invalid={Boolean(wrong.book)}
                revealed={revealed.book}
              />
              <SearchSelect
                label="Chapter"
                options={chapterOptions}
                value={chapter}
                onChange={(value) => {
                  clearMarks();
                  setChapter(value);
                  setVerse(null);
                }}
                disabled={((!book || !chapters) && !revealed.chapter) || round !== "playing"}
                placeholder={book && !chapters ? "Loading chapters…" : "Choose a chapter"}
                invalid={Boolean(wrong.chapter)}
                revealed={revealed.chapter}
              />
              <SearchSelect
                label="Verse"
                options={verseOptions}
                value={verse}
                onChange={(value) => {
                  clearMarks();
                  setVerse(value);
                }}
                disabled={(!chapter && !revealed.verse) || round !== "playing"}
                placeholder="Choose a verse"
                invalid={Boolean(wrong.verse)}
                revealed={revealed.verse}
              />
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <button
                type="button"
                onClick={guess}
                disabled={!ready}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
              >
                Guess
              </button>
              <p role="status" className="text-sm text-wrong">
                {notice}
              </p>
            </div>

            {/* Once the result sheet has been closed, the round still needs a
                way on, so the same one-liner and button stay in the page. */}
            {round !== "playing" && !resultOpen && (
              <div className="mt-5 rounded-3xl border border-border bg-surface p-5">
                <p className="font-serif text-lg font-semibold text-foreground">
                  {round === "won" ? "Good Work!" : "Not Quite!"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {round === "won"
                    ? `Found in ${tries + 1} of ${MAX_TRIES}.`
                    : `The reference was ${reference}.`}
                </p>
                <button
                  type="button"
                  onClick={() => void draw()}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
                >
                  <Glyph name="dice" className="h-4 w-4" />
                  Next verse
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {hintsOpen && answer && (
        <HintSheet
          gems={gems.total}
          revealed={revealed}
          playing={round === "playing"}
          onBuy={reveal}
          onClose={() => setHintsOpen(false)}
        />
      )}

      {resultOpen && answer && passage && (
        <ResultSheet
          won={round === "won"}
          tries={tries}
          reference={reference}
          verse={passage.text}
          onClose={() => setResultOpen(false)}
          onNext={() => void draw()}
        />
      )}
    </FeaturePage>
  );
}

/**
 * The one book a volume holds, when it holds exactly one — the Doctrine and
 * Covenants. Null for every volume whose book still has to be chosen.
 */
function soleBookOf(manifest: Manifest | null, volumeId: string | null): string | null {
  const volume = manifest?.volumes.find((v) => v.id === volumeId);
  return volume && volume.books.length === 1 ? volume.books[0].name : null;
}

/**
 * A revealed value may not be in the list yet — a book hint can be bought
 * before a volume, and a chapter or verse before its book has loaded — so the
 * control gets a one-option list of its own rather than showing an empty box
 * for something the reader has already paid for.
 */
function withValue(
  options: SelectOption[],
  value: string | null,
  label: (value: string) => string
): SelectOption[] {
  if (!value || options.some((option) => option.value === value)) return options;
  return [{ value, label: label(value) }, ...options];
}

/**
 * The hint sheet: every part, its price, and whether it has been bought.
 *
 * Nothing here says how much the reader has: the wallet is in the app bar, and
 * a wallet read out in the sheet as well was a second place to look for the
 * same number. A price the reader cannot cover is not struck out either — the
 * row stays live and says so plainly when it is asked for (see
 * InsufficientGems), which tells them what is missing instead of leaving a
 * greyed-out row to guess about.
 */
function HintSheet({
  gems,
  revealed,
  playing,
  onBuy,
  onClose,
}: {
  gems: number;
  revealed: Record<Part, boolean>;
  playing: boolean;
  onBuy: (part: Part) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  /** Whether the insufficient-gems note is up. */
  const [shortOn, setShortOn] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // With the note up, Escape puts the note away rather than the sheet, so
      // one key press is one screen — the note is the one on top.
      if (event.key !== "Escape" || shortOn) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, shortOn]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hint-sheet-title"
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl outline-none"
      >
        {/* Only the title and the prices: what the rows are and what they
            cost is the whole of the sheet, and every line explaining it again
            was another line between the reader and the four choices. */}
        <div className="flex items-start justify-between gap-3">
          <h2
            id="hint-sheet-title"
            className="font-serif text-xl font-semibold text-foreground"
          >
            Hint
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {PARTS.map((part) => {
            const used = revealed[part];
            const cost = HINT_COST[part];
            const affordable = gems >= cost;
            return (
              <li key={part}>
                <button
                  type="button"
                  onClick={() => (affordable ? onBuy(part) : setShortOn(true))}
                  disabled={used || !playing}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                    used
                      ? "border-accent/40 bg-accent/10"
                      : !playing
                        ? "border-border bg-surface-2/50 opacity-60"
                        : "border-border bg-surface-2 hover:border-accent/60"
                  }`}
                >
                  <span className={used ? "font-semibold text-accent-strong" : "font-semibold text-foreground"}>
                    {LABELS[part]}
                  </span>
                  {used ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
                      <Glyph name="check" className="h-3.5 w-3.5" />
                      Used
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <Glyph name="gem" className="h-3.5 w-3.5" />
                      <span className="tabular-nums">{cost}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {shortOn && <InsufficientGems onClose={() => setShortOn(false)} />}
    </div>,
    document.body
  );
}

/**
 * The note a price the reader cannot cover gets.
 *
 * It says what happened and offers the one thing that can change it. Which
 * thing that is depends on the day: with the day's study still open the reader
 * can earn the gems by going to study, and once the goal is met there is
 * nothing left to earn today, so the ask becomes getting more instead. The
 * close control is the whole way back — the sheet is still behind this note,
 * and a second button saying so was a button for the same job as the cross.
 *
 * On a phone the action fills the note the way the app's other primary actions
 * do; from `sm` up it is only as wide as its words.
 */
function InsufficientGems({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const study = useStudy();
  const studied = goalReached(study);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="insufficient-gems-title"
        className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="insufficient-gems-title"
            className="font-serif text-xl font-semibold text-foreground"
          >
            Insufficient Gems
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>

        <Link
          href="/study"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 sm:w-auto"
        >
          {studied ? (
            <>
              Get more
              <Glyph name="arrow" className="h-4 w-4" />
            </>
          ) : (
            "Begin study"
          )}
        </Link>
      </div>
    </div>,
    document.body
  );
}

/** The round's ending, in the same shape as the word game's result sheet. */
function ResultSheet({
  won,
  tries,
  reference,
  verse,
  onClose,
  onNext,
}: {
  won: boolean;
  tries: number;
  reference: string;
  verse: string;
  onClose: () => void;
  onNext: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-result-title"
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="reference-result-title"
              className={`whitespace-nowrap font-serif text-2xl font-semibold ${
                won ? "text-correct-text" : "text-wrong"
              }`}
            >
              {won ? "Good Work!" : "Not Quite!"}{" "}
              <span aria-hidden="true">{won ? "🎉" : "🫤"}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              {won
                ? `Found in ${tries + 1} of ${MAX_TRIES}.`
                : `Out of tries — the reference was ${reference}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Glyph name="close" className="h-4 w-4" />
          </button>
        </div>

        {/* The reference is the answer, so it is the thing marked: name it in
            its own line, then let the verse be read again underneath. */}
        <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Reference
          </p>
          <p className="mt-1 font-serif text-lg font-semibold text-foreground">
            <mark className="rounded-[4px] bg-accent/25 px-1.5 py-0.5 text-inherit">
              {reference}
            </mark>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{verse}</p>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
        >
          <Glyph name="dice" className="h-4 w-4" />
          Next verse
        </button>
      </div>
    </div>,
    document.body
  );
}
