"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Glyph } from "./glyph";
import { loadConferenceData, loadManifest } from "@/lib/picker";
import { browseIndex, type BrowseVolume, type ReaderCitation, type ReaderDoc } from "@/lib/reader";

/**
 * Where the reader is, and how it moves.
 *
 * The chapter used to be chosen from the top of the page — a menu button, a
 * browse sheet, a chapter grid — which meant the reader's place was a row of
 * controls standing between them and the words. This is that place moved out of
 * the way: on a wide screen it is a rail down the left of the page, always
 * showing the volume and the books in it; on a phone it is the chapter's own
 * name, which opens the small menu of levels the app's reader grew up with
 * (book, volume, Scriptures) and drills from a book into its chapters.
 *
 * Both sides draw from the manifest alone — the index the reader builds
 * (`browseIndex`) — so the rail costs no fetch of its own and a reader can move
 * through the standard works before a single verse has loaded.
 */

/** The standard works as a browsing tree, loaded once and shared by both faces. */
function useLibrary(): BrowseVolume[] | null {
  const [volumes, setVolumes] = useState<BrowseVolume[] | null>(null);

  useEffect(() => {
    let live = true;
    loadManifest()
      .then((manifest) => {
        if (live) setVolumes(browseIndex(manifest));
      })
      .catch(() => {
        // The chapter itself loads from the same manifest, and says so when it
        // can't. There is nothing useful to report twice.
      });
    return () => {
      live = false;
    };
  }, []);

  return volumes;
}

/** One conference session's talks, for the rail and the menu. */
function useTalks(conferenceId?: string) {
  const [talks, setTalks] = useState<{ id: string; title: string }[] | null>(null);

  useEffect(() => {
    if (!conferenceId) return;
    let live = true;
    loadConferenceData(conferenceId)
      .then((data) => {
        if (live) setTalks(data.talks.map((talk) => ({ id: talk.id, title: talk.title })));
      })
      .catch(() => {
        // A session that didn't load leaves the rail with its heading and no
        // list: the talk itself is still on the page.
      });
    return () => {
      live = false;
    };
  }, [conferenceId]);

  return talks;
}

/**
 * The desktop rail: the volume, its books, and the open book's chapters.
 *
 * It is sticky and scrolls inside itself, so the books stay beside the words
 * however far into a chapter the reader has gone. Only one book is open at a
 * time, and it opens on the one being read — a tree of every book's chapters at
 * once would be a wall of numbers with the reader's own place lost in it.
 */
export function ChapterRail({
  doc,
  onGo,
}: {
  doc: ReaderDoc;
  onGo: (citation: ReaderCitation) => void;
}) {
  // The rail is a tool, not part of the page: a reader who wants the full width
  // for a long chapter puts it away, and one icon in the margin brings it back.
  // It is remembered for this visit only — a fresh page opens with the library
  // in view, which is the state a reader arrives expecting.
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <aside className="hidden w-11 shrink-0 lg:block" aria-label="Chapter navigation">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the chapter navigation"
          aria-expanded={false}
          title="Show the contents"
          className="sticky top-[var(--reader-rail-top)] grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-muted shadow-sm transition-colors hover:border-accent/60 hover:text-accent-strong"
        >
          <Glyph name="contents" className="h-5 w-5" />
        </button>
      </aside>
    );
  }

  if (doc.kind === "conference") {
    return (
      <aside className="hidden w-56 shrink-0 lg:block" aria-label="Chapter navigation">
        <div className="sticky top-[var(--reader-rail-top)] max-h-[calc(100dvh-var(--reader-rail-top)-1.75rem)] overflow-y-auto pr-1 pb-6">
          {/* The session stays at the rail's top while its talks scroll under
              it, so a long list never leaves the reader without a heading. */}
          <div className="sticky top-0 z-10 -mx-1 bg-reader-page px-1 pb-2">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 font-serif text-base font-semibold leading-snug text-foreground">
                {doc.subtitle?.split(" · ").pop() ?? "Talks"}
              </p>
              <CloseButton onClose={() => setOpen(false)} />
            </div>
          </div>
          <TalkList doc={doc} onGo={onGo} />
        </div>
      </aside>
    );
  }
  return (
    <aside className="hidden w-56 shrink-0 lg:block" aria-label="Chapter navigation">
      <ScriptureRail doc={doc} onGo={onGo} onClose={() => setOpen(false)} />
    </aside>
  );
}

