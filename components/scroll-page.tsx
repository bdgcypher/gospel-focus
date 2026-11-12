"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { AppShell } from "./app-shell";
import { AnnotationDialog } from "./annotation-dialog";
import { BackLink } from "./back-link";
import { BookmarkIcon } from "./bookmark-icon";
import { BookmarksDialog } from "./bookmarks-dialog";
import { Glyph } from "./glyph";
import { ReaderPlaceButton, ReaderPlaceMenu } from "./reader-nav";
import { SaveToDeckDialog } from "./save-to-deck-dialog";
import { ShareCardDialog } from "./share-card-dialog";
import { ShareIcon } from "./share-icon";
import { TagsDialog } from "./tags-dialog";
import { VerseAside } from "./verse-aside";
import {
  addAnnotations,
  allTags,
  annotationsFor,
  backlinksForDoc,
  cleanTag,
  markGroup,
  noteText,
  rangeText,
  removeAnnotations,
  tagKey,
  updateAnnotation,
  useAnnotations,
  wordsOf,
  type Annotation,
  type AnnotationLink,
  type Backlink,
} from "@/lib/annotations";
import { bookmarkReference, type BookmarkPlace } from "@/lib/bookmarks";
import { dayKey } from "@/lib/daily";
import { favoriteId, toggleFavorite, useFavorites } from "@/lib/favorites";
import { tapControl, tapPageTurn } from "@/lib/haptics";
import { sanitizeBody } from "@/lib/journal";
import { itemFromPassage, type MemoryItem } from "@/lib/memorize";
import { loadManifest, pickDailyPassage } from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import {
  scrollHref,
  neighbourCitation,
  openReaderDoc,
  parseVerseList,
  previewReaderDoc,
  readLastPlace,
  readerHref,
  versePassage,
  writeLastPlace,
  type ReaderCitation,
  type ReaderDoc,
  type ReaderVerse,
} from "@/lib/reader";
import type { ShareCard } from "@/lib/share-image";

/** How long a status line stays up after it is written. */
const NOTICE_MS = 2200;

/**
 * How quick, and how still, a second tap has to be to be one gesture with the
 * first — the same window and slack the reader uses (components/chapter-reader.tsx).
 */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 28;

/** How far a pointer may travel and still count as a tap rather than a swipe. */
const TAP_SLOP_PX = 12;

/**
 * How far a swipe has to travel, once the scroll is already at an end, before
 * it reaches for the chapter beside it. Short enough to feel like the same
 * gesture as a page turn, long enough that a thumb resting on the last verse
 * does not skip on.
 */
const CHAPTER_FLIP_PX = 64;

/**
 * How long the stage must be still on a neighbour's page before its chapter is
 * opened. Long enough that a swipe which only brushes the end and springs back
 * does not turn it, short enough that the page arriving under the thumb is
 * already the chapter by the time the next swipe is made.
 */
const LANDING_QUIET_MS = 160;

/**
 * `useLayoutEffect` where there is a DOM to lay out, `useEffect` where there is
 * not. The verse a chapter opens on is placed before the first paint, so a
 * chapter that opens at its foot never shows its first verse on the way there.
 */
const usePlaced = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How long after a turn the other gesture path is ignored, so a finger's swipe
 * that arrives as both a cancelled pointer and a finished touch turns the
 * chapter once.
 */
const TURN_GUARD_MS = 600;

/** The air kept above the first tick and below the last (the `py-4` on the rail). */
const RAIL_PAD_PX = 16;

/** One verse, as the words of a single screen. */
function verseType(text: string): string {
  // A verse is whatever length the scripture made it, so the type gives way
  // rather than the page: a long psalm portion steps down instead of running
  // off a screen the swipe is meant to turn in one movement. The steps are set
  // a shade below a page's own prose: a scroll screen is read in glances between
  // swipes, and a smaller measure keeps a whole verse in view.
  if (text.length > 700) return "text-[0.88rem] leading-[1.6] sm:text-[0.96rem]";
  if (text.length > 420) return "text-[0.98rem] leading-[1.65] sm:text-[1.08rem]";
  if (text.length > 240) return "text-[1.08rem] leading-[1.55] sm:text-[1.26rem]";
  return "text-[1.28rem] leading-[1.5] sm:text-[1.6rem] sm:leading-[1.45]";
}

/** A verse named the way the bar and the rail name it. */
function referenceIn(doc: ReaderDoc, number: number): string {
  return doc.kind === "conference" ? `“${doc.chapter}” ¶ ${number}` : `${doc.book} ${doc.chapter}:${number}`;
}

/**
 * How many pages sit above the chapter: one when the chapter before it is drawn
 * at the top of the stage, none when this is the first of the volume.
 */
function leadingPage(node: HTMLElement): number {
  return node.querySelector('[data-scroll-edge="prev"]') ? 1 : 0;
}

/** Which page of the stage is under the eye, counted from the top. */
function pageAt(node: HTMLElement): number {
  return Math.round(node.scrollTop / (node.clientHeight || 1));
}

/** The sheet that writes tags, and the verse marks it will write them on. */
interface TagsEditor {
  /** The verse the tags belong to; the sheet makes its mark when it has none. */
  verse: number;
  /** The verse's reference, for the sheet's heading. */
  title: string;
  /** The words the tags belong to, quoted under it. */
  quote: string;
  /** The tags the sheet opens on. */
  tags: string[];
  /** Every annotation the save applies to; empty when the verse has none yet. */
  ids: string[];
}

