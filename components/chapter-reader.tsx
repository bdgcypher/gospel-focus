"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import { AnnotationDialog } from "./annotation-dialog";
import { AnnotationToolbar } from "./annotation-toolbar";
import { BackLink } from "./back-link";
import { ChapterBrowser } from "./chapter-browser";
import { Glyph } from "./glyph";
import { MarkChooser } from "./mark-chooser";
import { Sheet } from "./sheet";
import { SaveToMemorizeDialog } from "./save-to-memorize-dialog";
import { ShareCardDialog } from "./share-card-dialog";
import {
  addAnnotations,
  annotationsFor,
  markGroup,
  markGroupId,
  marksAt,
  newId,
  noteRecentChoice,
  noteText,
  rangeText,
  rangesInSelection,
  removeAnnotations,
  updateAnnotation,
  useAnnotations,
  useRecentChoices,
  wordsOf,
  type Annotation,
  type AnnotationLink,
  type MarkColor,
  type MarkStyle,
  type SelectionRange,
} from "@/lib/annotations";
import { dayKey } from "@/lib/daily";
import { isNative, openExternal } from "@/lib/external";
import { favoriteId, toggleFavorite, useFavorites } from "@/lib/favorites";
import { sanitizeBody } from "@/lib/journal";
import { loadManifest, pickDailyPassage } from "@/lib/picker";
import { usePreferences } from "@/lib/preferences";
import {
  docCitation,
  openReaderDoc,
  readerHref,
  versePassage,
  type ReaderCitation,
  type ReaderDoc,
} from "@/lib/reader";
import type { ShareCard } from "@/lib/share-image";

const LAST_KEY = "gospel-focus:reader:v1";

interface LastRead extends ReaderCitation {
  verse?: number;
}

function readLast(): LastRead | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(LAST_KEY) ?? "null") as Partial<LastRead> | null;
    if (!value || typeof value.book !== "string" || typeof value.chapter !== "string") return null;
    return {
      kind: value.kind === "conference" ? "conference" : "scripture",
      book: value.book,
      chapter: value.chapter,
      conferenceId: typeof value.conferenceId === "string" ? value.conferenceId : undefined,
      verse: typeof value.verse === "number" ? value.verse : undefined,
    };
  } catch {
    return null;
  }
}

function writeLast(citation: ReaderCitation & { verse?: number }): void {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(citation));
  } catch {
    // Storage can be unavailable; the reader still works for this visit.
  }
}

interface SelectionState {
  ranges: SelectionRange[];
  text: string;
}

interface EditorState {
  title: string;
  quote: string;
  note: string;
  link: AnnotationLink | null;
  ranges: SelectionRange[];
  /** The annotation being edited, when the sheet was opened from a mark. */
  existingId?: string;
  /** Which field the sheet opens on, from the panel's Note or Link. */
  focus?: "note" | "link";
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
  const [focus, setFocus] = useState<number | null>(null);
  const [fromDaily, setFromDaily] = useState(false);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  /** The mark the panel is open on — its group id, not one verse's segment. */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** The style the next colour tap will make, before any mark exists. */
  const [pendingStyle, setPendingStyle] = useState<MarkStyle>("fill");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [marksOpen, setMarksOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [verseSheet, setVerseSheet] = useState<number | null>(null);
  const [share, setShare] = useState<ShareCard | null>(null);
  const [memory, setMemory] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The bar's one control: the library, the chapter grid, the marks. */
  const [menuOpen, setMenuOpen] = useState(false);
  /** Several marks lie under one tap; the chooser is the choice between them. */
  const [choosing, setChoosing] = useState<Annotation[][] | null>(null);

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
        let verse: number | null = null;
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
          const raw = params.get("verse") ?? (action === "cite" ? params.get("section") : null);
          const number = Number(raw);
          verse = Number.isInteger(number) && number > 0 ? number : null;
        }

