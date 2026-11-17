import { parseCsv } from "./favorites-csv";

/**
 * Gospel Library's notes CSV, as its Notes page downloads it.
 *
 *   type,title,note text,source location,tags,notebooks,study set,last updated,created
 *   highlight,Sin is sin,"The sins of God's covenant people...",https://.../isa/10?lang=eng&id=p11,,,Default Set,2026-09-25T14:36:57.700Z,2026-09-25T14:27:45.726Z
 *
 * It is coarser than the JSON export: a row names the verses a mark sits on by
 * the `id=p11-p13` fragment of its URL, and never carries the words that were
 * marked inside them, so a row can only become a whole-verse mark. It is also a
 * log rather than a tidy list — the same address appears again whenever a mark
 * was redrawn, and a note is a row of its own — so the rows are read here and
 * folded together by lib/annotations-io.ts, not written one per annotation.
 *
 * Rows that address something this app doesn't open — a general conference
 * paragraph hash, a manual page, a chapter summary — are reported with the line
 * they came from instead of being dropped quietly.
 */

export interface NotesCsvRow {
  /** 1-based line in the file, for the import report. */
  line: number;
  type: string;
  uri: string;
  /** The first verse the address names; 0 when it names a paragraph instead. */
  verseStart: number;
  verseEnd: number;
  /** A talk's paragraph anchor (`p4`, `p_yiJBUv`), when the address names one. */
  paragraphId?: string;
  title?: string;
  note?: string;
  tags: string[];
  created: string;
  updated: string;
}

export interface NotesCsvRead {
  rows: NotesCsvRow[];
  errors: { line: number; reason: string }[];
}

/** The columns this reader needs, in the Church's spelling and its variants. */
const COLUMNS = {
  type: ["type"],
  title: ["title"],
  note: ["note text", "note"],
  uri: ["source location", "source url", "url"],
  tags: ["tags"],
  updated: ["last updated", "updated"],
  created: ["created"],
} as const;

/**
 * The verse run a scripture or talk address names.
 *
 * `id=p7` is one verse, `id=p11-p13` a run of them. A general conference
 * paragraph is named by a hash (`id=p_yiWuc`) rather than a number, and a
 * chapter summary by `study_summary1`; neither is a verse this app can place, so
 * both come back null.
 */
export function verseRunFromUri(uri: string): { start: number; end: number } | null {
  const match = /[?&#]id=p(\d+)(?:[-_](?:p)?(\d+))?/i.exec(uri);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  if (!Number.isInteger(start) || start < 1) return null;
  if (!Number.isInteger(end) || end < start) return { start, end: start };
  return { start, end };
}

/**
 * A talk's paragraph anchor.
 *
 * The site writes these two ways: numbered (`id=p4`) on older talks, hashed
 * (`id=p_yiJBUv`) since October 2024. A numbered run is a verse run and is read
 * by `verseRunFromUri`; this is the hashed form, and the one a newer talk's
 * notes arrive in.
 */
export function paragraphAnchorFromUri(uri: string): string | null {
  const match = /[?&#]id=(p_[A-Za-z0-9]+)/i.exec(uri);
  return match ? match[1] : null;
}

const cell = (value: string | undefined) => (value ?? "").trim();

/** A title the export writes as the word "undefined" is no title at all. */
function titleOf(value: string | undefined): string | undefined {
  const title = cell(value);
  if (!title || title === "undefined" || title === "null") return undefined;
  return title;
}

/** Tags arrive as one cell; a comma or a semicolon separates them. */
function tagsOf(value: string | undefined): string[] {
  return [
    ...new Set(
      cell(value)
        .split(/[,;]/)
        .map((tag) => tag.replace(/^#+/, "").trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * Read a notes file, or null when it is not one.
 *
 * Recognition is the header: the Church's own nine columns, at least the type
 * and the address among them. A file that merely happens to be comma-separated
 * is left for the JSON reader to refuse in words.
 */
export function readNotesCsv(source: string): NotesCsvRead | null {
  const parsed = parseCsv(source);
  if (!parsed.length) return null;

  const header = parsed[0].cells.map((name) => name.trim().toLowerCase());
  const at = (key: keyof typeof COLUMNS) => {
    for (const name of COLUMNS[key]) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };

  const columns = {
    type: at("type"),
    title: at("title"),
    note: at("note"),
    uri: at("uri"),
    tags: at("tags"),
    updated: at("updated"),
    created: at("created"),
  };
  if (columns.uri < 0 || columns.type < 0) return null;

  const errors: NotesCsvRead["errors"] = [];
  const rows: NotesCsvRow[] = [];

  for (const row of parsed.slice(1)) {
    if (row.cells.every((value) => value.trim() === "")) continue;
    const value = (index: number) => (index >= 0 ? row.cells[index] ?? "" : "");
    const uri = cell(value(columns.uri));
    if (!uri) {
      errors.push({ line: row.line, reason: "the row has no source location" });
      continue;
    }

    const run = verseRunFromUri(uri);
    const paragraphId = run ? undefined : paragraphAnchorFromUri(uri) ?? undefined;
    if (!run && !paragraphId) {
      errors.push({ line: row.line, reason: "that address doesn't name a verse or paragraph the app can place" });
      continue;
    }

    rows.push({
      line: row.line,
      type: cell(value(columns.type)).toLowerCase(),
      uri,
      verseStart: run?.start ?? 0,
      verseEnd: run?.end ?? 0,
      paragraphId,
      title: titleOf(value(columns.title)),
      note: cell(value(columns.note)) || undefined,
      tags: tagsOf(value(columns.tags)),
      created: cell(value(columns.created)),
      updated: cell(value(columns.updated)),
    });
  }

  return { rows, errors };
}