/**
 * A chapter as a scroll: one verse a screen, swiped through the way a reel is.
 *
 * The reader gives a chapter its whole width and lets the eye run down it; this
 * gives each verse the middle of a screen and lets the thumb turn them. It is
 * the same place, addressed the same way — `/scroll?book=…&chapter=…&verse=…`,
 * with a bare `/scroll` continuing where the reading left off — so opening the
 * scroll from a chapter's bar starts at the verse the reader was on, and the
 * bar's own tab returns to the verse the scroll was last left on.
 *
 * The bar at the top is the reader's own bar, control for control: the way
 * back, the chapter's name (which opens the library on a phone), bookmarks,
 * and search. Only the chapter itself has changed shape. The library rail the
 * wide reader carries down the side is left out on purpose: the left of a scroll
 * screen is where the place-in-the-chapter mark lives.
 *
 * Each screen keeps the app's actions for a verse within reach of the thumb —
 * favorite, notes and links, share — and they act on the verse being looked at,
 * not on a selection. The notes mark is always there and wears a dot when the
 * verse carries something, so what a verse says about itself is a press away;
 * the reference under the words opens the same verse in the reader. The whole
 * verse is the unit here, so a note or a link made from the scroll is written on
 * the verse's full run of words and reads back in the reader like any other
 * mark.
 *
 * A chapter has two ends, and a reading does not: the verse after the last one
 * is the first verse of the chapter beside it, and the verse before the first
 * is the last verse of the chapter before. Those two are drawn at the foot and
 * the head of the stage as pages of their own, so the swipe that runs out of
 * chapter carries on into the next exactly as it moves between verses — the
 * finger turns a page it can see, the browser's own snap carries it in, and the
 * chapter underneath changes only once the stage has come to rest on it.
 * Opening the neighbour there is invisible because the page it opens on is the
 * page that was already on screen.
 */
