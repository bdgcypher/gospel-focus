import Link from "next/link";
import { Glyph, type GlyphName } from "./glyph";
import { featureById } from "@/lib/features";

/**
 * The hub's launcher: one heading, four square tiles, one tap each.
 *
 * This replaced the page's map of the whole catalog — four headed sections of
 * compact rows, with a blurb under each heading and a "See all" link on the two
 * sections that have a hub page. Nothing about that map was wrong and none of
 * it was dead: every row led to a real page. It was simply a page you *read*,
 * and it asked the reader to take in four headings, four blurbs and a dozen
 * rows of names before it offered the one thing they had come for. The tiles
 * say the same thing the other way round: the four doors a day actually starts
 * from, sized to be tapped, and the rest of the app one level in — /study and
 * /games list their own sections, the menu holds the shelf (favorites, stats,
 * settings, the widgets), the daily draw is the verse card's own button, and
 * the Focus tab is the gate. Every destination the old map carried is still one
 * tap from somewhere (see lib/features.ts, which is where they are all still
 * described).
 *
 * One heading, and the row it names. What the old map got wrong was not that it
 * had headings but that it had four of them with a paragraph under each: this
 * one is a plain name for the block, read in a glance and never in the way of
 * the tap. It is also what labels the section — the block carries no name of
 * its own (`aria-labelledby`, not `aria-label`), so the words on the screen are
 * the ones a screen reader is given. It sits at the left edge of the column,
 * like every other block on the hub, because it belongs to the tiles under it
 * and a desktop would otherwise leave it stranded a few hundred pixels away.
 *
 * Two across a phone, four from `sm`. A square is about 139px across two
 * columns at 320px — a home-screen mark with room for its name — where four
 * across that width leaves each about 67px, which is where the old grid cut
 * names in half (see components/feature-card.tsx). Four across is what a
 * desktop has room for, which is the other half of the same arithmetic.
 *
 * The row runs the whole width of the page's column, like the cards above it.
 * It used to be capped and centred at 32rem, which on a desktop left four
 * small squares floating in the middle of a thousand-pixel column, with their
 * heading starting somewhere else entirely. Left-aligned and filling the
 * column, the row ends where every other card on the page ends, and each tile
 * grows with it — a little larger than before, and still a tile rather than a
 * pane, because the square's own aspect is what sizes it.
 */

interface Tile {
  href: string;
  /** The word under the mark. Short on purpose — it has to fit one line. */
  label: string;
  icon: GlyphName;
  /** The page's own name, for the tooltip. */
  hint: string;
  /** Whether the page behind the tile is still a placeholder. */
  soon: boolean;
}

/**
 * One tile, from a catalog entry. The destination, the page's name and whether
 * it is built all come from lib/features.ts rather than being written again
 * here, so a tile cannot lead somewhere the catalog does not describe — and the
 * day the journal ships, the "Soon" mark under it goes out with no edit here.
 *
 * The short label is the one thing passed in: it is the grid's own name for the
 * page, cut for a square that has to hold one to a column.
 */
function fromFeature(id: string, label: string, icon: GlyphName): Tile {
  const feature = featureById(id);
  return {
    // Falls back rather than throwing: a tile that lost its catalog entry
    // should still lead somewhere real rather than take the hub down with it.
    href: feature?.href ?? "/",
    label,
    icon,
    hint: feature?.title ?? label,
    soon: feature?.status === "planned",
  };
}

const TILES: Tile[] = [
  // The open book, which is the same mark the catalog gives this page and the
  // one /study leads with: the tile opens a passage, so it wears the book rather
  // than the sparkle that used to stand for "something new".
  fromFeature("picker", "Random Verse", "book"),
  fromFeature("memorize", "Memorize", "cards"),
  fromFeature("journal", "Journal", "journal"),
  // The one game worth a door of its own: the daily puzzle is the reason to
  // open the app on a day with no time to read, so it takes the fourth square
  // rather than sitting one tap deeper in the games hub. The other games are
  // still there, behind the Games tab.
  fromFeature("wordle", "Daily Puzzle", "word"),
];

/** The heading's id, which is also what the section is labelled by. */
const HEADING_ID = "quick-activities-heading";

export function QuickActivities() {
  return (
    <section aria-labelledby={HEADING_ID} className="mt-8 w-full">
      <h2
        id={HEADING_ID}
        className="mb-3 font-serif text-lg font-semibold text-foreground sm:mb-4 sm:text-xl"
      >
        Quick Activities
      </h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {TILES.map((tile) => (
          <QuickTile key={tile.href} tile={tile} />
        ))}
      </div>
    </section>
  );
}

/**
 * One tile: the mark, the name under it, and — for a page that isn't built —
 * the word that says so.
 *
 * The mark is a home-screen mark, not a caption: 48px across a phone and 56
 * from `sm`, drawn straight on the card with the name set under it and both
 * centred in the square, so the row is read at a glance as four doors rather
 * than as four labels with something small beside them.
 *
 * It wears the theme's own accent, and nothing behind it. The mark used to sit
 * in a swatch of its own — a fixed dark chocolate square with a gold figure on
 * it, the one deliberately unthemed block in the app — and at that size the
 * square was most of what a reader saw: four dark stamps in a row, with the
 * figures inside them too small to tell apart at a glance. Without it the
 * glyph is free to be the size the tile can afford, in the colour the rest of
 * the page's accents are in, and the card's border and surface are what say a
 * tile is a tile.
 *
 * "Soon" sits in the tile itself, under the name, because the hub is where a
 * reader is choosing a direction and the choice has to be told before it is
 * tapped — the app's rule for everything still on the roadmap (see the Status
 * Pill in components/feature-card.tsx and the widget prompt). It is a line of
 * small type rather than a pill: at this size a pill would be the tile's
 * loudest element, and the thing it is marking is the quietest fact about it.
 */
function QuickTile({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      title={tile.soon ? `${tile.hint} — not built yet` : tile.hint}
      className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-2 text-center transition-colors hover:border-accent/60 focus-visible:border-accent/60"
    >
      <Glyph name={tile.icon} className="h-12 w-12 shrink-0 text-accent-strong sm:h-16 sm:w-16" />

      <span className="text-sm font-medium leading-tight text-foreground transition-colors group-hover:text-accent-strong">
        {tile.label}
      </span>

      {tile.soon && (
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted">Soon</span>
      )}
    </Link>
  );
}
