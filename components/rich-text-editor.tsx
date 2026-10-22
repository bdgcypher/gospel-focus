"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { JournalLinkDialog } from "./journal-link-dialog";
import { sanitizeBody } from "@/lib/journal";
import { dictationAvailable, startDictation, type DictationSession } from "@/lib/dictation";

interface Props {
  /**
   * The words to start from, as sanitized HTML. Written once, when the editor
   * mounts — give the editor a fresh key to switch documents, so typing is
   * never interrupted by a re-render.
   */
  initialHtml: string;
  /** Told the body's HTML after every edit, and once on mount. */
  onChange?: (html: string) => void;
  /** Take the cursor as soon as it appears — for an editor that is the reason the sheet opened. */
  autoFocus?: boolean;
  /** Shown in the body while it is empty. */
  placeholder: string;
  ariaLabel: string;
  /** Space above the toolbar. */
  className?: string;
  /** The body's own height, so a page and a sheet can give it different room. */
  bodyClassName?: string;
  /** The entry being edited, left out of the link picker's list of entries. */
  currentEntryId?: string | null;
  /**
   * Told when the link picker opens or closes. A dialog around the editor uses
   * it to leave Escape alone while the picker is up, so one key press puts away
   * one screen.
   */
  onLinkOpenChange?: (open: boolean) => void;
}

/**
 * A body of rich text, with the controls that write it.
 *
 * The body is a `contentEditable` element, and the formatting is applied with
 * `document.execCommand`. That is a deprecated API, and this is a knowing
 * trade: it is still what every browser implements for exactly this job, it
 * keeps the native undo stack (so Ctrl+Z works the way the reader expects,
 * through their own edits *and* through a bold), and the alternative is a
 * document model — a dependency, a mapping between that model and what is
 * displayed, and a caret to maintain — for a feature that writes a handful of
 * inline marks. Commands are issued by name ("bold", "insertOrderedList") and
 * the result is what the browser's own editor would produce, which is why the
 * sanitiser in lib/journal.ts accepts both the semantic tags and the presentational
 * ones: what is stored has to survive `execCommand` on any engine.
 *
 * The caret is the thing to protect. Two rules follow from it: the element is
 * uncontrolled — React writes it once, when the editor opens, and never again,
 * so typing is never interrupted by a re-render — and every control that acts on
 * a selection takes its click on `mousedown` with the default prevented, because
 * letting the button take focus would collapse the selection before the command
 * ran. The link picker is the exception, since it is a dialog: it gets the
 * selection copied out before it opens and puts it back before it inserts.
 *
 * Dictation is separated the same way the words are: the recognizer's guesses
 * are shown under the toolbar, and only a settled phrase is written into the
 * body, at the caret. Half-heard words never end up in the text.
 *
 * Shared by the journal entry and the note on a passage: the two write the same
 * kind of body, so they get the same toolbar, the same shortcuts, and the same
 * sanitiser rather than two editors that drift apart.
 */
