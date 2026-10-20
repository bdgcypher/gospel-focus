"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AddToMemorizeDialog } from "./add-to-memorize-dialog";
import { FeaturePage } from "./feature-page";
import { Glyph, type GlyphName } from "./glyph";
import { dayKey, daysBetween } from "@/lib/daily";
import {
  clearMemory,
  itemText,
  itemWordCount,
  recordReview,
  removeDeck,
  removeMemory,
  setHiddenLevel,
  setHideOrder,
  useDecks,
  useMemory,
  type Deck,
  type MemoryItem,
} from "@/lib/memorize";
import {
  firstLetterHint,
  hiddenWords,
  hideSeed,
  isWord,
  tokenize,
} from "@/lib/memorize-text";
import { citationHref } from "@/lib/picker";
import { setPreference, usePreferences, type CardSide } from "@/lib/preferences";

/**
 * The date only means anything once the clock is the reader's, not the build's.
 * Used for the saved card side, which is likewise only known on the client.
 */
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

/**
 * Memorization.
 *
 * Two ways to learn a passage by heart, both working on the same cards. Word
 * hiding takes one passage and steps its words out of sight, one at a time or
 * scattered, until the reader is saying it with nothing to look at. Flashcards
 * run a group as two-sided cards — the citation on one face, the words on the
 * other — and the reader says which face comes up first: the citation, to
 * practise the words, or the words, to recognise where they are from.
 *
 * The list is the real state (lib/memorize.ts) — it survives the session, a
 * passage remembers how far its hiding got, and every recitation is logged.
 * Nothing yet decides *when* a passage should come back, so the page says that
 * plainly rather than implying a schedule it doesn't keep.
 *
 * A group can be the main list or a deck the reader has named. The page draws
 * them the same way because they are the same thing at different scopes, and
 * the way in is one control either way: the card in the flow on a screen with
 * width, the round button over the corner on a phone (see `AddCard`/`AddFab`).
 */

const PRIMARY =
  "inline-flex items-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const QUIET =
  "inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50";
const LINK_BUTTON =
  "text-sm font-medium text-accent-strong hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline";

/**
 * The main list's value in `?deck=`.
 *
 * Deck ids carry their own `d:` prefix (see lib/memorize.ts), so a plain word
 * cannot collide with one, and the unnamed group gets an address of its own.
 */
const MAIN_LIST_PARAM = "main";

/**
 * Which of the page's screens is on. `decks` is the index, `deck` is one group
 * open (the main list when it carries no id), `hide` is one card's words being
 * stepped out of sight, and `cards` is a flashcard run.
 */
type View =
  | { kind: "decks" }
  | { kind: "deck"; id?: string }
  | { kind: "hide"; id: string }
  | { kind: "cards"; deckId?: string };