export function ScrollPage() {
  const params = useSearchParams();
  const router = useRouter();
  const prefs = usePreferences();
  const annotations = useAnnotations();
  const favorites = useFavorites();

  const [doc, setDoc] = useState<ReaderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The verse the address asked to start on, before any swipe. */
  const [startVerse, setStartVerse] = useState(1);
  /** Which verse of the chapter is on screen, counted from zero. */
  const [index, setIndex] = useState(0);
  /**
   * The chapters either side of this one, opened ahead of the swipe: the page
   * at the foot of the stage is the next chapter's first verse, and the page at
   * its head is the last verse of the chapter before. Null at a volume's ends,
   * where there is no chapter on that side and so no page to turn to.
   */
  const [edges, setEdges] = useState<{ prev: ReaderDoc | null; next: ReaderDoc | null }>({
    prev: null,
    next: null,
  });

  const [placeOpen, setPlaceOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  /** Which verse's sheet is up, and which half of it (note or link) it opened on. */
  const [editor, setEditor] = useState<{ verse: number; mode: "note" | "link" } | null>(null);
  /** The verse whose notes, links, and tags are being read beside it. */
  const [aside, setAside] = useState<number | null>(null);
  /** The sheet that writes tags, and the verse marks it writes them on. */
  const [tagsEditor, setTagsEditor] = useState<TagsEditor | null>(null);
  /** The verse's card, once the kebab's Memorize is asked for. */
  const [memory, setMemory] = useState<MemoryItem | null>(null);
  /** Whether the verse's other actions are showing under the kebab. */
  const [actionsOpen, setActionsOpen] = useState(false);
  /**
   * Whether a thumb is on the rail. The rail lies flat along the edge while it
   * is only a map, and thickens under the finger while it is a handle, so the
   * reader can see which state it is in; the blur on the page goes with it.
   */
  const [holdingRail, setHoldingRail] = useState(false);
  /**
   * Bumped each time a double tap keeps a verse, so the heart in the middle of
   * the screen plays again. The number is the overlay's key: a second burst is
   * a new element, and the animation starts from the top instead of finishing
   * the first one's.
   */
  const [burst, setBurst] = useState(0);
  const [share, setShare] = useState<ShareCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  /** The rail down the left, which is also a handle on the chapter. */
  const rail = useRef<HTMLDivElement>(null);
  /**
   * The verse under the eye, mirrored for the scroll listener and the rail: both
   * are event handlers, where the state they just set is still the old value.
   */
  const indexRef = useRef(0);
  /** Whether a thumb is on the rail, so the scroll it causes ticks only once. */
  const scrubbing = useRef(false);
  /** The action column, so a press elsewhere can put its menu away. */
  const actions = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const noticeTimer = useRef<number | null>(null);
  /** The previous tap, for the pair that means a favorite. */
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  /** Where the pointer went down, to tell a tap from a swipe. */
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  /**
   * Where the finger went down, for the chapter turn. Kept apart from the
   * pointer pair because a phone's scroll cancels the pointer stream before the
   * finger lifts (see `turnAtEdge`).
   */
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  /** When the chapter last turned, so the two paths cannot both turn it. */
  const lastTurnAt = useRef(0);
  /** Set while a turn is on its way, so one landing is not taken twice. */
  const landing = useRef(false);

  const announce = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    []
  );

  /**
   * The kebab's menu shuts on a press anywhere else, on Escape, and when the
   * verse under it changes — an action named for one verse must never be left
   * standing over the next one.
   */
  useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (event: PointerEvent) => {
      if (actions.current && !actions.current.contains(event.target as Node)) setActionsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActionsOpen(false);
      moreButton.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [actionsOpen]);

  /**
   * The chapter beside this one — the turn a swipe at an end completes.
   *
   * The neighbour opens where the swipe was heading: the next chapter at its
   * first verse, the one before at its last. Naming the foot of the chapter in
   * the address rather than counting it here means this page never has to load
   * the chapter it is turning to. Which page was under the thumb is what
   * `landing` records, so the turn is taken once however many scroll events
   * the movement made.
   */
  const turnChapter = useCallback(
    (step: 1 | -1) => {
      if (!doc || landing.current) return;
      const neighbour = step === 1 ? doc.next : doc.prev;
      if (!neighbour) return;
      const now = performance.now();
      if (now - lastTurnAt.current < TURN_GUARD_MS) return;
      lastTurnAt.current = now;
      landing.current = true;
      void tapPageTurn();
      router.push(
        scrollHref(
          step === 1
            ? { ...neighbourCitation(doc, neighbour), verse: 1 }
            : { ...neighbourCitation(doc, neighbour), last: true }
        )
      );
    },
    [doc, router]
  );

  /** Resolve whatever the address asks for into a document to scroll. */
  useEffect(() => {
    let live = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const book = params.get("book");
        const chapter = params.get("chapter");
        let citation: ReaderCitation | null = null;
        let verses: number[] = [];
        /** The address asked for the foot of the chapter rather than a verse. */
        let wantsLast = false;

        if (book && chapter) {
          citation = {
            kind: params.get("kind") === "conference" || book === "General Conference" ? "conference" : "scripture",
            book,
            chapter,
            conferenceId: params.get("session") ?? undefined,
          };
          const verseParam = params.get("verse") ?? params.get("verses");
          wantsLast = verseParam === "last";
          verses = wantsLast ? [] : parseVerseList(verseParam);
        } else {
          const last = readLastPlace();
          if (last) {
            citation = {
              kind: last.kind,
              book: last.book,
              chapter: last.chapter,
              conferenceId: last.conferenceId,
            };
            verses = last.verse ? [last.verse] : [];
          } else {
            const manifest = await loadManifest();
            const passage = await pickDailyPassage(manifest, prefs.filters, dayKey());
            citation = {
              kind: passage.kind,
              book: passage.book ?? "General Conference",
              chapter: passage.chapter ?? "",
            };
            verses = passage.highlightVerse ? [passage.highlightVerse] : [];
          }
        }

        const opened = await openReaderDoc(citation);
        if (!live) return;
        if (!opened) {
          setError("That chapter isn't in this build of the library.");
          return;
        }

        const start = wantsLast
          ? opened.verses[opened.verses.length - 1]?.number ?? 1
          : verses.find((number) => opened.verses.some((verse) => verse.number === number)) ??
            opened.verses[0]?.number ??
            1;
        const startAt = Math.max(0, opened.verses.findIndex((verse) => verse.number === start));
        // The chapter's two ends are opened before the stage is drawn, because
        // their pages are part of its height: the verse the address names has
        // to be placed among them, not a frame before they arrive. Both reads
        // come from the volume already in hand, so this costs no more than the
        // chapter itself did — and a neighbour that will not open is left out
        // rather than costing the reader the chapter they asked for.
        const [prev, next] = await Promise.all([
          opened.prev
            ? previewReaderDoc(neighbourCitation(opened, opened.prev)).catch(() => null)
            : null,
          opened.next
            ? previewReaderDoc(neighbourCitation(opened, opened.next)).catch(() => null)
            : null,
        ]);
        if (!live) return;
        setDoc(opened);
        setEdges({ prev, next });
        setStartVerse(start);
        // The mark is put on the right verse before the stage scrolls to it, so
        // a chapter opened halfway through never paints its first verse first.
        indexRef.current = startAt;
        setIndex(startAt);
      } catch (cause) {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : "The chapter couldn't be opened.");
      } finally {
        if (live) {
          setLoading(false);
          // A turn is complete once its chapter is on the page: another may be
          // taken from here, and the guard that kept the finger's two gesture
          // paths from turning twice is cleared with it.
          landing.current = false;
          lastTurnAt.current = 0;
        }
      }
    })();

    return () => {
      live = false;
    };
  }, [params, prefs.filters]);

  /**
   * Start on the verse the address named, once the stage has a height.
   *
   * The pages of the neighbouring chapters count towards where a verse sits, so
   * the place is read from the stage rather than counted from the top of the
   * chapter — and it is put there before the first paint, so a chapter opened
   * at its foot is never seen from its first verse on the way.
   */
  usePlaced(() => {
    if (!doc) return;
    const node = stage.current;
    if (!node) return;
    const at = Math.max(0, doc.verses.findIndex((verse) => verse.number === startVerse));
    node.scrollTop = (at + leadingPage(node)) * node.clientHeight;
    indexRef.current = at;
    setIndex(at);
  }, [doc, startVerse, edges]);

  /**
   * Keep the place the reading has reached, as the pages turn.
   *
   * The record carries the verse under the eye rather than only the chapter the
   * visit opened on, so a bare `/scroll` — the bar's own tab — comes back to
   * where the reading stopped. The reader keeps the same record, so it too
   * opens on the verse the scroll was last left on.
   */
  useEffect(() => {
    if (!doc) return;
    const here = doc.verses[index];
    if (!here) return;
    writeLastPlace({
      kind: doc.kind,
      book: doc.book,
      chapter: doc.chapter,
      conferenceId: doc.conferenceId,
      verse: here.number,
    });
  }, [doc, index]);

  /**
   * Keep the place-in-the-chapter mark on the verse under the reader's eye, and
   * open the chapter whose page the stage has come to rest on.
   *
   * The stage's pages are all one screen tall in one column: the chapter before
   * (when there is one), the chapter's verses, then the chapter after. So the
   * page under the eye is `scrollTop / height`, and a page outside the verse
   * range is a neighbour waiting to be opened.
   */
  useEffect(() => {
    const node = stage.current;
    if (!node || !doc) return;
    let frame = 0;
    let timer = 0;
    const count = doc.verses.length;
    const settle = () => {
      frame = 0;
      const at = Math.min(count - 1, Math.max(0, pageAt(node) - leadingPage(node)));
      if (at === indexRef.current) return;
      indexRef.current = at;
      setIndex(at);
      // One soft tick as the verse under the eye changes — the same pulse a
      // page turn makes, because a swipe here is a page turn. A rail drag is
      // already ticking for every row it crosses, so the scroll it causes is
      // not counted twice.
      if (!scrubbing.current) void tapPageTurn();
    };
    /**
     * The turn itself, taken only once the stage is still: a swipe that stops
     * short and springs back must not turn the chapter, and neither must one
     * made with the finger still down.
     */
    const land = () => {
      timer = 0;
      if (pressStart.current || touchStart.current) return;
      const at = pageAt(node);
      const lead = leadingPage(node);
      if (at < lead) turnChapter(-1);
      else if (at >= lead + count) turnChapter(1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(settle);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(land, LANDING_QUIET_MS);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, [doc, edges, turnChapter]);

  const total = doc?.verses.length ?? 0;
  const current = doc?.verses[index] ?? doc?.verses[0] ?? null;

  const referenceOf = useCallback(
    (number: number) => (doc ? referenceIn(doc, number) : ""),
    [doc]
  );

  const passage = useMemo(
    () => (doc && current ? versePassage(doc, current.number) : null),
    [doc, current]
  );
  const saved = passage ? favorites.some((favorite) => favorite.id === favoriteId(passage)) : false;
  /** Whether the verse under the eye already carries a note, for the menu's label. */
  const noteHere =
    doc && current
      ? annotationsFor(annotations, doc.doc, current.number).some((mark) => noteText(mark.note))
      : false;

  /** This chapter's marks, for the panel the verse's notes mark opens. */
  const docMarks = useMemo(
    () => (doc ? annotationsFor(annotations, doc.doc) : []),
    [annotations, doc]
  );

  /**
   * The ways back into this chapter, by verse: every mark elsewhere in the
   * library whose link names a verse here, so the panel reads a link from both
   * ends exactly as the reader's does.
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

  /** What the open panel lists: the verse's marks that carry a note, a link, or a tag. */
  const asideMarks = useMemo(() => {
    if (aside === null) return [];
    return docMarks
      .filter((mark) => mark.verse === aside)
      .filter(
        (mark) => noteText(mark.note).length > 0 || Boolean(mark.links?.length) || mark.tags.length > 0
      )
      .sort((a, b) => a.startWord - b.startWord || a.createdAt.localeCompare(b.createdAt));
  }, [aside, docMarks]);

  /**
   * Whether the verse under the eye has something to read beside it. A way back
   * counts too: the mark is in another chapter, but its link names this verse.
   */
  const carried = Boolean(
    doc &&
      current &&
      (docBacklinks.get(current.number)?.length ||
        docMarks.some(
          (mark) =>
            mark.verse === current.number &&
            (noteText(mark.note).length > 0 || Boolean(mark.links?.length) || mark.tags.length > 0)
        ))
  );

  /** The mark the open sheet is writing on, looked up by the verse it names. */
  const editorMarks = editor && doc ? annotationsFor(annotations, doc.doc, editor.verse) : [];
  const editorMark = editorMarks.find((mark) => noteText(mark.note) || mark.links?.length) ?? null;

  const placeNow = useMemo<BookmarkPlace | null>(() => {
    if (!doc || !current) return null;
    const place = {
      kind: doc.kind,
      book: doc.book,
      chapter: doc.chapter,
      verse: current.number,
      conferenceId: doc.conferenceId,
    };
    return { ...place, reference: bookmarkReference(place) };
  }, [doc, current]);

  const go = (citation: ReaderCitation) => {
    setPlaceOpen(false);
    router.push(scrollHref(citation));
  };

  const favorite = () => {
    if (!passage) return;
    announce(toggleFavorite(passage) ? "Added to favorites" : "Removed from favorites");
  };

  /**
   * Put the stage on a verse at once, the way a handle moves a thing rather
   * than a scroll that catches up with it.
   *
   * Used by the rail, which is a direct handle: the finger is on a row, and the
   * verse under it should already be the one on screen. The tick is rung here
   * rather than by the scroll it causes, so a drag ticks once per row crossed
   * and the settle that follows is silent (see `scrubbing`).
   */
  const showAt = useCallback((at: number, haptic = false) => {
    const node = stage.current;
    if (node) node.scrollTop = (at + leadingPage(node)) * node.clientHeight;
    if (at === indexRef.current) return;
    indexRef.current = at;
    setIndex(at);
    if (haptic) void tapPageTurn();
  }, []);

  /** Which verse the rail's row under this y names, or null before the rail is measured. */
  const verseAtRail = (clientY: number): number | null => {
    const node = rail.current;
    if (!node || !doc) return null;
    const box = node.getBoundingClientRect();
    const count = doc.verses.length;
    const usable = Math.max(1, box.height - RAIL_PAD_PX * 2);
    const at = Math.floor(((clientY - box.top - RAIL_PAD_PX) / usable) * count);
    return Math.min(count - 1, Math.max(0, at));
  };

  const onRailPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const at = verseAtRail(event.clientY);
    if (at === null) return;
    scrubbing.current = true;
    setHoldingRail(true);
    // The finger often leaves a 44px rail as it travels the chapter; the capture
    // keeps the drag on the rail rather than handing it back to the page.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has no capture to take; the drag still works.
    }
    event.preventDefault();
    showAt(at, true);
  };

  const onRailPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    const at = verseAtRail(event.clientY);
    if (at !== null) showAt(at, true);
  };

  const onRailPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    setHoldingRail(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Nothing was captured; nothing to release.
    }
  };

  /**
   * A swipe that runs out of chapter reaches for the page of the chapter beside
   * it: up from the last verse, down from the first. Sideways drags are left to
   * the page's own gestures, so the reach has to be more vertical than not.
   *
   * The reach is the same movement a verse-to-verse swipe makes — the stage is
   * sent to the neighbour's page, which is one screen tall like every other, and
   * the browser's own snap carries it in. The chapter is opened when the stage
   * comes to rest on that page (see the scroll listener), so this gesture and a
   * finger's own scroll meet at exactly the same place.
   *
   * Shared by the pointer path (a mouse, and the browser tests) and the touch
   * path (a finger): the browser takes a vertical drag for a scroll and fires
   * `pointercancel` as soon as the pan starts, so a finger never reaches
   * `pointerup`. On a phone this is only the finishing nudge; the pan itself has
   * already scrolled, and both end on the same page.
   */
  const turnAtEdge = (dx: number, dy: number) => {
    const node = stage.current;
    const count = doc?.verses.length ?? 0;
    if (
      !node ||
      !count ||
      Math.abs(dy) <= CHAPTER_FLIP_PX ||
      Math.abs(dy) <= Math.abs(dx) ||
      !((dy < 0 && indexRef.current === count - 1) || (dy > 0 && indexRef.current === 0))
    ) {
      return;
    }

    const forward = dy < 0;
    const lead = leadingPage(node);
    const drawn = forward
      ? Boolean(node.querySelector('[data-scroll-edge="next"]'))
      : lead === 1;
    // A neighbour that is not drawn — one that failed to open, or a volume's
    // end — still turns if the chapter says there is one there; it simply goes
    // without the page under the thumb.
    if (!drawn) {
      turnChapter(forward ? 1 : -1);
      return;
    }
    node.scrollTo({
      top: (forward ? lead + count : 0) * node.clientHeight,
      behavior: prefs.reduceMotion ? "auto" : "smooth",
    });
  };

  /**
   * A double tap anywhere on the verse favorites it — the gesture a scroll screen
   * is read with, so the heart is not the only way to do it.
   *
   * The pair is counted from two pointerups rather than taken from `dblclick`,
   * because a phone's WebView only turns a double tap into a mouse event when
   * it feels like it. A press that travelled — a swipe through the chapter, or
   * a scroll of a verse longer than a screen — is not a tap at all, and a press
   * that lands on one of the page's own controls is not this gesture either.
   *
   * It only ever adds. The heart is the way to take a favorite back, so a
   * gesture made to keep a verse cannot lose one — and a second double tap on
   * a verse already kept says so rather than quietly undoing the first.
   */
  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pressStart.current = { x: event.clientX, y: event.clientY };
    // A hand on the verse is the start of a swipe, and the menu behind it names
    // the verse being looked at — so it goes before the verse can turn under it.
    setActionsOpen(false);
  };

  /**
   * The browser takes a pan for a scroll and cancels the pointer part way
   * through it. The release never comes, so the press is put down here: a press
   * left standing would tell the landing page a finger was still on the screen.
   */
  const onStagePointerCancel = () => {
    pressStart.current = null;
  };

  const onStageTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    // A finger on the page's own controls is theirs, and two fingers are a
    // pinch or a scroll the reader did not mean as a turn.
    if (!touch || event.touches.length > 1) {
      touchStart.current = null;
      return;
    }
    if (event.target instanceof Element && event.target.closest("button, a")) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onStageTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    turnAtEdge(touch.clientX - start.x, touch.clientY - start.y);
  };

  const onStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pressStart.current;
    pressStart.current = null;
    if (!start) {
      lastTap.current = null;
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > TAP_SLOP_PX) {
      turnAtEdge(dx, dy);
      lastTap.current = null;
      return;
    }
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
    // A page at the chapter's end belongs to the chapter beside it: while the
    // stage rests on one, a double tap is left alone rather than keeping the
    // verse of this chapter that the page has temporarily displaced.
    const node = stage.current;
    if (node && pageAt(node) !== indexRef.current + leadingPage(node)) return;

    window.getSelection()?.removeAllRanges();
    if (passage) {
      if (!saved) {
        toggleFavorite(passage);
        if (!prefs.reduceMotion) setBurst((count) => count + 1);
        announce("Added to favorites");
      } else {
        announce("Already in favorites");
      }
    }
    void tapControl();
  };

  /**
   * Save the sheet's words on the verse as a whole.
   *
   * A mark made from the scroll covers every word of the verse: the scroll shows
   * one verse and no selection, so the verse is what the reader means. Where
   * the verse already carries a note or a link, the sheet edits that mark, and
   * where it does not, the sheet makes one with no ink — the same invisible
   * mark a note alone makes in the reader. A mark that was only ever the note
   * or the link goes when the sheet is emptied.
   */
  const saveVerse = async ({ note, links, title }: { note: string; links: AnnotationLink[]; title: string }) => {
    const target = editor;
    if (!doc || !target) return;
    const verse = doc.verses.find((entry) => entry.number === target.verse);
    if (!verse) return;

    const html = note && note.trim() ? sanitizeBody(note) : "";
    const name = html ? title.trim() || undefined : undefined;
    const held = new Set((editorMark?.links ?? []).map((link) => link.label));
    const now = new Date().toISOString();
    const chain = links.map((link) =>
      link.addedAt || held.has(link.label) ? link : { ...link, addedAt: now }
    );

    if (editorMark) {
      const bare = editorMark.color === "clear" && !html && !chain.length;
      if (bare) {
        await removeAnnotations(markGroup(annotations, editorMark).map((mark) => mark.id));
      } else {
        await updateAnnotation(editorMark.id, {
          note: html || undefined,
          title: name,
          links: chain.length ? chain : undefined,
        });
      }
      announce(html ? "Note saved" : chain.length ? "Link saved" : "Removed");
      return;
    }

    if (!html && !chain.length) return;
    await addAnnotations([
      {
        doc: doc.doc,
        book: doc.book,
        chapter: doc.chapter,
        verse: verse.number,
        startWord: 1,
        endWord: wordsOf(verse.text).length,
        color: "clear",
        style: "fill",
        note: html || undefined,
        title: name,
        links: chain.length ? chain : undefined,
      },
    ]);
    announce(html ? "Note saved" : "Link saved");
  };

  const removeVerseMark = (mark: Annotation) => {
    void removeAnnotations(markGroup(annotations, mark).map((segment) => segment.id));
    announce("Removed");
  };

  /**
   * The verse's notes, links, and tags, read beside the words.
   *
   * With something to read, the panel is where it is read; with nothing, the
   * press writes the first note, because an empty panel is a door onto an empty
   * room. The verse is the whole unit here, so a note written from the scroll
   * covers every word of it, the same as the kebab's.
   */
  const openNotes = () => {
    if (!doc || !current) return;
    setActionsOpen(false);
    if (carried) setAside(current.number);
    else setEditor({ verse: current.number, mode: "note" });
  };

  /** Take one link out of a mark's chain, from the panel that reads it. */
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

  /** Take a mark's note off it, leaving whatever else it carries. */
  const removeNote = async (mark: Annotation) => {
    const group = markGroup(docMarks, mark);
    const bare = group.every((segment) => segment.color === "clear" && !segment.links?.length);
    if (bare) await removeAnnotations(group.map((segment) => segment.id));
    else await updateAnnotation(mark.id, { note: undefined, title: undefined });
    announce("Note removed");
  };

  /** The tags sheet, for every mark the open panel is showing. */
  const openAsideTags = () => {
    if (aside === null || !doc) return;
    const ids = [
      ...new Set(asideMarks.flatMap((mark) => markGroup(docMarks, mark).map((segment) => segment.id))),
    ];
    const quote = asideMarks
      .map((mark) =>
        rangeText(
          doc.verses.find((entry) => entry.number === mark.verse)?.text ?? "",
          mark.startWord,
          mark.endWord
        )
      )
      .join(" ");
    setTagsEditor({ verse: aside, title: referenceOf(aside), quote, tags: allTags(asideMarks), ids });
  };

  /**
   * Save the sheet's tags on the marks the panel is showing.
   *
   * The sheet is the whole set for its target: a tag taken out of it leaves the
   * words, and a verse with no mark of its own — one reached only by a way back
   * — gains the same invisible mark a note alone would make.
   */
  const saveTags = async (next: string[]) => {
    const target = tagsEditor;
    if (!doc || !target) return;
    setTagsEditor(null);
    const tags = [
      ...new Map(next.map((entry) => [tagKey(entry), cleanTag(entry)])).values(),
    ].filter((entry) => entry.length > 0);

    if (target.ids.length) {
      // Taking the last tag off a mark that was only ever a tag removes the
      // mark: an invisible annotation is not something the reader could find
      // or remove again.
      for (const id of target.ids) {
        const mark = docMarks.find((entry) => entry.id === id);
        if (!mark) continue;
        const bare = mark.color === "clear" && !noteText(mark.note) && !mark.links?.length;
        if (bare && !tags.length) await removeAnnotations([id]);
        else await updateAnnotation(id, { tags });
      }
    } else if (tags.length) {
      const verse = doc.verses.find((entry) => entry.number === target.verse);
      if (!verse) return;
      await addAnnotations([
        {
          doc: doc.doc,
          book: doc.book,
          chapter: doc.chapter,
          verse: verse.number,
          startWord: 1,
          endWord: wordsOf(verse.text).length,
          color: "clear",
          style: "fill",
          tags,
        },
      ]);
    }

    announce(tags.length ? "Tags saved" : "Tags removed");
  };

  /** Take one tag off every mark the panel shows. */
  const removeAsideTag = (tag: string) => {
    const ids = [
      ...new Set(asideMarks.flatMap((mark) => markGroup(docMarks, mark).map((segment) => segment.id))),
    ];
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

  /** Take the verse under the eye on as a card, the way the reader's sheet does. */
  const memorizeVerse = () => {
    if (!doc || !current) return;
    setActionsOpen(false);
    setMemory(itemFromPassage(versePassage(doc, current.number), undefined, [current.number]));
  };

  const shareVerse = () => {
    if (!doc || !current) return;
    setShare({
      title: referenceOf(current.number),
      subtitle: doc.sourceLabel,
      lines: [{ label: String(current.number), text: current.text }],
      footer: "Gospel Focus",
    });
  };

  /** The one page drawn from each neighbouring chapter, when there is one. */
  const before = edges.prev ? edges.prev.verses[edges.prev.verses.length - 1] ?? null : null;
  const after = edges.next ? edges.next.verses[0] ?? null : null;

  return (
    <AppShell>
      <main data-scroll className="scroll-page relative flex shrink-0 flex-col bg-reader-page">
        {/* The reader's own bar, control for control: back, the chapter's name,
            bookmarks, search. It does not stick — the page itself is the
            screen here, and the chapter's words are the only thing that
            moves. */}
        <div className="relative flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
          <BackLink fallbackHref={doc ? readerHref({ kind: doc.kind, book: doc.book, chapter: doc.chapter, conferenceId: doc.conferenceId }) : "/read"} />
          <div className="min-w-0 flex-1">
            {doc ? (
              <ReaderPlaceButton
                doc={doc}
                fromDaily={false}
                open={placeOpen}
                onToggle={() => setPlaceOpen((open) => !open)}
                menuAlways
              />
            ) : (
              <div className="h-7 w-40 animate-pulse rounded-full bg-surface-2" aria-hidden="true" />
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!placeNow) return;
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
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10" aria-hidden="true">
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-surface-2" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-2" />
            <div className="mt-3 h-3 w-24 animate-pulse rounded-full bg-surface-2" />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6">
              <p className="font-semibold text-foreground">This chapter couldn&apos;t be opened.</p>
              <p className="mt-2 text-sm text-muted">{error}</p>
              <Link
                href="/passage"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast"
              >
                Draw a passage instead
              </Link>
            </div>
          </div>
        ) : doc && current ? (
          <div className="relative min-h-0 flex-1">
            {/* One verse a screen. The stage is its own scrollport with a snap
                per verse, so a swipe turns exactly the verse it reaches and
                the page behind the app's bars never moves.

                The chapter's two ends are pages too: the last verse of the
                chapter before, and the first verse of the chapter after, drawn
                exactly as they will be drawn when that chapter is open. A
                swipe into one of them is an ordinary page turn, and the turn
                is taken when it has come to rest. */}
            <div
              ref={stage}
              data-scroll-stage
              onPointerDown={onStagePointerDown}
              onPointerUp={onStagePointerUp}
              onPointerCancel={onStagePointerCancel}
              onTouchStart={onStageTouchStart}
              onTouchEnd={onStageTouchEnd}
              className={`h-full snap-y snap-mandatory touch-manipulation overflow-y-auto overscroll-contain transition-[filter] duration-200 ${
                holdingRail ? "blur-[2px]" : ""
              }`}
            >
              {before && edges.prev ? (
                <VerseScreen doc={edges.prev} verse={before} edge="prev" />
              ) : null}
              {doc.verses.map((verse, at) => (
                <VerseScreen key={verse.number} doc={doc} verse={verse} current={at === index} />
              ))}
              {after && edges.next ? (
                <VerseScreen doc={edges.next} verse={after} edge="next" />
              ) : null}
            </div>

            {/* Where the reader is in the chapter, and a handle on it: one tick
                per verse, running the whole height of the left edge, so the
                chapter's length can be seen at a glance and the eye finds the
                verse it is on by how far down the rail the bright tick sits.

                At rest the rail lies flat along the edge, a ruler: the chapter's
                two ends are named, and so is the verse under the eye, each
                number just inside its tick.

                Held, the rail becomes a handle: every tick thickens with the
                press, and the verse under the finger's number rides out into
                the page on a gold pin. The pin's point reaches back towards the
                rail — the tick it stands for — while its round head and number
                sit out where the words are, with the page softly out of focus
                behind them so the two never have to share a line. Letting go
                lays the rail flat again in one step.

                The rail is also the scrubber: a finger anywhere on it puts the
                stage on that row, and dragging up or down runs the chapter at
                the finger's pace, ticking once for every verse it crosses. */}
            <div
              ref={rail}
              data-scroll-progress={`${index + 1} / ${total}`}
              data-scroll-holding={holdingRail ? "true" : undefined}
              aria-hidden="true"
              onPointerDown={onRailPointerDown}
              onPointerMove={onRailPointerMove}
              onPointerUp={onRailPointerUp}
              onPointerCancel={onRailPointerUp}
              className="absolute inset-y-0 left-0 z-20 flex w-11 touch-none select-none flex-col py-4"
            >
              {doc.verses.map((verse, at) => {
                const here = at === index;
                const edge = at === 0 || at === doc.verses.length - 1;
                const pinned = here && holdingRail;
                return (
                  <span key={verse.number} className="relative flex min-h-0 flex-1 items-center pl-2">
                    {/* Each tick is a share of its row rather than a fixed
                        length: a chapter of thirty verses gets the same line of
                        dashes as one of five, where a fixed 16px dash would
                        leave most of a short chapter's rail empty. Held, every
                        tick thickens — the rail saying it is in the hand rather
                        than only under the eye — and the one under the finger
                        thickens most and turns gold. */}
                    <span
                      className={
                        here
                          ? `block h-[88%] min-h-[2px] rounded-full transition-[width] duration-150 ${
                              pinned ? "w-[7px] bg-accent" : "w-[3px] bg-foreground"
                            }`
                          : `block h-[78%] min-h-[1px] rounded-full bg-border transition-[width] duration-150 ${
                              holdingRail ? "w-[5px]" : "w-[3px]"
                            }`
                      }
                    />
                    {/* The chapter's two ends keep their numbers beside their
                        ticks, so the rail is a ruler: verse one at the top,
                        the last verse at the foot, and where the reader is in
                        between. The verse under the eye has the same place —
                        just inside its tick — until the rail is held, when it
                        rides out into the page on the pin below. Where the
                        reader is on an end, there is only the one number to
                        draw. */}
                    {(here || edge) &&
                      (pinned ? (
                        // A droplet laid on its side: the round head sits
                        // where the old disc sat, and its point reaches back
                        // towards the rail to say which tick the number belongs
                        // to. Every part of the outline is an arc, and each one
                        // is tangent to the next where they meet, so the drawn
                        // edge is convex the whole way round — no corner and no
                        // dip where the tail leaves the head, which is what made
                        // the earlier tail read as a separate shape stuck on.
                        // The head is the right-hand semicircle (radius 18, as
                        // the disc was); the two flanks are arcs of a wider
                        // circle (radius 34) that meet the head at its top and
                        // its foot and come together in the point at x=6. A
                        // wider circle means less bend, so the flanks ease out
                        // of the head and hold almost straight until they close
                        // into the point. The box is 54 wide so the head's
                        // centre — and so the number — lands where the disc's
                        // did.
                        <span
                          data-scroll-number={verse.number}
                          data-scroll-pin=""
                          aria-hidden="true"
                          style={{ left: "48px" }}
                          className="absolute top-1/2 z-10 h-9 w-[54px] -translate-y-1/2 text-accent"
                        >
                          <svg viewBox="0 0 54 36" className="absolute inset-0 h-9 w-[54px] drop-shadow-md">
                            <path
                              fill="currentColor"
                              d="M6 18A34 34 0 0 1 36 0A18 18 0 0 1 36 36A34 34 0 0 1 6 18Z"
                            />
                          </svg>
                          <span
                            data-scroll-pin-head=""
                            className="absolute inset-y-0 left-[18px] flex w-9 items-center justify-center text-[16px] font-bold leading-none tabular-nums text-accent-contrast"
                          >
                            {verse.number}
                          </span>
                        </span>
                      ) : (
                        <span
                          data-scroll-number={verse.number}
                          style={{ left: "17px" }}
                          className={`absolute top-1/2 -translate-y-1/2 text-[10px] leading-none tabular-nums ${
                            here ? "font-semibold text-foreground" : "text-muted"
                          }`}
                        >
                          {verse.number}
                        </span>
                      ))}
                  </span>
                );
              })}
            </div>
            <p className="sr-only" role="status" aria-live="polite">
              Verse {index + 1} of {total}
            </p>

            {/* The heart a double tap leaves behind: it grows out of nothing
                in the middle of the screen, leans a little to the right, comes
                back upright, and then shrinks away. It is the confirmation of
                the gesture rather than a control — no pointer ever reaches it
                — and the key is what lets a second double tap play it again. */}
            {burst > 0 && (
              <span
                key={burst}
                data-scroll-burst
                aria-hidden="true"
                className="scroll-heart-burst pointer-events-none absolute inset-0 z-30 grid place-items-center"
              >
                <Glyph name="heart" filled className="h-28 w-28 sm:h-36 sm:w-36" />
              </span>
            )}

            {/* The verse's own actions, under the thumb. They act on the verse
                on screen, so they stay put while the verses turn. The notes
                mark is always here, because what a verse says about itself is
                worth a press; its badge is what says there is something to
                read. The two the reader reaches for least — a note and a link —
                are one press away under the kebab, with the card the verse can
                become. */}
            <div
              ref={actions}
              className="absolute bottom-4 right-0 z-20 flex flex-col gap-2.5 sm:bottom-6 sm:right-5"
            >
              <ScrollAction
                label={saved ? `Remove ${referenceOf(current.number)} from favorites` : `Favorite ${referenceOf(current.number)}`}
                pressed={saved}
                onClick={favorite}
              >
                <Glyph
                  name="heart"
                  className={saved ? "h-5 w-5 text-accent-strong" : "h-5 w-5"}
                  filled={saved}
                />
              </ScrollAction>
              <ScrollAction
                label={
                  carried
                    ? `Read the notes, links, and tags on ${referenceOf(current.number)}`
                    : `Add a note to ${referenceOf(current.number)}`
                }
                badge={carried}
                onClick={openNotes}
              >
                <Glyph
                  name="annotations"
                  className={carried ? "h-5 w-5 text-accent-strong" : "h-5 w-5"}
                />
              </ScrollAction>
              <ScrollAction label={`Share ${referenceOf(current.number)}`} onClick={shareVerse}>
                <ShareIcon className="h-5 w-5" />
              </ScrollAction>
              <ScrollAction
                buttonRef={moreButton}
                label={`More actions for ${referenceOf(current.number)}`}
                expanded={actionsOpen}
                onClick={() => setActionsOpen((open) => !open)}
              >
                <Glyph name="more" className="h-5 w-5" />
              </ScrollAction>

              {actionsOpen && (
                <div
                  role="menu"
                  aria-label={`Actions for ${referenceOf(current.number)}`}
                  className="absolute bottom-0 right-full z-30 mr-3 w-52 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_18px_44px_-20px_rgba(0,0,0,0.55)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={`${noteHere ? "Edit the note" : "Write a note"} on ${referenceOf(current.number)}`}
                    onClick={() => {
                      setActionsOpen(false);
                      setEditor({ verse: current.number, mode: "note" });
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/10 hover:text-accent-strong"
                  >
                    <Glyph name="journal" className="h-4 w-4 shrink-0" />
                    <span className="truncate">{noteHere ? "Edit note" : "Add a note"}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={`Link ${referenceOf(current.number)} to a passage`}
                    onClick={() => {
                      setActionsOpen(false);
                      setEditor({ verse: current.number, mode: "link" });
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/10 hover:text-accent-strong"
                  >
                    <Glyph name="link" className="h-4 w-4 shrink-0" />
                    <span className="truncate">Link a passage</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={`Memorize ${referenceOf(current.number)}`}
                    onClick={memorizeVerse}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/10 hover:text-accent-strong"
                  >
                    <Glyph name="cards" className="h-4 w-4 shrink-0" />
                    <span className="truncate">Memorize</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* As in the reader: the heart, the note, the link are the answer, and
            no pill is drawn over the verse to repeat them. A screen reader is
            still told, because it cannot see the mark change. */}
        {notice && (
          <p role="status" className="sr-only">
            {notice}
          </p>
        )}
      </main>

      {editor && doc && (
        <AnnotationDialog
          open
          title={referenceOf(editor.verse)}
          quote={doc.verses.find((verse) => verse.number === editor.verse)?.text ?? ""}
          initialNote={editorMark?.note ?? ""}
          initialTitle={editorMark?.title ?? ""}
          initialLinks={editorMark?.links ?? []}
          focus={editor.mode}
          onSave={(mark) => void saveVerse(mark)}
          onClose={() => setEditor(null)}
          onDelete={editorMark ? () => removeVerseMark(editorMark) : undefined}
        />
      )}

      {aside !== null && doc && (
        <VerseAside
          doc={doc}
          verse={aside}
          marks={asideMarks}
          annotations={annotations}
          backlinks={docBacklinks.get(aside) ?? []}
          onClose={() => setAside(null)}
          onEdit={(mark, mode) => {
            setAside(null);
            setEditor({ verse: mark.verse, mode });
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

      {bookmarksOpen && placeNow && (
        <BookmarksDialog
          place={placeNow}
          onClose={() => setBookmarksOpen(false)}
          onNotice={announce}
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
          draft={memory}
          onClose={() => setMemory(null)}
        />
      )}
    </AppShell>
  );
}

/**
 * One page of the stage: a verse with the middle of the screen to itself.
 *
 * Under the words, the reference names the verse and opens it in the reader —
 * the same place read as prose, for a reader who wants the chapter around it.
 *
 * The sides are equal, so the measure is centred on the screen rather than
 * pulled left: the ticks and the verse's actions both live in the gutter, and
 * the words take what is left. The action column sits flush with the right edge
 * because it is only icon ink — its 48px targets keep their width without
 * stealing any of the verse's margin. The box inside can scroll the rare verse
 * longer than a screen rather than spilling it over the verses beside it.
 *
 * The pages at the chapter's two ends are drawn with this same screen, marked
 * with `edge`: the last verse of the chapter before, and the first verse of the
 * one after. That is what makes a turn into a new chapter invisible — the page
 * arriving under the thumb is exactly the page that chapter will open on. They
 * are kept out of the chapter's own count (no `data-scroll-verse`, no place on
 * the rail) because they belong to the chapter beside this one.
 *
 * Each page is also a stop the scroll may not pass: `snap-always` means a hard
 * flick comes to rest on the very next page rather than carrying its momentum
 * through two or three verses. One swipe, one page, however fast it was made.
 */
function VerseScreen({
  doc,
  verse,
  edge,
  current,
}: {
  doc: ReaderDoc;
  verse: ReaderVerse;
  edge?: "prev" | "next";
  current?: boolean;
}) {
  const reference = referenceIn(doc, verse.number);

  return (
    <section
      data-scroll-page=""
      data-scroll-verse={edge ? undefined : verse.number}
      data-scroll-edge={edge}
      data-scroll-current={current ? "true" : undefined}
      aria-label={reference}
      className="flex h-full w-full snap-start snap-always flex-col items-center justify-center pb-24 pl-11 pr-11 pt-4 text-center sm:px-24"
    >
      <div className="max-h-full w-full overflow-y-auto">
        <p className={`mx-auto max-w-[36rem] font-serif text-balance text-foreground ${verseType(verse.text)}`}>
          {verse.text}
        </p>
        {/* The reference is also the way back to the reader, where the same
            verse is shown as prose. The arrow says the words are a door rather
            than a label; it is drawn, so a screen reader reads the reference
            once. It wears the same reading gold as a reference in the notes
            panel, so the two ends of one link look like one thing. */}
        <Link
          href={readerHref({
            kind: doc.kind,
            book: doc.book,
            chapter: doc.chapter,
            conferenceId: doc.conferenceId,
            verse: verse.number,
          })}
          aria-label={`Open ${reference} in the reader`}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium tracking-wide text-accent-strong transition-colors hover:underline"
        >
          {reference}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

/**
 * One action on the scroll's right edge.
 *
 * The icons stand on the verse without a disc behind them: a scroll screen is
 * the words, and circles floating over them read as furniture. The button
 * keeps a 44px target so the thumb still finds it — and, flush with the edge,
 * exactly the width of the verse's right margin — but nothing is drawn except
 * the glyph, the same restraint the reader's bar keeps.
 */
function ScrollAction({
  label,
  pressed,
  expanded,
  badge,
  buttonRef,
  onClick,
  children,
}: {
  label: string;
  /** Set for a control with two states; read as `aria-pressed` by a screen reader. */
  pressed?: boolean;
  /** Set for the control that opens a menu, so its state is read out. */
  expanded?: boolean;
  /** Set when the control has something waiting behind it; a dot rides its corner. */
  badge?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onClick}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      aria-expanded={expanded}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="grid h-11 w-11 place-items-center text-foreground transition-colors hover:text-accent-strong active:scale-95"
    >
      <span className="relative grid place-items-center">
        {children}
        {badge && (
          // Ringed in the page's own colour so the dot reads as a bubble laid on
          // the glyph rather than as part of its drawing.
          <span
            data-scroll-badge=""
            aria-hidden="true"
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent-strong ring-2 ring-reader-page"
          />
        )}
      </span>
    </button>
  );
}
