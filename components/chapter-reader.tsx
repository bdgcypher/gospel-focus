"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AppShell } from "./app-shell";
import { AnnotationDialog } from "./annotation-dialog";
import { AnnotationToolbar } from "./annotation-toolbar";
import { BackLink } from "./back-link";
import { BookmarkIcon } from "./bookmark-icon";
import { BookmarksDialog } from "./bookmarks-dialog";
import { ChapterRail, ReaderPlaceButton, ReaderPlaceMenu } from "./reader-nav";
import { ReaderSwipe } from "./reader-swipe";
import { Glyph } from "./glyph";
import { MarkChooser } from "./mark-chooser";
import { MarkHandles, type WordRange } from "./mark-handles";
import { Sheet } from "./sheet";
import { SaveToDeckDialog } from "./save-to-deck-dialog";
import { ShareCardDialog } from "./share-card-dialog";
import { TagsDialog } from "./tags-dialog";
import { VerseAside } from "./verse-aside";
import { VerseRow } from "./verse-row";
import {
  addAnnotations,
  allTags,
  annotationsFor,
  backlinksForDoc,
  cleanTag,
  markGroup,
  markGroupId,
  marksAt,
  newId,
  noteRecentChoice,
  noteText,
  rangeText,
  rangesInSelection,
  tagKey,
  removeAnnotations,
  updateAnnotation,
  useAnnotations,
  useRecentChoices,
  wordsOf,
  type Annotation,
  type AnnotationLink,
  type Backlink,
  type MarkColor,
  type MarkStyle,
  type SelectionRange,
} from "@/lib/annotations";
import { bookmarkReference, type BookmarkPlace } from "@/lib/bookmarks";
import { dayKey } from "@/lib/daily";
import { openExternal } from "@/lib/external";
import { setImmersive, toggleImmersive } from "@/lib/immersive";
import { favoriteId, toggleFavorite, useFavorites } from "@/lib/favorites";
import { sanitizeBody } from "@/lib/journal";
import { itemFromPassage, type MemoryItem } from "@/lib/memorize";
import { loadManifest, pickDailyPassage } from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import {
  docCitation,
  scrollHref,
  neighbourCitation,
  openReaderDoc,
  parseVerseList,
  readLastPlace,
  readerHref,
  versePassage,
  writeLastPlace,
  type ReaderCitation,
  type ReaderDoc,
} from "@/lib/reader";
import type { ShareCard } from "@/lib/share-image";
import type { Passage } from "@/lib/types";

/**
 * How quick, and how still, a second tap has to be to be one gesture with the
 * first. The window is the one every platform uses for a double tap; the few
 * pixels allowed are for a thumb that is not perfectly still between them.
 */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 28;

interface SelectionState {
  ranges: SelectionRange[];
  text: string;
}

interface EditorState {
  title: string;
  quote: string;
  note: string;
  /** The note's optional name, shown as its heading in the lists. */
  noteTitle: string;
  /** The passages the mark points at, in the order they were added. */
  links: AnnotationLink[];
  ranges: SelectionRange[];
  /** The annotation being edited, when the sheet was opened from a mark. */
  existingId?: string;
  /** Which field the sheet opens on, from the panel's Note or Link. */
  focus?: "note" | "link";
}

interface TagsEditorState {
  /** The reference the words sit in, for the sheet's heading. */
  title: string;
  /** The words the tags belong to, quoted under it. */
  quote: string;
  /** The tags the sheet opens on. */
  tags: string[];
  /** Every annotation the save applies to; empty when marks must be created. */
  ids: string[];
  /** The ranges to create marks for, when the words are not marked yet. */
  ranges: SelectionRange[];
  /** Opened from the marking panel, which closes when the tags are saved. */
  fromPanel: boolean;
}

/**
 * The chapter reader.
 *
 * The page is one chapter and nothing else: no title block, no card around the
 * words, no row of controls between the reader and the text. A slim bar holds
 * the way back, the chapter's name in small type, and one button for everything
 * else (the library, the chapter grid, this chapter's marks); the chapter itself
 * runs the width of a page of scripture, verse numbers set inline, and the
 * previous and next chapters wait quietly at the foot of it. It is the
 * destination every passage link in the app now points at, which is why it
 * accepts three addresses:
 *
 *   /read?book=jer&chapter=3&verse=15   the place, in the reader's own words
 *   /read?book=jer&chapter=31&verse=3-4,6   the verses of it that were named
 *   /read?action=cite&…                 the older citation links, still valid
 *   /read?action=daily                  today's Come, Follow Me passage
 *
 * A bare /read continues where the reader left off, and falls back to the day's
 * passage on a first visit.
 */
