"use client";

import { addFavorites, selectionKey, toFavorite, toSelectionFavorite, type Favorite } from "./favorites";
import { favoritesToCsv, readFavoritesCsv, type CandidateRow } from "./favorites-csv";
import { resolveCitation } from "./picker";

export const FAVORITES_FILE_NAME = "gospel-focus-favorites.csv";

export interface ImportReport {
  imported: number;
  duplicates: number;
  skipped: { line: number; reason: string }[];
}

/** The backup file's contents, ready to download. */
export function exportFavoritesFile(favorites: Favorite[]): {
  name: string;
  text: string;
  mime: string;
} {
  return {
    name: FAVORITES_FILE_NAME,
    text: favoritesToCsv(favorites),
    mime: "text/csv;charset=utf-8",
  };
}

/** How a row's citation reads, run, scattered pick or single, in the app's shapes. */
function referenceForRow(
  kind: "scripture" | "conference",
  row: Pick<CandidateRow, "book" | "chapter" | "sections">
): string {
  const key = selectionKey(row.sections).replace(/,/g, ", ");
  if (kind === "conference") {
    return key ? `\u201c${row.chapter || row.book}\u201d \u00b6${key}` : `\u201c${row.chapter || row.book}\u201d`;
  }
  return key ? `${row.book} ${row.chapter}:${key}` : `${row.book} ${row.chapter}`;
}

/** Rebuild a favorite straight from a file row, for rows the library can't resolve. */
function favoriteFromRow(row: CandidateRow): Favorite {
  const kind = row.kind ?? (/general conference/i.test(row.book) ? "conference" : "scripture");
  const sections = row.sections;
  const from = sections[0] ?? 0;
  const to = sections[sections.length - 1] ?? 0;
  const contiguous = sections.every((n, i) => i === 0 || n === sections[i - 1] + 1);
  const reference = referenceForRow(kind, row);

  return {
    id: `${kind}:${reference}:${selectionKey(sections)}`,
    kind,
    reference,
    sourceLabel: row.source || (kind === "conference" ? "General Conference" : row.book),
    text: row.text,
    url: row.url,
    // The same label for both kinds: a conference talk's link opens in the
    // Gospel Library app just as a scripture link does.
    urlLabel: "Open in Gospel Library",
    expansionTitle: kind === "conference" ? `\u201c${row.chapter}\u201d` : `${row.book} ${row.chapter}`,
    book: row.book,
    chapter: row.chapter,
    section: sections.length ? from : undefined,
    sectionEnd: sections.length > 1 && contiguous ? to : undefined,
    // No library to read the words from, so the row stays one block of text.
    sections: sections.length > 1 ? sections : undefined,
    savedAt: Date.now(),
  };
}

/**
 * Import a favorites file. Every row is validated: rows the library can resolve
 * are rebuilt from it, rows that carry their own text are kept as written, and
 * anything unusable is reported with its line number rather than dropped
 * silently. Rows already saved are skipped.
 */
export async function importFavoritesText(text: string): Promise<ImportReport> {
  const { rows, errors } = readFavoritesCsv(text);
  const skipped = [...errors];
  const incoming: Favorite[] = [];

  for (const row of rows) {
    const first = row.sections[0] ?? Number.NaN;
    const found = await resolveCitation(row.kind, row.book, row.chapter, first);

    if (found) {
      // A multi-verse row is rebuilt from the library too, so the saved card
      // reads exactly like one saved in the app rather than like the file.
      const known = row.sections.length > 1 && row.sections.every((n) => found.verses.some((v) => v.number === n));
      const favorite = known ? toSelectionFavorite(found, row.sections) : toFavorite(found);
      incoming.push({
        ...favorite,
        // The file is authoritative for its own words, source and link.
        text: row.text || favorite.text,
        url: row.url || favorite.url,
        sourceLabel: row.source || favorite.sourceLabel,
      });
      continue;
    }

    if (row.text) {
      // Not in this build's library — keep it exactly as the file describes it.
      incoming.push(favoriteFromRow(row));
      continue;
    }

    skipped.push({
      line: row.line,
      reason: `couldn't find “${[row.book, row.chapter].filter(Boolean).join(" ")}” in this app's library`,
    });
  }

  const { added, duplicates } = addFavorites(incoming);
  return { imported: added, duplicates, skipped };
}