export function MemorizePage() {
  const items = useMemory();
  const decks = useDecks();
  const [view, setView] = useState<View>({ kind: "decks" });
  const [addOpen, setAddOpen] = useState(false);
  /** The deck the sheet is editing, with the cards it had when it was opened. */
  const [editing, setEditing] = useState<{ deck: Deck; items: MemoryItem[] } | null>(null);
  /**
   * Which opening of the add sheet this is.
   *
   * Used as its key, so each opening is a fresh sheet: the last deck's name and
   * the passages picked for it cannot come back with the next one. A key rather
   * than a reset effect because the sheet is still mounted while it animates
   * out — resetting there would wipe the deck the reader just saved on screen.
   */
  const [addSession, setAddSession] = useState(0);
  // A run of flashcards is the list's, or one deck's. The deck is named rather
  // than handed over so the cards are read at render time like everything else
  // on the page — a card removed while the sheet is open simply drops out.
  const runItems = useMemo(
    () =>
      view.kind !== "cards"
        ? []
        : view.deckId
          ? items.filter((item) => item.deckId === view.deckId)
          : items.filter((item) => !item.deckId),
    [view, items]
  );
  // A card that has left the list — removed here, or in another tab — simply
  // isn't found, and the screen falls through to the list below rather than
  // sitting on an empty page. Which is why this is looked up rather than
  // remembered: the view names a card, and the card decides whether it is open.
  const studying = view.kind === "hide" ? items.find((item) => item.id === view.id) : undefined;

  // The deck the open screen is about, or null for the main list. A deck that
  // has just been deleted is not found, and the page falls back to the index
  // rather than sitting on a screen with no name.
  const openDeck = view.kind === "deck" && view.id ? decks.find((deck) => deck.id === view.id) : null;
  const deckGone = view.kind === "deck" && !!view.id && !openDeck;
  const openId = view.kind === "deck" ? view.id : undefined;
  const openCards = items.filter((item) => (openId ? item.deckId === openId : !item.deckId));

  const openSheet = (deck: { deck: Deck; items: MemoryItem[] } | null) => {
    setEditing(deck);
    setAddSession((session) => session + 1);
    setAddOpen(true);
  };

  /**
   * Follow the address bar, which is where the open screen lives.
   *
   * The index and an open deck are the same page, so a deck gets a query of its
   * own (`/memorize/?deck=…`) and the app bar's back control — plain history —
   * steps back to the index instead of leaving memorization altogether. The
   * query is read by hand rather than through `useSearchParams`, the way the
   * journal reads `?entry=`, so the page's chrome stays in the prerendered HTML.
   */
  useEffect(() => {
    const fromUrl = () => {
      const param = new URLSearchParams(window.location.search).get("deck");
      setView(
        param === null
          ? { kind: "decks" }
          : { kind: "deck", id: param === MAIN_LIST_PARAM ? undefined : param }
      );
    };
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    return () => window.removeEventListener("popstate", fromUrl);
  }, []);

  /** Open a deck, and put it in the address bar behind the index. */
  const goToDeck = (id?: string) => {
    setView({ kind: "deck", id });
    window.history.pushState(
      window.history.state,
      "",
      `/memorize/?deck=${encodeURIComponent(id ?? MAIN_LIST_PARAM)}`
    );
  };

  /** The index, with the address bar put back to the page it actually is. */
  const goToIndex = () => {
    setView({ kind: "decks" });
    window.history.replaceState(window.history.state, "", "/memorize/");
  };

  return (
    // The floating add button is the page's sibling, not its child, so it is
    // outside the box the entrance animates. A `position: fixed` element inside
    // a translated box is placed against that box until the animation ends, and
    // this one spent its first half-second partway up the page before jumping
    // to its corner (see `.memorize-add-fab`).
    <>
      {/* The strapline is a verse rather than the catalog's line, set the same
          way as the reference quiz's: the words in the serif italic they are
          read in, the citation after them and kept whole. */}
      <FeaturePage
        featureId="memorize"
        subtitle={
          <span>
            <span className="font-serif italic text-foreground/85">
              &ldquo;…lay up these my words in your heart and in your soul…&rdquo;
            </span>{" "}
            <span className="whitespace-nowrap font-semibold">
              —{" "}
              <Link
                href={citationHref({
                  kind: "scripture",
                  book: "Deuteronomy",
                  chapter: "11",
                  section: 18,
                })}
                className="text-accent-strong hover:underline"
              >
                Deuteronomy 11:18
              </Link>
            </span>
          </span>
        }
      >
        {view.kind === "cards" && runItems.length > 0 ? (
          <Flashcards items={runItems} onClose={goToIndex} />
        ) : view.kind === "hide" && studying ? (
          <WordHiding item={studying} onClose={goToIndex} />
        ) : view.kind === "deck" && !deckGone ? (
          <DeckView
            name={openDeck?.name ?? "Memory List"}
            cards={openCards}
            onStudy={(id) => setView({ kind: "hide", id })}
            onRun={() => setView({ kind: "cards", deckId: openId })}
            // The main list has nothing to rename, so only a named deck carries
            // the way back into the sheet. It is here as well as on the index
            // because opening a deck is where the reader notices what is missing
            // from it.
            onEdit={openDeck ? () => openSheet({ deck: openDeck, items: openCards }) : undefined}
          />
        ) : (
          <DeckIndex
            items={items}
            decks={decks}
            onOpen={goToDeck}
            onAdd={() => openSheet(null)}
            onEdit={(deck) =>
              openSheet({ deck, items: items.filter((item) => item.deckId === deck.id) })
            }
            onClear={clearMemory}
          />
        )}

        {/* The sheet belongs to the page, not to the index: a deck can be edited
            from its own screen, and the sheet has to still be mounted when that
            screen is the one on show. Its key is what makes each opening fresh
          (see `addSession`), so it is the same sheet wherever it is raised. */}
        <AddToMemorizeDialog
          key={addSession}
          open={addOpen}
          deck={editing?.deck}
          deckItems={editing?.items}
          onClose={() => {
            setAddOpen(false);
            setEditing(null);
          }}
        />
      </FeaturePage>

      {view.kind === "decks" && <AddFab onOpen={() => openSheet(null)} />}
    </>
  );
}