export function ChapterReader() {
  const params = useSearchParams();
  const router = useRouter();
  const prefs = usePreferences();
  const annotations = useAnnotations();
  const favorites = useFavorites();
  /** The last two colours the reader marked with, in the style they used. */
  const recents = useRecentChoices();

  const [doc, setDoc] = useState<ReaderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * The verses the address asked to be shown, marked down the chapter. A list
   * rather than one number: a citation can name a range or a scattered pick
   * (`Jeremiah 31:3-4; 6`), and every part of it is the place being opened.
   */
  const [focus, setFocus] = useState<number[]>([]);
  const [fromDaily, setFromDaily] = useState(false);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  /** The mark the panel is open on — its group id, not one verse's segment. */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** The style the next colour tap will make, before any mark exists. */
  const [pendingStyle, setPendingStyle] = useState<MarkStyle>("fill");
  const [editor, setEditor] = useState<EditorState | null>(null);
  /** The chapter's own name, opened as the way to another chapter on a phone. */
  const [placeOpen, setPlaceOpen] = useState(false);
  /** The reader's saved places, and where they were when they opened them. */
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarkPlace, setBookmarkPlace] = useState<BookmarkPlace | null>(null);
  const [verseSheet, setVerseSheet] = useState<number | null>(null);
  const [share, setShare] = useState<ShareCard | null>(null);
  /** The card a memorized run would become, before it is filed in a deck. */
  const [memory, setMemory] = useState<MemoryItem | null>(null);
  /** A verse's note or link, read in a panel beside the words. */
  const [aside, setAside] = useState<{ verse: number } | null>(null);
  /** The sheet that writes tags, and the annotations it will write them on. */
  const [tagsEditor, setTagsEditor] = useState<TagsEditorState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Several marks lie under one tap; the chooser is the choice between them. */
  const [choosing, setChoosing] = useState<Annotation[][] | null>(null);
  /** Where a dragged edge has reached, painted in place of the stored mark. */
  const [dragRange, setDragRange] = useState<WordRange | null>(null);
  /** A handle is being dragged; a finger lifting over a word is not a tap. */
  const adjusting = useRef(false);
  /** The last tap on the words, so the next one can be read as part of a pair. */
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  /**
   * Until when the words a double tap may have selected are to be ignored.
   *
   * The gesture is answered the moment both taps are counted, but the browser's
   * own selection arrives a moment later (see the three events above), and that
   * delayed read would paint a word and open the marking panel a beat after the
   * bars had gone.
   */
  const quietUntil = useRef(0);
  /**
   * Whether a finger or mouse button is down, so a native selection is read
   * once it is finished rather than while it is still being dragged. A
   * selection read in the middle of a gesture cannot be collapsed under the
   * pointer — the browser's selection still paints the words the reader is
   * choosing until they let go.
   */
  const pressing = useRef(false);
  /** Whether the current selection was made with the keyboard rather than a pointer. */
  const keyboard = useRef(false);

  const article = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<number | null>(null);

  const announce = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2200);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    []
  );

  /** Resolve whatever the URL asks for into a document to read. */
  useEffect(() => {
    let live = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const action = params.get("action");
        let citation: ReaderCitation | null = null;
        let verses: number[] = [];
        let daily = false;

        const book = params.get("book");
        const chapter = params.get("chapter");
        if (book && chapter) {
          const kind =
            params.get("kind") === "conference" || book === "General Conference"
              ? "conference"
              : "scripture";
          citation = {
            kind,
            book,
            chapter,
            conferenceId: params.get("session") ?? undefined,
          };
          // One param, but a series of verses: `verse=3-4,6` (or with the
          // separators a citation uses, `3-4; 6`). A cite link names its verse
          // with `section`, as the older citation links always did.
          const raw =
            params.get("verse") ??
            params.get("verses") ??
            (action === "cite" ? params.get("section") : null);
          verses = parseVerseList(raw);
        }

        if (action === "daily" || (!citation && !readLastPlace())) {
          const manifest = await loadManifest();
          const passage = await pickDailyPassage(manifest, prefs.filters, dayKey());
          const passageBook = passage.book ?? "General Conference";
          citation = {
            kind: passage.kind,
            book: passageBook,
            chapter: passage.chapter ?? "",
          };
          verses = passage.highlightVerse ? [passage.highlightVerse] : [];
          daily = true;
        } else if (!citation) {
          const last = readLastPlace();
          if (last) {
            citation = {
              kind: last.kind,
              book: last.book,
              chapter: last.chapter,
              conferenceId: last.conferenceId,
            };
            verses = last.verse ? [last.verse] : [];
          }
        }

        if (!citation) {
          if (live) setError("There is no chapter to open.");
          return;
        }

        const opened = await openReaderDoc(citation);
        if (!live) return;
        if (!opened) {
          setError("That chapter isn't in this build of the library.");
          return;
        }
        setDoc(opened);
        setFocus(verses);
        setFromDaily(daily);
        writeLastPlace({
          kind: opened.kind,
          book: opened.book,
          chapter: opened.chapter,
          conferenceId: opened.conferenceId,
          // The place is the start of the series, which is where a return visit
          // should land; the rest of it is kept in the address it came from.
          verse: verses[0],
        });
      } catch (cause) {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : "The chapter couldn't be opened.");
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [params, prefs.filters]);

  /** Bring the first requested verse into view, or start a new chapter at its head. */
  useEffect(() => {
    if (!doc) return;
    const id = window.setTimeout(() => {
      if (focus.length) {
        document
          .getElementById(`verse-${focus[0]}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    }, 90);
    return () => window.clearTimeout(id);
  }, [doc, focus]);

  /** The words of a run, in reading order, as one run of prose. */
  const quoteOf = useCallback(
    (ranges: SelectionRange[]) => {
      if (!doc) return "";
      return ranges
        .map((range) =>
          rangeText(
            doc.verses.find((verse) => verse.number === range.verse)?.text ?? "",
            range.startWord,
            range.endWord
          )
        )
        .join(" ");
    },
    [doc]
  );

  /** The verses one run of words crosses, split the way a mark is stored. */
  const segmentsOf = useCallback(
    (range: WordRange): SelectionRange[] => {
      if (!doc) return [];
      const first = doc.verses.findIndex((verse) => verse.number === range.from.verse);
      const last = doc.verses.findIndex((verse) => verse.number === range.to.verse);
      if (first < 0 || last < 0) return [];
      const segments: SelectionRange[] = [];
      for (let index = first; index <= last; index += 1) {
        const verse = doc.verses[index];
        const startWord = verse.number === range.from.verse ? range.from.word : 1;
        const endWord =
          verse.number === range.to.verse ? range.to.word : wordsOf(verse.text).length;
        if (endWord >= startWord) segments.push({ verse: verse.number, startWord, endWord });
      }
      return segments;
    },
    [doc]
  );

  /**
   * Read the browser's selection back as word ranges, then take the selection
   * away.
   *
   * The panel and the handles are drawn from state, not from the browser's
   * selection. Leaving a live selection behind would leave the platform's own
   * handles and Copy/Share menu on the same words — a second set of controls
   * over the panel's. Reading the run once and collapsing it is what makes the
   * app's marking UI the only one on the page.
   *
   * A selection arrives three ways — a drag ending in a pointerup,
   * shift-and-arrow ending in a keyup, and a phone's selection handles, which
   * only announce themselves as the selection changes. It is read once the
   * gesture has ended (`pressing`), so a drag keeps painting with the browser's
   * own selection until the finger lifts; what is stored is the run the reader
   * finished on.
   */
  const captureSelection = useCallback(() => {
    const box = article.current;
    if (!box) return;
    // A double tap is about the screen, not about the words: whatever the
    // browser selected as part of that gesture is not a mark the reader asked
    // for. The range is dropped here rather than only at the tap itself because
    // on a phone the browser applies its own selection a beat after the taps
    // that asked for it — after the reader's handler has already cleared what
    // was there.
    if (performance.now() < quietUntil.current) {
      window.getSelection()?.removeAllRanges();
      return;
    }
    const ranges = rangesInSelection(box);
    const text = quoteOf(ranges);
    if (!ranges.length || !text) return;
    // New words under the finger, so the panel is for these words and not for
    // whatever mark was open a moment ago.
    setActiveId(null);
    setSelection({ ranges, text });
    // A keyboard selection is left live: the platform draws no handles or menu
    // beside it, and collapsing it would break the next shift+arrow.
    if (!keyboard.current) window.getSelection()?.removeAllRanges();
  }, [quoteOf]);

  useEffect(() => {
    if (!doc) return;

    let timer = 0;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(captureSelection, delay);
    };

    const onUp = () => schedule(30);
    const onSelectionChange = () => {
      // A selection made mid-drag is still being dragged; it is read when the
      // finger lifts, not under it.
      if (!pressing.current && !window.getSelection()?.isCollapsed) schedule(160);
    };
    const onPointerDown = () => {
      pressing.current = true;
      keyboard.current = false;
    };
    const onKeyDown = () => {
      keyboard.current = true;
    };
    const onPointerCancel = () => {
      pressing.current = false;
      schedule(30);
    };
    // A pointer released outside the window never reports itself here; without
    // this the next selection would wait for a lift that already happened.
    const onBlur = () => {
      pressing.current = false;
    };
    const onPointerUp = (event: PointerEvent) => {
      pressing.current = false;
      const box = article.current;
      // A press on one of a mark's own handles is not a dismissal: the handle
      // sits inside the words, and taking the mark away would take the handle
      // and the drag with it.
      const onHandle = event.target instanceof Element && Boolean(event.target.closest("[data-mark-handle]"));
      if (!onHandle && !adjusting.current && box && event.target instanceof Node && box.contains(event.target)) {
        // A tap in the words with nothing selected is a dismissal: the panel
        // belongs to the words under the finger, and the finger has moved. A
        // tap *on* a mark reopens it from the word's own click, which lands
        // after this.
        if (window.getSelection()?.isCollapsed) {
          setSelection(null);
          setActiveId(null);
        }
      }
      schedule(30);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onUp);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("blur", onBlur);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [doc, captureSelection]);

  const docMarks = useMemo(
    () => (doc ? annotationsFor(annotations, doc.doc) : []),
    [annotations, doc]
  );

  /**
   * The ways back into this chapter, by verse: every mark elsewhere in the
   * library whose link names a verse here. A link is read from both ends, so
   * linking 1 Nephi 3:7 to D&C 6:36 leaves a way back on D&C 6:36 without a
   * second link being stored, and removing the link takes it away again.
   */
  const docBacklinks = useMemo(() => {
    if (!doc) return new Map<number, Backlink[]>();
    return backlinksForDoc(annotations, {
      kind: doc.kind,
      book: doc.book,
      chapter: doc.chapter,
      conferenceId: doc.conferenceId,
    });
  }, [annotations, doc]);

  /** How many words a verse of this chapter holds, for the handles' edges. */
  const wordsInVerse = (verse: number) =>
    wordsOf(doc?.verses.find((entry) => entry.number === verse)?.text ?? "").length;

  /** Close every way into a mark: the words' selection, the panel, the chooser. */
  const dismiss = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setActiveId(null);
  }, []);

  /**
   * A double tap on the words hands the screen to the chapter, and a second one
   * gives the bars back (see lib/immersive.ts).
   *
   * The pair is counted from two pointerups rather than taken from `dblclick`,
   * because a phone's WebView only turns a double tap into a mouse event when
   * it feels like it. A press that lands on one of the page's own controls is
   * not this gesture at all: a verse number is opened by tapping it, and opening
   * a note twice should not cost the reader the bars.
   *
   * The browser answers a double tap on text with a word of its own — a phone
   * selects the word under the finger — and that selection is the platform's
   * reading of the gesture, not the reader's. The reader asked for room, so the
   * word is dropped before the reader's own tracking can turn it into a mark.
   * Marking is done by dragging across the words and by the handles that come
   * with the run, both of which are untouched.
   */
  const onWordsPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("button, a")) {
      lastTap.current = null;
      return;
    }
    const now = performance.now();
    const previous = lastTap.current;
    lastTap.current = { at: now, x: event.clientX, y: event.clientY };
    if (
      !previous ||
      now - previous.at > DOUBLE_TAP_MS ||
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > DOUBLE_TAP_PX
    ) {
      return;
    }
    lastTap.current = null;
    // Long enough to outlast the delayed read of the selection this gesture
    // makes — the tracking above waits 160ms for a selection to settle — and
    // short enough that the reader's next drag across the words is heard.
    quietUntil.current = now + 300;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    toggleImmersive();
  };

  // Fullscreen is a mode of the chapter, not of the app: leaving it — for the
  // library, a game, anywhere without a way out of it — gives the bars back.
  useEffect(() => () => setImmersive(false), []);

  /**
   * The run a handle has just described, as the app's selection.
   *
   * There is nothing stored to repaint here, so the selection itself is what
   * grows: the range the handle reports becomes the state every word span and
   * the panel read from, exactly as if the browser had selected those words.
   */
  const showSelection = (range: WordRange) => {
    const ranges = segmentsOf(range);
    const text = quoteOf(ranges);
    if (ranges.length && text) setSelection({ ranges, text });
  };

  const previewSelection = (range: WordRange) => {
    adjusting.current = true;
    // A handle is a pointer gesture even when the run it moves was selected by
    // the keyboard, so the platform's paint goes and the app's wash takes over.
    window.getSelection()?.removeAllRanges();
    showSelection(range);
  };

  const commitSelection = (range: WordRange) => {
    adjusting.current = false;
    showSelection(range);
  };

  /** The reference a selection spans, e.g. "Jeremiah 3:15" or "Jeremiah 3:20-21". */
  const rangeLabel = useCallback(
    (ranges: { verse: number; startWord: number; endWord: number }[]) => {
      if (!doc || !ranges.length) return "";
      const first = ranges[0];
      const last = ranges[ranges.length - 1];
      const span = first.verse === last.verse ? `${first.verse}` : `${first.verse}–${last.verse}`;
      return doc.kind === "conference" ? `${doc.title} · ${span}` : `${doc.book} ${doc.chapter}:${span}`;
    },
    [doc]
  );

  /**
   * The mark being looked at, read back from the store: a sweep across verses is
   * one mark, however many annotations it takes to store it, so it is gathered
   * by its group id rather than by the segment the tap landed on.
   */
  const active = useMemo(() => {
    if (!activeId) return null;
    const group = docMarks
      .filter((mark) => markGroupId(mark) === activeId)
      .sort((a, b) => a.verse - b.verse || a.startWord - b.startWord);
    return group.length ? group : null;
  }, [activeId, docMarks]);

  /**
   * The marks of a verse's margin, read back for the panel they open: the ones
   * that carry a note, a link, or a tag, oldest first, so two thoughts on the
   * same verse read in the order they were written.
   */
  const asideMarks = useMemo(() => {
    if (!aside) return [];
    return docMarks
      .filter((mark) => mark.verse === aside.verse)
      .filter(
        (mark) => noteText(mark.note).length > 0 || Boolean(mark.links?.length) || mark.tags.length > 0
      )
      .sort((a, b) => a.startWord - b.startWord || a.createdAt.localeCompare(b.createdAt));
  }, [aside, docMarks]);

  /**
   * What the words look like while one of a mark's edges is being dragged.
   *
   * It replaces the stored paint rather than adding to it, so dragging an edge
   * in leaves nothing of the old extent showing behind the finger.
   */
  const preview = useMemo(() => {
    if (!dragRange || !active?.length || active[0].color === "clear") return null;
    return {
      groupId: markGroupId(active[0]),
      from: dragRange.from,
      to: dragRange.to,
      color: active[0].color,
      style: active[0].style,
    };
  }, [dragRange, active]);

  /** The words of a mark, in reading order, as one run of prose. */
  const groupQuote = useCallback(
    (group: Annotation[]) =>
      quoteOf(
        group.map((segment) => ({
          verse: segment.verse,
          startWord: segment.startWord,
          endWord: segment.endWord,
        }))
      ),
    [quoteOf]
  );

  /** The annotations exactly covering the current selection, if any. */
  const selectionMarks = useMemo(() => {
    if (!selection || !doc) return [];
    return docMarks.filter((mark) =>
      selection.ranges.some(
        (range) =>
          mark.verse === range.verse &&
          mark.startWord === range.startWord &&
          mark.endWord === range.endWord
      )
    );
  }, [doc, docMarks, selection]);

  const applyMark = async (color: MarkColor, style: MarkStyle) => {
    if (!doc || !selection) return;
    // A second colour on the same words replaces the plain mark rather than
    // stacking a second one under it; a mark that carries a note or link is left
    // alone, because its colour is not the only thing it is for.
    const plain = selectionMarks.filter((mark) => !mark.note && !mark.links?.length);
    if (plain.length) await removeAnnotations(plain.map((mark) => mark.id));

    // A run that crosses a verse break is stored one annotation per verse, and
    // the shared id is what makes it one mark again when it is tapped.
    const groupId = selection.ranges.length > 1 ? newId() : undefined;
    await addAnnotations(
      selection.ranges.map((range) => ({
        doc: doc.doc,
        book: doc.book,
        chapter: doc.chapter,
        verse: range.verse,
        startWord: range.startWord,
        endWord: range.endWord,
        color,
        style,
        groupId,
      }))
    );
    noteRecentChoice(color, style);
    dismiss();
    announce(style === "underline" ? `Underlined in ${color}` : `Highlighted in ${color}`);
  };

  /** Recolour (or convert) every verse segment of one mark. */
  const recolour = async (group: Annotation[], color: MarkColor, style: MarkStyle) => {
    await Promise.all(group.map((segment) => updateAnnotation(segment.id, { color, style })));
    noteRecentChoice(color, style);
    announce(style === "underline" ? `Underlined in ${color}` : `Highlighted in ${color}`);
  };

  const applyColour = (color: MarkColor) => {
    if (active) {
      void recolour(active, color, active[0].style);
      return;
    }
    void applyMark(color, pendingStyle);
  };

  const applyStyle = (style: MarkStyle) => {
    if (active && active[0].color !== "clear") {
      void recolour(active, active[0].color, style);
      return;
    }
    setPendingStyle(style);
  };

  /**
   * A recent swatch, which carries its own mode.
   *
   * It sets the panel's tab to that mode as well, so the palette under it is
   * read in the style just used rather than in whichever tab happened to be on.
   */
  const applyChoice = (color: MarkColor, style: MarkStyle) => {
    setPendingStyle(style);
    if (active) {
      void recolour(active, color, style);
      return;
    }
    void applyMark(color, style);
  };

  /**
   * Move an open mark's edges.
   *
   * A mark is one annotation per verse sharing a group, so widening it is the
   * same shape the reader writes when the mark is first made — except that the
   * segments already exist. Verses that stay are updated in place, keeping their
   * ids (and so their place in an export); verses that join are added; verses
   * that drop out are removed. The note travels with the mark rather than with
   * the verse it was written on: if that verse is the one being dropped, it
   * moves to the first verse that remains.
   */
  const adjustActive = async (range: WordRange) => {
    // The drag is over however this ends, so the flag clears before any of the
    // reasons to give up below — a stuck flag would make every later tap a tap
    // that cannot close a mark.
    adjusting.current = false;
    if (!doc || !active?.length) {
      setDragRange(null);
      return;
    }
    try {
      const segments = segmentsOf(range);
      if (!segments.length) return;

      const head = active[0];
      const groupId = markGroupId(head);
      const existing = new Map(active.map((segment) => [segment.verse, segment]));
      const keeping = new Set(segments.map((segment) => segment.verse));
      const holder = active.find((segment) => segment.note || segment.links?.length);
      const carried =
        holder && !keeping.has(holder.verse)
          ? { note: holder.note, links: holder.links }
          : undefined;

      for (const [index, segment] of segments.entries()) {
        const previous = existing.get(segment.verse);
        const carry = index === 0 ? carried : undefined;
        const shared = segments.length > 1 ? groupId : previous?.groupId;
        if (previous) {
          await updateAnnotation(previous.id, {
            startWord: segment.startWord,
            endWord: segment.endWord,
            groupId: shared,
            ...carry,
          });
        } else {
          await addAnnotations([
            {
              doc: doc.doc,
              book: doc.book,
              chapter: doc.chapter,
              verse: segment.verse,
              startWord: segment.startWord,
              endWord: segment.endWord,
              color: head.color,
              style: head.style,
              tags: head.tags,
              groupId: shared,
              ...carry,
            },
          ]);
        }
      }

      const gone = active.filter((segment) => !keeping.has(segment.verse));
      if (gone.length) await removeAnnotations(gone.map((segment) => segment.id));
      announce("Mark adjusted");
    } finally {
      setDragRange(null);
    }
  };

  /** The sheet that writes on a mark, opened only from the panel's Note/Link. */
  const editGroup = (group: Annotation[], focus: "note" | "link") => {
    const holder = group.find((segment) => segment.note || segment.links?.length) ?? group[0];
    setEditor({
      title: rangeLabel(group.map((segment) => ({ verse: segment.verse, startWord: segment.startWord, endWord: segment.endWord }))),
      quote: groupQuote(group),
      note: holder.note ?? "",
      noteTitle: holder.title ?? "",
      links: holder.links ?? [],
      ranges: group.map((segment) => ({ verse: segment.verse, startWord: segment.startWord, endWord: segment.endWord })),
      existingId: holder.id,
      focus,
    });
  };

  /** A verse's notes, links and tags are read beside the words, not over them. */
  const openAside = (verse: number) => {
    dismiss();
    setAside({ verse });
  };

  /**
   * The tags sheet, for whatever the panel is acting on.
   *
   * A mark's tags belong to the whole mark, so every verse segment of a run is
   * listed; a fresh selection that already covers plain marks writes on those
   * instead of stacking a new mark under them, which is the rule Note and Link
   * follow too.
   */
  const openTags = () => {
    if (!doc) return;
    if (active) {
      setTagsEditor({
        title: rangeLabel(active.map((segment) => ({ verse: segment.verse, startWord: segment.startWord, endWord: segment.endWord }))),
        quote: groupQuote(active),
        tags: allTags(active),
        ids: active.map((segment) => segment.id),
        ranges: [],
        fromPanel: true,
      });
      return;
    }
    if (!selection) return;
    setTagsEditor({
      title: rangeLabel(selection.ranges),
      quote: selection.text,
      tags: allTags(selectionMarks),
      ids: selectionMarks.map((mark) => mark.id),
      ranges: selectionMarks.length ? [] : selection.ranges,
      fromPanel: true,
    });
  };

  /** The tags sheet, for every mark the aside is showing on this verse. */
  const openAsideTags = () => {
    if (!aside || !doc) return;
    const ids = [...new Set(asideMarks.flatMap((mark) => markGroup(docMarks, mark).map((segment) => segment.id)))];
    const quote = asideMarks
      .map((mark) =>
        rangeText(
          doc.verses.find((entry) => entry.number === mark.verse)?.text ?? "",
          mark.startWord,
          mark.endWord
        )
      )
      .join(" ");
    setTagsEditor({
      title:
        doc.kind === "conference"
          ? `“${doc.chapter}” ¶ ${aside.verse}`
          : `${doc.book} ${doc.chapter}:${aside.verse}`,
      quote,
      tags: allTags(asideMarks),
      ids,
      ranges: [],
      fromPanel: false,
    });
  };

  /**
   * Save the sheet's tags on everything it was opened for.
   *
   * The sheet is the whole set for its target: a tag taken out of it leaves the
   * words, and a fresh selection with nothing to write on becomes a mark with no
   * colour — the same invisible mark a note alone would make — but only when
   * there is a tag to carry.
   */
  const saveTags = async (next: string[]) => {
    const editor = tagsEditor;
    if (!editor || !doc) return;
    setTagsEditor(null);
    const tags = [
      ...new Map(next.map((entry) => [tagKey(entry), cleanTag(entry)])).values(),
    ].filter((entry) => entry.length > 0);

    if (editor.ids.length) {
      // Taking the last tag off a mark that was only ever a tag removes the
      // mark: an invisible annotation with nothing in it is not something the
      // reader could see, find, or delete again.
      for (const id of editor.ids) {
        const mark = docMarks.find((entry) => entry.id === id);
        if (!mark) continue;
        const bare = mark.color === "clear" && !noteText(mark.note) && !mark.links?.length;
        if (bare && !tags.length) await removeAnnotations([id]);
        else await updateAnnotation(id, { tags });
      }
    } else if (editor.ranges.length && tags.length) {
      const groupId = editor.ranges.length > 1 ? newId() : undefined;
      await addAnnotations(
        editor.ranges.map((range) => ({
          doc: doc.doc,
          book: doc.book,
          chapter: doc.chapter,
          verse: range.verse,
          startWord: range.startWord,
          endWord: range.endWord,
          color: "clear" as MarkColor,
          style: "fill" as MarkStyle,
          tags,
          groupId,
        }))
      );
    }

    if (editor.fromPanel) dismiss();
    announce(tags.length ? "Tags saved" : "Tags removed");
  };

  /**
   * Take one tag off every mark the aside shows, in every verse of its group.
   *
   * A mark that was only ever the tag goes with it, the way a mark that was only
   * ever a note goes with its note; the ink, the note, and the link stay where
   * they are. That is also why the panel may shut afterwards: the verse no
   * longer has anything to read beside it.
   */
  const removeAsideTag = (tag: string) => {
    const ids = [...new Set(asideMarks.flatMap((mark) => markGroup(docMarks, mark).map((segment) => segment.id)))];
    void (async () => {
      for (const id of ids) {
        const mark = docMarks.find((entry) => entry.id === id);
        if (!mark) continue;
        const tags = mark.tags.filter((entry) => tagKey(entry) !== tagKey(tag));
        const bare = mark.color === "clear" && !noteText(mark.note) && !mark.links?.length;
        if (bare && !tags.length) await removeAnnotations([id]);
        else await updateAnnotation(id, { tags });
      }
    })();
    announce("Tag removed");
  };

  const openEditor = (mode: "note" | "link") => {
    if (active) {
      editGroup(active, mode);
      return;
    }
    if (!doc || !selection) return;
    const exact = selectionMarks.find((mark) => mark.note || mark.links?.length);
    setEditor({
      title: rangeLabel(selection.ranges),
      quote: selection.text,
      note: exact?.note ?? "",
      noteTitle: exact?.title ?? "",
      links: exact?.links ?? [],
      ranges: selection.ranges,
      existingId: exact?.id,
      focus: mode,
    });
    // The selection is kept while the sheet is open, so the words being marked
    // stay visible behind it; the panel comes back when the sheet closes.
  };

  const saveEditor = async (mark: { note: string; links: AnnotationLink[]; title: string }) => {
    if (!doc || !editor) return;
    const note = mark.note && mark.note.trim() ? sanitizeBody(mark.note) : "";
    // A name only means something above words: without a note it is dropped
    // rather than left on the mark as a heading for nothing.
    const noteTitle = note ? mark.title.trim() || undefined : undefined;
    // A link is dated when it joined the mark's chain, which is not the moment
    // the mark was made: one added to an old note is newer than the note. Links
    // the mark already carried keep the date they arrived with, and an imported
    // one with no date of its own is left to fall back to the mark's.
    const held = editor.existingId
      ? (docMarks.find((a) => a.id === editor.existingId)?.links ?? [])
      : selectionMarks.flatMap((a) => a.links ?? []);
    const known = new Set(held.map((link) => link.label));
    const now = new Date().toISOString();
    const links = mark.links.length
      ? mark.links.map((link) =>
          link.addedAt || known.has(link.label) ? link : { ...link, addedAt: now }
        )
      : undefined;

    if (editor.existingId) {
      const existing = docMarks.find((a) => a.id === editor.existingId);
      if (!note && !links && existing?.color === "clear") {
        // A mark that was only ever the note goes away with it — every verse of
        // it, or the empty ones would be left behind.
        const group = existing ? markGroup(docMarks, existing) : [];
        await removeAnnotations(group.map((segment) => segment.id));
      } else {
        await updateAnnotation(editor.existingId, {
          note: note || undefined,
          title: noteTitle,
          links,
        });
      }
      announce(note ? "Note saved" : "Annotation updated");
    } else if (note || links) {
      // Attach to the plain marks already on these words, so the highlight and
      // the note are one annotation rather than two stacked on each other.
      const plain = selectionMarks
        .filter((a) => !a.note && !a.links?.length && a.color !== "clear")
        .sort((a, b) => a.verse - b.verse || a.startWord - b.startWord);
      if (plain.length && plain.length === editor.ranges.length) {
        await updateAnnotation(plain[0].id, {
          note: note || undefined,
          title: noteTitle,
          links,
        });
      } else {
        const groupId = editor.ranges.length > 1 ? newId() : undefined;
        const created = await addAnnotations(
          editor.ranges.map((range, index) => ({
            doc: doc.doc,
            book: doc.book,
            chapter: doc.chapter,
            verse: range.verse,
            startWord: range.startWord,
            endWord: range.endWord,
            color: "clear" as MarkColor,
            style: "fill" as MarkStyle,
            note: index === 0 ? note || undefined : undefined,
            title: index === 0 ? noteTitle : undefined,
            links: index === 0 ? links : undefined,
            groupId,
          }))
        );
        if (!created.length) announce("Nothing to save");
      }
      announce(links && !note ? "Link added" : "Note saved");
    }
    dismiss();
  };

  const removeHere = async () => {
    const ids = active ? active.map((segment) => segment.id) : selectionMarks.map((mark) => mark.id);
    if (!ids.length) return;
    await removeAnnotations(ids);
    dismiss();
    announce("Removed");
  };

  /**
   * Take one link out of a mark's chain, from the panel that reads it.
   *
   * The mark goes with its last link when there is nothing else on it — a mark
   * that was only ever the link would otherwise be left in the file with no
   * words on it. A mark that still says something, or whose place is inked,
   * keeps its place and simply holds one link fewer.
   */
  const removeLink = async (mark: Annotation, link: AnnotationLink) => {
    const remaining = (mark.links ?? []).filter((entry) => entry.label !== link.label);
    const alone = markGroup(docMarks, mark).length <= 1;
    if (!remaining.length && !noteText(mark.note) && mark.color === "clear" && alone) {
      await removeAnnotations([mark.id]);
    } else {
      await updateAnnotation(mark.id, { links: remaining.length ? remaining : undefined });
    }
    announce("Link removed");
  };

  /**
   * Take a mark's note off it, from the panel that reads it.
   *
   * The ink stays: a note written on highlighted words is one thing holding
   * two, and only the half that was deleted goes. A mark that was only ever the
   * note — no colour of its own, no link, every verse of it bare — goes with
   * its words, which is the same rule the sheet follows when it saves an empty
   * note.
   */
  const removeNote = async (mark: Annotation) => {
    const group = markGroup(docMarks, mark);
    const bare = group.every((segment) => segment.color === "clear" && !segment.links?.length);
    if (bare) {
      await removeAnnotations(group.map((segment) => segment.id));
    } else {
      await updateAnnotation(mark.id, { note: undefined, title: undefined });
    }
    announce("Note removed");
  };

  const copyHere = async () => {
    const text = active ? groupQuote(active) : selection?.text ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      announce("Copied");
    } catch {
      announce("Couldn't copy");
    }
    dismiss();
  };

  const shareHere = () => {
    const text = active ? groupQuote(active) : selection?.text ?? "";
    if (!text) return;
    setShare({
      title: active ? rangeLabel(active) : rangeLabel(selection?.ranges ?? []),
      subtitle: doc?.subtitle,
      lines: [{ text }],
      footer: "Gospel Focus",
    });
    dismiss();
  };

  /**
   * Take the marked words away to be learned by heart.
   *
   * A card holds words, not a highlight: the run the mark covers is lifted out
   * of its verses word for word, so a sentence marked inside a long verse is the
   * sentence the reader memorizes — not the whole verse around it. A run that
   * crosses a verse break becomes one part per verse, as a card always does.
   */
  const memorizeHere = () => {
    if (!doc) return;
    const segments = active
      ? active.map((mark) => ({ verse: mark.verse, startWord: mark.startWord, endWord: mark.endWord }))
      : selection?.ranges ?? [];
    if (!segments.length) return;

    const verses = [...segments]
      .sort((a, b) => a.verse - b.verse || a.startWord - b.startWord)
      .map((segment) => ({
        number: segment.verse,
        text: rangeText(
          doc.verses.find((entry) => entry.number === segment.verse)?.text ?? "",
          segment.startWord,
          segment.endWord
        ),
      }))
      .filter((part) => part.text.trim());
    if (!verses.length) return;

    const first = verses[0].number;
    // The card is named for its first verse; the rest of the run belongs to the
    // card, not to its label (see `itemFromPassage`).
    const reference =
      doc.kind === "conference" ? `“${doc.chapter}” ¶ ${first}` : `${doc.book} ${doc.chapter}:${first}`;
    const passage: Passage = {
      kind: doc.kind,
      reference,
      sourceLabel: doc.sourceLabel,
      text: verses.map((part) => part.text).join(" "),
      url: doc.url,
      urlLabel: "Open in Gospel Library",
      expansionTitle: doc.title,
      expansionSubtitle: doc.subtitle,
      verses,
      highlightVerse: first,
      book: doc.book,
      chapter: doc.chapter,
      section: first,
    };

    setMemory(itemFromPassage(passage, undefined, verses.map((part) => part.number)));
    dismiss();
  };

  /**
   * A tap on the words of a mark.
   *
   * One mark opens the marking panel on it, with its colour and style already
   * showing. Several marks lying under the same words open the chooser instead:
   * there is no way to tell which one the reader meant, and opening the newest
   * would hide the others behind a tap that cannot reach them.
   */
  const openAt = (verse: number, word: number) => {
    if (!doc) return;
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    const groups = marksAt(annotations, doc.doc, verse, word);
    if (!groups.length) return;
    if (groups.length === 1) {
      setActiveId(markGroupId(groups[0][0]));
      return;
    }
    setActiveId(null);
    setChoosing(groups);
  };

  const go = (citation: ReaderCitation) => {
    dismiss();
    router.push(readerHref(citation));
  };

  /**
   * The place the reader is standing in: the first verse still below the top of
   * the reading column.
   *
   * That is what "here" means when they reach for a bookmark — the words they
   * are looking at, not the chapter's first verse and not whatever the scroll
   * happened to leave under the app bar. A chapter with no verse past the fold
   * (a very short one) keeps its first verse, so there is always somewhere to
   * put the ribbon.
   */
  const placeAtTop = (current: ReaderDoc): BookmarkPlace => {
    const fold = 128;
    let verse = current.verses[0]?.number ?? 1;
    for (const node of document.querySelectorAll<HTMLElement>("[data-verse]")) {
      if (node.getBoundingClientRect().bottom <= fold) continue;
      verse = Number(node.dataset.verse) || verse;
      break;
    }
    const place = {
      kind: current.kind,
      book: current.book,
      chapter: current.chapter,
      verse,
      conferenceId: current.conferenceId,
    };
    return { ...place, reference: bookmarkReference(place) };
  };

  const panelColor = active && active[0].color !== "clear" ? active[0].color : null;
  const panelStyle = active ? active[0].style : pendingStyle;
  return (
    <AppShell>
      {/* The rail and the words: where the reader is, beside what they are
          reading. On a phone the rail is off the page entirely (see
          components/reader-nav.tsx) and the chapter's name carries the same
          choices in a menu under it. */}
      {/* The reader is its own sheet, in the card's lighter cream, so the rail's
          band and the words behind it are one colour (see `--reader-page`).
          The wrapper spans the page; the column inside keeps the words narrow. */}
      <div className="flex flex-1 flex-col bg-reader-page">
        <div
          data-reader-page
          className="mx-auto flex w-full max-w-[80rem] flex-1 justify-center gap-10 px-5 pb-16 pt-4 sm:px-8 sm:pt-6"
        >
          {doc && <ChapterRail doc={doc} onGo={go} />}
        <main className="min-w-0 w-full max-w-[46rem] flex-1">
          {/* The bar a reader gets instead of a page header: the way back, the
              chapter's name — which opens the way to another chapter — the
              bookmarks and the search. Back leads the row, as it does on every
              page in the app. Nothing up here competes with the words below it. */}
          {/* The chapter's bar is the one piece of chrome a reader needs from
              anywhere in a passage — where they are, a bookmark, a search — so
              it sticks: under the app bar while that is showing, and at the top
              of the screen once it has gone (see "The reader's chrome" in
              globals.css). Its own words scroll beneath it. */}
          <div
            data-reader-bar
            className="relative sticky top-[var(--reader-bar-top)] z-10 -mx-1 flex items-center gap-2 border-b border-border/60 bg-reader-page px-1 py-2"
          >
            {/* The way out leads the bar, on the same side of every screen. */}
            <BackLink fallbackHref="/passage" />
            <div className="min-w-0 flex-1">
              {doc ? (
                <ReaderPlaceButton
                  doc={doc}
                  fromDaily={fromDaily}
                  open={placeOpen}
                  onToggle={() => setPlaceOpen((open) => !open)}
                />
              ) : (
                <div className="h-7 w-40 animate-pulse rounded-full bg-surface-2" aria-hidden="true" />
              )}
            </div>
            {/* The same chapter, one verse a screen: the scroll starts on the
                verse this address opened, so a reader can hand the chapter to
                their thumb without losing their place. */}
            <Link
              href={doc ? scrollHref({ ...docCitation(doc), verse: focus[0] }) : "/scroll"}
              onClick={() => setPlaceOpen(false)}
              aria-label="Read this chapter as a scroll"
              title="Scroll"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
            >
              <Glyph name="scroll" className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => {
                if (!doc) return;
                const place = placeAtTop(doc);
                setBookmarkPlace(place);
                setBookmarksOpen(true);
              }}
              aria-label="Bookmarks"
              title="Bookmarks"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
            >
              <BookmarkIcon className="h-4 w-4" />
            </button>
            <Link
              href="/search"
              onClick={() => setPlaceOpen(false)}
              aria-label="Search the library"
              title="Search"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-accent-strong"
            >
              <Glyph name="search" className="h-4 w-4" />
            </Link>
            {placeOpen && doc && (
              <ReaderPlaceMenu doc={doc} onClose={() => setPlaceOpen(false)} onGo={go} />
            )}
          </div>

        {loading && !doc ? (
          <div className="mt-10 animate-pulse space-y-3" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <div key={index} className="h-4 w-full rounded-full bg-surface-2" />
            ))}
          </div>
        ) : error ? (
          <div className="mt-8 rounded-3xl border border-border bg-surface p-6">
            <p className="font-semibold text-foreground">This chapter couldn&apos;t be opened.</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <Link
              href="/passage"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast"
            >
              Draw a passage instead
            </Link>
          </div>
        ) : doc ? (
          <>
            {/* `touch-manipulation` leaves panning and pinching to the page and
                takes the browser's own double-tap zoom away: a double tap in the
                words means the screen here, and the page must not answer the
                same gesture by leaning in. */}
            {/* On a phone the words take the page's own margins rather than the
                padding the rest of the app keeps: on a narrow screen the
                measure is what makes the prose readable, and the bar above
                keeps its margins so back and search are not against the edge. */}
            <article
              ref={article}
              data-reader
              onPointerUp={onWordsPointerUp}
              className="relative -mx-3 mt-6 touch-manipulation font-serif text-[1.12rem] leading-[1.75] text-foreground/90 sm:mx-0 sm:mt-8 sm:text-[1.18rem] sm:leading-[1.8]"
            >
              {doc.verses.map((verse) => (
                <VerseRow
                  key={verse.number}
                  doc={doc}
                  verse={verse}
                  annotations={docMarks}
                  backlinked={docBacklinks.has(verse.number)}
                  preview={preview}
                  selected={selection?.ranges ?? null}
                  focused={focus.includes(verse.number)}
                  onVerse={setVerseSheet}
                  onAside={openAside}
                  onWords={openAt}
                />
              ))}

              {/* The two ends a thumb can reach: those of the mark the panel is
                  open on, or of the words just selected, which have no mark
                  yet. */}
              {active ? (
                <MarkHandles
                  host={article}
                  from={{ verse: active[0].verse, word: active[0].startWord }}
                  to={{ verse: active[active.length - 1].verse, word: active[active.length - 1].endWord }}
                  wordCount={wordsInVerse}
                  onPreview={(range) => {
                    adjusting.current = true;
                    setDragRange(range);
                  }}
                  onCommit={(range) => void adjustActive(range)}
                />
              ) : selection ? (
                <MarkHandles
                  host={article}
                  from={{ verse: selection.ranges[0].verse, word: selection.ranges[0].startWord }}
                  to={{
                    verse: selection.ranges[selection.ranges.length - 1].verse,
                    word: selection.ranges[selection.ranges.length - 1].endWord,
                  }}
                  subject="selection"
                  wordCount={wordsInVerse}
                  onPreview={previewSelection}
                  onCommit={commitSelection}
                />
              ) : null}
            </article>

            {/* The neighbouring chapters, as words rather than buttons: at the
                foot of a chapter the next thing a reader wants is the next
                chapter, not another piece of furniture. */}
            <nav className="mt-10 flex items-center justify-between gap-4 border-t border-border/60 pt-5 text-sm">
              {doc.prev ? (
                <button
                  type="button"
                  onClick={() => doc.prev && go(neighbourCitation(doc, doc.prev))}
                  className="inline-flex min-w-0 items-center gap-1.5 text-muted transition-colors hover:text-accent-strong"
                >
                  <span aria-hidden="true">←</span>
                  <span className="truncate">{doc.prev.label}</span>
                </button>
              ) : (
                <span />
              )}
              {doc.next && (
                <button
                  type="button"
                  onClick={() => doc.next && go(neighbourCitation(doc, doc.next))}
                  className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-muted transition-colors hover:text-accent-strong"
                >
                  <span className="truncate">{doc.next.label}</span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </nav>
          </>
        ) : null}
          </main>
        </div>
      </div>

      {/* One tool for both moments: the words just selected, or the mark just
          tapped. It stays out of the way while the note sheet or the chooser is
          over it. */}
      <AnnotationToolbar
        open={Boolean((selection || active) && !editor && !choosing && !tagsEditor)}
        color={panelColor}
        style={panelStyle}
        recent={recents}
        canRemove={Boolean(active || selectionMarks.length)}
        onColor={applyColour}
        onChoice={applyChoice}
        onStyle={applyStyle}
        onNote={() => openEditor("note")}
        onLink={() => openEditor("link")}
        onTags={openTags}
        onCopy={() => void copyHere()}
        onShare={shareHere}
        onMemorize={memorizeHere}
        onRemove={() => void removeHere()}
        onClose={dismiss}
      />

      {aside && doc && (
        <VerseAside
          doc={doc}
          verse={aside.verse}
          marks={asideMarks}
          annotations={annotations}
          backlinks={docBacklinks.get(aside.verse) ?? []}
          onClose={() => setAside(null)}
          onEdit={(mark, mode) => {
            setAside(null);
            editGroup(markGroup(docMarks, mark), mode);
          }}
          onRemoveLink={(mark, link) => void removeLink(mark, link)}
          onRemoveNote={(mark) => void removeNote(mark)}
          onAddTags={openAsideTags}
          onRemoveTag={removeAsideTag}
        />
      )}

      {tagsEditor && (
        <TagsDialog
          title={tagsEditor.title}
          quote={tagsEditor.quote}
          initialTags={tagsEditor.tags}
          suggestions={allTags(annotations)}
          onSave={(tags) => void saveTags(tags)}
          onClose={() => setTagsEditor(null)}
        />
      )}

      {editor && (
        <AnnotationDialog
          open
          title={editor.title}
          quote={editor.quote}
          initialNote={editor.note}
          initialTitle={editor.noteTitle}
          initialLinks={editor.links}
          focus={editor.focus}
          onSave={(mark) => void saveEditor(mark)}
          onClose={() => setEditor(null)}
          onDelete={
            editor.existingId
              ? () => {
                  const existing = docMarks.find((a) => a.id === editor.existingId);
                  const group = existing ? markGroup(docMarks, existing) : [];
                  void removeAnnotations(group.map((segment) => segment.id));
                  setEditor(null);
                  dismiss();
                }
              : undefined
          }
        />
      )}

      {/* Nothing is drawn for what just happened: the mark, the note or the
          favorite is its own confirmation, and a pill over the words only says
          what the page already shows. The words are still spoken, so a reader
          who cannot see the change is told about it. */}
      {notice && (
        <p role="status" className="sr-only">
          {notice}
        </p>
      )}

      {bookmarksOpen && bookmarkPlace && (
        <BookmarksDialog
          place={bookmarkPlace}
          onClose={() => setBookmarksOpen(false)}
          onNotice={announce}
        />
      )}

      {choosing && doc && (
        <MarkChooser
          groups={choosing}
          verseText={(verse) => doc.verses.find((entry) => entry.number === verse)?.text ?? ""}
          onPick={(group) => {
            setChoosing(null);
            setActiveId(markGroupId(group[0]));
          }}
          onClose={() => setChoosing(null)}
        />
      )}

      {verseSheet && doc && (
        <VerseSheet
          doc={doc}
          verse={verseSheet}
          saved={favorites.some((f) => f.id === favoriteId(versePassage(doc, verseSheet)))}
          onClose={() => setVerseSheet(null)}
          onCopy={() => {
            void navigator.clipboard.writeText(versePassage(doc, verseSheet).text);
            setVerseSheet(null);
            announce("Copied");
          }}
          onFavorite={() => {
            toggleFavorite(versePassage(doc, verseSheet));
            setVerseSheet(null);
          }}
          onShare={() => {
            const passage = versePassage(doc, verseSheet);
            setShare({
              title: passage.reference,
              subtitle: passage.sourceLabel,
              lines: [{ label: String(passage.section), text: passage.text }],
              footer: "Gospel Focus",
            });
            setVerseSheet(null);
          }}
          onMemorize={() => {
            setMemory(itemFromPassage(versePassage(doc, verseSheet), undefined, [verseSheet]));
            setVerseSheet(null);
          }}
          onLibrary={() => {
            void openExternal(versePassage(doc, verseSheet).url);
            setVerseSheet(null);
          }}
        />
      )}

      <ShareCardDialog
        open={Boolean(share)}
        card={share ?? { title: "", lines: [], footer: "Gospel Focus" }}
        onClose={() => setShare(null)}
      />

      {memory && (
        <SaveToDeckDialog
          open
          // The card already built: the deck picker files it, and where there
          // is no deck yet it offers to make the first one.
          draft={memory}
          onClose={() => setMemory(null)}
        />
      )}

      {/* A finger across the words turns to the chapter beside them, the way
          the same gesture turns between the sections. It draws the chapter it
          is turning to off the side of the screen and hands over to `go`, so a
          swipe and a press at the foot of the chapter open a chapter the same
          way. */}
      <ReaderSwipe doc={doc} onGo={go} />
    </AppShell>
  );
}

function VerseSheet({
  doc,
  verse,
  saved,
  onClose,
  onCopy,
  onFavorite,
  onShare,
  onMemorize,
  onLibrary,
}: {
  doc: ReaderDoc;
  verse: number;
  saved: boolean;
  onClose: () => void;
  onCopy: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onMemorize: () => void;
  onLibrary: () => void;
}) {
  const passage = versePassage(doc, verse);
  return (
    <Sheet title={`${doc.book} ${doc.chapter}:${verse}`} onClose={onClose}>
      <p className="border-l-2 border-accent/40 pl-3 font-serif text-sm leading-relaxed text-foreground/80">{passage.text}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Action label="Copy" icon="copy" onClick={onCopy} />
        <Action label={saved ? "Unfavorite" : "Favorite"} icon="heart" onClick={onFavorite} />
        <Action label="Share image" icon="sparkles" onClick={onShare} />
        <Action label="Memorize" icon="cards" onClick={onMemorize} />
        <Action label="Gospel Library" icon="book" onClick={onLibrary} />
      </div>
    </Sheet>
  );
}

function Action({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: "copy" | "heart" | "sparkles" | "cards" | "book";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
    >
      <Glyph name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}
