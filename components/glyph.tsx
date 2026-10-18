import type { IconName } from "@/lib/features";

/**
 * Every glyph the hub needs, drawn in the app's house style: a 24×24 box,
 * stroked rather than filled, round caps, and `currentColor` so a card sets the
 * colour. Kept in one map so a card, a nav tab, and a section page all reach
 * for the same shape — the catalog names an icon, and this is the only place
 * that decides what that name looks like.
 */
export type GlyphName =
  | IconName
  | "flame"
  | "calendar"
  | "check"
  | "arrow"
  | "plus"
  | "minus"
  | "clock"
  | "trash"
  | "flip"
  | "lock-open"
  | "pencil"
  | "menu"
  | "dice"
  | "close"
  | "return"
  | "backspace"
  | "coin"
  | "help";

interface Props {
  name: GlyphName;
  className?: string;
}

export function Glyph({ name, className = "h-5 w-5" }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<GlyphName, React.ReactNode> = {
  search: (
    <>
      <circle cx="10.6" cy="10.6" r="5.6" />
      <path d="M14.8 14.8 20 20" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.4 12 4l8 6.4" />
      <path d="M5.8 9.4V19a1.5 1.5 0 0 0 1.5 1.5h9.4A1.5 1.5 0 0 0 18.2 19V9.4" />
      <path d="M9.8 20.5V14h4.4v6.5" />
    </>
  ),
  book: (
    <>
      <path d="M12 7.4C10.2 6.2 8 5.6 5.6 5.6A1.6 1.6 0 0 0 4 7.2v10.4a1.6 1.6 0 0 0 1.6 1.6c2.4 0 4.6.6 6.4 1.8 1.8-1.2 4-1.8 6.4-1.8a1.6 1.6 0 0 0 1.6-1.6V7.2a1.6 1.6 0 0 0-1.6-1.6c-2.4 0-4.6.6-6.4 1.8Z" />
      <path d="M12 7.4V21" />
    </>
  ),
  cards: (
    <>
      <path d="M7 5h9.5A2.5 2.5 0 0 1 19 7.5" />
      <rect x="3.5" y="7.8" width="15.5" height="11.7" rx="2.4" />
      <path d="M7.3 12.6h7.9M7.3 15.9h4.6" />
    </>
  ),
  map: (
    <>
      <path d="M9.6 4.4 4.2 6.6v13l5.4-2.2 4.8 2.2 5.4-2.2v-13l-5.4 2.2z" />
      <path d="M9.6 4.4v13M14.4 6.6v13" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 4.6l1.5 4 4 1.5-4 1.5L11 15.6l-1.5-4-4-1.5 4-1.5z" />
      <path d="M18 14.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
    </>
  ),
  // An open book with the question on one page: rules on the left, a question
  // mark on the right. The point of the feature is that the words and their
  // reference are two halves of one thing, so the mark is the book rather than
  // a question floating in a circle. The book itself is drawn at its own size
  // and scaled up to the box, so it fills the tile and the two pages stay the
  // subject; the question is drawn after the scale, kept small on its page.
  quiz: (
    <>
      <g transform="translate(12 12) scale(1.07) translate(-12 -12)">
        <path d="M12 7.4C10.2 6.2 7.7 5.4 4.6 5.4A1.6 1.6 0 0 0 3 7v10.8a1.6 1.6 0 0 0 1.6 1.6c2.4 0 5.4.6 7.4 1.8 1.8-1.2 4.4-1.8 7.4-1.8a1.6 1.6 0 0 0 1.6-1.6V7a1.6 1.6 0 0 0-1.6-1.6c-2.9 0-5.2.8-7 2Z" />
        <path d="M12 7.4V21.2" />
        <path d="M4.7 10.6h5.2M4.7 13.3h5.2M4.7 16h5.2" strokeWidth={1.4} />
      </g>
      <path d="M15.7 10.5a1.8 1.8 0 1 1 2.4 1.55c-.55.3-.8.8-.8 1.35v.25" />
      <path d="M17.3 16.7h.01" />
    </>
  ),
  // A piece of a jigsaw, for the section of play: a rounded body with a knob
  // pushing out of its top edge and another out of its right, both bulging
  // away from the shape. An outward bump survives being drawn small — a socket
  // reads as a plain tile once the bar shrinks it to 24px.
  puzzle: (
    <path d="M6.6 6H8.8A2.2 2.2 0 0 1 13.2 6H15.4A1.6 1.6 0 0 1 17 7.6V9.8A2.2 2.2 0 0 1 17 14.2V16.4A1.6 1.6 0 0 1 15.4 18H6.6A1.6 1.6 0 0 1 5 16.4V7.6A1.6 1.6 0 0 1 6.6 6Z" />
  ),
  letters: (
    <>
      <rect x="3.6" y="9.8" width="4.6" height="4.6" rx="1" />
      <rect x="9.7" y="9.8" width="4.6" height="4.6" rx="1" />
      <rect x="15.8" y="9.8" width="4.6" height="4.6" rx="1" />
      <path d="M9.4 6.6h5.2" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.4" />
      <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" />
    </>
  ),
  // A word-search grid with two found words: one corner to corner, one across
  // all four cells of the third row. The cells are all outlines and the
  // words are strokes in the icon's regular colour — filling the found cells
  // made a band that read as more cells, and a line over the fills vanished
  // into them. The strokes are heavier than the cell hairline so each one reads
  // as a mark laid across the grid rather than as another cell edge, and each
  // one runs past the cells at both of its ends: the rounded cap then sits
  // clear of the grid's own border, the way a marked word overshoots a printed
  // one. The diagonal and the horizontal both end on the grid's far edge, half
  // a cell's gap short of the viewBox, so neither rounded cap is clipped.
  "word-search": (
    <>
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2, 3].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={1.5 + col * 5.6}
            y={1.5 + row * 5.6}
            width={4.6}
            height={4.6}
            rx={1.15}
            fill="none"
            strokeWidth={1.1}
          />
        ))
      )}
      <path d="M1.1 1.1 22.9 22.9" strokeWidth={2.1} strokeLinecap="round" />
      <path d="M1.1 15h21.8" strokeWidth={2.1} strokeLinecap="round" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.6a8.4 8.4 0 0 0 0 16.8c1.4 0 2.1-.7 2.1-1.7 0-.8-.6-1.4-.6-2.2 0-.9.7-1.6 1.6-1.6h1.5a4 4 0 0 0 4-4c0-4.3-3.8-7.3-8.6-7.3Z" />
      <circle cx="8.3" cy="11.4" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8.4" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.7" cy="10.4" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <path d="M7.6 10.2V8.1a4.4 4.4 0 0 1 8.8 0v2.1" />
      <rect x="5" y="10.2" width="14" height="9.6" rx="2.4" />
      <path d="M12 14.2v2.2" />
    </>
  ),
  // The same padlock with its shackle swung clear of the body, so the two states
  // read as one lock rather than two unrelated marks: the body and the keyhole
  // sit exactly where they do above, and only the shackle moves.
  //
  // The shackle is hinged on the body's top-left and turned thirty degrees off
  // it, which is the one thing that survives being drawn at chip size. The first
  // attempt here merely dropped the closed shackle's right leg and left the arch
  // hanging centred above the body — the same arch, ending in mid-air. That
  // leaves a gap of about one pixel at 16px, and the shackle's own stroke and
  // the body's top edge close it up between them: the reader sees a shut lock
  // with a nick in it, which is what it was mistaken for. Swinging the whole
  // shackle puts a real hole between its free end and the body, and a hole is
  // what "open" means. Only the shackle moves, so nothing else has to be
  // relearned between the two.
  "lock-open": (
    <>
      <path d="M7.6 10.2L6.55 8.38a4.4 4.4 0 0 1 7.62-4.4" />
      <rect x="5" y="10.2" width="14" height="9.6" rx="2.4" />
      <path d="M12 14.2v2.2" />
    </>
  ),
  journal: (
    <>
      <rect x="4.6" y="3.6" width="14.8" height="16.8" rx="2.4" />
      <path d="M9 3.6v16.8" />
      <path d="M12.4 8.6h4M12.4 12.2h4M12.4 15.8h2.4" />
    </>
  ),
  widget: (
    <>
      <rect x="6.4" y="3" width="11.2" height="18" rx="2.6" />
      <rect x="8.6" y="5.6" width="6.8" height="4.4" rx="1.2" />
      <path d="M12 18.4h.01" />
    </>
  ),
  star: (
    <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8Z" />
  ),
  // Three bars off a baseline, for the stats page: the shape of "how it is
  // going" rather than another number.
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7.5 20v-5.5" />
      <path d="M12 20V7.5" />
      <path d="M16.5 20v-9" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" />
    </>
  ),
  flame: (
    <path d="M12 3.2c.6 2.6-.6 4.1-2 5.6-1.5 1.6-3 3.2-3 6a5 5 0 0 0 10 0c0-1.4-.5-2.6-1.2-3.6-.5 1-1.2 1.6-2.1 1.9.6-2.1.2-4-.6-5.3-.7-1.2-1.5-2.2-1.1-4.6Z" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5V6m8-2.5V6" />
    </>
  ),
  check: <path d="m5.5 12.6 4.4 4.4 8.6-9.5" />,
  arrow: (
    <>
      <path d="M5 12h13.5" />
      <path d="m13 6.5 5.5 5.5-5.5 5.5" />
    </>
  ),
  // The two keys that are actions rather than letters, drawn as the symbols a
  // keyboard prints: a return arrow for Enter, and a outlined key with a cross
  // for Backspace (components/wordle-page.tsx).
  return: (
    <>
      <path d="M20 5v6.5a3 3 0 0 1-3 3H5" />
      <path d="m8.5 10.5-3.5 4 3.5 4" />
    </>
  ),
  backspace: (
    <>
      <path d="M9.2 5.5h9.3A2.5 2.5 0 0 1 21 8v8a2.5 2.5 0 0 1-2.5 2.5H9.2L3 12Z" />
      <path d="m12 9.5 5 5m0-5-5 5" />
    </>
  ),
  // The word puzzle's own mark: a two-by-two grid with one letter per cell,
  // spelling WORD as it is read — a board of tiles rather than a page of text.
  // The letters are type rather than strokes because a four-pixel W drawn by
  // hand closes up into a blot at icon size.
  word: (
    <>
      {[
        { x: 1.5, y: 1.5, letter: "W" },
        { x: 12.5, y: 1.5, letter: "O" },
        { x: 1.5, y: 12.5, letter: "R" },
        { x: 12.5, y: 12.5, letter: "D" },
      ].map(({ x, y, letter }) => (
        <g key={letter}>
          <rect x={x} y={y} width={10} height={10} rx={2.2} strokeWidth={1.5} />
          <text
            x={x + 5}
            y={y + 5.1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={6.6}
            fontWeight={700}
            fontFamily="var(--font-sans), ui-sans-serif, system-ui, sans-serif"
            fill="currentColor"
            stroke="none"
          >
            {letter}
          </text>
        </g>
      ))}
    </>
  ),
  flip: (
    <>
      {/* A card coming over: the arrow runs the way the card turns, and its
          head lands where the far side arrives. */}
      <path d="M19.6 12a7.6 7.6 0 1 1-2.23-5.37" />
      <path d="M16.25 1.76 17.37 6.63 12.5 5.51" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  // The other half of a stepper: the deck builder adds or drops one verse at a
  // time, so the two have to read as a pair (components/add-to-memorize-dialog.tsx).
  minus: <path d="M5.5 12h13" />,
  // A pencil, for the one place a setting is edited from another page: the
  // stats card points at the goal editor in settings (components/stats-page.tsx),
  // and a pencil says "change this" in every language the app is in.
  pencil: (
    <>
      <path d="M17.1 3.5a2.3 2.3 0 0 1 3.3 3.3L7.4 19.8l-4.2 1 1-4.2Z" />
      <path d="m15.4 5.2 3.4 3.4" />
    </>
  ),
  // Three rules, for the way into everything that isn't a section. Drawn in
  // the same hand as the rest, so the header button and the bar's last tab are
  // recognisably the same control (see app-header.tsx and nav-bar.tsx).
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3.2 2" />
    </>
  ),
  // A die, for the hub's draw (components/quick-activities.tsx). The tile that
  // leads to a random passage wants the mark of chance rather than the book
  // that the button directly above it already wears, and a die is the one shape
  // that says "this one is not decided yet". Five pips, drawn filled: at tile
  // size an outlined dot closes up into a smudge, and it is the count that
  // makes the square a die rather than a box.
  dice: (
    <>
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.6" />
      <circle cx="8.4" cy="8.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="8.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8.4" cy="15.6" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="15.6" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  // The cross every dialog in the app closes with, in the shared hand — the
  // menu sheet and the share dialog draw their own copy (see
  // components/menu-panel.tsx), and the hub's focus banner uses this one.
  close: <path d="M6 6l12 12M18 6 6 18" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V5.6A1.6 1.6 0 0 1 11.1 4h1.8a1.6 1.6 0 0 1 1.6 1.6V7" />
      <path d="m6.6 7 .7 12.1A1.6 1.6 0 0 0 8.9 20.6h6.2a1.6 1.6 0 0 0 1.6-1.5L17.4 7" />
    </>
  ),
  // A coin, for the wallet in the app bar (components/status-tray.tsx): a rim
  // and a raised inner face, which is the one pair of circles that reads as
  // money rather than as a target or a record.
  coin: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="5.4" />
    </>
  ),
  // A question mark in a ring, for the hint control that opens the hint sheet
  // on the reference quiz (components/reference-quiz-page.tsx).
  help: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2-2.4 3.5" />
      <path d="M12 16.9h.01" />
    </>
  ),
};