        if (action === "daily" || (!citation && !readLast())) {
          const manifest = await loadManifest();
          const passage = await pickDailyPassage(manifest, prefs.filters, dayKey());
          const passageBook = passage.book ?? "General Conference";
          citation = {
            kind: passage.kind,
            book: passageBook,
            chapter: passage.chapter ?? "",
          };
          verse = passage.highlightVerse ?? null;
          daily = true;
        } else if (!citation) {
          const last = readLast();
          if (last) {
            citation = {
              kind: last.kind,
              book: last.book,
              chapter: last.chapter,
              conferenceId: last.conferenceId,
            };
            verse = last.verse ?? null;
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
        setFocus(verse);
        setFromDaily(daily);
        writeLast({ kind: opened.kind, book: opened.book, chapter: opened.chapter, conferenceId: opened.conferenceId, verse: verse ?? undefined });
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

  /** Bring the requested verse into view, or start a new chapter at its head. */
  useEffect(() => {
    if (!doc) return;
    const id = window.setTimeout(() => {
      if (focus) {
        document.getElementById(`verse-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    }, 90);
    return () => window.clearTimeout(id);
  }, [doc, focus]);

  /**
   * Turn a live selection into word ranges, once the browser has settled it.
   *
   * Three events, because a selection arrives three ways: a drag ends in a
   * pointerup, shift-and-arrow ends in a keyup, and a phone's selection handles
   * move without either — those only announce themselves as the selection
   * changing. The toolbar itself must never clear the selection it is acting on
   * (touching a button outside the words collapses the browser's selection
   * before the click lands), so a tap is only treated as a dismissal when it
   * lands inside the chapter with nothing selected.
   */
  useEffect(() => {
    if (!doc) return;

    const capture = () => {
      const box = article.current;
      if (!box) return;
      const ranges = rangesInSelection(box);
      const text = window.getSelection()?.toString().trim() ?? "";
      if (ranges.length && text) {
        // New words under the finger, so the panel is for these words and not
        // for whatever mark was open a moment ago.
        setActiveId(null);
        setSelection({ ranges, text });
      }
    };

    let timer = 0;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(capture, delay);
    };

    const onUp = () => schedule(30);
    const onSelectionChange = () => {
      if (!window.getSelection()?.isCollapsed) schedule(160);
    };
    const onPointerUp = (event: PointerEvent) => {
      const box = article.current;
      if (box && event.target instanceof Node && box.contains(event.target)) {
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

    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keyup", onUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keyup", onUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [doc]);

  const docMarks = useMemo(
    () => (doc ? annotationsFor(annotations, doc.doc) : []),
    [annotations, doc]
  );

  /** Close every way into a mark: the words' selection, the panel, the chooser. */
  const dismiss = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setActiveId(null);
  }, []);

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

  /** The words of a mark, in reading order, as one run of prose. */
  const groupQuote = useCallback(
    (group: Annotation[]) => {
      if (!doc) return "";
      return group
        .map((segment) => {
          const text = doc.verses.find((verse) => verse.number === segment.verse)?.text ?? "";
          return rangeText(text, segment.startWord, segment.endWord);
        })
        .join(" ");
    },
    [doc]
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
    const plain = selectionMarks.filter((mark) => !mark.note && !mark.link);
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

  /** The sheet that writes on a mark, opened only from the panel's Note/Link. */
  const editGroup = (group: Annotation[], focus: "note" | "link") => {
    const holder = group.find((segment) => segment.note || segment.link) ?? group[0];
    setEditor({
      title: rangeLabel(group.map((segment) => ({ verse: segment.verse, startWord: segment.startWord, endWord: segment.endWord }))),
      quote: groupQuote(group),
      note: holder.note ?? "",
      link: holder.link ?? null,
      ranges: group.map((segment) => ({ verse: segment.verse, startWord: segment.startWord, endWord: segment.endWord })),
      existingId: holder.id,
      focus,
    });
  };

  /** The marker after a note's words goes straight to the note, not the panel. */
  const openMarkNote = (mark: Annotation) => editGroup(markGroup(docMarks, mark), "note");

  const openEditor = (mode: "note" | "link") => {
    if (active) {
      editGroup(active, mode);
      return;
    }
    if (!doc || !selection) return;
    const exact = selectionMarks.find((mark) => mark.note || mark.link);
    setEditor({
      title: rangeLabel(selection.ranges),
      quote: selection.text,
      note: exact?.note ?? "",
      link: exact?.link ?? null,
      ranges: selection.ranges,
      existingId: exact?.id,
      focus: mode,
    });
    // The selection is kept while the sheet is open, so the words being marked
    // stay visible behind it; the panel comes back when the sheet closes.
  };

  const saveEditor = async (mark: { note: string; link: AnnotationLink | null }) => {
    if (!doc || !editor) return;
    const note = mark.note && mark.note.trim() ? sanitizeBody(mark.note) : "";

    if (editor.existingId) {
      const existing = docMarks.find((a) => a.id === editor.existingId);
      if (!note && !mark.link && existing?.color === "clear") {
        // A mark that was only ever the note goes away with it — every verse of
        // it, or the empty ones would be left behind.
        const group = existing ? markGroup(docMarks, existing) : [];
        await removeAnnotations(group.map((segment) => segment.id));
      } else {
        await updateAnnotation(editor.existingId, {
          note: note || undefined,
          link: mark.link ?? undefined,
        });
      }
      announce(note ? "Note saved" : "Annotation updated");
    } else if (note || mark.link) {
      // Attach to the plain marks already on these words, so the highlight and
      // the note are one annotation rather than two stacked on each other.
      const plain = selectionMarks
        .filter((a) => !a.note && !a.link && a.color !== "clear")
        .sort((a, b) => a.verse - b.verse || a.startWord - b.startWord);
      if (plain.length && plain.length === editor.ranges.length) {
        await updateAnnotation(plain[0].id, { note: note || undefined, link: mark.link ?? undefined });
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
            link: index === 0 ? mark.link ?? undefined : undefined,
            groupId,
          }))
        );
        if (!created.length) announce("Nothing to save");
      }
      announce(mark.link && !note ? "Link added" : "Note saved");
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

  const panelColor = active && active[0].color !== "clear" ? active[0].color : null;
  const panelStyle = active ? active[0].style : pendingStyle;

  const markCount = docMarks.filter((mark) => mark.color !== "clear" || mark.note || mark.link).length;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[46rem] flex-1 px-5 pb-16 pt-4 sm:px-8 sm:pt-6">
        {/* The bar a reader gets instead of a page header: the way back, the
            chapter in small type, and one control for everything else. Nothing
            up here competes with the words below it. */}
        <div className="flex items-center gap-2">
          <BackLink fallbackHref="/passage" />
          <div className="min-w-0 flex-1">
            {doc ? (
              <>
                <h1 className="truncate font-serif text-base font-semibold leading-tight text-foreground">
                  {doc.title}
                </h1>
                <p className="truncate text-[11px] leading-tight text-muted">
                  {doc.subtitle ?? (doc.kind === "scripture" ? doc.sourceLabel : "General Conference")}
                  {fromDaily && <span className="text-accent-strong"> · Today&apos;s passage</span>}
                </p>
              </>
            ) : (
              <div className="h-7 w-40 animate-pulse rounded-full bg-surface-2" aria-hidden="true" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Chapter menu"
            title="Menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent-strong"
          >
            <Glyph name="menu" className="h-5 w-5" />
          </button>
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
            <article
              ref={article}
              data-reader
              className="mt-6 font-serif text-[1.12rem] leading-[1.75] text-foreground/90 sm:mt-8 sm:text-[1.18rem] sm:leading-[1.8]"
            >
              {doc.verses.map((verse) => (
                <VerseRow
                  key={verse.number}
                  doc={doc}
                  verse={verse}
                  annotations={docMarks}
                  focused={focus === verse.number}
                  onVerse={setVerseSheet}
                  onNote={openMarkNote}
                  onWords={openAt}
                />
              ))}
            </article>

            {/* The neighbouring chapters, as words rather than buttons: at the
                foot of a chapter the next thing a reader wants is the next
                chapter, not another piece of furniture. */}
            <nav className="mt-10 flex items-center justify-between gap-4 border-t border-border/60 pt-5 text-sm">
              {doc.prev ? (
                <button
                  type="button"
                  onClick={() =>
                    doc.prev &&
                    go({ ...docCitation(doc), chapter: doc.prev.chapter, book: doc.prev.book, conferenceId: doc.prev.conferenceId })
                  }
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
                  onClick={() =>
                    doc.next &&
                    go({ ...docCitation(doc), chapter: doc.next.chapter, book: doc.next.book, conferenceId: doc.next.conferenceId })
                  }
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

      {/* One tool for both moments: the words just selected, or the mark just
          tapped. It stays out of the way while the note sheet or the chooser is
          over it. */}
      <AnnotationToolbar
        open={Boolean((selection || active) && !editor && !choosing)}
        color={panelColor}
        style={panelStyle}
        recent={recents}
        canRemove={Boolean(active || selectionMarks.length)}
        onColor={applyColour}
        onChoice={applyChoice}
        onStyle={applyStyle}
        onNote={() => openEditor("note")}
        onLink={() => openEditor("link")}
        onCopy={() => void copyHere()}
        onShare={shareHere}
        onRemove={() => void removeHere()}
        onClose={dismiss}
      />

      {editor && (
        <AnnotationDialog
          open
          title={editor.title}
          quote={editor.quote}
          initialNote={editor.note}
          initialLink={editor.link}
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

      {notice && (
        <p
          role="status"
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[60] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background shadow-lg"
        >
          {notice}
        </p>
      )}

      {browseOpen && (
        <ChapterBrowser
          onClose={() => setBrowseOpen(false)}
          onPick={(book, chapter) => {
            setBrowseOpen(false);
            go({ kind: "scripture", book, chapter });
          }}
        />
      )}

      {marksOpen && doc && (
        <MarksSheet
          doc={doc}
          marks={docMarks}
          onClose={() => setMarksOpen(false)}
          onJump={(mark) => {
            setMarksOpen(false);
            setFocus(mark.verse);
            window.setTimeout(
              () => document.getElementById(`verse-${mark.verse}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
              60
            );
          }}
          onEdit={(mark) => editGroup(markGroup(docMarks, mark), "note")}
          onDelete={(mark) => void removeAnnotations(markGroup(docMarks, mark).map((segment) => segment.id))}
        />
      )}

      {chaptersOpen && doc && (
        <Sheet title="Chapters" onClose={() => setChaptersOpen(false)}>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {doc.chapters?.map((chapter) => (
              <button
                key={chapter.number}
                type="button"
                onClick={() => {
                  setChaptersOpen(false);
                  router.push(readerHref({ ...docCitation(doc), chapter: String(chapter.number) }));
                }}
                aria-current={String(chapter.number) === doc.chapter ? "true" : undefined}
                className={`rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors ${
                  String(chapter.number) === doc.chapter
                    ? "border-accent/60 bg-accent/15 text-accent-strong"
                    : "border-border bg-surface text-foreground hover:border-accent/60"
                }`}
              >
                {chapter.number}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {menuOpen && doc && (
        <Sheet title={doc.title} onClose={() => setMenuOpen(false)}>
          <div className="grid gap-1.5">
            <MenuRow
              icon="book"
              label="Browse"
              hint="Any book, any chapter"
              onClick={() => {
                setMenuOpen(false);
                setBrowseOpen(true);
              }}
            />
            {doc.chapters && (
              <MenuRow
                icon="grid"
                label="Chapters"
                hint={`Every chapter in ${doc.book}`}
                onClick={() => {
                  setMenuOpen(false);
                  setChaptersOpen(true);
                }}
              />
            )}
            <MenuRow
              icon="journal"
              label={markCount ? `Marks · ${markCount}` : "Marks"}
              hint="This chapter's marks and notes"
              onClick={() => {
                setMenuOpen(false);
                setMarksOpen(true);
              }}
            />
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            {isNative() ? "Marks are kept on this device." : "Marks are kept in this browser."}
          </p>
        </Sheet>
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
          onStar={() => {
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
            setMemory(verseSheet);
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

      {memory !== null && doc && (
        <SaveToMemorizeDialog
          open
          passage={versePassage(doc, memory)}
          sections={[memory]}
          onClose={() => setMemory(null)}
        />
      )}
    </AppShell>
  );
}

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
function VerseRow({
  doc,
  verse,
  annotations,
  focused,
  onVerse,
  onNote,
  onWords,
}: {
  doc: ReaderDoc;
  verse: { number: number; text: string };
  annotations: Annotation[];
  focused: boolean;
  onVerse: (verse: number) => void;
  onNote: (mark: Annotation) => void;
  /** Which word was pressed, so the reader can gather the marks over it. */
  onWords: (verse: number, word: number) => void;
}) {
  const words = useMemo(() => wordsOf(verse.text), [verse.text]);
  const marks = useMemo(
    () => annotationsFor(annotations, doc.doc, verse.number),
    [annotations, doc.doc, verse.number]
  );

  const fills = new Map<number, MarkColor>();
  const underlines = new Map<number, MarkColor>();
  const links = new Map<number, Annotation>();
  const notes = new Map<number, Annotation[]>();

  // Oldest first, so a newer mark on the same words paints over an older one and
  // the list under a tap reads newest last.
  for (const mark of [...marks].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    if (mark.color !== "clear") {
      for (let word = mark.startWord; word <= mark.endWord; word += 1) {
        if (mark.style === "underline") underlines.set(word, mark.color);
        else fills.set(word, mark.color);
      }
    }
    if (mark.link) {
      for (let word = mark.startWord; word <= mark.endWord; word += 1) links.set(word, mark);
    }
    if (mark.note?.trim()) {
      const list = notes.get(mark.endWord) ?? [];
      list.push(mark);
      notes.set(mark.endWord, list);
    }
  }

  // Where each highlight band begins and ends, so its outer corners can be
  // rounded while the joins between its words stay square. A run is bounded
  // where the colour changes, so two marks of the same colour side by side read
  // as one band, and at a line break the band runs on to the margin as ink does.
  const bandStarts = new Set<number>();
  const bandEnds = new Set<number>();
  for (const [word, colour] of fills) {
    if (fills.get(word - 1) !== colour) bandStarts.add(word);
    if (fills.get(word + 1) !== colour) bandEnds.add(word);
  }

  return (
    <p
      id={`verse-${verse.number}`}
      className={`-mx-2 mb-3 rounded-lg px-2 transition-colors ${
        focused ? "bg-accent/5" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onVerse(verse.number)}
        aria-label={`Verse ${verse.number}: actions`}
        title={`Verse ${verse.number}`}
        className="mr-1 inline rounded px-0.5 align-baseline text-[0.72em] font-semibold tabular-nums text-muted transition-colors hover:text-accent-strong"
      >
        {verse.number}
      </button>

      {words.map((word, index) => {
        const number = index + 1;
        const fill = fills.get(number);
        const underline = underlines.get(number);
        const link = links.get(number);
        // A mark with no colour, no underline and no link is a note: it has
        // nothing on the words to press, and its marker is the way in.
        const pressable = Boolean(fill || underline || link);
        return (
          <span key={number}>
            <span
              data-verse={verse.number}
              data-word={number}
              onClick={() => {
                if (!pressable) return;
                if (!window.getSelection()?.isCollapsed) return;
                onWords(verse.number, number);
              }}
              className={pressable ? "cursor-pointer" : undefined}
              style={{
                backgroundColor: fill ? `var(--mark-${fill})` : undefined,
                // Slightly rounded at the two ends of the band and square
                // between the words it runs through.
                borderRadius: fill
                  ? `${bandStarts.has(number) ? "0.22rem" : "0"} ${bandEnds.has(number) ? "0.22rem" : "0"} ${bandEnds.has(number) ? "0.22rem" : "0"} ${bandStarts.has(number) ? "0.22rem" : "0"}`
                  : undefined,
                textDecoration: underline || link ? "underline" : undefined,
                textDecorationColor: underline
                  ? `var(--mark-ink-${underline})`
                  : link
                    ? "var(--mark-ink-blue)"
                    : undefined,
                textDecorationThickness: underline || link ? "2px" : undefined,
                textUnderlineOffset: underline || link ? "3px" : undefined,
                textDecorationStyle: link ? "dotted" : undefined,
              }}
            >
              {word.word}
              {index < words.length - 1 ? " " : null}
            </span>
            {notes.get(number)?.map((mark) => (
              <button
                key={mark.id}
                type="button"
                onClick={() => onNote(mark)}
                aria-label={`Open the note on verse ${verse.number}`}
                title="Note"
                className="mx-0.5 inline-grid h-5 w-5 translate-y-[-1px] place-items-center rounded-full bg-accent/20 align-baseline text-accent-strong transition-colors hover:bg-accent/30"
              >
                <Glyph name="journal" className="h-3 w-3" />
              </button>
            ))}
          </span>
        );
      })}
    </p>
  );
}

function MarksSheet({
  doc,
  marks,
  onClose,
  onJump,
  onEdit,
  onDelete,
}: {
  doc: ReaderDoc;
  marks: Annotation[];
  onClose: () => void;
  onJump: (mark: Annotation) => void;
  onEdit: (mark: Annotation) => void;
  onDelete: (mark: Annotation) => void;
}) {
  const ordered = [...marks].sort((a, b) => a.verse - b.verse || a.startWord - b.startWord);
  return (
    <Sheet title="Marks in this chapter" onClose={onClose}>
      {ordered.length === 0 ? (
        <p className="pb-2 text-sm text-muted">
          Nothing marked yet. Select a few words to highlight them, underline them, or attach a note.
        </p>
      ) : (
        <ul className="space-y-2">
          {ordered.map((mark) => {
            const quote = noteText(mark.note);
            const verse = doc.verses.find((v) => v.number === mark.verse);
            return (
              <li key={mark.id} className="rounded-2xl border border-border bg-surface p-3">
                <div className="flex items-start gap-2">
                  <MarkChip mark={mark} />
                  <button type="button" onClick={() => onJump(mark)} className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-semibold text-accent-strong">
                      {doc.book} {doc.chapter}:{mark.verse}
                    </p>
                    {quote ? (
                      <p className="mt-0.5 line-clamp-2 text-sm text-foreground/85">{quote}</p>
                    ) : (
                      <p className="mt-0.5 line-clamp-2 font-serif text-sm text-muted">
                        {verse ? rangeText(verse.text, mark.startWord, mark.endWord) : ""}
                      </p>
                    )}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
                  <button
                    type="button"
                    onClick={() => onEdit(mark)}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-accent-strong"
                  >
                    <Glyph name="pencil" className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(mark)}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-accent-strong"
                  >
                    <Glyph name="trash" className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

/**
 * A mark at a glance: a filled swatch, or — for an underline — a bar of the ink
 * it is drawn in. A note with no colour of its own keeps an empty ring, so the
 * row still lines up with the others.
 */
function MarkChip({ mark }: { mark: Annotation }) {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 rounded-full border border-border"
      style={
        mark.style === "underline"
          ? {
              borderBottomColor: `var(--mark-ink-${mark.color === "clear" ? "gray" : mark.color})`,
              borderBottomWidth: 3,
            }
          : {
              backgroundColor: mark.color === "clear" ? "transparent" : `var(--mark-${mark.color})`,
            }
      }
    />
  );
}

/** One row of the reader's one menu: a mark, a name, and a line of explanation. */
function MenuRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: "book" | "grid" | "journal";
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:border-accent/60 hover:text-accent-strong"
    >
      <Glyph name={icon} className="h-5 w-5 shrink-0 text-muted" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}

function VerseSheet({
  doc,
  verse,
  saved,
  onClose,
  onCopy,
  onStar,
  onShare,
  onMemorize,
  onLibrary,
}: {
  doc: ReaderDoc;
  verse: number;
  saved: boolean;
  onClose: () => void;
  onCopy: () => void;
  onStar: () => void;
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
        <Action label={saved ? "Unstar" : "Star"} icon="bookmark" onClick={onStar} />
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
  icon: "copy" | "bookmark" | "sparkles" | "cards" | "book";
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