export function RichTextEditor({
  initialHtml,
  onChange,
  autoFocus = false,
  placeholder,
  ariaLabel,
  className = "",
  bodyClassName = "min-h-[10rem]",
  currentEntryId = null,
  onLinkOpenChange,
}: Props) {
  const [empty, setEmpty] = useState(!initialHtml);
  const [linkOpen, setLinkOpen] = useState(false);
  const [selection, setSelection] = useState("");
  const [insideLink, setInsideLink] = useState(false);
  const [marks, setMarks] = useState<Marks>({ bold: false, italic: false, underline: false, bullet: false, numbered: false });
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [micAvailable, setMicAvailable] = useState(false);

  const body = useRef<HTMLDivElement | null>(null);
  const session = useRef<DictationSession | null>(null);
  /** The selection to act on, held across the link dialog. */
  const savedRange = useRef<Range | null>(null);

  const report = useCallback((html: string) => onChange?.(html), [onChange]);

  // The starting words go in once, when the editor mounts. The element is
  // uncontrolled from then on.
  useEffect(() => {
    const node = body.current;
    if (!node) return;
    node.innerHTML = initialHtml;
    setEmpty(!initialHtml);
    report(initialHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the mount is the point: see the comment.
  }, []);

  useEffect(() => {
    if (!autoFocus) return;
    const node = body.current;
    if (!node) return;
    node.focus();
    // A caret at the end, so an existing note is added to rather than typed over.
    const selectionNow = window.getSelection();
    if (selectionNow && !selectionNow.rangeCount) {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selectionNow.addRange(range);
    }
  }, [autoFocus]);

  useEffect(() => {
    void dictationAvailable().then(setMicAvailable);
  }, []);

  const stopListening = useCallback(() => {
    session.current?.stop();
    session.current = null;
    setListening(false);
    setHeard("");
  }, []);

  // Leaving mid-sentence shouldn't leave the microphone open.
  useEffect(() => stopListening, [stopListening]);

  const readMarks = useCallback(() => {
    const node = body.current;
    if (!node || typeof document === "undefined") return;
    const anchor = window.getSelection()?.anchorNode ?? null;
    const inBody = anchor ? node.contains(anchor) : false;
    setInsideLink(inBody ? !!closestAnchor(anchor) : false);
    if (!inBody) {
      setMarks({ bold: false, italic: false, underline: false, bullet: false, numbered: false });
      return;
    }
    setMarks({
      bold: query("bold"),
      italic: query("italic"),
      underline: query("underline"),
      bullet: query("insertUnorderedList"),
      numbered: query("insertOrderedList"),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", readMarks);
    return () => document.removeEventListener("selectionchange", readMarks);
  }, [readMarks]);

  const sync = () => {
    const node = body.current;
    if (!node) return;
    setEmpty(!node.textContent?.trim() && !node.querySelector("li, blockquote"));
    report(node.innerHTML);
  };

  /** Run an editing command on the current selection. */
  const command = (name: string, value?: string) => {
    const node = body.current;
    if (!node) return;
    node.focus();
    // Keep the markup semantic where the browser would otherwise reach for
    // inline styles: a body that means <b>/<i>/<u> survives a change of theme.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(name, false, value);
    sync();
    readMarks();
  };

  /** Put text in at the caret, as if it had been typed there. */
  const insertText = (text: string) => {
    if (!text) return;
    command("insertText", text);
  };

  const rememberSelection = () => {
    const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    const node = body.current;
    savedRange.current = range && node && node.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
    setSelection(range?.toString() ?? "");
  };

  const restoreSelection = () => {
    const range = savedRange.current;
    const node = body.current;
    if (!range || !node) return;
    const selectionNow = window.getSelection();
    if (!selectionNow) return;
    node.focus();
    selectionNow.removeAllRanges();
    selectionNow.addRange(range);
  };

  const showLink = (open: boolean) => {
    setLinkOpen(open);
    onLinkOpenChange?.(open);
  };

  const openLink = () => {
    rememberSelection();
    showLink(true);
  };

  const insertLink = ({ href, text }: { href: string; text: string }) => {
    restoreSelection();
    const html = `<a href="${escapeAttribute(href)}">${escapeText(text)}</a>`;
    command("insertHTML", html);
  };

  const removeLink = () => {
    restoreSelection();
    command("unlink");
  };

  const toggleDictation = async () => {
    if (listening) {
      stopListening();
      return;
    }
    setDictationError(null);
    setHeard("");
    try {
      session.current = await startDictation({
        onPartial: setHeard,
        onFinal: (text) => {
          setHeard("");
          insertText(text.endsWith(" ") ? text : `${text} `);
        },
        onEnd: () => {
          session.current = null;
          setListening(false);
          setHeard("");
        },
        onError: (message) => setDictationError(message),
      });
      setListening(true);
      // The microphone is the point of the click, so the caret waits in the body.
      body.current?.focus();
    } catch (error) {
      setDictationError(error instanceof Error ? error.message : "Dictation isn't available.");
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();

    if (key === "b" || key === "i" || key === "u") {
      event.preventDefault();
      command(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
      return;
    }
    if (key === "k") {
      event.preventDefault();
      openLink();
      return;
    }
    // The list shortcuts the word processors use, so muscle memory carries.
    if (event.shiftKey && (key === "7" || key === "8")) {
      event.preventDefault();
      command(key === "7" ? "insertOrderedList" : "insertUnorderedList");
    }
  };

  const onPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    // Pasted markup is the one thing the app didn't write, so it is cleaned
    // before it lands — and a paste with no markup goes in as plain words.
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (!html && !text) return;
    event.preventDefault();
    if (html) command("insertHTML", sanitizeBody(html));
    else command("insertText", text);
  };

  const tools = useMemo(
    () =>
      [
        { id: "bold", label: "Bold", shortcut: "Ctrl+B", mark: "bold" as const, glyph: <BoldIcon /> },
        { id: "italic", label: "Italic", shortcut: "Ctrl+I", mark: "italic" as const, glyph: <ItalicIcon /> },
        { id: "underline", label: "Underline", shortcut: "Ctrl+U", mark: "underline" as const, glyph: <UnderlineIcon /> },
        { id: "insertUnorderedList", label: "Bulleted list", shortcut: "Ctrl+Shift+8", mark: "bullet" as const, glyph: <BulletIcon /> },
        { id: "insertOrderedList", label: "Numbered list", shortcut: "Ctrl+Shift+7", mark: "numbered" as const, glyph: <NumberIcon /> },
      ] as const,
    []
  );

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1 border-y border-border/70 py-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            // The click must not move focus: the selection it acts on lives in
            // the editor, and a button that took focus would collapse it first.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(tool.id)}
            aria-pressed={marks[tool.mark]}
            aria-label={`${tool.label} (${tool.shortcut})`}
            title={`${tool.label} — ${tool.shortcut}`}
            className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
              marks[tool.mark]
                ? "border-accent/40 bg-accent/15 text-accent-strong"
                : "border-transparent text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent-strong"
            }`}
          >
            {tool.glyph}
          </button>
        ))}

        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openLink}
          aria-label="Link (Ctrl+K)"
          title="Link — Ctrl+K"
          className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
            insideLink
              ? "border-accent/40 bg-accent/15 text-accent-strong"
              : "border-transparent text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent-strong"
          }`}
        >
          <LinkIcon />
        </button>

        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command("removeFormat")}
          aria-label="Clear formatting"
          title="Clear formatting"
          className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent-strong"
        >
          <EraserIcon />
        </button>

        {micAvailable && (
          <button
            type="button"
            // Like the formatting controls: the caret has to stay in the body
            // for the words to land at it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void toggleDictation()}
            aria-pressed={listening}
            aria-label={listening ? "Stop dictating" : "Dictate"}
            title={listening ? "Stop dictating" : "Dictate with your voice"}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
              listening
                ? "border-accent/50 bg-accent/15 text-accent-strong"
                : "border-border bg-surface-2 text-muted hover:border-accent/60 hover:text-accent-strong"
            }`}
          >
            <MicIcon />
            {listening ? "Listening…" : "Dictate"}
          </button>
        )}
      </div>

      {(listening || heard || dictationError) && (
        <p className="mt-2 text-xs text-muted" aria-live="polite">
          {dictationError ?? (heard ? `“${heard}”` : "Listening — speak, and the words land where the cursor is.")}
        </p>
      )}

      <div
        ref={body}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={readMarks}
        data-placeholder={placeholder}
        data-empty={empty ? "true" : undefined}
        className={`journal-body mt-3 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm leading-relaxed text-foreground focus:border-accent/60 focus:outline-none ${bodyClassName}`}
      />

      <JournalLinkDialog
        // A fresh picker per opening: what was selected when Ctrl+K was pressed
        // is what it starts from, and an earlier search isn't still in the box.
        key={linkOpen ? `link:${selection}` : "link-closed"}
        open={linkOpen}
        selection={selection}
        currentEntryId={currentEntryId}
        onInsert={insertLink}
        onRemove={insideLink ? removeLink : undefined}
        onClose={() => showLink(false)}
      />
    </div>
  );
}

interface Marks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bullet: boolean;
  numbered: boolean;
}

function query(name: string): boolean {
  try {
    return document.queryCommandState(name);
  } catch {
    return false;
  }
}

/** The anchor the caret is inside, if it is inside one. */
function closestAnchor(node: Node | null): HTMLAnchorElement | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as Element).tagName === "A") {
      return current as HTMLAnchorElement;
    }
    current = current.parentNode;
  }
  return null;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function BoldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7Zm0 7h7a3.5 3.5 0 0 1 0 7H7Z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5h-5M14 19H9M14 5l-4 14" />
    </svg>
  );
}

function UnderlineIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 5v6a5 5 0 0 0 10 0V5M6 20h12" />
    </svg>
  );
}

function BulletIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NumberIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 6h10M10 12h10M10 18h10M4.5 5.8 6 5v3M4 11.2c0-.6.5-1.2 1.3-1.1.8 0 1.3.6 1.3 1.2 0 1.2-2.6 1.6-2.6 2.9h2.6M4.2 16.3c.6-.5 2.2-.5 2.2.7 0 .8-1 .9-1 .9s1.1.1 1.1 1c0 1.1-1.6 1.2-2.3.7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 16 6.5-6.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L14 19H9ZM9 19H5" />
      <path d="M13 9.5 16.5 13" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0v-5A2.5 2.5 0 0 1 12 4ZM6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20" />
    </svg>
  );
}