/**
 * The page: one card per deck.
 *
 * A deck is the unit here — a named group of cards, and the main list is the
 * group that never got a name. Each card says what the deck is called and how
 * many cards are in it, and carries its own edit and delete: the two things a
 * reader wants to do to a group from the outside. What is *inside* a deck is one
 * tap away, on its own screen (`DeckView`), rather than spilling down this one —
 * a reader with three decks should be able to see all three at once.
 */
function DeckIndex({
  items,
  decks,
  onOpen,
  onAdd,
  onEdit,
  onClear,
}: {
  items: MemoryItem[];
  decks: Deck[];
  /** Open a deck, or the main list when there is no id. */
  onOpen: (deckId?: string) => void;
  onAdd: () => void;
  onEdit: (deck: Deck) => void;
  onClear: () => void;
}) {
  const main = items.filter((item) => !item.deckId);
  const count = (deckId?: string) =>
    deckId ? items.filter((item) => item.deckId === deckId).length : main.length;

  return (
    <>
      <div className="memorize-page space-y-8">
        <AddCard onOpen={onAdd} />

        {decks.length === 0 && main.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border px-6 py-14 text-center">
            <span className="mx-auto block text-accent/40">
              <Glyph name="cards" className="mx-auto h-10 w-10" />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">Nothing to memorize yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Make a deck and its cards will wait here until you can say them whole.
            </p>
          </div>
        ) : (
          <section>
            <h3 className="font-serif text-xl font-semibold text-foreground">Your Decks</h3>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {decks.map((deck) => (
                <DeckRow
                  key={deck.id}
                  title={deck.name}
                  count={count(deck.id)}
                  onOpen={() => onOpen(deck.id)}
                  onEdit={() => onEdit(deck)}
                  onDelete={() => removeDeck(deck.id)}
                  editLabel={`Rename or edit the deck ${deck.name}`}
                  deleteLabel={`Delete the deck ${deck.name} and its cards`}
                />
              ))}

              {/* The unnamed group, and the last card on the shelf: the passages
                  that were taken on before decks existed, or without one. It is
                  a deck like the others except that it cannot be renamed — there
                  is nothing to call it — so it carries only the way to empty
                  it. */}
              {main.length > 0 && (
                <DeckRow
                  title="Memory List"
                  count={main.length}
                  onOpen={() => onOpen(undefined)}
                  onDelete={onClear}
                  deleteLabel="Clear every card in the memory list"
                />
              )}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

/**
 * One deck, open.
 *
 * The cards it holds, each one studied on its own, and the run that turns the
 * whole deck into flashcards — which is why the run lives here rather than on
 * the index: a run is about the deck you have open, and there is no sensible
 * answer to "flashcards from which deck?" on a page that lists all of them.
 *
 * The way out is the app bar's back control rather than a second arrow of its
 * own: the deck has its own address (`?deck=…`), so one step back is the index.
 */
function DeckView({
  name,
  cards,
  onStudy,
  onRun,
  onEdit,
}: {
  name: string;
  cards: MemoryItem[];
  onStudy: (id: string) => void;
  onRun: () => void;
  /** Rename the deck or change its cards; absent for the unnamed main list. */
  onEdit?: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h3 className="font-serif text-2xl font-semibold text-foreground">{name}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {cards.length} {cards.length === 1 ? "card" : "cards"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Rename or edit the deck ${name}`}
              title="Edit this deck"
              // Quiet, but here with the run rather than behind a menu: a deck
              // is opened to use it, and the thing that is wrong with it is
              // usually seen from inside.
              className={`${QUIET} px-3 py-2.5`}
            >
              <Glyph name="pencil" className="h-4 w-4" />
              <span className="hidden sm:inline">Edit</span>
            </button>
          )}
          {cards.length > 0 && (
            <button type="button" onClick={onRun} className={PRIMARY}>
              <Glyph name="cards" className="h-4 w-4" />
              Start flashcards
            </button>
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted">
          No cards in this deck. Edit it to add some.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((item) => (
            <MemoryCard key={item.id} item={item} onStudy={() => onStudy(item.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One deck in the index: what it is called, how many cards it holds, and the two
 * ways to change it.
 *
 * The title is its own button and the icons are their own, rather than one card
 * wrapping the lot: a button inside a button is not a thing a browser can
 * deliver, and the edit and delete taps have to mean themselves and nothing
 * else. Which is also why the icons sit apart from the title rather than under
 * it — they are aimed at, and a mis-tap on one of them must not open the deck.
 */
function DeckRow({
  title,
  count,
  onOpen,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}: {
  title: string;
  count: number;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-3xl border border-border bg-surface p-5">
      <button
        type="button"
        onClick={onOpen}
        className="group min-w-0 flex-1 text-left"
        title="Open this deck"
      >
        <span className="block truncate font-serif text-lg font-semibold text-foreground transition-colors group-hover:text-accent-strong">
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          {count} {count === 1 ? "card" : "cards"}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={editLabel}
            title="Edit this deck"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            <Glyph name="pencil" className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={deleteLabel}
          title={deleteLabel}
          className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
        >
          <Glyph name="trash" className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/**
 * The way in, on a screen with width.
 *
 * One card, and the whole of it is the button: the reader taps the card rather
 * than a control inside it, which is why there are no buttons left in here. The
 * stylesheet swaps it for the floating button below the bar's own breakpoint —
 * the same rule the bottom navigation answers to, so the two never both show.
 */
function AddCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="memorize-add-card w-full rounded-3xl border border-border bg-surface p-5 text-left transition-colors hover:border-accent/50 hover:bg-accent/5"
    >
      <span className="flex items-center gap-2 text-muted">
        <Glyph name="plus" className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Add to Memorize</span>
      </span>
      <span className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-serif text-lg font-semibold text-foreground">
            Add to your memory list
          </span>
          <span className="mt-0.5 block text-sm text-muted">
            Draw a passage, take a favorite, or build a deck of your own.
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-accent/50 bg-accent/10 p-2 text-accent-strong">
          <Glyph name="arrow" className="h-4 w-4" />
        </span>
      </span>
    </button>
  );
}

/**
 * The way in, on a phone: one round button under the thumb, above the tab bar.
 *
 * It rides the bottom navigation rather than the page, so it stays put while the
 * list scrolls, and it sits the same distance from the tab bar as from the edge
 * of the screen, clear of the gesture area (see `.memorize-add-fab`). Taken off
 * the page entirely where the card is showing.
 */
function AddFab({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Add to your memory list"
      title="Add a passage or a deck"
      className="memorize-add-fab fixed z-20 h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-contrast"
    >
      <Glyph name="plus" className="h-6 w-6" />
    </button>
  );
}

/** One passage on the list. */
function MemoryCard({ item, onStudy }: { item: MemoryItem; onStudy: () => void }) {
  const total = itemWordCount(item);

  return (
    <li className="flex flex-col rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-serif text-lg font-semibold text-accent-strong">{item.reference}</h4>
          <p className="mt-0.5 text-xs text-muted">{item.sourceLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => removeMemory(item.id)}
          aria-label={`Remove ${item.reference} from your memory list`}
          title="Remove from your memory list"
          className="-mr-1 -mt-1 shrink-0 rounded-full border border-border bg-surface-2 p-2 text-muted transition-colors hover:border-accent/60 hover:text-accent-strong"
        >
          <Glyph name="trash" className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 line-clamp-3 flex-1 font-serif text-[0.98rem] leading-relaxed text-foreground/80">
        {itemText(item)}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/70 pt-3">
        <p className="text-xs text-muted">
          {reviewLine(item)}
          {item.hiddenLevel > 0 && ` · ${item.hiddenLevel} of ${total} words hidden`}
        </p>
        <button
          type="button"
          onClick={onStudy}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3.5 py-1.5 text-sm font-semibold text-accent-strong transition-colors hover:bg-accent/20"
        >
          Study
          <Glyph name="arrow" className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

/**
 * One passage with its words stepped out of sight.
 *
 * The hiding runs on the passage itself rather than a rendering trick: the
 * words are still there, drawn transparent, so every line breaks exactly where
 * it would with the passage whole. Nothing moves as the words go — only the
 * letters stop being legible, which is the point.
 */
function WordHiding({ item, onClose }: { item: MemoryItem; onClose: () => void }) {
  const total = itemWordCount(item);
  const hidden = useMemo(
    () => hiddenWords(total, item.hiddenLevel, item.hideOrder, hideSeed(item.id, item.hideOrder)),
    [total, item.hiddenLevel, item.hideOrder, item.id]
  );
  /** Words the reader has peeked at, which is not the same as showing them all. */
  const [peeked, setPeeked] = useState<Set<number>>(new Set());

  /**
   * The passage split once, with each token's place in the run of words — 0 and
   * up for the words, -1 for the spaces between them. A hidden word is named by
   * that one number, so a run of verses hides as one passage.
   */
  const runs = useMemo(() => {
    let ordinal = 0;
    return item.parts.map((part) => ({
      part,
      tokens: tokenize(part.text),
      ordinals: tokenize(part.text).map((token) => (isWord(token) ? ordinal++ : -1)),
    }));
  }, [item.parts]);

  const setLevel = (level: number) => {
    setPeeked(new Set());
    setHiddenLevel(item.id, level);
  };

  const peek = (ordinal: number) => {
    setPeeked((previous) => new Set(previous).add(ordinal));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h3 className="font-serif text-xl font-semibold text-accent-strong">{item.reference}</h3>
            <p className="mt-0.5 text-xs text-muted">{item.sourceLabel}</p>
          </div>
          <button type="button" onClick={onClose} className={QUIET}>
            Back to your list
          </button>
        </div>

        <p className="mt-4 border-t border-border/70 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
          {hidden.size === 0
            ? `All ${total} words in sight`
            : `${hidden.size} of ${total} words out of sight`}
        </p>

        <div className="mt-3 space-y-3">
          {runs.map(({ part, tokens, ordinals }, partIndex) => (
            <p key={`${part.number}-${partIndex}`} className="flex gap-3">
              {item.parts.length > 1 && (
                <span className="mt-1 w-5 shrink-0 select-none text-right text-xs font-semibold tabular-nums text-accent-strong">
                  {part.number}
                </span>
              )}
              <span className="font-serif text-[1.12rem] leading-relaxed text-foreground">
                {tokens.map((token, index) => {
                  const ordinal = ordinals[index];
                  if (ordinal < 0 || !hidden.has(ordinal)) return <span key={index}>{token}</span>;
                  return peeked.has(ordinal) ? (
                    <span key={index} className="rounded-sm bg-accent/15 text-accent-strong">
                      {token}
                    </span>
                  ) : (
                    // The underline is a child of the word rather than a border
                    // on it: a border would make the word taller than the line
                    // it sits on, and the whole passage would nudge downwards
                    // as words came out of sight.
                    <button
                      key={index}
                      type="button"
                      onClick={() => peek(ordinal)}
                      title="Peek at this word"
                      className="relative cursor-pointer select-none rounded-sm bg-accent/10 text-transparent"
                    >
                      {token}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 border-b-2 border-dotted border-accent/60"
                      />
                    </button>
                  );
                })}
              </span>
            </p>
          ))}
        </div>

        <div className="mt-5 border-t border-border/70 pt-4">
          <input
            type="range"
            min={0}
            max={total}
            value={item.hiddenLevel}
            onChange={(event) => setLevel(Number(event.target.value))}
            aria-label="Words out of sight"
            className="w-full cursor-pointer accent-accent"
          />

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="button"
              onClick={() => setLevel(item.hiddenLevel + 1)}
              disabled={item.hiddenLevel >= total}
              className={PRIMARY}
            >
              Hide one more
            </button>
            <button
              type="button"
              onClick={() => setLevel(item.hiddenLevel - 1)}
              disabled={item.hiddenLevel === 0}
              className={QUIET}
            >
              Bring one back
            </button>
            <button
              type="button"
              onClick={() => setLevel(total)}
              disabled={item.hiddenLevel >= total}
              className={LINK_BUTTON}
            >
              Hide them all
            </button>
            <button
              type="button"
              onClick={() => setLevel(0)}
              disabled={item.hiddenLevel === 0}
              className={LINK_BUTTON}
            >
              Show them all
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Out of sight from</p>
            <Segmented
              label="Which words come out of sight first"
              value={item.hideOrder}
              onChange={(order) => {
                setPeeked(new Set());
                setHideOrder(item.id, order);
              }}
              options={[
                { value: "start", label: "The top" },
                { value: "scattered", label: "Scattered" },
              ]}
            />
          </div>

          {hidden.size > 0 && (
            <p className="mt-4 text-xs text-muted">
              Tap a word that is out of sight to peek at it — {peeked.size} peeked at so far.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3xl border border-border bg-surface p-5">
        <p className="text-sm text-muted">{reviewLine(item)}</p>
        <button type="button" onClick={() => recordReview(item.id)} className={PRIMARY}>
          <Glyph name="check" className="h-4 w-4" />
          Recited it
        </button>
      </div>
    </div>
  );
}

/**
 * The whole list, one card at a time.
 *
 * Every card has two faces — the citation, and the words — and the run opens by
 * asking which of them to show first: the citation, so the reader practises the
 * words, or the words, so the reader places them. Whichever way round it is,
 * the card is turned over to bring the other face round, and only then can it
 * be marked. A card that isn't there yet goes to the back of the queue, which
 * is what a stack of flashcards has always done. The run ends when every card
 * has been got.
 */
function Flashcards({ items, onClose }: { items: MemoryItem[]; onClose: () => void }) {
  const prefs = usePreferences();
  const mounted = useMounted();
  /** Which face comes up first, or null while that is still being decided. */
  const [side, setSide] = useState<CardSide | null>(null);
  const [queue, setQueue] = useState<string[]>(() => shuffle(items.map((item) => item.id)));
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [recalled, setRecalled] = useState<string[]>([]);
  const [secondGoes, setSecondGoes] = useState(0);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  // A card that leaves the list mid-run drops out rather than blocking the run.
  const live = useMemo(() => queue.filter((id) => byId.has(id)), [queue, byId]);
  const current = live[position];

  const advance = () => {
    setRevealed(false);
    setHint(false);
    setPosition((value) => value + 1);
  };

  const got = (id: string) => {
    recordReview(id);
    setRecalled((previous) => (previous.includes(id) ? previous : [...previous, id]));
    advance();
  };

  const missed = (id: string) => {
    setSecondGoes((count) => count + 1);
    setQueue((previous) => [...previous, id]);
    advance();
  };

  const restart = () => {
    setQueue(shuffle(items.map((item) => item.id)));
    setPosition(0);
    setRevealed(false);
    setHint(false);
    setRecalled([]);
    setSecondGoes(0);
  };

  if (side === null) {
    return (
      <ChooseSide
        count={items.length}
        suggestion={mounted ? prefs.flashcardSide : "reference"}
        onStart={(chosen) => {
          setPreference("flashcardSide", chosen);
          setSide(chosen);
        }}
        onClose={onClose}
      />
    );
  }

  if (!current) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent-strong">
          <Glyph name="check" className="h-6 w-6" />
        </span>
        <h3 className="mt-4 font-serif text-xl font-semibold text-foreground">
          The Whole List, Recalled
        </h3>
        <p className="mt-1 text-sm text-muted">
          {recalled.length} of {items.length} {items.length === 1 ? "passage" : "passages"}
          {secondGoes > 0 && ` · ${secondGoes} needed a second go`}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <button type="button" onClick={restart} className={PRIMARY}>
            Run it again
          </button>
          <button type="button" onClick={onClose} className={QUIET}>
            Back to your list
          </button>
        </div>
      </div>
    );
  }

  const item = byId.get(current)!;
  const referenceFirst = side === "reference";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Flashcards</h3>
          <p className="mt-0.5 text-sm text-muted">
            {recalled.length} of {items.length} recalled
            {secondGoes > 0 && ` · ${secondGoes} brought back`}
            {` · ${referenceFirst ? "reference" : "passage"} first`}
          </p>
        </div>
        <button type="button" onClick={onClose} className={QUIET}>
          Stop
        </button>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.round((recalled.length / Math.max(items.length, 1)) * 100)}%` }}
        />
      </div>

      <motion.div
        key={`${current}-${position}`}
        initial={prefs.reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 28, mass: 0.8 }}
        className="flashcard"
      >
        {/* The card tips head-over-heels about its own middle — the axis (X) is
            the one the answer is pre-turned on in the stylesheet, so the words
            come round the right way up. */}
        <div
          className={`flashcard-sheet ${prefs.reduceMotion ? "flashcard-sheet-still" : ""}`}
          style={{ transform: revealed ? "rotateX(180deg)" : "rotateX(0deg)" }}
        >
          {/* The face the run was started on: the question, and the way in.
              Anywhere on it turns the card over — a card is turned, not
              scrolled past — with the buttons there for anyone who would
              rather be asked. */}
          <div
            data-card-face="prompt"
            aria-hidden={revealed}
            inert={revealed}
            onClick={() => setRevealed(true)}
            className="flashcard-face flex cursor-pointer flex-col rounded-3xl border border-border bg-surface p-6 shadow-[0_20px_60px_-45px_rgba(0,0,0,0.7)] sm:p-8"
          >
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {item.kind === "scripture" ? "Scripture" : "General conference"} ·{" "}
                {referenceFirst ? "Reference first" : "Passage first"}
              </p>

              {referenceFirst ? (
                <>
                  <h3 className="mt-3 font-serif text-2xl font-semibold text-accent-strong">
                    {item.reference}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{item.sourceLabel}</p>

                  <p className="mt-6 text-sm text-muted">
                    Say it from memory, then hold it up against the words.
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-3">
                    <PassageLines item={item} />
                  </div>

                  <p className="mt-6 text-sm text-muted">
                    Where is it from? Name the book, chapter and verse.
                  </p>
                </>
              )}

              {/* Only ever the words' own first letters: a hint is for getting
                  the passage back, and the citation side is left to be
                  recalled on its own. */}
              {hint && referenceFirst && (
                <p className="mt-4 font-serif text-[1.05rem] leading-relaxed text-muted">
                  {firstLetterHint(itemText(item))}
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-border/70 pt-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className={PRIMARY}
                >
                  <Glyph name="flip" className="h-4 w-4" />
                  Flip
                </button>
                {/* Offered on the citation side only, where it stands between
                    knowing nothing and being shown the words. */}
                {referenceFirst && (
                  <button
                    type="button"
                    aria-pressed={hint}
                    onClick={(event) => {
                      // The hint is a button on a card that turns when it is
                      // touched, so asking for the hint must not turn it.
                      event.stopPropagation();
                      setHint((showing) => !showing);
                    }}
                    className={QUIET}
                  >
                    {hint ? "Hide the first letters" : "First letters"}
                  </button>
                )}
              </div>

              <p className="mt-3 text-xs text-muted">Tap the card to turn it over.</p>
            </div>
          </div>

          {/* The far side: the answer, and the marking — which is only
              reachable once the card has actually been turned. A card is turned
              the same way both ways round, so anywhere on this side turns it
              back — with the marking buttons keeping their own meaning. */}
          <div
            data-card-face="answer"
            aria-hidden={!revealed}
            inert={!revealed}
            onClick={() => setRevealed(false)}
            className="flashcard-face flashcard-answer flex cursor-pointer flex-col rounded-3xl border border-accent/40 bg-surface-2 p-6 shadow-[0_20px_60px_-45px_rgba(0,0,0,0.7)] sm:p-8"
          >
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {referenceFirst ? "The words" : "Where it is from"}
              </p>

              {referenceFirst ? (
                <div className="mt-3">
                  <PassageLines item={item} />
                </div>
              ) : (
                <div className="mt-3">
                  <h3 className="font-serif text-2xl font-semibold text-accent-strong">
                    {item.reference}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{item.sourceLabel}</p>
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-border/70 pt-5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <button
                  type="button"
                  onClick={(event) => {
                    // Marking a card is its own act, on a card that turns when
                    // it is touched: a tap here must mark, not turn it back.
                    event.stopPropagation();
                    got(current);
                  }}
                  className={PRIMARY}
                >
                  <Glyph name="check" className="h-4 w-4" />
                  Got it
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    missed(current);
                  }}
                  className={QUIET}
                >
                  Not yet
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRevealed(false);
                  }}
                  className={LINK_BUTTON}
                >
                  Turn it back
                </button>
              </div>

              <p className="mt-3 text-xs text-muted">Tap the card to turn it back.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** A passage's verses, each numbered when there is more than one. */
function PassageLines({ item }: { item: MemoryItem }) {
  return (
    <div className="space-y-3">
      {item.parts.map((part, index) => (
        <p
          key={`${part.number}-${index}`}
          className="flex gap-3 font-serif text-[1.08rem] leading-relaxed text-foreground"
        >
          {item.parts.length > 1 && (
            <span className="mt-1 w-5 shrink-0 select-none text-right text-xs font-semibold tabular-nums text-accent-strong">
              {part.number}
            </span>
          )}
          <span>{part.text}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * The choice the deck opens with: which face of the card comes up first.
 *
 * The two ways of using a stack are genuinely different habits — saying the
 * words from the citation, and placing words you have been given — so the run
 * asks rather than guessing. The last answer is the suggestion, and it is only
 * read once the client has it, so the prerendered page and the first render
 * on a device agree.
 */
function ChooseSide({
  count,
  suggestion,
  onStart,
  onClose,
}: {
  count: number;
  suggestion: CardSide;
  onStart: (side: CardSide) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<CardSide | null>(null);
  const current = picked ?? suggestion;

  const options: { id: CardSide; icon: GlyphName; title: string; blurb: string }[] = [
    {
      id: "reference",
      icon: "book",
      title: "Reference first",
      blurb: "See “1 Nephi 3:7”, say the words. Practises the words themselves.",
    },
    {
      id: "passage",
      icon: "map",
      title: "Passage first",
      blurb: "Read the verse, name where it is from. Practises recognising it.",
    },
  ];

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
      <h3 className="font-serif text-xl font-semibold text-foreground">Which Side First?</h3>
      <p className="mt-1 max-w-xl text-sm text-muted">
        {count} {count === 1 ? "passage" : "passages"} in this run. Every card carries the citation on
        one face and the words on the other — pick the face you want to see when a card comes up, and
        turn it over for the other.
      </p>

      <div
        role="radiogroup"
        aria-label="Which side of the card to show first"
        className="mt-5 grid gap-3 sm:grid-cols-2"
      >
        {options.map((option) => {
          const active = current === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPicked(option.id)}
              className={`flex flex-col rounded-2xl border p-4 text-left transition-colors ${
                active ? "border-accent/60 bg-accent/15" : "border-border bg-surface-2 hover:border-accent/40"
              }`}
            >
              <span className="flex items-center gap-2">
                <Glyph name={option.icon} className="h-4 w-4" />
                <span className="font-serif text-base font-semibold text-foreground">
                  {option.title}
                </span>
              </span>
              <span className="mt-1.5 text-sm text-muted">{option.blurb}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-2.5 border-t border-border/70 pt-5">
        <button type="button" onClick={() => onStart(current)} className={PRIMARY}>
          <Glyph name="cards" className="h-4 w-4" />
          Start the run
        </button>
        <button type="button" onClick={onClose} className={QUIET}>
          Back to your list
        </button>
      </div>
    </div>
  );
}

/** Two choices in one pill, used for which end the words come out of. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-border bg-surface-2 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            value === option.value
              ? "bg-accent text-accent-contrast"
              : "text-muted hover:text-accent-strong"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** How the recitations are going, in one short line. */
function reviewLine(item: MemoryItem): string {
  if (item.reviews === 0) return "Not recited yet";
  const when = item.lastReviewed ? sinceDay(item.lastReviewed) : null;
  return `Recited ${item.reviews} ${item.reviews === 1 ? "time" : "times"}${when ? ` · ${when}` : ""}`;
}

/** How long ago a day was, in the reader's own calendar. */
function sinceDay(at: number): string {
  const days = daysBetween(dayKey(new Date(at)), dayKey());
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "a week ago";
  return `${Math.round(days / 7)} weeks ago`;
}

/** A fresh order for a run, so the list isn't learned in the order it was built. */
function shuffle(ids: string[]): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
