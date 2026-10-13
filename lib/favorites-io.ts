"use client";

import { addFavorites, toFavorite, type Favorite } from "./favorites";
import { favoritesToCsv, readFavoritesCsv, type CandidateRow } from "./favorites-csv";
import { resolveCitation } from "./picker";

export const FAVORITES_FILE_NAME = "open-to-inspiration-favorites.csv";

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

/** Rebuild a favorite straight from a file row, for rows the library can't resolve. */
function favoriteFromRow(row: CandidateRow): Favorite {
  const kind = row.kind ?? (/general conference/i.test(row.book) ? "conference" : "scripture");
  const section = row.section ?? 0;
  const reference =
    kind === "conference" ? `\u201c${row.chapter || row.book}\u201d` : `${row.book} ${row.chapter}:${section}`;

  return {
    id: `${kind}:${reference}:${section}`,
    kind,
    reference,
    sourceLabel: row.source || (kind === "conference" ? "General Conference" : row.book),
    text: row.text,
    url: row.url,
    urlLabel: kind === "conference" ? "Read the full talk" : "Open in Gospel Library",
    expansionTitle: kind === "conference" ? `\u201c${row.chapter}\u201d` : `${row.book} ${row.chapter}`,
    book: row.book,
    chapter: row.chapter,
    section: row.section ?? undefined,
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
    const section = row.section ?? Number.NaN;
    const found = await resolveCitation(row.kind, row.book, row.chapter, section);

    if (found) {
      const favorite = toFavorite(found);
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
