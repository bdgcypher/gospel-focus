import { selectionKey, type Favorite } from "./favorites";

/**
 * The favorites backup file: RFC 4180 CSV with a header row.
 *
 *   kind,book,chapter,passage,text,source,url
 *   scripture,1 Nephi,3,7,"And it came to pass that I, Nephi, said...",Book of Mormon,https://...
 *
 * `passage` holds one verse (`7`), a run (`7-9`), or a scattered pick
 * (`3,7-9`) when the favorite was saved from several verses taken together.
 * `kind`, `text`, `source` and `url` are extras: on import a bare
 * `book,chapter,passage` line is enough, and the text is looked up in the
 * bundled library.
 */
export const CSV_COLUMNS = ["kind", "book", "chapter", "passage", "text", "source", "url"] as const;

const COLUMN_ALIASES: Record<string, string[]> = {
  kind: ["kind", "type"],
  book: ["book", "volume"],
  chapter: ["chapter", "talk"],
  passage: ["passage", "verse", "section", "paragraph"],
  text: ["text", "content", "quote"],
  source: ["source", "label", "source label"],
  url: ["url", "link"],
};

const quoteCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/**
 * The passage cell: one verse, "7-9" for a run, or "3,7-9" for a scattered
 * pick, so any selection survives the export-and-import round trip.
 */
const passageCell = (favorite: Favorite): string => {
  if (favorite.sections && favorite.sections.length > 1) return selectionKey(favorite.sections);
  const start = favorite.section != null ? String(favorite.section) : "";
  return favorite.sectionEnd != null && start !== "" ? `${start}-${favorite.sectionEnd}` : start;
};

/** Pull a citation out of a favorite, for favorites saved before the parts existed. */
export function citationOf(favorite: Favorite): { book: string; chapter: string; passage: string } {
  const passage = passageCell(favorite);
  // Saved with citation parts: use them as-is.
  if (favorite.book !== undefined) {
    return { book: favorite.book, chapter: favorite.chapter ?? "", passage };
  }
  // Older favorites only carry the reference, so read the parts out of it.
  if (favorite.kind === "conference") {
    return {
      book: favorite.book ?? "General Conference",
      chapter: favorite.chapter ?? favorite.reference.replace(/^[“"]|[”"]$/g, ""),
      passage,
    };
  }
  const match = /^(.*?)\s(\d+):(\d+)$/.exec(favorite.reference);
  if (match) {
    return { book: favorite.book ?? match[1], chapter: favorite.chapter ?? match[2], passage: passage || match[3] };
  }
  return { book: favorite.book ?? favorite.reference, chapter: favorite.chapter ?? "", passage };
}

export function favoritesToCsv(favorites: Favorite[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const favorite of favorites) {
    const citation = citationOf(favorite);
    lines.push(
      [
        favorite.kind,
        citation.book,
        citation.chapter,
        citation.passage,
        favorite.text,
        favorite.sourceLabel,
        favorite.url,
      ]
        .map(quoteCell)
        .join(",")
    );
  }
  // A BOM keeps spreadsheets from mangling the curly quotes in conference titles.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export interface CsvRow {
  /** 1-based line number in the file, for error messages. */
  line: number;
  cells: string[];
}

/** A permissive RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text: string): CsvRow[] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    if (started || field !== "" || cells.length) rows.push({ line: rowLine, cells: [...cells, field] });
    cells = [];
    field = "";
    started = false;
    line += 1;
    rowLine = line;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (ch === "\n") line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      started = true;
      continue;
    }
    if (ch === ",") {
      cells.push(field);
      field = "";
      started = true;
      continue;
    }
    if (ch === "\n") {
      endRow();
      continue;
    }
    if (ch === "\r") {
      if (input[i + 1] === "\n") continue;
      endRow();
      continue;
    }
    field += ch;
    started = true;
  }
  endRow();
  return rows;
}

export interface CandidateRow {
  line: number;
  kind?: "scripture" | "conference";
  book: string;
  chapter: string;
  /** The verse/paragraph numbers the row covers, in order (empty when none). */
  sections: number[];
  text: string;
  source: string;
  url: string;
}

