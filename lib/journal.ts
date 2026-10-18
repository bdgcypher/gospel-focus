"use client";

import { useSyncExternalStore } from "react";

/**
 * The journal: what the reader writes, in their own words.
 *
 * An entry is a title and a body, and the body is rich text. It is stored as
 * HTML rather than as markup the reader types (there is no markup to type — the
 * toolbar and the shortcuts write it) and rather than as a document tree,
 * because HTML is what the editor produces and what the page can render without
 * a second format to keep in step. Every body goes through `sanitizeBody` on
 * the way in, so what is stored is a fixed set of tags and nothing else: pasted
 * HTML from anywhere else — the one way markup arrives that the app did not
 * write — cannot bring a script, a stylesheet, or an event handler with it.
 *
 * Everything else here is the shape the rest of the app needs to work with an
 * entry without opening the editor: its plain text (for previews and for the
 * link search), and reading the list outside React.
 */

export interface JournalEntry {
  id: string;
  title: string;
  /** The body as sanitized HTML. */
  body: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = "gospel-focus:journal:v1";

/** One shared empty snapshot, so the server render and first client render agree. */
const EMPTY: JournalEntry[] = [];

let cache: JournalEntry[] | null = null;
let listening = false;
const listeners = new Set<() => void>();

/**
 * Tags a body may keep. Inline marks, paragraphs and breaks, lists, quotes, and
 * links — what the toolbar can produce, and so what a body can contain.
 */
const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "DIV",
  "SPAN",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
]);

/** A link is the one tag with an attribute, and the one that leaves the app. */
const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"];

function cleanLinkHref(raw: string | null): string | null {
  if (!raw) return null;
  const href = raw.trim();
  // An in-app destination (the journal's own links) is stored as a path: the
  // reader stays in the app, and the prerender knows where it points.
  if (href.startsWith("/")) return href;
  try {
    const url = new URL(href, typeof location === "undefined" ? "https://example.invalid" : location.origin);
    return ALLOWED_LINK_SCHEMES.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Reduce a body to the tags above, keeping the words of anything else.
 *
 * Unwrapping rather than deleting is deliberate: a paragraph pasted from
 * somewhere with a tag the app doesn't use should still say what it said. A
 * script, a stylesheet, or an embedded frame is the exception — those are
 * dropped whole, because their *text* is code, not prose.
 */
export function sanitizeBody(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;

  const strip = (node: Element) => {
    // Comments are nothing, and `script`/`style`/`iframe`-shaped nodes are
    // dropped with their contents.
    node.remove();
  };

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE) {
        strip(child as unknown as Element);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const element = child as Element;
      const tag = element.tagName;

      if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "OBJECT" || tag === "EMBED") {
        element.remove();
        continue;
      }

      if (tag === "A") {
        const href = cleanLinkHref(element.getAttribute("href"));
        if (!href) {
          // A link that goes nowhere (or somewhere the app won't follow) keeps
          // its words and loses its anchor.
          element.replaceWith(...Array.from(element.childNodes));
          walk(node);
          continue;
        }
        for (const attribute of Array.from(element.attributes)) {
          if (attribute.name !== "href") element.removeAttribute(attribute.name);
        }
        element.setAttribute("href", href);
        walk(element);
        continue;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        element.replaceWith(...Array.from(element.childNodes));
        // The unwrapped children are now part of this parent and still have to
        // be walked — restarting the pass over the parent is the simplest way
        // to be sure nothing arrives unexamined.
        walk(node);
        continue;
      }

      for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
      walk(element);
    }
  };

  walk(body);
  return body.innerHTML;
}

function parse(raw: string | null): JournalEntry[] {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    return value
      .filter(
        (e): e is JournalEntry =>
          !!e &&
          typeof (e as JournalEntry).id === "string" &&
          typeof (e as JournalEntry).title === "string" &&
          typeof (e as JournalEntry).body === "string"
      )
      .map((entry) => ({
        ...entry,
        createdAt: typeof entry.createdAt === "number" ? entry.createdAt : Date.now(),
        updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now(),
      }));
  } catch {
    return EMPTY;
  }
}

function read(): JournalEntry[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  cache = parse(window.localStorage.getItem(KEY));
  return cache;
}

function write(next: JournalEntry[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, full quota) — the session
    // still works, it just won't persist.
  }
  for (const listener of listeners) listener();
}

/** Keep another tab's journal in sync with this one. */
function ensureStorageListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = parse(e.newValue);
    for (const listener of listeners) listener();
  });
}

/** A new entry's id. Time-ordered, so the list can sort on it as a tiebreak. */
function newId(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** The body as words: tags out, entities resolved, whitespace collapsed. */
export function bodyText(body: string): string {
  if (!body) return "";
  if (typeof document === "undefined") {
    return body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const parsed = new DOMParser().parseFromString(body, "text/html");
  return (parsed.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The first line or so of an entry, for a list row. */
export function excerpt(entry: JournalEntry, length = 140): string {
  const text = bodyText(entry.body);
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

/** A title to show for an entry that hasn't been named. */
export function displayTitle(entry: JournalEntry): string {
  const title = entry.title.trim();
  if (title) return title;
  const text = bodyText(entry.body);
  return text ? text.slice(0, 48) : "Untitled entry";
}

export function entryById(entries: JournalEntry[], id: string): JournalEntry | null {
  return entries.find((entry) => entry.id === id) ?? null;
}

/** Write an entry's title and body. The body is sanitized on the way in. */
export function saveEntry(id: string, title: string, body: string): void {
  const clean = sanitizeBody(body);
  write(
    read().map((entry) =>
      entry.id === id ? { ...entry, title: title.trim(), body: clean, updatedAt: Date.now() } : entry
    )
  );
}

/** Add an entry, newest first, and hand back what was stored. */
export function addEntry(title = "", body = ""): JournalEntry {
  const now = Date.now();
  const entry: JournalEntry = {
    id: newId(),
    title: title.trim(),
    body: sanitizeBody(body),
    createdAt: now,
    updatedAt: now,
  };
  write([entry, ...read()]);
  return entry;
}

export function removeEntry(id: string): void {
  write(read().filter((entry) => entry.id !== id));
}

/** Every entry, newest first. Empty during server rendering. */
export function useJournal(): JournalEntry[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** The journal as it stands, for the code that is not rendering. */
export function readJournal(): JournalEntry[] {
  return read();
}

function subscribe(onChange: () => void): () => void {
  ensureStorageListener();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
