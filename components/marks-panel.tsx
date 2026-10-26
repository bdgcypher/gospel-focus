"use client";

import { useRef, useState } from "react";
import { Glyph } from "./glyph";
import { useAnnotations } from "@/lib/annotations";
import {
  ANNOTATIONS_FILE_TYPES,
  exportAnnotationsFile,
  importAnnotationsText,
  type AnnotationImportReport,
} from "@/lib/annotations-io";
import { isNative, openExternal } from "@/lib/external";
import {
  downloadNativeFile,
  pickNativeTextFile,
  shareNativeFile,
  textToBase64,
} from "@/lib/native-files";

/**
 * Marks and notes, and the way they travel to and from Gospel Library.
 *
 * The panel is a file's two doors plus one honest paragraph. There is no live
 * sync to build: the Church's notes sit behind an account and an API that only
 * its own apps are registered for, and a third-party app that asked for the
 * password would be collecting credentials it has no business holding. So
 * signing in happens on the Church's own site — in the reader's own browser,
 * where the account is already trusted — and the notes come across as the file
 * the Church exports: download it there, import it here. The format is Gospel
 * Library's own (see lib/annotations-io.ts), so the same file goes back the
 * other way, and every mark lands on the words it was drawn over rather than on
 * the verse as a whole.
 *
 * The download and picker paths are the app's existing native ones: a Capacitor
 * WebView cannot download a file or hand back a `content://` URI to a file
 * input, so on device the platform writes the file and reads the pick, and in a
 * browser the ordinary blob download and file input do the same job.
 */

/** Where the Church keeps the account, for the sign-in button. */
const ACCOUNT_URL = "https://account.churchofjesuschrist.org/";
/** Where its help explains how to download your own data. */
const DATA_HELP_URL = "https://www.churchofjesuschrist.org/learn/mobile-applications/gospel-library-faq?lang=eng";

export function MarksPanel() {
  const marks = useAnnotations();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [report, setReport] = useState<AnnotationImportReport | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const native = isNative();

  const exportNow = async () => {
    setBusy("export");
    setStatus(null);
    try {
      const { name, text, mime, count } = await exportAnnotationsFile(marks);
      if (native) {
        const file = { name, mime, base64: textToBase64(text) };
        try {
          const saved = await downloadNativeFile(file);
          setStatus(`Saved ${count} ${count === 1 ? "mark" : "marks"} to ${saved.location}/${saved.name}.`);
          return;
        } catch {
          // No Downloads folder to write to — the share sheet is the other way
          // off the device.
        }
        const outcome = await shareNativeFile(file, {
          title: "Gospel Library annotations",
          dialogTitle: "Save annotations",
        });
        setStatus(
          outcome === "done"
            ? `${count} ${count === 1 ? "mark" : "marks"} saved or sent.`
            : outcome === "cancelled"
              ? null
              : "Couldn't save the file — nothing was exported."
        );
        return;
      }

      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus(`Saved ${count} ${count === 1 ? "mark" : "marks"} as ${name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The file couldn't be written.");
    } finally {
      setBusy(null);
    }
  };

  const importNow = async () => {
    if (!native) {
      picker.current?.click();
      return;
    }

    setBusy("import");
    setStatus(null);
    try {
      const picked = await pickNativeTextFile(ANNOTATIONS_FILE_TYPES, 8 * 1024 * 1024);
      if (picked) setReport(await importAnnotationsText(picked.text));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The file couldn't be read.");
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared at once so the same file can be imported again later.
    event.target.value = "";
    if (!file) return;

    setBusy("import");
    setStatus(null);
    setReport(null);
    try {
      setReport(await importAnnotationsText(await file.text()));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The file couldn't be read.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-foreground">Marks &amp; notes</p>
      <p className="mt-0.5 text-xs text-muted">
        {marks.length === 0
          ? "Nothing marked yet. Highlight or underline any words in the reader."
          : `${marks.length} ${marks.length === 1 ? "mark" : "marks"} on this device, each one on the words it was drawn over.`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => void exportNow()}
          disabled={marks.length === 0 || busy !== null}
          className="inline-flex items-center gap-2 rounded-full bg-cta px-4 py-2.5 text-sm font-semibold text-cta-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowDownIcon />
          {busy === "export" ? "Writing…" : "Export to file"}
        </button>
        <button
          type="button"
          onClick={() => void importNow()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUpIcon />
          {busy === "import" ? "Reading…" : "Import from file"}
        </button>
        <input
          ref={picker}
          type="file"
          accept=".json,application/json,text/plain"
          onChange={(event) => void importFile(event)}
          className="hidden"
          aria-label="Gospel Library annotations file to import"
        />
      </div>

      <p className="mt-2 text-xs text-muted">
        The file is Gospel Library&apos;s own <code className="font-mono">annotations.json</code> — its envelope,
        fields and chapter anchors — so it opens there, and one exported from there imports here.
      </p>

      {status && <p className="mt-3 text-xs text-muted">{status}</p>}
      {report && <ImportSummary report={report} />}

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Church account</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          The Church doesn&apos;t let other apps read your notes directly — there is no public API for them. Sign
          in on the Church&apos;s own site, download your data, and import the file above; nothing here ever asks
          for your password, and no account details are kept on this device.
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void openExternal(ACCOUNT_URL)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            <Glyph name="lock" className="h-4 w-4" />
            Open Church account
          </button>
          <button
            type="button"
            onClick={() => void openExternal(DATA_HELP_URL)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:text-accent-strong"
          >
            <Glyph name="help" className="h-4 w-4" />
            How to download your data
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportSummary({ report }: { report: AnnotationImportReport }) {
  const skipped = report.skipped.length;
  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface-2 px-3.5 py-3 text-xs text-foreground">
      <p className="font-medium">
        Imported {report.imported}
        {report.updated > 0 && ` · ${report.updated} updated`}
        {skipped > 0 && ` · ${skipped} skipped`}
      </p>
      <ul className="mt-1.5 list-inside list-disc space-y-1 text-muted">
        {report.skipped.slice(0, 5).map((entry, index) => (
          <li key={`${entry.uri}-${index}`} className="break-words">
            {entry.reason}
          </li>
        ))}
        {skipped > 5 && <li>and {skipped - 5} more</li>}
      </ul>
    </div>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M5 20h14" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20V8m0 0 4.5 4.5M12 8l-4.5 4.5M5 4h14" />
    </svg>
  );
}