export interface ReadResult {
  rows: CandidateRow[];
  errors: { line: number; reason: string }[];
}

/**
 * The verse/paragraph numbers a passage cell names, in order: "7" is one,
 * "7-9" expands to a run, and "3,7-9" mixes a single with a run. Null when the
 * cell can't be read as numbers at all.
 */
export function parseSections(value: string): number[] | null {
  const text = value.trim();
  if (!text) return null;
  const numbers: number[] = [];
  for (const chunk of text.split(",")) {
    const piece = chunk.trim();
    const match = /^(\d+)\s*(?:[-\u2013\u2014]\s*(\d+))?$/.exec(piece);
    if (!match) return null;
    const start = Number.parseInt(match[1], 10);
    if (!Number.isInteger(start) || start < 1) return null;
    if (match[2]) {
      const end = Number.parseInt(match[2], 10);
      if (!Number.isInteger(end) || end < start) return null;
      for (let n = start; n <= end; n += 1) numbers.push(n);
    } else {
      numbers.push(start);
    }
  }
  if (!numbers.length) return null;
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/** Read a favorites file into candidate rows, reporting every row it can't use. */
export function readFavoritesCsv(text: string): ReadResult {
  const errors: { line: number; reason: string }[] = [];
  const parsed = parseCsv(text);
  if (!parsed.length) return { rows: [], errors: [{ line: 1, reason: "the file is empty" }] };

  // Header row? Recognised by naming at least one column we understand.
  const first = parsed[0].cells.map((cell) => cell.trim().toLowerCase());
  const headerIndex = (key: keyof typeof COLUMN_ALIASES) => {
    for (const name of COLUMN_ALIASES[key]) {
      const at = first.indexOf(name);
      if (at >= 0) return at;
    }
    return -1;
  };
  const isHeader =
    headerIndex("book") >= 0 || headerIndex("passage") >= 0 || headerIndex("chapter") >= 0;
  const columns = isHeader
    ? {
        kind: headerIndex("kind"),
        book: headerIndex("book"),
        chapter: headerIndex("chapter"),
        passage: headerIndex("passage"),
        text: headerIndex("text"),
        source: headerIndex("source"),
        url: headerIndex("url"),
      }
    : { kind: -1, book: 0, chapter: 1, passage: 2, text: 3, source: 4, url: 5 };

  const dataRows = isHeader ? parsed.slice(1) : parsed;
  const rows: CandidateRow[] = [];

  for (const row of dataRows) {
    if (row.cells.every((cell) => cell.trim() === "")) continue;

    const value = (at: number) => (at >= 0 ? (row.cells[at] ?? "").trim() : "");
    const book = value(columns.book);
    const chapter = value(columns.chapter);
    const passageRaw = value(columns.passage);
    const kindRaw = value(columns.kind).toLowerCase();

    if (!book && !chapter) {
      errors.push({ line: row.line, reason: "no book or chapter" });
      continue;
    }

    // "7" for one verse, "7-9" for a run, "3,7-9" for a scattered pick (an en
    // dash, which a spreadsheet may have substituted, is read the same way).
    let sections: number[] = [];
    if (passageRaw !== "") {
      const parsed = parseSections(passageRaw);
      if (!parsed) {
        errors.push({ line: row.line, reason: `“${passageRaw}” is not a passage number` });
        continue;
      }
      sections = parsed;
    }

    rows.push({
      line: row.line,
      kind: kindRaw === "conference" ? "conference" : kindRaw === "scripture" ? "scripture" : undefined,
      book,
      chapter,
      sections,
      text: value(columns.text),
      source: value(columns.source),
      url: value(columns.url),
    });
  }

  return { rows, errors };
}