/** The rail's body: a volume's books, one of them open on its chapters. */
function ScriptureRail({
  doc,
  onGo,
  onClose,
}: {
  doc: ReaderDoc;
  onGo: (citation: ReaderCitation) => void;
  onClose: () => void;
}) {
  const volumes = useLibrary();
  // Which standard work the rail is showing. It starts on the one being read,
  // and follows the reader through any other door; the title above the list is
  // a menu, so a reader can look through another volume without leaving the
  // words they are on.
  const [volumeId, setVolumeId] = useState<string | null>(doc.volumeId ?? null);
  const volume = volumes?.find((entry) => entry.id === volumeId) ?? null;
  // The Doctrine and Covenants numbers its chapters as sections; every other
  // volume calls them chapters. The rail says the word so a number alone never
  // reads as a page or a verse.
  const division = volumeId === "dc" ? "Section" : "Chapter";
  // A volume that is one book — the Doctrine and Covenants — carries that
  // book's name in its own title, so its sections are the rail's list: a book
  // row with the same name would be a step that leads to itself.
  const sole = volume?.books.length === 1 ? volume.books[0] : null;
  const [openSlug, setOpenSlug] = useState<string | null>(doc.bookSlug ?? null);
  const [lastBook, setLastBook] = useState(doc.bookSlug);
  const [lastVolume, setLastVolume] = useState(doc.volumeId);
  const scroll = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLButtonElement>(null);

  // The open book follows the chapter being read, so moving to Deuteronomy by
  // any other door leaves the rail showing Deuteronomy. Adjusted while
  // rendering rather than in an effect, so the rail never paints last book's
  // chapters beside this book's verses.
  if (lastBook !== doc.bookSlug) {
    setLastBook(doc.bookSlug);
    setOpenSlug(doc.bookSlug ?? null);
  }
  // And a chapter in another volume puts the rail back on that volume, so the
  // list always opens beside the words it belongs to.
  if (lastVolume !== doc.volumeId) {
    setLastVolume(doc.volumeId);
    setVolumeId(doc.volumeId ?? null);
    setOpenSlug(doc.bookSlug ?? null);
  }

  // And the chapter being read is brought into the rail's own view, rather than
  // leaving the reader to scroll the rail to find where they are. This scrolls
  // the rail's box, never the page: `scrollIntoView` would have moved the
  // scripture under the reader's eyes as the rail opened. Browsing another
  // volume leaves nothing to bring into view.
  useEffect(() => {
    const box = scroll.current;
    const node = current.current;
    if (!box || !node) return;
    const offset = node.getBoundingClientRect().top - box.getBoundingClientRect().top;
    if (offset < 0 || offset + node.offsetHeight > box.clientHeight) {
      box.scrollTop += offset - box.clientHeight / 2;
    }
  }, [doc.doc, openSlug, volumes, volumeId]);

  return (
    <div
      ref={scroll}
      className="sticky top-[var(--reader-rail-top)] max-h-[calc(100dvh-var(--reader-rail-top)-1.75rem)] overflow-y-auto pr-1 pb-6"
    >
      {/* The volume stays at the rail's top while its books scroll under it,
          and the cross puts the whole rail away. */}
      <div className="sticky top-0 z-10 -mx-1 bg-reader-page px-1 pb-2">
        <div className="flex items-start justify-between gap-2">
          <VolumeMenu
            volumes={volumes}
            currentId={volumeId}
            fallback={doc.sourceLabel}
            onPick={(id) => {
              setVolumeId(id);
              setOpenSlug(null);
              if (scroll.current) scroll.current.scrollTop = 0;
            }}
          />
          <CloseButton onClose={onClose} />
        </div>
      </div>

      {!volumes ? (
        <div className="mt-3 space-y-1" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-6 animate-pulse rounded bg-surface-2" />
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-px">
          {sole
            ? Array.from({ length: sole.chapters }, (_, index) => index + 1).map((number) => (
                <ChapterRow
                  key={number}
                  book={sole.name}
                  number={number}
                  division={division}
                  here={sole.slug === doc.bookSlug && String(number) === doc.chapter}
                  current={current}
                  onGo={onGo}
                />
              ))
            : volume?.books.map((book) => {
                const open = openSlug === book.slug;
                const reading = volumeId === doc.volumeId && doc.bookSlug === book.slug;
                return (
                  <li key={book.slug}>
                    <button
                      type="button"
                      onClick={() => setOpenSlug(open ? null : book.slug)}
                      aria-expanded={open}
                      title={book.name}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors ${
                        open || reading ? "font-medium text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{book.name}</span>
                      <Chevron open={open} />
                    </button>
                    {open && (
                      <ul className="mb-1 ml-3 border-l border-border/70 pl-1.5">
                        {Array.from({ length: book.chapters }, (_, index) => index + 1).map((number) => (
                          <ChapterRow
                            key={number}
                            book={book.name}
                            number={number}
                            division={division}
                            here={reading && String(number) === doc.chapter}
                            current={current}
                            onGo={onGo}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
        </ul>
      )}
    </div>
  );
}

/** One chapter in the rail, its number said as a chapter or a section. */
function ChapterRow({
  book,
  number,
  division,
  here,
  current,
  onGo,
}: {
  book: string;
  number: number;
  division: string;
  here: boolean;
  current: RefObject<HTMLButtonElement | null>;
  onGo: (citation: ReaderCitation) => void;
}) {
  return (
    <li>
      <button
        ref={here ? current : undefined}
        type="button"
        onClick={() => onGo({ kind: "scripture", book, chapter: String(number) })}
        aria-current={here ? "page" : undefined}
        className={`block w-full rounded-md px-2 py-1 text-left text-[13px] tabular-nums transition-colors ${
          here
            ? "bg-accent/15 font-semibold text-accent-strong"
            : "text-muted hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        {division} {number}
      </button>
    </li>
  );
}

/** Every talk in the open session, the one being read marked. */
function TalkList({
  doc,
  onGo,
}: {
  doc: ReaderDoc;
  onGo: (citation: ReaderCitation) => void;
}) {
  const talks = useTalks(doc.conferenceId);

  if (!talks) {
    return (
      <div className="mt-3 space-y-1" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-6 animate-pulse rounded bg-surface-2" />
        ))}
      </div>
    );
  }

  return (
    <ul className="mt-3 space-y-px">
      {talks.map((talk) => {
        const here = talk.title === doc.chapter;
        return (
          <li key={talk.id}>
            <button
              type="button"
              onClick={() =>
                onGo({
                  kind: "conference",
                  book: "General Conference",
                  chapter: talk.title,
                  conferenceId: doc.conferenceId,
                })
              }
              aria-current={here ? "page" : undefined}
              className={`block w-full rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug transition-colors ${
                here
                  ? "bg-accent/15 font-semibold text-accent-strong"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {talk.title}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The rail's own close: a cross in its top corner, where a panel's way out sits. */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close the chapter navigation"
      title="Hide the contents"
      className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent-strong"
    >
      <Glyph name="close" className="h-4 w-4" />
    </button>
  );
}

/**
 * The standard work the rail is showing, as a dropdown.
 *
 * The title is the control: pressing it lists the five volumes in reading
 * order, and choosing one turns the rail to that volume's books without moving
 * the chapter under the reader's eyes. It replaces the old "Scriptures" link,
 * so the way to another shelf is the shelf's own name rather than a level above
 * it — the same shape the chapter's name uses on a phone.
 */
function VolumeMenu({
  volumes,
  currentId,
  fallback,
  onPick,
}: {
  volumes: BrowseVolume[] | null;
  currentId: string | null;
  fallback: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = volumes?.find((entry) => entry.id === currentId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Standard work: ${current?.title ?? fallback}. Choose another`}
        className="group flex max-w-full min-w-0 items-center gap-1 rounded-lg text-left"
      >
        <span className="min-w-0 truncate font-serif text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-accent-strong">
          {current?.title ?? fallback}
        </span>
        <DownCaret open={open} />
      </button>

      {open && volumes && (
        <>
          <button
            type="button"
            aria-label="Close the standard works menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            aria-label="Standard works"
            className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-background p-1 shadow-2xl"
          >
            {volumes.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitemradio"
                aria-checked={entry.id === currentId}
                onClick={() => {
                  onPick(entry.id);
                  setOpen(false);
                }}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  entry.id === currentId
                    ? "bg-accent/15 font-semibold text-accent-strong"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {entry.title}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A dropdown's caret: a small chevron that turns over when its list is open. */
function DownCaret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** The chapter's name: a menu on a phone, a plain title on a wide page. */
export function ReaderPlaceButton({
  doc,
  fromDaily,
  open,
  onToggle,
}: {
  doc: ReaderDoc;
  fromDaily: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  // The volume only: a verse count under the chapter's name answered a question
  // nobody was asking at the top of the page.
  const context = doc.kind === "scripture" ? doc.sourceLabel : doc.subtitle ?? "General Conference";
  // The Doctrine and Covenants is a volume of one book that carries its name,
  // so "Doctrine and Covenants 1" over "Doctrine and Covenants" said the same
  // thing twice. Its chapters are sections, and the volume's name belongs on
  // the line under them — the words the rail uses for the same place.
  const title = doc.kind === "scripture" && doc.book === doc.sourceLabel ? `Section ${doc.chapter}` : doc.title;

  return (
    // The chapter's name is still the page's heading; it is the button inside
    // the heading that opens the menu, so the page keeps its title in the
    // document outline as well as on the screen. On a wide page there is no
    // button at all: the rail down the side already holds the chapter menu, and
    // a second copy over the words would be a second door to the same room.
    <h1 className="min-w-0 flex-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Where you are: ${doc.title}. Open the chapter menu`}
        className="group inline-flex max-w-full min-w-0 items-start gap-1 rounded-lg text-left lg:hidden"
      >
        <span className="min-w-0">
          <span className="block truncate font-serif text-base font-semibold leading-tight text-foreground transition-colors group-hover:text-accent-strong">
            {title}
          </span>
          <span className="block truncate text-[11px] leading-tight text-muted">
            {context}
            {fromDaily && <span className="text-accent-strong"> · Today&apos;s passage</span>}
          </span>
        </span>
        {/* The caret rides the title's own line, not the middle of the two-line
            block, and it is a phone's control: on a wide page the rail down the
            side is where chapters are chosen. */}
        <span className="mt-1">
          <Chevron open={open} />
        </span>
      </button>

      <span className="hidden min-w-0 lg:block">
        <span className="block truncate font-serif text-base font-semibold leading-tight text-foreground">
          {title}
        </span>
        <span className="block truncate text-[11px] leading-tight text-muted">
          {context}
          {fromDaily && <span className="text-accent-strong"> · Today&apos;s passage</span>}
        </span>
      </span>
    </h1>
  );
}

type PlaceView =
  | { kind: "root" }
  | { kind: "volumes" }
  | { kind: "books"; volumeId: string }
  | { kind: "chapters"; volumeId: string; book: string; chapters: number; back: PlaceView }
  | { kind: "talks" };

/**
 * The menu under the chapter's name: three levels, and the chapters below them.
 *
 * The first panel is a trail rather than a tree — this book, this volume, the
 * standard works — because each is a step the reader may want to take and none
 * of them needs to be listed to be understood. Choosing a level drills into it:
 * a book opens its chapter grid, a volume its books, the standard works their
 * volumes. Two presses at most to anywhere, and the way back is the same row
 * reversed. A volume that is one book — the Doctrine and Covenants — opens its
 * sections straight away, because a book row would only repeat the volume's own
 * name.
 */
export function ReaderPlaceMenu({
  doc,
  onClose,
  onGo,
}: {
  doc: ReaderDoc;
  onClose: () => void;
  onGo: (citation: ReaderCitation) => void;
}) {
  const volumes = useLibrary();
  const talks = useTalks(doc.kind === "conference" ? doc.conferenceId : undefined);
  const [view, setView] = useState<PlaceView>({ kind: "root" });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const volume = volumes?.find((entry) => entry.id === doc.volumeId) ?? null;

  const pickChapter = (name: string, chapter: number) => {
    onClose();
    onGo({ kind: "scripture", book: name, chapter: String(chapter) });
  };

  let body: ReactNode;

  if (view.kind === "volumes") {
    body = (
      <>
        <PanelHead title="Scriptures" onBack={() => setView({ kind: "root" })} onClose={onClose} />
        <ul className="p-1">
          {volumes?.map((entry) => {
            // A volume of one book has no book to choose: its sections are the
            // next level, so the pick goes straight there.
            const only = entry.books.length === 1 ? entry.books[0] : null;
            return (
              <li key={entry.id}>
                <Row
                  label={entry.title}
                  current={entry.id === doc.volumeId}
                  onClick={() =>
                    only
                      ? setView({
                          kind: "chapters",
                          volumeId: entry.id,
                          book: only.name,
                          chapters: only.chapters,
                          back: { kind: "volumes" },
                        })
                      : setView({ kind: "books", volumeId: entry.id })
                  }
                />
              </li>
            );
          })}
        </ul>
      </>
    );
  } else if (view.kind === "books") {
    const shelf = volumes?.find((entry) => entry.id === view.volumeId) ?? null;
    body = (
      <>
        <PanelHead title={shelf?.title ?? "Books"} onBack={() => setView({ kind: "volumes" })} onClose={onClose} />
        <ul className="p-1">
          {shelf?.books.map((entry) => (
            <li key={entry.slug}>
              <Row
                label={entry.name}
                current={entry.slug === doc.bookSlug}
                onClick={() =>
                  setView({
                    kind: "chapters",
                    volumeId: view.volumeId,
                    book: entry.name,
                    chapters: entry.chapters,
                    back: { kind: "books", volumeId: view.volumeId },
                  })
                }
              />
            </li>
          ))}
        </ul>
      </>
    );
  } else if (view.kind === "chapters") {
    body = (
      <>
        <PanelHead title={view.book} onBack={() => setView(view.back)} onClose={onClose} />
        <div className="grid grid-cols-4 gap-2 p-1.5">
          {Array.from({ length: view.chapters }, (_, index) => index + 1).map((number) => {
            const here = doc.kind === "scripture" && doc.book === view.book && String(number) === doc.chapter;
            return (
              <button
                key={number}
                type="button"
                onClick={() => pickChapter(view.book, number)}
                aria-current={here ? "page" : undefined}
                className={`grid h-14 place-items-center rounded-xl text-base font-medium tabular-nums transition-colors ${
                  here
                    ? "bg-accent/15 text-accent-strong ring-1 ring-accent/50"
                    : "bg-surface text-foreground hover:bg-accent/10 hover:text-accent-strong"
                }`}
              >
                {number}
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (view.kind === "talks") {
    body = (
      <>
        <PanelHead
          title={doc.subtitle?.split(" · ").pop() ?? "General Conference"}
          onBack={() => setView({ kind: "root" })}
          onClose={onClose}
        />
        <ul className="p-1">
          {talks?.map((talk) => (
            <li key={talk.id}>
              <Row
                label={talk.title}
                current={talk.title === doc.chapter}
                onClick={() => {
                  onClose();
                  onGo({
                    kind: "conference",
                    book: "General Conference",
                    chapter: talk.title,
                    conferenceId: doc.conferenceId,
                  });
                }}
              />
            </li>
          ))}
        </ul>
      </>
    );
  } else {
    body = (
      <ul className="p-1">
        <li>
          {doc.kind === "conference" ? (
            <Row label={doc.chapter} onClick={() => setView({ kind: "talks" })} />
          ) : (
            <Row
              label={doc.book}
              onClick={() =>
                setView({
                  kind: "chapters",
                  volumeId: doc.volumeId ?? "",
                  book: doc.book,
                  chapters: doc.chapters?.length ?? 0,
                  back: { kind: "root" },
                })
              }
            />
          )}
        </li>
        {/* A volume that is one book names it in its own title, so the row above
            is already the volume: a second row with the same name would be the
            same step twice. */}
        {doc.kind === "scripture" && doc.book !== doc.sourceLabel && (
          <li>
            <Row
              label={volume?.title ?? doc.sourceLabel}
              onClick={() => setView({ kind: "books", volumeId: doc.volumeId ?? "" })}
            />
          </li>
        )}
        <li>
          <Row label="Scriptures" onClick={() => setView({ kind: "volumes" })} />
        </li>
      </ul>
    );
  }

  return (
    <>
      {/* The page behind is the way out, as it is for every sheet in the app. */}
      <button
        type="button"
        aria-label="Close the chapter menu"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div
        role="dialog"
        aria-label="Choose a chapter"
        className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto">{body}</div>
      </div>
    </>
  );
}

function PanelHead({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-border/70 bg-background px-2 py-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back a level"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Glyph name="arrow" className="h-4 w-4 rotate-180" />
      </button>
      <p className="min-w-0 flex-1 truncate font-serif text-base font-semibold text-foreground">{title}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Glyph name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}

function Row({
  label,
  current,
  onClick,
}: {
  label: string;
  current?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={`block w-full truncate rounded-xl px-3 py-3 text-left text-[15px] transition-colors hover:bg-surface-2 ${
        current ? "bg-accent/10 font-semibold text-accent-strong" : "text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
